import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

import { AssignmentService } from '../../../core/services/assignment.service';
import { FacultyService } from '../../../core/services/faculty.service';
import { SubjectService } from '../../../core/services/subject.service';
import { SectionService } from '../../../core/services/section.service';

import { Assignment } from '../../../models/assignment.model';
import { Faculty } from '../../../models/faculty.model';
import { Subject } from '../../../models/subject.model';
import { Section } from '../../../models/section.model';

type AssignmentTab = 'active' | 'archive';
type Semester = '1st Semester' | '2nd Semester' | 'Summer';

interface ImportPreviewAssignment extends Assignment {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
}

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assignments.html',
  styleUrl: './assignments.scss',
})
export class Assignments implements OnInit, OnDestroy {
  assignments: Assignment[] = [];
  facultyList: Faculty[] = [];
  subjects: Subject[] = [];
  sections: Section[] = [];

  activeTab: AssignmentTab = 'active';
  searchTerm = '';

  isLoading = false;
  isSaving = false;
  isImporting = false;

  showFormModal = false;
  showImportModal = false;
  isEditing = false;

  selectedAssignment: Assignment | null = null;
  importFileName = '';
  importPreview: ImportPreviewAssignment[] = [];

  form = {
    facultyId: '',
    subjectId: '',
    sectionId: '',
    schoolYear: this.getDefaultSchoolYear(),
    semester: '1st Semester' as Semester,
    status: 'active' as 'active' | 'inactive',
  };

  private subscriptions: Subscription[] = [];

  constructor(
    private assignmentService: AssignmentService,
    private facultyService: FacultyService,
    private subjectService: SubjectService,
    private sectionService: SectionService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  get activeAssignments(): Assignment[] {
    return this.assignments.filter((item) => !item.isArchived);
  }

  get archivedAssignments(): Assignment[] {
    return this.assignments.filter((item) => item.isArchived);
  }

  get visibleAssignments(): Assignment[] {
    return this.activeTab === 'active' ? this.activeAssignments : this.archivedAssignments;
  }

  get filteredAssignments(): Assignment[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return this.visibleAssignments;

    return this.visibleAssignments.filter((item) => {
      const text = [
        item.assignmentCode,
        item.facultyEmployeeId,
        item.facultyName,
        item.subjectCode,
        item.subjectName,
        item.sectionCode,
        item.program,
        this.formatProgram(item.program),
        item.yearLevel,
        item.schoolYear,
        item.semester,
        item.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(keyword);
    });
  }

  get activeFacultyOptions(): Faculty[] {
    return this.facultyList
      .filter((item) => !item.isArchived && item.status !== 'inactive')
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  get activeSubjectOptions(): Subject[] {
    return this.subjects
      .filter((item) => !item.isArchived && item.status !== 'inactive')
      .sort((a, b) => (a.subjectCode || '').localeCompare(b.subjectCode || ''));
  }

  get activeSectionOptions(): Section[] {
    return this.sections
      .filter((item) => !item.isArchived && item.status !== 'inactive')
      .sort((a, b) => (a.sectionCode || '').localeCompare(b.sectionCode || ''));
  }

  get validImportCount(): number {
    return this.importPreview.filter((item) => item.isValid).length;
  }

  get invalidImportCount(): number {
    return this.importPreview.filter((item) => !item.isValid).length;
  }

  loadData(): void {
    this.isLoading = true;

    let loaded = 0;
    const done = () => {
      loaded += 1;
      if (loaded >= 4) this.isLoading = false;
    };

    this.subscriptions.push(
      this.assignmentService.getAssignments().subscribe({
        next: (data) => {
          this.assignments = data;
          done();
        },
        error: (error) => this.handleLoadError(error, 'assignments'),
      }),

      this.facultyService.getFaculty().subscribe({
        next: (data) => {
          this.facultyList = data;
          done();
        },
        error: (error) => this.handleLoadError(error, 'faculty'),
      }),

      this.subjectService.getSubjects().subscribe({
        next: (data) => {
          this.subjects = data;
          done();
        },
        error: (error) => this.handleLoadError(error, 'subjects'),
      }),

      this.sectionService.getSections().subscribe({
        next: (data) => {
          this.sections = data;
          done();
        },
        error: (error) => this.handleLoadError(error, 'sections'),
      }),
    );
  }

  private async handleLoadError(error: unknown, source: string): Promise<void> {
    console.error(`Failed loading ${source}:`, error);
    this.isLoading = false;

    await Swal.fire({
      title: 'Loading Failed',
      text: `Unable to load ${source}. Please check your Firebase connection.`,
      icon: 'error',
      confirmButtonColor: '#4f46e5',
    });
  }

  goBack(): void {
    this.location.back();
  }

  setTab(tab: AssignmentTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  openAddModal(): void {
    this.isEditing = false;
    this.selectedAssignment = null;

    this.form = {
      facultyId: '',
      subjectId: '',
      sectionId: '',
      schoolYear: this.getDefaultSchoolYear(),
      semester: '1st Semester',
      status: 'active',
    };

    this.showFormModal = true;
  }

  openEditModal(assignment: Assignment): void {
    this.isEditing = true;
    this.selectedAssignment = assignment;

    this.form = {
      facultyId: assignment.facultyId || '',
      subjectId: assignment.subjectId || '',
      sectionId: assignment.sectionId || '',
      schoolYear: assignment.schoolYear || this.getDefaultSchoolYear(),
      semester: assignment.semester || '1st Semester',
      status: assignment.status || 'active',
    };

    this.showFormModal = true;
  }

  closeFormModal(): void {
    if (this.isSaving) return;

    this.showFormModal = false;
    this.selectedAssignment = null;
  }

  async saveAssignment(): Promise<void> {
    if (
      !this.form.facultyId ||
      !this.form.subjectId ||
      !this.form.sectionId ||
      !this.form.schoolYear.trim()
    ) {
      await Swal.fire({
        title: 'Incomplete Details',
        text: 'Please select faculty, subject, section, school year, and semester.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const builtAssignment = this.buildAssignmentFromForm();

    if (!builtAssignment) {
      await Swal.fire({
        title: 'Invalid Selection',
        text: 'Selected faculty, subject, or section was not found.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const duplicate = this.findDuplicateAssignment(builtAssignment, this.selectedAssignment?.id);

    if (duplicate) {
      await Swal.fire({
        title: 'Duplicate Assignment',
        text: 'This faculty, subject, section, school year, and semester combination already exists.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    this.isSaving = true;

    try {
      if (this.isEditing && this.selectedAssignment?.id) {
        await this.assignmentService.updateAssignment(this.selectedAssignment.id, builtAssignment);

        await Swal.fire({
          title: 'Assignment Updated',
          text: 'The teaching assignment has been updated successfully.',
          icon: 'success',
          timer: 1400,
          showConfirmButton: false,
        });
      } else {
        await this.assignmentService.addAssignment(builtAssignment);

        await Swal.fire({
          title: 'Assignment Added',
          text: 'The teaching assignment has been saved successfully.',
          icon: 'success',
          timer: 1400,
          showConfirmButton: false,
        });
      }

      this.showFormModal = false;
      this.selectedAssignment = null;
    } catch (error) {
      console.error('Save assignment error:', error);

      await Swal.fire({
        title: 'Save Failed',
        text: 'Something went wrong while saving the assignment.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSaving = false;
    }
  }

  async toggleAssignmentStatus(assignment: Assignment): Promise<void> {
    if (!assignment.id || assignment.isArchived) return;

    const nextStatus = assignment.status === 'active' ? 'inactive' : 'active';

    const result = await Swal.fire({
      title: nextStatus === 'active' ? 'Activate Assignment?' : 'Set Assignment as Inactive?',
      text:
        nextStatus === 'active'
          ? 'This assignment will become available again.'
          : 'Inactive assignments should not be used for new attendance sessions.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: nextStatus === 'active' ? 'Yes, activate' : 'Yes, set inactive',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    try {
      await this.assignmentService.updateAssignment(assignment.id, { status: nextStatus });

      await Swal.fire({
        title: 'Status Updated',
        icon: 'success',
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Status update error:', error);

      await Swal.fire({
        title: 'Update Failed',
        text: 'Unable to update assignment status.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async archiveAssignment(assignment: Assignment): Promise<void> {
    if (!assignment.id) return;

    const result = await Swal.fire({
      title: 'Archive Assignment?',
      text: `${assignment.assignmentCode} will be moved to archive.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, archive',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#f59e0b',
    });

    if (!result.isConfirmed) return;

    try {
      await this.assignmentService.archiveAssignment(assignment.id);

      await Swal.fire({
        title: 'Archived',
        text: 'Assignment moved to archive.',
        icon: 'success',
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Archive error:', error);

      await Swal.fire({
        title: 'Archive Failed',
        text: 'Unable to archive this assignment.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async restoreAssignment(assignment: Assignment): Promise<void> {
    if (!assignment.id) return;

    const result = await Swal.fire({
      title: 'Restore Assignment?',
      text: `${assignment.assignmentCode} will return to active records.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, restore',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#16a34a',
    });

    if (!result.isConfirmed) return;

    try {
      await this.assignmentService.restoreAssignment(assignment.id);

      await Swal.fire({
        title: 'Restored',
        text: 'Assignment restored successfully.',
        icon: 'success',
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Restore error:', error);

      await Swal.fire({
        title: 'Restore Failed',
        text: 'Unable to restore this assignment.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async deleteAssignmentPermanently(assignment: Assignment): Promise<void> {
    if (!assignment.id) return;

    const result = await Swal.fire({
      title: 'Permanently Delete?',
      text: `${assignment.assignmentCode} will be deleted permanently. This cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete permanently',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    try {
      await this.assignmentService.deleteAssignment(assignment.id);

      await Swal.fire({
        title: 'Deleted',
        text: 'Assignment permanently deleted.',
        icon: 'success',
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Delete error:', error);

      await Swal.fire({
        title: 'Delete Failed',
        text: 'Unable to permanently delete this assignment.',
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

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: '',
        });

        this.importPreview = rows.map((row, index) => this.mapImportRow(row, index + 2));

        if (this.importPreview.length === 0) {
          await Swal.fire({
            title: 'Empty File',
            text: 'No assignment records were found in the Excel file.',
            icon: 'warning',
            confirmButtonColor: '#4f46e5',
          });
          return;
        }

        this.showImportModal = true;
      } catch (error) {
        console.error('Excel read error:', error);

        await Swal.fire({
          title: 'Import Failed',
          text: 'Unable to read the Excel file. Please check the file format.',
          icon: 'error',
          confirmButtonColor: '#4f46e5',
        });
      } finally {
        input.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  }

  async confirmImport(): Promise<void> {
    if (this.invalidImportCount > 0) {
      await Swal.fire({
        title: 'Fix Invalid Rows First',
        text: 'Only clean and valid import files can be saved.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const validRecords = this.importPreview.map(
      ({ rowNumber, isValid, errors, ...assignment }) => assignment,
    );

    if (validRecords.length === 0) return;

    const result = await Swal.fire({
      title: 'Import Assignments?',
      text: `${validRecords.length} assignment record(s) will be saved.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, import',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#4f46e5',
    });

    if (!result.isConfirmed) return;

    this.isImporting = true;

    try {
      await this.assignmentService.importAssignments(validRecords);

      await Swal.fire({
        title: 'Import Complete',
        text: 'Assignments imported successfully.',
        icon: 'success',
        confirmButtonColor: '#4f46e5',
      });

      this.closeImportModal();
    } catch (error) {
      console.error('Import save error:', error);

      await Swal.fire({
        title: 'Import Failed',
        text: 'Something went wrong while saving imported assignments.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isImporting = false;
    }
  }

  closeImportModal(): void {
    if (this.isImporting) return;

    this.showImportModal = false;
    this.importFileName = '';
    this.importPreview = [];
  }

  private mapImportRow(row: Record<string, unknown>, rowNumber: number): ImportPreviewAssignment {
    const facultyEmployeeId = this.readCell(row, [
      'Faculty ID',
      'Faculty Id',
      'facultyId',
      'faculty id',
    ]);
    const subjectCode = this.readCell(row, ['Subject Code', 'subjectCode', 'subject code']);
    const sectionCode = this.readCell(row, ['Section Code', 'sectionCode', 'section code']);
    const schoolYear = this.readCell(row, ['School Year', 'schoolYear', 'school year']);
    const semesterRaw = this.readCell(row, ['Semester', 'semester']);
    const statusRaw = this.readCell(row, ['Status', 'status']) || 'active';

    const errors: string[] = [];

    const faculty = this.activeFacultyOptions.find(
      (item) => item.facultyId.toLowerCase() === facultyEmployeeId.toLowerCase(),
    );

    const subject = this.activeSubjectOptions.find(
      (item) => item.subjectCode.toLowerCase() === subjectCode.toLowerCase(),
    );

    const section = this.activeSectionOptions.find(
      (item) => item.sectionCode.toLowerCase() === sectionCode.toLowerCase(),
    );

    const semester = this.normalizeSemester(semesterRaw);
    const status = statusRaw.toLowerCase() === 'inactive' ? 'inactive' : 'active';

    if (!facultyEmployeeId) errors.push('Faculty ID is required.');
    if (!subjectCode) errors.push('Subject Code is required.');
    if (!sectionCode) errors.push('Section Code is required.');
    if (!schoolYear) errors.push('School Year is required.');
    if (!faculty) errors.push('Faculty ID was not found.');
    if (!subject) errors.push('Subject Code was not found.');
    if (!section) errors.push('Section Code was not found.');
    if (!semester) errors.push('Semester must be 1st Semester, 2nd Semester, or Summer.');

    const assignment: Assignment = {
      assignmentCode: '',
      facultyId: faculty?.id || '',
      subjectId: subject?.id || '',
      sectionId: section?.id || '',
      facultyEmployeeId: faculty?.facultyId || facultyEmployeeId,
      facultyName: faculty?.fullName || '',
      subjectCode: subject?.subjectCode || subjectCode,
      subjectName: subject?.subjectName || '',
      sectionCode: section?.sectionCode || sectionCode,
      program: section?.program || subject?.program || 'IT',
      yearLevel: section?.yearLevel || subject?.yearLevel || '',
      schoolYear,
      semester: semester || '1st Semester',
      status,
      isArchived: false,
      archivedAt: null,
    };

    assignment.assignmentCode = this.generateAssignmentCode(assignment);

    if (this.findDuplicateAssignment(assignment)) {
      errors.push('Duplicate assignment already exists.');
    }

    return {
      ...assignment,
      rowNumber,
      isValid: errors.length === 0,
      errors,
    };
  }

  private buildAssignmentFromForm(): Assignment | null {
    const faculty = this.activeFacultyOptions.find((item) => item.id === this.form.facultyId);
    const subject = this.activeSubjectOptions.find((item) => item.id === this.form.subjectId);
    const section = this.activeSectionOptions.find((item) => item.id === this.form.sectionId);

    if (!faculty || !subject || !section) return null;

    const assignment: Assignment = {
      assignmentCode: '',
      facultyId: faculty.id || '',
      subjectId: subject.id || '',
      sectionId: section.id || '',
      facultyEmployeeId: faculty.facultyId,
      facultyName: faculty.fullName,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      sectionCode: section.sectionCode,
      program: section.program,
      yearLevel: section.yearLevel,
      schoolYear: this.form.schoolYear.trim(),
      semester: this.form.semester,
      status: this.form.status,
      isArchived: false,
      archivedAt: null,
    };

    assignment.assignmentCode = this.generateAssignmentCode(assignment);

    return assignment;
  }

  private findDuplicateAssignment(
    assignment: Assignment,
    ignoreId?: string,
  ): Assignment | undefined {
    return this.assignments.find((item) => {
      if (ignoreId && item.id === ignoreId) return false;

      return (
        !item.isArchived &&
        item.facultyId === assignment.facultyId &&
        item.subjectId === assignment.subjectId &&
        item.sectionId === assignment.sectionId &&
        item.schoolYear.toLowerCase() === assignment.schoolYear.toLowerCase() &&
        item.semester === assignment.semester
      );
    });
  }

  private generateAssignmentCode(assignment: Assignment): string {
    const sy = assignment.schoolYear.replace(/\s+/g, '').replace(/[^0-9-]/g, '');
    return `ASN-${sy}-${assignment.facultyEmployeeId}-${assignment.subjectCode}-${assignment.sectionCode}`
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  private readCell(row: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];

      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }

    return '';
  }

  private normalizeSemester(value: string): Semester | null {
    const normalized = value.trim().toLowerCase();

    if (normalized === '1st' || normalized === 'first' || normalized === '1st semester') {
      return '1st Semester';
    }

    if (normalized === '2nd' || normalized === 'second' || normalized === '2nd semester') {
      return '2nd Semester';
    }

    if (normalized === 'summer') {
      return 'Summer';
    }

    return null;
  }

  getDefaultSchoolYear(): string {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    if (currentMonth >= 6) {
      return `${currentYear}-${currentYear + 1}`;
    }

    return `${currentYear - 1}-${currentYear}`;
  }

  formatProgram(program: string): string {
    const labels: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return labels[program] || program;
  }
}
