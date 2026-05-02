import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';

import { ParentService } from '../../../core/services/parent.service';
import { StudentService } from '../../../core/services/student.service';
import { Parent } from '../../../models/parent.model';
import { Student } from '../../../models/student.model';

type ParentTab = 'active' | 'archive';
type Relationship = 'Mother' | 'Father' | 'Guardian' | 'Other';

type ImportPreviewParent = Omit<Parent, 'id'> & {
  rowNumber: number;
  studentReferenceText: string;
  linkedStudentNames: string[];
  isValid: boolean;
  errors: string[];
};

@Component({
  selector: 'app-parents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parents.html',
  styleUrl: './parents.scss',
})
export class Parents implements OnInit, OnDestroy {
  parents: Parent[] = [];
  students: Student[] = [];

  activeTab: ParentTab = 'active';
  searchTerm = '';

  isLoading = false;
  isSaving = false;
  isImporting = false;

  showFormModal = false;
  showImportModal = false;
  isEditing = false;

  selectedParent: Parent | null = null;
  importFileName = '';
  importPreview: ImportPreviewParent[] = [];

  form = {
    parentId: '',
    fullName: '',
    email: '',
    contactNumber: '',
    relationship: 'Guardian' as Relationship,
    linkedStudentIds: [] as string[],
    status: 'active' as 'active' | 'inactive',
  };

  private parentSubscription?: Subscription;
  private studentSubscription?: Subscription;

  constructor(
    private parentService: ParentService,
    private studentService: StudentService,
    private location: Location,
  ) {}

  ngOnInit(): void {
    this.loadParents();
    this.loadStudents();
  }

  ngOnDestroy(): void {
    this.parentSubscription?.unsubscribe();
    this.studentSubscription?.unsubscribe();
  }

  get activeParents(): Parent[] {
    return this.parents.filter((parent) => !parent.isArchived);
  }

  get archivedParents(): Parent[] {
    return this.parents.filter((parent) => parent.isArchived);
  }

  get totalParentRecords(): number {
    return this.activeParents.length + this.archivedParents.length;
  }

  get visibleParents(): Parent[] {
    return this.activeTab === 'active' ? this.activeParents : this.archivedParents;
  }

  get filteredParents(): Parent[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) return this.visibleParents;

    return this.visibleParents.filter((parent) => {
      const childNames = this.getLinkedStudentNames(parent.linkedStudentIds).join(' ');

      const searchableText = [
        parent.parentId,
        parent.fullName,
        parent.email,
        parent.contactNumber,
        parent.relationship,
        parent.status,
        childNames,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }

  get validImportCount(): number {
    return this.importPreview.filter((parent) => parent.isValid).length;
  }

  get invalidImportCount(): number {
    return this.importPreview.filter((parent) => !parent.isValid).length;
  }

  loadParents(): void {
    this.isLoading = true;

    this.parentSubscription = this.parentService.getParents().subscribe({
      next: (parents) => {
        this.parents = parents;
        this.isLoading = false;
      },
      error: async (error) => {
        console.error('Failed to load parents:', error);
        this.parents = [];
        this.isLoading = false;

        await Swal.fire({
          title: 'Unable to Load Parents',
          text: 'Please check your connection or Firebase configuration.',
          icon: 'error',
          confirmButtonColor: '#4f46e5',
        });
      },
    });
  }

  loadStudents(): void {
    this.studentSubscription = this.studentService.getStudents().subscribe({
      next: (students) => {
        this.students = students.filter((student) => !student.isArchived);
      },
      error: (error) => {
        console.error('Failed to load students for parent linking:', error);
        this.students = [];
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  setTab(tab: ParentTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  openAddModal(): void {
    this.isEditing = false;
    this.selectedParent = null;

    this.form = {
      parentId: '',
      fullName: '',
      email: '',
      contactNumber: '',
      relationship: 'Guardian',
      linkedStudentIds: [],
      status: 'active',
    };

    this.showFormModal = true;
  }

  openEditModal(parent: Parent): void {
    this.isEditing = true;
    this.selectedParent = parent;

    this.form = {
      parentId: parent.parentId || '',
      fullName: parent.fullName || '',
      email: parent.email || '',
      contactNumber: parent.contactNumber || '',
      relationship: parent.relationship || 'Guardian',
      linkedStudentIds: [...(parent.linkedStudentIds || [])],
      status: parent.status || 'active',
    };

    this.showFormModal = true;
  }

  closeFormModal(): void {
    if (this.isSaving) return;

    this.showFormModal = false;
    this.selectedParent = null;
  }

  onStudentLinkChange(studentId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    if (checked) {
      if (!this.form.linkedStudentIds.includes(studentId)) {
        this.form.linkedStudentIds.push(studentId);
      }
    } else {
      this.form.linkedStudentIds = this.form.linkedStudentIds.filter((id) => id !== studentId);
    }
  }

  isStudentLinked(studentId: string): boolean {
    return this.form.linkedStudentIds.includes(studentId);
  }

  async saveParent(): Promise<void> {
    if (
      !this.form.parentId.trim() ||
      !this.form.fullName.trim() ||
      !this.form.email.trim() ||
      !this.form.contactNumber.trim() ||
      this.form.linkedStudentIds.length === 0
    ) {
      await Swal.fire({
        title: 'Incomplete Details',
        text: 'Please complete required fields and link at least one child.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    this.isSaving = true;

    try {
      const payload: Parent = {
        parentId: this.form.parentId.trim(),
        fullName: this.form.fullName.trim(),
        email: this.form.email.trim(),
        contactNumber: this.form.contactNumber.trim(),
        relationship: this.form.relationship,
        linkedStudentIds: this.form.linkedStudentIds,
        status: this.form.status,
        isArchived: this.selectedParent?.isArchived || false,
        archivedAt: this.selectedParent?.archivedAt || null,
      };

      if (this.isEditing && this.selectedParent?.id) {
        await this.parentService.updateParent(this.selectedParent.id, payload);
      } else {
        await this.parentService.addParent(payload);
      }

      this.closeFormModal();

      await Swal.fire({
        title: this.isEditing ? 'Parent Updated' : 'Parent Added',
        text: this.isEditing
          ? 'The parent record has been updated successfully.'
          : 'The parent record has been added successfully.',
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save parent:', error);

      await Swal.fire({
        title: 'Save Failed',
        text: 'Failed to save parent. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isSaving = false;
    }
  }

  async toggleParentStatus(parent: Parent): Promise<void> {
    if (!parent.id) return;

    const newStatus = parent.status === 'inactive' ? 'active' : 'inactive';

    const result = await Swal.fire({
      title: newStatus === 'active' ? 'Activate Parent?' : 'Deactivate Parent?',
      text:
        newStatus === 'active'
          ? `${parent.fullName} will be marked as active.`
          : `${parent.fullName} will be marked as inactive.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b',
      confirmButtonText: newStatus === 'active' ? 'Yes, activate' : 'Yes, deactivate',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.parentService.updateParent(parent.id, { status: newStatus });

    await Swal.fire({
      title: 'Status Updated',
      text: `${parent.fullName} is now ${newStatus}.`,
      icon: 'success',
      timer: 1500,
      showConfirmButton: false,
    });
  }

  async archiveParent(parent: Parent): Promise<void> {
    if (!parent.id) return;

    const result = await Swal.fire({
      title: 'Archive Parent?',
      text: `${parent.fullName} will be moved to the archive.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, archive',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.parentService.archiveParent(parent.id);

    await Swal.fire({
      title: 'Archived',
      text: `${parent.fullName} has been moved to archive.`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    });
  }

  async restoreParent(parent: Parent): Promise<void> {
    if (!parent.id) return;

    const result = await Swal.fire({
      title: 'Restore Parent?',
      text: `${parent.fullName} will be returned to the active parent list.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#22c55e',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, restore',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.parentService.restoreParent(parent.id);

    await Swal.fire({
      title: 'Restored',
      text: `${parent.fullName} has been restored successfully.`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    });
  }

  async deleteParentPermanently(parent: Parent): Promise<void> {
    if (!parent.id) return;

    const result = await Swal.fire({
      title: 'Permanently Delete?',
      text: `${parent.fullName} will be permanently deleted. This cannot be undone.`,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete permanently',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    await this.parentService.deleteParent(parent.id);

    await Swal.fire({
      title: 'Deleted',
      text: `${parent.fullName} has been permanently deleted.`,
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
    const validParents = this.importPreview
      .filter((parent) => parent.isValid)
      .map(
        ({ rowNumber, studentReferenceText, linkedStudentNames, isValid, errors, ...parent }) =>
          parent,
      );

    if (!validParents.length) {
      await Swal.fire({
        title: 'No Valid Records',
        text: 'There are no valid parent records to import.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Import?',
      text: `${validParents.length} valid parent record(s) will be saved to the system.`,
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
      await this.parentService.importParents(validParents);
      this.closeImportModal();

      await Swal.fire({
        title: 'Import Complete',
        text: `${validParents.length} parent record(s) imported successfully.`,
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to import parents:', error);

      await Swal.fire({
        title: 'Import Failed',
        text: 'Failed to import parents. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      this.isImporting = false;
    }
  }

  getLinkedStudentNames(linkedStudentIds: string[] = []): string[] {
    return linkedStudentIds.map((studentDocId) => {
      const student = this.students.find((item) => item.id === studentDocId);
      return student ? `${student.fullName} (${student.studentId})` : 'Unknown student';
    });
  }

  private mapExcelRows(rows: Record<string, unknown>[]): ImportPreviewParent[] {
    const existingParentIds = new Set(
      this.parents.map((parent) => String(parent.parentId).trim().toLowerCase()),
    );

    const fileParentIds = new Set<string>();

    return rows.map((row, index) => {
      const parentId = this.getCell(row, ['Parent ID', 'ParentId', 'ID']);
      const fullName = this.getCell(row, ['Full Name', 'Name', 'Parent Name']);
      const email = this.getCell(row, ['Email', 'Email Address']);
      const contactNumber = this.getCell(row, ['Contact Number', 'Contact', 'Phone']);
      const relationship = this.normalizeRelationship(
        this.getCell(row, ['Relationship', 'Relation']),
      );
      const studentReferenceText = this.getCell(row, [
        'Student ID',
        'Student IDs',
        'Student Number',
        'Student Numbers',
        'Child Student ID',
        'Child Student IDs',
      ]);
      const status = this.normalizeStatus(this.getCell(row, ['Status']));

      const errors: string[] = [];
      const normalizedParentId = parentId.toLowerCase();

      const linkedStudentIds = this.resolveStudentReferences(studentReferenceText);
      const linkedStudentNames = this.getLinkedStudentNames(linkedStudentIds);

      if (!parentId) errors.push('Missing Parent ID');
      if (!fullName) errors.push('Missing Full Name');
      if (!email) errors.push('Missing Email');
      if (!contactNumber) errors.push('Missing Contact Number');
      if (!relationship) errors.push('Invalid Relationship');
      if (!studentReferenceText) errors.push('Missing Student ID');
      if (studentReferenceText && linkedStudentIds.length === 0) {
        errors.push('No matching student found');
      }

      if (parentId && existingParentIds.has(normalizedParentId)) {
        errors.push('Parent ID already exists');
      }

      if (parentId && fileParentIds.has(normalizedParentId)) {
        errors.push('Duplicate Parent ID in file');
      }

      if (parentId) {
        fileParentIds.add(normalizedParentId);
      }

      return {
        rowNumber: index + 2,
        parentId,
        fullName,
        email,
        contactNumber,
        relationship: relationship || 'Guardian',
        linkedStudentIds,
        studentReferenceText,
        linkedStudentNames,
        status,
        isArchived: false,
        archivedAt: null,
        isValid: errors.length === 0,
        errors,
      };
    });
  }

  private resolveStudentReferences(value: string): string[] {
    if (!value.trim()) return [];

    const references = value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const matchedIds: string[] = [];

    references.forEach((reference) => {
      const student = this.students.find((item) => {
        const docId = String(item.id || '')
          .trim()
          .toLowerCase();
        const studentId = String(item.studentId || '')
          .trim()
          .toLowerCase();

        return docId === reference || studentId === reference;
      });

      if (student?.id && !matchedIds.includes(student.id)) {
        matchedIds.push(student.id);
      }
    });

    return matchedIds;
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

  private normalizeRelationship(value: string): Relationship | '' {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'mother') return 'Mother';
    if (normalized === 'father') return 'Father';
    if (normalized === 'guardian') return 'Guardian';
    if (normalized === 'other') return 'Other';

    return '';
  }

  private normalizeStatus(value: string): 'active' | 'inactive' {
    return value.trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
  }
}
