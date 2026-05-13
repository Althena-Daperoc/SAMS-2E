import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AlertService } from '../../../core/services/alert.service';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserRole } from '../../../models/user.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  username = '';
  password = '';
  showPassword = false;
  isSubmitting = false;

  constructor(
    private authService: AuthService,
    private alertService: AlertService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onLogin(form: NgForm): void {
    if (form.invalid || !this.username.trim() || !this.password.trim()) {
      form.control.markAllAsTouched();

      this.alertService.warning(
        'Incomplete login details',
        'Please enter your username and password.',
      );
      return;
    }

    this.isSubmitting = true;
    this.alertService.loading('Signing in...', 'Please wait while we verify your account.');

    const trimmedUsername = this.username.trim();
    const trimmedPassword = this.password.trim();

    this.authService.login(trimmedUsername, trimmedPassword).subscribe({
      next: async (user) => {
        if (!user) {
          this.isSubmitting = false;
          this.alertService.close();

          await this.alertService.error('Login failed', 'Invalid username or password.');
          return;
        }

        this.alertService.close();

        await this.alertService.toastSuccess(`Welcome back, ${user.fullName}!`);

        this.isSubmitting = false;

        const targetRoute = this.resolveLoginRedirect(user);

        this.router.navigate([targetRoute]);
      },
      error: async () => {
        this.isSubmitting = false;
        this.alertService.close();

        await this.alertService.error(
          'Server connection failed',
          'Unable to connect to the server. Please try again.',
        );
      },
    });
  }

  private resolveLoginRedirect(user: User): string {
    const fallbackRoute = this.authService.getDefaultRouteByRole(user.role);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (!returnUrl || returnUrl === '/login') {
      return fallbackRoute;
    }

    if (!this.isReturnUrlSafeForRole(returnUrl, user.role)) {
      return fallbackRoute;
    }

    return returnUrl;
  }

  private isReturnUrlSafeForRole(returnUrl: string, role: UserRole): boolean {
    if (!returnUrl.startsWith('/')) {
      return false;
    }

    if (returnUrl.startsWith('/login')) {
      return false;
    }

    if (role === 'parent') {
      return returnUrl.startsWith('/parent') || returnUrl === '/settings';
    }

    if (role === 'student') {
      return (
        returnUrl.startsWith('/student') || returnUrl === '/messages' || returnUrl === '/settings'
      );
    }

    if (role === 'teacher') {
      return !returnUrl.startsWith('/parent') && !returnUrl.startsWith('/student');
    }

    if (role === 'admin') {
      return !returnUrl.startsWith('/parent') && !returnUrl.startsWith('/student');
    }

    return false;
  }
}
