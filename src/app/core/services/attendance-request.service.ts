import { Injectable } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AttendanceRequestService {
  private readonly collectionName = 'attendanceRequests';

  constructor(private firestore: Firestore) {}

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
    const ref = collection(this.firestore, this.collectionName);
    const now = new Date().toISOString();

    await addDoc(ref, {
      ...data,
      status: 'pending',
      requestType: data.requestType || 'irregular_or_sit_in',
      createdAt: now,
      updatedAt: now,
    });
  }

  approveRequest(id: string, approvedBy: string, approvedByName: string): Promise<void> {
    const requestDoc = doc(this.firestore, `${this.collectionName}/${id}`);
    const now = new Date().toISOString();

    return updateDoc(requestDoc, {
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
}
