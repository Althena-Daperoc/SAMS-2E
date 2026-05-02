import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { UserRole } from '../../models/user.model';

const getDefaultRouteByRole = (role: UserRole): string => {
  switch (role) {
    case 'admin':
      return '/dashboard';

    case 'teacher':
      return '/dashboard';

    case 'student':
      return '/student/dashboard';

    case 'parent':
      return '/parent/dashboard';

    default:
      return '/login';
  }
};

export const roleGuard: CanActivateFn = (route, _state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = route.data?.['roles'] as UserRole[] | undefined;
  const currentUser = authService.getCurrentUser();

  if (!currentUser) {
    router.navigate(['/login']);
    return false;
  }

  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  if (allowedRoles.includes(currentUser.role)) {
    return true;
  }

  router.navigate([getDefaultRouteByRole(currentUser.role)]);
  return false;
};
