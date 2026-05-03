import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';

import { AuthService } from '../../../core/services/auth.service';
import { StudentService } from '../../../core/services/student.service';
import { Attendance } from '../../../core/services/attendance.service';
import { Student } from '../../../models/student.model';

@Component({
  selector: 'app-parent-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parent-dashboard.html',
  styleUrl: './parent-dashboard.scss',
})
export class ParentDashboard implements OnInit, OnDestroy {
  parentName = 'Parent';

  linkedStudents: Student[] = [];
  selectedStudentId = '';

  allAttendanceRecords: any[] = [];

  isLoading = true;
  isAttendanceLoading = true;

  private studentSubscription?: Subscription;
  private attendanceSubscription?: Subscription;
  private linkedStudentIds: string[] = [];

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
    private studentService: StudentService,
    private attendanceService: Attendance,
  ) {}

  async ngOnInit(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    this.parentName = currentUser?.fullName ?? 'Parent';

    this.linkedStudentIds = await this.resolveLinkedStudentIds(currentUser);

    if (!this.linkedStudentIds.length) {
      this.isLoading = false;
      this.isAttendanceLoading = false;
      return;
    }

    this.studentSubscription = this.studentService.getStudents().subscribe({
      next: (students) => {
        const linkedSet = new Set(this.linkedStudentIds.map((id) => this.normalize(id)));

        this.linkedStudents = students
          .filter((student) => !student.isArchived)
          .filter(
            (student) =>
              linkedSet.has(this.normalize(student.id)) ||
              linkedSet.has(this.normalize(student.studentId)),
          );

        if (!this.selectedStudentId && this.linkedStudents.length) {
          this.selectedStudentId = this.linkedStudents[0].id;
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load linked students:', error);
        this.linkedStudents = [];
        this.isLoading = false;
      },
    });

    this.attendanceSubscription = this.attendanceService.getAttendanceRecords().subscribe({
      next: (records) => {
        this.allAttendanceRecords = records;
        this.isAttendanceLoading = false;
      },
      error: (error) => {
        console.error('Failed to load attendance records:', error);
        this.allAttendanceRecords = [];
        this.isAttendanceLoading = false;
      },
    });
  }

  ngOnDestroy(): void {
    this.studentSubscription?.unsubscribe();
    this.attendanceSubscription?.unsubscribe();
  }

  onStudentChange(): void {}

  get selectedStudent(): Student | undefined {
    return this.linkedStudents.find((student) => student.id === this.selectedStudentId);
  }

  get selectedAttendanceRecords(): any[] {
    const student = this.selectedStudent;
    if (!student) return [];

    return this.allAttendanceRecords
      .filter((record) => this.isRecordForStudent(record, student))
      .sort((a, b) => this.getRecordTimestamp(b) - this.getRecordTimestamp(a));
  }

  get latestRecord(): any | undefined {
    return this.selectedAttendanceRecords[0];
  }

  get presentCount(): number {
    return this.countStatus('present');
  }

  get lateCount(): number {
    return this.countStatus('late');
  }

  get absentCount(): number {
    return this.countStatus('absent');
  }

  get excusedCount(): number {
    return this.countStatus('excused');
  }

  get totalRecords(): number {
    return this.selectedAttendanceRecords.length;
  }

  get attendanceRate(): number {
    if (!this.totalRecords) return 0;
    return Math.round(((this.presentCount + this.lateCount) / this.totalRecords) * 100);
  }

  get totalWarnings(): number {
    return this.absentCount + this.lateCount;
  }

  get dashboardStatus(): string {
    if (!this.totalRecords) return 'No Records Yet';
    if (this.attendanceRate >= 90 && this.totalWarnings === 0) return 'Excellent';
    if (this.attendanceRate >= 80) return 'Good';
    if (this.attendanceRate >= 70) return 'Needs Monitoring';
    return 'At Risk';
  }

  get dashboardStatusClass(): string {
    return this.dashboardStatus.toLowerCase().replace(/\s+/g, '-');
  }

  get latestSubject(): string {
    return this.latestRecord ? this.getSubjectLabel(this.latestRecord) : 'No recent subject';
  }

  get latestDate(): string {
    return this.latestRecord ? this.formatDate(this.latestRecord) : 'No date available';
  }

  get studentInitial(): string {
    return (this.selectedStudent?.fullName || 'S').charAt(0).toUpperCase();
  }

  get recentRecords(): any[] {
    return this.selectedAttendanceRecords.slice(0, 5);
  }

  get attendanceInsight(): string {
    if (!this.totalRecords) {
      return 'No attendance records are available yet for this student.';
    }

    if (this.attendanceRate >= 90 && this.totalWarnings === 0) {
      return 'The student currently maintains a strong attendance performance.';
    }

    if (this.absentCount > 0 && this.lateCount > 0) {
      return 'The student has both absence and late records. Continued monitoring is recommended.';
    }

    if (this.absentCount > 0) {
      return 'The student has absence records that may require follow-up.';
    }

    if (this.lateCount > 0) {
      return 'The student has late records. Monitoring punctuality is recommended.';
    }

    return 'The student has acceptable attendance performance based on available records.';
  }

  getStatusClass(status: string): string {
    return this.normalize(status) || 'unknown';
  }

  formatStatus(status: string): string {
    const value = String(status || 'No Record')
      .replace(/_/g, ' ')
      .trim();
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  getSubjectLabel(record: any): string {
    const code = record.subjectCode || record.subject || '';
    const name = record.subjectName || '';

    if (code && name) return `${code} - ${name}`;
    return code || name || 'N/A';
  }

  formatDate(record: any): string {
    const rawDate = record.createdAt || record.date || record.updatedAt || record.validatedAt;
    const date = new Date(rawDate);

    if (!rawDate || Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  formatTime(record: any): string {
    const rawDate = record.createdAt || record.time || record.updatedAt || record.validatedAt;
    const date = new Date(rawDate);

    if (!rawDate || Number.isNaN(date.getTime())) {
      return record.time || 'N/A';
    }

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatMethod(method: string): string {
    if (!method) return 'N/A';

    const labels: Record<string, string> = {
      qr_scan: 'QR Scan',
      qr_or_session_code: 'QR / Session Code',
      manual: 'Manual',
      imported_excel: 'Excel Import',
      approved_sit_in_request: 'Approved Request',
      qr_or_session_code_request: 'Request',
    };

    return labels[method] || this.formatStatus(method);
  }

  formatProgram(program: string | undefined): string {
    const labels: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return program ? labels[program] || program : 'N/A';
  }

  private async resolveLinkedStudentIds(currentUser: any): Promise<string[]> {
    const directIds = currentUser?.linkedStudentIds || [];

    if (Array.isArray(directIds) && directIds.length) {
      return directIds;
    }

    const email = String(currentUser?.email || '')
      .trim()
      .toLowerCase();

    if (!email) return [];

    try {
      const parentsRef = collection(this.firestore, 'parents');
      const parentQuery = query(parentsRef, where('email', '==', email));
      const snapshot = await getDocs(parentQuery);

      if (snapshot.empty) return [];

      const parentData = snapshot.docs[0].data() as any;
      return Array.isArray(parentData.linkedStudentIds) ? parentData.linkedStudentIds : [];
    } catch (error) {
      console.error('Failed to resolve parent linked students:', error);
      return [];
    }
  }

  private countStatus(status: string): number {
    return this.selectedAttendanceRecords.filter(
      (record) => this.normalize(record.status) === status,
    ).length;
  }

  private isRecordForStudent(record: any, student: Student): boolean {
    const recordStudentDocId = this.normalize(record.studentDocId);
    const recordStudentId = this.normalize(record.studentId);

    return (
      (!!recordStudentDocId && recordStudentDocId === this.normalize(student.id)) ||
      (!!recordStudentId && recordStudentId === this.normalize(student.studentId))
    );
  }

  private getRecordTimestamp(record: any): number {
    const rawDate = record.createdAt || record.updatedAt || record.validatedAt || record.date || 0;
    const date = new Date(rawDate).getTime();

    return Number.isNaN(date) ? 0 : date;
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}
