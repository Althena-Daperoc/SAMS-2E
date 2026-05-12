import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

import { AssignmentService } from '../../../core/services/assignment.service';
import { Session } from '../../../core/services/session.service';
import { AuthService } from '../../../core/services/auth.service';
import { SessionAccessService } from '../../../core/services/session-access.service';

import { Assignment } from '../../../models/assignment.model';
import { User } from '../../../models/user.model';

type SessionDuration = 15 | 30 | 45 | 60 | 90 | 120;
type LateAfterMinutes = 1 | 3 | 5 | 10 | 15 | 20 | 30 | 45 | 60;
type RotationSeconds = 10 | 15 | 20 | 30 | 45 | 60 | 90 | 120;

interface AttendanceSession {
  id?: string;

  assignmentId: string;
  assignmentCode: string;

  facultyId: string;
  facultyName: string;

  subjectCode: string;
  subjectName: string;

  sectionCode: string;
  program: string;
  yearLevel: string;
  schoolYear: string;
  semester: string;

  sessionCode: string;
  qrToken: string;
  qrData: string;

  durationMinutes: SessionDuration;
  lateAfterMinutes: LateAfterMinutes;
  lateThresholdMinutes: LateAfterMinutes;
  rotationSeconds: RotationSeconds;
  qrRotationSeconds: RotationSeconds;

  startTime: string;
  expiresAt: string;
  autoCloseAt: string;
  lateStartsAt: string;

  status: 'active' | 'closed';
  isActive: boolean;

  createdBy: string;
  createdByName: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;

  antiCheatEnabled: boolean;
  autoAbsentEnabled: boolean;
  accessSeed: string;
  qrTokenUpdatedAt: string;
  mode: 'live';
}

@Component({
  selector: 'app-create-session',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-session.html',
  styleUrl: './create-session.scss',
})
export class CreateSession implements OnInit, OnDestroy {
  assignments: Assignment[] = [];
  sessions: any[] = [];
  currentUser: User | null = null;

  selectedAssignmentId = '';
  durationMinutes: SessionDuration = 30;
  lateAfterMinutes: LateAfterMinutes = 1;
  rotationSeconds: RotationSeconds = 30;
  searchTerm = '';

  isLoading = true;
  isCreating = false;
  isClosing = false;
  isQrFullscreen = false;

  currentDateTime = new Date();

  readonly durationOptions: { value: SessionDuration; label: string }[] = [
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 45, label: '45 minutes' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1 hour 30 minutes' },
    { value: 120, label: '2 hours' },
  ];

  readonly lateOptions: { value: LateAfterMinutes; label: string }[] = [
    { value: 1, label: 'After 1 minute' },
    { value: 3, label: 'After 3 minutes' },
    { value: 5, label: 'After 5 minutes' },
    { value: 10, label: 'After 10 minutes' },
    { value: 15, label: 'After 15 minutes' },
    { value: 20, label: 'After 20 minutes' },
    { value: 30, label: 'After 30 minutes' },
    { value: 45, label: 'After 45 minutes' },
    { value: 60, label: 'After 1 hour' },
  ];

  readonly rotationOptions: { value: RotationSeconds; label: string; hint: string }[] = [
    { value: 10, label: 'Every 10 seconds', hint: 'Most secure' },
    { value: 15, label: 'Every 15 seconds', hint: 'High security' },
    { value: 20, label: 'Every 20 seconds', hint: 'Balanced' },
    { value: 30, label: 'Every 30 seconds', hint: 'Recommended' },
    { value: 45, label: 'Every 45 seconds', hint: 'Moderate' },
    { value: 60, label: 'Every 1 minute', hint: 'Less strict' },
    { value: 90, label: 'Every 1 minute 30 seconds', hint: 'Loose' },
    { value: 120, label: 'Every 2 minutes', hint: 'Least strict' },
  ];

  private assignmentsLoaded = false;
  private sessionsLoaded = false;
  private subscriptions: Subscription[] = [];
  private clockTimer?: ReturnType<typeof setInterval>;
  private autoClosingSessionIds = new Set<string>();

  constructor(
    private assignmentService: AssignmentService,
    private sessionService: Session,
    private authService: AuthService,
    private sessionAccessService: SessionAccessService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.startLiveClock();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());

    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
  }

  get availableAssignments(): Assignment[] {
    const activeAssignments = this.assignments.filter(
      (assignment) => !assignment.isArchived && this.normalize(assignment.status) !== 'inactive',
    );

    if (!this.currentUser) return [];

    if (this.currentUser.role === 'admin') return activeAssignments;

    return activeAssignments.filter((assignment) => this.isTeacherAssignment(assignment));
  }

  get filteredAssignments(): Assignment[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return this.availableAssignments;

    return this.availableAssignments.filter((assignment) =>
      [
        assignment.assignmentCode,
        assignment.subjectCode,
        assignment.subjectName,
        assignment.sectionCode,
        assignment.facultyName,
        assignment.schoolYear,
        assignment.semester,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }

  get selectedAssignment(): Assignment | undefined {
    return this.availableAssignments.find(
      (assignment) => this.normalize(assignment.id) === this.normalize(this.selectedAssignmentId),
    );
  }

  get activeSessions(): any[] {
    return this.sessions.filter((session) => this.isSessionOpen(session));
  }

  get teacherActiveSessions(): any[] {
    if (!this.currentUser) return this.activeSessions;

    if (this.currentUser.role === 'admin') return this.activeSessions;

    const username = this.normalize(this.currentUser.username);
    const fullName = this.normalize(this.currentUser.fullName);
    const userId = this.normalize(this.currentUser.id);

    const teacherAssignmentIds = this.availableAssignments
      .map((assignment) => this.normalize(assignment.id))
      .filter(Boolean);

    const teacherAssignmentCodes = this.availableAssignments
      .map((assignment) => this.normalize(assignment.assignmentCode))
      .filter(Boolean);

    const teacherFacultyIds = this.availableAssignments
      .flatMap((assignment) => [
        this.normalize(assignment.facultyEmployeeId),
        this.normalize(assignment.facultyId),
      ])
      .filter(Boolean);

    return this.activeSessions.filter((session) => {
      const sessionAssignmentId = this.normalize(session.assignmentId);
      const sessionAssignmentCode = this.normalize(session.assignmentCode);
      const sessionFacultyId = this.normalize(session.facultyId);
      const sessionCreatedBy = this.normalize(session.createdBy);
      const sessionCreatedByName = this.normalize(session.createdByName);
      const sessionFacultyName = this.normalize(session.facultyName);

      return (
        teacherAssignmentIds.includes(sessionAssignmentId) ||
        teacherAssignmentCodes.includes(sessionAssignmentCode) ||
        teacherFacultyIds.includes(sessionFacultyId) ||
        sessionFacultyId === username ||
        sessionFacultyId === userId ||
        sessionCreatedBy === username ||
        sessionCreatedBy === userId ||
        sessionCreatedByName === fullName ||
        sessionFacultyName === fullName
      );
    });
  }

  get currentDisplaySession(): any | null {
    if (this.selectedAssignmentId) {
      const selectedSession = this.teacherActiveSessions.find(
        (session) =>
          this.normalize(session.assignmentId) === this.normalize(this.selectedAssignmentId),
      );

      if (selectedSession) return selectedSession;
    }

    return this.teacherActiveSessions.length > 0 ? this.teacherActiveSessions[0] : null;
  }

  loadData(): void {
    this.isLoading = true;

    this.subscriptions.push(
      this.assignmentService.getAssignments().subscribe({
        next: (data) => {
          this.assignments = data || [];
          this.assignmentsLoaded = true;
          this.restoreSelectedAssignmentFromActiveSession();
          this.updateLoadingState();
        },
        error: () => this.handleLoadError(),
      }),

      this.sessionService.getSessions().subscribe({
        next: (data) => {
          this.sessions = data || [];
          this.sessionsLoaded = true;
          this.restoreSelectedAssignmentFromActiveSession();
          this.updateLoadingState();
        },
        error: () => this.handleLoadError(),
      }),
    );
  }

  selectAssignment(assignmentId: string): void {
    this.selectedAssignmentId = assignmentId;
  }

  hasActiveSession(assignmentId: string | undefined): boolean {
    if (!assignmentId) return false;

    return this.activeSessions.some(
      (session) => this.normalize(session.assignmentId) === this.normalize(assignmentId),
    );
  }

  async createSession(): Promise<void> {
    if (!this.selectedAssignment) {
      await Swal.fire({
        title: 'No Assignment Selected',
        text: 'Please select a class assignment before creating an attendance session.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    if (this.lateAfterMinutes >= this.durationMinutes) {
      await Swal.fire({
        title: 'Invalid Late Time',
        text: 'The late threshold must be shorter than the total session duration.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    if (this.hasActiveSession(this.selectedAssignment.id)) {
      await Swal.fire({
        title: 'Active Session Exists',
        text: 'This assignment already has an active attendance session. Close it first before creating another one.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Create Attendance Session?',
      html: `
        <div style="text-align:left;line-height:1.7">
          <strong>Subject:</strong> ${this.selectedAssignment.subjectCode} - ${this.selectedAssignment.subjectName}<br>
          <strong>Section:</strong> ${this.selectedAssignment.sectionCode}<br>
          <strong>Duration:</strong> ${this.durationMinutes} minutes<br>
          <strong>Late After:</strong> ${this.lateAfterMinutes} minute(s)<br>
          <strong>QR/Code Refresh:</strong> Every ${this.rotationSeconds} second(s)
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Create Session',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    this.isCreating = true;

    try {
      const now = new Date();
      const autoCloseAt = new Date(now.getTime() + this.durationMinutes * 60 * 1000);
      const lateStartsAt = new Date(now.getTime() + this.lateAfterMinutes * 60 * 1000);

      const baseSessionCode = this.generateBaseSessionCode();
      const accessSeed = this.sessionAccessService.generateAccessSeed();

      const session: AttendanceSession = {
        assignmentId: this.selectedAssignment.id || '',
        assignmentCode: this.selectedAssignment.assignmentCode || '',

        facultyId: this.currentUser?.id || this.selectedAssignment.facultyId || '',
        facultyName: this.currentUser?.fullName || this.selectedAssignment.facultyName || '',

        subjectCode: this.selectedAssignment.subjectCode || '',
        subjectName: this.selectedAssignment.subjectName || '',

        sectionCode: this.selectedAssignment.sectionCode || '',
        program: this.selectedAssignment.program || '',
        yearLevel: this.selectedAssignment.yearLevel || '',
        schoolYear: this.selectedAssignment.schoolYear || '',
        semester: this.selectedAssignment.semester || '',

        sessionCode: baseSessionCode,
        qrToken: '',
        qrData: '',

        durationMinutes: this.durationMinutes,
        lateAfterMinutes: this.lateAfterMinutes,
        lateThresholdMinutes: this.lateAfterMinutes,
        rotationSeconds: this.rotationSeconds,
        qrRotationSeconds: this.rotationSeconds,

        startTime: now.toISOString(),
        expiresAt: autoCloseAt.toISOString(),
        autoCloseAt: autoCloseAt.toISOString(),
        lateStartsAt: lateStartsAt.toISOString(),

        status: 'active',
        isActive: true,

        createdBy: this.currentUser?.id || '',
        createdByName: this.currentUser?.fullName || 'Unknown User',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),

        antiCheatEnabled: true,
        autoAbsentEnabled: true,
        accessSeed,
        qrTokenUpdatedAt: now.toISOString(),
        mode: 'live',
      };

      const previewSession = {
        ...session,
        id: 'preview',
      };

      session.qrToken = this.sessionAccessService.getLiveQrToken(previewSession, now);
      session.qrData = this.sessionAccessService.buildQrData(previewSession, now);

      const sessionId = await this.sessionService.createSession(session);

      this.selectedAssignmentId = this.selectedAssignment.id || '';

      await Swal.fire({
        title: 'Session Created',
        text: 'Students will be marked Present before the late threshold and Late after the late threshold.',
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });

      console.log('Created session ID:', sessionId);
    } catch (error) {
      console.error('Create session error:', error);

      await Swal.fire({
        title: 'Creation Failed',
        text: 'Unable to create attendance session. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isCreating = false;
    }
  }

  async closeSession(session: any | null): Promise<void> {
    if (!session || this.isClosing) return;

    if (!session.id) {
      await Swal.fire({
        title: 'Session Not Ready',
        text: 'The session is still syncing. Please try again in a few seconds.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Close Attendance Session?',
      text: 'Students will no longer be able to submit attendance for this session.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, close session',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    this.isClosing = true;

    try {
      await this.sessionService.closeSession(session.id);

      this.isQrFullscreen = false;

      await Swal.fire({
        title: 'Session Closed',
        text: 'The attendance session has been closed.',
        icon: 'success',
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Close session error:', error);

      await Swal.fire({
        title: 'Close Failed',
        text: 'Unable to close this session.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isClosing = false;
    }
  }

  openQrFullscreen(): void {
    if (!this.currentDisplaySession) return;
    this.isQrFullscreen = true;
  }

  closeQrFullscreen(): void {
    this.isQrFullscreen = false;
  }

  getQrImageUrl(session: AttendanceSession | any): string {
    const qrData = this.getLiveQrData(session);
    const value = encodeURIComponent(qrData || session?.sessionCode || '');

    return `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${value}`;
  }

  getLiveQrData(session: AttendanceSession | any): string {
    if (!session) return '';

    if (!this.isAntiCheatSession(session)) {
      return (
        session.qrData ||
        JSON.stringify({
          type: 'SAMS_ATTENDANCE',
          sessionCode: session.sessionCode || '',
          qrToken: session.qrToken || '',
        })
      );
    }

    return this.sessionAccessService.buildQrData(session, this.getStableRotationDate(session));
  }

  getLiveSessionCode(session: AttendanceSession | any): string {
    if (!session) return '';

    return this.sessionAccessService.getLiveSessionCode(session, this.currentDateTime);
  }

  getLiveQrToken(session: AttendanceSession | any): string {
    if (!session) return '';

    return this.sessionAccessService.getLiveQrToken(session, this.currentDateTime);
  }

  isAntiCheatSession(session: AttendanceSession | any): boolean {
    return this.sessionAccessService.isAntiCheatEnabled(session);
  }

  getRotationCountdown(session: AttendanceSession | any): string {
    if (!this.isAntiCheatSession(session)) return 'Static';

    const secondsLeft = this.sessionAccessService.getSecondsUntilNextRotation(
      session,
      this.currentDateTime,
    );

    return `${secondsLeft}s`;
  }

  getRotationProgress(session: AttendanceSession | any): number {
    if (!this.isAntiCheatSession(session)) return 100;

    return this.sessionAccessService.getRotationProgress(session, this.currentDateTime);
  }

  getRotationSeconds(session: AttendanceSession | any): number {
    return this.sessionAccessService.getRotationSeconds(session);
  }

  getRotationLabel(session: AttendanceSession | any): string {
    const seconds = this.getRotationSeconds(session);

    if (seconds === 60) return 'Every 1 minute';
    if (seconds === 90) return 'Every 1 minute 30 seconds';
    if (seconds === 120) return 'Every 2 minutes';

    return `Every ${seconds} seconds`;
  }

  getSessionRemainingTime(session: AttendanceSession | any): string {
    const endDate = this.getSessionEndTime(session);

    if (!endDate) return 'No expiry';

    const remainingMs = endDate.getTime() - this.currentDateTime.getTime();

    if (remainingMs <= 0) return 'Expired';

    return this.formatDuration(remainingMs);
  }

  getLateCountdown(session: AttendanceSession | any): string {
    const lateStartsAt = this.getLateStartsAt(session);

    if (!lateStartsAt) return 'Not set';

    const remainingMs = lateStartsAt.getTime() - this.currentDateTime.getTime();

    if (remainingMs <= 0) return 'Late active';

    return this.formatDuration(remainingMs);
  }

  getLateAfterMinutes(session: AttendanceSession | any): number {
    const value = Number(
      session?.lateAfterMinutes || session?.lateThresholdMinutes || this.lateAfterMinutes || 1,
    );

    if (!Number.isFinite(value) || value <= 0) return 1;

    return Math.floor(value);
  }

  getLateStartsAtText(session: AttendanceSession | any): string {
    const lateStartsAt = this.getLateStartsAt(session);

    if (!lateStartsAt) return 'N/A';

    return lateStartsAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getAttendanceRuleClass(session: AttendanceSession | any): 'present' | 'late' | 'closed' {
    if (!session || this.isSessionExpired(session)) return 'closed';

    const lateStartsAt = this.getLateStartsAt(session);

    if (!lateStartsAt) return 'present';

    return this.currentDateTime.getTime() >= lateStartsAt.getTime() ? 'late' : 'present';
  }

  getAttendanceRuleLabel(session: AttendanceSession | any): string {
    const rule = this.getAttendanceRuleClass(session);

    if (rule === 'closed') return 'Session Closed';
    if (rule === 'late') return 'Late Status Active';

    return 'Present Status Active';
  }

  getAttendanceRuleHelp(session: AttendanceSession | any): string {
    const rule = this.getAttendanceRuleClass(session);

    if (rule === 'closed') {
      return 'Students can no longer submit attendance for this session.';
    }

    if (rule === 'late') {
      return 'Students who submit now will be recorded as Late.';
    }

    return 'Students who submit now will be recorded as Present.';
  }

  getLateProgress(session: AttendanceSession | any): number {
    const start = this.getSessionStartTime(session);
    const lateStartsAt = this.getLateStartsAt(session);

    if (!start || !lateStartsAt) return 0;

    const startMs = start.getTime();
    const lateMs = lateStartsAt.getTime();
    const nowMs = this.currentDateTime.getTime();

    if (nowMs >= lateMs) return 100;
    if (nowMs <= startMs) return 0;

    const total = lateMs - startMs;
    const elapsed = nowMs - startMs;

    if (total <= 0) return 100;

    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  }

  getSessionTimerClass(session: AttendanceSession | any): string {
    const endDate = this.getSessionEndTime(session);

    if (!endDate) return 'safe';

    const remainingMs = endDate.getTime() - this.currentDateTime.getTime();

    if (remainingMs <= 0) return 'expired';

    if (remainingMs <= 5 * 60 * 1000) return 'warning';

    return 'safe';
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

  formatProgram(program: string): string {
    const labels: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return labels[program] || program;
  }

  isSessionExpired(session: any): boolean {
    const endDate = this.getSessionEndTime(session);

    if (!endDate) return false;

    return this.currentDateTime.getTime() >= endDate.getTime();
  }

  private startLiveClock(): void {
    this.currentDateTime = new Date();

    this.clockTimer = setInterval(() => {
      this.currentDateTime = new Date();
      this.autoCloseExpiredSessions();
    }, 1000);
  }

  private autoCloseExpiredSessions(): void {
    for (const session of this.sessions) {
      if (!session?.id) continue;
      if (this.normalize(session.status) !== 'active') continue;
      if (!this.isSessionExpired(session)) continue;
      if (this.autoClosingSessionIds.has(session.id)) continue;

      this.autoClosingSessionIds.add(session.id);

      this.sessionService.closeExpiredSession(session.id).catch((error) => {
        console.warn('Auto-close expired session failed:', error);
        this.autoClosingSessionIds.delete(session.id);
      });
    }
  }

  private isSessionOpen(session: any): boolean {
    return this.normalize(session.status) === 'active' && !this.isSessionExpired(session);
  }

  private getStableRotationDate(session: AttendanceSession | any): Date {
    if (!this.isAntiCheatSession(session)) {
      return this.currentDateTime;
    }

    const referenceTime = this.getReferenceTime(session);
    const rotationSeconds = this.sessionAccessService.getRotationSeconds(session);
    const rotationMs = rotationSeconds * 1000;
    const rotationSlot = this.sessionAccessService.getRotationSlot(session, this.currentDateTime);

    return new Date(referenceTime + rotationSlot * rotationMs);
  }

  private getReferenceTime(session: AttendanceSession | any): number {
    const candidates = [session?.startTime, session?.createdAt, session?.qrTokenUpdatedAt];

    for (const value of candidates) {
      const time = new Date(value || '').getTime();

      if (!Number.isNaN(time)) {
        return time;
      }
    }

    return this.currentDateTime.getTime();
  }

  private getSessionStartTime(session: AttendanceSession | any): Date | null {
    const candidates = [session?.startTime, session?.createdAt, session?.qrTokenUpdatedAt];

    for (const value of candidates) {
      const date = new Date(value || '');

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }

  private getSessionEndTime(session: AttendanceSession | any): Date | null {
    const candidates = [session?.autoCloseAt, session?.expiresAt, session?.endTime];

    for (const value of candidates) {
      const date = new Date(value || '');

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }

  private getLateStartsAt(session: AttendanceSession | any): Date | null {
    if (!session) return null;

    const directLateDate = new Date(session.lateStartsAt || '');

    if (!Number.isNaN(directLateDate.getTime())) {
      return directLateDate;
    }

    const startTime = this.getSessionStartTime(session);

    if (!startTime) return null;

    const lateAfterMinutes = this.getLateAfterMinutes(session);

    return new Date(startTime.getTime() + lateAfterMinutes * 60 * 1000);
  }

  private formatDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
  }

  private restoreSelectedAssignmentFromActiveSession(): void {
    if (this.selectedAssignmentId) return;

    const firstActiveSession = this.teacherActiveSessions[0];

    if (firstActiveSession?.assignmentId) {
      this.selectedAssignmentId = firstActiveSession.assignmentId;
    }
  }

  private updateLoadingState(): void {
    this.isLoading = !(this.assignmentsLoaded && this.sessionsLoaded);
  }

  private isTeacherAssignment(assignment: Assignment): boolean {
    if (!this.currentUser) return false;

    const username = this.normalize(this.currentUser.username);
    const fullName = this.normalize(this.currentUser.fullName);
    const userId = this.normalize(this.currentUser.id);

    return (
      this.normalize(assignment.facultyEmployeeId) === username ||
      this.normalize(assignment.facultyEmployeeId) === userId ||
      this.normalize(assignment.facultyId) === username ||
      this.normalize(assignment.facultyId) === userId ||
      this.normalize(assignment.facultyName) === fullName
    );
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private generateBaseSessionCode(): string {
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `SAMS-${year}-${random}`;
  }

  private handleLoadError(): void {
    console.warn('Some session or assignment data could not be loaded yet.');
    this.isLoading = false;
  }
}
