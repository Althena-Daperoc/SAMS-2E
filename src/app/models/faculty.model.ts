export interface Faculty {
  id?: string;

  facultyId: string;
  fullName: string;
  email: string;
  department: string;
  role: 'instructor' | 'assistant_professor' | 'associate_professor' | 'professor';

  status: 'active' | 'inactive';

  isArchived?: boolean;
  archivedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}
