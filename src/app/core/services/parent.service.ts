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

import { Parent } from '../../models/parent.model';

@Injectable({
  providedIn: 'root',
})
export class ParentService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);
  private readonly collectionName = 'parents';

  getParents(): Observable<Parent[]> {
    return new Observable<Parent[]>((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () => {
        const parentsRef = collection(this.firestore, this.collectionName);

        return onSnapshot(
          parentsRef,
          (snapshot) => {
            const parents: Parent[] = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Parent),
            }));

            parents.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

            observer.next(parents);
          },
          (error) => observer.error(error),
        );
      });

      return () => unsubscribe();
    });
  }

  async addParent(data: Parent): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const parentsRef = collection(this.firestore, this.collectionName);

      await addDoc(parentsRef, {
        ...data,
        linkedStudentIds: data.linkedStudentIds || [],
        isArchived: false,
        archivedAt: null,
        createdAt: data.createdAt || now,
        updatedAt: now,
      });
    });
  }

  async importParents(records: Parent[]): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const parentsRef = collection(this.firestore, this.collectionName);

      await Promise.all(
        records.map((parent) =>
          addDoc(parentsRef, {
            ...parent,
            linkedStudentIds: parent.linkedStudentIds || [],
            isArchived: false,
            archivedAt: null,
            createdAt: parent.createdAt || now,
            updatedAt: now,
          }),
        ),
      );
    });
  }

  async updateParent(id: string, data: Partial<Parent>): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const parentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(parentDoc, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async archiveParent(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const parentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(parentDoc, {
        isArchived: true,
        archivedAt: now,
        updatedAt: now,
      });
    });
  }

  async restoreParent(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const parentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      await updateDoc(parentDoc, {
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async deleteParent(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) return;

    await runInInjectionContext(this.injector, async () => {
      const parentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);
      await deleteDoc(parentDoc);
    });
  }
}
