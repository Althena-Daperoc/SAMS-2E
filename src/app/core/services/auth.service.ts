import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, from, map, switchMap } from 'rxjs';

import { Auth, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';

import { User } from '../../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly storageKey = 'sams2_current_user';

  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private router: Router,
  ) {}

  login(username: string, password: string): Observable<User | null> {
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    const usersRef = collection(this.firestore, 'users');

    const userQuery = query(
      usersRef,
      where('username', '==', cleanUsername),
      where('password', '==', cleanPassword),
      where('status', '==', 'active'),
    );

    return from(getDocs(userQuery)).pipe(
      switchMap((snapshot) => {
        if (snapshot.empty) {
          return from(Promise.resolve(null));
        }

        const docSnap = snapshot.docs[0];
        const data = docSnap.data() as Omit<User, 'id'>;

        const user: User = {
          id: docSnap.id,
          ...data,
        };

        if (user.role === 'admin') {
          const adminEmail = user.email || user.username;

          return from(signInWithEmailAndPassword(this.auth, adminEmail, cleanPassword)).pipe(
            map(() => {
              localStorage.setItem(this.storageKey, JSON.stringify(user));
              return user;
            }),
          );
        }

        localStorage.setItem(this.storageKey, JSON.stringify(user));
        return from(Promise.resolve(user));
      }),
    );
  }

  async logout(): Promise<void> {
    const currentUser = this.getCurrentUser();

    localStorage.removeItem(this.storageKey);

    if (currentUser?.role === 'admin') {
      await signOut(this.auth).catch(() => null);
    }

    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    const rawUser = localStorage.getItem(this.storageKey);

    if (!rawUser) {
      return null;
    }

    try {
      return JSON.parse(rawUser) as User;
    } catch {
      localStorage.removeItem(this.storageKey);
      return null;
    }
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentUser();
  }

  hasRole(allowedRoles: string[]): boolean {
    const currentUser = this.getCurrentUser();

    if (!currentUser) {
      return false;
    }

    return allowedRoles.includes(currentUser.role);
  }
}
