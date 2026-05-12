import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SidebarService {
  isCollapsed = false;

  private _isMobileOpen = false;
  private _isMobileViewport = false;

  constructor() {
    this.syncViewport(window.innerWidth);
  }

  get isMobileOpen(): boolean {
    return this._isMobileOpen;
  }

  openMobileSidebar(): void {
    this._isMobileOpen = true;
  }

  closeMobileSidebar(): void {
    this._isMobileOpen = false;
  }

  toggleMobileSidebar(): void {
    this._isMobileOpen = !this._isMobileOpen;
  }

  toggleSidebar(): void {
    if (this.isMobileViewport()) {
      this.toggleMobileSidebar();
      return;
    }

    this.isCollapsed = !this.isCollapsed;
  }

  syncViewport(width: number): void {
    this._isMobileViewport = width <= 992;

    if (!this._isMobileViewport) {
      this._isMobileOpen = false;
    }
  }

  isMobileViewport(): boolean {
    return this._isMobileViewport;
  }
}
