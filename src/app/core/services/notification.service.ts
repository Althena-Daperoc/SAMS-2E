import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export type NotificationRole = 'admin' | 'teacher' | 'faculty' | 'student' | 'parent';

export interface NotificationItem {
  id?: string;
  userId: string;
  role?: NotificationRole | null;
  title: string;
  message: string;
  type: string;
  redirectUrl?: string | null;
  sectionCode?: string | null;
  sessionId?: string | null;
  isRead: boolean;
  createdAt: any;
  warningKey?: string | null;
  metadata?: any;
}

export interface NotificationPayload {
  title: string;
  message: string;
  type: string;
  redirectUrl?: string | null;
  sectionCode?: string | null;
  sessionId?: string | null;
  excludeUserId?: string | null;
  warningKey?: string | null;
  metadata?: any;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private firestore = inject(Firestore);
  private absenceWarningChecks = new Set<string>();

  getUserNotifications(userId: string): Observable<NotificationItem[]> {
    return new Observable<NotificationItem[]>((observer) => {
      const cleanUserId = String(userId || '').trim();

      if (!cleanUserId) {
        observer.next([]);
        return () => {};
      }

      this.checkFacultyConsecutiveAbsenceWarnings(cleanUserId).catch((error) => {
        console.warn('Consecutive absence warning check failed:', error);
      });

      const notificationsRef = collection(this.firestore, 'notifications');

      const notificationsQuery = query(
        notificationsRef,
        where('userId', '==', cleanUserId),
        orderBy('createdAt', 'desc'),
      );

      const unsubscribe = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const notifications: NotificationItem[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<NotificationItem, 'id'>),
          }));

          observer.next(notifications);
        },
        (error) => {
          console.error('Failed to listen to notifications:', error);
          observer.error(error);
        },
      );

      return () => unsubscribe();
    });
  }

  async createNotification(
    notification: NotificationPayload & {
      userId: string;
      role?: NotificationRole | null;
    },
  ): Promise<void> {
    await this.notifyUsersByIds([notification.userId], {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      redirectUrl: notification.redirectUrl ?? null,
      sectionCode: notification.sectionCode ?? null,
      sessionId: notification.sessionId ?? null,
      excludeUserId: notification.excludeUserId ?? null,
      warningKey: notification.warningKey ?? null,
      metadata: notification.metadata ?? null,
    });
  }

  async notifyUsersByIds(userIds: string[], notification: NotificationPayload): Promise<void> {
    const cleanUserIds = Array.from(
      new Set(
        userIds
          .map((id) => String(id || '').trim())
          .filter((id) => id && id !== notification.excludeUserId),
      ),
    );

    if (!cleanUserIds.length) return;

    const notificationsRef = collection(this.firestore, 'notifications');

    for (let i = 0; i < cleanUserIds.length; i += 450) {
      const batch = writeBatch(this.firestore);
      const chunk = cleanUserIds.slice(i, i + 450);

      chunk.forEach((userId) => {
        const notificationRef = doc(notificationsRef);

        batch.set(notificationRef, {
          userId,
          role: null,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          redirectUrl: notification.redirectUrl ?? null,
          sectionCode: notification.sectionCode ?? null,
          sessionId: notification.sessionId ?? null,
          isRead: false,
          createdAt: serverTimestamp(),
          warningKey: notification.warningKey ?? null,
          metadata: notification.metadata ?? null,
        });
      });

      await batch.commit();
    }
  }

  async notifyUsersByRole(
    role: NotificationRole,
    notification: NotificationPayload,
  ): Promise<void> {
    const usersRef = collection(this.firestore, 'users');
    const usersQuery = query(usersRef, where('role', '==', role));
    const usersSnapshot = await getDocs(usersQuery);

    let targetUsers = usersSnapshot.docs.map((userDoc) => ({
      id: userDoc.id,
      ...(userDoc.data() as any),
    }));

    if (role === 'student' && notification.sectionCode) {
      targetUsers = await this.filterStudentUsersBySection(targetUsers, notification.sectionCode);
    }

    targetUsers = targetUsers.filter((user) => user.id !== notification.excludeUserId);

    if (!targetUsers.length) {
      console.warn('No notification target users found.', {
        role,
        sectionCode: notification.sectionCode,
        notification,
      });
      return;
    }

    await this.notifyUsersByIds(
      targetUsers.map((user) => user.id),
      notification,
    );
  }

  async notifySpecificUser(
    userId: string,
    notification: NotificationPayload & {
      role?: NotificationRole | null;
    },
  ): Promise<void> {
    await this.notifyUsersByIds([userId], notification);
  }

  async markAsRead(notificationId: string): Promise<void> {
    const cleanId = String(notificationId || '').trim();

    if (!cleanId) return;

    const notificationRef = doc(this.firestore, `notifications/${cleanId}`);

    await updateDoc(notificationRef, {
      isRead: true,
    });
  }

  async markAllAsRead(notifications: NotificationItem[]): Promise<void> {
    const unreadNotifications = notifications.filter(
      (notification) => !notification.isRead && notification.id,
    );

    if (!unreadNotifications.length) return;

    for (let i = 0; i < unreadNotifications.length; i += 450) {
      const batch = writeBatch(this.firestore);
      const chunk = unreadNotifications.slice(i, i + 450);

      chunk.forEach((notification) => {
        const notificationRef = doc(this.firestore, `notifications/${notification.id}`);
        batch.update(notificationRef, {
          isRead: true,
        });
      });

      await batch.commit();
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    const cleanId = String(notificationId || '').trim();

    if (!cleanId) return;

    await deleteDoc(doc(this.firestore, `notifications/${cleanId}`));
  }

  async clearUserNotifications(userId: string): Promise<void> {
    const cleanUserId = String(userId || '').trim();

    if (!cleanUserId) return;

    const notificationsRef = collection(this.firestore, 'notifications');
    const notificationsQuery = query(notificationsRef, where('userId', '==', cleanUserId));
    const snapshot = await getDocs(notificationsQuery);

    if (snapshot.empty) return;

    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(this.firestore);
      const chunk = docs.slice(i, i + 450);

      chunk.forEach((docSnap) => {
        batch.delete(doc(this.firestore, `notifications/${docSnap.id}`));
      });

      await batch.commit();
    }
  }

  private async checkFacultyConsecutiveAbsenceWarnings(userId: string): Promise<void> {
    const cleanUserId = String(userId || '').trim();

    if (!cleanUserId) return;

    if (this.absenceWarningChecks.has(cleanUserId)) return;

    this.absenceWarningChecks.add(cleanUserId);

    try {
      const usersSnapshot = await getDocs(collection(this.firestore, 'users'));

      const users = usersSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }));

      const currentUser = users.find(
        (user) => this.normalize(user.id) === this.normalize(cleanUserId),
      );

      if (!currentUser) return;

      const role = this.normalize(currentUser.role);

      if (role !== 'teacher' && role !== 'faculty') {
        return;
      }

      const attendanceSnapshot = await getDocs(collection(this.firestore, 'attendance'));
      const assignmentsSnapshot = await getDocs(collection(this.firestore, 'assignments'));
      const studentsSnapshot = await getDocs(collection(this.firestore, 'students'));
      const warningSnapshot = await getDocs(
        query(
          collection(this.firestore, 'notifications'),
          where('userId', '==', cleanUserId),
          where('type', '==', 'attendance_warning'),
        ),
      );

      const attendanceRecords = attendanceSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }));

      const assignments = assignmentsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }));

      const students = studentsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }));

      const existingWarningKeys = new Set(
        warningSnapshot.docs
          .map((docSnap) => (docSnap.data() as any)?.warningKey)
          .map((key) => String(key || '').trim())
          .filter(Boolean),
      );

      const facultyRecords = attendanceRecords.filter((record) =>
        this.isRecordHandledByFaculty(record, assignments, currentUser),
      );

      const groupedRecords = new Map<string, any[]>();

      facultyRecords.forEach((record) => {
        const studentId = String(record.studentId || '').trim();

        if (!studentId) return;

        const classKey = this.buildClassKey(record);
        const groupKey = `${studentId}__${classKey}`;

        if (!groupedRecords.has(groupKey)) {
          groupedRecords.set(groupKey, []);
        }

        groupedRecords.get(groupKey)?.push(record);
      });

      for (const [groupKey, records] of groupedRecords.entries()) {
        const sortedRecords = records
          .filter((record) => Boolean(this.normalize(record.status)))
          .filter((record) => this.getRecordTime(record) > 0)
          .sort((a, b) => this.getRecordTime(a) - this.getRecordTime(b));

        if (sortedRecords.length < 3) continue;

        const trailingAbsences: any[] = [];

        for (let index = sortedRecords.length - 1; index >= 0; index--) {
          const record = sortedRecords[index];
          const status = this.normalize(record.status);

          if (status === 'absent') {
            trailingAbsences.unshift(record);
            continue;
          }

          if (status === 'present' || status === 'late' || status === 'excused') {
            break;
          }
        }

        if (trailingAbsences.length < 3) continue;

        const firstAbsence = trailingAbsences[0];
        const latestAbsence = trailingAbsences[trailingAbsences.length - 1];

        const warningKey = `consecutive_absence__${groupKey}__${
          firstAbsence.id || firstAbsence.createdAt || firstAbsence.generatedAt || 'start'
        }`;

        if (existingWarningKeys.has(warningKey)) continue;

        const student = students.find(
          (item) =>
            this.normalize(item.studentId) === this.normalize(latestAbsence.studentId) ||
            this.normalize(item.id) === this.normalize(latestAbsence.studentDocId),
        );

        const studentName =
          student?.fullName || latestAbsence.studentName || latestAbsence.studentId || 'A student';

        const studentNumber = latestAbsence.studentId || student?.studentId || '';

        const subjectName = latestAbsence.subjectName || latestAbsence.subjectCode || 'your class';

        const sectionLabel =
          latestAbsence.sectionCode || latestAbsence.studentSection || 'selected section';

        await this.notifyUsersByIds([cleanUserId], {
          title: '3 consecutive absences warning',
          message: `${studentName}${
            studentNumber ? ` (${studentNumber})` : ''
          } has ${trailingAbsences.length} consecutive absences in ${subjectName} - ${sectionLabel}. Please verify if there is a valid reason before taking academic action.`,
          type: 'attendance_warning',
          redirectUrl: '/attendance/records',
          sectionCode: sectionLabel,
          sessionId: latestAbsence.sessionId || null,
          warningKey,
          metadata: {
            studentId: latestAbsence.studentId || '',
            studentName,
            subjectName,
            sectionCode: sectionLabel,
            consecutiveAbsenceCount: trailingAbsences.length,
            latestAttendanceRecordId: latestAbsence.id || '',
          },
        });

        existingWarningKeys.add(warningKey);
      }
    } finally {
      setTimeout(() => {
        this.absenceWarningChecks.delete(cleanUserId);
      }, 3000);
    }
  }

  private isRecordHandledByFaculty(record: any, assignments: any[], facultyUser: any): boolean {
    const facultyUserId = this.normalize(facultyUser.id);
    const facultyUsername = this.normalize(facultyUser.username);
    const facultyEmployeeId = this.normalize(
      facultyUser.employeeId || facultyUser.facultyEmployeeId,
    );
    const facultyName = this.normalize(facultyUser.fullName || facultyUser.name);

    const recordFacultyId = this.normalize(
      record.facultyId || record.instructorId || record.teacherId,
    );
    const recordFacultyName = this.normalize(
      record.facultyName || record.instructorName || record.teacherName,
    );

    if (
      (!!recordFacultyId && recordFacultyId === facultyUserId) ||
      (!!recordFacultyId && recordFacultyId === facultyUsername) ||
      (!!recordFacultyId && recordFacultyId === facultyEmployeeId) ||
      (!!recordFacultyName && recordFacultyName === facultyName)
    ) {
      return true;
    }

    const matchedAssignment = assignments.find((assignment) => {
      const assignmentId = this.normalize(assignment.id);
      const assignmentCode = this.normalize(assignment.assignmentCode);

      const recordAssignmentId = this.normalize(record.assignmentId || record.classOfferingId);
      const recordAssignmentCode = this.normalize(record.assignmentCode);

      const directMatch =
        (!!assignmentId && !!recordAssignmentId && assignmentId === recordAssignmentId) ||
        (!!assignmentCode && !!recordAssignmentCode && assignmentCode === recordAssignmentCode);

      if (!directMatch) return false;

      return this.isAssignmentHandledByFaculty(assignment, facultyUser);
    });

    if (matchedAssignment) return true;

    return assignments.some((assignment) => {
      if (!this.isAssignmentHandledByFaculty(assignment, facultyUser)) return false;

      const sameSubject =
        this.normalize(assignment.subjectCode) === this.normalize(record.subjectCode) ||
        this.normalize(assignment.subjectName) === this.normalize(record.subjectName);

      const sameSection = this.sectionsMatch(assignment.sectionCode, record.sectionCode);

      const sameSemester =
        !assignment.semester ||
        !record.semester ||
        this.normalize(assignment.semester) === this.normalize(record.semester);

      return sameSubject && sameSection && sameSemester;
    });
  }

  private isAssignmentHandledByFaculty(assignment: any, facultyUser: any): boolean {
    const facultyUserId = this.normalize(facultyUser.id);
    const facultyUsername = this.normalize(facultyUser.username);
    const facultyEmployeeId = this.normalize(
      facultyUser.employeeId || facultyUser.facultyEmployeeId,
    );
    const facultyName = this.normalize(facultyUser.fullName || facultyUser.name);

    const assignmentFacultyId = this.normalize(
      assignment.facultyId || assignment.instructorId || assignment.teacherId,
    );
    const assignmentFacultyEmployeeId = this.normalize(assignment.facultyEmployeeId);
    const assignmentFacultyName = this.normalize(
      assignment.facultyName || assignment.instructorName || assignment.teacherName,
    );

    return (
      (!!assignmentFacultyId && assignmentFacultyId === facultyUserId) ||
      (!!assignmentFacultyId && assignmentFacultyId === facultyUsername) ||
      (!!assignmentFacultyId && assignmentFacultyId === facultyEmployeeId) ||
      (!!assignmentFacultyEmployeeId && assignmentFacultyEmployeeId === facultyUsername) ||
      (!!assignmentFacultyEmployeeId && assignmentFacultyEmployeeId === facultyEmployeeId) ||
      (!!assignmentFacultyName && assignmentFacultyName === facultyName)
    );
  }

  private buildClassKey(record: any): string {
    const assignmentKey = String(
      record.assignmentId || record.classOfferingId || record.assignmentCode || '',
    ).trim();

    if (assignmentKey) {
      return assignmentKey.toLowerCase();
    }

    return [
      record.subjectCode || record.subjectName || 'subject',
      record.sectionCode || record.studentSection || 'section',
      record.semester || 'semester',
      record.schoolYear || 'schoolYear',
    ]
      .map((value) =>
        String(value || '')
          .trim()
          .toLowerCase(),
      )
      .join('__');
  }

  private getRecordTime(record: any): number {
    return (
      this.parseDate(record.submittedAt)?.getTime() ||
      this.parseDate(record.generatedAt)?.getTime() ||
      this.parseDate(record.timeRecorded)?.getTime() ||
      this.parseDate(record.createdAt)?.getTime() ||
      this.parseDate(record.updatedAt)?.getTime() ||
      0
    );
  }

  private async filterStudentUsersBySection(users: any[], sectionCode: string): Promise<any[]> {
    const targetSection = this.normalizeSection(sectionCode);

    const directUserMatches = users.filter((user) => {
      const userSections = [user.sectionCode, user.section, user.classSection, user.studentSection]
        .map((value) => this.normalizeSection(value))
        .filter(Boolean);

      return userSections.includes(targetSection);
    });

    if (directUserMatches.length) {
      return directUserMatches;
    }

    const studentsRef = collection(this.firestore, 'students');
    const studentsSnapshot = await getDocs(studentsRef);

    const matchingStudents = studentsSnapshot.docs
      .map((studentDoc) => ({
        id: studentDoc.id,
        ...(studentDoc.data() as any),
      }))
      .filter((student) => {
        const studentSections = [
          student.sectionCode,
          student.section,
          student.classSection,
          student.studentSection,
        ]
          .map((value) => this.normalizeSection(value))
          .filter(Boolean);

        return studentSections.includes(targetSection);
      });

    const matchingStudentKeys = new Set<string>();

    matchingStudents.forEach((student) => {
      [
        student.id,
        student.studentId,
        student.studentNumber,
        student.username,
        student.email,
        student.fullName,
        student.name,
      ].forEach((value) => {
        const key = this.normalizeKey(value);
        if (key) matchingStudentKeys.add(key);
      });
    });

    const matchedUsers = users.filter((user) => {
      const userKeys = [
        user.id,
        user.username,
        user.studentId,
        user.studentNumber,
        user.studentDocId,
        user.linkedStudentId,
        user.email,
        user.fullName,
        user.name,
      ]
        .map((value) => this.normalizeKey(value))
        .filter(Boolean);

      const linkedStudentIds = Array.isArray(user.linkedStudentIds)
        ? user.linkedStudentIds.map((value: any) => this.normalizeKey(value))
        : [];

      return [...userKeys, ...linkedStudentIds].some((key) => matchingStudentKeys.has(key));
    });

    console.log('Student notification section filter result:', {
      requestedSection: sectionCode,
      normalizedSection: targetSection,
      matchingStudents: matchingStudents.length,
      matchedUsers: matchedUsers.length,
    });

    return matchedUsers;
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

  private sectionsMatch(firstValue: any, secondValue: any): boolean {
    const first = this.normalizeSection(firstValue);
    const second = this.normalizeSection(secondValue);

    if (!first || !second) return false;

    return first === second || first.includes(second) || second.includes(first);
  }

  private normalizeSection(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace(/_/g, '')
      .replace('section', '')
      .replace(/^bsit/, '')
      .replace(/^it/, '')
      .replace(/^tcm/, '')
      .replace(/^emt/, '');
  }

  private normalizeKey(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private normalize(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}
