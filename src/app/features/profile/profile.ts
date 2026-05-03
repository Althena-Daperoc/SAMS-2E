import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  currentUser: User | null = null;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
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

  get statusLabel(): string {
    return this.userData?.status || 'Active';
  }

  get portalLabel(): string {
    const role = this.currentUser?.role;

    if (role === 'admin') return 'Admin Portal';
    if (role === 'teacher') return 'Faculty Portal';
    if (role === 'student') return 'Student Portal';
    if (role === 'parent') return 'Parent Portal';

    return 'SAMS Portal';
  }

  get profileDescription(): string {
    const role = this.currentUser?.role;

    if (role === 'admin') {
      return 'Manages school records, users, sections, subjects, attendance reports, and system administration.';
    }

    if (role === 'teacher') {
      return 'Handles attendance sessions, student attendance records, and faculty-related monitoring.';
    }

    if (role === 'student') {
      return 'Uses SAMS to scan attendance, view attendance history, and monitor personal records.';
    }

    if (role === 'parent') {
      return 'Monitors linked child attendance records, summaries, and school attendance updates.';
    }

    return 'Uses SAMS for attendance monitoring and account access.';
  }

  get roleDetails(): { label: string; value: string }[] {
    const role = this.currentUser?.role;

    if (role === 'admin') {
      return [
        { label: 'Access Level', value: 'Full Administrative Access' },
        { label: 'Main Responsibility', value: 'School Attendance Administration' },
        { label: 'Portal', value: 'Admin Portal' },
      ];
    }

    if (role === 'teacher') {
      return [
        { label: 'Faculty ID', value: this.userData?.facultyId || 'Not set' },
        { label: 'Department', value: this.userData?.department || 'Not set' },
        { label: 'Portal', value: 'Faculty Portal' },
      ];
    }

    if (role === 'student') {
      return [
        { label: 'Student ID', value: this.userData?.studentId || 'Not set' },
        { label: 'Program', value: this.userData?.program || 'Not set' },
        { label: 'Year Level', value: this.userData?.yearLevel || 'Not set' },
        { label: 'Section', value: this.userData?.section || 'Not set' },
      ];
    }

    if (role === 'parent') {
      return [
        { label: 'Parent ID', value: this.userData?.parentId || 'Not set' },
        { label: 'Linked Children', value: String(this.userData?.linkedStudentIds?.length || 0) },
        { label: 'Portal', value: 'Parent Portal' },
      ];
    }

    return [{ label: 'Portal', value: 'SAMS Portal' }];
  }
}
