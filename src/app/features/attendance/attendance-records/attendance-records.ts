import { Component, OnDestroy, OnInit } from '@angular/core';
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
  updateDoc,
  where,
} from '@angular/fire/firestore';

import { AuthService } from '../../../core/services/auth.service';

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
  attendanceRecords: any[] = [];
  attendanceRequests: any[] = [];

  selectedAssignmentId = '';
  searchTerm = '';
  activeTab: 'requests' | 'records' | 'roster' = 'requests';

  isLoading = true;
  isProcessing = false;

  selectedRequestIds = new Set<string>();
  selectedRecordIds = new Set<string>();

  private unsubscribers: Array<() => void> = [];

  constructor(
    private firestore: Firestore,
    private authService: AuthService,
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

  get filteredRequests(): any[] {
    return this.attendanceRequests
      .filter((request) => this.isRequestForTeacher(request))
      .filter((request) => this.isForSelectedAssignment(request))
      .filter((request) => this.matchesSearch(request));
  }

  get pendingRequests(): any[] {
    return this.filteredRequests.filter((request) => this.normalize(request.status) === 'pending');
  }

  get filteredRecords(): any[] {
    return this.attendanceRecords
      .filter((record) => this.isRecordForTeacher(record))
      .filter((record) => this.isForSelectedAssignment(record))
      .filter((record) => this.matchesSearch(record));
  }

  get classRoster(): any[] {
    if (!this.selectedAssignment) return [];

    return this.students
      .filter((student) => !student.isArchived)
      .filter(
        (student) =>
          this.normalize(student.program) === this.normalize(this.selectedAssignment.program) &&
          this.normalize(student.yearLevel) === this.normalize(this.selectedAssignment.yearLevel) &&
          this.normalize(student.section) === this.normalize(this.selectedAssignment.sectionCode),
      )
      .filter((student) => this.matchesSearch(student));
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

      if (loadedCollections.size >= 4) {
        this.ensureSelectedAssignment();
        this.isLoading = false;
      }
    };

    this.listenToCollection('assignments', (data) => {
      this.assignments = data;
      this.ensureSelectedAssignment();
      markLoaded('assignments');
    });

    this.listenToCollection('students', (data) => {
      this.students = data;
      markLoaded('students');
    });

    this.listenToCollection('attendanceRecords', (data) => {
      this.attendanceRecords = data;
      this.cleanSelections();
      markLoaded('attendanceRecords');
    });

    this.listenToCollection('attendanceRequests', (data) => {
      this.attendanceRequests = data;
      this.cleanSelections();
      markLoaded('attendanceRequests');
    });
  }

  selectAssignment(assignmentId: string): void {
    this.selectedAssignmentId = assignmentId;
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

    const collectionName =
      this.activeTab === 'requests' ? 'attendanceRequests' : 'attendanceRecords';
    const selectedIds =
      this.activeTab === 'requests'
        ? Array.from(this.selectedRequestIds)
        : Array.from(this.selectedRecordIds);

    const visibleIds = new Set(this.visibleItems.map((item) => item.id).filter(Boolean));
    const idsToDelete = selectedIds.filter((id) => visibleIds.has(id));

    if (idsToDelete.length === 0) return;

    const result = await Swal.fire({
      title: 'Clear selected records?',
      text: `${idsToDelete.length} selected item(s) will be permanently removed.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, clear selected',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    this.isProcessing = true;

    try {
      await Promise.all(
        idsToDelete.map((id) => deleteDoc(doc(this.firestore, `${collectionName}/${id}`))),
      );

      this.clearSelectionsOnly();

      await Swal.fire({
        title: 'Cleared',
        text: 'Selected records were removed.',
        icon: 'success',
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);

      await Swal.fire({
        title: 'Clear Failed',
        text: 'Unable to clear selected records.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async clearAllVisible(): Promise<void> {
    if (this.activeTab === 'roster' || this.visibleItems.length === 0 || this.isProcessing) return;

    const collectionName =
      this.activeTab === 'requests' ? 'attendanceRequests' : 'attendanceRecords';
    const idsToDelete = this.visibleItems.map((item) => item.id).filter(Boolean);

    if (idsToDelete.length === 0) return;

    const label = this.activeTab === 'requests' ? 'attendance requests' : 'attendance records';

    const result = await Swal.fire({
      title: 'Clear all visible?',
      text: `This will permanently remove ${idsToDelete.length} visible ${label}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, clear all visible',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    this.isProcessing = true;

    try {
      await Promise.all(
        idsToDelete.map((id) => deleteDoc(doc(this.firestore, `${collectionName}/${id}`))),
      );

      this.clearSelectionsOnly();

      await Swal.fire({
        title: 'Cleared',
        text: 'Visible records were removed.',
        icon: 'success',
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);

      await Swal.fire({
        title: 'Clear Failed',
        text: 'Unable to clear records.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async approveRequest(request: any): Promise<void> {
    if (!request?.id || this.isProcessing) return;

    const confirm = await Swal.fire({
      title: 'Approve request?',
      html: `
        <div style="text-align:left;line-height:1.7">
          <strong>Student:</strong> ${request.studentName || 'N/A'}<br>
          <strong>Class:</strong> ${request.subjectCode || ''} - ${request.subjectName || ''}<br>
          <strong>Section:</strong> ${request.sectionCode || 'N/A'}
        </div>
      `,
      icon: 'question',
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
        await addDoc(collection(this.firestore, 'attendanceRecords'), {
          requestId: request.id,
          sessionId: request.sessionId || '',
          sessionCode: request.sessionCode || '',
          assignmentId: request.assignmentId || '',

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

          schoolYear: request.schoolYear || '',
          semester: request.semester || '',

          status: 'present',
          method: 'approved_sit_in_request',
          remarks: 'Approved sit-in / irregular student request',

          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await updateDoc(doc(this.firestore, `attendanceRequests/${request.id}`), {
        status: 'approved',
        approvedBy: this.currentUser?.username || this.currentUser?.id || 'teacher',
        approvedByName: this.currentUser?.fullName || 'Teacher',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await Swal.fire({
        title: 'Approved',
        text: 'The student has been recorded as present.',
        icon: 'success',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);

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

      await Swal.fire({
        title: 'Rejected',
        icon: 'success',
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);

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
    if (!value) return 'N/A';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatProgram(program: string | undefined): string {
    const labels: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return program ? labels[program] || program : 'N/A';
  }

  private listenToCollection(collectionName: string, callback: (data: any[]) => void): void {
    const ref = collection(this.firestore, collectionName);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        data.sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
          const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
          return dateB - dateA;
        });

        callback(data);
      },
      (error) => {
        console.error(`${collectionName} listener error:`, error);
        callback([]);
      },
    );

    this.unsubscribers.push(unsubscribe);
  }

  private ensureSelectedAssignment(): void {
    if (this.selectedAssignmentId) return;

    if (this.teacherAssignments.length > 0) {
      this.selectedAssignmentId = this.teacherAssignments[0].id || '';
    }
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
      this.normalize(request.createdBy) === this.normalize(this.currentUser.username)
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
      this.normalize(record.createdBy) === this.normalize(this.currentUser.username)
    );
  }

  private isForSelectedAssignment(item: any): boolean {
    if (!this.selectedAssignmentId) return true;
    return this.normalize(item.assignmentId) === this.normalize(this.selectedAssignmentId);
  }

  private matchesSearch(item: any): boolean {
    const keyword = this.searchTerm.trim().toLowerCase();
    if (!keyword) return true;

    return Object.values(item).join(' ').toLowerCase().includes(keyword);
  }

  private async checkExistingAttendance(request: any): Promise<boolean> {
    const recordsRef = collection(this.firestore, 'attendanceRecords');

    const q = query(
      recordsRef,
      where('sessionId', '==', request.sessionId || ''),
      where('studentId', '==', request.studentId || ''),
    );

    const snapshot = await getDocs(q);
    return !snapshot.empty;
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private toTitleCase(value: string): string {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
