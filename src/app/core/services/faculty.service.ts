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
import { Faculty } from '../../models/faculty.model';

@Injectable({
  providedIn: 'root',
})
export class FacultyService {
  private collectionName = 'faculty';

  constructor(private firestore: Firestore) {}

  getFaculty(): Observable<Faculty[]> {
    return new Observable((observer) => {
      const ref = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const facultyList: Faculty[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Faculty),
          }));

          observer.next(facultyList);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async addFaculty(data: Faculty): Promise<void> {
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

  async importFaculty(records: Faculty[]): Promise<void> {
    for (const faculty of records) {
      await this.addFaculty(faculty);
    }
  }

  async updateFaculty(id: string, data: Partial<Faculty>): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async archiveFaculty(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    const now = new Date().toISOString();

    await updateDoc(ref, {
      isArchived: true,
      archivedAt: now,
      updatedAt: now,
    });
  }

  async restoreFaculty(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      isArchived: false,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteFaculty(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    await deleteDoc(ref);
  }
}
