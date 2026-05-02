export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  email?: string;
  linkedStudentIds?: string[];
  status?: 'active' | 'inactive';
}
