import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Session {
  private readonly collectionName = 'sessions';

  constructor(private firestore: Firestore) {}

  getSessions(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const sessionsRef = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        sessionsRef,
        (snapshot) => {
          const sessions = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          sessions.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });

          observer.next(sessions);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  getActiveSessions(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const sessionsRef = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        sessionsRef,
        (snapshot) => {
          const sessions = snapshot.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
            .filter((session: any) => String(session.status || '').toLowerCase() === 'active');

          sessions.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          });

          observer.next(sessions);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async createSession(session: any): Promise<string> {
    const sessionsRef = collection(this.firestore, this.collectionName);
    const now = new Date().toISOString();

    const docRef = await addDoc(sessionsRef, {
      ...session,
      status: session.status || 'active',
      createdAt: session.createdAt || now,
      updatedAt: now,
    });

    return docRef.id;
  }

  updateSession(id: string, session: any): Promise<void> {
    const sessionDoc = doc(this.firestore, `${this.collectionName}/${id}`);

    return updateDoc(sessionDoc, {
      ...session,
      updatedAt: new Date().toISOString(),
    });
  }

  closeSession(id: string): Promise<void> {
    const sessionDoc = doc(this.firestore, `${this.collectionName}/${id}`);

    return updateDoc(sessionDoc, {
      status: 'closed',
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  deleteSession(id: string): Promise<void> {
    const sessionDoc = doc(this.firestore, `${this.collectionName}/${id}`);
    return deleteDoc(sessionDoc);
  }
}
