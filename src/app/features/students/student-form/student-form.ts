import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

import { StudentService } from '../../../core/services/student.service';
import { StudentParentLinkPayload } from '../../../models/student.model';

type Relationship = 'Mother' | 'Father' | 'Guardian' | 'Other';

@Component({
  selector: 'app-student-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-form.html',
  styleUrl: './student-form.scss',
})
export class StudentForm {
  studentId = '';
  fullName = '';
  program = '';
  yearLevel = '';
  section = '';
  email = '';

  parentId = '';
  parentFullName = '';
  parentEmail = '';
  parentContactNumber = '';
  parentRelationship: Relationship = 'Guardian';

  isSaving = false;

  constructor(
    private studentService: StudentService,
    private router: Router,
  ) {}

  async onSubmit(): Promise<void> {
    if (
      !this.studentId.trim() ||
      !this.fullName.trim() ||
      !this.program.trim() ||
      !this.yearLevel.trim() ||
      !this.section.trim()
    ) {
      await Swal.fire({
        title: 'Incomplete Student Details',
        text: 'Please complete all required student fields before saving.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    const hasAnyParentInput =
      !!this.parentId.trim() ||
      !!this.parentFullName.trim() ||
      !!this.parentEmail.trim() ||
      !!this.parentContactNumber.trim();

    const hasCompleteParentInput =
      !!this.parentFullName.trim() &&
      !!this.parentEmail.trim() &&
      !!this.parentContactNumber.trim();

    if (hasAnyParentInput && !hasCompleteParentInput) {
      await Swal.fire({
        title: 'Incomplete Parent Details',
        text: 'If you want to link a parent, please provide parent full name, email, and contact number.',
        icon: 'warning',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    this.isSaving = true;

    try {
      const parentPayload: StudentParentLinkPayload | null = hasCompleteParentInput
        ? {
            parentId: this.parentId.trim() || undefined,
            fullName: this.parentFullName.trim(),
            email: this.parentEmail.trim().toLowerCase(),
            contactNumber: this.parentContactNumber.trim(),
            relationship: this.parentRelationship,
          }
        : null;

      await this.studentService.addStudentWithParent(
        {
          studentId: this.studentId.trim(),
          fullName: this.fullName.trim(),
          program: this.program.trim(),
          yearLevel: this.yearLevel.trim(),
          section: this.section.trim(),
          email: this.email.trim() || undefined,
          status: 'active',
        },
        parentPayload,
      );

      await Swal.fire({
        title: 'Student Saved',
        text: parentPayload
          ? 'Student record was saved and parent was linked successfully.'
          : 'Student record was saved successfully.',
        icon: 'success',
        timer: 1600,
        showConfirmButton: false,
      });

      this.router.navigate(['/students']);
    } catch (error) {
      console.error('Failed to save student:', error);

      await Swal.fire({
        title: 'Save Failed',
        text: 'Failed to save student. Please try again.',
        icon: 'error',
        confirmButtonColor: '#4f46e5',
      });

      this.isSaving = false;
    }
  }

  onCancel(): void {
    this.router.navigate(['/students']);
  }
}
