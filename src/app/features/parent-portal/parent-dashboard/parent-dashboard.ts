import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, combineLatest } from 'rxjs';

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
  attendanceRecords: any[] = [];
  isLoading = true;

  private studentSubscription?: Subscription;
  private attendanceSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private studentService: StudentService,
    private attendanceService: Attendance,
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.parentName = currentUser?.fullName ?? 'Parent';

    const linkedStudentIds = currentUser?.linkedStudentIds ?? [];

    if (!linkedStudentIds.length) {
      this.isLoading = false;
      return;
    }

    const studentStreams = linkedStudentIds.map((id) => this.studentService.getStudentById(id));

    this.studentSubscription = combineLatest(studentStreams).subscribe({
      next: (students) => {
        this.linkedStudents = students.filter(Boolean) as Student[];

        if (!this.selectedStudentId && this.linkedStudents.length) {
          this.selectedStudentId = this.linkedStudents[0].id;
          this.loadAttendance();
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load linked students:', error);
        this.isLoading = false;
      },
    });
  }

  ngOnDestroy(): void {
    this.studentSubscription?.unsubscribe();
    this.attendanceSubscription?.unsubscribe();
  }

  onStudentChange(): void {
    this.loadAttendance();
  }

  loadAttendance(): void {
    this.attendanceSubscription?.unsubscribe();

    if (!this.selectedStudentId) {
      this.attendanceRecords = [];
      return;
    }

    this.attendanceSubscription = this.attendanceService
      .getAttendanceByStudentDocId(this.selectedStudentId)
      .subscribe({
        next: (records) => {
          this.attendanceRecords = records;
        },
        error: (error) => {
          console.error('Failed to load attendance:', error);
          this.attendanceRecords = [];
        },
      });
  }

  get selectedStudent(): Student | undefined {
    return this.linkedStudents.find((student) => student.id === this.selectedStudentId);
  }

  get mainChild() {
    return {
      name: this.selectedStudent?.fullName ?? 'No linked child',
      studentId: this.selectedStudent?.studentId ?? 'N/A',
      program: this.selectedStudent?.program ?? 'N/A',
      yearLevel: this.selectedStudent?.yearLevel ?? 'N/A',
      section: this.selectedStudent?.section ?? 'N/A',
      attendanceRate: this.attendanceRate,
      present: this.presentCount,
      late: this.lateCount,
      absent: this.absentCount,
      excused: this.excusedCount,
      latestStatus: this.latestStatus,
      latestSubject: this.latestRecord?.subject ?? 'No recent record',
      latestDate: this.latestRecord?.date ?? 'No date available',
    };
  }

  get latestRecord(): any | undefined {
    return this.attendanceRecords[0];
  }

  get latestStatus(): string {
    return this.latestRecord?.status ? this.formatStatus(this.latestRecord.status) : 'No Record';
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
    return this.attendanceRecords.length;
  }

  get attendanceRate(): number {
    if (!this.totalRecords) {
      return 0;
    }

    return Math.round(((this.presentCount + this.lateCount) / this.totalRecords) * 100);
  }

  get totalWarnings(): number {
    return this.absentCount + this.lateCount;
  }

  private countStatus(status: string): number {
    return this.attendanceRecords.filter((record) => String(record.status).toLowerCase() === status)
      .length;
  }

  private formatStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }
}
