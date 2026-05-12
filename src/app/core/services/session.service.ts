import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { NotificationService } from './notification.service';
import { SessionAccessService } from './session-access.service';

@Injectable({
  providedIn: 'root',
})
export class Session {
  private readonly collectionName = 'sessions';

  private readonly defaultDurationMinutes = 30;
  private readonly defaultLateAfterMinutes = 1;
  private readonly defaultRotationSeconds = 30;

  constructor(
    private firestore: Firestore,
    private notificationService: NotificationService,
    private sessionAccessService: SessionAccessService,
  ) {}

  getSessions(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const sessionsRef = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        sessionsRef,
        (snapshot) => {
          const sessions = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          sessions.sort((a: any, b: any) => {
            const dateA = this.parseDate(a.createdAt || a.startTime)?.getTime() || 0;
            const dateB = this.parseDate(b.createdAt || b.startTime)?.getTime() || 0;
            return dateB - dateA;
          });

          observer.next(sessions);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  getActiveSessions(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const sessionsRef = collection(this.firestore, this.collectionName);

      const unsubscribe = onSnapshot(
        sessionsRef,
        (snapshot) => {
          const sessions = snapshot.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }))
            .filter((session: any) => String(session.status || '').toLowerCase() === 'active')
            .filter((session: any) => !this.isSessionExpired(session));

          sessions.sort((a: any, b: any) => {
            const dateA = this.parseDate(a.createdAt || a.startTime)?.getTime() || 0;
            const dateB = this.parseDate(b.createdAt || b.startTime)?.getTime() || 0;
            return dateB - dateA;
          });

          observer.next(sessions);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async getSessionById(sessionId: string): Promise<any | null> {
    const cleanId = String(sessionId || '').trim();

    if (!cleanId) return null;

    const sessionDoc = await getDoc(doc(this.firestore, `${this.collectionName}/${cleanId}`));

    if (!sessionDoc.exists()) return null;

    return {
      id: sessionDoc.id,
      ...sessionDoc.data(),
    };
  }

  async createSession(session: any): Promise<string> {
    const sessionsRef = collection(this.firestore, this.collectionName);
    const sessionDocRef = doc(sessionsRef);

    const sessionId = sessionDocRef.id;
    const normalizedSession = this.buildSessionPayload(session, sessionId);

    await setDoc(sessionDocRef, normalizedSession);

    await this.notifyStudentsAboutNewSession(sessionId, normalizedSession);

    return sessionId;
  }

  updateSession(id: string, session: any): Promise<void> {
    const sessionDoc = doc(this.firestore, `${this.collectionName}/${id}`);

    const updatePayload = this.stripUndefined({
      ...session,
      updatedAt: new Date().toISOString(),
    });

    return updateDoc(sessionDoc, updatePayload);
  }

  async closeSession(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) {
      throw new Error('Missing session ID.');
    }

    const sessionDoc = doc(this.firestore, `${this.collectionName}/${cleanId}`);
    const now = new Date().toISOString();

    await updateDoc(sessionDoc, {
      status: 'closed',
      endTime: now,
      closedAt: now,
      closeReason: 'manual_close',
      updatedAt: now,
    });
  }

  async closeExpiredSession(id: string): Promise<void> {
    const cleanId = String(id || '').trim();

    if (!cleanId) {
      throw new Error('Missing session ID.');
    }

    const session = await this.getSessionById(cleanId);

    if (!session) {
      throw new Error('Attendance session not found.');
    }

    if (String(session.status || '').toLowerCase() === 'closed') {
      return;
    }

    if (!this.isSessionExpired(session)) {
      return;
    }

    const now = new Date().toISOString();
    const endTime = session.autoCloseAt || session.expiresAt || session.endTime || now;

    await updateDoc(doc(this.firestore, `${this.collectionName}/${cleanId}`), {
      status: 'closed',
      endTime,
      closedAt: now,
      closeReason: 'auto_duration_expired',
      updatedAt: now,
    });
  }

  deleteSession(id: string): Promise<void> {
    const sessionDoc = doc(this.firestore, `${this.collectionName}/${id}`);
    return deleteDoc(sessionDoc);
  }

  isSessionExpired(session: any): boolean {
    const endDate =
      this.parseDate(session?.autoCloseAt) ||
      this.parseDate(session?.expiresAt) ||
      this.parseDate(session?.endTime);

    if (!endDate) return false;

    return Date.now() >= endDate.getTime();
  }

  getSessionStartTime(session: any): Date | null {
    return (
      this.parseDate(session?.startTime) ||
      this.parseDate(session?.createdAt) ||
      this.parseDate(session?.qrTokenUpdatedAt)
    );
  }

  getSessionEndTime(session: any): Date | null {
    return (
      this.parseDate(session?.autoCloseAt) ||
      this.parseDate(session?.expiresAt) ||
      this.parseDate(session?.endTime)
    );
  }

  getLateStartsAt(session: any): Date | null {
    const directLateDate = this.parseDate(session?.lateStartsAt);

    if (directLateDate) return directLateDate;

    const startTime = this.getSessionStartTime(session);

    if (!startTime) return null;

    const lateAfterMinutes = this.normalizeLateAfterMinutes(
      session?.lateAfterMinutes || session?.lateThresholdMinutes,
      this.normalizeDurationMinutes(session?.durationMinutes),
    );

    return new Date(startTime.getTime() + lateAfterMinutes * 60 * 1000);
  }

  private buildSessionPayload(session: any, sessionId: string): any {
    const now = new Date();
    const nowIso = now.toISOString();

    const startTime = this.parseDate(session?.startTime) || now;
    const startTimeIso = startTime.toISOString();

    const durationMinutes = this.normalizeDurationMinutes(session?.durationMinutes);

    const lateAfterMinutes = this.normalizeLateAfterMinutes(
      session?.lateAfterMinutes || session?.lateThresholdMinutes,
      durationMinutes,
    );

    const rotationSeconds = this.normalizeRotationSeconds(
      session?.rotationSeconds || session?.qrRotationSeconds,
    );

    const autoCloseAt = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    const lateStartsAt = new Date(startTime.getTime() + lateAfterMinutes * 60 * 1000);

    const accessSeed =
      String(session?.accessSeed || '').trim() || this.sessionAccessService.generateAccessSeed();

    const baseSessionCode =
      String(session?.sessionCode || '')
        .trim()
        .toUpperCase() || this.generateBaseSessionCode();

    const basePayload: any = {
      ...session,

      id: sessionId,

      status: session?.status || 'active',
      isActive: session?.isActive !== false,

      startTime: startTimeIso,
      createdAt: session?.createdAt || startTimeIso,
      updatedAt: nowIso,

      durationMinutes,
      expiresAt: session?.expiresAt || autoCloseAt.toISOString(),
      autoCloseAt: session?.autoCloseAt || autoCloseAt.toISOString(),

      lateAfterMinutes,
      lateThresholdMinutes: lateAfterMinutes,
      lateStartsAt: session?.lateStartsAt || lateStartsAt.toISOString(),

      antiCheatEnabled: session?.antiCheatEnabled !== false,
      accessSeed,
      rotationSeconds,
      qrRotationSeconds: rotationSeconds,

      sessionCode: baseSessionCode,
      qrToken: String(session?.qrToken || '').trim(),
      qrData: String(session?.qrData || '').trim(),

      qrTokenUpdatedAt: session?.qrTokenUpdatedAt || startTimeIso,

      mode: session?.mode || 'live',
      closeReason: session?.closeReason || '',
    };

    const liveSessionForToken = {
      ...basePayload,
      id: sessionId,
    };

    if (!basePayload.qrToken) {
      basePayload.qrToken = this.sessionAccessService.getLiveQrToken(
        liveSessionForToken,
        startTime,
      );
    }

    if (!basePayload.qrData) {
      basePayload.qrData = this.sessionAccessService.buildQrData(liveSessionForToken, startTime);
    }

    return this.stripUndefined(basePayload);
  }

  private normalizeDurationMinutes(value: any): number {
    const parsed = Number(value || this.defaultDurationMinutes);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return this.defaultDurationMinutes;
    }

    return Math.max(1, Math.floor(parsed));
  }

  private normalizeLateAfterMinutes(value: any, durationMinutes: number): number {
    const parsed = Number(value || this.defaultLateAfterMinutes);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return this.defaultLateAfterMinutes;
    }

    const cleanValue = Math.floor(parsed);

    if (cleanValue >= durationMinutes) {
      return Math.max(1, durationMinutes - 1);
    }

    return cleanValue;
  }

  private normalizeRotationSeconds(value: any): number {
    const parsed = Number(value || this.defaultRotationSeconds);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return this.defaultRotationSeconds;
    }

    return Math.min(120, Math.max(10, Math.floor(parsed)));
  }

  private generateBaseSessionCode(): string {
    const year = new Date().getFullYear().toString().slice(-2);
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `SAMS-${year}-${random}`;
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value?.toDate === 'function') {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }

    if (typeof value === 'object' && typeof value.seconds === 'number') {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private stripUndefined(value: any): any {
    const cleaned: any = {};

    Object.keys(value || {}).forEach((key) => {
      if (value[key] !== undefined) {
        cleaned[key] = value[key];
      }
    });

    return cleaned;
  }

  private async notifyStudentsAboutNewSession(sessionId: string, session: any): Promise<void> {
    const subjectName =
      session.subjectName ||
      session.subject ||
      session.title ||
      session.sessionTitle ||
      'Attendance Session';

    const sectionCode = session.sectionCode || session.section || '';

    if (!String(sectionCode).trim()) {
      console.warn('Session notification skipped because sectionCode is missing.', session);
      return;
    }

    await this.notificationService.notifyUsersByRole('student', {
      title: 'New attendance session',
      message: `${subjectName} attendance session is now active.`,
      type: 'session',
      redirectUrl: '/student/scan-attendance',
      sectionCode,
      sessionId,
    });
  }
}
