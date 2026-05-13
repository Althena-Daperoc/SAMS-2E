import { CommonModule } from '@angular/common';
import {
  Component,
  Injector,
  OnDestroy,
  OnInit,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, onSnapshot } from '@angular/fire/firestore';

import { AuthService } from '../../../core/services/auth.service';

type AttendanceSummaryRow = {
  subject: string;
  section: string;
  teacher: string;
  totalStudents: number;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  totalRecords: number;
  presentRate: number;
};

type StudentRiskRow = {
  studentName: string;
  studentNo: string;
  section: string;
  subject: string;
  teacher: string;
  absences: number;
  lates: number;
  excused: number;
  present: number;
  totalRecords: number;
  attendanceRate: number;
};

type ChartRow = {
  label: string;
  value: number;
  percentage: number;
  className: string;
};

type TrendRow = {
  month: string;
  label: string;
  totalRecords: number;
  attendedCount: number;
  absentCount: number;
  attendanceRate: number;
};

type SmartInsight = {
  icon: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
  title: string;
  message: string;
};

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit, OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);
  private readonly authService = inject(AuthService);

  currentUser: any = null;

  attendanceRecords: any[] = [];
  filteredRecords: any[] = [];

  attendanceSummary: AttendanceSummaryRow[] = [];
  filteredAttendanceSummary: AttendanceSummaryRow[] = [];

  studentRisks: StudentRiskRow[] = [];
  filteredStudentRisks: StudentRiskRow[] = [];

  statusChartRows: ChartRow[] = [];
  classPerformanceRows: ChartRow[] = [];
  facultyWorkloadRows: ChartRow[] = [];
  monthlyTrendRows: TrendRow[] = [];
  smartInsights: SmartInsight[] = [];

  sections: string[] = [];
  subjects: string[] = [];
  teachers: string[] = [];

  searchTerm = '';
  selectedSection = '';
  selectedSubject = '';
  selectedTeacher = '';
  selectedMonth = '';

  isLoading = true;
  errorMessage = '';

  private unsubscribeAttendance?: () => void;

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.selectedMonth = this.getCurrentMonthValue();
    this.loadAttendanceRecords();
  }

  ngOnDestroy(): void {
    this.unsubscribeAttendance?.();
  }

  get isAdminReport(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get isFacultyReport(): boolean {
    return this.currentUser?.role === 'teacher';
  }

  get reportTitle(): string {
    return this.isAdminReport ? 'System Reports & Analytics' : 'Faculty Attendance Reports';
  }

  get reportEyebrow(): string {
    return this.isAdminReport ? 'Administrative Control' : 'Faculty Duty Report';
  }

  get reportSubtitle(): string {
    if (this.isAdminReport) {
      return 'Monitor institution-wide attendance performance, class summaries, faculty coverage, student risks, and report exports from the whole system.';
    }

    return 'Review your assigned class attendance records, class performance, student concerns, and export reports limited to your faculty duty scope.';
  }

  get reportScopeLabel(): string {
    if (this.isAdminReport) return 'All system attendance records';
    if (this.isFacultyReport) return 'My assigned attendance records';
    return 'Limited report access';
  }

  get ownerLabel(): string {
    return this.currentUser?.fullName || this.currentUser?.username || 'Current User';
  }

  get totalStudents(): number {
    const studentKeys = new Set(
      this.filteredRecords.map((record) => this.getStudentKey(record)).filter(Boolean),
    );

    return studentKeys.size;
  }

  get totalAttendanceSessions(): number {
    const sessionKeys = new Set(
      this.filteredRecords
        .map((record) => String(record.sessionId || record.sessionCode || '').trim())
        .filter(Boolean),
    );

    return sessionKeys.size;
  }

  get totalRecords(): number {
    return this.filteredRecords.length;
  }

  get totalPresent(): number {
    return this.filteredRecords.filter((record) => this.normalize(record.status) === 'present')
      .length;
  }

  get totalLate(): number {
    return this.filteredRecords.filter((record) => this.normalize(record.status) === 'late').length;
  }

  get totalExcused(): number {
    return this.filteredRecords.filter((record) => this.normalize(record.status) === 'excused')
      .length;
  }

  get totalAbsences(): number {
    return this.filteredRecords.filter((record) => this.normalize(record.status) === 'absent')
      .length;
  }

  get overallAttendanceRate(): number {
    const total = this.filteredRecords.length;

    if (total === 0) return 0;

    const countedAsAttended = this.filteredRecords.filter((record) => {
      const status = this.normalize(record.status);
      return status === 'present' || status === 'late' || status === 'excused';
    }).length;

    return Math.round((countedAsAttended / total) * 100);
  }

  get concernCount(): number {
    return this.filteredStudentRisks.length;
  }

  get canExportReports(): boolean {
    return !this.isLoading && this.filteredRecords.length > 0;
  }

  get hasActiveFilters(): boolean {
    return Boolean(
      this.searchTerm.trim() ||
      this.selectedSection ||
      this.selectedSubject ||
      this.selectedTeacher ||
      this.selectedMonth !== this.getCurrentMonthValue(),
    );
  }

  get attendanceQualityLabel(): string {
    const rate = this.overallAttendanceRate;

    if (rate >= 90) return 'Excellent';
    if (rate >= 80) return 'Good';
    if (rate >= 70) return 'Needs Attention';
    if (rate > 0) return 'Critical';

    return 'No Data';
  }

  get attendanceQualityClass(): string {
    return this.getRateClass(this.overallAttendanceRate);
  }

  generateReport(): void {
    this.isLoading = true;

    setTimeout(() => {
      this.rebuildReportData();
      this.isLoading = false;
    }, 150);
  }

  applyFilters(): void {
    const keyword = this.searchTerm.trim().toLowerCase();
    const selectedSection = this.normalize(this.selectedSection);
    const selectedSubject = this.normalize(this.selectedSubject);
    const selectedTeacher = this.normalize(this.selectedTeacher);
    const selectedMonth = this.selectedMonth;

    this.filteredRecords = this.attendanceRecords.filter((record) => {
      const section = this.normalize(this.getSectionLabel(record));
      const subject = this.normalize(this.getSubjectLabel(record));
      const teacher = this.normalize(this.getTeacherLabel(record));
      const recordMonth = this.getRecordMonthValue(record);

      const matchesSection = !selectedSection || section === selectedSection;
      const matchesSubject = !selectedSubject || subject === selectedSubject;
      const matchesTeacher = !selectedTeacher || teacher === selectedTeacher;
      const matchesMonth = !selectedMonth || recordMonth === selectedMonth;

      const searchableText = [
        record.studentName,
        record.fullName,
        record.name,
        record.studentId,
        record.studentNo,
        record.subjectName,
        record.subjectCode,
        record.subject,
        record.sectionCode,
        record.section,
        record.facultyName,
        record.teacherName,
        record.status,
        record.method,
        record.sessionCode,
        record.sessionId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesKeyword = !keyword || searchableText.includes(keyword);

      return matchesSection && matchesSubject && matchesTeacher && matchesMonth && matchesKeyword;
    });

    this.filteredAttendanceSummary = this.attendanceSummary.filter((row) => {
      const section = this.normalize(row.section);
      const subject = this.normalize(row.subject);
      const teacher = this.normalize(row.teacher);

      const matchesSection = !selectedSection || section === selectedSection;
      const matchesSubject = !selectedSubject || subject === selectedSubject;
      const matchesTeacher = !selectedTeacher || teacher === selectedTeacher;

      const searchableText = [row.subject, row.section, row.teacher]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesKeyword = !keyword || searchableText.includes(keyword);

      return matchesSection && matchesSubject && matchesTeacher && matchesKeyword;
    });

    this.filteredStudentRisks = this.studentRisks.filter((row) => {
      const section = this.normalize(row.section);
      const subject = this.normalize(row.subject);
      const teacher = this.normalize(row.teacher);

      const matchesSection = !selectedSection || section === selectedSection;
      const matchesSubject = !selectedSubject || subject === selectedSubject;
      const matchesTeacher = !selectedTeacher || teacher === selectedTeacher;

      const searchableText = [row.studentName, row.studentNo, row.section, row.subject, row.teacher]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesKeyword = !keyword || searchableText.includes(keyword);

      return matchesSection && matchesSubject && matchesTeacher && matchesKeyword;
    });

    this.rebuildVisualReportData();
  }

  onMonthChange(): void {
    this.rebuildReportData();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.applyFilters();
  }

  showAllMonths(): void {
    this.selectedMonth = '';
    this.rebuildReportData();
  }

  setCurrentMonth(): void {
    this.selectedMonth = this.getCurrentMonthValue();
    this.rebuildReportData();
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedSection = '';
    this.selectedSubject = '';
    this.selectedTeacher = '';
    this.selectedMonth = this.getCurrentMonthValue();

    this.rebuildReportData();
  }

  exportPdf(): void {
    if (!this.canExportReports) return;

    const generatedAt = new Date().toLocaleString();

    const summaryRows = this.filteredAttendanceSummary
      .map(
        (row) => `
          <tr>
            <td>${this.escapeHtml(row.subject)}</td>
            <td>${this.escapeHtml(row.section)}</td>
            <td>${this.escapeHtml(row.teacher)}</td>
            <td>${row.totalStudents}</td>
            <td>${row.totalSessions}</td>
            <td>${row.presentCount}</td>
            <td>${row.lateCount}</td>
            <td>${row.absentCount}</td>
            <td>${row.excusedCount}</td>
            <td>${row.presentRate}%</td>
          </tr>
        `,
      )
      .join('');

    const riskRows = this.filteredStudentRisks
      .map(
        (row) => `
          <tr>
            <td>${this.escapeHtml(row.studentName)}</td>
            <td>${this.escapeHtml(row.studentNo)}</td>
            <td>${this.escapeHtml(row.section)}</td>
            <td>${this.escapeHtml(row.subject)}</td>
            <td>${this.escapeHtml(row.teacher)}</td>
            <td>${row.absences}</td>
            <td>${row.lates}</td>
            <td>${row.excused}</td>
            <td>${row.present}</td>
            <td>${row.totalRecords}</td>
            <td>${row.attendanceRate}%</td>
          </tr>
        `,
      )
      .join('');

    const reportWindow = window.open('', '_blank', 'width=1200,height=800');

    if (!reportWindow) return;

    reportWindow.document.write(`
      <html>
        <head>
          <title>${this.escapeHtml(this.reportTitle)}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #111827;
              padding: 24px;
            }

            h1 {
              margin: 0 0 4px;
              font-size: 24px;
            }

            h2 {
              margin-top: 28px;
              font-size: 18px;
            }

            p {
              margin: 4px 0;
              color: #4b5563;
              font-size: 13px;
            }

            .stats {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-top: 18px;
            }

            .stat {
              border: 1px solid #d1d5db;
              border-radius: 10px;
              padding: 12px;
            }

            .stat strong {
              display: block;
              font-size: 20px;
              margin-top: 4px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
              font-size: 12px;
            }

            th,
            td {
              border: 1px solid #d1d5db;
              padding: 7px;
              text-align: left;
            }

            th {
              background: #f3f4f6;
            }

            @media print {
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <h1>${this.escapeHtml(this.reportTitle)}</h1>
          <p>Scope: ${this.escapeHtml(this.reportScopeLabel)}</p>
          <p>Generated by: ${this.escapeHtml(this.ownerLabel)}</p>
          <p>Generated at: ${this.escapeHtml(generatedAt)}</p>
          <p>Source of truth: Firestore attendance collection</p>
          <p>Filters: ${this.escapeHtml(this.getFilterLabel())}</p>

          <div class="stats">
            <div class="stat">
              <span>Students Covered</span>
              <strong>${this.totalStudents}</strong>
            </div>
            <div class="stat">
              <span>Attendance Sessions</span>
              <strong>${this.totalAttendanceSessions}</strong>
            </div>
            <div class="stat">
              <span>Attendance Rate</span>
              <strong>${this.overallAttendanceRate}%</strong>
            </div>
            <div class="stat">
              <span>Total Absences</span>
              <strong>${this.totalAbsences}</strong>
            </div>
          </div>

          <h2>Attendance Summary by Class</h2>
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Section</th>
                <th>Teacher</th>
                <th>Students</th>
                <th>Sessions</th>
                <th>Present</th>
                <th>Late</th>
                <th>Absent</th>
                <th>Excused</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRows || '<tr><td colspan="10">No summary data available.</td></tr>'}
            </tbody>
          </table>

          <h2>Students Needing Monitoring</h2>
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Student No.</th>
                <th>Section</th>
                <th>Subject</th>
                <th>Teacher</th>
                <th>Absences</th>
                <th>Lates</th>
                <th>Excused</th>
                <th>Present</th>
                <th>Total</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              ${riskRows || '<tr><td colspan="11">No risk data available.</td></tr>'}
            </tbody>
          </table>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    reportWindow.document.close();
  }

  exportExcel(): void {
    if (!this.canExportReports) return;

    const summaryRows = [
      [
        'Subject',
        'Section',
        'Teacher',
        'Students',
        'Sessions',
        'Present',
        'Late',
        'Absent',
        'Excused',
        'Rate',
      ],
      ...this.filteredAttendanceSummary.map((row) => [
        row.subject,
        row.section,
        row.teacher,
        row.totalStudents,
        row.totalSessions,
        row.presentCount,
        row.lateCount,
        row.absentCount,
        row.excusedCount,
        `${row.presentRate}%`,
      ]),
    ];

    const riskRows = [
      [],
      ['Students Needing Monitoring'],
      [
        'Student',
        'Student No.',
        'Section',
        'Subject',
        'Teacher',
        'Absences',
        'Lates',
        'Excused',
        'Present',
        'Total Records',
        'Attendance Rate',
      ],
      ...this.filteredStudentRisks.map((row) => [
        row.studentName,
        row.studentNo,
        row.section,
        row.subject,
        row.teacher,
        row.absences,
        row.lates,
        row.excused,
        row.present,
        row.totalRecords,
        `${row.attendanceRate}%`,
      ]),
    ];

    const statusRows = [
      [],
      ['Status Distribution'],
      ['Status', 'Count', 'Percentage'],
      ...this.statusChartRows.map((row) => [row.label, row.value, `${row.percentage}%`]),
    ];

    const metadataRows = [
      [this.reportTitle],
      ['Scope', this.reportScopeLabel],
      ['Generated By', this.ownerLabel],
      ['Generated At', new Date().toLocaleString()],
      ['Source Collection', 'attendance'],
      ['Filters', this.getFilterLabel()],
      ['Total Records', this.totalRecords],
      ['Attendance Quality', this.attendanceQualityLabel],
      [],
      ['Attendance Summary by Class'],
    ];

    const csvRows = [...metadataRows, ...summaryRows, ...riskRows, ...statusRows];
    const csvContent = csvRows
      .map((row) => row.map((cell) => this.toCsvCell(cell)).join(','))
      .join('\n');

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${this.isAdminReport ? 'SAMS_Admin_Report' : 'SAMS_Faculty_Report'}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  getRateClass(rate: number): string {
    if (rate >= 90) return 'excellent';
    if (rate >= 75) return 'good';
    if (rate >= 60) return 'warning';
    return 'danger';
  }

  getRecordStudentName(record: any): string {
    return this.getStudentName(record);
  }

  getRecordStudentNumber(record: any): string {
    return this.getStudentNumber(record);
  }

  getSubjectLabel(record: any): string {
    return (
      record.subjectName ||
      record.subjectCode ||
      record.subject ||
      record.sessionTitle ||
      'Unspecified Subject'
    );
  }

  getSectionLabel(record: any): string {
    return record.sectionCode || record.section || record.studentSection || 'Unspecified Section';
  }

  getTeacherLabel(record: any): string {
    return (
      record.facultyName || record.teacherName || record.instructorName || 'Unspecified Teacher'
    );
  }

  getRecordDateLabel(record: any): string {
    const date = this.parseDate(
      record.submittedAt ||
        record.generatedAt ||
        record.createdAt ||
        record.updatedAt ||
        record.date,
    );

    return date ? date.toLocaleString() : 'N/A';
  }

  getMethodLabel(method: any): string {
    const cleanMethod = String(method || 'N/A').replace(/_/g, ' ');
    return cleanMethod.charAt(0).toUpperCase() + cleanMethod.slice(1);
  }

  private loadAttendanceRecords(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.unsubscribeAttendance?.();

    this.unsubscribeAttendance = runInInjectionContext(this.injector, () => {
      const attendanceRef = collection(this.firestore, 'attendance');

      return onSnapshot(
        attendanceRef,
        (snapshot) => {
          this.attendanceRecords = snapshot.docs
            .map((docSnap): any => ({
              id: docSnap.id,
              ...(docSnap.data() as Record<string, any>),
            }))
            .filter((record: any) => !record.isArchived && !record.deletedAt && !record.clearedAt)
            .filter((record: any) => this.isRecordVisibleToCurrentUser(record))
            .sort((a: any, b: any) => this.getRecordTime(b) - this.getRecordTime(a));

          this.rebuildReportData();
          this.isLoading = false;
        },
        () => {
          this.errorMessage = 'Unable to load attendance report data. Please refresh the page.';
          this.attendanceRecords = [];
          this.filteredRecords = [];
          this.attendanceSummary = [];
          this.filteredAttendanceSummary = [];
          this.studentRisks = [];
          this.filteredStudentRisks = [];
          this.statusChartRows = [];
          this.classPerformanceRows = [];
          this.facultyWorkloadRows = [];
          this.monthlyTrendRows = [];
          this.smartInsights = [];
          this.isLoading = false;
        },
      );
    });
  }

  private rebuildReportData(): void {
    this.sections = this.getUniqueSortedValues(
      this.attendanceRecords.map((record) => this.getSectionLabel(record)),
    );

    this.subjects = this.getUniqueSortedValues(
      this.attendanceRecords.map((record) => this.getSubjectLabel(record)),
    );

    this.teachers = this.getUniqueSortedValues(
      this.attendanceRecords.map((record) => this.getTeacherLabel(record)),
    );

    const selectedMonth = this.selectedMonth;

    const monthFilteredRecords = this.attendanceRecords.filter((record) => {
      if (!selectedMonth) return true;
      return this.getRecordMonthValue(record) === selectedMonth;
    });

    this.filteredRecords = monthFilteredRecords;
    this.attendanceSummary = this.buildAttendanceSummary(monthFilteredRecords);
    this.studentRisks = this.buildStudentRiskRows(monthFilteredRecords);

    this.applyFilters();
  }

  private rebuildVisualReportData(): void {
    this.statusChartRows = this.buildStatusChartRows(this.filteredRecords);
    this.classPerformanceRows = this.buildClassPerformanceRows(this.filteredAttendanceSummary);
    this.facultyWorkloadRows = this.buildFacultyWorkloadRows(this.filteredRecords);
    this.monthlyTrendRows = this.buildMonthlyTrendRows(this.filteredRecords);
    this.smartInsights = this.buildSmartInsights();
  }

  private buildAttendanceSummary(records: any[]): AttendanceSummaryRow[] {
    const summaryMap = new Map<string, any>();

    records.forEach((record) => {
      const subject = this.getSubjectLabel(record);
      const section = this.getSectionLabel(record);
      const teacher = this.getTeacherLabel(record);
      const key = `${this.normalize(subject)}|${this.normalize(section)}|${this.normalize(teacher)}`;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          subject,
          section,
          teacher,
          studentKeys: new Set<string>(),
          sessionKeys: new Set<string>(),
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          excusedCount: 0,
          totalRecords: 0,
        });
      }

      const row = summaryMap.get(key);
      const status = this.normalize(record.status);
      const studentKey = this.getStudentKey(record);
      const sessionKey = String(record.sessionId || record.sessionCode || '').trim();

      if (studentKey) row.studentKeys.add(studentKey);
      if (sessionKey) row.sessionKeys.add(sessionKey);

      row.totalRecords += 1;

      if (status === 'present') row.presentCount += 1;
      else if (status === 'late') row.lateCount += 1;
      else if (status === 'absent') row.absentCount += 1;
      else if (status === 'excused') row.excusedCount += 1;
    });

    return Array.from(summaryMap.values())
      .map((row) => {
        const attendedCount = row.presentCount + row.lateCount + row.excusedCount;
        const presentRate =
          row.totalRecords > 0 ? Math.round((attendedCount / row.totalRecords) * 100) : 0;

        return {
          subject: row.subject,
          section: row.section,
          teacher: row.teacher,
          totalStudents: Array.from(row.studentKeys).filter(Boolean).length,
          totalSessions: Array.from(row.sessionKeys).filter(Boolean).length,
          presentCount: row.presentCount,
          lateCount: row.lateCount,
          absentCount: row.absentCount,
          excusedCount: row.excusedCount,
          totalRecords: row.totalRecords,
          presentRate,
        };
      })
      .sort((a, b) => {
        const rateCompare = a.presentRate - b.presentRate;
        if (rateCompare !== 0) return rateCompare;
        return b.totalRecords - a.totalRecords;
      });
  }

  private buildStudentRiskRows(records: any[]): StudentRiskRow[] {
    const studentMap = new Map<string, any>();

    records.forEach((record) => {
      const studentKey = this.getStudentKey(record);
      if (!studentKey) return;

      if (!studentMap.has(studentKey)) {
        studentMap.set(studentKey, {
          studentName: this.getStudentName(record),
          studentNo: this.getStudentNumber(record),
          section: this.getSectionLabel(record),
          subject: this.getSubjectLabel(record),
          teacher: this.getTeacherLabel(record),
          absences: 0,
          lates: 0,
          excused: 0,
          present: 0,
          totalRecords: 0,
        });
      }

      const row = studentMap.get(studentKey);
      const status = this.normalize(record.status);

      row.totalRecords += 1;

      if (status === 'absent') row.absences += 1;
      else if (status === 'late') row.lates += 1;
      else if (status === 'excused') row.excused += 1;
      else if (status === 'present') row.present += 1;
    });

    return Array.from(studentMap.values())
      .map((row) => {
        const attendedCount = row.present + row.lates + row.excused;
        const attendanceRate =
          row.totalRecords > 0 ? Math.round((attendedCount / row.totalRecords) * 100) : 0;

        return {
          ...row,
          attendanceRate,
        };
      })
      .filter((row) => row.absences > 0 || row.lates >= 2 || row.attendanceRate < 85)
      .sort((a, b) => {
        if (b.absences !== a.absences) return b.absences - a.absences;
        if (b.lates !== a.lates) return b.lates - a.lates;
        return a.attendanceRate - b.attendanceRate;
      });
  }

  private buildStatusChartRows(records: any[]): ChartRow[] {
    const total = records.length;
    const statusConfig = [
      { key: 'present', label: 'Present', className: 'present' },
      { key: 'late', label: 'Late', className: 'late' },
      { key: 'absent', label: 'Absent', className: 'absent' },
      { key: 'excused', label: 'Excused', className: 'excused' },
    ];

    return statusConfig.map((item) => {
      const value = records.filter((record) => this.normalize(record.status) === item.key).length;
      const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

      return {
        label: item.label,
        value,
        percentage,
        className: item.className,
      };
    });
  }

  private buildClassPerformanceRows(rows: AttendanceSummaryRow[]): ChartRow[] {
    return [...rows]
      .sort((a, b) => {
        const rateCompare = a.presentRate - b.presentRate;
        if (rateCompare !== 0) return rateCompare;
        return b.totalRecords - a.totalRecords;
      })
      .slice(0, 6)
      .map((row) => ({
        label: `${row.subject} • ${row.section}`,
        value: row.presentRate,
        percentage: row.presentRate,
        className: this.getRateClass(row.presentRate),
      }));
  }

  private buildFacultyWorkloadRows(records: any[]): ChartRow[] {
    if (!this.isAdminReport) return [];

    const facultyMap = new Map<string, number>();

    records.forEach((record) => {
      const teacher = this.getTeacherLabel(record);
      facultyMap.set(teacher, (facultyMap.get(teacher) || 0) + 1);
    });

    const maxValue = Math.max(...Array.from(facultyMap.values()), 0);

    return Array.from(facultyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({
        label,
        value,
        percentage: maxValue > 0 ? Math.round((value / maxValue) * 100) : 0,
        className: 'info',
      }));
  }

  private buildMonthlyTrendRows(records: any[]): TrendRow[] {
    const trendMap = new Map<string, any>();

    records.forEach((record) => {
      const month = this.getRecordMonthValue(record);
      if (!month) return;

      if (!trendMap.has(month)) {
        trendMap.set(month, {
          month,
          totalRecords: 0,
          attendedCount: 0,
          absentCount: 0,
        });
      }

      const row = trendMap.get(month);
      const status = this.normalize(record.status);

      row.totalRecords += 1;

      if (status === 'present' || status === 'late' || status === 'excused') {
        row.attendedCount += 1;
      }

      if (status === 'absent') {
        row.absentCount += 1;
      }
    });

    return Array.from(trendMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((row) => ({
        month: row.month,
        label: this.formatMonthLabel(row.month),
        totalRecords: row.totalRecords,
        attendedCount: row.attendedCount,
        absentCount: row.absentCount,
        attendanceRate:
          row.totalRecords > 0 ? Math.round((row.attendedCount / row.totalRecords) * 100) : 0,
      }));
  }

  private buildSmartInsights(): SmartInsight[] {
    if (this.filteredRecords.length === 0) {
      return [
        {
          icon: 'pi pi-database',
          tone: 'info',
          title: 'No report data in this view',
          message: 'Try changing the month, subject, section, or search filter to view records.',
        },
      ];
    }

    const insights: SmartInsight[] = [];
    const rate = this.overallAttendanceRate;

    if (rate >= 90) {
      insights.push({
        icon: 'pi pi-check-circle',
        tone: 'success',
        title: 'Healthy attendance performance',
        message: `${rate}% attendance rate is strong for the selected report scope.`,
      });
    } else if (rate >= 75) {
      insights.push({
        icon: 'pi pi-info-circle',
        tone: 'info',
        title: 'Attendance is acceptable but monitor trends',
        message: `${rate}% attendance rate is fair, but students with repeated absences or lates still need follow-up.`,
      });
    } else {
      insights.push({
        icon: 'pi pi-exclamation-triangle',
        tone: 'danger',
        title: 'Attendance needs immediate attention',
        message: `${rate}% attendance rate is below the ideal level for the selected report scope.`,
      });
    }

    if (this.filteredStudentRisks.length > 0) {
      insights.push({
        icon: 'pi pi-user-minus',
        tone: 'warning',
        title: `${this.filteredStudentRisks.length} student(s) need monitoring`,
        message: this.isAdminReport
          ? 'Admin can use this list to check overall institutional attendance concerns and coordinate with faculty.'
          : 'Faculty can use this list for class-level follow-up and early intervention.',
      });
    }

    if (this.totalAbsences > 0) {
      insights.push({
        icon: 'pi pi-calendar-times',
        tone: 'warning',
        title: `${this.totalAbsences} absence record(s) found`,
        message: 'Absences are counted directly from saved attendance records in Firestore.',
      });
    }

    if (this.totalLate >= 3) {
      insights.push({
        icon: 'pi pi-clock',
        tone: 'info',
        title: 'Late arrivals detected',
        message: `${this.totalLate} late record(s) may indicate recurring punctuality issues.`,
      });
    }

    if (this.isAdminReport && this.facultyWorkloadRows.length > 0) {
      insights.push({
        icon: 'pi pi-id-card',
        tone: 'info',
        title: 'Faculty coverage is visible',
        message:
          'Admin view includes faculty workload distribution based on attendance records handled.',
      });
    }

    return insights.slice(0, 5);
  }

  private isRecordVisibleToCurrentUser(record: any): boolean {
    if (!this.currentUser) return false;

    if (this.currentUser.role === 'admin') {
      return true;
    }

    if (this.currentUser.role !== 'teacher') {
      return false;
    }

    const currentUserId = this.normalize(this.currentUser.id);
    const username = this.normalize(this.currentUser.username);
    const fullName = this.normalize(this.currentUser.fullName);
    const email = this.normalize(this.currentUser.email);

    const recordFacultyId = this.normalize(
      record.facultyId || record.teacherId || record.createdBy || record.createdById,
    );

    const recordFacultyName = this.normalize(
      record.facultyName || record.teacherName || record.instructorName,
    );

    const recordFacultyEmail = this.normalize(record.facultyEmail || record.teacherEmail);

    if (recordFacultyId && (recordFacultyId === currentUserId || recordFacultyId === username)) {
      return true;
    }

    if (recordFacultyName && recordFacultyName === fullName) {
      return true;
    }

    if (recordFacultyEmail && recordFacultyEmail === email) {
      return true;
    }

    return false;
  }

  private getStudentName(record: any): string {
    return record.studentName || record.fullName || record.name || 'Unnamed Student';
  }

  private getStudentNumber(record: any): string {
    return String(
      record.studentId || record.studentNo || record.studentNumber || record.studentDocId || 'N/A',
    );
  }

  private getStudentKey(record: any): string {
    return String(
      record.studentDocId ||
        record.studentId ||
        record.studentNo ||
        record.studentNumber ||
        record.studentName ||
        '',
    ).trim();
  }

  private getRecordMonthValue(record: any): string {
    const date = this.parseDate(
      record.submittedAt ||
        record.generatedAt ||
        record.createdAt ||
        record.updatedAt ||
        record.date,
    );

    if (!date) return '';

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');

    return `${year}-${month}`;
  }

  private getRecordTime(record: any): number {
    return (
      this.parseDate(record.submittedAt)?.getTime() ||
      this.parseDate(record.generatedAt)?.getTime() ||
      this.parseDate(record.createdAt)?.getTime() ||
      this.parseDate(record.updatedAt)?.getTime() ||
      this.parseDate(record.date)?.getTime() ||
      0
    );
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value?.toDate === 'function') {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }

    if (typeof value === 'object' && typeof value.seconds === 'number') {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getUniqueSortedValues(values: string[]): string[] {
    return Array.from(
      new Set(values.map((value) => String(value || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
  }

  private getCurrentMonthValue(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = `${today.getMonth() + 1}`.padStart(2, '0');

    return `${year}-${month}`;
  }

  private formatMonthLabel(monthValue: string): string {
    if (!monthValue) return 'No Month';

    const [year, month] = monthValue.split('-').map(Number);

    if (!year || !month) return monthValue;

    return new Date(year, month - 1, 1).toLocaleString(undefined, {
      month: 'short',
      year: 'numeric',
    });
  }

  private getFilterLabel(): string {
    return [
      this.selectedSection ? `Section: ${this.selectedSection}` : 'Section: All',
      this.selectedSubject ? `Subject: ${this.selectedSubject}` : 'Subject: All',
      this.selectedTeacher ? `Teacher: ${this.selectedTeacher}` : 'Teacher: All',
      this.selectedMonth ? `Month: ${this.selectedMonth}` : 'Month: All',
      this.searchTerm ? `Search: ${this.searchTerm}` : 'Search: None',
    ].join(' | ');
  }

  private toCsvCell(value: any): string {
    const text = String(value ?? '');
    const escaped = text.replace(/"/g, '""');

    return `"${escaped}"`;
  }

  private escapeHtml(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}
