import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

import { FacultyService } from '../../../core/services/faculty.service';
import { Faculty } from '../../../models/faculty.model';

type FacultyTab = 'active' | 'archive';
type FacultyRole = 'instructor' | 'assistant_professor' | 'associate_professor' | 'professor';

type ImportPreviewFaculty = Omit<Faculty, 'id'> & {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
};

@Component({
  selector: 'app-faculty',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './faculty.html',
  styleUrl: './faculty.scss',
})
export class FacultyPage implements OnInit, OnDestroy {
  facultyList: Faculty[] = [];
  activeTab: FacultyTab = 'active';
  searchTerm = '';

  isLoading = false;
  isSaving = false;
  isImporting = false;

  showFormModal = false;
  showImportModal = false;
  isEditing = false;

  selectedFaculty: Faculty | null = null;
  importFileName = '';
  importPreview: ImportPreviewFaculty[] = [];

  form = {
    facultyId: '',
    fullName: '',
    email: '',
    department: '',
    role: 'instructor' as FacultyRole,
    status: 'active' as 'active' | 'inactive',
  };

  private facultySubscription?: Subscription;

  constructor(
    private facultyService: FacultyService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.loadFaculty();
  }

  ngOnDestroy(): void {
    this.facultySubscription?.unsubscribe();
  }

  get activeFaculty(): Faculty[] {
    return this.facultyList.filter((faculty) => !faculty.isArchived);
  }

  get archivedFaculty(): Faculty[] {
    return this.facultyList.filter((faculty) => faculty.isArchived);
  }

  get totalFacultyRecords(): number {
    return this.activeFaculty.length + this.archivedFaculty.length;
  }

  get visibleFaculty(): Faculty[] {
    return this.activeTab === 'active' ? this.activeFaculty : this.archivedFaculty;
  }

  get filteredFaculty(): Faculty[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return this.visibleFaculty;

    return this.visibleFaculty.filter((faculty) => {
      const searchableText = [
        faculty.facultyId,
        faculty.fullName,
        faculty.email,
        faculty.department,
        faculty.role,
        faculty.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }

  get validImportCount(): number {
    return this.importPreview.filter((faculty) => faculty.isValid).length;
  }

  get invalidImportCount(): number {
    return this.importPreview.filter((faculty) => !faculty.isValid).length;
  }

  loadFaculty(): void {
    this.isLoading = true;

    this.facultySubscription = this.facultyService.getFaculty().subscribe({
      next: (facultyList) => {
        this.facultyList = facultyList;
        this.isLoading = false;
      },
      error: async (error) => {
        console.error('Failed to load faculty:', error);
        this.facultyList = [];
        this.isLoading = false;

        await Swal.fire({
          title: 'Unable to Load Faculty',
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

  setTab(tab: FacultyTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  openAddModal(): void {
    this.isEditing = false;
    this.selectedFaculty = null;

    this.form = {
      facultyId: '',
      fullName: '',
      email: '',
      department: '',
      role: 'instructor',
      status: 'active',
    };

    this.showFormModal = true;
  }

  openEditModal(faculty: Faculty): void {
    this.isEditing = true;
    this.selectedFaculty = faculty;

    this.form = {
      facultyId: faculty.facultyId || '',
      fullName: faculty.fullName || '',
      email: faculty.email || '',
      department: faculty.department || '',
      role: faculty.role || 'instructor',
      status: faculty.status || 'active',
    };

    this.showFormModal = true;
  }

  closeFormModal(): void {
    if (this.isSaving) return;

    this.showFormModal = false;
    this.selectedFaculty = null;
  }

  async saveFaculty(): Promise<void> {
    if (
      !this.form.facultyId.trim() ||
      !this.form.fullName.trim() ||
      !this.form.email.trim() ||
      !this.form.department.trim()
    ) {
      await Swal.fire({
        title: 'Incomplete Details',
        text: 'Please complete all required faculty fields before saving.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    this.isSaving = true;

    try {
      const payload: Faculty = {
        facultyId: this.form.facultyId.trim(),
        fullName: this.form.fullName.trim(),
        email: this.form.email.trim(),
        department: this.form.department.trim(),
        role: this.form.role,
        status: this.form.status,
        isArchived: this.selectedFaculty?.isArchived || false,
        archivedAt: this.selectedFaculty?.archivedAt || null,
      };

      if (this.isEditing && this.selectedFaculty?.id) {
        await this.facultyService.updateFaculty(this.selectedFaculty.id, payload);
      } else {
        await this.facultyService.addFaculty(payload);
      }

      this.closeFormModal();

      await Swal.fire({
        title: this.isEditing ? 'Faculty Updated' : 'Faculty Added',
        text: this.isEditing
          ? 'The faculty record has been updated successfully.'
          : 'The faculty record has been added successfully.',
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save faculty:', error);

      await Swal.fire({
        title: 'Save Failed',
        text: 'Failed to save faculty. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSaving = false;
    }
  }

  async toggleFacultyStatus(faculty: Faculty): Promise<void> {
    if (!faculty.id) return;

    const newStatus = faculty.status === 'inactive' ? 'active' : 'inactive';

    const result = await Swal.fire({
      title: newStatus === 'active' ? 'Activate Faculty?' : 'Deactivate Faculty?',
      text:
        newStatus === 'active'
          ? `${faculty.fullName} will be marked as active.`
          : `${faculty.fullName} will be marked as inactive.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: newStatus === 'active' ? 'Yes, activate' : 'Yes, deactivate',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.facultyService.updateFaculty(faculty.id, {
        status: newStatus,
      });

      await Swal.fire({
        title: 'Status Updated',
        text: `${faculty.fullName} is now ${newStatus}.`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to update faculty status:', error);

      await Swal.fire({
        title: 'Status Update Failed',
        text: 'Failed to update faculty status.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async archiveFaculty(faculty: Faculty): Promise<void> {
    if (!faculty.id) return;

    const result = await Swal.fire({
      title: 'Archive Faculty?',
      text: `${faculty.fullName} will be moved to the archive. You can restore this faculty record later.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, archive',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.facultyService.archiveFaculty(faculty.id);

      await Swal.fire({
        title: 'Archived',
        text: `${faculty.fullName} has been moved to the archive.`,
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to archive faculty:', error);

      await Swal.fire({
        title: 'Archive Failed',
        text: 'Failed to archive faculty. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async restoreFaculty(faculty: Faculty): Promise<void> {
    if (!faculty.id) return;

    const result = await Swal.fire({
      title: 'Restore Faculty?',
      text: `${faculty.fullName} will be returned to the active faculty list.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#22c55e',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, restore',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.facultyService.restoreFaculty(faculty.id);

      await Swal.fire({
        title: 'Restored',
        text: `${faculty.fullName} has been restored successfully.`,
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to restore faculty:', error);

      await Swal.fire({
        title: 'Restore Failed',
        text: 'Failed to restore faculty. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    }
  }

  async deleteFacultyPermanently(faculty: Faculty): Promise<void> {
    if (!faculty.id) return;

    const result = await Swal.fire({
      title: 'Permanently Delete?',
      text: `${faculty.fullName} will be permanently deleted. This action cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete permanently',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      await this.facultyService.deleteFaculty(faculty.id);

      await Swal.fire({
        title: 'Deleted',
        text: `${faculty.fullName} has been permanently deleted.`,
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to delete faculty:', error);

      await Swal.fire({
        title: 'Delete Failed',
        text: 'Failed to permanently delete faculty. Please try again.',
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
    const validFaculty = this.importPreview
      .filter((faculty) => faculty.isValid)
      .map(({ rowNumber, isValid, errors, ...faculty }) => faculty);

    if (!validFaculty.length) {
      await Swal.fire({
        title: 'No Valid Records',
        text: 'There are no valid faculty records to import.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Import?',
      text: `${validFaculty.length} valid faculty record(s) will be saved to the system.`,
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
      await this.facultyService.importFaculty(validFaculty);
      this.closeImportModal();

      await Swal.fire({
        title: 'Import Complete',
        text: `${validFaculty.length} faculty record(s) imported successfully.`,
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to import faculty:', error);

      await Swal.fire({
        title: 'Import Failed',
        text: 'Failed to import faculty. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isImporting = false;
    }
  }

  formatRole(role: FacultyRole | string): string {
    const roles: Record<string, string> = {
      instructor: 'Instructor',
      assistant_professor: 'Assistant Professor',
      associate_professor: 'Associate Professor',
      professor: 'Professor',
    };

    return roles[role] || role;
  }

  private mapExcelRows(rows: Record<string, unknown>[]): ImportPreviewFaculty[] {
    const existingFacultyIds = new Set(
      this.facultyList.map((faculty) => String(faculty.facultyId).trim().toLowerCase()),
    );

    const fileFacultyIds = new Set<string>();

    return rows.map((row, index) => {
      const facultyId = this.getCell(row, ['Faculty ID', 'FacultyId', 'Faculty Number', 'ID']);
      const fullName = this.getCell(row, ['Full Name', 'Name', 'Faculty Name']);
      const email = this.getCell(row, ['Email', 'Email Address']);
      const department = this.getCell(row, ['Department', 'Dept']);
      const roleRaw = this.getCell(row, ['Role', 'Position']);
      const statusRaw = this.getCell(row, ['Status']);

      const role = this.normalizeRole(roleRaw);
      const status = this.normalizeStatus(statusRaw);

      const errors: string[] = [];
      const normalizedFacultyId = facultyId.toLowerCase();

      if (!facultyId) errors.push('Missing Faculty ID');
      if (!fullName) errors.push('Missing Full Name');
      if (!email) errors.push('Missing Email');
      if (!department) errors.push('Missing Department');
      if (!role) errors.push('Invalid Role');

      if (facultyId && existingFacultyIds.has(normalizedFacultyId)) {
        errors.push('Faculty ID already exists');
      }

      if (facultyId && fileFacultyIds.has(normalizedFacultyId)) {
        errors.push('Duplicate Faculty ID in file');
      }

      if (facultyId) {
        fileFacultyIds.add(normalizedFacultyId);
      }

      return {
        rowNumber: index + 2,
        facultyId,
        fullName,
        email,
        department,
        role: role || 'instructor',
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

  private normalizeRole(value: string): FacultyRole | '' {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');

    if (['instructor', 'teacher', 'faculty'].includes(normalized)) return 'instructor';
    if (['assistant_professor', 'assistant_prof'].includes(normalized))
      return 'assistant_professor';
    if (['associate_professor', 'associate_prof'].includes(normalized))
      return 'associate_professor';
    if (['professor', 'prof'].includes(normalized)) return 'professor';

    return '';
  }

  private normalizeStatus(value: string): 'active' | 'inactive' {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'inactive') return 'inactive';

    return 'active';
  }
}
