import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';
import { User } from '../../models/user.model';

type FaqItem = {
  question: string;
  answer: string;
  roles: Array<'admin' | 'teacher' | 'student' | 'parent' | 'all'>;
};

@Component({
  selector: 'app-faqs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './faqs.html',
  styleUrl: './faqs.scss',
})
export class Faqs implements OnInit {
  currentUser: User | null = null;
  activeIndex = 0;

  readonly faqs: FaqItem[] = [
    {
      question: 'What is SAMS?',
      answer:
        'SAMS is a Student Attendance Monitoring System used to manage students, faculty, sections, attendance sessions, attendance records, reports, and parent monitoring.',
      roles: ['all'],
    },
    {
      question: 'How do I change my password?',
      answer:
        'Open the profile dropdown in the topbar, choose Settings, then use the Change Password section. Enter your current password, new password, and confirmation password.',
      roles: ['all'],
    },
    {
      question: 'Why should I change the temporary password sent through email?',
      answer:
        'Temporary credentials are generated for first-time access. Changing the password helps keep your account secure and prevents unauthorized access.',
      roles: ['teacher', 'student', 'parent'],
    },
    {
      question: 'What can the Admin manage?',
      answer:
        'The Admin can manage students, faculty, parents, subjects, sections, assignments, user accounts, attendance reports, and overall attendance monitoring.',
      roles: ['admin'],
    },
    {
      question: 'Can the Admin manually take attendance?',
      answer:
        'In SAMS, the Admin mainly monitors and manages records. Attendance is usually submitted through student scanning or teacher attendance sessions.',
      roles: ['admin'],
    },
    {
      question: 'How does a teacher create an attendance session?',
      answer:
        'Go to Create Session, choose the needed class or subject details, generate the session, then let students scan the QR code or enter the session code.',
      roles: ['teacher'],
    },
    {
      question: 'Where can teachers view attendance results?',
      answer:
        'Teachers can open Attendance Records to review submitted attendance, filter records, and verify class attendance history.',
      roles: ['teacher'],
    },
    {
      question: 'How do students submit attendance?',
      answer:
        'Students can go to Scan Attendance and either scan the QR code shown by the teacher or enter the session code if scanning is not available.',
      roles: ['student'],
    },
    {
      question: 'Why is my attendance not showing?',
      answer:
        'Your attendance may not appear if the session was expired, the scan was not completed, the code was incorrect, or the record has not been saved yet.',
      roles: ['student'],
    },
    {
      question: 'Where can students check their attendance history?',
      answer:
        'Students can open My Attendance to view their recorded attendance, statuses, dates, subjects, and recent attendance activity.',
      roles: ['student'],
    },
    {
      question: 'What can parents see in SAMS?',
      answer:
        'Parents can view their linked child or children, monitor attendance statuses, and check attendance history through the Parent Portal.',
      roles: ['parent'],
    },
    {
      question: 'Why does a parent account show no linked child?',
      answer:
        'This usually means the parent account is not yet linked to a student record. The Admin must link the parent account to the correct student document.',
      roles: ['parent', 'admin'],
    },
    {
      question: 'Who can use Messages?',
      answer:
        'Messages are available for students and teachers. Students can communicate with classmates and faculty, while teachers can communicate with students.',
      roles: ['teacher', 'student'],
    },
    {
      question: 'What should I do if I see incorrect attendance?',
      answer:
        'Students or parents should contact the assigned teacher. Teachers or admins can review the record depending on the attendance workflow.',
      roles: ['all'],
    },
  ];

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
  }

  get roleLabel(): string {
    const role = this.currentUser?.role;

    if (role === 'admin') return 'Administrator';
    if (role === 'teacher') return 'Teacher';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';

    return 'User';
  }

  get visibleFaqs(): FaqItem[] {
    const role = this.currentUser?.role;

    return this.faqs.filter((faq) => {
      return faq.roles.includes('all') || (!!role && faq.roles.includes(role));
    });
  }

  setActive(index: number): void {
    this.activeIndex = this.activeIndex === index ? -1 : index;
  }
}
