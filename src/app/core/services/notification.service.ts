import { Injectable } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { User } from '../../models/user.model';

export type NotificationType = 'system' | 'attendance' | 'session' | 'message' | 'account';

export interface NotificationItem {
  id?: string;
  userId: string;
  role: User['role'];
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  redirectUrl?: string;
  createdAt?: any;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly notificationsCollection = 'notifications';
  private readonly usersCollection = 'users';

  constructor(private firestore: Firestore) {}

  getUserNotifications(userId: string): Observable<NotificationItem[]> {
    return new Observable<NotificationItem[]>((observer) => {
      if (!userId) {
        observer.next([]);
        return;
      }

      const notificationsRef = collection(this.firestore, this.notificationsCollection);
      const notificationsQuery = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(30),
      );

      const unsubscribe = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const notifications = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<NotificationItem, 'id'>),
          }));

          observer.next(notifications);
        },
        (error) => observer.error(error),
      );

      return () => unsubscribe();
    });
  }

  async createNotification(
    notification: Omit<NotificationItem, 'id' | 'createdAt'>,
  ): Promise<void> {
    if (!notification.userId || !notification.role) {
      return;
    }

    const notificationsRef = collection(this.firestore, this.notificationsCollection);

    await addDoc(notificationsRef, {
      ...notification,
      isRead: notification.isRead ?? false,
      createdAt: serverTimestamp(),
    });
  }

  async createNotifications(
    notifications: Omit<NotificationItem, 'id' | 'createdAt'>[],
  ): Promise<void> {
    const validNotifications = notifications.filter(
      (notification) => notification.userId && notification.role,
    );

    await Promise.all(
      validNotifications.map((notification) => this.createNotification(notification)),
    );
  }

  async notifyUsersByRole(
    role: User['role'],
    payload: {
      title: string;
      message: string;
      type: NotificationType;
      redirectUrl?: string;
      excludeUserId?: string;
      sectionCode?: string;
      section?: string;
    },
  ): Promise<void> {
    const usersRef = collection(this.firestore, this.usersCollection);
    const usersQuery = query(usersRef, where('role', '==', role));
    const snapshot = await getDocs(usersQuery);

    const sectionFilter = (payload.sectionCode || payload.section || '').trim().toLowerCase();

    const notifications = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }))
      .filter((user: any) => {
        if (!user?.id) return false;
        if (payload.excludeUserId && user.id === payload.excludeUserId) return false;

        if (!sectionFilter) return true;

        const userSection = String(user.sectionCode || user.section || '')
          .trim()
          .toLowerCase();
        return userSection === sectionFilter;
      })
      .map((user: any) => ({
        userId: user.id,
        role,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        isRead: false,
        redirectUrl: payload.redirectUrl || '',
      }));

    await this.createNotifications(notifications);
  }

  async notifyUsersByIds(
    userIds: string[],
    payload: {
      title: string;
      message: string;
      type: NotificationType;
      redirectUrl?: string;
      excludeUserId?: string;
    },
  ): Promise<void> {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

    if (!uniqueUserIds.length) {
      return;
    }

    const usersRef = collection(this.firestore, this.usersCollection);
    const snapshot = await getDocs(usersRef);

    const users = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      }))
      .filter((user: any) => {
        if (!uniqueUserIds.includes(user.id)) return false;
        if (payload.excludeUserId && user.id === payload.excludeUserId) return false;
        return true;
      });

    const notifications = users.map((user: any) => ({
      userId: user.id,
      role: user.role,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      isRead: false,
      redirectUrl: payload.redirectUrl || '',
    }));

    await this.createNotifications(notifications);
  }

  async markAsRead(notificationId: string): Promise<void> {
    if (!notificationId) {
      return;
    }

    const notificationDoc = doc(
      this.firestore,
      `${this.notificationsCollection}/${notificationId}`,
    );

    await updateDoc(notificationDoc, {
      isRead: true,
    });
  }

  async markAllAsRead(notifications: NotificationItem[]): Promise<void> {
    const unreadNotifications = notifications.filter(
      (notification) => notification.id && !notification.isRead,
    );

    await Promise.all(
      unreadNotifications.map((notification) => this.markAsRead(notification.id as string)),
    );
  }
}
