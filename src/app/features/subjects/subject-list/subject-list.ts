import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

import { SubjectService } from '../../../core/services/subject.service';
import { Subject } from '../../../models/subject.model';

type SubjectTab = 'active' | 'archive';
type Program = 'IT' | 'EMT' | 'TCM';
type Semester = '1st Semester' | '2nd Semester' | 'Summer';

type ImportPreviewSubject = Omit<Subject, 'id'> & {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
};

@Component({
  selector: 'app-subject-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './subject-list.html',
  styleUrl: './subject-list.scss',
})
export class SubjectList implements OnInit, OnDestroy {
  subjects: Subject[] = [];

  activeTab: SubjectTab = 'active';
  searchTerm = '';

  isLoading = false;
  isSaving = false;
  isImporting = false;

  showFormModal = false;
  showImportModal = false;
  isEditing = false;

  selectedSubject: Subject | null = null;
  importFileName = '';
  importPreview: ImportPreviewSubject[] = [];

  form = {
    subjectCode: '',
    subjectName: '',
    program: 'IT' as Program,
    yearLevel: '',
    semester: '1st Semester' as Semester,
    units: 3,
    status: 'active' as 'active' | 'inactive',
  };

  private subjectSubscription?: Subscription;

  constructor(
    private subjectService: SubjectService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.loadSubjects();
  }

  ngOnDestroy(): void {
    this.subjectSubscription?.unsubscribe();
  }

  get activeSubjects(): Subject[] {
    return this.subjects.filter((subject) => !subject.isArchived);
  }

  get archivedSubjects(): Subject[] {
    return this.subjects.filter((subject) => subject.isArchived);
  }

  get totalSubjectRecords(): number {
    return this.activeSubjects.length + this.archivedSubjects.length;
  }

  get visibleSubjects(): Subject[] {
    return this.activeTab === 'active' ? this.activeSubjects : this.archivedSubjects;
  }

  get filteredSubjects(): Subject[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return this.visibleSubjects;

    return this.visibleSubjects.filter((subject) => {
      const searchableText = [
        subject.subjectCode,
        subject.subjectName,
        subject.program,
        this.formatProgram(subject.program),
        subject.yearLevel,
        subject.semester,
        subject.units,
        subject.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }

  get validImportCount(): number {
    return this.importPreview.filter((subject) => subject.isValid).length;
  }

  get invalidImportCount(): number {
    return this.importPreview.filter((subject) => !subject.isValid).length;
  }

  loadSubjects(): void {
    this.isLoading = true;

    this.subjectSubscription = this.subjectService.getSubjects().subscribe({
      next: (subjects) => {
        this.subjects = subjects;
        this.isLoading = false;
      },
      error: async (error) => {
        console.error('Failed to load subjects:', error);
        this.subjects = [];
        this.isLoading = false;

        await Swal.fire({
          title: 'Unable to Load Subjects',
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

  setTab(tab: SubjectTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  openAddModal(): void {
    this.isEditing = false;
    this.selectedSubject = null;

    this.form = {
      subjectCode: '',
      subjectName: '',
      program: 'IT',
      yearLevel: '',
      semester: '1st Semester',
      units: 3,
      status: 'active',
    };

    this.showFormModal = true;
  }

  openEditModal(subject: Subject): void {
    this.isEditing = true;
    this.selectedSubject = subject;

    this.form = {
      subjectCode: subject.subjectCode || '',
      subjectName: subject.subjectName || '',
      program: subject.program || 'IT',
      yearLevel: subject.yearLevel || '',
      semester: subject.semester || '1st Semester',
      units: subject.units || 3,
      status: subject.status || 'active',
    };

    this.showFormModal = true;
  }

  closeFormModal(): void {
    if (this.isSaving) return;

    this.showFormModal = false;
    this.selectedSubject = null;
  }

  private forceCloseFormModal(): void {
    this.showFormModal = false;
    this.selectedSubject = null;
  }

  async saveSubject(): Promise<void> {
    if (
      !this.form.subjectCode.trim() ||
      !this.form.subjectName.trim() ||
      !this.form.program ||
      !this.form.yearLevel.trim() ||
      !this.form.semester ||
      !this.form.units
    ) {
      await Swal.fire({
        title: 'Incomplete Details',
        text: 'Please complete all required subject fields before saving.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    this.isSaving = true;

    try {
      const payload: Subject = {
        subjectCode: this.form.subjectCode.trim().toUpperCase(),
        subjectName: this.form.subjectName.trim(),
        program: this.form.program,
        yearLevel: this.form.yearLevel.trim(),
        semester: this.form.semester,
        units: Number(this.form.units),
        status: this.form.status,
        isArchived: this.selectedSubject?.isArchived || false,
        archivedAt: this.selectedSubject?.archivedAt || null,
      };

      if (this.isEditing && this.selectedSubject?.id) {
        await this.subjectService.updateSubject(this.selectedSubject.id, payload);
      } else {
        await this.subjectService.addSubject(payload);
      }

      this.isSaving = false;
      this.forceCloseFormModal();

      await Swal.fire({
        title: this.isEditing ? 'Subject Updated' : 'Subject Added',
        text: this.isEditing
          ? 'The subject record has been updated successfully.'
          : 'The subject has been added to the academic catalog.',
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save subject:', error);

      await Swal.fire({
        title: 'Save Failed',
        text: 'Failed to save subject. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSaving = false;
    }
  }

  async toggleSubjectStatus(subject: Subject): Promise<void> {
    if (!subject.id) return;

    const newStatus = subject.status === 'inactive' ? 'active' : 'inactive';

    const result = await Swal.fire({
      title: newStatus === 'active' ? 'Activate Subject?' : 'Deactivate Subject?',
      text:
        newStatus === 'active'
          ? `${subject.subjectCode} will be marked as active.`
          : `${subject.subjectCode} will be marked as inactive.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: newStatus === 'active' ? 'Yes, activate' : 'Yes, deactivate',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.subjectService.updateSubject(subject.id, { status: newStatus });

    await Swal.fire({
      title: 'Status Updated',
      text: `${subject.subjectCode} is now ${newStatus}.`,
      icon: 'success',
      timer: 1500,
      showConfirmButton: false,
    });
  }

  async archiveSubject(subject: Subject): Promise<void> {
    if (!subject.id) return;

    const result = await Swal.fire({
      title: 'Archive Subject?',
      text: `${subject.subjectCode} will be moved to the archive.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, archive',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.subjectService.archiveSubject(subject.id);

    await Swal.fire({
      title: 'Archived',
      text: `${subject.subjectCode} has been moved to archive.`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    });
  }

  async restoreSubject(subject: Subject): Promise<void> {
    if (!subject.id) return;

    const result = await Swal.fire({
      title: 'Restore Subject?',
      text: `${subject.subjectCode} will be returned to the active subject list.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#22c55e',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, restore',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.subjectService.restoreSubject(subject.id);

    await Swal.fire({
      title: 'Restored',
      text: `${subject.subjectCode} has been restored successfully.`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    });
  }

  async deleteSubjectPermanently(subject: Subject): Promise<void> {
    if (!subject.id) return;

    const result = await Swal.fire({
      title: 'Permanently Delete?',
      text: `${subject.subjectCode} will be permanently deleted. This cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete permanently',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.subjectService.deleteSubject(subject.id);

    await Swal.fire({
      title: 'Deleted',
      text: `${subject.subjectCode} has been permanently deleted.`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    });
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
    const validSubjects = this.importPreview
      .filter((subject) => subject.isValid)
      .map(({ rowNumber, isValid, errors, ...subject }) => subject);

    if (!validSubjects.length) {
      await Swal.fire({
        title: 'No Valid Records',
        text: 'There are no valid subject records to import.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Import?',
      text: `${validSubjects.length} valid subject record(s) will be saved to the academic catalog.`,
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
      await this.subjectService.importSubjects(validSubjects);
      this.showImportModal = false;
      this.importPreview = [];
      this.importFileName = '';

      await Swal.fire({
        title: 'Import Complete',
        text: `${validSubjects.length} subject record(s) imported successfully.`,
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to import subjects:', error);

      await Swal.fire({
        title: 'Import Failed',
        text: 'Failed to import subjects. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isImporting = false;
    }
  }

  formatProgram(program: Program | string): string {
    const programs: Record<string, string> = {
      IT: 'Information Technology',
      EMT: 'Electro-Mechanical Technology',
      TCM: 'Technology Communication Management',
    };

    return programs[program] || program;
  }

  private mapExcelRows(rows: Record<string, unknown>[]): ImportPreviewSubject[] {
    const existingSubjectCodes = new Set(
      this.subjects.map((subject) => String(subject.subjectCode).trim().toLowerCase()),
    );

    const fileSubjectCodes = new Set<string>();

    return rows.map((row, index) => {
      const subjectCode = this.getCell(row, ['Subject Code', 'Code', 'Subject ID']);
      const subjectName = this.getCell(row, ['Subject Name', 'Name', 'Description']);
      const programRaw = this.getCell(row, ['Program', 'Course']);
      const yearLevel = this.getCell(row, ['Year Level', 'Year']);
      const semesterRaw = this.getCell(row, ['Semester', 'Sem', 'Term']);
      const unitsRaw = this.getCell(row, ['Units', 'Unit']);
      const status = this.normalizeStatus(this.getCell(row, ['Status']));

      const program = this.normalizeProgram(programRaw);
      const semester = this.normalizeSemester(semesterRaw);
      const units = Number(unitsRaw || 3);
      const normalizedCode = subjectCode.toLowerCase();

      const errors: string[] = [];

      if (!subjectCode) errors.push('Missing Subject Code');
      if (!subjectName) errors.push('Missing Subject Name');
      if (!program) errors.push('Invalid Program');
      if (!yearLevel) errors.push('Missing Year Level');
      if (!semester) errors.push('Invalid Semester');
      if (!units || units <= 0) errors.push('Invalid Units');

      if (subjectCode && existingSubjectCodes.has(normalizedCode)) {
        errors.push('Subject Code already exists');
      }

      if (subjectCode && fileSubjectCodes.has(normalizedCode)) {
        errors.push('Duplicate Subject Code in file');
      }

      if (subjectCode) {
        fileSubjectCodes.add(normalizedCode);
      }

      return {
        rowNumber: index + 2,
        subjectCode: subjectCode.toUpperCase(),
        subjectName,
        program: program || 'IT',
        yearLevel,
        semester: semester || '1st Semester',
        units,
        status,
        isArchived: false,
        archivedAt: null,
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

  private normalizeProgram(value: string): Program | '' {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'it' || normalized === 'information technology' || normalized === 'bsit') {
      return 'IT';
    }

    if (
      normalized === 'emt' ||
      normalized === 'electro mechanical technology' ||
      normalized === 'electro-mechanical technology'
    ) {
      return 'EMT';
    }

    if (
      normalized === 'tcm' ||
      normalized === 'technology communication management' ||
      normalized === 'technology communication and management'
    ) {
      return 'TCM';
    }

    return '';
  }

  private normalizeSemester(value: string): Semester | '' {
    const normalized = value.trim().toLowerCase();

    if (
      normalized === '1st semester' ||
      normalized === 'first semester' ||
      normalized === '1st' ||
      normalized === 'first'
    ) {
      return '1st Semester';
    }

    if (
      normalized === '2nd semester' ||
      normalized === 'second semester' ||
      normalized === '2nd' ||
      normalized === 'second'
    ) {
      return '2nd Semester';
    }

    if (normalized === 'summer') {
      return 'Summer';
    }

    return '';
  }

  private normalizeStatus(value: string): 'active' | 'inactive' {
    return value.trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
  }
}
