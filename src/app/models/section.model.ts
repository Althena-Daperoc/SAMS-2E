export interface Section {
  id?: string;

  sectionCode: string; // Example: IT-2A
  program: 'IT' | 'EMT' | 'TCM';
  yearLevel: string;
  sectionName: string; // Example: A, B, C

  status: 'active' | 'inactive';

  isArchived?: boolean;
  archivedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}
