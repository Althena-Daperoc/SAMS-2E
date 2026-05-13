import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  docData,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocs,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';

import { Student, StudentParentLinkPayload } from '../../models/student.model';
import { Parent } from '../../models/parent.model';

@Injectable({
  providedIn: 'root',
})
export class StudentService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  private readonly collectionName = 'students';
  private readonly parentsCollectionName = 'parents';

  getStudents(): Observable<Student[]> {
    return new Observable<Student[]>((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () => {
        const studentsRef = collection(this.firestore, this.collectionName);

        return onSnapshot(
          studentsRef,
          (snapshot) => {
            const students = snapshot.docs.map((docSnap) => {
              return {
                id: docSnap.id,
                ...(docSnap.data() as Omit<Student, 'id'>),
              };
            });

            students.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

            observer.next(students);
          },
          (error) => observer.error(error),
        );
      });

      return () => unsubscribe();
    });
  }

  getStudentById(id: string): Observable<Student | undefined> {
    const cleanId = String(id || '').trim();

    return runInInjectionContext(this.injector, () => {
      const studentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);
      return docData(studentDoc, { idField: 'id' }) as Observable<Student | undefined>;
    });
  }

  async addStudent(student: Omit<Student, 'id'>): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const studentsRef = collection(this.firestore, this.collectionName);

      await addDoc(studentsRef, {
        ...student,
        isArchived: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  async addStudentWithParent(
    student: Omit<Student, 'id'>,
    parent?: StudentParentLinkPayload | null,
  ): Promise<void> {
    const now = new Date().toISOString();

    const studentDocRef = await runInInjectionContext(this.injector, async () => {
      const studentsRef = collection(this.firestore, this.collectionName);

      return await addDoc(studentsRef, {
        ...student,
        isArchived: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    if (parent && this.hasCompleteParentDetails(parent)) {
      await this.createOrUpdateParentLink(parent, studentDocRef.id);
    }
  }

  async importStudents(students: Omit<Student, 'id'>[]): Promise<void> {
    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, async () => {
      const studentsRef = collection(this.firestore, this.collectionName);

      await Promise.all(
        students.map((student) =>
          addDoc(studentsRef, {
            ...student,
            isArchived: false,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
    });
  }

  updateStudent(id: string, student: Partial<Student>): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) {
      return Promise.resolve();
    }

    return runInInjectionContext(this.injector, () => {
      const studentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      return updateDoc(studentDoc, {
        ...student,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  archiveStudent(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) {
      return Promise.resolve();
    }

    const now = new Date().toISOString();

    return runInInjectionContext(this.injector, () => {
      const studentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      return updateDoc(studentDoc, {
        isArchived: true,
        archivedAt: now,
        updatedAt: now,
      });
    });
  }

  restoreStudent(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) {
      return Promise.resolve();
    }

    return runInInjectionContext(this.injector, () => {
      const studentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);

      return updateDoc(studentDoc, {
        isArchived: false,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  deleteStudentPermanently(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) {
      return Promise.resolve();
    }

    return runInInjectionContext(this.injector, () => {
      const studentDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);
      return deleteDoc(studentDoc);
    });
  }

  async getCurrentStudentsOnce(): Promise<Student[]> {
    return firstValueFrom(this.getStudents());
  }

  private hasCompleteParentDetails(parent: StudentParentLinkPayload): boolean {
    return !!(
      parent.fullName.trim() &&
      parent.email.trim() &&
      parent.contactNumber.trim() &&
      parent.relationship
    );
  }

  private async createOrUpdateParentLink(
    parent: StudentParentLinkPayload,
    studentDocId: string,
  ): Promise<void> {
    const parentEmail = parent.email.trim().toLowerCase();

    const existingParentSnapshot = await runInInjectionContext(this.injector, () => {
      const parentsRef = collection(this.firestore, this.parentsCollectionName);
      const existingParentQuery = query(parentsRef, where('email', '==', parentEmail));

      return getDocs(existingParentQuery);
    });

    const now = new Date().toISOString();

    if (!existingParentSnapshot.empty) {
      const existingParentDoc = existingParentSnapshot.docs[0];
      const existingParent = existingParentDoc.data() as Parent;
      const existingLinkedStudentIds = existingParent.linkedStudentIds || [];

      const updatedLinkedStudentIds = existingLinkedStudentIds.includes(studentDocId)
        ? existingLinkedStudentIds
        : [...existingLinkedStudentIds, studentDocId];

      await runInInjectionContext(this.injector, async () => {
        const parentDoc = doc(
          this.firestore,
          `${this.parentsCollectionName}/${existingParentDoc.id}`,
        );

        await updateDoc(parentDoc, {
          fullName: parent.fullName.trim(),
          contactNumber: parent.contactNumber.trim(),
          relationship: parent.relationship,
          linkedStudentIds: updatedLinkedStudentIds,
          status: existingParent.status || 'active',
          isArchived: existingParent.isArchived || false,
          archivedAt: existingParent.archivedAt || null,
          updatedAt: now,
        });
      });

      return;
    }

    await runInInjectionContext(this.injector, async () => {
      const parentsRef = collection(this.firestore, this.parentsCollectionName);

      await addDoc(parentsRef, {
        parentId: parent.parentId?.trim() || this.generateParentId(),
        fullName: parent.fullName.trim(),
        email: parentEmail,
        contactNumber: parent.contactNumber.trim(),
        relationship: parent.relationship,
        linkedStudentIds: [studentDocId],
        status: 'active',
        isArchived: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  private generateParentId(): string {
    const timestamp = Date.now().toString().slice(-6);
    return `PAR-${timestamp}`;
  }
}
