import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

import { StudentService } from '../../../core/services/student.service';
import { Student } from '../../../models/student.model';

type StudentTab = 'active' | 'archive';

type ImportPreviewStudent = Omit<Student, 'id'> & {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
};

@Component({
  selector: 'app-student-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-list.html',
  styleUrl: './student-list.scss',
})
export class StudentList implements OnInit, OnDestroy {
  students: Student[] = [];
  isLoading = false;
  isSaving = false;
  isImporting = false;

  activeTab: StudentTab = 'active';
  searchTerm = '';

  showEditModal = false;
  showImportModal = false;

  selectedStudent: Student | null = null;
  importPreview: ImportPreviewStudent[] = [];
  importFileName = '';

  editForm = {
    studentId: '',
    fullName: '',
    program: '',
    yearLevel: '',
    section: '',
    email: '',
    status: 'active' as 'active' | 'inactive',
  };

  private studentsSubscription?: Subscription;

  constructor(
    private studentService: StudentService,
    private router: Router,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.loadStudents();
  }

  ngOnDestroy(): void {
    this.studentsSubscription?.unsubscribe();
  }

  get activeStudents(): Student[] {
    return this.students.filter((student) => !student.isArchived);
  }

  get archivedStudents(): Student[] {
    return this.students.filter((student) => student.isArchived);
  }

  get totalStudentRecords(): number {
    return this.activeStudents.length + this.archivedStudents.length;
  }

  get visibleStudents(): Student[] {
    return this.activeTab === 'active' ? this.activeStudents : this.archivedStudents;
  }

  get filteredVisibleStudents(): Student[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) {
      return this.visibleStudents;
    }

    return this.visibleStudents.filter((student) => {
      const searchableText = [
        student.studentId,
        student.fullName,
        student.program,
        student.yearLevel,
        student.section,
        student.email,
        student.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }

  get validImportCount(): number {
    return this.importPreview.filter((student) => student.isValid).length;
  }

  get invalidImportCount(): number {
    return this.importPreview.filter((student) => !student.isValid).length;
  }

  loadStudents(): void {
    this.isLoading = true;

    this.studentsSubscription = this.studentService.getStudents().subscribe({
      next: (students) => {
        this.students = students;
        this.isLoading = false;
      },
      error: async (error) => {
        console.error('Failed to load students:', error);
        this.students = [];
        this.isLoading = false;

        await Swal.fire({
          title: 'Unable to Load Students',
          text: 'Please check your connection or Firebase configuration.',
          icon: 'error',
          confirmButtonColor: '#4f46e5',
        });
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  goToAddStudent(): void {
    this.router.navigate(['/students/add']);
  }

  setTab(tab: StudentTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  openEditModal(student: Student): void {
    this.selectedStudent = student;

    this.editForm = {
      studentId: student.studentId || '',
      fullName: student.fullName || '',
      program: student.program || '',
      yearLevel: student.yearLevel || '',
      section: student.section || '',
      email: student.email || '',
      status: student.status || 'active',
    };

    this.showEditModal = true;
  }

  closeEditModal(): void {
    if (this.isSaving) return;

    this.showEditModal = false;
    this.selectedStudent = null;
  }

  async saveStudentChanges(): Promise<void> {
    if (!this.selectedStudent?.id) return;

    if (
      !this.editForm.studentId.trim() ||
      !this.editForm.fullName.trim() ||
      !this.editForm.program.trim() ||
      !this.editForm.yearLevel.trim() ||
      !this.editForm.section.trim()
    ) {
      await Swal.fire({
        title: 'Incomplete Details',
        text: 'Please complete all required student fields before saving.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    this.isSaving = true;

    try {
      await this.studentService.updateStudent(this.selectedStudent.id, {
        studentId: this.editForm.studentId.trim(),
        fullName: this.editForm.fullName.trim(),
        program: this.editForm.program.trim(),
        yearLevel: this.editForm.yearLevel.trim(),
        section: this.editForm.section.trim(),
        email: this.editForm.email.trim() || undefined,
        status: this.editForm.status,
      });

      this.closeEditModal();

      await Swal.fire({
        title: 'Student Updated',
        text: 'The student record has been updated successfully.',
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to update student:', error);

      await Swal.fire({
        title: 'Update Failed',
        text: 'Failed to update student. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSaving = false;
    }
  }

  async toggleStudentStatus(student: Student): Promise<void> {
    if (!student.id) return;

    const newStatus = student.status === 'inactive' ? 'active' : 'inactive';

    const result = await Swal.fire({
      title: newStatus === 'active' ? 'Activate Student?' : 'Deactivate Student?',
      text:
        newStatus === 'active'
          ? `${student.fullName} will be marked as active.`
          : `${student.fullName} will be marked as inactive.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: newStatus === 'active' ? 'Yes, activate' : 'Yes, deactivate',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.studentService.updateStudent(student.id, {
        status: newStatus,
      });

      await Swal.fire({
        title: 'Status Updated',
        text: `${student.fullName} is now ${newStatus}.`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to update status:', error);

      await Swal.fire({
        title: 'Status Update Failed',
        text: 'Failed to update student status.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async archiveStudent(student: Student): Promise<void> {
    if (!student.id) return;

    const result = await Swal.fire({
      title: 'Archive Student?',
      text: `${student.fullName} will be moved to the archive. You can restore this student later.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, archive',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.studentService.archiveStudent(student.id);

      await Swal.fire({
        title: 'Archived',
        text: `${student.fullName} has been moved to the archive.`,
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to archive student:', error);

      await Swal.fire({
        title: 'Archive Failed',
        text: 'Failed to archive student. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async restoreStudent(student: Student): Promise<void> {
    if (!student.id) return;

    const result = await Swal.fire({
      title: 'Restore Student?',
      text: `${student.fullName} will be returned to the active student list.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#22c55e',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, restore',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.studentService.restoreStudent(student.id);

      await Swal.fire({
        title: 'Restored',
        text: `${student.fullName} has been restored successfully.`,
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to restore student:', error);

      await Swal.fire({
        title: 'Restore Failed',
        text: 'Failed to restore student. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async deleteStudentPermanently(student: Student): Promise<void> {
    if (!student.id) return;

    const result = await Swal.fire({
      title: 'Permanently Delete?',
      text: `${student.fullName} will be permanently deleted. This action cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete permanently',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.studentService.deleteStudentPermanently(student.id);

      await Swal.fire({
        title: 'Deleted',
        text: `${student.fullName} has been permanently deleted.`,
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to permanently delete student:', error);

      await Swal.fire({
        title: 'Delete Failed',
        text: 'Failed to permanently delete student. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  onExcelSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.importFileName = file.name;
    this.importPreview = [];

    const reader = new FileReader();

    reader.onload = async (loadEvent) => {
      try {
        const data = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
        });

        this.importPreview = this.mapExcelRows(rows);
        this.showImportModal = true;
      } catch (error) {
        console.error('Failed to read Excel file:', error);

        await Swal.fire({
          title: 'Invalid Excel File',
          text: 'Please check the file format and required columns.',
          icon: 'error',
          confirmButtonColor: '#4f46e5',
        });
      } finally {
        input.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  }

  closeImportModal(): void {
    if (this.isImporting) return;

    this.showImportModal = false;
    this.importPreview = [];
    this.importFileName = '';
  }

  async confirmImport(): Promise<void> {
    const validStudents = this.importPreview
      .filter((student) => student.isValid)
      .map(({ rowNumber, isValid, errors, ...student }) => student);

    if (!validStudents.length) {
      await Swal.fire({
        title: 'No Valid Records',
        text: 'There are no valid student records to import.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Import?',
      text: `${validStudents.length} valid student record(s) will be saved to the system.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, import',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    this.isImporting = true;

    try {
      await this.studentService.importStudents(validStudents);
      this.closeImportModal();

      await Swal.fire({
        title: 'Import Complete',
        text: `${validStudents.length} student record(s) imported successfully.`,
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to import students:', error);

      await Swal.fire({
        title: 'Import Failed',
        text: 'Failed to import students. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isImporting = false;
    }
  }

  private mapExcelRows(rows: Record<string, unknown>[]): ImportPreviewStudent[] {
    const existingStudentIds = new Set(
      this.students.map((student) => String(student.studentId).trim().toLowerCase()),
    );

    const fileStudentIds = new Set<string>();

    return rows.map((row, index) => {
      const studentId = this.getCell(row, ['Student ID', 'StudentId', 'Student Number', 'ID']);
      const fullName = this.getCell(row, ['Full Name', 'Name', 'Student Name']);
      const program = this.getCell(row, ['Program', 'Course']);
      const yearLevel = this.getCell(row, ['Year Level', 'Year']);
      const section = this.getCell(row, ['Section', 'Class Section']);
      const email = this.getCell(row, ['Email', 'Email Address']);

      const errors: string[] = [];
      const normalizedStudentId = studentId.toLowerCase();

      if (!studentId) errors.push('Missing Student ID');
      if (!fullName) errors.push('Missing Full Name');
      if (!program) errors.push('Missing Program');
      if (!yearLevel) errors.push('Missing Year Level');
      if (!section) errors.push('Missing Section');

      if (studentId && existingStudentIds.has(normalizedStudentId)) {
        errors.push('Student ID already exists');
      }

      if (studentId && fileStudentIds.has(normalizedStudentId)) {
        errors.push('Duplicate Student ID in file');
      }

      if (studentId) {
        fileStudentIds.add(normalizedStudentId);
      }

      return {
        rowNumber: index + 2,
        studentId,
        fullName,
        program,
        yearLevel,
        section,
        email: email || undefined,
        status: 'active',
        isArchived: false,
        isValid: errors.length === 0,
        errors,
      };
    });
  }

  private getCell(row: Record<string, unknown>, possibleKeys: string[]): string {
    const normalizedRow = Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
      acc[key.trim().toLowerCase()] = row[key];
      return acc;
    }, {});

    for (const key of possibleKeys) {
      const value = normalizedRow[key.trim().toLowerCase()];

      if (value !== undefined && value !== null) {
        return String(value).trim();
      }
    }

    return '';
  }
}
