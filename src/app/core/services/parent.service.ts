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

import { Parent } from '../../models/parent.model';

@Injectable({
  providedIn: 'root',
})
export class ParentService {
  private readonly collectionName = 'parents';

  constructor(private firestore: Firestore) {}

  getParents(): Observable<Parent[]> {
    return new Observable((observer) => {
      const ref = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const parents: Parent[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Parent),
          }));

          observer.next(parents);
        },
        (error) => {
          observer.error(error);
        },
      );

      return () => unsubscribe();
    });
  }

  async addParent(data: Parent): Promise<void> {
    const ref = collection(this.firestore, this.collectionName);
    const now = new Date().toISOString();

    await addDoc(ref, {
      ...data,
      linkedStudentIds: data.linkedStudentIds || [],
      isArchived: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async importParents(records: Parent[]): Promise<void> {
    for (const parent of records) {
      await this.addParent(parent);
    }
  }

  async updateParent(id: string, data: Partial<Parent>): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async archiveParent(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    const now = new Date().toISOString();

    await updateDoc(ref, {
      isArchived: true,
      archivedAt: now,
      updatedAt: now,
    });
  }

  async restoreParent(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      isArchived: false,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteParent(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    await deleteDoc(ref);
  }
}
