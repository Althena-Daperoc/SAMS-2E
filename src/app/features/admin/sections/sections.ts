import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

import { SectionService } from '../../../core/services/section.service';
import { Section } from '../../../models/section.model';

type SectionTab = 'active' | 'archive';
type Program = 'IT' | 'EMT' | 'TCM';

type ImportPreviewSection = Omit<Section, 'id'> & {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
};

@Component({
  selector: 'app-sections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class Sections implements OnInit, OnDestroy {
  sections: Section[] = [];

  activeTab: SectionTab = 'active';
  searchTerm = '';

  isLoading = false;
  isSaving = false;
  isImporting = false;

  showFormModal = false;
  showImportModal = false;
  isEditing = false;

  selectedSection: Section | null = null;
  importFileName = '';
  importPreview: ImportPreviewSection[] = [];

  form = {
    sectionName: '',
    program: 'IT' as Program,
    yearLevel: '',
    status: 'active' as 'active' | 'inactive',
  };

  private sectionSubscription?: Subscription;

  constructor(
    private sectionService: SectionService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.loadSections();
  }

  ngOnDestroy(): void {
    this.sectionSubscription?.unsubscribe();
  }

  get activeSections(): Section[] {
    return this.sections.filter((section) => !section.isArchived);
  }

  get archivedSections(): Section[] {
    return this.sections.filter((section) => section.isArchived);
  }

  get totalSectionRecords(): number {
    return this.activeSections.length + this.archivedSections.length;
  }

  get visibleSections(): Section[] {
    return this.activeTab === 'active' ? this.activeSections : this.archivedSections;
  }

  get filteredSections(): Section[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return this.visibleSections;

    return this.visibleSections.filter((section) => {
      const searchableText = [
        section.sectionCode,
        section.sectionName,
        section.program,
        this.formatProgram(section.program),
        section.yearLevel,
        section.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }

  get validImportCount(): number {
    return this.importPreview.filter((section) => section.isValid).length;
  }

  get invalidImportCount(): number {
    return this.importPreview.filter((section) => !section.isValid).length;
  }

  loadSections(): void {
    this.isLoading = true;

    this.sectionSubscription = this.sectionService.getSections().subscribe({
      next: (sections) => {
        this.sections = sections;
        this.isLoading = false;
      },
      error: async (error) => {
        console.error('Failed to load sections:', error);
        this.sections = [];
        this.isLoading = false;

        await Swal.fire({
          title: 'Unable to Load Sections',
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

  setTab(tab: SectionTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  openAddModal(): void {
    this.isEditing = false;
    this.selectedSection = null;

    this.form = {
      sectionName: '',
      program: 'IT',
      yearLevel: '',
      status: 'active',
    };

    this.showFormModal = true;
  }

  openEditModal(section: Section): void {
    this.isEditing = true;
    this.selectedSection = section;

    this.form = {
      sectionName: section.sectionName || '',
      program: section.program || 'IT',
      yearLevel: section.yearLevel || '',
      status: section.status || 'active',
    };

    this.showFormModal = true;
  }

  closeFormModal(): void {
    if (this.isSaving) return;

    this.showFormModal = false;
    this.selectedSection = null;
  }

  private forceCloseFormModal(): void {
    this.showFormModal = false;
    this.selectedSection = null;
  }

  async saveSection(): Promise<void> {
    if (!this.form.sectionName.trim() || !this.form.program || !this.form.yearLevel.trim()) {
      await Swal.fire({
        title: 'Incomplete Details',
        text: 'Please complete all required section fields before saving.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    this.isSaving = true;

    try {
      const sectionName = this.normalizeSectionName(this.form.sectionName);
      const sectionCode = this.generateSectionCode(
        this.form.program,
        this.form.yearLevel,
        sectionName,
      );

      const payload: Section = {
        sectionCode,
        program: this.form.program,
        yearLevel: this.form.yearLevel.trim(),
        sectionName,
        status: this.form.status,
        isArchived: this.selectedSection?.isArchived || false,
        archivedAt: this.selectedSection?.archivedAt || null,
      };

      if (this.isEditing && this.selectedSection?.id) {
        await this.sectionService.updateSection(this.selectedSection.id, payload);
      } else {
        await this.sectionService.addSection(payload);
      }

      this.isSaving = false;
      this.forceCloseFormModal();

      await Swal.fire({
        title: this.isEditing ? 'Section Updated' : 'Section Added',
        text: this.isEditing
          ? 'The section record has been updated successfully.'
          : 'The section has been added successfully.',
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save section:', error);

      await Swal.fire({
        title: 'Save Failed',
        text: 'Failed to save section. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSaving = false;
    }
  }

  async toggleSectionStatus(section: Section): Promise<void> {
    if (!section.id) return;

    const newStatus = section.status === 'inactive' ? 'active' : 'inactive';

    const result = await Swal.fire({
      title: newStatus === 'active' ? 'Activate Section?' : 'Deactivate Section?',
      text:
        newStatus === 'active'
          ? `${section.sectionCode} will be marked as active.`
          : `${section.sectionCode} will be marked as inactive.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: newStatus === 'active' ? 'Yes, activate' : 'Yes, deactivate',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.sectionService.updateSection(section.id, { status: newStatus });

    await Swal.fire({
      title: 'Status Updated',
      text: `${section.sectionCode} is now ${newStatus}.`,
      icon: 'success',
      timer: 1500,
      showConfirmButton: false,
    });
  }

  async archiveSection(section: Section): Promise<void> {
    if (!section.id) return;

    const result = await Swal.fire({
      title: 'Archive Section?',
      text: `${section.sectionCode} will be moved to the archive.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, archive',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.sectionService.archiveSection(section.id);

    await Swal.fire({
      title: 'Archived',
      text: `${section.sectionCode} has been moved to archive.`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    });
  }

  async restoreSection(section: Section): Promise<void> {
    if (!section.id) return;

    const result = await Swal.fire({
      title: 'Restore Section?',
      text: `${section.sectionCode} will be returned to the active section list.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#22c55e',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, restore',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.sectionService.restoreSection(section.id);

    await Swal.fire({
      title: 'Restored',
      text: `${section.sectionCode} has been restored successfully.`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    });
  }

  async deleteSectionPermanently(section: Section): Promise<void> {
    if (!section.id) return;

    const result = await Swal.fire({
      title: 'Permanently Delete?',
      text: `${section.sectionCode} will be permanently deleted. This cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete permanently',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.sectionService.deleteSection(section.id);

    await Swal.fire({
      title: 'Deleted',
      text: `${section.sectionCode} has been permanently deleted.`,
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
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

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
    const validSections = this.importPreview
      .filter((section) => section.isValid)
      .map(({ rowNumber, isValid, errors, ...section }) => section);

    if (!validSections.length) {
      await Swal.fire({
        title: 'No Valid Records',
        text: 'There are no valid section records to import.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Import?',
      text: `${validSections.length} valid section record(s) will be saved.`,
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
      await this.sectionService.importSections(validSections);
      this.showImportModal = false;
      this.importPreview = [];
      this.importFileName = '';

      await Swal.fire({
        title: 'Import Complete',
        text: `${validSections.length} section record(s) imported successfully.`,
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to import sections:', error);

      await Swal.fire({
        title: 'Import Failed',
        text: 'Failed to import sections. Please try again.',
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

  private mapExcelRows(rows: Record<string, unknown>[]): ImportPreviewSection[] {
    const existingSectionCodes = new Set(
      this.sections.map((section) => String(section.sectionCode).trim().toLowerCase()),
    );

    const fileSectionCodes = new Set<string>();

    return rows.map((row, index) => {
      const programRaw = this.getCell(row, ['Program', 'Course']);
      const yearLevel = this.getCell(row, ['Year Level', 'Year']);
      const sectionNameRaw = this.getCell(row, ['Section Name', 'Section', 'Block']);
      const status = this.normalizeStatus(this.getCell(row, ['Status']));

      const program = this.normalizeProgram(programRaw);
      const sectionName = this.normalizeSectionName(sectionNameRaw);
      const sectionCode = program ? this.generateSectionCode(program, yearLevel, sectionName) : '';

      const errors: string[] = [];
      const normalizedCode = sectionCode.toLowerCase();

      if (!program) errors.push('Invalid Program');
      if (!yearLevel) errors.push('Missing Year Level');
      if (!sectionName) errors.push('Missing Section Name');

      if (sectionCode && existingSectionCodes.has(normalizedCode)) {
        errors.push('Section Code already exists');
      }

      if (sectionCode && fileSectionCodes.has(normalizedCode)) {
        errors.push('Duplicate Section Code in file');
      }

      if (sectionCode) {
        fileSectionCodes.add(normalizedCode);
      }

      return {
        rowNumber: index + 2,
        sectionCode,
        program: program || 'IT',
        yearLevel,
        sectionName,
        status,
        isArchived: false,
        archivedAt: null,
        isValid: errors.length === 0,
        errors,
      };
    });
  }

  private generateSectionCode(program: Program, yearLevel: string, sectionName: string): string {
    const yearNumber = yearLevel.trim().charAt(0) || '1';
    const section = this.normalizeSectionName(sectionName);

    return `${program}-${yearNumber}${section}`;
  }

  private normalizeSectionName(value: string): string {
    return value
      .trim()
      .replace(/^section\s+/i, '')
      .toUpperCase();
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

  private normalizeStatus(value: string): 'active' | 'inactive' {
    return value.trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
  }
}
