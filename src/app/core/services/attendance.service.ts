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
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
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
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
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
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
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

    await runTransaction(this.firestore, async (transaction) => {
      const existingRecord = await transaction.get(attendanceDocRef);

      if (existingRecord.exists()) {
        throw new Error('Attendance already recorded for this session.');
      }

      transaction.set(attendanceDocRef, {
        ...attendanceData,
        method: attendanceData.method || 'qr_scan',
        status: attendanceData.status || 'present',
        createdAt: attendanceData.createdAt || now,
        updatedAt: now,
      });
    });

    await this.notifyTeacherAboutAttendance(attendanceData);
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

    await this.notificationService.notifyUsersByRole('teacher', {
      title: 'Attendance recorded',
      message: `${studentName} submitted ${subjectName}.`,
      type: 'attendance',
      redirectUrl: '/attendance/records',
      sectionCode: attendanceData.sectionCode || attendanceData.section || '',
    });
  }

  private createAttendanceRecordId(sessionId: string, studentId: string): string {
    return `${sessionId}_${studentId}`
      .trim()
      .replace(/[\/\\#?%&{}<>*:$!'"]/g, '-')
      .replace(/\s+/g, '-');
  }
}
