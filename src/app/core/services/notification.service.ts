import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export type NotificationRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface NotificationItem {
  id?: string;
  userId: string;
  role?: NotificationRole | null;
  title: string;
  message: string;
  type: string;
  redirectUrl?: string | null;
  sectionCode?: string | null;
  sessionId?: string | null;
  isRead: boolean;
  createdAt: any;
}

export interface NotificationPayload {
  title: string;
  message: string;
  type: string;
  redirectUrl?: string | null;
  sectionCode?: string | null;
  sessionId?: string | null;
  excludeUserId?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  getUserNotifications(userId: string): Observable<NotificationItem[]> {
    return new Observable<NotificationItem[]>((observer) => {
      const cleanUserId = String(userId || '').trim();

      if (!cleanUserId) {
        observer.next([]);
        return () => {};
      }

      const unsubscribe = runInInjectionContext(this.injector, () => {
        const notificationsRef = collection(this.firestore, 'notifications');

        const notificationsQuery = query(
          notificationsRef,
          where('userId', '==', cleanUserId),
          orderBy('createdAt', 'desc'),
        );

        return onSnapshot(
          notificationsQuery,
          (snapshot) => {
            const notifications: NotificationItem[] = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<NotificationItem, 'id'>),
            }));

            observer.next(notifications);
          },
          (error) => {
            observer.error(error);
          },
        );
      });

      return () => unsubscribe();
    });
  }

  async createNotification(
    notification: NotificationPayload & {
      userId: string;
      role?: NotificationRole | null;
    },
  ): Promise<void> {
    await this.notifyUsersByIds([notification.userId], {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      redirectUrl: notification.redirectUrl ?? null,
      sectionCode: notification.sectionCode ?? null,
      sessionId: notification.sessionId ?? null,
      excludeUserId: notification.excludeUserId ?? null,
    });
  }

  async notifyUsersByIds(userIds: string[], notification: NotificationPayload): Promise<void> {
    const cleanUserIds = Array.from(
      new Set(
        userIds
          .map((id) => String(id || '').trim())
          .filter((id) => id && id !== notification.excludeUserId),
      ),
    );

    if (!cleanUserIds.length) return;

    for (let i = 0; i < cleanUserIds.length; i += 450) {
      await runInInjectionContext(this.injector, async () => {
        const notificationsRef = collection(this.firestore, 'notifications');
        const batch = writeBatch(this.firestore);
        const chunk = cleanUserIds.slice(i, i + 450);

        chunk.forEach((userId) => {
          const notificationRef = doc(notificationsRef);

          batch.set(notificationRef, {
            userId,
            role: null,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            redirectUrl: notification.redirectUrl ?? null,
            sectionCode: notification.sectionCode ?? null,
            sessionId: notification.sessionId ?? null,
            isRead: false,
            createdAt: serverTimestamp(),
          });
        });

        await batch.commit();
      });
    }
  }

  async notifyUsersByRole(
    role: NotificationRole,
    notification: NotificationPayload,
  ): Promise<void> {
    const usersSnapshot = await runInInjectionContext(this.injector, () => {
      const usersRef = collection(this.firestore, 'users');
      const usersQuery = query(usersRef, where('role', '==', role));

      return getDocs(usersQuery);
    });

    let targetUsers = usersSnapshot.docs.map((userDoc) => ({
      id: userDoc.id,
      ...(userDoc.data() as any),
    }));

    if (role === 'student' && notification.sectionCode) {
      targetUsers = await this.filterStudentUsersBySection(targetUsers, notification.sectionCode);
    }

    targetUsers = targetUsers.filter((user) => user.id !== notification.excludeUserId);

    if (!targetUsers.length) return;

    await this.notifyUsersByIds(
      targetUsers.map((user) => user.id),
      notification,
    );
  }

  async notifySpecificUser(
    userId: string,
    notification: NotificationPayload & {
      role?: NotificationRole | null;
    },
  ): Promise<void> {
    await this.notifyUsersByIds([userId], notification);
  }

  async markAsRead(notificationId: string): Promise<void> {
    const cleanNotificationId = String(notificationId || '').trim();

    if (!cleanNotificationId) return;

    await runInInjectionContext(this.injector, async () => {
      const notificationRef = doc(this.firestore, `notifications/${cleanNotificationId}`);

      await updateDoc(notificationRef, {
        isRead: true,
      });
    });
  }

  async markAllAsRead(notifications: NotificationItem[]): Promise<void> {
    const unreadNotifications = notifications.filter(
      (notification) => !notification.isRead && notification.id,
    );

    if (!unreadNotifications.length) return;

    for (let i = 0; i < unreadNotifications.length; i += 450) {
      await runInInjectionContext(this.injector, async () => {
        const batch = writeBatch(this.firestore);
        const chunk = unreadNotifications.slice(i, i + 450);

        chunk.forEach((notification) => {
          const notificationRef = doc(this.firestore, `notifications/${notification.id}`);
          batch.update(notificationRef, {
            isRead: true,
          });
        });

        await batch.commit();
      });
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    const cleanNotificationId = String(notificationId || '').trim();

    if (!cleanNotificationId) return;

    await runInInjectionContext(this.injector, async () => {
      const notificationRef = doc(this.firestore, `notifications/${cleanNotificationId}`);
      await deleteDoc(notificationRef);
    });
  }

  async clearUserNotifications(userId: string): Promise<void> {
    const cleanUserId = String(userId || '').trim();

    if (!cleanUserId) return;

    const snapshot = await runInInjectionContext(this.injector, () => {
      const notificationsRef = collection(this.firestore, 'notifications');
      const notificationsQuery = query(notificationsRef, where('userId', '==', cleanUserId));

      return getDocs(notificationsQuery);
    });

    if (snapshot.empty) return;

    for (let i = 0; i < snapshot.docs.length; i += 450) {
      await runInInjectionContext(this.injector, async () => {
        const batch = writeBatch(this.firestore);
        const chunk = snapshot.docs.slice(i, i + 450);

        chunk.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });

        await batch.commit();
      });
    }
  }

  private async filterStudentUsersBySection(users: any[], sectionCode: string): Promise<any[]> {
    const targetSection = this.normalizeSection(sectionCode);

    if (!targetSection) {
      return users;
    }

    const directUserMatches = users.filter((user) => {
      const userSections = [user.sectionCode, user.section, user.classSection, user.studentSection]
        .map((value) => this.normalizeSection(value))
        .filter(Boolean);

      return userSections.includes(targetSection);
    });

    if (directUserMatches.length) {
      return directUserMatches;
    }

    const studentsSnapshot = await runInInjectionContext(this.injector, () => {
      const studentsRef = collection(this.firestore, 'students');

      return getDocs(studentsRef);
    });

    const matchingStudents = studentsSnapshot.docs
      .map((studentDoc) => ({
        id: studentDoc.id,
        ...(studentDoc.data() as any),
      }))
      .filter((student) => {
        const studentSections = [
          student.sectionCode,
          student.section,
          student.classSection,
          student.studentSection,
        ]
          .map((value) => this.normalizeSection(value))
          .filter(Boolean);

        return studentSections.includes(targetSection);
      });

    const matchingStudentKeys = new Set<string>();

    matchingStudents.forEach((student) => {
      [
        student.id,
        student.studentId,
        student.studentNumber,
        student.username,
        student.email,
        student.fullName,
        student.name,
      ].forEach((value) => {
        const key = this.normalizeKey(value);
        if (key) matchingStudentKeys.add(key);
      });
    });

    return users.filter((user) => {
      const userKeys = [
        user.id,
        user.username,
        user.studentId,
        user.studentNumber,
        user.studentDocId,
        user.linkedStudentId,
        user.email,
        user.fullName,
        user.name,
      ]
        .map((value) => this.normalizeKey(value))
        .filter(Boolean);

      const linkedStudentIds = Array.isArray(user.linkedStudentIds)
        ? user.linkedStudentIds.map((value: any) => this.normalizeKey(value)).filter(Boolean)
        : [];

      return [...userKeys, ...linkedStudentIds].some((key) => matchingStudentKeys.has(key));
    });
  }

  private normalizeSection(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/^it-/, '')
      .replace(/^tcm-/, '')
      .replace(/^emt-/, '');
  }

  private normalizeKey(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }
}
