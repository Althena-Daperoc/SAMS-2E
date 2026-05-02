import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SidebarService {
  private readonly desktopBreakpoint = 992;

  private readonly collapsedSubject = new BehaviorSubject<boolean>(false);
  private readonly mobileOpenSubject = new BehaviorSubject<boolean>(false);

  readonly collapsed$ = this.collapsedSubject.asObservable();
  readonly mobileOpen$ = this.mobileOpenSubject.asObservable();

  constructor() {
    this.syncViewport(window.innerWidth);
  }

  isMobileViewport(width = window.innerWidth): boolean {
    return width <= this.desktopBreakpoint;
  }

  get isCollapsed(): boolean {
    return this.collapsedSubject.value;
  }

  get isMobileOpen(): boolean {
    return this.mobileOpenSubject.value;
  }

  toggleSidebar(): void {
    if (this.isMobileViewport()) {
      this.mobileOpenSubject.next(!this.mobileOpenSubject.value);
      return;
    }

    this.collapsedSubject.next(!this.collapsedSubject.value);
  }

  openSidebar(): void {
    if (this.isMobileViewport()) {
      this.mobileOpenSubject.next(true);
      return;
    }

    this.collapsedSubject.next(false);
  }

  closeSidebar(): void {
    if (this.isMobileViewport()) {
      this.mobileOpenSubject.next(false);
      return;
    }

    this.collapsedSubject.next(true);
  }

  closeMobileSidebar(): void {
    this.mobileOpenSubject.next(false);
  }

  syncViewport(width: number): void {
    if (width <= this.desktopBreakpoint) {
      this.collapsedSubject.next(false);
      this.mobileOpenSubject.next(false);
      return;
    }

    this.mobileOpenSubject.next(false);
  }
}