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

import { Subject } from '../../models/subject.model';

@Injectable({
  providedIn: 'root',
})
export class SubjectService {
  private readonly collectionName = 'subjects';

  constructor(private firestore: Firestore) {}

  getSubjects(): Observable<Subject[]> {
    return new Observable((observer) => {
      const ref = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const subjects: Subject[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Subject),
          }));

          subjects.sort((a, b) => (a.subjectCode || '').localeCompare(b.subjectCode || ''));

          observer.next(subjects);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async addSubject(data: Subject): Promise<void> {
    const ref = collection(this.firestore, this.collectionName);
    const now = new Date().toISOString();

    await addDoc(ref, {
      ...data,
      isArchived: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async importSubjects(records: Subject[]): Promise<void> {
    for (const subject of records) {
      await this.addSubject(subject);
    }
  }

  async updateSubject(id: string, data: Partial<Subject>): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async archiveSubject(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    const now = new Date().toISOString();

    await updateDoc(ref, {
      isArchived: true,
      archivedAt: now,
      updatedAt: now,
    });
  }

  async restoreSubject(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      isArchived: false,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteSubject(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    await deleteDoc(ref);
  }
}
