import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Auth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from '@angular/fire/auth';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import Swal from 'sweetalert2';

import { AuthService } from '../../core/services/auth.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  currentUser: User | null = null;

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  isSavingPassword = false;
  isDarkMode = false;

  private readonly themeStorageKey = 'sams_theme_mode';

  constructor(
    private authService: AuthService,
    private firestore: Firestore,
    private auth: Auth,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadThemeState();
  }

  get userData(): any {
    return this.currentUser as any;
  }

  get displayName(): string {
    return this.currentUser?.fullName || 'Unknown User';
  }

  get displayEmail(): string {
    return this.currentUser?.email || this.currentUser?.username || 'No email available';
  }

  get roleLabel(): string {
    const role = this.currentUser?.role;

    if (role === 'admin') return 'Administrator';
    if (role === 'teacher') return 'Faculty';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';

    return 'User';
  }

  get initials(): string {
    return (
      this.displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((name) => name[0])
        .join('')
        .toUpperCase() || 'U'
    );
  }

  get accountTypeLabel(): string {
    if (this.currentUser?.role === 'admin') {
      return 'Firebase Auth Account';
    }

    return 'SAMS Portal Account';
  }

  async changePassword(): Promise<void> {
    if (!this.currentUser) {
      await Swal.fire('Account Error', 'No logged-in user was found.', 'error');
      return;
    }

    if (!this.currentPassword.trim()) {
      await Swal.fire('Required', 'Please enter your current password.', 'warning');
      return;
    }

    if (!this.newPassword.trim()) {
      await Swal.fire('Required', 'Please enter your new password.', 'warning');
      return;
    }

    if (this.newPassword.length < 6) {
      await Swal.fire('Weak Password', 'New password must be at least 6 characters.', 'warning');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      await Swal.fire(
        'Password Mismatch',
        'New password and confirm password do not match.',
        'warning',
      );
      return;
    }

    if (this.currentPassword === this.newPassword) {
      await Swal.fire(
        'No Change Detected',
        'New password must be different from your current password.',
        'warning',
      );
      return;
    }

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'Change Password?',
      text: 'Your account password will be updated.',
      showCancelButton: true,
      confirmButtonText: 'Yes, update',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#6d5dfc',
    });

    if (!confirm.isConfirmed) return;

    this.isSavingPassword = true;

    try {
      if (this.currentUser.role === 'admin') {
        await this.updateAdminPassword();
      } else {
        await this.updatePortalPassword();
      }

      this.clearPasswordFields();

      await Swal.fire({
        icon: 'success',
        title: 'Password Updated',
        text: 'Your password has been changed successfully.',
        confirmButtonColor: '#6d5dfc',
      });
    } catch (error: any) {
      await Swal.fire({
        icon: 'error',
        title: 'Password Update Failed',
        text: this.getPasswordErrorMessage(error),
        confirmButtonColor: '#6d5dfc',
      });
    } finally {
      this.isSavingPassword = false;
    }
  }

  clearPasswordFields(): void {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.applyTheme(this.isDarkMode);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.themeStorageKey, this.isDarkMode ? 'dark' : 'light');
    }
  }

  private async updateAdminPassword(): Promise<void> {
    const firebaseUser = this.auth.currentUser;

    if (!firebaseUser || !firebaseUser.email) {
      throw new Error('No active Firebase admin account found. Please log in again.');
    }

    const credential = EmailAuthProvider.credential(firebaseUser.email, this.currentPassword);

    await reauthenticateWithCredential(firebaseUser, credential);
    await updatePassword(firebaseUser, this.newPassword);
  }

  private async updatePortalPassword(): Promise<void> {
    const userId = this.userData?.id || this.userData?.uid;

    if (!userId) {
      throw new Error('User document ID was not found.');
    }

    const userRef = doc(this.firestore, `users/${userId}`);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error('User account record was not found.');
    }

    const userRecord = userSnap.data() as any;
    const savedPassword = userRecord?.password;

    if (savedPassword && savedPassword !== this.currentPassword) {
      throw new Error('Current password is incorrect.');
    }

    await updateDoc(userRef, {
      password: this.newPassword,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    });

    const updatedUser = {
      ...this.userData,
      password: this.newPassword,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    localStorage.setItem('loggedInUser', JSON.stringify(updatedUser));
    localStorage.setItem('user', JSON.stringify(updatedUser));

    this.currentUser = updatedUser as User;
  }

  private loadThemeState(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const savedTheme = localStorage.getItem(this.themeStorageKey);
    this.isDarkMode = savedTheme === 'dark';

    this.applyTheme(this.isDarkMode);
  }

  private applyTheme(isDark: boolean): void {
    this.document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  private getPasswordErrorMessage(error: any): string {
    if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
      return 'Your current password is incorrect.';
    }

    if (error?.code === 'auth/requires-recent-login') {
      return 'Please log out, log in again, then try changing your password.';
    }

    if (error?.code === 'auth/weak-password') {
      return 'Your new password is too weak.';
    }

    return error?.message || 'Something went wrong while updating your password.';
  }
}
