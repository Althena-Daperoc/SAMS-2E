export interface Assignment {
  id?: string;

  assignmentCode: string;

  facultyId: string;
  subjectId: string;
  sectionId: string;

  facultyEmployeeId: string;
  facultyName: string;

  subjectCode: string;
  subjectName: string;

  sectionCode: string;
  program: 'IT' | 'EMT' | 'TCM';
  yearLevel: string;

  schoolYear: string;
  semester: '1st Semester' | '2nd Semester' | 'Summer';

  status: 'active' | 'inactive';

  isArchived?: boolean;
  archivedAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}
