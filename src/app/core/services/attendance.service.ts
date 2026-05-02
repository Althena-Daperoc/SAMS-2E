import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
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

@Injectable({
  providedIn: 'root',
})
export class Attendance {
  private readonly collectionName = 'attendance';

  constructor(private firestore: Firestore) {}

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

  async recordAttendance(attendanceData: any): Promise<void> {
    const attendanceRef = collection(this.firestore, this.collectionName);

    const duplicateQuery = query(
      attendanceRef,
      where('sessionId', '==', attendanceData.sessionId),
      where('studentId', '==', attendanceData.studentId),
    );

    await runTransaction(this.firestore, async () => {
      const duplicateSnapshot = await getDocs(duplicateQuery);

      if (!duplicateSnapshot.empty) {
        throw new Error('Attendance already recorded for this session.');
      }

      await addDoc(attendanceRef, {
        ...attendanceData,
        method: attendanceData.method || 'qr_scan',
        status: attendanceData.status || 'present',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
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
}
