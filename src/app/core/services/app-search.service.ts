import { Injectable } from '@angular/core';
import { User } from '../../models/user.model';

export type AppSearchItem = {
  label: string;
  route: string;
  description: string;
  keywords: string[];
  roles: User['role'][];
};

@Injectable({
  providedIn: 'root',
})
export class AppSearchService {
  private readonly items: AppSearchItem[] = [
    {
      label: 'Dashboard',
      route: '/dashboard',
      description: 'Overview of attendance activity and quick system insights.',
      keywords: ['home', 'overview', 'summary', 'main'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'Students',
      route: '/students',
      description: 'View and manage the student list.',
      keywords: ['student records', 'manage students', 'list'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'Add Student',
      route: '/students/add',
      description: 'Register a new student into the system.',
      keywords: ['new student', 'create student', 'register'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'Subjects',
      route: '/subjects',
      description: 'View and manage the subject catalog.',
      keywords: ['courses', 'classes', 'subject list'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'Create Session',
      route: '/sessions/create',
      description: 'Create a new attendance session.',
      keywords: ['new session', 'attendance session', 'class session'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'Attendance Check',
      route: '/attendance/check',
      description: 'Check and mark attendance for an active session.',
      keywords: ['mark attendance', 'scan', 'check attendance'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'Attendance Records',
      route: '/attendance/records',
      description: 'Review recorded attendance entries.',
      keywords: ['logs', 'history', 'records'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'Reports',
      route: '/reports',
      description: 'Generate and review attendance reports.',
      keywords: ['analytics', 'summary reports', 'exports'],
      roles: ['admin', 'teacher'],
    },
    {
      label: 'My Attendance',
      route: '/student/my-attendance',
      description: 'View personal attendance history.',
      keywords: ['student portal', 'my records', 'my logs'],
      roles: ['student'],
    },
  ];

  getItemsForRole(role: User['role']): AppSearchItem[] {
    return this.items.filter((item) => item.roles.includes(role));
  }

  search(query: string, role: User['role']): AppSearchItem[] {
    const cleanQuery = query.trim().toLowerCase();

    const roleItems = this.getItemsForRole(role);

    if (!cleanQuery) {
      return roleItems.slice(0, 6);
    }

    return roleItems
      .map((item) => {
        const haystack = [
          item.label,
          item.description,
          ...item.keywords,
          item.route,
        ]
          .join(' ')
          .toLowerCase();

        let score = 0;

        if (item.label.toLowerCase().includes(cleanQuery)) {
          score += 5;
        }

        if (item.description.toLowerCase().includes(cleanQuery)) {
          score += 3;
        }

        if (item.keywords.some((keyword) => keyword.toLowerCase().includes(cleanQuery))) {
          score += 2;
        }

        if (haystack.includes(cleanQuery)) {
          score += 1;
        }

        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
      .map((entry) => entry.item)
      .slice(0, 8);
  }
}