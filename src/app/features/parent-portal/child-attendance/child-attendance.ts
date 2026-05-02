import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, combineLatest } from 'rxjs';

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
  attendanceHistory: any[] = [];
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
      this.attendanceHistory = [];
      return;
    }

    this.attendanceSubscription = this.attendanceService
      .getAttendanceByStudentDocId(this.selectedStudentId)
      .subscribe({
        next: (records) => {
          this.attendanceHistory = records;
        },
        error: (error) => {
          console.error('Failed to load attendance history:', error);
          this.attendanceHistory = [];
        },
      });
  }

  get selectedStudent(): Student | undefined {
    return this.linkedStudents.find((student) => student.id === this.selectedStudentId);
  }

  get childInfo() {
    return {
      fullName: this.selectedStudent?.fullName ?? 'No linked child',
      studentId: this.selectedStudent?.studentId ?? 'N/A',
      program: this.selectedStudent?.program ?? 'N/A',
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
      present,
      late,
      absent,
      excused,
      attendanceRate: total === 0 ? 0 : Math.round(((present + late) / total) * 100),
    };
  }

  getStatusClass(status: string): string {
    return String(status).toLowerCase();
  }

  formatStatus(status: string): string {
    const cleanStatus = String(status || 'No Record').toLowerCase();
    return cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1);
  }

  private countStatus(status: string): number {
    return this.attendanceHistory.filter((record) => String(record.status).toLowerCase() === status)
      .length;
  }
}
