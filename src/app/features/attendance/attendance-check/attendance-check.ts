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
import { SessionAccessService } from '../../../core/services/session-access.service';

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
  lateAfterMinutes?: number;
  lateThresholdMinutes?: number;
  lateStartsAt?: any;

  startTime?: any;
  endTime?: any;
  expiresAt?: any;
  autoCloseAt?: any;

  status?: 'active' | 'closed' | string;
  isActive?: boolean;

  createdBy?: string;
  createdByName?: string;
  createdAt?: any;
  updatedAt?: any;

  antiCheatEnabled?: boolean;
  accessSeed?: string;
  rotationSeconds?: number;
  qrRotationSeconds?: number;
}

interface AttendanceStatusPreview {
  status: 'present' | 'late';
  lateMinutes: number;
  lateAfterMinutes: number;
  lateStartsAt: string;
  submittedAt: string;
}

type AttendanceEntryMethod = 'qr_scan' | 'manual_code';

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
  private scannerProcessing = false;

  constructor(
    private sessionService: Session,
    private attendanceService: Attendance,
    private studentService: StudentService,
    private authService: AuthService,
    private attendanceRequestService: AttendanceRequestService,
    private sessionAccessService: SessionAccessService,
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

    return `${this.currentStudent.program || 'Program'} • ${
      this.currentStudent.yearLevel || 'Year'
    } • ${this.currentStudent.section || 'Section'}`;
  }

  loadData(): void {
    this.isLoading = true;

    let loaded = 0;

    const done = () => {
      loaded += 1;

      if (loaded === 2) {
        this.resolveCurrentStudent();
        this.isLoading = false;
        this.findSession();
      }
    };

    this.subscriptions.push(
      this.sessionService.getSessions().subscribe({
        next: (data) => {
          this.sessions = data || [];
          done();
        },
        error: () => this.handleLoadError(),
      }),

      this.studentService.getStudents().subscribe({
        next: (data) => {
          this.students = data || [];
          done();
        },
        error: () => this.handleLoadError(),
      }),
    );
  }

  findSession(): void {
    const rawValue = String(this.sessionCode || '').trim();

    if (!rawValue) {
      this.selectedSession = null;
      return;
    }

    this.selectedSession = this.findMatchingSession(rawValue);
  }

  async startScanner(): Promise<void> {
    const hasCameraApi =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    if (!hasCameraApi) {
      this.scannerSupported = false;

      await Swal.fire({
        title: 'Camera Not Available',
        text: 'This browser or device does not allow camera access here. Please use Method 2 and enter the session code manually.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });

      return;
    }

    if (this.isSubmitting || this.scannerProcessing || this.isScanning) {
      return;
    }

    try {
      this.isScanning = true;
      this.scannerProcessing = false;
      this.scannerSupported = true;

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

      const BarcodeDetectorClass = (window as any).BarcodeDetector;

      if (!BarcodeDetectorClass) {
        this.scannerSupported = false;

        await Swal.fire({
          title: 'QR Scanner Not Supported',
          text: 'Camera permission is working, but this browser cannot read QR codes using the built-in scanner. Please use Method 2 and enter the session code manually.',
          icon: 'info',
          confirmButtonColor: '#4f46e5',
        });

        this.stopScanner();
        return;
      }

      const barcodeDetector = new BarcodeDetectorClass({
        formats: ['qr_code'],
      });

      this.scannerInterval = setInterval(async () => {
        if (!this.scannerVideo?.nativeElement || this.scannerProcessing || this.isSubmitting) {
          return;
        }

        try {
          const codes = await barcodeDetector.detect(this.scannerVideo.nativeElement);

          if (!codes || codes.length === 0) {
            return;
          }

          const scannedValue = String(codes[0].rawValue || '').trim();

          if (!scannedValue) {
            return;
          }

          this.scannerProcessing = true;

          const matchedSession = this.findMatchingSession(scannedValue);

          if (!matchedSession) {
            this.stopScanner();

            await Swal.fire({
              title: 'Invalid or Expired QR',
              text: 'No active attendance session matched the scanned QR. Please scan the current QR shown by your teacher.',
              icon: 'warning',
              confirmButtonColor: '#4f46e5',
            });

            return;
          }

          this.selectedSession = matchedSession;
          this.stopScanner();

          await this.processAttendanceSubmission(scannedValue, 'qr_scan');
        } catch (error) {
          console.warn('QR scan read failed:', error);
        } finally {
          this.scannerProcessing = false;
        }
      }, 700);
    } catch (error: any) {
      console.error('Camera scanner error:', error);
      this.stopScanner();

      const errorName = String(error?.name || '').toLowerCase();

      await Swal.fire({
        title: errorName.includes('notallowed')
          ? 'Camera Permission Denied'
          : 'Camera Access Failed',
        text: errorName.includes('notallowed')
          ? 'Camera permission was denied. Please allow camera access in your browser site settings, or use Method 2 and enter the session code manually.'
          : 'The camera could not be opened. Please try again or use Method 2 and enter the session code manually.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  stopScanner(): void {
    this.isScanning = false;
    this.scannerProcessing = false;

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
    await this.processAttendanceSubmission(this.sessionCode, 'manual_code');
  }

  clearCode(): void {
    this.sessionCode = '';
    this.selectedSession = null;
  }

  formatDateTime(value: any): string {
    const date = this.parseDate(value);

    if (!date) return 'N/A';

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

    const endTime = this.getSessionEndTime(session);

    if (!endTime) return 'N/A';

    const diff = endTime.getTime() - Date.now();

    if (diff <= 0) return 'Expired';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes <= 0) return `${seconds}s remaining`;

    return `${minutes}m ${seconds}s remaining`;
  }

  isSessionExpired(session: AttendanceSession | null): boolean {
    if (!session) return false;

    const endTime = this.getSessionEndTime(session);

    if (!endTime) return false;

    return Date.now() > endTime.getTime();
  }

  formatProgram(program: string | undefined): string {
    const labels: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return program ? labels[program] || program : 'N/A';
  }

  getPreviewSessionCode(session: AttendanceSession | null): string {
    if (!session) return '';

    if (this.sessionAccessService.isAntiCheatEnabled(session)) {
      return this.sessionAccessService.getLiveSessionCode(session, new Date());
    }

    return session.sessionCode || '';
  }

  getPreviewStatus(session: AttendanceSession | null): string {
    if (!session) return '';

    const preview = this.getAttendancePreview(session, new Date());

    if (preview.status === 'late') {
      return `Late (${preview.lateMinutes} minute${preview.lateMinutes > 1 ? 's' : ''})`;
    }

    return 'Present';
  }

  private async processAttendanceSubmission(
    rawInput: string,
    entryMethod: AttendanceEntryMethod,
  ): Promise<void> {
    const rawCode = String(rawInput || '').trim();
    const isQrScan = entryMethod === 'qr_scan';

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

    if (!rawCode) {
      await Swal.fire({
        title: isQrScan ? 'No QR Detected' : 'Session Code Required',
        text: isQrScan
          ? 'Please scan the QR code shown by your teacher.'
          : 'Please enter the current session code shown by your teacher.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const session = this.findMatchingSession(rawCode);
    this.selectedSession = session;

    if (!session?.id) {
      await Swal.fire({
        title: isQrScan ? 'Invalid or Expired QR' : 'Invalid or Expired Code',
        text: isQrScan
          ? 'No active attendance session matched the scanned QR. Please scan the current QR shown by your teacher.'
          : 'No active attendance session matched the entered code. The code may have already rotated, so please enter the current code shown by your teacher.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const validation = this.validateSessionIntegrity(session);

    if (!validation.valid) {
      await Swal.fire({
        title: validation.title,
        text: validation.message,
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const validationTime = new Date();

    if (!this.sessionAccessService.matchesLiveAccess(session, rawCode, validationTime)) {
      await Swal.fire({
        title: isQrScan ? 'QR Already Changed' : 'Code Already Changed',
        text: isQrScan
          ? 'This QR is no longer valid. Please scan the current QR shown by your teacher.'
          : 'This session code is no longer valid. Please enter the current code shown by your teacher.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });

      this.selectedSession = null;
      return;
    }

    const alreadyRecorded = await this.attendanceService.hasAttendanceRecord(
      session.id,
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

    const sectionValidation = this.validateStudentSection(session, this.currentStudent);

    if (!sectionValidation.allowed) {
      await this.submitIrregularRequest(
        session,
        this.currentStudent,
        sectionValidation.reason,
        rawCode,
        entryMethod,
      );
      return;
    }

    await this.submitRegularAttendance(session, this.currentStudent, rawCode, entryMethod);
  }

  private findMatchingSession(rawValue: string): AttendanceSession | null {
    const cleanValue = String(rawValue || '').trim();

    if (!cleanValue) return null;

    const now = new Date();

    const validSessions = this.sessions.filter((session) =>
      this.isSessionCurrentlyValid(session, false),
    );

    const dynamicMatch = validSessions.find((session) =>
      this.sessionAccessService.matchesLiveAccess(session, cleanValue, now),
    );

    if (dynamicMatch) return dynamicMatch;

    const readableCode = this.extractSessionCode(cleanValue);

    const legacyMatch = validSessions.find((session) => {
      const sessionCode = String(session.sessionCode || '')
        .trim()
        .toUpperCase();
      const qrToken = String(session.qrToken || '')
        .trim()
        .toUpperCase();

      return sessionCode === readableCode || qrToken === readableCode;
    });

    return legacyMatch || null;
  }

  private async submitRegularAttendance(
    session: AttendanceSession,
    student: Student,
    rawInput: string,
    entryMethod: AttendanceEntryMethod,
  ): Promise<void> {
    const isQrScan = entryMethod === 'qr_scan';
    const preview = this.getAttendancePreview(session, new Date());

    if (!isQrScan) {
      const result = await Swal.fire({
        title: 'Submit Attendance?',
        html: `
          <div style="text-align:left;line-height:1.7">
            <strong>Method:</strong> Manual Session Code<br>
            <strong>Student:</strong> ${student.fullName}<br>
            <strong>Subject:</strong> ${session.subjectCode || ''} - ${session.subjectName || ''}<br>
            <strong>Section:</strong> ${session.sectionCode || 'N/A'}<br>
            <strong>Teacher:</strong> ${session.facultyName || 'N/A'}<br>
            <strong>Expected Status:</strong> ${
              preview.status === 'late'
                ? `Late (${preview.lateMinutes} minute${preview.lateMinutes > 1 ? 's' : ''})`
                : 'Present'
            }
          </div>
        `,
        icon: preview.status === 'late' ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: 'Submit Attendance',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#4f46e5',
      });

      if (!result.isConfirmed) return;
    }

    this.isSubmitting = true;

    try {
      const confirmedAt = new Date();

      if (!this.sessionAccessService.matchesLiveAccess(session, rawInput, confirmedAt)) {
        await Swal.fire({
          title: isQrScan ? 'QR Already Changed' : 'Code Already Changed',
          text: isQrScan
            ? 'The QR changed while submitting. Please scan the current QR again.'
            : 'The session code changed while you were confirming. Please enter the current code again.',
          icon: 'warning',
          confirmButtonColor: '#4f46e5',
        });

        this.selectedSession = null;
        return;
      }

      const submittedAccessCode = this.extractSessionCode(rawInput);

      await this.attendanceService.recordAttendance({
        sessionId: session.id,
        sessionCode: submittedAccessCode || session.sessionCode || '',
        baseSessionCode: session.sessionCode || '',
        submittedAccessCode,
        assignmentId: session.assignmentId || '',
        assignmentCode: session.assignmentCode || '',

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

        submittedAt: confirmedAt.toISOString(),
        sessionStartTime: this.getSessionStartTime(session, confirmedAt)?.toISOString() || '',
        sessionEndTime: this.getSessionEndTime(session)?.toISOString() || '',
        lateAfterMinutes: this.getLateAfterMinutes(session),
        lateThresholdMinutes: this.getLateAfterMinutes(session),
        lateStartsAt: this.getLateStartsAt(session, confirmedAt)?.toISOString() || '',

        method: this.getRecordMethod(session, entryMethod),
        remarks: isQrScan
          ? `Auto-submitted through QR scan at ${confirmedAt.toLocaleString()}`
          : `Submitted through manual session code at ${confirmedAt.toLocaleString()}`,

        antiCheatValidated: Boolean(session.antiCheatEnabled),
        validatedSessionStatus: session.status || '',
        validatedAt: confirmedAt.toISOString(),
      });

      this.lastSubmittedSession = session;

      await Swal.fire({
        title: isQrScan ? 'QR Attendance Submitted' : 'Attendance Submitted',
        text: isQrScan
          ? 'Your attendance was automatically submitted after scanning the QR code.'
          : 'Your manual session-code attendance has been submitted.',
        icon: 'success',
        timer: isQrScan ? 1800 : undefined,
        showConfirmButton: !isQrScan,
        confirmButtonColor: '#4f46e5',
      });

      if (!isQrScan) {
        this.sessionCode = '';
      }

      this.selectedSession = null;
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();

      const duplicateMessage = message.includes('already recorded');
      const expiredMessage = message.includes('expired');
      const closedMessage = message.includes('closed');

      await Swal.fire({
        title: duplicateMessage
          ? 'Already Recorded'
          : expiredMessage || closedMessage
            ? 'Session Not Available'
            : 'Submission Failed',
        text: duplicateMessage
          ? 'You have already submitted attendance for this session.'
          : expiredMessage || closedMessage
            ? 'This session is already closed or expired.'
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
    validationReason: string,
    rawInput: string,
    entryMethod: AttendanceEntryMethod,
  ): Promise<void> {
    const isQrScan = entryMethod === 'qr_scan';

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

    this.isSubmitting = true;

    try {
      const confirmedAt = new Date();

      if (!this.sessionAccessService.matchesLiveAccess(session, rawInput, confirmedAt)) {
        await Swal.fire({
          title: isQrScan ? 'QR Already Changed' : 'Code Already Changed',
          text: isQrScan
            ? 'The QR changed while sending the request. Please scan the current QR again.'
            : 'The session code changed while sending the request. Please enter the current code again.',
          icon: 'warning',
          confirmButtonColor: '#4f46e5',
        });

        this.selectedSession = null;
        return;
      }

      const finalPreview = this.getAttendancePreview(session, confirmedAt);
      const submittedAccessCode = this.extractSessionCode(rawInput);

      await this.attendanceRequestService.createRequest({
        sessionId: session.id || '',
        sessionCode: submittedAccessCode || session.sessionCode || '',
        baseSessionCode: session.sessionCode || '',
        submittedAccessCode,
        assignmentId: session.assignmentId || '',
        assignmentCode: session.assignmentCode || '',

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

        suggestedStatus: finalPreview.status,
        lateMinutes: finalPreview.lateMinutes,
        lateAfterMinutes: finalPreview.lateAfterMinutes,
        lateThresholdMinutes: finalPreview.lateAfterMinutes,
        lateStartsAt: finalPreview.lateStartsAt,
        submittedAt: finalPreview.submittedAt,

        reason:
          'System-generated request: student is not officially matched to the selected class section.',
        validationReason,
        method: this.getRequestMethod(session, entryMethod),
        requestType: 'irregular_or_sit_in',
        antiCheatValidated: Boolean(session.antiCheatEnabled),
      });

      await Swal.fire({
        title: 'Attendance Request Sent',
        text: 'You are not officially matched to this class section, so your attendance was sent to the teacher for approval.',
        icon: 'success',
        timer: isQrScan ? 1800 : undefined,
        showConfirmButton: !isQrScan,
        confirmButtonColor: '#4f46e5',
      });

      if (!isQrScan) {
        this.sessionCode = '';
      }

      this.selectedSession = null;
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();

      await Swal.fire({
        title: message.includes('pending') ? 'Request Already Pending' : 'Request Failed',
        text: message.includes('pending')
          ? 'You already have a pending attendance request for this session.'
          : 'Unable to send your attendance request. Please try again.',
        icon: message.includes('pending') ? 'info' : 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSubmitting = false;
    }
  }

  private getRecordMethod(session: AttendanceSession, entryMethod: AttendanceEntryMethod): string {
    const rotating = Boolean(session.antiCheatEnabled);

    if (entryMethod === 'qr_scan') {
      return rotating ? 'rotating_qr_scan_auto' : 'qr_scan_auto';
    }

    return rotating ? 'rotating_session_code_manual' : 'session_code_manual';
  }

  private getRequestMethod(session: AttendanceSession, entryMethod: AttendanceEntryMethod): string {
    const rotating = Boolean(session.antiCheatEnabled);

    if (entryMethod === 'qr_scan') {
      return rotating ? 'rotating_qr_scan_request' : 'qr_scan_request';
    }

    return rotating ? 'rotating_session_code_manual_request' : 'session_code_manual_request';
  }

  private getAttendancePreview(
    session: AttendanceSession,
    submittedAtDate: Date,
  ): AttendanceStatusPreview {
    const submittedAt = submittedAtDate.toISOString();
    const lateAfterMinutes = this.getLateAfterMinutes(session);
    const lateStartsAtDate = this.getLateStartsAt(session, submittedAtDate);

    if (!lateStartsAtDate || submittedAtDate.getTime() < lateStartsAtDate.getTime()) {
      return {
        status: 'present',
        lateMinutes: 0,
        lateAfterMinutes,
        lateStartsAt: lateStartsAtDate ? lateStartsAtDate.toISOString() : '',
        submittedAt,
      };
    }

    const lateMilliseconds = submittedAtDate.getTime() - lateStartsAtDate.getTime();
    const lateMinutes = Math.max(1, Math.ceil(lateMilliseconds / 60000));

    return {
      status: 'late',
      lateMinutes,
      lateAfterMinutes,
      lateStartsAt: lateStartsAtDate.toISOString(),
      submittedAt,
    };
  }

  private getLateAfterMinutes(session: AttendanceSession): number {
    const value = Number(session?.lateAfterMinutes || session?.lateThresholdMinutes || 1);

    if (!Number.isFinite(value) || value <= 0) return 1;

    return Math.floor(value);
  }

  private getLateStartsAt(session: AttendanceSession, fallbackDate = new Date()): Date | null {
    const directLateDate = this.parseDate(session.lateStartsAt);

    if (directLateDate) return directLateDate;

    const startTime = this.getSessionStartTime(session, fallbackDate);

    if (!startTime) return null;

    return new Date(startTime.getTime() + this.getLateAfterMinutes(session) * 60 * 1000);
  }

  private getSessionStartTime(session: AttendanceSession, fallbackDate = new Date()): Date | null {
    const directStart =
      this.parseDate(session.startTime) ||
      this.parseDate(session.createdAt) ||
      this.parseDate((session as any).qrTokenUpdatedAt) ||
      this.parseDate((session as any).generatedAt);

    if (directStart) return directStart;

    const endTime = this.getSessionEndTime(session);
    const durationMinutes = Number(session.durationMinutes || 0);

    if (endTime && Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return new Date(endTime.getTime() - durationMinutes * 60 * 1000);
    }

    return fallbackDate;
  }

  private getSessionEndTime(session: AttendanceSession): Date | null {
    return (
      this.parseDate(session.autoCloseAt) ||
      this.parseDate(session.expiresAt) ||
      this.parseDate(session.endTime)
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
    const startTime = this.getSessionStartTime(session);
    const endTime = this.getSessionEndTime(session);

    if (startTime && now < startTime.getTime()) {
      return {
        valid: false,
        title: 'Session Not Started',
        message: 'This attendance session has not started yet.',
      };
    }

    if (endTime && now > endTime.getTime()) {
      return {
        valid: false,
        title: 'Session Expired',
        message: 'The attendance period for this session has already ended.',
      };
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
    const sessionProgram = this.normalizeProgram(session.program);
    const studentProgram = this.normalizeProgram(student.program);

    const sessionYearLevel = this.normalizeYearLevel(session.yearLevel);
    const studentYearLevel = this.normalizeYearLevel(student.yearLevel);

    const sessionSectionRaw = this.normalizeSection(session.sectionCode);
    const studentSectionRaw = this.normalizeSection(student.section);

    const sessionSection = sessionSectionRaw.replace(/[^a-z0-9]/g, '');
    const studentSection = studentSectionRaw.replace(/[^a-z0-9]/g, '');

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

    if (sessionSection && studentSection) {
      const match =
        sessionSection === studentSection ||
        sessionSection.includes(studentSection) ||
        studentSection.includes(sessionSection);

      if (!match) {
        return {
          allowed: false,
          reason: 'Your section does not match the assigned session section.',
        };
      }
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
    return this.sessionAccessService.extractReadableCode(rawValue);
  }

  private handleLoadError(): void {
    console.warn('Some attendance data could not be loaded yet.');
    this.isLoading = false;
  }

  private normalizeProgram(value: any): string {
    const cleaned = this.normalize(value).replace(/[\s-]/g, '');

    const programMap: Record<string, string> = {
      it: 'it',
      informationtechnology: 'it',
      bsit: 'it',
      tcm: 'tcm',
      technologycommunicationmanagement: 'tcm',
      emt: 'emt',
      electromechanicaltechnology: 'emt',
      electro_mechanicaltechnology: 'emt',
      electromechanical: 'emt',
    };

    return programMap[cleaned] || cleaned;
  }

  private normalizeYearLevel(value: any): string {
    return this.normalize(value)
      .replace(/\s+/g, '')
      .replace('year', '')
      .replace('yr', '')
      .replace('st', '')
      .replace('nd', '')
      .replace('rd', '')
      .replace('th', '');
  }

  private normalizeSection(value: any): string {
    return this.normalize(value)
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace(/^it/, '')
      .replace(/^bsit/, '')
      .replace(/^tcm/, '')
      .replace(/^emt/, '');
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}
