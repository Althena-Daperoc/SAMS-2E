import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, from, map, switchMap } from 'rxjs';

import { Auth, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';

import { User, UserRole } from '../../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly storageKey = 'sams2_current_user';
  private readonly legacyStorageKeys = ['currentUser', 'loggedInUser', 'user'];

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
              this.setCurrentUser(user);
              return user;
            }),
          );
        }

        this.setCurrentUser(user);
        return from(Promise.resolve(user));
      }),
    );
  }

  async logout(): Promise<void> {
    const currentUser = this.getCurrentUser();

    this.clearStoredSession();

    if (currentUser?.role === 'admin') {
      await signOut(this.auth).catch(() => null);
    }

    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    const rawUser = localStorage.getItem(this.storageKey);

    if (!rawUser) {
      this.clearLegacyStorageKeys();
      return null;
    }

    try {
      return JSON.parse(rawUser) as User;
    } catch {
      this.clearStoredSession();
      return null;
    }
  }

  setCurrentUser(user: User): void {
    localStorage.setItem(this.storageKey, JSON.stringify(user));
    this.clearLegacyStorageKeys();
  }

  updateStoredCurrentUser(updatedFields: Partial<User>): User | null {
    const currentUser = this.getCurrentUser();

    if (!currentUser) {
      return null;
    }

    const updatedUser: User = {
      ...currentUser,
      ...updatedFields,
    };

    this.setCurrentUser(updatedUser);
    return updatedUser;
  }

  clearStoredSession(): void {
    localStorage.removeItem(this.storageKey);
    this.clearLegacyStorageKeys();
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

  getDefaultRouteByRole(role: UserRole): string {
    switch (role) {
      case 'admin':
        return '/dashboard';

      case 'teacher':
        return '/dashboard';

      case 'student':
        return '/student/dashboard';

      case 'parent':
        return '/parent/dashboard';

      default:
        return '/login';
    }
  }

  private clearLegacyStorageKeys(): void {
    this.legacyStorageKeys.forEach((key) => localStorage.removeItem(key));
  }
}
