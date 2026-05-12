import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { SidebarService } from '../../core/services/sidebar.service';
import { User } from '../../models/user.model';

type MenuIcon =
  | 'dashboard'
  | 'students'
  | 'faculty'
  | 'parents'
  | 'subjects'
  | 'sections'
  | 'assignments'
  | 'accounts'
  | 'session'
  | 'records'
  | 'reports'
  | 'scan'
  | 'messages'
  | 'profile'
  | 'my-attendance'
  | 'parent-dashboard'
  | 'child-attendance';

type MenuItem = {
  label: string;
  route: string;
  icon: MenuIcon;
  roles: User['role'][];
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('navItem') navItemRefs!: QueryList<ElementRef<HTMLAnchorElement>>;

  private routerSubscription?: Subscription;
  private clockTimer?: ReturnType<typeof setInterval>;

  focusedIndex = 0;
  currentDateTime = new Date();

  private readonly allMenuItems: MenuItem[] = [
    // ADMIN
    {
      label: 'Dashboard',
      route: '/dashboard',
      icon: 'dashboard',
      roles: ['admin'],
    },
    {
      label: 'Students',
      route: '/students',
      icon: 'students',
      roles: ['admin'],
    },
    {
      label: 'Faculty',
      route: '/admin/faculty',
      icon: 'faculty',
      roles: ['admin'],
    },
    {
      label: 'Parents',
      route: '/admin/parents',
      icon: 'parents',
      roles: ['admin'],
    },
    {
      label: 'Subjects',
      route: '/subjects',
      icon: 'subjects',
      roles: ['admin'],
    },
    {
      label: 'Sections',
      route: '/admin/sections',
      icon: 'sections',
      roles: ['admin'],
    },
    {
      label: 'Assignments',
      route: '/admin/assignments',
      icon: 'assignments',
      roles: ['admin'],
    },
    {
      label: 'User Accounts',
      route: '/admin/user-accounts',
      icon: 'accounts',
      roles: ['admin'],
    },
    {
      label: 'Reports',
      route: '/reports',
      icon: 'reports',
      roles: ['admin'],
    },

    // TEACHER / FACULTY
    {
      label: 'Dashboard',
      route: '/dashboard',
      icon: 'dashboard',
      roles: ['teacher'],
    },
    {
      label: 'Create Session',
      route: '/sessions/create',
      icon: 'session',
      roles: ['teacher'],
    },
    {
      label: 'Attendance Records',
      route: '/attendance/records',
      icon: 'records',
      roles: ['teacher'],
    },
    {
      label: 'Reports',
      route: '/reports',
      icon: 'reports',
      roles: ['teacher'],
    },
    {
      label: 'Messages',
      route: '/messages',
      icon: 'messages',
      roles: ['teacher'],
    },

    // STUDENT
    {
      label: 'Dashboard',
      route: '/student/dashboard',
      icon: 'dashboard',
      roles: ['student'],
    },
    {
      label: 'Scan Attendance',
      route: '/student/scan-attendance',
      icon: 'scan',
      roles: ['student'],
    },
    {
      label: 'My Attendance',
      route: '/student/my-attendance',
      icon: 'my-attendance',
      roles: ['student'],
    },
    {
      label: 'Messages',
      route: '/messages',
      icon: 'messages',
      roles: ['student'],
    },

    // PARENT
    {
      label: 'Dashboard',
      route: '/parent/dashboard',
      icon: 'parent-dashboard',
      roles: ['parent'],
    },
    {
      label: 'Child Attendance',
      route: '/parent/child-attendance',
      icon: 'child-attendance',
      roles: ['parent'],
    },
  ];

  constructor(
    private authService: AuthService,
    public sidebarService: SidebarService,
    private router: Router,
  ) {
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.syncFocusedIndexToRoute();

        if (this.sidebarService.isMobileViewport()) {
          this.sidebarService.closeMobileSidebar();
        }
      });
  }

  ngOnInit(): void {
    this.startClock();
  }

  get currentUser(): User | null {
    return this.authService.getCurrentUser();
  }

  get currentRole(): User['role'] {
    return this.currentUser?.role ?? 'admin';
  }

  get menuItems(): MenuItem[] {
    return this.allMenuItems.filter((item) => item.roles.includes(this.currentRole));
  }

  get isExpanded(): boolean {
    if (this.sidebarService.isMobileViewport()) {
      return this.sidebarService.isMobileOpen;
    }

    return !this.sidebarService.isCollapsed;
  }

  ngAfterViewInit(): void {
    this.syncFocusedIndexToRoute();
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();

    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      this.sidebarService.toggleSidebar();
      return;
    }

    if (event.key === 'Escape' && this.sidebarService.isMobileOpen) {
      this.sidebarService.closeMobileSidebar();
    }
  }

  toggleSidebar(): void {
    this.sidebarService.toggleSidebar();
  }

  onNavigate(): void {
    if (this.sidebarService.isMobileViewport()) {
      this.sidebarService.closeMobileSidebar();
    }
  }

  onNavKeydown(event: KeyboardEvent): void {
    if (!this.menuItems.length) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.moveFocus(1);
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.moveFocus(-1);
        break;

      case 'Home':
        event.preventDefault();
        this.focusItem(0);
        break;

      case 'End':
        event.preventDefault();
        this.focusItem(this.menuItems.length - 1);
        break;

      default:
        break;
    }
  }

  private startClock(): void {
    this.currentDateTime = new Date();

    this.clockTimer = setInterval(() => {
      this.currentDateTime = new Date();
    }, 1000);
  }

  private moveFocus(step: number): void {
    const total = this.menuItems.length;
    this.focusedIndex = (this.focusedIndex + step + total) % total;
    this.focusItem(this.focusedIndex);
  }

  private focusItem(index: number): void {
    this.focusedIndex = index;

    queueMicrotask(() => {
      const element = this.navItemRefs?.get(index)?.nativeElement;
      element?.focus();
    });
  }

  private syncFocusedIndexToRoute(): void {
    const currentUrl = this.router.url;
    const matchIndex = this.menuItems.findIndex(
      (item) => currentUrl === item.route || currentUrl.startsWith(`${item.route}/`),
    );

    this.focusedIndex = matchIndex >= 0 ? matchIndex : 0;
  }
}
