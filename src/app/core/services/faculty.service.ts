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

import { Faculty } from '../../models/faculty.model';

@Injectable({
  providedIn: 'root',
})
export class FacultyService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);
  private readonly collectionName = 'faculty';

  getFaculty(): Observable<Faculty[]> {
    return new Observable<Faculty[]>((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () => {
        const facultyRef = collection(this.firestore, this.collectionName);

        return onSnapshot(
          facultyRef,
          (snapshot) => {
            const facultyList: Faculty[] = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Faculty),
            }));

            facultyList.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

            observer.next(facultyList);
          },
          (error) => observer.error(error),
        );
      });

      return () => unsubscribe();
    });
  }

  async addFaculty(data: Faculty): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const facultyRef = collection(this.firestore, this.collectionName);

      await addDoc(facultyRef, {
        ...data,
        isArchived: false,
        archivedAt: null,
        createdAt: data.createdAt || now,
        updatedAt: now,
      });
    });
  }

  async importFaculty(records: Faculty[]): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const facultyRef = collection(this.firestore, this.collectionName);

      await Promise.all(
        records.map((faculty) =>
          addDoc(facultyRef, {
            ...faculty,
            isArchived: false,
            archivedAt: null,
            createdAt: faculty.createdAt || now,
            updatedAt: now,
          }),
        ),
      );
    });
  }

  async updateFaculty(id: string, data: Partial<Faculty>): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const facultyDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(facultyDoc, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async archiveFaculty(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const facultyDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(facultyDoc, {
        isArchived: true,
        archivedAt: now,
        updatedAt: now,
      });
    });
  }

  async restoreFaculty(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const facultyDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(facultyDoc, {
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async deleteFaculty(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const facultyDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);
      await deleteDoc(facultyDoc);
    });
  }
}
