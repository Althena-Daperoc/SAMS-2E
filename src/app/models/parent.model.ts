export interface Parent {
  id?: string;

  parentId: string;
  fullName: string;
  email: string;
  contactNumber: string;
  relationship: 'Mother' | 'Father' | 'Guardian' | 'Other';

  linkedStudentIds: string[];

  status: 'active' | 'inactive';

  isArchived?: boolean;
  archivedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}
