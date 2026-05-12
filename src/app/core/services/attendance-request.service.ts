import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  runTransaction,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class AttendanceRequestService {
  private readonly collectionName = 'attendanceRequests';

  constructor(
    private firestore: Firestore,
    private notificationService: NotificationService,
  ) {}

  getRequests(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const ref = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const requests = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          requests.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });

          observer.next(requests);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async hasPendingRequest(sessionId: string, studentId: string): Promise<boolean> {
    const ref = collection(this.firestore, this.collectionName);

    const requestQuery = query(
      ref,
      where('sessionId', '==', sessionId),
      where('studentId', '==', studentId),
      where('status', '==', 'pending'),
    );

    const snapshot = await getDocs(requestQuery);
    return !snapshot.empty;
  }

  async createRequest(data: any): Promise<void> {
    if (!data?.sessionId || !data?.studentId) {
      throw new Error('Missing session or student information.');
    }

    const now = new Date().toISOString();

    const requestId = `${data.sessionId}_${data.studentId}`
      .trim()
      .replace(/[\/\\#?%&{}<>*:$!'"]/g, '-')
      .replace(/\s+/g, '-');

    const requestDocRef = doc(this.firestore, `${this.collectionName}/${requestId}`);

    await runTransaction(this.firestore, async (transaction) => {
      const existingRequest = await transaction.get(requestDocRef);

      if (existingRequest.exists()) {
        const existingData: any = existingRequest.data();

        if (existingData.status === 'pending') {
          throw new Error('Request already pending.');
        }

        if (existingData.status === 'approved') {
          throw new Error('Request already approved.');
        }
      }

      transaction.set(requestDocRef, {
        ...data,
        status: 'pending',
        requestType: data.requestType || 'irregular_or_sit_in',
        createdAt: now,
        updatedAt: now,
      });
    });

    await this.notifyTeacherAboutRequest(data);
  }

  async approveRequest(id: string, approvedBy: string, approvedByName: string): Promise<void> {
    const requestRef = doc(this.firestore, `${this.collectionName}/${id}`);
    const now = new Date().toISOString();

    await updateDoc(requestRef, {
      status: 'approved',
      approvedBy,
      approvedByName,
      approvedAt: now,
      updatedAt: now,
    });
  }

  rejectRequest(
    id: string,
    rejectedBy: string,
    rejectedByName: string,
    rejectionReason: string,
  ): Promise<void> {
    const requestDoc = doc(this.firestore, `${this.collectionName}/${id}`);
    const now = new Date().toISOString();

    return updateDoc(requestDoc, {
      status: 'rejected',
      rejectedBy,
      rejectedByName,
      rejectionReason,
      rejectedAt: now,
      updatedAt: now,
    });
  }

  private async notifyTeacherAboutRequest(data: any): Promise<void> {
    const teacherUserId = String(data.facultyId || '').trim();

    if (!teacherUserId) return;

    await this.notificationService.notifyUsersByIds([teacherUserId], {
      title: 'Attendance request pending',
      message: `${data.studentName || 'A student'} sent an attendance request for ${
        data.subjectName || data.subjectCode || 'your class'
      }.`,
      type: 'attendance_request',
      redirectUrl: '/attendance/records',
      sectionCode: data.sectionCode || '',
      sessionId: data.sessionId || null,
    });
  }
}
