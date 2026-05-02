import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { AlertService } from '../../../core/services/alert.service';

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

        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

        this.isSubmitting = false;

        if (user.role === 'student') {
          this.router.navigate([returnUrl || '/student/dashboard']);
          return;
        }

        this.router.navigate([returnUrl || '/dashboard']);
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
}
