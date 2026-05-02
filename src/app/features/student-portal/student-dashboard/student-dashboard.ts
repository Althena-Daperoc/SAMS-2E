import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { Attendance } from '../../../core/services/attendance.service';
import { StudentService } from '../../../core/services/student.service';
import { User } from '../../../models/user.model';
import { Student } from '../../../models/student.model';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

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
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './student-dashboard.html',
  styleUrl: './student-dashboard.scss',
})
export class StudentDashboard implements OnInit, OnDestroy {
  currentUser: User | null = null;
  student: Student | null = null;
  attendanceRecords: AttendanceRecord[] = [];

  isLoading = true;

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private attendanceService: Attendance,
    private studentService: StudentService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadStudentDashboard();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get firstName(): string {
    return this.currentUser?.fullName?.trim().split(' ')[0] || 'Student';
  }

  get totalRecords(): number {
    return this.attendanceRecords.length;
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

  get latestRecord(): AttendanceRecord | null {
    return this.attendanceRecords[0] || null;
  }

  get latestStatusLabel(): string {
    return this.latestRecord?.status ? this.formatStatus(this.latestRecord.status) : 'No Record';
  }

  get recentRecords(): AttendanceRecord[] {
    return this.attendanceRecords.slice(0, 5);
  }

  get studentProgram(): string {
    return this.student?.program || 'Not set';
  }

  get studentSection(): string {
    return this.student?.section || 'Not set';
  }

  get studentYearLevel(): string {
    return this.student?.yearLevel || 'Not set';
  }

  loadStudentDashboard(): void {
    this.isLoading = true;

    const studentSub = this.studentService.getStudents().subscribe({
      next: (students: Student[]) => {
        this.student = this.findCurrentStudent(students);
        this.loadAttendanceRecords();
      },
      error: () => {
        this.student = null;
        this.loadAttendanceRecords();
      },
    });

    this.subscriptions.push(studentSub);
  }

  loadAttendanceRecords(): void {
    const attendanceSub = this.attendanceService.getAttendanceRecords().subscribe({
      next: (records: AttendanceRecord[]) => {
        this.attendanceRecords = records
          .filter((record) => this.isCurrentStudentRecord(record))
          .sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });

        this.isLoading = false;
      },
      error: () => {
        this.attendanceRecords = [];
        this.isLoading = false;
      },
    });

    this.subscriptions.push(attendanceSub);
  }

  goTo(route: string): void {
    this.router.navigate([route]);
  }

  formatStatus(status: string): string {
    if (!status) return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
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

  private countByStatus(status: AttendanceStatus): number {
    return this.attendanceRecords.filter(
      (record) => String(record.status || '').toLowerCase() === status,
    ).length;
  }
}
