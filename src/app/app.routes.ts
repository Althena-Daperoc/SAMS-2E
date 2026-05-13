import { Routes } from '@angular/router';

import { Login } from './features/auth/login/login';
import { Dashboard } from './features/dashboard/dashboard/dashboard';

import { StudentList } from './features/students/student-list/student-list';
import { StudentForm } from './features/students/student-form/student-form';

import { SubjectList } from './features/subjects/subject-list/subject-list';
import { Reports } from './features/reports/reports/reports';

import { FacultyPage } from './features/admin/faculty/faculty';
import { Parents } from './features/admin/parents/parents';
import { Sections } from './features/admin/sections/sections';
import { Assignments } from './features/admin/assignments/assignments';
import { UserAccounts } from './features/admin/user-accounts/user-accounts';

import { CreateSession } from './features/sessions/create-session/create-session';
import { AttendanceRecords } from './features/attendance/attendance-records/attendance-records';
import { AttendanceCheck } from './features/attendance/attendance-check/attendance-check';

import { ParentDashboard } from './features/parent-portal/parent-dashboard/parent-dashboard';
import { ChildAttendance } from './features/parent-portal/child-attendance/child-attendance';

import { StudentDashboard } from './features/student-portal/student-dashboard/student-dashboard';
import { MyAttendance } from './features/student-portal/my-attendance/my-attendance';

import { Messages } from './features/messages/messages';

import { Profile } from './features/profile/profile';
import { Settings } from './features/settings/settings';
import { Faqs } from './features/faqs/faqs';

import { MainLayout } from './layout/main-layout/main-layout';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      {
        path: 'profile',
        component: Profile,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },
      {
        path: 'settings',
        component: Settings,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },
      {
        path: 'faqs',
        component: Faqs,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },
      {
        path: 'dashboard',
        component: Dashboard,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher'] },
      },
      {
        path: 'students',
        component: StudentList,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'students/add',
        component: StudentForm,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'admin/faculty',
        component: FacultyPage,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'admin/parents',
        component: Parents,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'subjects',
        component: SubjectList,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'admin/sections',
        component: Sections,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'admin/assignments',
        component: Assignments,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'admin/user-accounts',
        component: UserAccounts,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'reports',
        component: Reports,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher'] },
      },
      {
        path: 'sessions/create',
        component: CreateSession,
        canActivate: [roleGuard],
        data: { roles: ['teacher'] },
      },
      {
        path: 'attendance/records',
        component: AttendanceRecords,
        canActivate: [roleGuard],
        data: { roles: ['teacher'] },
      },
      {
        path: 'messages',
        component: Messages,
        canActivate: [roleGuard],
        data: { roles: ['teacher', 'student'] },
      },
      {
        path: 'student/dashboard',
        component: StudentDashboard,
        canActivate: [roleGuard],
        data: { roles: ['student'] },
      },
      {
        path: 'student/scan-attendance',
        component: AttendanceCheck,
        canActivate: [roleGuard],
        data: { roles: ['student'] },
      },
      {
        path: 'student/my-attendance',
        component: MyAttendance,
        canActivate: [roleGuard],
        data: { roles: ['student'] },
      },
      {
        path: 'parent/dashboard',
        component: ParentDashboard,
        canActivate: [roleGuard],
        data: { roles: ['parent'] },
      },
      {
        path: 'parent/child-attendance',
        component: ChildAttendance,
        canActivate: [roleGuard],
        data: { roles: ['parent'] },
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
