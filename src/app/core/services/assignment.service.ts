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

import { Assignment } from '../../models/assignment.model';

@Injectable({
  providedIn: 'root',
})
export class AssignmentService {
  private readonly collectionName = 'assignments';
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  getAssignments(): Observable<Assignment[]> {
    return new Observable<Assignment[]>((observer) => {
      return runInInjectionContext(this.injector, () => {
        const ref = collection(this.firestore, this.collectionName);

        const unsubscribe = onSnapshot(
          ref,
          (snapshot) => {
            const assignments: Assignment[] = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Assignment),
            }));

            assignments.sort((a, b) => {
              const syCompare = (b.schoolYear || '').localeCompare(a.schoolYear || '');
              if (syCompare !== 0) return syCompare;

              return (a.assignmentCode || '').localeCompare(b.assignmentCode || '');
            });

            observer.next(assignments);
          },
          (error) => observer.error(error),
        );

        return () => unsubscribe();
      });
    });
  }

  async addAssignment(data: Assignment): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const ref = collection(this.firestore, this.collectionName);

      await addDoc(ref, {
        ...data,
        isArchived: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  async importAssignments(records: Assignment[]): Promise<void> {
    for (const record of records) {
      await this.addAssignment(record);
    }
  }

  async updateAssignment(id: string, data: Partial<Assignment>): Promise<void> {
    await runInInjectionContext(this.injector, async () => {
      const ref = doc(this.firestore, `${this.collectionName}/${id}`);

      await updateDoc(ref, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async archiveAssignment(id: string): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const ref = doc(this.firestore, `${this.collectionName}/${id}`);

      await updateDoc(ref, {
        isArchived: true,
        archivedAt: now,
        updatedAt: now,
      });
    });
  }

  async restoreAssignment(id: string): Promise<void> {
    await runInInjectionContext(this.injector, async () => {
      const ref = doc(this.firestore, `${this.collectionName}/${id}`);

      await updateDoc(ref, {
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async deleteAssignment(id: string): Promise<void> {
    await runInInjectionContext(this.injector, async () => {
      const ref = doc(this.firestore, `${this.collectionName}/${id}`);
      await deleteDoc(ref);
    });
  }
}
