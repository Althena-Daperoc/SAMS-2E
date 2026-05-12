import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  getDoc,
  runTransaction,
  onSnapshot,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class Attendance {
  private readonly collectionName = 'attendance';

  constructor(
    private firestore: Firestore,
    private notificationService: NotificationService,
  ) {}

  getAttendanceRecords(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const attendanceRef = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        attendanceRef,
        (snapshot) => {
          const records = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          records.sort((a: any, b: any) => {
            const dateA =
              this.parseDate(
                a.submittedAt || a.generatedAt || a.createdAt || a.updatedAt,
              )?.getTime() || 0;

            const dateB =
              this.parseDate(
                b.submittedAt || b.generatedAt || b.createdAt || b.updatedAt,
              )?.getTime() || 0;

            return dateB - dateA;
          });

          observer.next(records);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  getAttendanceByStudent(studentId: string): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const attendanceRef = collection(this.firestore, this.collectionName);
      const attendanceQuery = query(attendanceRef, where('studentId', '==', studentId));

      const unsubscribe = onSnapshot(
        attendanceQuery,
        (snapshot) => {
          const records = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          records.sort((a: any, b: any) => {
            const dateA =
              this.parseDate(
                a.submittedAt || a.generatedAt || a.createdAt || a.updatedAt,
              )?.getTime() || 0;

            const dateB =
              this.parseDate(
                b.submittedAt || b.generatedAt || b.createdAt || b.updatedAt,
              )?.getTime() || 0;

            return dateB - dateA;
          });

          observer.next(records);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  getAttendanceByStudentDocId(studentDocId: string): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const attendanceRef = collection(this.firestore, this.collectionName);
      const attendanceQuery = query(attendanceRef, where('studentDocId', '==', studentDocId));

      const unsubscribe = onSnapshot(
        attendanceQuery,
        (snapshot) => {
          const records = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          records.sort((a: any, b: any) => {
            const dateA =
              this.parseDate(
                a.submittedAt || a.generatedAt || a.createdAt || a.updatedAt,
              )?.getTime() || 0;

            const dateB =
              this.parseDate(
                b.submittedAt || b.generatedAt || b.createdAt || b.updatedAt,
              )?.getTime() || 0;

            return dateB - dateA;
          });

          observer.next(records);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async hasAttendanceRecord(sessionId: string, studentId: string): Promise<boolean> {
    if (!sessionId || !studentId) return false;

    const safeDocId = this.createAttendanceRecordId(sessionId, studentId);
    const deterministicDocRef = doc(this.firestore, `${this.collectionName}/${safeDocId}`);

    const attendanceRef = collection(this.firestore, this.collectionName);
    const legacyDuplicateQuery = query(
      attendanceRef,
      where('sessionId', '==', sessionId),
      where('studentId', '==', studentId),
    );

    const legacySnapshot = await getDocs(legacyDuplicateQuery);

    if (!legacySnapshot.empty) return true;

    let exists = false;

    await runTransaction(this.firestore, async (transaction) => {
      const deterministicSnapshot = await transaction.get(deterministicDocRef);
      exists = deterministicSnapshot.exists();
    });

    return exists;
  }

  async recordAttendance(attendanceData: any): Promise<void> {
    if (!attendanceData?.sessionId || !attendanceData?.studentId) {
      throw new Error('Missing session or student information.');
    }

    const now = new Date().toISOString();

    const safeDocId = this.createAttendanceRecordId(
      attendanceData.sessionId,
      attendanceData.studentId,
    );

    const attendanceDocRef = doc(this.firestore, `${this.collectionName}/${safeDocId}`);
    const sessionDocRef = doc(this.firestore, `sessions/${attendanceData.sessionId}`);
    const attendanceRef = collection(this.firestore, this.collectionName);

    const legacyDuplicateQuery = query(
      attendanceRef,
      where('sessionId', '==', attendanceData.sessionId),
      where('studentId', '==', attendanceData.studentId),
    );

    const legacyDuplicateSnapshot = await getDocs(legacyDuplicateQuery);

    if (!legacyDuplicateSnapshot.empty) {
      throw new Error('Attendance already recorded for this session.');
    }

    let savedAttendanceData: any = null;

    await runTransaction(this.firestore, async (transaction) => {
      const existingRecord = await transaction.get(attendanceDocRef);
      const sessionSnapshot = await transaction.get(sessionDocRef);

      if (existingRecord.exists()) {
        throw new Error('Attendance already recorded for this session.');
      }

      if (!sessionSnapshot.exists()) {
        throw new Error('Attendance session was not found.');
      }

      const sessionData = {
        id: sessionSnapshot.id,
        ...sessionSnapshot.data(),
      };

      this.validateSessionCanAcceptAttendance(sessionData);

      const computedAttendance = this.applySessionStatusRules(attendanceData, sessionData, now);

      savedAttendanceData = {
        ...computedAttendance,

        sessionId: attendanceData.sessionId,
        studentId: attendanceData.studentId,

        method: computedAttendance.method || 'qr_scan',
        status: computedAttendance.status,

        createdAt: computedAttendance.createdAt || now,
        updatedAt: now,
      };

      transaction.set(attendanceDocRef, this.stripUndefined(savedAttendanceData));
    });

    await this.notifyTeacherAboutAttendance(savedAttendanceData || attendanceData);
  }

  updateAttendance(id: string, attendanceData: any): Promise<void> {
    const attendanceDoc = doc(this.firestore, `${this.collectionName}/${id}`);

    return updateDoc(attendanceDoc, {
      ...attendanceData,
      updatedAt: new Date().toISOString(),
    });
  }

  deleteAttendance(id: string): Promise<void> {
    const attendanceDoc = doc(this.firestore, `${this.collectionName}/${id}`);
    return deleteDoc(attendanceDoc);
  }

  private validateSessionCanAcceptAttendance(sessionData: any): void {
    const status = String(sessionData?.status || '')
      .trim()
      .toLowerCase();

    if (status !== 'active') {
      throw new Error('This attendance session is already closed.');
    }

    if (sessionData?.isActive === false) {
      throw new Error('This attendance session is inactive.');
    }

    const now = new Date();
    const startTime = this.getSessionStartTime(sessionData, now);
    const endTime = this.getSessionEndTime(sessionData);

    if (startTime && now.getTime() < startTime.getTime()) {
      throw new Error('This attendance session has not started yet.');
    }

    if (endTime && now.getTime() > endTime.getTime()) {
      throw new Error('This attendance session has already expired.');
    }
  }

  private applySessionStatusRules(attendanceData: any, sessionData: any, nowIso: string): any {
    const incomingStatus = String(attendanceData?.status || '')
      .trim()
      .toLowerCase();
    const incomingMethod = String(attendanceData?.method || '')
      .trim()
      .toLowerCase();

    /*
      Preserve statuses that should not be recalculated.
      Auto-absent, excused, and imported records should stay as explicitly given.
    */
    if (
      incomingStatus === 'absent' ||
      incomingStatus === 'excused' ||
      incomingMethod.includes('auto_absent') ||
      incomingMethod.includes('imported_excel')
    ) {
      return {
        ...attendanceData,
        status: incomingStatus || attendanceData.status,
        submittedAt: attendanceData.submittedAt || nowIso,
        attendanceDecisionSource: 'attendance_service_preserved_status',
        attendanceDecisionCheckedAt: nowIso,
      };
    }

    const submittedAtDate = this.parseDate(attendanceData?.submittedAt) || new Date(nowIso);
    const lateAfterMinutes = this.getLateAfterMinutes(attendanceData, sessionData);
    const lateStartsAt = this.getLateStartsAt(attendanceData, sessionData, submittedAtDate);

    if (!lateStartsAt) {
      return {
        ...attendanceData,
        status: 'present',
        lateMinutes: 0,
        lateAfterMinutes,
        submittedAt: submittedAtDate.toISOString(),
        attendanceDecisionSource: 'attendance_service_no_late_rule_found',
        attendanceDecisionCheckedAt: nowIso,
      };
    }

    const isLate = submittedAtDate.getTime() >= lateStartsAt.getTime();
    const lateMilliseconds = submittedAtDate.getTime() - lateStartsAt.getTime();
    const lateMinutes = isLate ? Math.max(1, Math.ceil(lateMilliseconds / 60000)) : 0;

    const finalStatus = isLate ? 'late' : 'present';

    console.log('[SAMS 2 Attendance Service Decision]', {
      sessionId: sessionData?.id,
      studentId: attendanceData?.studentId,
      incomingStatus,
      finalStatus,
      submittedAt: submittedAtDate.toISOString(),
      startTime: this.getSessionStartTime(sessionData, submittedAtDate)?.toISOString(),
      lateStartsAt: lateStartsAt.toISOString(),
      lateAfterMinutes,
      lateMinutes,
      endTime: this.getSessionEndTime(sessionData)?.toISOString(),
    });

    return {
      ...attendanceData,

      status: finalStatus,
      lateMinutes,
      lateAfterMinutes,
      lateThresholdMinutes: lateAfterMinutes,
      lateStartsAt: lateStartsAt.toISOString(),
      submittedAt: submittedAtDate.toISOString(),

      sessionStartTime: this.getSessionStartTime(sessionData, submittedAtDate)?.toISOString() || '',
      sessionEndTime: this.getSessionEndTime(sessionData)?.toISOString() || '',

      remarks: isLate
        ? `Submitted late by ${lateMinutes} minute${lateMinutes > 1 ? 's' : ''} at ${submittedAtDate.toLocaleString()}`
        : attendanceData.remarks || `Submitted on time at ${submittedAtDate.toLocaleString()}`,

      attendanceDecisionSource: 'attendance_service_session_rule',
      attendanceDecisionCheckedAt: nowIso,
    };
  }

  private getLateAfterMinutes(attendanceData: any, sessionData: any): number {
    const value = Number(
      sessionData?.lateAfterMinutes ||
        sessionData?.lateThresholdMinutes ||
        attendanceData?.lateAfterMinutes ||
        attendanceData?.lateThresholdMinutes ||
        1,
    );

    if (!Number.isFinite(value) || value <= 0) return 1;

    return Math.floor(value);
  }

  private getLateStartsAt(
    attendanceData: any,
    sessionData: any,
    submittedAtDate: Date,
  ): Date | null {
    const directLateDate =
      this.parseDate(sessionData?.lateStartsAt) || this.parseDate(attendanceData?.lateStartsAt);

    if (directLateDate) {
      return directLateDate;
    }

    const startDate = this.getSessionStartTime(sessionData, submittedAtDate);

    if (!startDate) return null;

    const lateAfterMinutes = this.getLateAfterMinutes(attendanceData, sessionData);

    return new Date(startDate.getTime() + lateAfterMinutes * 60 * 1000);
  }

  private getSessionStartTime(sessionData: any, fallbackDate = new Date()): Date | null {
    const directStart =
      this.parseDate(sessionData?.startTime) ||
      this.parseDate(sessionData?.createdAt) ||
      this.parseDate(sessionData?.qrTokenUpdatedAt) ||
      this.parseDate(sessionData?.generatedAt);

    if (directStart) return directStart;

    const endDate = this.getSessionEndTime(sessionData);
    const durationMinutes = Number(sessionData?.durationMinutes || 0);

    if (endDate && Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return new Date(endDate.getTime() - durationMinutes * 60 * 1000);
    }

    return fallbackDate;
  }

  private getSessionEndTime(sessionData: any): Date | null {
    return (
      this.parseDate(sessionData?.autoCloseAt) ||
      this.parseDate(sessionData?.expiresAt) ||
      this.parseDate(sessionData?.endTime)
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

  private stripUndefined(value: any): any {
    const cleaned: any = {};

    Object.keys(value || {}).forEach((key) => {
      if (value[key] !== undefined) {
        cleaned[key] = value[key];
      }
    });

    return cleaned;
  }

  private async notifyTeacherAboutAttendance(attendanceData: any): Promise<void> {
    const studentName =
      attendanceData.studentName ||
      attendanceData.fullName ||
      attendanceData.name ||
      attendanceData.studentId ||
      'A student';

    const subjectName =
      attendanceData.subjectName ||
      attendanceData.subject ||
      attendanceData.sessionTitle ||
      'attendance';

    const statusLabel = attendanceData.status
      ? ` as ${String(attendanceData.status).toUpperCase()}`
      : '';

    const facultyId =
      attendanceData.facultyId ||
      attendanceData.teacherId ||
      attendanceData.createdBy ||
      attendanceData.createdById ||
      '';

    const payload = {
      title: 'Attendance recorded',
      message: `${studentName} submitted ${subjectName}${statusLabel}.`,
      type: 'attendance',
      redirectUrl: '/attendance/records',
      sectionCode: attendanceData.sectionCode || attendanceData.section || '',
      sessionId: attendanceData.sessionId || null,
    };

    if (String(facultyId).trim()) {
      await this.notificationService.notifyUsersByIds([facultyId], payload);
      return;
    }

    console.warn(
      'Attendance notification used teacher role fallback because facultyId/teacherId is missing.',
      attendanceData,
    );

    await this.notificationService.notifyUsersByRole('teacher', payload);
  }

  private createAttendanceRecordId(sessionId: string, studentId: string): string {
    return `${sessionId}_${studentId}`
      .trim()
      .replace(/[\/\\#?%&{}<>*:$!'"]/g, '-')
      .replace(/\s+/g, '-');
  }
}
