import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { Attendance } from '../../../core/services/attendance.service';
import { StudentService } from '../../../core/services/student.service';
import { User } from '../../../models/user.model';
import { Student } from '../../../models/student.model';

type AttendanceStatus = 'all' | 'present' | 'late' | 'absent' | 'excused';

interface AttendanceRecord {
  id?: string;
  studentId?: string;
  studentDocId?: string;
  studentName?: string;
  subjectCode?: string;
  subjectName?: string;
  sectionCode?: string;
  status?: string;
  method?: string;
  remarks?: string;
  createdAt?: string;
}

@Component({
  selector: 'app-my-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-attendance.html',
  styleUrl: './my-attendance.scss',
})
export class MyAttendance implements OnInit, OnDestroy {
  currentUser: User | null = null;
  student: Student | null = null;

  attendanceRecords: AttendanceRecord[] = [];
  searchTerm = '';
  selectedStatus: AttendanceStatus = 'all';

  isLoading = true;

  selectedRecordIds: string[] = [];
  hiddenRecordIds: string[] = [];

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private attendanceService: Attendance,
    private studentService: StudentService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.hiddenRecordIds = this.getHiddenRecordIds();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get filteredRecords(): AttendanceRecord[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    return this.attendanceRecords
      .filter((record) => !this.hiddenRecordIds.includes(this.getRecordKey(record)))
      .filter((record) => {
        const matchesSearch =
          !keyword ||
          [
            record.subjectCode,
            record.subjectName,
            record.sectionCode,
            record.status,
            record.method,
            record.remarks,
            record.createdAt,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(keyword);

        const matchesStatus =
          this.selectedStatus === 'all' ||
          String(record.status || '').toLowerCase() === this.selectedStatus;

        return matchesSearch && matchesStatus;
      });
  }

  get totalRecords(): number {
    return this.attendanceRecords.filter(
      (record) => !this.hiddenRecordIds.includes(this.getRecordKey(record)),
    ).length;
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

  get firstName(): string {
    return this.currentUser?.fullName?.trim().split(' ')[0] || 'Student';
  }

  get hasActiveFilters(): boolean {
    return this.searchTerm.trim().length > 0 || this.selectedStatus !== 'all';
  }

  get hasSelectedRecords(): boolean {
    return this.selectedRecordIds.length > 0;
  }

  get hasVisibleRecords(): boolean {
    return this.filteredRecords.length > 0;
  }

  get areAllVisibleRecordsSelected(): boolean {
    return (
      this.filteredRecords.length > 0 &&
      this.filteredRecords.every((record) =>
        this.selectedRecordIds.includes(this.getRecordKey(record)),
      )
    );
  }

  loadData(): void {
    this.isLoading = true;

    const studentSub = this.studentService.getStudents().subscribe({
      next: (students) => {
        this.student = this.findCurrentStudent(students);
        this.loadAttendance();
      },
      error: () => {
        this.student = null;
        this.loadAttendance();
      },
    });

    this.subscriptions.push(studentSub);
  }

  loadAttendance(): void {
    const attendanceSub = this.attendanceService.getAttendanceRecords().subscribe({
      next: (records: AttendanceRecord[]) => {
        this.attendanceRecords = records
          .filter((record) => this.isCurrentStudentRecord(record))
          .sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });

        this.selectedRecordIds = this.selectedRecordIds.filter((id) =>
          this.filteredRecords.some((record) => this.getRecordKey(record) === id),
        );

        this.isLoading = false;
      },
      error: () => {
        this.attendanceRecords = [];
        this.isLoading = false;
      },
    });

    this.subscriptions.push(attendanceSub);
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'all';
  }

  toggleRecordSelection(record: AttendanceRecord): void {
    const recordKey = this.getRecordKey(record);

    if (this.selectedRecordIds.includes(recordKey)) {
      this.selectedRecordIds = this.selectedRecordIds.filter((id) => id !== recordKey);
      return;
    }

    this.selectedRecordIds = [...this.selectedRecordIds, recordKey];
  }

  toggleSelectAllVisible(): void {
    if (this.areAllVisibleRecordsSelected) {
      const visibleIds = this.filteredRecords.map((record) => this.getRecordKey(record));
      this.selectedRecordIds = this.selectedRecordIds.filter((id) => !visibleIds.includes(id));
      return;
    }

    const visibleIds = this.filteredRecords.map((record) => this.getRecordKey(record));
    this.selectedRecordIds = Array.from(new Set([...this.selectedRecordIds, ...visibleIds]));
  }

  isRecordSelected(record: AttendanceRecord): boolean {
    return this.selectedRecordIds.includes(this.getRecordKey(record));
  }

  clearSelectedRecords(): void {
    if (!this.selectedRecordIds.length) return;

    this.hiddenRecordIds = Array.from(
      new Set([...this.hiddenRecordIds, ...this.selectedRecordIds]),
    );
    this.saveHiddenRecordIds();
    this.selectedRecordIds = [];
  }

  clearAllRecords(): void {
    const visibleIds = this.filteredRecords.map((record) => this.getRecordKey(record));

    if (!visibleIds.length) return;

    this.hiddenRecordIds = Array.from(new Set([...this.hiddenRecordIds, ...visibleIds]));
    this.saveHiddenRecordIds();
    this.selectedRecordIds = [];
  }

  restoreClearedRecords(): void {
    this.hiddenRecordIds = [];
    this.selectedRecordIds = [];
    this.saveHiddenRecordIds();
  }

  formatStatus(status?: string): string {
    if (!status) return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }

  formatMethod(method?: string): string {
    if (!method) return 'N/A';

    return method
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  formatDate(dateValue?: string): string {
    if (!dateValue) return 'N/A';

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatTime(dateValue?: string): string {
    if (!dateValue) return 'N/A';

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getStatusClass(status?: string): string {
    const value = String(status || '').toLowerCase();

    if (value === 'present') return 'present';
    if (value === 'late') return 'late';
    if (value === 'absent') return 'absent';
    if (value === 'excused') return 'excused';

    return 'neutral';
  }

  private getRecordKey(record: AttendanceRecord): string {
    return (
      record.id ||
      `${record.studentId || record.studentDocId || record.studentName || 'student'}_${
        record.subjectCode || record.subjectName || 'subject'
      }_${record.createdAt || 'date'}`
    );
  }

  private getStorageKey(): string {
    const userKey =
      this.currentUser?.id ||
      this.currentUser?.username ||
      this.currentUser?.email ||
      this.currentUser?.fullName ||
      'student';

    return `sams_hidden_attendance_records_${userKey}`;
  }

  private getHiddenRecordIds(): string[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveHiddenRecordIds(): void {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(this.hiddenRecordIds));
  }

  private findCurrentStudent(students: Student[]): Student | null {
    if (!this.currentUser) return null;

    const userKeys = [
      this.currentUser.id,
      this.currentUser.username,
      this.currentUser.email,
      this.currentUser.fullName,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return (
      students.find((student: any) => {
        const studentKeys = [
          student.id,
          student.studentId,
          student.email,
          student.fullName,
          student.username,
          student.userId,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());

        return studentKeys.some((key) => userKeys.includes(key));
      }) || null
    );
  }

  private isCurrentStudentRecord(record: AttendanceRecord): boolean {
    if (!this.currentUser) return false;

    const studentKeys = [
      this.currentUser.id,
      this.currentUser.username,
      this.currentUser.email,
      this.currentUser.fullName,
      this.student?.id,
      this.student?.studentId,
      this.student?.email,
      this.student?.fullName,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    const recordKeys = [record.studentDocId, record.studentId, record.studentName]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return recordKeys.some((key) => studentKeys.includes(key));
  }

  private countByStatus(status: string): number {
    return this.attendanceRecords.filter((record) => {
      const isVisible = !this.hiddenRecordIds.includes(this.getRecordKey(record));
      return isVisible && String(record.status || '').toLowerCase() === status;
    }).length;
  }
}
