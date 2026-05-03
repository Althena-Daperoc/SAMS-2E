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
  selector: 'app-child-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './child-attendance.html',
  styleUrl: './child-attendance.scss',
})
export class ChildAttendance implements OnInit, OnDestroy {
  linkedStudents: Student[] = [];
  selectedStudentId = '';

  allAttendanceRecords: any[] = [];

  searchTerm = '';
  statusFilter = 'all';

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

  onStudentChange(): void {
    this.searchTerm = '';
    this.statusFilter = 'all';
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = 'all';
  }

  get selectedStudent(): Student | undefined {
    return this.linkedStudents.find((student) => student.id === this.selectedStudentId);
  }

  get attendanceHistory(): any[] {
    const student = this.selectedStudent;
    if (!student) return [];

    return this.allAttendanceRecords
      .filter((record) => this.isRecordForStudent(record, student))
      .sort((a, b) => this.getRecordTimestamp(b) - this.getRecordTimestamp(a));
  }

  get filteredAttendanceHistory(): any[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    return this.attendanceHistory.filter((record) => {
      const status = this.normalize(record.status);
      const matchesStatus = this.statusFilter === 'all' || status === this.statusFilter;

      const searchableText = [
        this.getSubjectLabel(record),
        this.formatDate(record),
        this.formatTime(record),
        this.formatStatus(record.status),
        this.formatMethod(record.method),
        record.remarks,
        record.facultyName,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);

      return matchesStatus && matchesSearch;
    });
  }

  get childInfo() {
    return {
      fullName: this.selectedStudent?.fullName ?? 'No linked child',
      studentId: this.selectedStudent?.studentId ?? 'N/A',
      program: this.formatProgram(this.selectedStudent?.program),
      yearLevel: this.selectedStudent?.yearLevel ?? 'N/A',
      section: this.selectedStudent?.section ?? 'N/A',
    };
  }

  get attendanceSummary() {
    const total = this.attendanceHistory.length;
    const present = this.countStatus('present');
    const late = this.countStatus('late');
    const absent = this.countStatus('absent');
    const excused = this.countStatus('excused');

    return {
      total,
      present,
      late,
      absent,
      excused,
      attendanceRate: total === 0 ? 0 : Math.round(((present + late) / total) * 100),
    };
  }

  get studentInitial(): string {
    return (this.selectedStudent?.fullName || 'S').charAt(0).toUpperCase();
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
    return this.attendanceHistory.filter((record) => this.normalize(record.status) === status)
      .length;
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
