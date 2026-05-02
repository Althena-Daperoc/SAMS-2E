import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

import { AssignmentService } from '../../../core/services/assignment.service';
import { Session } from '../../../core/services/session.service';
import { AuthService } from '../../../core/services/auth.service';

import { Assignment } from '../../../models/assignment.model';
import { User } from '../../../models/user.model';

type SessionDuration = 15 | 30 | 45 | 60 | 90 | 120;

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
  expiresAt: string;
  status: 'active' | 'closed';
  createdBy: string;
  createdByName: string;
  createdAt?: string;
  updatedAt?: string;
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
  searchTerm = '';

  isLoading = true;
  isCreating = false;
  isClosing = false;
  isQrFullscreen = false;

  private assignmentsLoaded = false;
  private sessionsLoaded = false;
  private subscriptions: Subscription[] = [];

  constructor(
    private assignmentService: AssignmentService,
    private sessionService: Session,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
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
    return this.sessions.filter((session) => this.normalize(session.status) === 'active');
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
          <strong>Duration:</strong> ${this.durationMinutes} minutes
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
      const expiresAt = new Date(now.getTime() + this.durationMinutes * 60 * 1000);

      const sessionCode = this.generateSessionCode();
      const qrToken = this.generateQrToken();

      const session: AttendanceSession = {
        assignmentId: this.selectedAssignment.id || '',
        assignmentCode: this.selectedAssignment.assignmentCode || '',

        facultyId:
          this.selectedAssignment.facultyEmployeeId ||
          this.selectedAssignment.facultyId ||
          this.currentUser?.username ||
          this.currentUser?.id ||
          '',
        facultyName: this.selectedAssignment.facultyName || this.currentUser?.fullName || '',

        subjectCode: this.selectedAssignment.subjectCode || '',
        subjectName: this.selectedAssignment.subjectName || '',

        sectionCode: this.selectedAssignment.sectionCode || '',
        program: this.selectedAssignment.program || '',
        yearLevel: this.selectedAssignment.yearLevel || '',

        schoolYear: this.selectedAssignment.schoolYear || '',
        semester: this.selectedAssignment.semester || '',

        sessionCode,
        qrToken,
        qrData: JSON.stringify({
          type: 'SAMS_ATTENDANCE',
          sessionCode,
          qrToken,
        }),

        durationMinutes: this.durationMinutes,
        expiresAt: expiresAt.toISOString(),

        status: 'active',
        createdBy:
          this.currentUser?.username ||
          this.currentUser?.id ||
          this.selectedAssignment.facultyEmployeeId ||
          'unknown',
        createdByName:
          this.currentUser?.fullName || this.selectedAssignment.facultyName || 'Unknown User',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const sessionId = await this.sessionService.createSession(session);

      this.selectedAssignmentId = this.selectedAssignment.id || '';

      await Swal.fire({
        title: 'Session Created',
        text: 'Display the QR code or session code to your students.',
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
    const value = encodeURIComponent(session.qrData || session.sessionCode || '');
    return `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${value}`;
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
    if (!session?.expiresAt) return false;

    const expiresAt = new Date(session.expiresAt).getTime();

    if (Number.isNaN(expiresAt)) return false;

    return Date.now() > expiresAt;
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

  private generateSessionCode(): string {
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `SAMS-${year}-${random}`;
  }

  private generateQrToken(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 12).toUpperCase();
    return `QR-${timestamp}-${random}`;
  }

  private handleLoadError(): void {
    console.warn('Some session or assignment data could not be loaded yet.');
    this.isLoading = false;
  }
}
