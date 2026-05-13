import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
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
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);
  private readonly collectionName = 'subjects';

  getSubjects(): Observable<Subject[]> {
    return new Observable<Subject[]>((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () => {
        const subjectsRef = collection(this.firestore, this.collectionName);

        return onSnapshot(
          subjectsRef,
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
      });

      return () => unsubscribe();
    });
  }

  async addSubject(data: Subject): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const subjectsRef = collection(this.firestore, this.collectionName);

      await addDoc(subjectsRef, {
        ...data,
        isArchived: false,
        archivedAt: null,
        createdAt: data.createdAt || now,
        updatedAt: now,
      });
    });
  }

  async importSubjects(records: Subject[]): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const subjectsRef = collection(this.firestore, this.collectionName);

      await Promise.all(
        records.map((subject) =>
          addDoc(subjectsRef, {
            ...subject,
            isArchived: false,
            archivedAt: null,
            createdAt: subject.createdAt || now,
            updatedAt: now,
          }),
        ),
      );
    });
  }

  async updateSubject(id: string, data: Partial<Subject>): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const subjectDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(subjectDoc, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async archiveSubject(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const subjectDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(subjectDoc, {
        isArchived: true,
        archivedAt: now,
        updatedAt: now,
      });
    });
  }

  async restoreSubject(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const subjectDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(subjectDoc, {
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async deleteSubject(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const subjectDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);
      await deleteDoc(subjectDoc);
    });
  }
}
