export interface Student {
  id: string;

  studentId: string;
  fullName: string;
  program: string;
  yearLevel: string;
  section: string;
  email?: string;

  status: 'active' | 'inactive';

  isArchived?: boolean;
  archivedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

export interface StudentParentLinkPayload {
  parentId?: string;
  fullName: string;
  email: string;
  contactNumber: string;
  relationship: 'Mother' | 'Father' | 'Guardian' | 'Other';
}
