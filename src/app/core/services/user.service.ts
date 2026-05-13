import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { User } from '../../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly collectionName = 'users';
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  getUsers(): Observable<User[]> {
    return new Observable<User[]>((observer) => {
      return runInInjectionContext(this.injector, () => {
        const ref = collection(this.firestore, this.collectionName);

        const unsubscribe = onSnapshot(
          ref,
          (snapshot) => {
            const users: User[] = snapshot.docs.map((docSnap) => {
              const data = docSnap.data() as Omit<User, 'id'>;

              return {
                id: docSnap.id,
                ...data,
              };
            });

            observer.next(users);
          },
          (error) => observer.error(error),
        );

        return () => unsubscribe();
      });
    });
  }

  async createUser(user: Omit<User, 'id'>): Promise<void> {
    await runInInjectionContext(this.injector, async () => {
      const ref = collection(this.firestore, this.collectionName);

      await addDoc(ref, {
        ...user,
        status: user.status || 'active',
      });
    });
  }

  async updateUser(id: string, data: Partial<Omit<User, 'id'>>): Promise<void> {
    await runInInjectionContext(this.injector, async () => {
      const ref = doc(this.firestore, `${this.collectionName}/${id}`);
      await updateDoc(ref, data);
    });
  }

  async checkIfExists(username: string): Promise<boolean> {
    return await runInInjectionContext(this.injector, async () => {
      const ref = collection(this.firestore, this.collectionName);
      const q = query(ref, where('username', '==', username));
      const snapshot = await getDocs(q);

      return !snapshot.empty;
    });
  }
}
