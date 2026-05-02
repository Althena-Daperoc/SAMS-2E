import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

import { StudentService } from '../../../core/services/student.service';
import { FacultyService } from '../../../core/services/faculty.service';
import { ParentService } from '../../../core/services/parent.service';
import { UserService } from '../../../core/services/user.service';
import { EmailService } from '../../../core/services/email.service';

import { Student } from '../../../models/student.model';
import { Faculty } from '../../../models/faculty.model';
import { Parent } from '../../../models/parent.model';
import { User, UserRole } from '../../../models/user.model';

type AccountTab = 'student' | 'teacher' | 'parent';

interface AccountPerson {
  recordId: string;
  username: string;
  fullName: string;
  email?: string;
  role: UserRole;
  roleLabel: string;
  subtitle: string;
  linkedStudentIds?: string[];
}

@Component({
  selector: 'app-user-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-accounts.html',
  styleUrl: './user-accounts.scss',
})
export class UserAccounts implements OnInit, OnDestroy {
  students: Student[] = [];
  faculty: Faculty[] = [];
  parents: Parent[] = [];
  users: User[] = [];

  activeTab: AccountTab = 'student';
  searchTerm = '';
  isLoading = true;
  isProcessing = false;

  private subscriptions: Subscription[] = [];

  constructor(
    private studentService: StudentService,
    private facultyService: FacultyService,
    private parentService: ParentService,
    private userService: UserService,
    private emailService: EmailService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  get people(): AccountPerson[] {
    if (this.activeTab === 'student') {
      return this.students
        .filter((student) => !student.isArchived)
        .map((student) => ({
          recordId: student.id || '',
          username: student.studentId,
          fullName: student.fullName,
          email: student.email || '',
          role: 'student',
          roleLabel: 'Student',
          subtitle: `${student.program || 'Program'} • ${student.yearLevel || 'Year Level'} • ${
            student.section || 'Section'
          }`,
        }));
    }

    if (this.activeTab === 'teacher') {
      return this.faculty
        .filter((teacher) => !teacher.isArchived)
        .map((teacher) => ({
          recordId: teacher.id || '',
          username: teacher.facultyId,
          fullName: teacher.fullName,
          email: teacher.email || '',
          role: 'teacher',
          roleLabel: 'Faculty',
          subtitle: teacher.department || 'Faculty Member',
        }));
    }

    return this.parents
      .filter((parent) => !parent.isArchived)
      .map((parent) => ({
        recordId: parent.id || '',
        username: parent.parentId,
        fullName: parent.fullName,
        email: parent.email || '',
        role: 'parent',
        roleLabel: 'Parent',
        subtitle: `${parent.linkedStudentIds?.length || 0} linked student(s)`,
        linkedStudentIds: parent.linkedStudentIds || [],
      }));
  }

  get filteredPeople(): AccountPerson[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return this.people;

    return this.people.filter((person) =>
      [person.username, person.fullName, person.email, person.roleLabel, person.subtitle]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }

  get filteredPendingPeople(): AccountPerson[] {
    return this.filteredPeople.filter((person) => !this.hasAccount(person.username));
  }

  get studentAccountCount(): number {
    return this.users.filter((user) => user.role === 'student').length;
  }

  get teacherAccountCount(): number {
    return this.users.filter((user) => user.role === 'teacher').length;
  }

  get parentAccountCount(): number {
    return this.users.filter((user) => user.role === 'parent').length;
  }

  get activeAccountCount(): number {
    return this.users.filter((user) => user.status !== 'inactive').length;
  }

  loadData(): void {
    this.isLoading = true;
    let loaded = 0;

    const markLoaded = () => {
      loaded += 1;
      if (loaded === 4) this.isLoading = false;
    };

    this.subscriptions.push(
      this.studentService.getStudents().subscribe({
        next: (data) => {
          this.students = data;
          markLoaded();
        },
        error: () => this.handleLoadError(),
      }),

      this.facultyService.getFaculty().subscribe({
        next: (data) => {
          this.faculty = data;
          markLoaded();
        },
        error: () => this.handleLoadError(),
      }),

      this.parentService.getParents().subscribe({
        next: (data) => {
          this.parents = data;
          markLoaded();
        },
        error: () => this.handleLoadError(),
      }),

      this.userService.getUsers().subscribe({
        next: (data) => {
          this.users = data;
          markLoaded();
        },
        error: () => this.handleLoadError(),
      }),
    );
  }

  setTab(tab: AccountTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  getAccount(username: string): User | undefined {
    return this.users.find((user) => user.username === username);
  }

  hasAccount(username: string): boolean {
    return !!this.getAccount(username);
  }

  getAccountStatus(username: string): 'active' | 'inactive' | 'none' {
    const account = this.getAccount(username);
    return account?.status === 'inactive' ? 'inactive' : account ? 'active' : 'none';
  }

  async generateAccount(person: AccountPerson): Promise<void> {
    if (this.hasAccount(person.username)) {
      await Swal.fire({
        title: 'Account Already Exists',
        text: `${person.fullName} already has a login account.`,
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    if (!person.email) {
      await Swal.fire({
        title: 'No Email Address',
        text: `${person.fullName} has no email address. Please add an email before generating and sending credentials.`,
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const password = this.generatePassword();
    const newUser: Omit<User, 'id'> = this.buildUserAccount(person, password);

    const result = await Swal.fire({
      title: 'Generate and Send Account?',
      html: `
        <div style="text-align:left;line-height:1.7">
          <strong>Name:</strong> ${person.fullName}<br>
          <strong>Role:</strong> ${person.roleLabel}<br>
          <strong>Username:</strong> ${person.username}<br>
          <strong>Email:</strong> ${person.email}
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Generate and Send',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    this.isProcessing = true;

    try {
      await this.userService.createUser(newUser);

      await this.emailService.sendCredentials({
        toEmail: person.email,
        fullName: person.fullName,
        username: person.username,
        password,
        role: person.roleLabel,
      });

      await Swal.fire({
        title: 'Account Created and Sent',
        text: `Login credentials were sent to ${person.email}.`,
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });
    } catch (error) {
      console.error('Generate account/email error:', error);

      await Swal.fire({
        title: 'Process Failed',
        text: 'Account generation or email sending failed. Please check EmailJS setup.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async bulkGenerateAccounts(): Promise<void> {
    const targets = this.filteredPendingPeople;

    if (targets.length === 0) {
      await Swal.fire({
        title: 'No Pending Accounts',
        text: 'All visible records already have generated accounts.',
        icon: 'info',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const noEmailCount = targets.filter((person) => !person.email).length;
    const validTargets = targets.filter((person) => !!person.email);

    if (validTargets.length === 0) {
      await Swal.fire({
        title: 'No Valid Email Addresses',
        text: 'All pending records in this view have no email address.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Generate and Send All Pending?',
      html: `
        <div style="text-align:left;line-height:1.7">
          Accounts with valid emails: <strong>${validTargets.length}</strong><br>
          Skipped because no email: <strong>${noEmailCount}</strong><br><br>
          Existing accounts will be skipped automatically.
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Generate ${validTargets.length} Account(s)`,
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    this.isProcessing = true;

    let generated = 0;
    let emailSent = 0;
    const failed: string[] = [];

    try {
      for (const person of validTargets) {
        try {
          const password = this.generatePassword();
          const newUser = this.buildUserAccount(person, password);

          await this.userService.createUser(newUser);
          generated += 1;

          await this.emailService.sendCredentials({
            toEmail: person.email || '',
            fullName: person.fullName,
            username: person.username,
            password,
            role: person.roleLabel,
          });

          emailSent += 1;
        } catch (error) {
          console.error('Bulk generation/email error:', error);
          failed.push(person.fullName);
        }
      }

      await Swal.fire({
        title: 'Bulk Process Complete',
        html: `
          <div style="text-align:left;line-height:1.7">
            <strong>Accounts Generated:</strong> ${generated}<br>
            <strong>Emails Sent:</strong> ${emailSent}<br>
            <strong>Skipped - No Email:</strong> ${noEmailCount}<br>
            <strong>Failed:</strong> ${failed.length}
            ${
              failed.length
                ? `<br><br><strong>Failed Records:</strong><br>${failed.join('<br>')}`
                : ''
            }
          </div>
        `,
        icon: failed.length ? 'warning' : 'success',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async toggleAccountStatus(person: AccountPerson): Promise<void> {
    const account = this.getAccount(person.username);

    if (!account?.id) return;

    const nextStatus = account.status === 'inactive' ? 'active' : 'inactive';

    const result = await Swal.fire({
      title: nextStatus === 'active' ? 'Activate Account?' : 'Deactivate Account?',
      text:
        nextStatus === 'active'
          ? `${person.fullName} will be able to log in again.`
          : `${person.fullName} will not be able to log in while inactive.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: nextStatus === 'active' ? 'Activate' : 'Deactivate',
      cancelButtonText: 'Cancel',
      confirmButtonColor: nextStatus === 'active' ? '#16a34a' : '#dc2626',
    });

    if (!result.isConfirmed) return;

    try {
      await this.userService.updateUser(account.id, { status: nextStatus });

      await Swal.fire({
        title: 'Account Updated',
        icon: 'success',
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Update account status error:', error);

      await Swal.fire({
        title: 'Update Failed',
        text: 'Unable to update account status.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async resetPassword(person: AccountPerson): Promise<void> {
    const account = this.getAccount(person.username);

    if (!account?.id) return;

    if (!person.email) {
      await Swal.fire({
        title: 'No Email Address',
        text: `${person.fullName} has no email address. Password reset email cannot be sent.`,
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const newPassword = this.generatePassword();

    const result = await Swal.fire({
      title: 'Reset and Send Password?',
      text: `A new temporary password will be generated and sent to ${person.email}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Reset and Send',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#f59e0b',
    });

    if (!result.isConfirmed) return;

    try {
      await this.userService.updateUser(account.id, { password: newPassword });

      await this.emailService.sendCredentials({
        toEmail: person.email,
        fullName: person.fullName,
        username: person.username,
        password: newPassword,
        role: person.roleLabel,
      });

      await Swal.fire({
        title: 'Password Reset Sent',
        text: `The new password was sent to ${person.email}.`,
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });
    } catch (error) {
      console.error('Reset password/email error:', error);

      await Swal.fire({
        title: 'Reset Failed',
        text: 'Unable to reset password or send email.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }

  private buildUserAccount(person: AccountPerson, password: string): Omit<User, 'id'> {
    return {
      username: person.username,
      password,
      fullName: person.fullName,
      role: person.role,
      email: person.email || '',
      linkedStudentIds: person.role === 'parent' ? person.linkedStudentIds || [] : [],
      status: 'active',
    };
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$';
    let password = 'SAMS-';

    for (let i = 0; i < 8; i += 1) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return password;
  }

  private async handleLoadError(): Promise<void> {
    this.isLoading = false;

    await Swal.fire({
      title: 'Loading Failed',
      text: 'Unable to load account records. Please check Firebase connection.',
      icon: 'error',
      confirmButtonColor: '#4f46e5',
    });
  }
}
