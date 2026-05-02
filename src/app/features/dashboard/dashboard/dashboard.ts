import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../models/user.model';

type QuickModule = {
  title: string;
  description: string;
  route: string;
  tag: string;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  currentUser: User | null = null;

  adminModules: QuickModule[] = [
    {
      title: 'Students',
      description: 'Manage student records, program details, year level, and section information.',
      route: '/students',
      tag: 'Learners',
    },
    {
      title: 'Faculty',
      description: 'Manage faculty records and prepare them for class attendance handling.',
      route: '/admin/faculty',
      tag: 'Personnel',
    },
    {
      title: 'Parents',
      description: 'Manage parent records and link guardians to enrolled students.',
      route: '/admin/parents',
      tag: 'Guardians',
    },
    {
      title: 'Subjects',
      description: 'Maintain the list of academic subjects used for attendance sessions.',
      route: '/subjects',
      tag: 'Academics',
    },
    {
      title: 'Sections',
      description: 'Organize students by program, year level, and class section.',
      route: '/admin/sections',
      tag: 'Classes',
    },
    {
      title: 'Assignments',
      description: 'Assign faculty, subjects, and sections for proper attendance monitoring.',
      route: '/admin/assignments',
      tag: 'Scheduling',
    },
    {
      title: 'User Accounts',
      description: 'Generate and manage login access for faculty, students, and parents.',
      route: '/admin/user-accounts',
      tag: 'Access',
    },
    {
      title: 'Reports',
      description: 'Review attendance summaries, records, and monitoring reports.',
      route: '/reports',
      tag: 'Monitoring',
    },
  ];

  teacherModules: QuickModule[] = [
    {
      title: 'Create Session',
      description: 'Start an attendance session for assigned classes.',
      route: '/sessions/create',
      tag: 'Attendance',
    },
    {
      title: 'Attendance Records',
      description: 'Review student attendance records for handled classes.',
      route: '/attendance/records',
      tag: 'Records',
    },
    {
      title: 'Reports',
      description: 'View attendance summaries for assigned subjects and sections.',
      route: '/reports',
      tag: 'Monitoring',
    },
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {
    this.currentUser = this.authService.getCurrentUser();
  }

  get displayName(): string {
    return this.currentUser?.fullName || 'User';
  }

  get roleLabel(): string {
    if (this.currentUser?.role === 'admin') {
      return 'School Administrator';
    }

    if (this.currentUser?.role === 'teacher') {
      return 'Faculty Member';
    }

    return 'User';
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
  }

  get modules(): QuickModule[] {
    return this.isAdmin ? this.adminModules : this.teacherModules;
  }

  goTo(route: string): void {
    this.router.navigate([route]);
  }
}
