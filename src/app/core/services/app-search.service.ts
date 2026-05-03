import { Injectable } from '@angular/core';
import { Firestore, collection, onSnapshot } from '@angular/fire/firestore';
import { User } from '../../models/user.model';

export type AppSearchItem = {
  label: string;
  route: string;
  description: string;
  keywords: string[];
  roles: User['role'][];
  category?: string;
};

@Injectable({
  providedIn: 'root',
})
export class AppSearchService {
  private readonly staticItems: AppSearchItem[] = [
    {
      label: 'Dashboard',
      route: '/dashboard',
      description: 'Overview of attendance activity and quick system insights.',
      keywords: ['home', 'overview', 'summary', 'main'],
      roles: ['admin', 'teacher'],
      category: 'Module',
    },
    {
      label: 'Students',
      route: '/students',
      description: 'View and manage the student list.',
      keywords: ['student records', 'manage students', 'list'],
      roles: ['admin', 'teacher'],
      category: 'Module',
    },
    {
      label: 'Faculty',
      route: '/admin/faculty',
      description: 'Manage faculty records.',
      keywords: ['teacher', 'instructor', 'faculty records'],
      roles: ['admin'],
      category: 'Module',
    },
    {
      label: 'Parents',
      route: '/admin/parents',
      description: 'Manage parent accounts and linked students.',
      keywords: ['parent records', 'guardian'],
      roles: ['admin'],
      category: 'Module',
    },
    {
      label: 'Subjects',
      route: '/subjects',
      description: 'View and manage subject catalog.',
      keywords: ['courses', 'classes', 'subject list'],
      roles: ['admin', 'teacher'],
      category: 'Module',
    },
    {
      label: 'Sections',
      route: '/admin/sections',
      description: 'Manage class sections.',
      keywords: ['section', 'year level', 'program'],
      roles: ['admin'],
      category: 'Module',
    },
    {
      label: 'Create Session',
      route: '/sessions/create',
      description: 'Create a new attendance session.',
      keywords: ['new session', 'attendance session', 'class session'],
      roles: ['admin', 'teacher'],
      category: 'Module',
    },
    {
      label: 'Attendance Records',
      route: '/attendance/records',
      description: 'Review recorded attendance entries.',
      keywords: ['logs', 'history', 'records'],
      roles: ['admin', 'teacher'],
      category: 'Module',
    },
    {
      label: 'Reports',
      route: '/reports',
      description: 'Generate and review attendance reports.',
      keywords: ['analytics', 'summary reports', 'exports'],
      roles: ['admin', 'teacher'],
      category: 'Module',
    },
    {
      label: 'Messages',
      route: '/messages',
      description: 'Open real-time conversations.',
      keywords: ['chat', 'conversation', 'message'],
      roles: ['teacher', 'student'],
      category: 'Module',
    },
    {
      label: 'Student Dashboard',
      route: '/student/dashboard',
      description: 'View student attendance overview.',
      keywords: ['student home', 'student portal'],
      roles: ['student'],
      category: 'Module',
    },
    {
      label: 'Scan Attendance',
      route: '/student/scan-attendance',
      description: 'Scan or enter a session code.',
      keywords: ['qr', 'scan', 'session code'],
      roles: ['student'],
      category: 'Module',
    },
    {
      label: 'My Attendance',
      route: '/student/my-attendance',
      description: 'View personal attendance history.',
      keywords: ['student portal', 'my records', 'my logs'],
      roles: ['student'],
      category: 'Module',
    },
    {
      label: 'Parent Dashboard',
      route: '/parent/dashboard',
      description: 'Monitor linked child attendance.',
      keywords: ['parent portal', 'child summary'],
      roles: ['parent'],
      category: 'Module',
    },
    {
      label: 'Child Attendance',
      route: '/parent/child-attendance',
      description: 'View child attendance history.',
      keywords: ['child records', 'attendance monitoring'],
      roles: ['parent'],
      category: 'Module',
    },
    {
      label: 'FAQs / Help',
      route: '/faqs',
      description: 'Learn how to use SAMS.',
      keywords: ['help', 'faq', 'guide'],
      roles: ['admin', 'teacher', 'student', 'parent'],
      category: 'Help',
    },
  ];

  private firebaseItems: AppSearchItem[] = [];
  private unsubscribeListeners: Array<() => void> = [];

  constructor(private firestore: Firestore) {
    this.listenToFirebaseData();
  }

  getItemsForRole(role: User['role']): AppSearchItem[] {
    return [...this.staticItems, ...this.firebaseItems].filter((item) => item.roles.includes(role));
  }

  search(query: string, role: User['role']): AppSearchItem[] {
    const cleanQuery = query.trim().toLowerCase();
    const roleItems = this.getItemsForRole(role);

    if (!cleanQuery) {
      return roleItems.slice(0, 8);
    }

    return roleItems
      .map((item) => {
        const haystack = [
          item.label,
          item.description,
          item.category || '',
          ...item.keywords,
          item.route,
        ]
          .join(' ')
          .toLowerCase();

        let score = 0;

        if (item.label.toLowerCase() === cleanQuery) score += 10;
        if (item.label.toLowerCase().startsWith(cleanQuery)) score += 7;
        if (item.label.toLowerCase().includes(cleanQuery)) score += 5;
        if (item.description.toLowerCase().includes(cleanQuery)) score += 3;
        if (item.keywords.some((keyword) => keyword.toLowerCase().includes(cleanQuery))) score += 2;
        if (haystack.includes(cleanQuery)) score += 1;

        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
      .map((entry) => entry.item)
      .slice(0, 10);
  }

  private listenToFirebaseData(): void {
    this.listenToStudents();
    this.listenToFacultyUsers();
    this.listenToParentUsers();
    this.listenToSubjects();
    this.listenToSections();
    this.listenToSessions();
    this.listenToAttendance();
    this.listenToConversations();
  }

  private listenToStudents(): void {
    const ref = collection(this.firestore, 'students');

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      this.replaceCategory(
        'Student Record',
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            label: data.fullName || data.name || data.studentName || 'Unnamed Student',
            route: '/students',
            description: `Student record${data.studentId ? ` • ${data.studentId}` : ''}${
              data.section ? ` • ${data.section}` : ''
            }`,
            keywords: [
              data.studentId,
              data.fullName,
              data.name,
              data.email,
              data.program,
              data.yearLevel,
              data.section,
              data.sectionCode,
            ].filter(Boolean),
            roles: ['admin', 'teacher'],
            category: 'Student Record',
          } as AppSearchItem;
        }),
      );
    });

    this.unsubscribeListeners.push(unsubscribe);
  }

  private listenToFacultyUsers(): void {
    const ref = collection(this.firestore, 'users');

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const facultyItems = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter((user) => user.role === 'teacher')
        .map((user) => {
          return {
            label: user.fullName || user.name || 'Unnamed Faculty',
            route: '/admin/faculty',
            description: `Faculty account${user.email ? ` • ${user.email}` : ''}`,
            keywords: [
              user.fullName,
              user.name,
              user.email,
              user.facultyId,
              user.department,
              user.section,
              user.sectionCode,
            ].filter(Boolean),
            roles: ['admin'],
            category: 'Faculty Record',
          } as AppSearchItem;
        });

      const parentItems = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter((user) => user.role === 'parent')
        .map((user) => {
          return {
            label: user.fullName || user.name || 'Unnamed Parent',
            route: '/admin/parents',
            description: `Parent account${user.email ? ` • ${user.email}` : ''}`,
            keywords: [user.fullName, user.name, user.email, user.contactNumber].filter(Boolean),
            roles: ['admin'],
            category: 'Parent Record',
          } as AppSearchItem;
        });

      this.replaceMultipleCategories(
        ['Faculty Record', 'Parent Record'],
        [...facultyItems, ...parentItems],
      );
    });

    this.unsubscribeListeners.push(unsubscribe);
  }

  private listenToParentUsers(): void {
    // Parent records already come from users listener.
  }

  private listenToSubjects(): void {
    const ref = collection(this.firestore, 'subjects');

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      this.replaceCategory(
        'Subject Record',
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            label: data.subjectName || data.name || data.title || 'Unnamed Subject',
            route: '/subjects',
            description: `Subject record${data.subjectCode ? ` • ${data.subjectCode}` : ''}`,
            keywords: [
              data.subjectCode,
              data.subjectName,
              data.name,
              data.title,
              data.description,
              data.units,
            ].filter(Boolean),
            roles: ['admin', 'teacher'],
            category: 'Subject Record',
          } as AppSearchItem;
        }),
      );
    });

    this.unsubscribeListeners.push(unsubscribe);
  }

  private listenToSections(): void {
    const ref = collection(this.firestore, 'sections');

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      this.replaceCategory(
        'Section Record',
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            label: data.sectionName || data.name || data.sectionCode || 'Unnamed Section',
            route: '/admin/sections',
            description: `Section record${data.program ? ` • ${data.program}` : ''}${
              data.yearLevel ? ` • ${data.yearLevel}` : ''
            }`,
            keywords: [
              data.sectionName,
              data.name,
              data.sectionCode,
              data.program,
              data.yearLevel,
              data.adviser,
            ].filter(Boolean),
            roles: ['admin'],
            category: 'Section Record',
          } as AppSearchItem;
        }),
      );
    });

    this.unsubscribeListeners.push(unsubscribe);
  }

  private listenToSessions(): void {
    const ref = collection(this.firestore, 'sessions');

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      this.replaceCategory(
        'Attendance Session',
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            label:
              data.subjectName ||
              data.subject ||
              data.title ||
              data.sessionTitle ||
              'Attendance Session',
            route: data.status === 'active' ? '/student/scan-attendance' : '/attendance/records',
            description: `Session${data.status ? ` • ${data.status}` : ''}${
              data.sectionCode || data.section ? ` • ${data.sectionCode || data.section}` : ''
            }`,
            keywords: [
              data.sessionCode,
              data.subjectName,
              data.subject,
              data.title,
              data.sessionTitle,
              data.sectionCode,
              data.section,
              data.teacherName,
              data.status,
            ].filter(Boolean),
            roles: ['admin', 'teacher', 'student'],
            category: 'Attendance Session',
          } as AppSearchItem;
        }),
      );
    });

    this.unsubscribeListeners.push(unsubscribe);
  }

  private listenToAttendance(): void {
    const ref = collection(this.firestore, 'attendance');

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      this.replaceCategory(
        'Attendance Record',
        snapshot.docs.slice(0, 80).map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            label: data.studentName || data.fullName || data.studentId || 'Attendance Record',
            route: '/attendance/records',
            description: `Attendance${data.status ? ` • ${data.status}` : ''}${
              data.subjectName || data.subject ? ` • ${data.subjectName || data.subject}` : ''
            }`,
            keywords: [
              data.studentName,
              data.fullName,
              data.studentId,
              data.status,
              data.subjectName,
              data.subject,
              data.section,
              data.sectionCode,
              data.sessionCode,
            ].filter(Boolean),
            roles: ['admin', 'teacher'],
            category: 'Attendance Record',
          } as AppSearchItem;
        }),
      );
    });

    this.unsubscribeListeners.push(unsubscribe);
  }

  private listenToConversations(): void {
    const ref = collection(this.firestore, 'conversations');

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      this.replaceCategory(
        'Conversation',
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;

          return {
            label: data.name || data.lastMessage || 'Conversation',
            route: '/messages',
            description: `Message conversation${data.lastMessage ? ` • ${data.lastMessage}` : ''}`,
            keywords: [
              data.name,
              data.lastMessage,
              ...(Array.isArray(data.participantNames) ? data.participantNames : []),
              ...(Array.isArray(data.participantRoles) ? data.participantRoles : []),
              data.sectionCode,
            ].filter(Boolean),
            roles: ['teacher', 'student'],
            category: 'Conversation',
          } as AppSearchItem;
        }),
      );
    });

    this.unsubscribeListeners.push(unsubscribe);
  }

  private replaceCategory(category: string, newItems: AppSearchItem[]): void {
    this.firebaseItems = [
      ...this.firebaseItems.filter((item) => item.category !== category),
      ...newItems,
    ];
  }

  private replaceMultipleCategories(categories: string[], newItems: AppSearchItem[]): void {
    this.firebaseItems = [
      ...this.firebaseItems.filter((item) => !categories.includes(item.category || '')),
      ...newItems,
    ];
  }
}
