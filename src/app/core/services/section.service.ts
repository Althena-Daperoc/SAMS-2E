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

import { Section } from '../../models/section.model';

@Injectable({
  providedIn: 'root',
})
export class SectionService {
  private readonly collectionName = 'sections';

  constructor(private firestore: Firestore) {}

  getSections(): Observable<Section[]> {
    return new Observable((observer) => {
      const ref = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        ref,
        (snapshot) => {
          const sections: Section[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Section),
          }));

          sections.sort((a, b) => (a.sectionCode || '').localeCompare(b.sectionCode || ''));

          observer.next(sections);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async addSection(data: Section): Promise<void> {
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

  async importSections(records: Section[]): Promise<void> {
    for (const section of records) {
      await this.addSection(section);
    }
  }

  async updateSection(id: string, data: Partial<Section>): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  async archiveSection(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    const now = new Date().toISOString();

    await updateDoc(ref, {
      isArchived: true,
      archivedAt: now,
      updatedAt: now,
    });
  }

  async restoreSection(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);

    await updateDoc(ref, {
      isArchived: false,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteSection(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    await deleteDoc(ref);
  }
}
