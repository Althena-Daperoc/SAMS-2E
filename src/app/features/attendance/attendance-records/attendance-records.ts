import { Component, Injector, OnDestroy, OnInit, runInInjectionContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import {
  Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';

import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-attendance-records',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance-records.html',
  styleUrl: './attendance-records.scss',
})
export class AttendanceRecords implements OnInit, OnDestroy {
  currentUser: any = null;

  assignments: any[] = [];
  students: any[] = [];
  users: any[] = [];
  sessions: any[] = [];
  attendanceRecords: any[] = [];
  attendanceRequests: any[] = [];

  selectedAssignmentId = '';
  selectedSessionId = '';
  searchTerm = '';
  activeTab: 'requests' | 'records' | 'roster' = 'records';

  isLoading = true;
  isProcessing = false;

  selectedRequestIds = new Set<string>();
  selectedRecordIds = new Set<string>();

  private unsubscribers: Array<() => void> = [];
  private realtimeReady = false;
  private autoFinalizingSessionIds = new Set<string>();

  constructor(
    private firestore: Firestore,
    private injector: Injector,
    private authService: AuthService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadRealtimeData();
  }

  ngOnDestroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  get teacherAssignments(): any[] {
    const activeAssignments = this.assignments.filter(
      (assignment) => !assignment.isArchived && this.normalize(assignment.status) !== 'inactive',
    );

    if (!this.currentUser) return activeAssignments;
    if (this.currentUser.role === 'admin') return activeAssignments;

    return activeAssignments.filter((assignment) => this.isTeacherAssignment(assignment));
  }

  get selectedAssignment(): any | null {
    if (!this.selectedAssignmentId) return null;

    return (
      this.teacherAssignments.find(
        (assignment) => this.normalize(assignment.id) === this.normalize(this.selectedAssignmentId),
      ) || null
    );
  }

  get classSessions(): any[] {
    return this.sessions
      .filter((session) => this.isSessionForTeacher(session))
      .filter((session) => this.isSessionForSelectedAssignment(session))
      .sort((a, b) => {
        const dateA = this.parseDate(a.createdAt || a.startTime || a.autoCloseAt)?.getTime() || 0;
        const dateB = this.parseDate(b.createdAt || b.startTime || b.autoCloseAt)?.getTime() || 0;
        return dateB - dateA;
      });
  }

  get selectedSession(): any | null {
    if (!this.selectedSessionId) return null;

    return (
      this.classSessions.find(
        (session) => this.normalize(session.id) === this.normalize(this.selectedSessionId),
      ) || null
    );
  }

  get filteredRequests(): any[] {
    return this.attendanceRequests
      .filter((request) => this.isRequestForTeacher(request))
      .filter((request) => this.isForSelectedAssignment(request))
      .filter((request) => this.isForSelectedSession(request))
      .filter((request) => this.matchesSearch(request));
  }

  get pendingRequests(): any[] {
    return this.filteredRequests.filter((request) => this.normalize(request.status) === 'pending');
  }

  get filteredRecords(): any[] {
    return this.attendanceRecords
      .filter((record) => this.isRecordForTeacher(record))
      .filter((record) => this.isForSelectedAssignment(record))
      .filter((record) => this.isForSelectedSession(record))
      .filter((record) => this.matchesSearch(record));
  }

  get classRoster(): any[] {
    if (!this.selectedAssignment) return [];

    return this.getRosterForAssignment(this.selectedAssignment).filter((student) =>
      this.matchesSearch(student),
    );
  }

  get totalPending(): number {
    return this.pendingRequests.length;
  }

  get totalApproved(): number {
    return this.filteredRequests.filter((request) => this.normalize(request.status) === 'approved')
      .length;
  }

  get totalRecords(): number {
    return this.filteredRecords.length;
  }

  get totalRoster(): number {
    return this.classRoster.length;
  }

  get visibleItems(): any[] {
    if (this.activeTab === 'requests') return this.filteredRequests;
    if (this.activeTab === 'records') return this.filteredRecords;
    return [];
  }

  get selectedVisibleCount(): number {
    if (this.activeTab === 'requests') {
      return this.filteredRequests.filter((item) => item.id && this.selectedRequestIds.has(item.id))
        .length;
    }

    if (this.activeTab === 'records') {
      return this.filteredRecords.filter((item) => item.id && this.selectedRecordIds.has(item.id))
        .length;
    }

    return 0;
  }

  get hasVisibleSelection(): boolean {
    return this.selectedVisibleCount > 0;
  }

  get allVisibleSelected(): boolean {
    const items = this.visibleItems.filter((item) => item.id);
    if (items.length === 0) return false;

    if (this.activeTab === 'requests') {
      return items.every((item) => this.selectedRequestIds.has(item.id));
    }

    if (this.activeTab === 'records') {
      return items.every((item) => this.selectedRecordIds.has(item.id));
    }

    return false;
  }

  loadRealtimeData(): void {
    this.isLoading = true;

    const loadedCollections = new Set<string>();

    const markLoaded = (name: string) => {
      loadedCollections.add(name);

      if (loadedCollections.size >= 6) {
        this.ensureSelectedAssignment();
        this.ensureSelectedSession();
        this.isLoading = false;
        this.realtimeReady = true;
        this.processExpiredSessionsForAutoAbsent();
      }
    };

    this.listenToCollection('assignments', (data) => {
      this.assignments = data;
      this.ensureSelectedAssignment();
      this.ensureSelectedSession();
      markLoaded('assignments');

      if (this.realtimeReady) {
        this.processExpiredSessionsForAutoAbsent();
      }
    });

    this.listenToCollection('students', (data) => {
      this.students = data;
      markLoaded('students');

      if (this.realtimeReady) {
        this.processExpiredSessionsForAutoAbsent();
      }
    });

    this.listenToCollection('users', (data) => {
      this.users = data;
      markLoaded('users');
    });

    this.listenToCollection('sessions', (data) => {
      this.sessions = data;
      this.ensureSelectedSession();
      markLoaded('sessions');

      if (this.realtimeReady) {
        this.processExpiredSessionsForAutoAbsent();
      }
    });

    this.listenToCollection('attendance', (data) => {
      this.attendanceRecords = data;
      this.cleanSelections();
      markLoaded('attendance');

      if (this.realtimeReady) {
        this.processExpiredSessionsForAutoAbsent();
      }
    });

    this.listenToCollection('attendanceRequests', (data) => {
      this.attendanceRequests = data;
      this.cleanSelections();
      markLoaded('attendanceRequests');

      if (this.realtimeReady) {
        this.processExpiredSessionsForAutoAbsent();
      }
    });
  }

  selectAssignment(assignmentId: string): void {
    this.selectedAssignmentId = assignmentId;
    this.selectedSessionId = '';
    this.ensureSelectedSession();
    this.clearSelectionsOnly();
  }

  selectSession(sessionId: string): void {
    this.selectedSessionId = sessionId;
    this.clearSelectionsOnly();
  }

  setActiveTab(tab: 'requests' | 'records' | 'roster'): void {
    this.activeTab = tab;
    this.clearSelectionsOnly();
  }

  toggleSelectItem(id: string | undefined, checked: boolean): void {
    if (!id) return;

    if (this.activeTab === 'requests') {
      checked ? this.selectedRequestIds.add(id) : this.selectedRequestIds.delete(id);
      return;
    }

    if (this.activeTab === 'records') {
      checked ? this.selectedRecordIds.add(id) : this.selectedRecordIds.delete(id);
    }
  }

  toggleSelectAllVisible(checked: boolean): void {
    const items = this.visibleItems.filter((item) => item.id);

    if (this.activeTab === 'requests') {
      items.forEach((item) => {
        checked ? this.selectedRequestIds.add(item.id) : this.selectedRequestIds.delete(item.id);
      });
      return;
    }

    if (this.activeTab === 'records') {
      items.forEach((item) => {
        checked ? this.selectedRecordIds.add(item.id) : this.selectedRecordIds.delete(item.id);
      });
    }
  }

  isItemSelected(id: string | undefined): boolean {
    if (!id) return false;

    if (this.activeTab === 'requests') return this.selectedRequestIds.has(id);
    if (this.activeTab === 'records') return this.selectedRecordIds.has(id);

    return false;
  }

  async clearSelected(): Promise<void> {
    if (this.activeTab === 'roster' || !this.hasVisibleSelection || this.isProcessing) return;

    const collectionName = this.activeTab === 'requests' ? 'attendanceRequests' : 'attendance';
    const trashCollectionName =
      this.activeTab === 'requests' ? 'attendanceRequestsTrash' : 'attendanceTrash';

    const selectedIds =
      this.activeTab === 'requests'
        ? Array.from(this.selectedRequestIds)
        : Array.from(this.selectedRecordIds);

    const visibleItems = this.visibleItems.filter((item) => item.id);
    const visibleIds = new Set(visibleItems.map((item) => item.id).filter(Boolean));
    const idsToClear = selectedIds.filter((id) => visibleIds.has(id));
    const itemsToClear = visibleItems.filter((item) => idsToClear.includes(item.id));

    if (itemsToClear.length === 0) return;

    const result = await Swal.fire({
      title: 'Move selected to trash?',
      text: `${itemsToClear.length} selected item(s) will be removed from active records and backed up in Firebase trash.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, move to trash',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    this.isProcessing = true;

    try {
      await this.backupAndRemoveItems(
        collectionName,
        trashCollectionName,
        itemsToClear,
        'clear_selected',
      );

      this.clearSelectionsOnly();

      await Swal.fire({
        title: 'Moved to Trash',
        text: 'Selected records were backed up and removed from the active list.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        title: 'Clear Failed',
        text: 'Unable to move selected records to trash.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async clearAllVisible(): Promise<void> {
    if (this.activeTab === 'roster' || this.visibleItems.length === 0 || this.isProcessing) return;

    const collectionName = this.activeTab === 'requests' ? 'attendanceRequests' : 'attendance';
    const trashCollectionName =
      this.activeTab === 'requests' ? 'attendanceRequestsTrash' : 'attendanceTrash';

    const itemsToClear = this.visibleItems.filter((item) => item.id);

    if (itemsToClear.length === 0) return;

    const label = this.activeTab === 'requests' ? 'attendance requests' : 'attendance records';

    const result = await Swal.fire({
      title: 'Move all visible to trash?',
      text: `This will remove ${itemsToClear.length} visible ${label} from the active list and back them up in Firebase trash.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, move all to trash',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    this.isProcessing = true;

    try {
      await this.backupAndRemoveItems(
        collectionName,
        trashCollectionName,
        itemsToClear,
        'clear_all_visible',
      );

      this.clearSelectionsOnly();

      await Swal.fire({
        title: 'Moved to Trash',
        text: 'Visible records were backed up and removed from the active list.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        title: 'Clear Failed',
        text: 'Unable to move records to trash.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async approveRequest(request: any): Promise<void> {
    if (!request?.id || this.isProcessing) return;

    const approvedStatus = this.normalize(request.suggestedStatus) === 'late' ? 'late' : 'present';
    const lateMinutes = Number(request.lateMinutes || 0);

    const confirm = await Swal.fire({
      title: 'Approve request?',
      html: `
        <div style="text-align:left;line-height:1.7">
          <strong>Student:</strong> ${request.studentName || 'N/A'}<br>
          <strong>Class:</strong> ${request.subjectCode || ''} - ${request.subjectName || ''}<br>
          <strong>Section:</strong> ${request.sectionCode || 'N/A'}<br>
          <strong>Status:</strong> ${
            approvedStatus === 'late'
              ? `Late (${lateMinutes || 1} minute${lateMinutes > 1 ? 's' : ''})`
              : 'Present'
          }
        </div>
      `,
      icon: approvedStatus === 'late' ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'Approve',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!confirm.isConfirmed) return;

    this.isProcessing = true;

    try {
      const alreadyRecorded = await this.checkExistingAttendance(request);

      if (!alreadyRecorded) {
        await addDoc(collection(this.firestore, 'attendance'), {
          requestId: request.id,
          sessionId: request.sessionId || '',
          sessionCode: request.sessionCode || '',
          baseSessionCode: request.baseSessionCode || '',
          submittedAccessCode: request.submittedAccessCode || '',
          assignmentId: request.assignmentId || '',
          assignmentCode: request.assignmentCode || '',

          studentId: request.studentId || '',
          studentDocId: request.studentDocId || '',
          studentName: request.studentName || '',

          facultyId: request.facultyId || '',
          facultyName: request.facultyName || '',

          subjectCode: request.subjectCode || '',
          subjectName: request.subjectName || '',

          sectionCode: request.sectionCode || '',
          program: request.program || '',
          yearLevel: request.yearLevel || '',

          studentProgram: request.studentProgram || '',
          studentYearLevel: request.studentYearLevel || '',
          studentSection: request.studentSection || '',

          schoolYear: request.schoolYear || '',
          semester: request.semester || '',

          status: approvedStatus,
          lateMinutes: approvedStatus === 'late' ? lateMinutes || 1 : 0,
          lateAfterMinutes: request.lateAfterMinutes || null,
          lateThresholdMinutes: request.lateThresholdMinutes || request.lateAfterMinutes || null,
          lateStartsAt: request.lateStartsAt || '',
          submittedAt: request.submittedAt || request.createdAt || new Date().toISOString(),

          method:
            request.method && String(request.method).includes('rotating')
              ? 'approved_rotating_sit_in_request'
              : 'approved_sit_in_request',
          remarks:
            approvedStatus === 'late'
              ? `Approved sit-in / irregular request as late by ${lateMinutes || 1} minute(s)`
              : 'Approved sit-in / irregular student request as present',

          antiCheatValidated: Boolean(request.antiCheatValidated),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await updateDoc(doc(this.firestore, `attendanceRequests/${request.id}`), {
        status: 'approved',
        approvedStatus,
        approvedBy: this.currentUser?.username || this.currentUser?.id || 'teacher',
        approvedByName: this.currentUser?.fullName || 'Teacher',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await this.notifyStudentRequestApproved(request, approvedStatus, lateMinutes);

      await Swal.fire({
        title: 'Approved',
        text:
          approvedStatus === 'late'
            ? 'The student has been recorded as late and notified.'
            : 'The student has been recorded as present and notified.',
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        title: 'Approval Failed',
        text: 'Unable to approve this request.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async rejectRequest(request: any): Promise<void> {
    if (!request?.id || this.isProcessing) return;

    const result = await Swal.fire({
      title: 'Reject request?',
      input: 'textarea',
      inputLabel: 'Reason',
      inputPlaceholder: 'Enter reason for rejection...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Reject',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      inputValidator: (value) => {
        if (!value || !value.trim()) return 'Please enter a reason.';
        return null;
      },
    });

    if (!result.isConfirmed) return;

    this.isProcessing = true;

    try {
      await updateDoc(doc(this.firestore, `attendanceRequests/${request.id}`), {
        status: 'rejected',
        rejectedBy: this.currentUser?.username || this.currentUser?.id || 'teacher',
        rejectedByName: this.currentUser?.fullName || 'Teacher',
        rejectionReason: result.value,
        rejectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await this.notifyStudentRequestRejected(request, result.value);

      await Swal.fire({
        title: 'Rejected',
        text: 'The student has been notified that the request was rejected.',
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        title: 'Reject Failed',
        text: 'Unable to reject request.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  getStudentAttendanceStatus(student: any): string {
    const record = this.filteredRecords.find(
      (item) => this.normalize(item.studentId) === this.normalize(student.studentId),
    );

    return record ? this.toTitleCase(record.status || 'present') : 'No record';
  }

  formatDateTime(value: string | undefined): string {
    const date = this.parseDate(value);

    if (!date) return 'N/A';

    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatSessionLabel(session: any): string {
    const createdAt = this.formatDateTime(session.createdAt || session.startTime);
    const status = this.toTitleCase(session.status || 'active');

    return `${session.subjectCode || 'Session'} • ${createdAt} • ${status}`;
  }

  formatProgram(program: string | undefined): string {
    const labels: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return program ? labels[program] || program : 'N/A';
  }

  private async notifyStudentRequestApproved(
    request: any,
    approvedStatus: 'present' | 'late',
    lateMinutes: number,
  ): Promise<void> {
    try {
      const targetUserIds = this.getStudentNotificationUserIds(request);

      if (targetUserIds.length === 0) {
        return;
      }

      const subjectName =
        request.subjectName ||
        request.subjectCode ||
        request.sessionCode ||
        'your attendance session';

      const statusLabel =
        approvedStatus === 'late'
          ? `Late${lateMinutes ? ` (${lateMinutes} minute${lateMinutes > 1 ? 's' : ''})` : ''}`
          : 'Present';

      await this.notificationService.notifyUsersByIds(targetUserIds, {
        title: 'Attendance request approved',
        message: `Your attendance request for ${subjectName} was approved. You were recorded as ${statusLabel}.`,
        type: 'attendance_request',
        redirectUrl: '/student/my-attendance',
        sectionCode: request.studentSection || request.sectionCode || '',
        sessionId: request.sessionId || null,
      });
    } catch {
      return;
    }
  }

  private async notifyStudentRequestRejected(request: any, rejectionReason: string): Promise<void> {
    try {
      const targetUserIds = this.getStudentNotificationUserIds(request);

      if (targetUserIds.length === 0) {
        return;
      }

      const subjectName =
        request.subjectName ||
        request.subjectCode ||
        request.sessionCode ||
        'your attendance session';

      await this.notificationService.notifyUsersByIds(targetUserIds, {
        title: 'Attendance request rejected',
        message: `Your attendance request for ${subjectName} was rejected. You are considered not recorded/absent for this session. Reason: ${rejectionReason}`,
        type: 'attendance_request',
        redirectUrl: '/student/my-attendance',
        sectionCode: request.studentSection || request.sectionCode || '',
        sessionId: request.sessionId || null,
      });
    } catch {
      return;
    }
  }

  private getStudentNotificationUserIds(request: any): string[] {
    const requestStudentId = this.normalize(request.studentId);
    const requestStudentDocId = this.normalize(request.studentDocId);
    const requestStudentEmail = this.normalize(request.studentEmail || request.email);
    const requestStudentName = this.normalize(request.studentName);
    const requestUserId = this.normalize(request.studentUserId || request.userId);

    const matchedUsers = this.users.filter((user) => {
      const role = this.normalize(user.role);
      if (role && role !== 'student') return false;

      const userId = this.normalize(user.id);
      const username = this.normalize(user.username);
      const userStudentId = this.normalize(user.studentId);
      const userStudentDocId = this.normalize(user.studentDocId || user.linkedStudentId);
      const email = this.normalize(user.email);
      const fullName = this.normalize(user.fullName || user.name);

      const idMatch =
        (requestUserId && userId === requestUserId) ||
        (requestStudentDocId && userId === requestStudentDocId) ||
        (requestStudentDocId && userStudentDocId === requestStudentDocId);

      const studentIdMatch =
        (requestStudentId && username === requestStudentId) ||
        (requestStudentId && userStudentId === requestStudentId) ||
        (requestStudentId && userId === requestStudentId);

      const emailMatch = requestStudentEmail && email === requestStudentEmail;
      const nameMatch = requestStudentName && fullName === requestStudentName;

      return idMatch || studentIdMatch || emailMatch || nameMatch;
    });

    const userIds = matchedUsers.map((user) => String(user.id || '').trim()).filter(Boolean);

    if (userIds.length > 0) {
      return Array.from(new Set(userIds));
    }

    const fallbackIds = [
      request.studentUserId,
      request.userId,
      request.studentDocId,
      request.studentId,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return Array.from(new Set(fallbackIds));
  }

  private listenToCollection(collectionName: string, callback: (data: any[]) => void): void {
    const unsubscribe = runInInjectionContext(this.injector, () => {
      const ref = collection(this.firestore, collectionName);

      return onSnapshot(
        ref,
        (snapshot) => {
          const data = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          data.sort((a: any, b: any) => {
            const dateA = this.parseDate(a.createdAt || a.updatedAt || a.startTime)?.getTime() || 0;
            const dateB = this.parseDate(b.createdAt || b.updatedAt || b.startTime)?.getTime() || 0;
            return dateB - dateA;
          });

          callback(data);
        },
        () => {
          callback([]);
        },
      );
    });

    this.unsubscribers.push(unsubscribe);
  }

  private async backupAndRemoveItems(
    collectionName: string,
    trashCollectionName: string,
    items: any[],
    action: 'clear_selected' | 'clear_all_visible',
  ): Promise<void> {
    const now = new Date().toISOString();
    const clearedBy = this.currentUser?.id || this.currentUser?.username || '';
    const clearedByName = this.currentUser?.fullName || this.currentUser?.username || 'Faculty';

    await Promise.all(
      items
        .filter((item) => item?.id)
        .map((item) =>
          runInInjectionContext(this.injector, async () => {
            const originalId = item.id;
            const trashDoc = doc(this.firestore, `${trashCollectionName}/${originalId}`);
            const activeDoc = doc(this.firestore, `${collectionName}/${originalId}`);

            await setDoc(trashDoc, {
              ...item,
              originalId,
              originalCollection: collectionName,
              trashCollection: trashCollectionName,
              clearedAction: action,
              clearedAt: now,
              clearedBy,
              clearedByName,
              restoreTargetPath: `${collectionName}/${originalId}`,
              trashBackupVersion: 1,
            });

            await deleteDoc(activeDoc);
          }),
        ),
    );
  }

  private ensureSelectedAssignment(): void {
    if (this.selectedAssignmentId) return;

    if (this.teacherAssignments.length > 0) {
      this.selectedAssignmentId = this.teacherAssignments[0].id || '';
    }
  }

  private ensureSelectedSession(): void {
    if (!this.selectedAssignmentId) {
      this.selectedSessionId = '';
      return;
    }

    if (
      this.selectedSessionId &&
      this.classSessions.some(
        (session) => this.normalize(session.id) === this.normalize(this.selectedSessionId),
      )
    ) {
      return;
    }

    this.selectedSessionId = this.classSessions[0]?.id || '';
  }

  private cleanSelections(): void {
    const requestIds = new Set(this.attendanceRequests.map((item) => item.id).filter(Boolean));
    const recordIds = new Set(this.attendanceRecords.map((item) => item.id).filter(Boolean));

    this.selectedRequestIds.forEach((id) => {
      if (!requestIds.has(id)) this.selectedRequestIds.delete(id);
    });

    this.selectedRecordIds.forEach((id) => {
      if (!recordIds.has(id)) this.selectedRecordIds.delete(id);
    });
  }

  private clearSelectionsOnly(): void {
    this.selectedRequestIds.clear();
    this.selectedRecordIds.clear();
  }

  private async processExpiredSessionsForAutoAbsent(): Promise<void> {
    if (!this.realtimeReady || this.isLoading) return;

    const sessionsToFinalize = this.sessions.filter((session) =>
      this.shouldAutoGenerateAbsences(session),
    );

    for (const session of sessionsToFinalize) {
      await this.finalizeSessionAbsences(session);
    }
  }

  private shouldAutoGenerateAbsences(session: any): boolean {
    if (!session?.id) return false;

    if (this.autoFinalizingSessionIds.has(session.id)) return false;

    if (
      session.autoAbsentGenerated ||
      session.autoAbsentFinalized ||
      session.absentGenerated ||
      session.absentFinalized
    ) {
      return false;
    }

    if (session.autoAbsentEnabled !== true) {
      return false;
    }

    if (!session.assignmentId && !session.assignmentCode) return false;

    if (!this.isSessionForTeacher(session)) return false;

    const status = this.normalize(session.status);
    const sessionEnded = status === 'closed' || this.isSessionExpired(session);

    return sessionEnded;
  }

  private async finalizeSessionAbsences(session: any): Promise<void> {
    if (!session?.id) return;

    this.autoFinalizingSessionIds.add(session.id);

    try {
      const assignment = this.findAssignmentForSession(session);

      if (!assignment) {
        await updateDoc(doc(this.firestore, `sessions/${session.id}`), {
          autoAbsentGenerated: true,
          autoAbsentGeneratedAt: new Date().toISOString(),
          autoAbsentCount: 0,
          autoAbsentNote: 'No matching assignment was found for auto-absent generation.',
          updatedAt: new Date().toISOString(),
        });

        return;
      }

      const roster = this.getRosterForAssignment(assignment);

      const existingAttendanceStudentIds = new Set(
        this.attendanceRecords
          .filter((record) => this.normalize(record.sessionId) === this.normalize(session.id))
          .map((record) => this.normalize(record.studentId))
          .filter(Boolean),
      );

      const pendingRequestStudentIds = new Set(
        this.attendanceRequests
          .filter((request) => this.normalize(request.sessionId) === this.normalize(session.id))
          .filter((request) => this.normalize(request.status) === 'pending')
          .map((request) => this.normalize(request.studentId))
          .filter(Boolean),
      );

      const missingStudents = roster.filter((student) => {
        const studentId = this.normalize(student.studentId);

        return (
          studentId &&
          !existingAttendanceStudentIds.has(studentId) &&
          !pendingRequestStudentIds.has(studentId)
        );
      });

      const now = new Date().toISOString();

      for (const student of missingStudents) {
        const recordId = this.safeDocId(`${session.id}_${student.studentId}`);

        const absentRecord = {
          id: recordId,

          sessionId: session.id || '',
          sessionCode: session.sessionCode || '',
          baseSessionCode: session.sessionCode || '',
          assignmentId: session.assignmentId || assignment.id || '',
          assignmentCode: session.assignmentCode || assignment.assignmentCode || '',

          studentId: student.studentId || '',
          studentDocId: student.id || '',
          studentName: student.fullName || '',

          facultyId: session.facultyId || assignment.facultyId || '',
          facultyName: session.facultyName || assignment.facultyName || '',

          subjectCode: session.subjectCode || assignment.subjectCode || '',
          subjectName: session.subjectName || assignment.subjectName || '',

          sectionCode: session.sectionCode || assignment.sectionCode || '',
          program: session.program || assignment.program || student.program || '',
          yearLevel: session.yearLevel || assignment.yearLevel || student.yearLevel || '',

          studentProgram: student.program || '',
          studentYearLevel: student.yearLevel || '',
          studentSection: student.section || '',

          schoolYear: session.schoolYear || assignment.schoolYear || '',
          semester: session.semester || assignment.semester || '',

          status: 'absent',
          lateMinutes: 0,
          lateAfterMinutes: session.lateAfterMinutes || session.lateThresholdMinutes || null,
          lateThresholdMinutes: session.lateThresholdMinutes || session.lateAfterMinutes || null,
          lateStartsAt: session.lateStartsAt || '',
          submittedAt: '',

          method: 'auto_absent_session_end',
          remarks:
            'Automatically marked absent because the student did not submit attendance before the session ended.',

          autoGenerated: true,
          autoAbsent: true,
          generatedFromSessionEnd: true,
          generatedAt: now,

          createdAt: now,
          updatedAt: now,
        };

        await setDoc(doc(this.firestore, `attendance/${recordId}`), absentRecord);

        await this.checkAndNotifyConsecutiveAbsence(session, assignment, student, absentRecord);
      }

      await updateDoc(doc(this.firestore, `sessions/${session.id}`), {
        status: 'closed',
        autoAbsentGenerated: true,
        autoAbsentFinalized: true,
        autoAbsentGeneratedAt: now,
        autoAbsentCount: missingStudents.length,
        closedAt: session.closedAt || now,
        updatedAt: now,
      });
    } catch {
      this.autoFinalizingSessionIds.delete(session.id);
    }
  }

  private async checkAndNotifyConsecutiveAbsence(
    session: any,
    assignment: any,
    student: any,
    latestAbsentRecord: any,
  ): Promise<void> {
    try {
      const studentId = String(student.studentId || latestAbsentRecord.studentId || '').trim();

      if (!studentId) return;

      const attendanceRef = collection(this.firestore, 'attendance');
      const studentAttendanceQuery = query(attendanceRef, where('studentId', '==', studentId));
      const snapshot = await getDocs(studentAttendanceQuery);

      const firestoreRecords = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const combinedRecords = [...firestoreRecords, latestAbsentRecord];

      const uniqueRecords = new Map<string, any>();

      combinedRecords.forEach((record) => {
        const recordId =
          String(record.id || '').trim() ||
          this.safeDocId(
            `${record.sessionId || 'session'}_${record.studentId || 'student'}_${
              record.createdAt || record.generatedAt || record.submittedAt || Math.random()
            }`,
          );

        uniqueRecords.set(recordId, {
          ...record,
          id: recordId,
        });
      });

      const classRecords = Array.from(uniqueRecords.values())
        .filter((record) => this.normalize(record.studentId) === this.normalize(studentId))
        .filter((record) => this.isRecordForSameClass(record, assignment))
        .filter((record) => Boolean(this.normalize(record.status)))
        .filter((record) => this.getRecordTime(record) > 0)
        .sort((a, b) => this.getRecordTime(a) - this.getRecordTime(b));

      if (classRecords.length < 3) return;

      const trailingAbsentRecords: any[] = [];

      for (let index = classRecords.length - 1; index >= 0; index--) {
        const record = classRecords[index];
        const status = this.normalize(record.status);

        if (status === 'absent') {
          trailingAbsentRecords.unshift(record);
          continue;
        }

        if (status === 'present' || status === 'late' || status === 'excused') {
          break;
        }
      }

      if (trailingAbsentRecords.length < 3) return;

      const warningAlreadySentInThisStreak = trailingAbsentRecords.some(
        (record) => record.consecutiveAbsenceWarningSent === true,
      );

      if (warningAlreadySentInThisStreak) return;

      const latestRecordId = this.normalize(latestAbsentRecord.id);
      const newestTrailingAbsentId = this.normalize(
        trailingAbsentRecords[trailingAbsentRecords.length - 1]?.id,
      );

      if (latestRecordId && newestTrailingAbsentId && latestRecordId !== newestTrailingAbsentId) {
        return;
      }

      const facultyUserIds = this.getFacultyNotificationUserIds(session, assignment);

      if (facultyUserIds.length === 0) {
        return;
      }

      const subjectName =
        assignment.subjectName ||
        session.subjectName ||
        assignment.subjectCode ||
        session.subjectCode ||
        'your class';

      const sectionLabel = assignment.sectionCode || session.sectionCode || 'the selected section';
      const studentName = student.fullName || latestAbsentRecord.studentName || 'A student';
      const studentNumber = student.studentId || latestAbsentRecord.studentId || '';

      await this.notificationService.notifyUsersByIds(facultyUserIds, {
        title: '3 consecutive absences warning',
        message: `${studentName}${
          studentNumber ? ` (${studentNumber})` : ''
        } has ${trailingAbsentRecords.length} consecutive absences in ${subjectName} - ${sectionLabel}. Please verify if there is a valid reason before taking academic action.`,
        type: 'attendance_warning',
        redirectUrl: '/attendance/records',
        sectionCode: sectionLabel,
        sessionId: session.id || null,
      });

      if (latestAbsentRecord.id) {
        await updateDoc(doc(this.firestore, `attendance/${latestAbsentRecord.id}`), {
          consecutiveAbsenceWarningSent: true,
          consecutiveAbsenceWarningSentAt: new Date().toISOString(),
          consecutiveAbsenceCount: trailingAbsentRecords.length,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      return;
    }
  }

  private getStudentClassAttendanceRecords(
    assignment: any,
    student: any,
    latestRecord: any,
  ): any[] {
    const studentId = this.normalize(student.studentId || latestRecord.studentId);

    const combinedRecords = [...this.attendanceRecords, latestRecord];

    const uniqueRecords = new Map<string, any>();

    combinedRecords.forEach((record) => {
      const recordId =
        String(record.id || '').trim() ||
        this.safeDocId(
          `${record.sessionId || 'session'}_${record.studentId || 'student'}_${
            record.createdAt || record.generatedAt || record.submittedAt || Math.random()
          }`,
        );

      uniqueRecords.set(recordId, {
        ...record,
        id: recordId,
      });
    });

    return Array.from(uniqueRecords.values())
      .filter((record) => this.normalize(record.studentId) === studentId)
      .filter((record) => this.isRecordForSameClass(record, assignment))
      .filter((record) => Boolean(this.normalize(record.status)))
      .filter((record) => this.getRecordTime(record) > 0);
  }

  private isRecordForSameClass(record: any, assignment: any): boolean {
    const assignmentId = this.normalize(assignment.id);
    const assignmentCode = this.normalize(assignment.assignmentCode);

    const recordAssignmentId = this.normalize(record.assignmentId);
    const recordAssignmentCode = this.normalize(record.assignmentCode);

    const directMatch =
      (assignmentId && recordAssignmentId && assignmentId === recordAssignmentId) ||
      (assignmentCode && recordAssignmentCode && assignmentCode === recordAssignmentCode);

    if (directMatch) return true;

    const sameSubject =
      this.normalize(record.subjectCode) === this.normalize(assignment.subjectCode) ||
      this.normalize(record.subjectName) === this.normalize(assignment.subjectName);

    const sameSection = this.sectionsMatch(record.sectionCode, assignment.sectionCode);

    const sameSemester =
      !record.semester ||
      !assignment.semester ||
      this.normalize(record.semester) === this.normalize(assignment.semester);

    return sameSubject && sameSection && sameSemester;
  }

  private getFacultyNotificationUserIds(session: any, assignment: any): string[] {
    const facultyId = this.normalize(session.facultyId || assignment.facultyId);
    const facultyEmployeeId = this.normalize(
      assignment.facultyEmployeeId || session.facultyEmployeeId,
    );
    const facultyName = this.normalize(session.facultyName || assignment.facultyName);
    const createdBy = this.normalize(session.createdBy);

    const matchedUsers = this.users.filter((user) => {
      const role = this.normalize(user.role);
      if (role && role !== 'teacher' && role !== 'faculty') return false;

      const userId = this.normalize(user.id);
      const username = this.normalize(user.username);
      const employeeId = this.normalize(user.employeeId || user.facultyEmployeeId);
      const fullName = this.normalize(user.fullName || user.name);

      return (
        (facultyId && userId === facultyId) ||
        (facultyId && username === facultyId) ||
        (facultyEmployeeId && username === facultyEmployeeId) ||
        (facultyEmployeeId && employeeId === facultyEmployeeId) ||
        (facultyName && fullName === facultyName) ||
        (createdBy && userId === createdBy) ||
        (createdBy && username === createdBy)
      );
    });

    const userIds = matchedUsers.map((user) => String(user.id || '').trim()).filter(Boolean);

    if (userIds.length > 0) {
      return Array.from(new Set(userIds));
    }

    const fallbackIds = [
      session.facultyId,
      session.createdBy,
      assignment.facultyId,
      assignment.facultyEmployeeId,
      this.currentUser?.id,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return Array.from(new Set(fallbackIds));
  }

  private getRecordTime(record: any): number {
    return (
      this.parseDate(record.submittedAt)?.getTime() ||
      this.parseDate(record.generatedAt)?.getTime() ||
      this.parseDate(record.createdAt)?.getTime() ||
      this.parseDate(record.updatedAt)?.getTime() ||
      0
    );
  }

  private findAssignmentForSession(session: any): any | null {
    return (
      this.assignments.find(
        (assignment) => this.normalize(assignment.id) === this.normalize(session.assignmentId),
      ) ||
      this.assignments.find(
        (assignment) =>
          this.normalize(assignment.assignmentCode) === this.normalize(session.assignmentCode),
      ) ||
      this.assignments.find(
        (assignment) =>
          this.normalize(assignment.subjectCode) === this.normalize(session.subjectCode) &&
          this.sectionsMatch(assignment.sectionCode, session.sectionCode) &&
          this.normalize(assignment.semester) === this.normalize(session.semester),
      ) ||
      null
    );
  }

  private getRosterForAssignment(assignment: any): any[] {
    return this.students
      .filter((student) => !student.isArchived)
      .filter((student) => this.studentMatchesAssignment(student, assignment));
  }

  private studentMatchesAssignment(student: any, assignment: any): boolean {
    const programMatches =
      !assignment.program ||
      !student.program ||
      this.normalizeProgram(student.program) === this.normalizeProgram(assignment.program);

    const yearMatches =
      !assignment.yearLevel ||
      !student.yearLevel ||
      this.normalizeYearLevel(student.yearLevel) === this.normalizeYearLevel(assignment.yearLevel);

    const sectionMatches =
      !assignment.sectionCode ||
      !student.section ||
      this.sectionsMatch(student.section, assignment.sectionCode);

    return programMatches && yearMatches && sectionMatches;
  }

  private sectionsMatch(firstValue: any, secondValue: any): boolean {
    const first = this.normalizeSection(firstValue);
    const second = this.normalizeSection(secondValue);

    if (!first || !second) return false;

    return first === second || first.includes(second) || second.includes(first);
  }

  private isSessionExpired(session: any): boolean {
    const expiryValue = session.autoCloseAt || session.expiresAt || session.endTime;

    if (!expiryValue) return false;

    const expiryTime = this.parseDate(expiryValue)?.getTime();

    if (!expiryTime) return false;

    return Date.now() >= expiryTime;
  }

  private isSessionForTeacher(session: any): boolean {
    if (!this.currentUser) return true;
    if (this.currentUser.role === 'admin') return true;

    const teacherAssignmentIds = this.teacherAssignments
      .map((assignment) => this.normalize(assignment.id))
      .filter(Boolean);

    const teacherAssignmentCodes = this.teacherAssignments
      .map((assignment) => this.normalize(assignment.assignmentCode))
      .filter(Boolean);

    return (
      teacherAssignmentIds.includes(this.normalize(session.assignmentId)) ||
      teacherAssignmentCodes.includes(this.normalize(session.assignmentCode)) ||
      this.normalize(session.facultyName) === this.normalize(this.currentUser.fullName) ||
      this.normalize(session.facultyId) === this.normalize(this.currentUser.username) ||
      this.normalize(session.facultyId) === this.normalize(this.currentUser.id) ||
      this.normalize(session.createdBy) === this.normalize(this.currentUser.username) ||
      this.normalize(session.createdBy) === this.normalize(this.currentUser.id)
    );
  }

  private isSessionForSelectedAssignment(session: any): boolean {
    if (!this.selectedAssignmentId) return true;

    const selectedAssignment = this.selectedAssignment;

    if (!selectedAssignment) {
      return this.normalize(session.assignmentId) === this.normalize(this.selectedAssignmentId);
    }

    return (
      this.normalize(session.assignmentId) === this.normalize(this.selectedAssignmentId) ||
      this.normalize(session.assignmentCode) ===
        this.normalize(selectedAssignment.assignmentCode) ||
      (this.normalize(session.subjectCode) === this.normalize(selectedAssignment.subjectCode) &&
        this.sectionsMatch(session.sectionCode, selectedAssignment.sectionCode))
    );
  }

  private isTeacherAssignment(assignment: any): boolean {
    if (!this.currentUser) return false;

    const username = this.normalize(this.currentUser.username);
    const userId = this.normalize(this.currentUser.id);
    const fullName = this.normalize(this.currentUser.fullName);

    return (
      this.normalize(assignment.facultyEmployeeId) === username ||
      this.normalize(assignment.facultyEmployeeId) === userId ||
      this.normalize(assignment.facultyId) === username ||
      this.normalize(assignment.facultyId) === userId ||
      this.normalize(assignment.facultyName) === fullName
    );
  }

  private isRequestForTeacher(request: any): boolean {
    if (!this.currentUser) return true;

    const teacherAssignmentIds = this.teacherAssignments
      .map((assignment) => this.normalize(assignment.id))
      .filter(Boolean);

    return (
      teacherAssignmentIds.includes(this.normalize(request.assignmentId)) ||
      this.normalize(request.facultyName) === this.normalize(this.currentUser.fullName) ||
      this.normalize(request.facultyId) === this.normalize(this.currentUser.username) ||
      this.normalize(request.facultyId) === this.normalize(this.currentUser.id) ||
      this.normalize(request.createdBy) === this.normalize(this.currentUser.username) ||
      this.normalize(request.createdBy) === this.normalize(this.currentUser.id)
    );
  }

  private isRecordForTeacher(record: any): boolean {
    if (!this.currentUser) return true;

    const teacherAssignmentIds = this.teacherAssignments
      .map((assignment) => this.normalize(assignment.id))
      .filter(Boolean);

    return (
      teacherAssignmentIds.includes(this.normalize(record.assignmentId)) ||
      this.normalize(record.facultyName) === this.normalize(this.currentUser.fullName) ||
      this.normalize(record.facultyId) === this.normalize(this.currentUser.username) ||
      this.normalize(record.facultyId) === this.normalize(this.currentUser.id) ||
      this.normalize(record.createdBy) === this.normalize(this.currentUser.username) ||
      this.normalize(record.createdBy) === this.normalize(this.currentUser.id)
    );
  }

  private isForSelectedAssignment(item: any): boolean {
    if (!this.selectedAssignmentId) return true;

    const selectedAssignment = this.selectedAssignment;

    if (!selectedAssignment) {
      return this.normalize(item.assignmentId) === this.normalize(this.selectedAssignmentId);
    }

    return (
      this.normalize(item.assignmentId) === this.normalize(this.selectedAssignmentId) ||
      this.normalize(item.assignmentCode) === this.normalize(selectedAssignment.assignmentCode) ||
      (this.normalize(item.subjectCode) === this.normalize(selectedAssignment.subjectCode) &&
        this.sectionsMatch(item.sectionCode, selectedAssignment.sectionCode))
    );
  }

  private isForSelectedSession(item: any): boolean {
    if (!this.selectedSessionId) return true;

    return this.normalize(item.sessionId) === this.normalize(this.selectedSessionId);
  }

  private matchesSearch(item: any): boolean {
    const keyword = this.searchTerm.trim().toLowerCase();
    if (!keyword) return true;

    return Object.values(item).join(' ').toLowerCase().includes(keyword);
  }

  private async checkExistingAttendance(request: any): Promise<boolean> {
    const snapshot = await runInInjectionContext(this.injector, () => {
      const recordsRef = collection(this.firestore, 'attendance');

      const q = query(
        recordsRef,
        where('sessionId', '==', request.sessionId || ''),
        where('studentId', '==', request.studentId || ''),
      );

      return getDocs(q);
    });

    return !snapshot.empty;
  }

  private normalizeProgram(value: any): string {
    const cleaned = this.normalize(value).replace(/[\s_-]/g, '');

    const programMap: Record<string, string> = {
      it: 'it',
      informationtechnology: 'it',
      bsit: 'it',
      tcm: 'tcm',
      technologycommunicationmanagement: 'tcm',
      emt: 'emt',
      electromechanicaltechnology: 'emt',
      electromechanical: 'emt',
    };

    return programMap[cleaned] || cleaned;
  }

  private normalizeYearLevel(value: any): string {
    return this.normalize(value)
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace('year', '')
      .replace('yr', '')
      .replace('level', '')
      .replace('st', '')
      .replace('nd', '')
      .replace('rd', '')
      .replace('th', '');
  }

  private normalizeSection(value: any): string {
    return this.normalize(value)
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace(/_/g, '')
      .replace('section', '')
      .replace(/^bsit/, '')
      .replace(/^it/, '')
      .replace(/^tcm/, '')
      .replace(/^emt/, '');
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
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

  private safeDocId(value: any): string {
    const cleaned = String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');

    return cleaned || `auto_absent_${Date.now()}`;
  }

  private toTitleCase(value: string): string {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
