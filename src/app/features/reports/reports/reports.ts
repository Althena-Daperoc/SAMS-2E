import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from '@angular/fire/firestore';

import { AuthService } from '../../../core/services/auth.service';

type ReportTab = 'records' | 'trash';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit, OnDestroy {
  currentUser: any = null;

  attendanceRecords: any[] = [];
  assignments: any[] = [];
  students: any[] = [];
  sessions: any[] = [];

  activeTab: ReportTab = 'records';

  searchTerm = '';
  statusFilter = 'all';
  subjectFilter = 'all';
  sectionFilter = 'all';
  monthFilter = 'all';
  yearFilter = 'all';

  isLoading = true;
  isProcessing = false;

  selectedRecordIds = new Set<string>();

  private unsubscribers: Array<() => void> = [];
  private loadedCollections = new Set<string>();

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadRealtimeData();
  }

  ngOnDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  get isFacultyView(): boolean {
    const role = this.normalize(this.currentUser?.role);
    return role === 'teacher' || role === 'faculty';
  }

  get isAdminView(): boolean {
    return this.normalize(this.currentUser?.role) === 'admin';
  }

  get scopedRecords(): any[] {
    if (this.isAdminView) return this.attendanceRecords;

    return this.attendanceRecords.filter((record) => this.isRecordHandledByCurrentFaculty(record));
  }

  get activeRecords(): any[] {
    return this.scopedRecords.filter((record) => !record.isTrashed);
  }

  get trashRecords(): any[] {
    return this.scopedRecords.filter((record) => record.isTrashed === true);
  }

  get sourceRecords(): any[] {
    return this.activeTab === 'trash' ? this.trashRecords : this.activeRecords;
  }

  get filteredRecords(): any[] {
    return this.sourceRecords
      .filter((record) => this.matchesSearch(record))
      .filter((record) => this.matchesStatus(record))
      .filter((record) => this.matchesSubject(record))
      .filter((record) => this.matchesSection(record))
      .filter((record) => this.matchesMonth(record))
      .filter((record) => this.matchesYear(record))
      .sort((a, b) => this.getRecordTime(b) - this.getRecordTime(a));
  }

  get monitoringSourceRecords(): any[] {
    return this.activeRecords
      .filter((record) => this.matchesSubject(record))
      .filter((record) => this.matchesSection(record))
      .filter((record) => this.matchesMonth(record))
      .filter((record) => this.matchesYear(record));
  }

  get studentsNeedingMonitoring(): any[] {
    const grouped = new Map<string, any>();

    this.monitoringSourceRecords.forEach((record) => {
      const studentId = String(record.studentId || '').trim();
      const subject = this.getSubjectLabel(record);
      const section = this.getSectionLabel(record);

      if (!studentId) return;

      const key = `${studentId}_${subject}_${section}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          studentId,
          studentName: record.studentName || this.findStudentName(studentId),
          subject,
          section,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          excusedCount: 0,
          totalRecords: 0,
          latestAbsence: '',
        });
      }

      const item = grouped.get(key);
      const status = this.normalize(record.status);

      item.totalRecords += 1;

      if (status === 'present') item.presentCount += 1;
      if (status === 'late') item.lateCount += 1;
      if (status === 'excused') item.excusedCount += 1;

      if (status === 'absent') {
        item.absentCount += 1;

        const currentTime = this.getRecordTime(record);
        const latestTime = this.parseDate(item.latestAbsence)?.getTime() || 0;

        if (currentTime > latestTime) {
          item.latestAbsence = this.getRecordDateValue(record);
        }
      }
    });

    return Array.from(grouped.values())
      .filter((item) => item.absentCount > 0)
      .sort((a, b) => {
        if (b.absentCount !== a.absentCount) return b.absentCount - a.absentCount;
        return b.lateCount - a.lateCount;
      })
      .slice(0, 10);
  }

  get topMonitoringStudent(): any | null {
    return this.studentsNeedingMonitoring[0] || null;
  }

  get totalActiveRecords(): number {
    return this.activeRecords.length;
  }

  get totalTrashRecords(): number {
    return this.trashRecords.length;
  }

  get totalFilteredRecords(): number {
    return this.filteredRecords.length;
  }

  get presentCount(): number {
    return this.activeRecords.filter((record) => this.normalize(record.status) === 'present')
      .length;
  }

  get lateCount(): number {
    return this.activeRecords.filter((record) => this.normalize(record.status) === 'late').length;
  }

  get absentCount(): number {
    return this.activeRecords.filter((record) => this.normalize(record.status) === 'absent').length;
  }

  get excusedCount(): number {
    return this.activeRecords.filter((record) => this.normalize(record.status) === 'excused')
      .length;
  }

  get availableSubjects(): string[] {
    return Array.from(
      new Set(
        this.scopedRecords
          .map((record) => this.getSubjectLabel(record))
          .filter((value) => value && value !== 'N/A'),
      ),
    ).sort();
  }

  get availableSections(): string[] {
    return Array.from(
      new Set(
        this.scopedRecords
          .map((record) => this.getSectionLabel(record))
          .filter((value) => value && value !== 'N/A'),
      ),
    ).sort();
  }

  get availableYears(): string[] {
    return Array.from(
      new Set(
        this.scopedRecords
          .map((record) => {
            const date = this.parseDate(this.getRecordDateValue(record));
            return date ? String(date.getFullYear()) : '';
          })
          .filter(Boolean),
      ),
    ).sort((a, b) => Number(b) - Number(a));
  }

  get selectedVisibleCount(): number {
    return this.filteredRecords.filter(
      (record) => record.id && this.selectedRecordIds.has(record.id),
    ).length;
  }

  get hasSelectedRecords(): boolean {
    return this.selectedVisibleCount > 0;
  }

  get allVisibleSelected(): boolean {
    const visibleIds = this.filteredRecords.map((record) => record.id).filter(Boolean);

    if (visibleIds.length === 0) return false;

    return visibleIds.every((id) => this.selectedRecordIds.has(id));
  }

  loadRealtimeData(): void {
    this.isLoading = true;

    this.listenToCollection('attendance', (data) => {
      this.attendanceRecords = data;
      this.cleanSelections();
      this.markCollectionLoaded('attendance');
    });

    this.listenToCollection('assignments', (data) => {
      this.assignments = data;
      this.markCollectionLoaded('assignments');
    });

    this.listenToCollection('students', (data) => {
      this.students = data;
      this.markCollectionLoaded('students');
    });

    this.listenToCollection('sessions', (data) => {
      this.sessions = data;
      this.markCollectionLoaded('sessions');
    });
  }

  setActiveTab(tab: ReportTab): void {
    this.activeTab = tab;
    this.selectedRecordIds.clear();
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.subjectFilter = 'all';
    this.sectionFilter = 'all';
    this.monthFilter = 'all';
    this.yearFilter = 'all';
    this.selectedRecordIds.clear();
  }

  toggleSelectRecord(recordId: string | undefined, checked: boolean): void {
    if (!recordId) return;

    if (checked) {
      this.selectedRecordIds.add(recordId);
    } else {
      this.selectedRecordIds.delete(recordId);
    }
  }

  toggleSelectAllVisible(checked: boolean): void {
    this.filteredRecords.forEach((record) => {
      if (!record.id) return;

      if (checked) {
        this.selectedRecordIds.add(record.id);
      } else {
        this.selectedRecordIds.delete(record.id);
      }
    });
  }

  isRecordSelected(recordId: string | undefined): boolean {
    if (!recordId) return false;
    return this.selectedRecordIds.has(recordId);
  }

  async moveSelectedToTrash(): Promise<void> {
    const selectedRecords = this.filteredRecords.filter(
      (record) => record.id && this.selectedRecordIds.has(record.id),
    );

    if (this.isProcessing || selectedRecords.length === 0 || this.activeTab !== 'records') return;

    const result = await Swal.fire({
      title: 'Move selected records to Trash?',
      text: `${selectedRecords.length} record(s) will be hidden from active reports but can still be restored.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Move to Trash',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    await this.moveRecordsToTrash(selectedRecords);
  }

  async moveFilteredToTrash(): Promise<void> {
    const records = this.filteredRecords.filter((record) => record.id);

    if (this.isProcessing || records.length === 0 || this.activeTab !== 'records') return;

    const result = await Swal.fire({
      title: 'Move all filtered records to Trash?',
      text: `${records.length} visible filtered record(s) will be moved to Trash.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Move filtered records',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    await this.moveRecordsToTrash(records);
  }

  async moveOneToTrash(record: any): Promise<void> {
    if (!record?.id || this.isProcessing) return;

    const result = await Swal.fire({
      title: 'Move this record to Trash?',
      text: 'This record will be hidden from active reports.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Move to Trash',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    await this.moveRecordsToTrash([record]);
  }

  async restoreSelectedRecords(): Promise<void> {
    const selectedRecords = this.filteredRecords.filter(
      (record) => record.id && this.selectedRecordIds.has(record.id),
    );

    if (this.isProcessing || selectedRecords.length === 0 || this.activeTab !== 'trash') return;

    const result = await Swal.fire({
      title: 'Restore selected records?',
      text: `${selectedRecords.length} record(s) will return to active reports.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Restore',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    await this.restoreRecords(selectedRecords);
  }

  async restoreOneRecord(record: any): Promise<void> {
    if (!record?.id || this.isProcessing) return;

    const result = await Swal.fire({
      title: 'Restore this record?',
      text: 'This record will return to active reports.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Restore',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    await this.restoreRecords([record]);
  }

  async permanentlyDeleteSelectedRecords(): Promise<void> {
    const selectedRecords = this.filteredRecords.filter(
      (record) => record.id && this.selectedRecordIds.has(record.id),
    );

    if (this.isProcessing || selectedRecords.length === 0 || this.activeTab !== 'trash') return;

    const result = await Swal.fire({
      title: 'Permanently delete selected records?',
      text: `${selectedRecords.length} record(s) will be permanently removed from Firebase. This cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Delete permanently',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    await this.deleteRecordsPermanently(selectedRecords);
  }

  async permanentlyDeleteOneRecord(record: any): Promise<void> {
    if (!record?.id || this.isProcessing) return;

    const result = await Swal.fire({
      title: 'Permanently delete this record?',
      text: 'This will remove the record from Firebase permanently.',
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Delete permanently',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    await this.deleteRecordsPermanently([record]);
  }

  async emptyTrash(): Promise<void> {
    const records = this.filteredRecords.filter((record) => record.id);

    if (this.isProcessing || records.length === 0 || this.activeTab !== 'trash') return;

    const result = await Swal.fire({
      title: 'Empty Trash?',
      text: `${records.length} visible trashed record(s) will be permanently deleted from Firebase.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Empty Trash',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    await this.deleteRecordsPermanently(records);
  }

  exportCsv(): void {
    const records = this.filteredRecords;

    if (records.length === 0) {
      Swal.fire({
        title: 'No records to export',
        text: 'There are no records based on the current filters.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const headers = [
      'Date',
      'Time',
      'Student ID',
      'Student Name',
      'Subject',
      'Section',
      'Status',
      'Method',
      'Remarks',
    ];

    const rows = records.map((record) => [
      this.formatDate(record),
      this.formatTime(record),
      record.studentId || '',
      record.studentName || '',
      this.getSubjectLabel(record),
      this.getSectionLabel(record),
      this.toTitleCase(record.status || ''),
      this.formatMethod(record.method || ''),
      record.remarks || '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `sams-faculty-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  printReport(): void {
    const records = this.filteredRecords;

    if (records.length === 0) {
      Swal.fire({
        title: 'No records to print',
        text: 'There are no records based on the current filters.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const rows = records
      .map(
        (record, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${this.formatDate(record)}</td>
            <td>${this.formatTime(record)}</td>
            <td>${record.studentId || ''}</td>
            <td>${record.studentName || ''}</td>
            <td>${this.getSubjectLabel(record)}</td>
            <td>${this.getSectionLabel(record)}</td>
            <td>${this.toTitleCase(record.status || '')}</td>
            <td>${this.formatMethod(record.method || '')}</td>
            <td>${record.remarks || ''}</td>
          </tr>
        `,
      )
      .join('');

    const monitoringRows = this.studentsNeedingMonitoring
      .map(
        (item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${item.studentId}</td>
            <td>${item.studentName}</td>
            <td>${item.subject}</td>
            <td>${item.section}</td>
            <td>${item.absentCount}</td>
            <td>${item.lateCount}</td>
            <td>${item.latestAbsence ? this.formatDateValue(item.latestAbsence) : 'N/A'}</td>
          </tr>
        `,
      )
      .join('');

    const printWindow = window.open('', '_blank', 'width=1200,height=800');

    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>SAMS Faculty Attendance Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
            }

            h1, h2 {
              margin: 0 0 8px;
            }

            p {
              margin: 0 0 20px;
              color: #4b5563;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
              font-size: 12px;
            }

            th, td {
              border: 1px solid #d1d5db;
              padding: 8px;
              text-align: left;
              vertical-align: top;
            }

            th {
              background: #f3f4f6;
            }

            .section {
              margin-top: 28px;
            }
          </style>
        </head>

        <body>
          <h1>SAMS Faculty Attendance Report</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>

          <div class="section">
            <h2>Students Needing Monitoring</h2>
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Subject</th>
                  <th>Section</th>
                  <th>Absences</th>
                  <th>Lates</th>
                  <th>Latest Absence</th>
                </tr>
              </thead>
              <tbody>
                ${
                  monitoringRows ||
                  '<tr><td colspan="8">No students currently need monitoring.</td></tr>'
                }
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Attendance Records</h2>
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Subject</th>
                  <th>Section</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>

          <script>
            window.print();
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  getSubjectLabel(record: any): string {
    const subjectCode = String(record.subjectCode || '').trim();
    const subjectName = String(record.subjectName || '').trim();

    if (subjectCode && subjectName) return `${subjectCode} — ${subjectName}`;
    if (subjectCode) return subjectCode;
    if (subjectName) return subjectName;

    return 'N/A';
  }

  getSectionLabel(record: any): string {
    return (
      record.sectionCode || record.section || record.studentSection || record.classSection || 'N/A'
    );
  }

  formatDate(record: any): string {
    return this.formatDateValue(this.getRecordDateValue(record));
  }

  formatTime(record: any): string {
    const directTime = String(record.time || record.timeRecorded || '').trim();

    if (directTime && !this.parseDate(directTime)) {
      return directTime;
    }

    const date = this.parseDate(this.getRecordDateValue(record));

    if (!date) return directTime || 'N/A';

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDateValue(value: any): string {
    const date = this.parseDate(value);

    if (!date) return 'N/A';

    return date.toLocaleDateString([], {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatMethod(value: string): string {
    const methodMap: Record<string, string> = {
      rotating_qr_or_session_code: 'QR / Session Code',
      approved_rotating_sit_in_request: 'Approved Sit-in Request',
      approved_sit_in_request: 'Approved Sit-in Request',
      auto_absent_session_end: 'Auto Absent Session End',
      imported_excel: 'Imported Excel',
      manual: 'Manual',
      qr: 'QR',
    };

    const key = this.normalize(value);

    return methodMap[key] || this.toTitleCase(value || 'N/A');
  }

  statusClass(status: string): string {
    return `status-${this.normalize(status || 'unknown')}`;
  }

  private async moveRecordsToTrash(records: any[]): Promise<void> {
    this.isProcessing = true;

    try {
      const now = new Date().toISOString();

      await Promise.all(
        records.map((record) =>
          updateDoc(doc(this.firestore, `attendance/${record.id}`), {
            isTrashed: true,
            trashedAt: now,
            trashedBy: this.currentUser?.id || this.currentUser?.username || 'faculty',
            trashedByName: this.currentUser?.fullName || 'Faculty',
            updatedAt: now,
          }),
        ),
      );

      this.selectedRecordIds.clear();

      await Swal.fire({
        title: 'Moved to Trash',
        text: `${records.length} record(s) were moved to Trash.`,
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);

      await Swal.fire({
        title: 'Move Failed',
        text: 'Unable to move records to Trash.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async restoreRecords(records: any[]): Promise<void> {
    this.isProcessing = true;

    try {
      const now = new Date().toISOString();

      await Promise.all(
        records.map((record) =>
          updateDoc(doc(this.firestore, `attendance/${record.id}`), {
            isTrashed: false,
            restoredAt: now,
            restoredBy: this.currentUser?.id || this.currentUser?.username || 'faculty',
            restoredByName: this.currentUser?.fullName || 'Faculty',
            updatedAt: now,
          }),
        ),
      );

      this.selectedRecordIds.clear();

      await Swal.fire({
        title: 'Restored',
        text: `${records.length} record(s) were restored.`,
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);

      await Swal.fire({
        title: 'Restore Failed',
        text: 'Unable to restore records.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private async deleteRecordsPermanently(records: any[]): Promise<void> {
    this.isProcessing = true;

    try {
      await Promise.all(
        records.map((record) => deleteDoc(doc(this.firestore, `attendance/${record.id}`))),
      );

      this.selectedRecordIds.clear();

      await Swal.fire({
        title: 'Deleted',
        text: `${records.length} record(s) were permanently deleted from Firebase.`,
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);

      await Swal.fire({
        title: 'Delete Failed',
        text: 'Unable to permanently delete records.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private listenToCollection(collectionName: string, callback: (data: any[]) => void): void {
    const ref = collection(this.firestore, collectionName);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        callback(data);
      },
      (error) => {
        console.error(`${collectionName} listener error:`, error);
        callback([]);
      },
    );

    this.unsubscribers.push(unsubscribe);
  }

  private markCollectionLoaded(collectionName: string): void {
    this.loadedCollections.add(collectionName);

    if (this.loadedCollections.size >= 4) {
      this.isLoading = false;
    }
  }

  private cleanSelections(): void {
    const recordIds = new Set(this.attendanceRecords.map((record) => record.id).filter(Boolean));

    this.selectedRecordIds.forEach((id) => {
      if (!recordIds.has(id)) {
        this.selectedRecordIds.delete(id);
      }
    });
  }

  private isRecordHandledByCurrentFaculty(record: any): boolean {
    if (!this.currentUser) return true;

    const userId = this.normalize(this.currentUser.id);
    const username = this.normalize(this.currentUser.username);
    const fullName = this.normalize(this.currentUser.fullName || this.currentUser.name);
    const employeeId = this.normalize(
      this.currentUser.employeeId || this.currentUser.facultyEmployeeId,
    );

    const recordFacultyId = this.normalize(
      record.facultyId || record.teacherId || record.instructorId || record.createdBy,
    );

    const recordFacultyName = this.normalize(
      record.facultyName || record.teacherName || record.instructorName,
    );

    if (
      (!!recordFacultyId && recordFacultyId === userId) ||
      (!!recordFacultyId && recordFacultyId === username) ||
      (!!recordFacultyId && recordFacultyId === employeeId) ||
      (!!recordFacultyName && recordFacultyName === fullName)
    ) {
      return true;
    }

    return this.assignments.some((assignment) => {
      if (!this.isAssignmentHandledByCurrentFaculty(assignment)) return false;

      const assignmentId = this.normalize(assignment.id);
      const assignmentCode = this.normalize(assignment.assignmentCode);

      const recordAssignmentId = this.normalize(record.assignmentId || record.classOfferingId);
      const recordAssignmentCode = this.normalize(record.assignmentCode);

      const directAssignmentMatch =
        (!!assignmentId && !!recordAssignmentId && assignmentId === recordAssignmentId) ||
        (!!assignmentCode && !!recordAssignmentCode && assignmentCode === recordAssignmentCode);

      if (directAssignmentMatch) return true;

      const sameSubject =
        this.normalize(assignment.subjectCode) === this.normalize(record.subjectCode) ||
        this.normalize(assignment.subjectName) === this.normalize(record.subjectName);

      const sameSection = this.sectionsMatch(assignment.sectionCode, this.getSectionLabel(record));

      const sameSemester =
        !assignment.semester ||
        !record.semester ||
        this.normalize(assignment.semester) === this.normalize(record.semester);

      return sameSubject && sameSection && sameSemester;
    });
  }

  private isAssignmentHandledByCurrentFaculty(assignment: any): boolean {
    if (!this.currentUser) return false;

    const userId = this.normalize(this.currentUser.id);
    const username = this.normalize(this.currentUser.username);
    const fullName = this.normalize(this.currentUser.fullName || this.currentUser.name);
    const employeeId = this.normalize(
      this.currentUser.employeeId || this.currentUser.facultyEmployeeId,
    );

    const assignmentFacultyId = this.normalize(
      assignment.facultyId || assignment.teacherId || assignment.instructorId,
    );

    const assignmentFacultyEmployeeId = this.normalize(assignment.facultyEmployeeId);
    const assignmentFacultyName = this.normalize(
      assignment.facultyName || assignment.teacherName || assignment.instructorName,
    );

    return (
      (!!assignmentFacultyId && assignmentFacultyId === userId) ||
      (!!assignmentFacultyId && assignmentFacultyId === username) ||
      (!!assignmentFacultyId && assignmentFacultyId === employeeId) ||
      (!!assignmentFacultyEmployeeId && assignmentFacultyEmployeeId === username) ||
      (!!assignmentFacultyEmployeeId && assignmentFacultyEmployeeId === employeeId) ||
      (!!assignmentFacultyName && assignmentFacultyName === fullName)
    );
  }

  private matchesSearch(record: any): boolean {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return true;

    return [
      record.studentId,
      record.studentName,
      this.getSubjectLabel(record),
      this.getSectionLabel(record),
      record.status,
      record.method,
      record.remarks,
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  }

  private matchesStatus(record: any): boolean {
    if (this.statusFilter === 'all') return true;

    return this.normalize(record.status) === this.normalize(this.statusFilter);
  }

  private matchesSubject(record: any): boolean {
    if (this.subjectFilter === 'all') return true;

    return this.getSubjectLabel(record) === this.subjectFilter;
  }

  private matchesSection(record: any): boolean {
    if (this.sectionFilter === 'all') return true;

    return this.getSectionLabel(record) === this.sectionFilter;
  }

  private matchesMonth(record: any): boolean {
    if (this.monthFilter === 'all') return true;

    const date = this.parseDate(this.getRecordDateValue(record));

    if (!date) return false;

    return String(date.getMonth() + 1) === String(this.monthFilter);
  }

  private matchesYear(record: any): boolean {
    if (this.yearFilter === 'all') return true;

    const date = this.parseDate(this.getRecordDateValue(record));

    if (!date) return false;

    return String(date.getFullYear()) === String(this.yearFilter);
  }

  private findStudentName(studentId: string): string {
    const student = this.students.find(
      (item) => this.normalize(item.studentId) === this.normalize(studentId),
    );

    return student?.fullName || studentId || 'Unknown Student';
  }

  private getRecordDateValue(record: any): any {
    return (
      record.submittedAt ||
      record.generatedAt ||
      record.timeRecorded ||
      record.createdAt ||
      record.updatedAt ||
      record.date ||
      ''
    );
  }

  private getRecordTime(record: any): number {
    return (
      this.parseDate(record.submittedAt)?.getTime() ||
      this.parseDate(record.generatedAt)?.getTime() ||
      this.parseDate(record.timeRecorded)?.getTime() ||
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

  private sectionsMatch(firstValue: any, secondValue: any): boolean {
    const first = this.normalizeSection(firstValue);
    const second = this.normalizeSection(secondValue);

    if (!first || !second) return false;

    return first === second || first.includes(second) || second.includes(first);
  }

  private normalizeSection(value: any): string {
    return this.normalize(value)
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace(/_/g, '')
      .replace('section', '')
      .replace(/^bsit/, '')
      .replace(/^it/, '')
      .replace(/^tcm/, '')
      .replace(/^emt/, '');
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private toTitleCase(value: string): string {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
