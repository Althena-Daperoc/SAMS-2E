import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

import { Session } from '../../../core/services/session.service';
import { Attendance } from '../../../core/services/attendance.service';
import { StudentService } from '../../../core/services/student.service';
import { AuthService } from '../../../core/services/auth.service';
import { AttendanceRequestService } from '../../../core/services/attendance-request.service';

import { User } from '../../../models/user.model';
import { Student } from '../../../models/student.model';

interface AttendanceSession {
  id?: string;
  assignmentId?: string;
  assignmentCode?: string;
  facultyId?: string;
  facultyName?: string;
  subjectCode?: string;
  subjectName?: string;
  sectionCode?: string;
  program?: string;
  yearLevel?: string;
  schoolYear?: string;
  semester?: string;
  sessionCode?: string;
  qrToken?: string;
  qrData?: string;
  durationMinutes?: number;
  startTime?: string;
  endTime?: string;
  expiresAt?: string;
  status?: 'active' | 'closed' | string;
  isActive?: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-attendance-check',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance-check.html',
  styleUrl: './attendance-check.scss',
})
export class AttendanceCheck implements OnInit, OnDestroy {
  @ViewChild('scannerVideo') scannerVideo?: ElementRef<HTMLVideoElement>;

  currentUser: User | null = null;
  currentStudent: Student | null = null;

  sessions: AttendanceSession[] = [];
  students: Student[] = [];

  sessionCode = '';
  isLoading = true;
  isSubmitting = false;
  isScanning = false;
  scannerSupported = true;

  selectedSession: AttendanceSession | null = null;
  lastSubmittedSession: AttendanceSession | null = null;

  private subscriptions: Subscription[] = [];
  private mediaStream: MediaStream | null = null;
  private scannerInterval: any = null;

  constructor(
    private sessionService: Session,
    private attendanceService: Attendance,
    private studentService: StudentService,
    private authService: AuthService,
    private attendanceRequestService: AttendanceRequestService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.stopScanner();
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get activeSessions(): AttendanceSession[] {
    return this.sessions.filter((session) => this.isSessionCurrentlyValid(session, false));
  }

  get studentSectionLabel(): string {
    if (!this.currentStudent) return 'N/A';

    return `${this.currentStudent.program || 'Program'} • ${this.currentStudent.yearLevel || 'Year'} • ${
      this.currentStudent.section || 'Section'
    }`;
  }

  loadData(): void {
    this.isLoading = true;

    let loaded = 0;

    const done = () => {
      loaded += 1;

      if (loaded === 2) {
        this.resolveCurrentStudent();
        this.isLoading = false;
      }
    };

    this.subscriptions.push(
      this.sessionService.getSessions().subscribe({
        next: (data) => {
          this.sessions = data;
          done();
        },
        error: () => this.handleLoadError(),
      }),

      this.studentService.getStudents().subscribe({
        next: (data) => {
          this.students = data;
          done();
        },
        error: () => this.handleLoadError(),
      }),
    );
  }

  findSession(): void {
    const cleanCode = this.extractSessionCode(this.sessionCode);

    if (!cleanCode) {
      this.selectedSession = null;
      return;
    }

    const session = this.sessions.find((item) => {
      const sessionCode = (item.sessionCode || '').toUpperCase();
      const qrToken = (item.qrToken || '').toUpperCase();

      return sessionCode === cleanCode || qrToken === cleanCode;
    });

    this.selectedSession = session || null;
  }

  async startScanner(): Promise<void> {
    if (!('mediaDevices' in navigator) || !(window as any).BarcodeDetector) {
      this.scannerSupported = false;

      await Swal.fire({
        title: 'Camera Scanner Not Supported',
        text: 'Your browser does not support built-in QR scanning. Please use the session code instead.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });

      return;
    }

    try {
      this.isScanning = true;

      await new Promise((resolve) => setTimeout(resolve, 100));

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
        audio: false,
      });

      if (this.scannerVideo?.nativeElement) {
        this.scannerVideo.nativeElement.srcObject = this.mediaStream;
        await this.scannerVideo.nativeElement.play();
      }

      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['qr_code'],
      });

      this.scannerInterval = setInterval(async () => {
        if (!this.scannerVideo?.nativeElement) return;

        try {
          const codes = await barcodeDetector.detect(this.scannerVideo.nativeElement);

          if (codes.length > 0) {
            const scannedValue = codes[0].rawValue || '';

            this.sessionCode = this.extractSessionCode(scannedValue);
            this.findSession();
            this.stopScanner();

            await Swal.fire({
              title: 'QR Code Scanned',
              text: 'Session code detected. Please review the details before submitting.',
              icon: 'success',
              timer: 1300,
              showConfirmButton: false,
            });
          }
        } catch {
          // Keep scanner running quietly.
        }
      }, 700);
    } catch (error) {
      console.error('Camera scanner error:', error);
      this.stopScanner();

      await Swal.fire({
        title: 'Camera Access Failed',
        text: 'Please allow camera permission or use the session code manually.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  stopScanner(): void {
    this.isScanning = false;

    if (this.scannerInterval) {
      clearInterval(this.scannerInterval);
      this.scannerInterval = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.scannerVideo?.nativeElement) {
      this.scannerVideo.nativeElement.srcObject = null;
    }
  }

  async submitAttendance(): Promise<void> {
    this.findSession();

    if (!this.currentUser || this.currentUser.role !== 'student') {
      await Swal.fire({
        title: 'Student Account Required',
        text: 'Only students can submit attendance from this page.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    if (!this.currentStudent) {
      await Swal.fire({
        title: 'Student Record Not Found',
        text: 'Your login account is not connected to a student record. Please contact the administrator.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    if (!this.selectedSession?.id) {
      await Swal.fire({
        title: 'Invalid Session Code',
        text: 'No attendance session was found using the entered code.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const validation = this.validateSessionIntegrity(this.selectedSession);

    if (!validation.valid) {
      await Swal.fire({
        title: validation.title,
        text: validation.message,
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const alreadyRecorded = await this.attendanceService.hasAttendanceRecord(
      this.selectedSession.id,
      this.currentStudent.studentId,
    );

    if (alreadyRecorded) {
      await Swal.fire({
        title: 'Already Recorded',
        text: 'You have already submitted attendance for this session.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const sectionValidation = this.validateStudentSection(
      this.selectedSession,
      this.currentStudent,
    );

    if (!sectionValidation.allowed) {
      await this.submitIrregularRequest(
        this.selectedSession,
        this.currentStudent,
        sectionValidation.reason,
      );
      return;
    }

    await this.submitRegularAttendance(this.selectedSession, this.currentStudent);
  }

  clearCode(): void {
    this.sessionCode = '';
    this.selectedSession = null;
  }

  formatDateTime(value: string | undefined): string {
    if (!value) return 'N/A';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getTimeRemaining(session: AttendanceSession | null): string {
    if (!session) return 'N/A';

    const expiryValue = session.expiresAt || session.endTime;

    if (!expiryValue) return 'N/A';

    const expiresAt = new Date(expiryValue).getTime();
    const now = Date.now();
    const diff = expiresAt - now;

    if (Number.isNaN(expiresAt)) return 'N/A';
    if (diff <= 0) return 'Expired';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes <= 0) return `${seconds}s remaining`;

    return `${minutes}m ${seconds}s remaining`;
  }

  isSessionExpired(session: AttendanceSession | null): boolean {
    if (!session) return false;

    const expiryValue = session.expiresAt || session.endTime;

    if (!expiryValue) return false;

    const expiresAt = new Date(expiryValue).getTime();

    if (Number.isNaN(expiresAt)) return false;

    return Date.now() > expiresAt;
  }

  formatProgram(program: string | undefined): string {
    const labels: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return program ? labels[program] || program : 'N/A';
  }

  private async submitRegularAttendance(
    session: AttendanceSession,
    student: Student,
  ): Promise<void> {
    const result = await Swal.fire({
      title: 'Submit Attendance?',
      html: `
        <div style="text-align:left;line-height:1.7">
          <strong>Student:</strong> ${student.fullName}<br>
          <strong>Subject:</strong> ${session.subjectCode || ''} - ${session.subjectName || ''}<br>
          <strong>Section:</strong> ${session.sectionCode || 'N/A'}<br>
          <strong>Teacher:</strong> ${session.facultyName || 'N/A'}
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Submit Attendance',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    this.isSubmitting = true;

    try {
      const now = new Date();

      await this.attendanceService.recordAttendance({
        sessionId: session.id,
        sessionCode: session.sessionCode || '',
        assignmentId: session.assignmentId || '',

        studentId: student.studentId,
        studentDocId: student.id || '',
        studentName: student.fullName,

        facultyId: session.facultyId || '',
        facultyName: session.facultyName || '',

        subjectCode: session.subjectCode || '',
        subjectName: session.subjectName || '',

        sectionCode: session.sectionCode || '',
        program: session.program || student.program || '',
        yearLevel: session.yearLevel || student.yearLevel || '',

        studentProgram: student.program || '',
        studentYearLevel: student.yearLevel || '',
        studentSection: student.section || '',

        schoolYear: session.schoolYear || '',
        semester: session.semester || '',

        status: 'present',
        method: 'qr_or_session_code',
        remarks: `Submitted by regular student at ${now.toLocaleString()}`,

        validatedSessionStatus: session.status || '',
        validatedAt: now.toISOString(),
      });

      this.lastSubmittedSession = session;

      await Swal.fire({
        title: 'Attendance Submitted',
        text: 'Your attendance has been recorded successfully.',
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });

      this.sessionCode = '';
      this.selectedSession = null;
    } catch (error: any) {
      const duplicateMessage =
        String(error?.message || '')
          .toLowerCase()
          .includes('already recorded') ||
        String(error || '')
          .toLowerCase()
          .includes('already recorded');

      await Swal.fire({
        title: duplicateMessage ? 'Already Recorded' : 'Submission Failed',
        text: duplicateMessage
          ? 'You have already submitted attendance for this session.'
          : 'Unable to submit attendance. Please try again or contact your teacher.',
        icon: duplicateMessage ? 'info' : 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSubmitting = false;
    }
  }

  private async submitIrregularRequest(
    session: AttendanceSession,
    student: Student,
    validationReason = 'Student does not match the assigned class section.',
  ): Promise<void> {
    const pendingExists = await this.attendanceRequestService.hasPendingRequest(
      session.id || '',
      student.studentId,
    );

    if (pendingExists) {
      await Swal.fire({
        title: 'Request Already Pending',
        text: 'You already have a pending attendance request for this session.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Attendance Request Required',
      html: `
        <div style="text-align:left;line-height:1.7">
          <strong>Your Program:</strong> ${this.formatProgram(student.program)}<br>
          <strong>Your Year Level:</strong> ${student.yearLevel || 'N/A'}<br>
          <strong>Your Section:</strong> ${student.section || 'N/A'}<br><br>

          <strong>Session Program:</strong> ${this.formatProgram(session.program)}<br>
          <strong>Session Year Level:</strong> ${session.yearLevel || 'N/A'}<br>
          <strong>Session Section:</strong> ${session.sectionCode || 'N/A'}<br><br>

          ${validationReason}<br><br>
          Your attendance will be sent to the teacher for approval.
        </div>
      `,
      input: 'textarea',
      inputLabel: 'Reason for attendance request',
      inputPlaceholder: 'Example: I am a sit-in student / irregular student for this subject.',
      inputValidator: (value) => {
        if (!value || !value.trim()) return 'Please enter your reason for this request.';
        return null;
      },
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Send Request',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    this.isSubmitting = true;

    try {
      await this.attendanceRequestService.createRequest({
        sessionId: session.id || '',
        sessionCode: session.sessionCode || '',
        assignmentId: session.assignmentId || '',

        studentId: student.studentId,
        studentDocId: student.id || '',
        studentName: student.fullName,
        studentProgram: student.program || '',
        studentYearLevel: student.yearLevel || '',
        studentSection: student.section || '',

        facultyId: session.facultyId || '',
        facultyName: session.facultyName || '',

        subjectCode: session.subjectCode || '',
        subjectName: session.subjectName || '',
        sectionCode: session.sectionCode || '',
        program: session.program || '',
        yearLevel: session.yearLevel || '',
        schoolYear: session.schoolYear || '',
        semester: session.semester || '',

        reason: result.value,
        validationReason,
        method: 'qr_or_session_code_request',
        requestType: 'irregular_or_sit_in',
      });

      await Swal.fire({
        title: 'Request Sent',
        text: 'Your attendance request was sent to the teacher for approval.',
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });

      this.sessionCode = '';
      this.selectedSession = null;
    } catch {
      await Swal.fire({
        title: 'Request Failed',
        text: 'Unable to send your attendance request. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSubmitting = false;
    }
  }

  private resolveCurrentStudent(): void {
    if (!this.currentUser) {
      this.currentStudent = null;
      return;
    }

    this.currentStudent =
      this.students.find(
        (student) =>
          this.normalize(student.studentId) === this.normalize(this.currentUser?.username),
      ) ||
      this.students.find(
        (student) =>
          student.email &&
          this.currentUser?.email &&
          this.normalize(student.email) === this.normalize(this.currentUser.email),
      ) ||
      null;
  }

  private validateSessionIntegrity(session: AttendanceSession): {
    valid: boolean;
    title: string;
    message: string;
  } {
    const status = this.normalize(session.status);

    if (status !== 'active') {
      return {
        valid: false,
        title: 'Session Closed',
        message: 'This attendance session is no longer active.',
      };
    }

    if (session.isActive === false) {
      return {
        valid: false,
        title: 'Session Inactive',
        message: 'This attendance session has been marked as inactive.',
      };
    }

    const now = Date.now();

    if (session.startTime) {
      const startTime = new Date(session.startTime).getTime();

      if (!Number.isNaN(startTime) && now < startTime) {
        return {
          valid: false,
          title: 'Session Not Started',
          message: 'This attendance session has not started yet.',
        };
      }
    }

    const expiryValue = session.expiresAt || session.endTime;

    if (expiryValue) {
      const endTime = new Date(expiryValue).getTime();

      if (!Number.isNaN(endTime) && now > endTime) {
        return {
          valid: false,
          title: 'Session Expired',
          message: 'The attendance period for this session has already ended.',
        };
      }
    }

    return {
      valid: true,
      title: '',
      message: '',
    };
  }

  private validateStudentSection(
    session: AttendanceSession,
    student: Student,
  ): { allowed: boolean; reason: string } {
    const sessionProgram = this.normalize(session.program);
    const studentProgram = this.normalize(student.program);

    const sessionYearLevel = this.normalize(session.yearLevel);
    const studentYearLevel = this.normalize(student.yearLevel);

    const sessionSection = this.normalize(session.sectionCode);
    const studentSection = this.normalize(student.section);

    if (sessionProgram && studentProgram && sessionProgram !== studentProgram) {
      return {
        allowed: false,
        reason: 'Your program does not match the assigned session program.',
      };
    }

    if (sessionYearLevel && studentYearLevel && sessionYearLevel !== studentYearLevel) {
      return {
        allowed: false,
        reason: 'Your year level does not match the assigned session year level.',
      };
    }

    if (sessionSection && studentSection && sessionSection !== studentSection) {
      return {
        allowed: false,
        reason: 'Your section does not match the assigned session section.',
      };
    }

    return {
      allowed: true,
      reason: '',
    };
  }

  private isSessionCurrentlyValid(session: AttendanceSession, strict = true): boolean {
    const statusValid = this.normalize(session.status) === 'active';
    const activeValid = session.isActive !== false;
    const notExpired = !this.isSessionExpired(session);

    if (!strict) return statusValid && activeValid && notExpired;

    return this.validateSessionIntegrity(session).valid;
  }

  private extractSessionCode(rawValue: string): string {
    const value = rawValue.trim();

    if (!value) return '';

    try {
      const parsed = JSON.parse(value);

      if (parsed?.sessionCode) return String(parsed.sessionCode).trim().toUpperCase();
      if (parsed?.qrToken) return String(parsed.qrToken).trim().toUpperCase();
    } catch {
      // normal manual input
    }

    return value.toUpperCase();
  }

  private handleLoadError(): void {
    console.warn('Some attendance data could not be loaded yet.');
    this.isLoading = false;
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}
