export interface Subject {
  id?: string;

  subjectCode: string;
  subjectName: string;

  program: 'IT' | 'EMT' | 'TCM';
  yearLevel: string;
  semester: '1st Semester' | '2nd Semester' | 'Summer';

  units: number;

  status: 'active' | 'inactive';

  isArchived?: boolean;
  archivedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}
