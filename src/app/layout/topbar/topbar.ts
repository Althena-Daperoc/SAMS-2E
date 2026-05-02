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
  @ViewChild('searchPanel') searchPanelRef?: ElementRef<HTMLElement>;
  @ViewChild('searchWrapper') searchWrapperRef?: ElementRef<HTMLElement>;
  @ViewChild('profileMenu') profileMenuRef?: ElementRef<HTMLElement>;
  @ViewChild('profileButton') profileButtonRef?: ElementRef<HTMLButtonElement>;

  pageTitle = 'Dashboard';
  pageSubtitle = 'Overview of attendance activity and quick actions.';
  searchQuery = '';
  isSearchOpen = false;
  isProfileMenuOpen = false;
  activeSearchIndex = 0;
  isDarkMode = false;

  private routerSubscription?: Subscription;
  private readonly themeStorageKey = 'sams_theme_mode';

  private readonly pageMetaMap: Record<string, PageMeta> = {
    '/dashboard': {
      title: 'Dashboard',
      subtitle: 'Overview of attendance activity and quick actions.',
    },
    '/students': {
      title: 'Students',
      subtitle: 'Manage student records and registration details.',
    },
    '/students/add': {
      title: 'Add Student',
      subtitle: 'Register a new student into the system.',
    },
    '/subjects': {
      title: 'Subjects',
      subtitle: 'Manage subject offerings and course listings.',
    },
    '/sessions/create': {
      title: 'Create Session',
      subtitle: 'Create a new attendance session for a subject.',
    },
    '/attendance/check': {
      title: 'Attendance Check',
      subtitle: 'Mark and review attendance for active sessions.',
    },
    '/attendance/records': {
      title: 'Attendance Records',
      subtitle: 'Review saved attendance logs and history.',
    },
    '/reports': {
      title: 'Reports',
      subtitle: 'Generate reports and review attendance summaries.',
    },
    '/student/my-attendance': {
      title: 'My Attendance',
      subtitle: 'Track your attendance records and recent activity.',
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
    private router: Router,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    this.syncPageMeta(this.router.url);
    this.initializeTheme();

    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const navEvent = event as NavigationEnd;
        this.syncPageMeta(navEvent.urlAfterRedirects);
        this.closeSearch(true);
        this.closeProfileMenu();
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  get currentUser(): User | null {
    return this.authService.getCurrentUser();
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

    if (role === 'admin') {
      return 'Administrator';
    }

    if (role === 'teacher') {
      return 'Teacher';
    }

    if (role === 'student') {
      return 'Student';
    }

    if (role === 'parent') {
      return 'Parent';
    }

    return 'User';
  }

  get greeting(): string {
    const currentHour = new Date().getHours();

    if (currentHour < 12) {
      return 'Good morning';
    }

    if (currentHour < 18) {
      return 'Good afternoon';
    }

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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;

    const clickedInsideSearch = this.searchWrapperRef?.nativeElement.contains(target) ?? false;

    const clickedInsideProfile =
      this.profileMenuRef?.nativeElement.contains(target) ||
      this.profileButtonRef?.nativeElement.contains(target) ||
      false;

    if (!clickedInsideSearch) {
      this.closeSearch();
    }

    if (!clickedInsideProfile) {
      this.closeProfileMenu();
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

    queueMicrotask(() => {
      this.searchInputRef?.nativeElement.focus();
      this.searchInputRef?.nativeElement.select();
    });
  }

  onSearchFocus(): void {
    this.isSearchOpen = true;
    this.activeSearchIndex = 0;
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

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;

    if (this.isProfileMenuOpen) {
      this.closeSearch(true);
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

  async openProfileInfo(): Promise<void> {
    this.closeProfileMenu();

    await this.alertService.info(
      'Profile',
      `${this.currentUserFullName} is currently signed in as ${this.roleLabel}.`,
    );
  }

  async openSettings(): Promise<void> {
    this.closeProfileMenu();

    await this.alertService.info(
      'Settings',
      'Settings page is not built yet. We can create it next after topbar polish.',
    );
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

    this.authService.logout();
    await this.alertService.toastSuccess('You have been logged out.');
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

    this.pageTitle = 'Student Attendance Monitoring System';
    this.pageSubtitle = 'Manage attendance, sessions, and records efficiently.';
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
