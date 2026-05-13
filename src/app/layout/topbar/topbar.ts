import {
  Component,
  ElementRef,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { AlertService } from '../../core/services/alert.service';
import { AppSearchItem, AppSearchService } from '../../core/services/app-search.service';
import { NotificationItem, NotificationService } from '../../core/services/notification.service';
import { User } from '../../models/user.model';

type PageMeta = {
  title: string;
  subtitle: string;
};

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('searchWrapper') searchWrapperRef?: ElementRef<HTMLElement>;
  @ViewChild('profileMenu') profileMenuRef?: ElementRef<HTMLElement>;
  @ViewChild('profileButton') profileButtonRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('notificationWrapper') notificationWrapperRef?: ElementRef<HTMLElement>;

  pageTitle = 'Dashboard';
  pageSubtitle = 'Overview of attendance activity and quick actions.';

  searchQuery = '';
  isSearchOpen = false;
  activeSearchIndex = 0;

  isProfileMenuOpen = false;
  isNotificationOpen = false;
  isDarkMode = false;

  notifications: NotificationItem[] = [];
  isNotificationsLoading = false;
  isNotificationActionLoading = false;

  private routerSubscription?: Subscription;
  private notificationSubscription?: Subscription;
  private readonly themeStorageKey = 'sams_theme_mode';

  private readonly pageMetaMap: Record<string, PageMeta> = {
    '/dashboard': {
      title: 'Dashboard',
      subtitle: 'Overview of attendance activity and quick actions.',
    },
    '/profile': {
      title: 'Profile',
      subtitle: 'View your SAMS account profile.',
    },
    '/settings': {
      title: 'Settings',
      subtitle: 'Manage account preferences and security.',
    },
    '/faqs': {
      title: 'Help & FAQs',
      subtitle: 'Find answers and guidance on using SAMS.',
    },
    '/students': {
      title: 'Students',
      subtitle: 'Manage student records and registration details.',
    },
    '/students/add': {
      title: 'Add Student',
      subtitle: 'Register a new student into the system.',
    },
    '/admin/faculty': {
      title: 'Faculty',
      subtitle: 'Manage faculty records and teaching personnel.',
    },
    '/admin/parents': {
      title: 'Parents',
      subtitle: 'Manage parent accounts and linked student access.',
    },
    '/subjects': {
      title: 'Subjects',
      subtitle: 'Manage subject offerings and course listings.',
    },
    '/admin/sections': {
      title: 'Sections',
      subtitle: 'Manage class sections and academic grouping.',
    },
    '/admin/assignments': {
      title: 'Assignments',
      subtitle: 'Manage faculty, subject, and section assignments.',
    },
    '/admin/user-accounts': {
      title: 'User Accounts',
      subtitle: 'Manage portal credentials and account access.',
    },
    '/reports': {
      title: 'Reports',
      subtitle: 'Generate reports and review attendance summaries.',
    },
    '/sessions/create': {
      title: 'Create Session',
      subtitle: 'Create a new attendance session for students.',
    },
    '/attendance/records': {
      title: 'Attendance Records',
      subtitle: 'Review saved attendance logs and student attendance history.',
    },
    '/student/dashboard': {
      title: 'Student Dashboard',
      subtitle: 'View your attendance overview and quick actions.',
    },
    '/student/scan-attendance': {
      title: 'Scan Attendance',
      subtitle: 'Scan or enter a session code to submit attendance.',
    },
    '/student/my-attendance': {
      title: 'My Attendance',
      subtitle: 'Track your attendance records and latest status.',
    },
    '/messages': {
      title: 'Messages',
      subtitle: 'Chat with classmates and faculty through SAMS.',
    },
    '/parent/dashboard': {
      title: 'Parent Dashboard',
      subtitle: 'Monitor your child’s attendance performance and updates.',
    },
    '/parent/child-attendance': {
      title: 'Child Attendance',
      subtitle: 'View your child’s attendance history and subject records.',
    },
  };

  constructor(
    private authService: AuthService,
    private alertService: AlertService,
    private appSearchService: AppSearchService,
    private notificationService: NotificationService,
    private router: Router,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    this.syncPageMeta(this.router.url);
    this.initializeTheme();
    this.loadNotifications();

    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const navEvent = event as NavigationEnd;
        this.syncPageMeta(navEvent.urlAfterRedirects);
        this.closeSearch(true);
        this.closeProfileMenu();
        this.closeNotifications();
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
    this.notificationSubscription?.unsubscribe();
  }

  get currentUser(): User | null {
    return this.authService.getCurrentUser();
  }

  get currentUserId(): string {
    const user = this.currentUser as any;

    return user?.id ?? user?.uid ?? user?.docId ?? user?.email ?? '';
  }

  get currentRole(): User['role'] {
    return this.currentUser?.role ?? 'admin';
  }

  get currentUserFullName(): string {
    return this.currentUser?.fullName ?? 'User';
  }

  get firstName(): string {
    return this.currentUserFullName.split(' ')[0] || 'User';
  }

  get roleLabel(): string {
    const role = this.currentRole;

    if (role === 'admin') return 'Administrator';
    if (role === 'teacher') return 'Teacher';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';

    return 'User';
  }

  get greeting(): string {
    const currentHour = new Date().getHours();

    if (currentHour < 12) return 'Good morning';
    if (currentHour < 18) return 'Good afternoon';

    return 'Good evening';
  }

  get initials(): string {
    const names = this.currentUserFullName
      .split(' ')
      .filter((part) => !!part.trim())
      .slice(0, 2);

    return names.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U';
  }

  get filteredSearchItems(): AppSearchItem[] {
    return this.appSearchService.search(this.searchQuery, this.currentRole);
  }

  get hasSearchResults(): boolean {
    return this.filteredSearchItems.length > 0;
  }

  get unreadNotificationCount(): number {
    return this.notifications.filter((notification) => !notification.isRead).length;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;

    const clickedInsideSearch = this.searchWrapperRef?.nativeElement.contains(target) ?? false;

    const clickedInsideProfile =
      this.profileMenuRef?.nativeElement.contains(target) ||
      this.profileButtonRef?.nativeElement.contains(target) ||
      false;

    const clickedInsideNotifications =
      this.notificationWrapperRef?.nativeElement.contains(target) ?? false;

    if (!clickedInsideSearch) {
      this.closeSearch();
    }

    if (!clickedInsideProfile) {
      this.closeProfileMenu();
    }

    if (!clickedInsideNotifications) {
      this.closeNotifications();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const isTypingContext =
      !!target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openSearchAndFocus();
      return;
    }

    if (event.key === '/' && !isTypingContext) {
      event.preventDefault();
      this.openSearchAndFocus();
      return;
    }

    if (event.key === 'Escape') {
      this.closeSearch();
      this.closeProfileMenu();
      this.closeNotifications();
    }
  }

  toggleSearch(): void {
    if (this.isSearchOpen) {
      this.closeSearch(true);
      return;
    }

    this.openSearchAndFocus();
  }

  openSearchAndFocus(): void {
    this.isSearchOpen = true;
    this.activeSearchIndex = 0;
    this.closeProfileMenu();
    this.closeNotifications();

    queueMicrotask(() => {
      this.searchInputRef?.nativeElement.focus();
      this.searchInputRef?.nativeElement.select();
    });
  }

  onSearchFocus(): void {
    this.isSearchOpen = true;
    this.activeSearchIndex = 0;
    this.closeNotifications();
  }

  onSearchInput(): void {
    this.isSearchOpen = true;
    this.activeSearchIndex = 0;
  }

  closeSearch(forceClear = false): void {
    const hasTypedValue = !!this.searchQuery.trim();

    if (forceClear) {
      this.searchQuery = '';
    }

    if (!forceClear && hasTypedValue) {
      return;
    }

    this.isSearchOpen = false;
    this.activeSearchIndex = 0;
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const results = this.filteredSearchItems;

    switch (event.key) {
      case 'ArrowDown':
        if (!results.length) return;
        event.preventDefault();
        this.isSearchOpen = true;
        this.activeSearchIndex = (this.activeSearchIndex + 1) % results.length;
        break;

      case 'ArrowUp':
        if (!results.length) return;
        event.preventDefault();
        this.isSearchOpen = true;
        this.activeSearchIndex = (this.activeSearchIndex - 1 + results.length) % results.length;
        break;

      case 'Enter':
        if (!this.isSearchOpen || !results.length) return;
        event.preventDefault();
        this.navigateToSearchItem(results[this.activeSearchIndex]);
        break;

      case 'Escape':
        event.preventDefault();
        this.closeSearch(true);
        break;
    }
  }

  selectSearchItem(index: number): void {
    this.activeSearchIndex = index;
  }

  navigateToSearchItem(item: AppSearchItem): void {
    this.searchQuery = '';
    this.isSearchOpen = false;
    this.activeSearchIndex = 0;
    this.router.navigate([item.route]);
  }

  toggleNotifications(): void {
    this.isNotificationOpen = !this.isNotificationOpen;

    if (this.isNotificationOpen) {
      this.closeSearch(true);
      this.closeProfileMenu();
    }
  }

  closeNotifications(): void {
    this.isNotificationOpen = false;
  }

  async openNotification(notification: NotificationItem): Promise<void> {
    if (notification.id && !notification.isRead) {
      await this.notificationService.markAsRead(notification.id);
    }

    this.closeNotifications();

    if (notification.redirectUrl) {
      await this.router.navigate([notification.redirectUrl]);
    }
  }

  async markNotificationsPreviewRead(): Promise<void> {
    if (this.isNotificationActionLoading) return;

    this.isNotificationActionLoading = true;

    try {
      await this.notificationService.markAllAsRead(this.notifications);
    } finally {
      this.isNotificationActionLoading = false;
    }
  }

  async deleteNotification(event: MouseEvent, notification: NotificationItem): Promise<void> {
    event.stopPropagation();

    if (this.isNotificationActionLoading || !notification.id) return;

    this.isNotificationActionLoading = true;

    try {
      await this.notificationService.deleteNotification(notification.id);
    } catch {
      await this.alertService.error(
        'Notification Error',
        'Unable to delete this notification. Please try again.',
      );
    } finally {
      this.isNotificationActionLoading = false;
    }
  }

  async clearAllNotifications(): Promise<void> {
    if (this.isNotificationActionLoading || !this.currentUserId || !this.notifications.length) {
      return;
    }

    const result = await this.alertService.confirm(
      'Clear Notifications',
      'Are you sure you want to remove all your notifications? This will also remove them from Firebase.',
      'Yes, clear all',
      'Cancel',
    );

    if (!result.isConfirmed) return;

    this.isNotificationActionLoading = true;

    try {
      await this.notificationService.clearUserNotifications(this.currentUserId);
      await this.alertService.toastSuccess('Notifications cleared.');
    } catch {
      await this.alertService.error(
        'Notification Error',
        'Unable to clear notifications. Please try again.',
      );
    } finally {
      this.isNotificationActionLoading = false;
    }
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;

    if (this.isProfileMenuOpen) {
      this.closeSearch(true);
      this.closeNotifications();
    }
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen = false;
  }

  onProfileButtonKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleProfileMenu();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.isProfileMenuOpen = true;
      this.closeNotifications();

      queueMicrotask(() => {
        const firstMenuButton = this.profileMenuRef?.nativeElement.querySelector(
          'button',
        ) as HTMLButtonElement | null;

        firstMenuButton?.focus();
      });
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.applyTheme(this.isDarkMode);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.themeStorageKey, this.isDarkMode ? 'dark' : 'light');
    }
  }

  goToProfile(): void {
    this.closeProfileMenu();
    this.router.navigate(['/profile']);
  }

  goToSettings(): void {
    this.closeProfileMenu();
    this.router.navigate(['/settings']);
  }

  goToFaqs(): void {
    this.closeProfileMenu();
    this.router.navigate(['/faqs']);
  }

  async logout(): Promise<void> {
    this.closeProfileMenu();

    const result = await this.alertService.confirm(
      'Logout',
      'Are you sure you want to log out of SAMS?',
      'Yes, logout',
      'Cancel',
    );

    if (!result.isConfirmed) {
      return;
    }

    await this.authService.logout();
    await this.alertService.toastSuccess('You have been logged out.');
  }

  formatNotificationTime(notification: NotificationItem): string {
    const createdAtDate = notification.createdAt?.toDate?.();

    if (!createdAtDate) {
      return 'Just now';
    }

    const diffMs = Date.now() - createdAtDate.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return createdAtDate.toLocaleDateString();
  }

  private loadNotifications(): void {
    const userId = this.currentUserId;

    this.notificationSubscription?.unsubscribe();

    if (!userId) {
      this.notifications = [];
      return;
    }

    this.isNotificationsLoading = true;

    this.notificationSubscription = this.notificationService
      .getUserNotifications(userId)
      .subscribe({
        next: (notifications) => {
          this.notifications = notifications;
          this.isNotificationsLoading = false;
        },
        error: () => {
          this.notifications = [];
          this.isNotificationsLoading = false;
        },
      });
  }

  private syncPageMeta(url: string): void {
    const cleanUrl = url.split('?')[0];
    const exactMatch = this.pageMetaMap[cleanUrl];

    if (exactMatch) {
      this.pageTitle = exactMatch.title;
      this.pageSubtitle = exactMatch.subtitle;
      return;
    }

    const partialMatchKey = Object.keys(this.pageMetaMap)
      .filter((key) => cleanUrl.startsWith(`${key}/`))
      .sort((a, b) => b.length - a.length)[0];

    if (partialMatchKey) {
      this.pageTitle = this.pageMetaMap[partialMatchKey].title;
      this.pageSubtitle = this.pageMetaMap[partialMatchKey].subtitle;
      return;
    }

    this.pageTitle = 'SAMS';
    this.pageSubtitle = 'Student Attendance Monitoring System';
  }

  private initializeTheme(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const savedTheme = localStorage.getItem(this.themeStorageKey);

    if (savedTheme === 'dark') {
      this.isDarkMode = true;
      this.applyTheme(true);
      return;
    }

    if (savedTheme === 'light') {
      this.isDarkMode = false;
      this.applyTheme(false);
      return;
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    this.isDarkMode = prefersDark;
    this.applyTheme(prefersDark);
  }

  private applyTheme(isDark: boolean): void {
    const root = this.document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }
}
