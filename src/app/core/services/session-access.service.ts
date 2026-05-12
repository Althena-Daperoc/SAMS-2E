import { Injectable } from '@angular/core';

export interface SessionAccessPayload {
  type: string;
  sessionId?: string;
  sessionCode?: string;
  qrToken?: string;
  baseSessionCode?: string;
  rotationSeconds?: number;
  rotationSlot?: number;
  generatedAt?: string;
  expiresAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SessionAccessService {
  readonly defaultRotationSeconds = 30;
  readonly minRotationSeconds = 10;
  readonly maxRotationSeconds = 120;

  generateAccessSeed(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const first = Math.random().toString(36).substring(2, 12).toUpperCase();
    const second = Math.random().toString(36).substring(2, 12).toUpperCase();

    return `SAMS2-${timestamp}-${first}-${second}`;
  }

  getRotationSeconds(session: any): number {
    const rawValue =
      session?.rotationSeconds || session?.qrRotationSeconds || this.defaultRotationSeconds;

    const value = Number(rawValue);

    if (!Number.isFinite(value) || value <= 0) {
      return this.defaultRotationSeconds;
    }

    return Math.min(this.maxRotationSeconds, Math.max(this.minRotationSeconds, Math.floor(value)));
  }

  isAntiCheatEnabled(session: any): boolean {
    return Boolean(
      session?.antiCheatEnabled &&
      session?.accessSeed &&
      (session?.startTime || session?.createdAt),
    );
  }

  getLiveSessionCode(session: any, at: Date = new Date()): string {
    if (!this.isAntiCheatEnabled(session)) {
      return String(session?.sessionCode || '')
        .trim()
        .toUpperCase();
    }

    const slot = this.getRotationSlot(session, at);
    const year = this.getSessionYear(session, at);

    const hash = this.createHashCode(
      [
        'SESSION-CODE',
        session?.accessSeed || '',
        session?.id || '',
        session?.assignmentId || '',
        session?.assignmentCode || '',
        this.getReferenceTime(session, at),
        slot,
      ].join('|'),
      6,
    );

    return `SAMS-${year}-${hash}`;
  }

  getLiveQrToken(session: any, at: Date = new Date()): string {
    if (!this.isAntiCheatEnabled(session)) {
      return String(session?.qrToken || '')
        .trim()
        .toUpperCase();
    }

    const slot = this.getRotationSlot(session, at);

    const hash = this.createHashCode(
      [
        'QR-TOKEN',
        session?.accessSeed || '',
        session?.id || '',
        session?.assignmentId || '',
        session?.assignmentCode || '',
        this.getReferenceTime(session, at),
        slot,
      ].join('|'),
      14,
    );

    return `QR-${slot.toString(36).toUpperCase()}-${hash}`;
  }

  buildQrData(session: any, at: Date = new Date()): string {
    if (!this.isAntiCheatEnabled(session)) {
      return (
        session?.qrData ||
        JSON.stringify({
          type: 'SAMS_ATTENDANCE',
          sessionCode: session?.sessionCode || '',
          qrToken: session?.qrToken || '',
        })
      );
    }

    const payload: SessionAccessPayload = {
      type: 'SAMS_ATTENDANCE_DYNAMIC',
      sessionId: session?.id || '',
      sessionCode: this.getLiveSessionCode(session, at),
      qrToken: this.getLiveQrToken(session, at),
      baseSessionCode: session?.sessionCode || '',
      rotationSeconds: this.getRotationSeconds(session),
      rotationSlot: this.getRotationSlot(session, at),
      generatedAt: at.toISOString(),
      expiresAt: session?.expiresAt || session?.autoCloseAt || session?.endTime || '',
    };

    return JSON.stringify(payload);
  }

  parseAccessInput(rawValue: string): SessionAccessPayload {
    const value = String(rawValue || '').trim();

    if (!value) {
      return {
        type: 'EMPTY',
        sessionCode: '',
        qrToken: '',
      };
    }

    try {
      const parsed = JSON.parse(value);

      return {
        type: String(parsed?.type || 'SAMS_ATTENDANCE_DYNAMIC'),
        sessionId: String(parsed?.sessionId || '').trim(),
        sessionCode: String(parsed?.sessionCode || '')
          .trim()
          .toUpperCase(),
        qrToken: String(parsed?.qrToken || '')
          .trim()
          .toUpperCase(),
        baseSessionCode: String(parsed?.baseSessionCode || '')
          .trim()
          .toUpperCase(),
        rotationSeconds: Number(parsed?.rotationSeconds || this.defaultRotationSeconds),
        rotationSlot: Number(parsed?.rotationSlot || 0),
        generatedAt: String(parsed?.generatedAt || '').trim(),
        expiresAt: String(parsed?.expiresAt || '').trim(),
      };
    } catch {
      const cleanValue = value.toUpperCase();

      return {
        type: 'MANUAL_CODE',
        sessionCode: cleanValue,
        qrToken: cleanValue,
      };
    }
  }

  extractReadableCode(rawValue: string): string {
    const parsed = this.parseAccessInput(rawValue);

    return String(parsed.sessionCode || parsed.qrToken || parsed.baseSessionCode || '')
      .trim()
      .toUpperCase();
  }

  matchesLiveAccess(session: any, rawValue: string, at: Date = new Date()): boolean {
    const cleanValue = String(rawValue || '').trim();

    if (!session || !cleanValue) {
      return false;
    }

    const parsed = this.parseAccessInput(cleanValue);

    if (!this.isAntiCheatEnabled(session)) {
      const legacySessionCode = String(session?.sessionCode || '')
        .trim()
        .toUpperCase();
      const legacyQrToken = String(session?.qrToken || '')
        .trim()
        .toUpperCase();

      return (
        parsed.sessionCode === legacySessionCode ||
        parsed.qrToken === legacyQrToken ||
        parsed.baseSessionCode === legacySessionCode
      );
    }

    if (parsed.sessionId && session?.id && parsed.sessionId !== session.id) {
      return false;
    }

    const validValues = this.getValidAccessValues(session, at);
    const inputValues = [parsed.sessionCode, parsed.qrToken, parsed.baseSessionCode]
      .filter(Boolean)
      .map((value) => String(value).trim().toUpperCase());

    return inputValues.some((value) => validValues.includes(value));
  }

  getSecondsUntilNextRotation(session: any, at: Date = new Date()): number {
    if (!this.isAntiCheatEnabled(session)) {
      return 0;
    }

    const referenceTime = this.getReferenceTime(session, at);
    const rotationSeconds = this.getRotationSeconds(session);
    const elapsedSeconds = Math.max(0, Math.floor((at.getTime() - referenceTime) / 1000));
    const remainder = elapsedSeconds % rotationSeconds;

    return remainder === 0 ? rotationSeconds : rotationSeconds - remainder;
  }

  getRotationProgress(session: any, at: Date = new Date()): number {
    if (!this.isAntiCheatEnabled(session)) {
      return 100;
    }

    const rotationSeconds = this.getRotationSeconds(session);
    const secondsLeft = this.getSecondsUntilNextRotation(session, at);
    const elapsed = rotationSeconds - secondsLeft;

    return Math.min(100, Math.max(0, (elapsed / rotationSeconds) * 100));
  }

  getRotationSlot(session: any, at: Date = new Date()): number {
    const referenceTime = this.getReferenceTime(session, at);
    const rotationMs = this.getRotationSeconds(session) * 1000;
    const elapsed = Math.max(0, at.getTime() - referenceTime);

    return Math.floor(elapsed / rotationMs);
  }

  private getValidAccessValues(session: any, at: Date): string[] {
    const currentSlot = this.getRotationSlot(session, at);

    /*
      Accept current slot and previous slot only.
      This prevents false invalid scans when a student scans exactly during code rotation.
    */
    const acceptedSlots = [currentSlot, currentSlot - 1].filter((slot) => slot >= 0);

    const values: string[] = [];

    for (const slot of acceptedSlots) {
      values.push(this.getSessionCodeForSlot(session, slot, at));
      values.push(this.getQrTokenForSlot(session, slot, at));
    }

    return values.filter(Boolean).map((value) => String(value).trim().toUpperCase());
  }

  private getSessionCodeForSlot(session: any, slot: number, at: Date): string {
    const year = this.getSessionYear(session, at);

    const hash = this.createHashCode(
      [
        'SESSION-CODE',
        session?.accessSeed || '',
        session?.id || '',
        session?.assignmentId || '',
        session?.assignmentCode || '',
        this.getReferenceTime(session, at),
        slot,
      ].join('|'),
      6,
    );

    return `SAMS-${year}-${hash}`;
  }

  private getQrTokenForSlot(session: any, slot: number, at: Date): string {
    const hash = this.createHashCode(
      [
        'QR-TOKEN',
        session?.accessSeed || '',
        session?.id || '',
        session?.assignmentId || '',
        session?.assignmentCode || '',
        this.getReferenceTime(session, at),
        slot,
      ].join('|'),
      14,
    );

    return `QR-${slot.toString(36).toUpperCase()}-${hash}`;
  }

  private getReferenceTime(session: any, fallback: Date): number {
    const candidates = [
      session?.startTime,
      session?.createdAt,
      session?.qrTokenUpdatedAt,
      session?.generatedAt,
    ];

    for (const value of candidates) {
      const date = this.parseDate(value);

      if (date) {
        return date.getTime();
      }
    }

    return fallback.getTime();
  }

  private getSessionYear(session: any, fallback: Date): string {
    const candidates = [
      session?.startTime,
      session?.createdAt,
      session?.expiresAt,
      session?.autoCloseAt,
      session?.endTime,
    ];

    for (const value of candidates) {
      const date = this.parseDate(value);

      if (date) {
        return date.getFullYear().toString().slice(-2);
      }
    }

    return fallback.getFullYear().toString().slice(-2);
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

  private createHashCode(input: string, length: number): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let hash = 2166136261;

    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
      hash >>>= 0;
    }

    let output = '';
    let value = hash || 1;

    for (let i = 0; i < length; i += 1) {
      value = Math.imul(value ^ (i + 31), 2654435761) >>> 0;
      output += alphabet[value % alphabet.length];
    }

    return output;
  }
}
