import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

import {
  ChartComponent,
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
  ApexDataLabels,
  ApexStroke,
  ApexLegend,
  ApexTooltip,
  ApexPlotOptions,
  ApexGrid,
  ApexFill,
  ApexNonAxisChartSeries,
  ApexResponsive,
} from 'ng-apexcharts';

import { Attendance } from '../../../core/services/attendance.service';
import { Session } from '../../../core/services/session.service';
import { AssignmentService } from '../../../core/services/assignment.service';
import { StudentService } from '../../../core/services/student.service';
import { FacultyService } from '../../../core/services/faculty.service';
import { SectionService } from '../../../core/services/section.service';
import { SubjectService } from '../../../core/services/subject.service';
import { AuthService } from '../../../core/services/auth.service';

import { Assignment } from '../../../models/assignment.model';
import { Student } from '../../../models/student.model';
import { Faculty } from '../../../models/faculty.model';
import { Section } from '../../../models/section.model';
import { Subject } from '../../../models/subject.model';
import { User } from '../../../models/user.model';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export type MixedChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis | ApexYAxis[];
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
  fill: ApexFill;
};

export type BarChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
  tooltip: ApexTooltip;
};

export type DonutChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  legend: ApexLegend;
  dataLabels: ApexDataLabels;
  tooltip: ApexTooltip;
  responsive: ApexResponsive[];
};

interface AttendanceRecord {
  id?: string;
  sessionId?: string;
  assignmentId?: string;
  studentId?: string;
  studentDocId?: string;
  studentName?: string;
  facultyId?: string;
  facultyName?: string;
  subjectCode?: string;
  subjectName?: string;
  sectionCode?: string;
  program?: string;
  yearLevel?: string;
  schoolYear?: string;
  semester?: string;
  status?: AttendanceStatus | string;
  method?: string;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface SessionRecord {
  id?: string;
  assignmentId?: string;
  facultyId?: string;
  facultyName?: string;
  subjectCode?: string;
  subjectName?: string;
  sectionCode?: string;
  schoolYear?: string;
  semester?: string;
  status?: string;
  sessionCode?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ReportRow {
  id: string;
  date: string;
  time: string;
  studentId: string;
  studentName: string;
  facultyName: string;
  subject: string;
  section: string;
  status: string;
  method: string;
  remarks: string;
  sessionCode: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, NgApexchartsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit, OnDestroy {
  @ViewChild('mixedChart') mixedChart?: ChartComponent;

  currentUser: User | null = null;

  attendanceRecords: AttendanceRecord[] = [];
  sessions: SessionRecord[] = [];
  assignments: Assignment[] = [];
  students: Student[] = [];
  faculty: Faculty[] = [];
  sections: Section[] = [];
  subjects: Subject[] = [];

  searchTerm = '';
  selectedStatus = 'all';
  selectedSection = 'all';
  selectedSubject = 'all';
  selectedFaculty = 'all';
  selectedDateFrom = '';
  selectedDateTo = '';

  isLoading = true;
  loadErrors: string[] = [];

  mixedChartOptions: Partial<MixedChartOptions> = {};
  statusDonutOptions: Partial<DonutChartOptions> = {};
  categoryBarOptions: Partial<BarChartOptions> = {};

  private subscriptions: Subscription[] = [];

  constructor(
    private attendanceService: Attendance,
    private sessionService: Session,
    private assignmentService: AssignmentService,
    private studentService: StudentService,
    private facultyService: FacultyService,
    private sectionService: SectionService,
    private subjectService: SubjectService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadReportData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get isFaculty(): boolean {
    return this.currentUser?.role === 'teacher';
  }

  get pageTitle(): string {
    return this.isAdmin ? 'System Reports' : 'Faculty Reports';
  }

  get pageSubtitle(): string {
    return this.isAdmin
      ? 'Monitor overall attendance records, sessions, faculty activity, sections, subjects, and institutional summaries.'
      : 'Review attendance reports only for your handled sessions, classes, subjects, and students.';
  }

  get currentFacultyRecord(): Faculty | undefined {
    if (!this.currentUser) return undefined;

    const userValues = [
      this.currentUser.id,
      this.currentUser.username,
      this.currentUser.email,
      this.currentUser.fullName,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return this.faculty.find((item: any) => {
      const facultyValues = [
        item.id,
        item.facultyId,
        item.email,
        item.fullName,
        item.username,
        item.userId,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return facultyValues.some((value) => userValues.includes(value));
    });
  }

  get facultyIdentityKeys(): string[] {
    return [
      this.currentUser?.id,
      this.currentUser?.username,
      this.currentUser?.email,
      this.currentUser?.fullName,
      this.currentFacultyRecord?.id,
      this.currentFacultyRecord?.facultyId,
      this.currentFacultyRecord?.email,
      this.currentFacultyRecord?.fullName,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
  }

  get enrichedAttendanceRecords(): AttendanceRecord[] {
    return this.attendanceRecords.map((record) => {
      const session = this.sessions.find((item) => item.id === record.sessionId);

      const assignment = this.assignments.find(
        (item: any) => item.id === record.assignmentId || item.id === session?.assignmentId,
      );

      const student =
        this.students.find((item) => item.studentId === record.studentId) ||
        this.students.find((item) => item.id === record.studentDocId);

      const faculty =
        this.faculty.find((item) => item.facultyId === record.facultyId) ||
        this.faculty.find((item: any) => item.id === record.facultyId) ||
        this.faculty.find((item: any) => item.facultyId === assignment?.facultyEmployeeId) ||
        this.faculty.find((item: any) => item.id === assignment?.facultyId);

      return {
        ...record,
        studentName: record.studentName || student?.fullName || 'Unknown Student',
        facultyId:
          record.facultyId ||
          (assignment as any)?.facultyEmployeeId ||
          (assignment as any)?.facultyId ||
          session?.facultyId ||
          '',
        facultyName:
          record.facultyName ||
          (assignment as any)?.facultyName ||
          session?.facultyName ||
          faculty?.fullName ||
          'N/A',
        subjectCode:
          record.subjectCode || (assignment as any)?.subjectCode || session?.subjectCode || '',
        subjectName:
          record.subjectName || (assignment as any)?.subjectName || session?.subjectName || '',
        sectionCode:
          record.sectionCode || (assignment as any)?.sectionCode || session?.sectionCode || '',
        program: record.program || (assignment as any)?.program || student?.program || '',
        yearLevel: record.yearLevel || (assignment as any)?.yearLevel || student?.yearLevel || '',
        schoolYear:
          record.schoolYear || (assignment as any)?.schoolYear || session?.schoolYear || '',
        semester: record.semester || (assignment as any)?.semester || session?.semester || '',
      };
    });
  }

  get roleScopedRecords(): AttendanceRecord[] {
    if (this.isAdmin) return this.enrichedAttendanceRecords;
    if (!this.isFaculty) return [];

    const keys = this.facultyIdentityKeys;

    return this.enrichedAttendanceRecords.filter((record) => {
      const session = this.sessions.find((item) => item.id === record.sessionId);

      const values = [
        record.facultyId,
        record.facultyName,
        session?.facultyId,
        session?.facultyName,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return values.some((value) => keys.includes(value));
    });
  }

  get filteredRecords(): AttendanceRecord[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    return this.roleScopedRecords.filter((record) => {
      const recordDate = this.getRecordDateOnly(record.createdAt);

      const matchesSearch =
        !keyword ||
        [
          record.studentId,
          record.studentName,
          record.facultyName,
          record.subjectCode,
          record.subjectName,
          record.sectionCode,
          record.program,
          record.yearLevel,
          record.schoolYear,
          record.semester,
          record.status,
          record.method,
          record.remarks,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword);

      const matchesStatus =
        this.selectedStatus === 'all' ||
        (record.status || '').toLowerCase() === this.selectedStatus;

      const matchesSection =
        this.selectedSection === 'all' || record.sectionCode === this.selectedSection;

      const matchesSubject =
        this.selectedSubject === 'all' || record.subjectCode === this.selectedSubject;

      const matchesFaculty =
        !this.isAdmin ||
        this.selectedFaculty === 'all' ||
        record.facultyId === this.selectedFaculty ||
        record.facultyName === this.selectedFaculty;

      const matchesDateFrom = !this.selectedDateFrom || recordDate >= this.selectedDateFrom;
      const matchesDateTo = !this.selectedDateTo || recordDate <= this.selectedDateTo;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSection &&
        matchesSubject &&
        matchesFaculty &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }

  get reportRows(): ReportRow[] {
    return this.filteredRecords.map((record) => {
      const dateValue = record.createdAt ? new Date(record.createdAt) : null;

      return {
        id: record.id || '',
        date: dateValue ? dateValue.toLocaleDateString() : 'N/A',
        time: dateValue
          ? dateValue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'N/A',
        studentId: record.studentId || 'N/A',
        studentName: record.studentName || 'Unknown Student',
        facultyName: record.facultyName || 'N/A',
        subject: `${record.subjectCode || ''} ${record.subjectName || ''}`.trim() || 'N/A',
        section: record.sectionCode || 'N/A',
        status: this.formatStatus(record.status || 'N/A'),
        method: this.formatMethod(record.method || 'N/A'),
        remarks: record.remarks || '—',
        sessionCode: this.getSessionCode(record.sessionId),
      };
    });
  }

  get totalRecords(): number {
    return this.filteredRecords.length;
  }

  get presentCount(): number {
    return this.countByStatus('present');
  }

  get lateCount(): number {
    return this.countByStatus('late');
  }

  get absentCount(): number {
    return this.countByStatus('absent');
  }

  get excusedCount(): number {
    return this.countByStatus('excused');
  }

  get attendanceRate(): number {
    if (this.totalRecords === 0) return 0;
    const attended = this.presentCount + this.lateCount + this.excusedCount;
    return Math.round((attended / this.totalRecords) * 100);
  }

  get totalSessions(): number {
    if (this.isAdmin) return this.sessions.length;

    const keys = this.facultyIdentityKeys;

    return this.sessions.filter((session) =>
      [session.facultyId, session.facultyName]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .some((value) => keys.includes(value)),
    ).length;
  }

  get activeSessions(): number {
    const source = this.isAdmin
      ? this.sessions
      : this.sessions.filter((session) =>
          [session.facultyId, session.facultyName]
            .filter(Boolean)
            .map((value) => String(value).toLowerCase())
            .some((value) => this.facultyIdentityKeys.includes(value)),
        );

    return source.filter((session) => String(session.status || '').toLowerCase() === 'active')
      .length;
  }

  get sectionOptions(): string[] {
    const fromRecords = this.roleScopedRecords
      .map((record) => record.sectionCode)
      .filter(Boolean) as string[];

    return Array.from(new Set(fromRecords)).sort();
  }

  get subjectOptions(): string[] {
    const fromRecords = this.roleScopedRecords
      .map((record) => record.subjectCode)
      .filter(Boolean) as string[];

    return Array.from(new Set(fromRecords)).sort();
  }

  get facultyOptions(): Faculty[] {
    return this.faculty
      .filter((item) => !item.isArchived)
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  loadReportData(): void {
    this.isLoading = true;
    this.loadErrors = [];

    let completed = 0;
    const totalSources = 7;

    const finishOne = () => {
      completed += 1;

      if (completed === totalSources) {
        this.isLoading = false;
        this.refreshCharts();

        if (this.loadErrors.length > 0) {
          Swal.fire({
            title: 'Some Report Data Failed to Load',
            html: `
              <p>The report page loaded, but these source(s) failed:</p>
              <ul style="text-align:left;">
                ${this.loadErrors.map((item) => `<li>${item}</li>`).join('')}
              </ul>
            `,
            icon: 'warning',
            confirmButtonColor: '#4f46e5',
          });
        }
      }
    };

    this.subscriptions.push(
      this.attendanceService.getAttendanceRecords().subscribe({
        next: (data) => {
          this.attendanceRecords = data || [];
          finishOne();
        },
        error: (error) => {
          this.recordLoadError('Attendance Records', error);
          finishOne();
        },
      }),

      this.sessionService.getSessions().subscribe({
        next: (data) => {
          this.sessions = data || [];
          finishOne();
        },
        error: (error) => {
          this.recordLoadError('Sessions', error);
          finishOne();
        },
      }),

      this.assignmentService.getAssignments().subscribe({
        next: (data) => {
          this.assignments = data || [];
          finishOne();
        },
        error: (error) => {
          this.recordLoadError('Assignments', error);
          finishOne();
        },
      }),

      this.studentService.getStudents().subscribe({
        next: (data) => {
          this.students = data || [];
          finishOne();
        },
        error: (error) => {
          this.recordLoadError('Students', error);
          finishOne();
        },
      }),

      this.facultyService.getFaculty().subscribe({
        next: (data) => {
          this.faculty = data || [];
          finishOne();
        },
        error: (error) => {
          this.recordLoadError('Faculty', error);
          finishOne();
        },
      }),

      this.sectionService.getSections().subscribe({
        next: (data) => {
          this.sections = data || [];
          finishOne();
        },
        error: (error) => {
          this.recordLoadError('Sections', error);
          finishOne();
        },
      }),

      this.subjectService.getSubjects().subscribe({
        next: (data) => {
          this.subjects = data || [];
          finishOne();
        },
        error: (error) => {
          this.recordLoadError('Subjects', error);
          finishOne();
        },
      }),
    );
  }

  refreshCharts(): void {
    const trend = this.buildTrendData();
    const categoryData = this.isAdmin
      ? this.buildCategoryData('sectionCode', 8)
      : this.buildCategoryData('subjectCode', 8);

    this.mixedChartOptions = {
      series: [
        {
          name: 'Attendance Records',
          type: 'column',
          data: trend.map((item) => item.total),
        },
        {
          name: 'Attendance Rate',
          type: 'line',
          data: trend.map((item) => item.rate),
        },
      ],
      chart: {
        height: 340,
        type: 'line',
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      stroke: {
        width: [0, 4],
        curve: 'smooth',
      },
      dataLabels: {
        enabled: false,
      },
      plotOptions: {
        bar: {
          columnWidth: '45%',
          borderRadius: 6,
        },
      },
      fill: {
        opacity: [0.9, 1],
      },
      xaxis: {
        categories: trend.map((item) => item.label),
      },
      yaxis: [
        {
          title: { text: 'Records' },
        },
        {
          opposite: true,
          min: 0,
          max: 100,
          title: { text: 'Rate (%)' },
          labels: {
            formatter: (value) => `${Math.round(value)}%`,
          },
        },
      ],
      legend: {
        position: 'top',
      },
      grid: {
        borderColor: '#e5e7eb',
        strokeDashArray: 4,
      },
      tooltip: {
        shared: true,
        intersect: false,
      },
    };

    this.statusDonutOptions = {
      series: [this.presentCount, this.lateCount, this.absentCount, this.excusedCount],
      chart: {
        type: 'donut',
        height: 330,
      },
      labels: ['Present', 'Late', 'Absent', 'Excused'],
      legend: {
        position: 'bottom',
      },
      dataLabels: {
        enabled: true,
      },
      tooltip: {
        y: {
          formatter: (value) => `${value} record(s)`,
        },
      },
      responsive: [
        {
          breakpoint: 768,
          options: {
            chart: { height: 280 },
            legend: { position: 'bottom' },
          },
        },
      ],
    };

    this.categoryBarOptions = {
      series: [
        {
          name: 'Records',
          data: categoryData.map((item) => item.value),
        },
      ],
      chart: {
        type: 'bar',
        height: 330,
        toolbar: { show: false },
      },
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 6,
        },
      },
      dataLabels: {
        enabled: false,
      },
      xaxis: {
        categories: categoryData.map((item) => item.label),
      },
      yaxis: {
        labels: {
          style: {
            fontSize: '12px',
          },
        },
      },
      grid: {
        borderColor: '#e5e7eb',
        strokeDashArray: 4,
      },
      tooltip: {
        y: {
          formatter: (value) => `${value} record(s)`,
        },
      },
    };
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'all';
    this.selectedSection = 'all';
    this.selectedSubject = 'all';
    this.selectedFaculty = 'all';
    this.selectedDateFrom = '';
    this.selectedDateTo = '';
    this.refreshCharts();
  }

  exportExcel(): void {
    if (this.reportRows.length === 0) {
      Swal.fire({
        title: 'No Records',
        text: 'There are no filtered records to export.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const exportData = this.reportRows.map((row, index) => ({
      No: index + 1,
      Date: row.date,
      Time: row.time,
      'Student ID': row.studentId,
      'Student Name': row.studentName,
      Faculty: row.facultyName,
      Subject: row.subject,
      Section: row.section,
      Status: row.status,
      Method: row.method,
      Remarks: row.remarks,
      'Session Code': row.sessionCode,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      this.isAdmin ? 'Admin Report' : 'Faculty Report',
    );

    XLSX.writeFile(
      workbook,
      `${this.isAdmin ? 'SAMS2_Admin_Report' : 'SAMS2_Faculty_Report'}_${this.getTodayFileName()}.xlsx`,
    );
  }

  exportPdf(): void {
    if (this.reportRows.length === 0) {
      Swal.fire({
        title: 'No Records',
        text: 'There are no filtered records to print or save as PDF.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    window.print();
  }

  onFilterChange(): void {
    setTimeout(() => this.refreshCharts());
  }

  formatStatus(status: string): string {
    if (!status) return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }

  formatMethod(method: string): string {
    if (!method) return 'N/A';

    return method
      .replace(/_/g, ' ')
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  getStatusClass(status: string | undefined): string {
    const value = (status || '').toLowerCase();

    if (value === 'present') return 'present';
    if (value === 'late') return 'late';
    if (value === 'absent') return 'absent';
    if (value === 'excused') return 'excused';

    return '';
  }

  private countByStatus(status: AttendanceStatus): number {
    return this.filteredRecords.filter((record) => (record.status || '').toLowerCase() === status)
      .length;
  }

  private buildTrendData(): { label: string; total: number; rate: number }[] {
    const map = new Map<
      string,
      { total: number; present: number; late: number; excused: number }
    >();

    this.filteredRecords.forEach((record) => {
      const date = this.getRecordDateOnly(record.createdAt);
      if (!date) return;

      if (!map.has(date)) {
        map.set(date, {
          total: 0,
          present: 0,
          late: 0,
          excused: 0,
        });
      }

      const item = map.get(date)!;
      const status = String(record.status || '').toLowerCase();

      item.total += 1;

      if (status === 'present') item.present += 1;
      if (status === 'late') item.late += 1;
      if (status === 'excused') item.excused += 1;
    });

    const rows = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, value]) => {
        const attended = value.present + value.late + value.excused;

        return {
          label: new Date(date).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          }),
          total: value.total,
          rate: value.total > 0 ? Math.round((attended / value.total) * 100) : 0,
        };
      });

    return rows.length ? rows : [{ label: 'No Data', total: 0, rate: 0 }];
  }

  private buildCategoryData(
    field: keyof AttendanceRecord,
    limit: number,
  ): { label: string; value: number }[] {
    const counts = new Map<string, number>();

    this.filteredRecords.forEach((record) => {
      const label = String(record[field] || 'Unspecified');
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    const rows = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, value]) => ({ label, value }));

    return rows.length ? rows : [{ label: 'No Data', value: 0 }];
  }

  private getSessionCode(sessionId?: string): string {
    if (!sessionId) return 'N/A';

    const session = this.sessions.find((item) => item.id === sessionId);
    return session?.sessionCode || sessionId;
  }

  private getRecordDateOnly(createdAt?: string): string {
    if (!createdAt) return '';

    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return '';

    return date.toISOString().slice(0, 10);
  }

  private getTodayFileName(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private recordLoadError(source: string, error: any): void {
    console.error(`${source} report load error:`, error);
    this.loadErrors.push(source);
  }
}
