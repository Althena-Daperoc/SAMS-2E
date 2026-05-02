import { Injectable } from '@angular/core';
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

  constructor(private firestore: Firestore) {}

  getUsers(): Observable<User[]> {
    return new Observable((observer) => {
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
  }

  async createUser(user: Omit<User, 'id'>): Promise<void> {
    const ref = collection(this.firestore, this.collectionName);

    await addDoc(ref, {
      ...user,
      status: user.status || 'active',
    });
  }

  async updateUser(id: string, data: Partial<Omit<User, 'id'>>): Promise<void> {
    const ref = doc(this.firestore, `${this.collectionName}/${id}`);
    await updateDoc(ref, data);
  }

  async checkIfExists(username: string): Promise<boolean> {
    const ref = collection(this.firestore, this.collectionName);
    const q = query(ref, where('username', '==', username));
    const snapshot = await getDocs(q);

    return !snapshot.empty;
  }
}
