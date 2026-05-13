import { CommonModule } from '@angular/common';
import {
  Component,
  Injector,
  OnDestroy,
  OnInit,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { Router } from '@angular/router';
import { Firestore, collection, onSnapshot } from '@angular/fire/firestore';

import { AuthService } from '../../../core/services/auth.service';

type DashboardStat = {
  label: string;
  value: string | number;
  icon: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
};

type DashboardAction = {
  label: string;
  route: string;
  icon: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
};

type DashboardModule = {
  label: string;
  route: string;
  icon: string;
  meta: string;
  count?: number;
};

type DashboardSignal = {
  label: string;
  value: string | number;
  icon: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  currentUser: any = null;

  students: any[] = [];
  faculty: any[] = [];
  parents: any[] = [];
  subjects: any[] = [];
  sections: any[] = [];
  assignments: any[] = [];
  sessions: any[] = [];
  attendanceRecords: any[] = [];
  attendanceRequests: any[] = [];

  isLoading = true;

  statCards: DashboardStat[] = [];
  primaryActions: DashboardAction[] = [];
  moduleCards: DashboardModule[] = [];
  systemSignals: DashboardSignal[] = [];
  recentRecords: any[] = [];

  private readonly unsubscribers: Array<() => void> = [];
  private readonly loadedCollections = new Set<string>();

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get isTeacher(): boolean {
    return this.currentUser?.role === 'teacher' || this.currentUser?.role === 'faculty';
  }

  get displayName(): string {
    return this.currentUser?.fullName || 'User';
  }

  get firstName(): string {
    return this.displayName.split(' ')[0] || 'User';
  }

  get greeting(): string {
    const hour = new Date().getHours();

    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';

    return 'Good evening';
  }

  get roleLabel(): string {
    if (this.isAdmin) return 'School Admin';
    if (this.isTeacher) return 'Faculty';

    return 'User';
  }

  get dashboardTitle(): string {
    if (this.isAdmin) return 'School Overview';
    if (this.isTeacher) return 'Faculty Workspace';

    return 'Dashboard';
  }

  get dashboardSubtitle(): string {
    if (this.isAdmin) return 'Records, setup, attendance, and reports in one place.';
    if (this.isTeacher) return 'Sessions, attendance, reports, and class messages.';

    return 'SAMS workspace.';
  }

  get focusTitle(): string {
    if (this.isAdmin) return 'Academic Records';
    if (this.isTeacher) return 'Attendance Sessions';

    return 'Today';
  }

  get focusMeta(): string {
    if (this.isAdmin) return 'Students, faculty, parents, subjects, and sections.';
    if (this.isTeacher) return 'Create sessions, review records, and handle requests.';

    return 'Quick access';
  }

  get activeSessionsCount(): number {
    return this.visibleSessions.filter((session) => this.normalize(session.status) === 'active')
      .length;
  }

  get pendingRequestsCount(): number {
    return this.visibleRequests.filter((request) => this.normalize(request.status) === 'pending')
      .length;
  }

  get todayAttendanceCount(): number {
    return this.visibleAttendanceRecords.filter((record) => this.isTodayRecord(record)).length;
  }

  get visibleAssignments(): any[] {
    const activeAssignments = this.assignments.filter(
      (assignment) => !assignment.isArchived && this.normalize(assignment.status) !== 'inactive',
    );

    if (this.isAdmin) return activeAssignments;

    if (this.isTeacher) {
      return activeAssignments.filter((assignment) => this.isTeacherAssignment(assignment));
    }

    return [];
  }

  get visibleSessions(): any[] {
    if (this.isAdmin) {
      return this.sessions.filter((session) => !session.isArchived);
    }

    if (this.isTeacher) {
      return this.sessions
        .filter((session) => !session.isArchived)
        .filter((session) => this.isSessionForTeacher(session));
    }

    return [];
  }

  get visibleAttendanceRecords(): any[] {
    if (this.isAdmin) {
      return this.attendanceRecords.filter((record) => !record.isArchived && !record.deletedAt);
    }

    if (this.isTeacher) {
      return this.attendanceRecords
        .filter((record) => !record.isArchived && !record.deletedAt)
        .filter((record) => this.isAttendanceForTeacher(record));
    }

    return [];
  }

  get visibleRequests(): any[] {
    if (this.isAdmin) {
      return this.attendanceRequests.filter((request) => !request.isArchived && !request.deletedAt);
    }

    if (this.isTeacher) {
      return this.attendanceRequests
        .filter((request) => !request.isArchived && !request.deletedAt)
        .filter((request) => this.isRequestForTeacher(request));
    }

    return [];
  }

  navigateTo(route: string): void {
    if (!route) return;
    this.router.navigate([route]);
  }

  formatDateTime(value: any): string {
    const date = this.parseDate(value);

    if (!date) return 'N/A';

    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatStatus(value: any): string {
    const cleanValue = String(value || 'unknown')
      .trim()
      .replace(/_/g, ' ');

    return cleanValue.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  getStatusClass(value: any): string {
    const status = this.normalize(value);

    if (status === 'present' || status === 'approved' || status === 'active') return 'success';
    if (status === 'late' || status === 'pending') return 'warning';
    if (status === 'absent' || status === 'rejected' || status === 'closed') return 'danger';
    if (status === 'excused') return 'primary';

    return 'neutral';
  }

  private loadDashboardData(): void {
    this.isLoading = true;

    this.listenToCollection('students', (data) => {
      this.students = data;
      this.markLoaded('students');
    });

    this.listenToCollection('faculty', (data) => {
      this.faculty = data;
      this.markLoaded('faculty');
    });

    this.listenToCollection('parents', (data) => {
      this.parents = data;
      this.markLoaded('parents');
    });

    this.listenToCollection('subjects', (data) => {
      this.subjects = data;
      this.markLoaded('subjects');
    });

    this.listenToCollection('sections', (data) => {
      this.sections = data;
      this.markLoaded('sections');
    });

    this.listenToCollection('assignments', (data) => {
      this.assignments = data;
      this.markLoaded('assignments');
    });

    this.listenToCollection('sessions', (data) => {
      this.sessions = data;
      this.markLoaded('sessions');
    });

    this.listenToCollection('attendance', (data) => {
      this.attendanceRecords = data;
      this.markLoaded('attendance');
    });

    this.listenToCollection('attendanceRequests', (data) => {
      this.attendanceRequests = data;
      this.markLoaded('attendanceRequests');
    });
  }

  private listenToCollection(collectionName: string, callback: (data: any[]) => void): void {
    const unsubscribe = runInInjectionContext(this.injector, () => {
      const collectionRef = collection(this.firestore, collectionName);

      return onSnapshot(
        collectionRef,
        (snapshot) => {
          const data = snapshot.docs.map((docSnap): any => ({
            id: docSnap.id,
            ...(docSnap.data() as Record<string, any>),
          }));

          callback(data);
        },
        () => {
          callback([]);
        },
      );
    });

    this.unsubscribers.push(unsubscribe);
  }

  private markLoaded(collectionName: string): void {
    this.loadedCollections.add(collectionName);
    this.buildDashboard();

    if (this.loadedCollections.size >= 9) {
      this.isLoading = false;
    }
  }

  private buildDashboard(): void {
    if (this.isAdmin) {
      this.buildAdminDashboard();
      return;
    }

    if (this.isTeacher) {
      this.buildTeacherDashboard();
      return;
    }

    this.statCards = [];
    this.primaryActions = [];
    this.moduleCards = [];
    this.systemSignals = [];
    this.recentRecords = [];
  }

  private buildAdminDashboard(): void {
    const activeStudents = this.students.filter((student) => !student.isArchived).length;
    const activeFaculty = this.faculty.filter((faculty) => !faculty.isArchived).length;
    const activeParents = this.parents.filter((parent) => !parent.isArchived).length;
    const todayRecords = this.todayAttendanceCount;
    const absencesToday = this.countTodayStatus('absent');

    this.statCards = [
      {
        label: 'Students',
        value: activeStudents,
        icon: 'pi pi-users',
        tone: 'primary',
      },
      {
        label: 'Faculty',
        value: activeFaculty,
        icon: 'pi pi-id-card',
        tone: 'success',
      },
      {
        label: 'Parents',
        value: activeParents,
        icon: 'pi pi-user-plus',
        tone: 'neutral',
      },
      {
        label: 'Today',
        value: todayRecords,
        icon: 'pi pi-calendar',
        tone: todayRecords > 0 ? 'success' : 'warning',
      },
    ];

    this.primaryActions = [
      {
        label: 'Students',
        route: '/students',
        icon: 'pi pi-users',
        tone: 'primary',
      },
      {
        label: 'Faculty',
        route: '/admin/faculty',
        icon: 'pi pi-id-card',
        tone: 'success',
      },
      {
        label: 'Reports',
        route: '/reports',
        icon: 'pi pi-chart-bar',
        tone: 'warning',
      },
    ];

    this.moduleCards = [
      {
        label: 'Students',
        route: '/students',
        icon: 'pi pi-users',
        meta: 'Learners',
        count: activeStudents,
      },
      {
        label: 'Faculty',
        route: '/admin/faculty',
        icon: 'pi pi-id-card',
        meta: 'Personnel',
        count: activeFaculty,
      },
      {
        label: 'Parents',
        route: '/admin/parents',
        icon: 'pi pi-user-plus',
        meta: 'Guardians',
        count: activeParents,
      },
      {
        label: 'Subjects',
        route: '/subjects',
        icon: 'pi pi-book',
        meta: 'Courses',
        count: this.subjects.filter((subject) => !subject.isArchived).length,
      },
      {
        label: 'Sections',
        route: '/admin/sections',
        icon: 'pi pi-table',
        meta: 'Classes',
        count: this.sections.filter((section) => !section.isArchived).length,
      },
      {
        label: 'Assignments',
        route: '/admin/assignments',
        icon: 'pi pi-verified',
        meta: 'Loads',
        count: this.assignments.filter((assignment) => !assignment.isArchived).length,
      },
      {
        label: 'User Accounts',
        route: '/admin/user-accounts',
        icon: 'pi pi-key',
        meta: 'Access',
      },
      {
        label: 'Reports',
        route: '/reports',
        icon: 'pi pi-chart-line',
        meta: 'Analytics',
      },
    ];

    this.systemSignals = [
      {
        label: 'Active Sessions',
        value: this.activeSessionsCount,
        icon: 'pi pi-qrcode',
        tone: this.activeSessionsCount > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Pending Requests',
        value: this.pendingRequestsCount,
        icon: 'pi pi-clock',
        tone: this.pendingRequestsCount > 0 ? 'warning' : 'success',
      },
      {
        label: 'Absences Today',
        value: absencesToday,
        icon: 'pi pi-exclamation-circle',
        tone: absencesToday > 0 ? 'danger' : 'success',
      },
    ];

    this.recentRecords = this.visibleAttendanceRecords
      .sort((a, b) => this.getRecordTime(b) - this.getRecordTime(a))
      .slice(0, 5);
  }

  private buildTeacherDashboard(): void {
    const handledClasses = this.visibleAssignments.length;
    const activeSessions = this.activeSessionsCount;
    const todayRecords = this.todayAttendanceCount;
    const attendanceRate = this.getAttendanceRate(this.visibleAttendanceRecords);
    const lateToday = this.countTodayStatus('late');
    const absentToday = this.countTodayStatus('absent');

    this.statCards = [
      {
        label: 'Classes',
        value: handledClasses,
        icon: 'pi pi-briefcase',
        tone: 'primary',
      },
      {
        label: 'Active Sessions',
        value: activeSessions,
        icon: 'pi pi-qrcode',
        tone: activeSessions > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Today',
        value: todayRecords,
        icon: 'pi pi-calendar',
        tone: todayRecords > 0 ? 'success' : 'warning',
      },
      {
        label: 'Rate',
        value: `${attendanceRate}%`,
        icon: 'pi pi-chart-line',
        tone: attendanceRate >= 85 ? 'success' : attendanceRate >= 70 ? 'warning' : 'danger',
      },
    ];

    this.primaryActions = [
      {
        label: 'Create Session',
        route: '/sessions/create',
        icon: 'pi pi-qrcode',
        tone: 'primary',
      },
      {
        label: 'Records',
        route: '/attendance/records',
        icon: 'pi pi-list-check',
        tone: 'success',
      },
      {
        label: 'Messages',
        route: '/messages',
        icon: 'pi pi-comments',
        tone: 'neutral',
      },
    ];

    this.moduleCards = [
      {
        label: 'Create Session',
        route: '/sessions/create',
        icon: 'pi pi-qrcode',
        meta: 'QR Attendance',
      },
      {
        label: 'Attendance Records',
        route: '/attendance/records',
        icon: 'pi pi-list-check',
        meta: 'Records',
        count: this.visibleAttendanceRecords.length,
      },
      {
        label: 'Reports',
        route: '/reports',
        icon: 'pi pi-chart-bar',
        meta: 'Summary',
      },
      {
        label: 'Messages',
        route: '/messages',
        icon: 'pi pi-comments',
        meta: 'Chats',
      },
    ];

    this.systemSignals = [
      {
        label: 'Pending Requests',
        value: this.pendingRequestsCount,
        icon: 'pi pi-clock',
        tone: this.pendingRequestsCount > 0 ? 'warning' : 'success',
      },
      {
        label: 'Late Today',
        value: lateToday,
        icon: 'pi pi-stopwatch',
        tone: lateToday > 0 ? 'warning' : 'success',
      },
      {
        label: 'Absent Today',
        value: absentToday,
        icon: 'pi pi-exclamation-circle',
        tone: absentToday > 0 ? 'danger' : 'success',
      },
    ];

    this.recentRecords = this.visibleAttendanceRecords
      .sort((a, b) => this.getRecordTime(b) - this.getRecordTime(a))
      .slice(0, 5);
  }

  private isTeacherAssignment(assignment: any): boolean {
    if (!this.currentUser) return false;

    const currentUserId = this.normalize(this.currentUser.id);
    const username = this.normalize(this.currentUser.username);
    const fullName = this.normalize(this.currentUser.fullName);
    const email = this.normalize(this.currentUser.email);

    const facultyId = this.normalize(assignment.facultyId);
    const facultyEmployeeId = this.normalize(assignment.facultyEmployeeId);
    const facultyName = this.normalize(assignment.facultyName);
    const facultyEmail = this.normalize(assignment.facultyEmail);

    if (facultyId && (facultyId === currentUserId || facultyId === username)) return true;

    if (
      facultyEmployeeId &&
      (facultyEmployeeId === currentUserId || facultyEmployeeId === username)
    ) {
      return true;
    }

    if (facultyName && facultyName === fullName) return true;
    if (facultyEmail && facultyEmail === email) return true;

    return false;
  }

  private isSessionForTeacher(session: any): boolean {
    if (!this.currentUser) return false;

    const assignmentIds = this.visibleAssignments
      .map((assignment) => this.normalize(assignment.id))
      .filter(Boolean);

    const assignmentCodes = this.visibleAssignments
      .map((assignment) => this.normalize(assignment.assignmentCode))
      .filter(Boolean);

    const sessionAssignmentId = this.normalize(session.assignmentId);
    const sessionAssignmentCode = this.normalize(session.assignmentCode);

    if (sessionAssignmentId && assignmentIds.includes(sessionAssignmentId)) return true;
    if (sessionAssignmentCode && assignmentCodes.includes(sessionAssignmentCode)) return true;

    return this.belongsToCurrentTeacher(session);
  }

  private isAttendanceForTeacher(record: any): boolean {
    if (!this.currentUser) return false;

    const assignmentIds = this.visibleAssignments
      .map((assignment) => this.normalize(assignment.id))
      .filter(Boolean);

    const recordAssignmentId = this.normalize(record.assignmentId);

    if (recordAssignmentId && assignmentIds.includes(recordAssignmentId)) return true;

    return this.belongsToCurrentTeacher(record);
  }

  private isRequestForTeacher(request: any): boolean {
    if (!this.currentUser) return false;

    const assignmentIds = this.visibleAssignments
      .map((assignment) => this.normalize(assignment.id))
      .filter(Boolean);

    const requestAssignmentId = this.normalize(request.assignmentId);

    if (requestAssignmentId && assignmentIds.includes(requestAssignmentId)) return true;

    return this.belongsToCurrentTeacher(request);
  }

  private belongsToCurrentTeacher(item: any): boolean {
    const currentUserId = this.normalize(this.currentUser?.id);
    const username = this.normalize(this.currentUser?.username);
    const fullName = this.normalize(this.currentUser?.fullName);
    const email = this.normalize(this.currentUser?.email);

    const facultyId = this.normalize(
      item.facultyId || item.teacherId || item.createdBy || item.createdById,
    );

    const facultyName = this.normalize(item.facultyName || item.teacherName || item.instructorName);

    const facultyEmail = this.normalize(item.facultyEmail || item.teacherEmail);

    if (facultyId && (facultyId === currentUserId || facultyId === username)) return true;
    if (facultyName && facultyName === fullName) return true;
    if (facultyEmail && facultyEmail === email) return true;

    return false;
  }

  private countTodayStatus(status: string): number {
    const targetStatus = this.normalize(status);

    return this.visibleAttendanceRecords.filter(
      (record) => this.isTodayRecord(record) && this.normalize(record.status) === targetStatus,
    ).length;
  }

  private getAttendanceRate(records: any[]): number {
    if (!records.length) return 0;

    const attended = records.filter((record) => {
      const status = this.normalize(record.status);
      return status === 'present' || status === 'late' || status === 'excused';
    }).length;

    return Math.round((attended / records.length) * 100);
  }

  private isTodayRecord(record: any): boolean {
    const date = this.parseDate(
      record.submittedAt ||
        record.generatedAt ||
        record.createdAt ||
        record.updatedAt ||
        record.date,
    );

    if (!date) return false;

    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  private getRecordTime(record: any): number {
    return (
      this.parseDate(record.submittedAt)?.getTime() ||
      this.parseDate(record.generatedAt)?.getTime() ||
      this.parseDate(record.createdAt)?.getTime() ||
      this.parseDate(record.updatedAt)?.getTime() ||
      this.parseDate(record.date)?.getTime() ||
      0
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

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}
