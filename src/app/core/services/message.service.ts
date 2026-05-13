import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { Conversation } from '../../models/conversation.model';
import { ChatMessage } from '../../models/message.model';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class MessagesService {
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);
  private readonly notificationService = inject(NotificationService);

  private readonly conversationsCollection = 'conversations';
  private readonly usersCollection = 'users';

  getUsers(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const unsubscribe = runInInjectionContext(this.injector, () => {
        const usersRef = collection(this.firestore, this.usersCollection);

        return onSnapshot(
          usersRef,
          (snapshot) => {
            const users = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));

            observer.next(users);
          },
          (error) => observer.error(error),
        );
      });

      return () => unsubscribe();
    });
  }

  getConversationsByUser(userId: string): Observable<Conversation[]> {
    return new Observable<Conversation[]>((observer) => {
      const cleanUserId = String(userId || '').trim();

      if (!cleanUserId) {
        observer.next([]);
        return () => {};
      }

      const unsubscribe = runInInjectionContext(this.injector, () => {
        const conversationsRef = collection(this.firestore, this.conversationsCollection);
        const conversationsQuery = query(
          conversationsRef,
          where('participantIds', 'array-contains', cleanUserId),
        );

        return onSnapshot(
          conversationsQuery,
          (snapshot) => {
            const conversations = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            })) as Conversation[];

            conversations.sort((a, b) => {
              const dateA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt || 0).getTime();
              const dateB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt || 0).getTime();

              return dateB - dateA;
            });

            observer.next(conversations);
          },
          (error) => observer.error(error),
        );
      });

      return () => unsubscribe();
    });
  }

  getMessages(conversationId: string): Observable<ChatMessage[]> {
    return new Observable<ChatMessage[]>((observer) => {
      const cleanConversationId = String(conversationId || '').trim();

      if (!cleanConversationId) {
        observer.next([]);
        return () => {};
      }

      const unsubscribe = runInInjectionContext(this.injector, () => {
        const messagesRef = collection(
          this.firestore,
          `${this.conversationsCollection}/${cleanConversationId}/messages`,
        );

        return onSnapshot(
          messagesRef,
          (snapshot) => {
            const messages = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            })) as ChatMessage[];

            messages.sort((a, b) => {
              const dateA = new Date(a.createdAt || 0).getTime();
              const dateB = new Date(b.createdAt || 0).getTime();

              return dateA - dateB;
            });

            observer.next(messages);
          },
          (error) => observer.error(error),
        );
      });

      return () => unsubscribe();
    });
  }

  async createPrivateConversation(currentUser: any, targetUser: any): Promise<string> {
    const existingId = await this.findExistingPrivateConversation(currentUser.id, targetUser.id);

    if (existingId) {
      return existingId;
    }

    const now = new Date().toISOString();
    const participantIds = [currentUser.id, targetUser.id];

    const docRef = await runInInjectionContext(this.injector, () => {
      const conversationsRef = collection(this.firestore, this.conversationsCollection);

      return addDoc(conversationsRef, {
        type: 'private',
        name: `${currentUser.fullName} / ${targetUser.fullName}`,
        participantIds,
        participantNames: [currentUser.fullName, targetUser.fullName],
        participantRoles: [currentUser.role, targetUser.role],
        sectionCode:
          currentUser.sectionCode ||
          currentUser.section ||
          targetUser.sectionCode ||
          targetUser.section ||
          '',
        createdBy: currentUser.id,
        createdAt: now,
        updatedAt: now,
        lastMessage: '',
        lastMessageAt: '',
        lastMessageSenderId: '',
        lastMessageSenderName: '',
        unreadCounts: this.createZeroCountMap(participantIds),
        lastReadAtByUser: {
          [currentUser.id]: now,
        },
        lastDeliveredAtByUser: {
          [currentUser.id]: now,
        },
      });
    });

    return docRef.id;
  }

  async createGroupConversation(
    currentUser: any,
    name: string,
    participants: any[],
  ): Promise<string> {
    const cleanName = name.trim();

    if (!cleanName) {
      throw new Error('Group name is required.');
    }

    const now = new Date().toISOString();
    const uniqueParticipants = this.uniqueUsers([currentUser, ...participants]);
    const participantIds = uniqueParticipants.map((user) => user.id);

    const docRef = await runInInjectionContext(this.injector, () => {
      const conversationsRef = collection(this.firestore, this.conversationsCollection);

      return addDoc(conversationsRef, {
        type: 'group',
        name: cleanName,
        participantIds,
        participantNames: uniqueParticipants.map((user) => user.fullName),
        participantRoles: uniqueParticipants.map((user) => user.role),
        sectionCode: currentUser.sectionCode || currentUser.section || '',
        createdBy: currentUser.id,
        createdAt: now,
        updatedAt: now,
        lastMessage: '',
        lastMessageAt: '',
        lastMessageSenderId: '',
        lastMessageSenderName: '',
        unreadCounts: this.createZeroCountMap(participantIds),
        lastReadAtByUser: {
          [currentUser.id]: now,
        },
        lastDeliveredAtByUser: {
          [currentUser.id]: now,
        },
      });
    });

    return docRef.id;
  }

  async sendMessage(
    conversation: Conversation,
    sender: any,
    text: string,
    replyTo?: ChatMessage | null,
  ): Promise<void> {
    const cleanText = text.trim();

    if (!conversation.id || !cleanText) {
      return;
    }

    const now = new Date().toISOString();
    const receiverIds = (conversation.participantIds || []).filter(
      (participantId) => participantId !== sender.id,
    );

    await runInInjectionContext(this.injector, () => {
      const messagesRef = collection(
        this.firestore,
        `${this.conversationsCollection}/${conversation.id}/messages`,
      );

      return addDoc(messagesRef, {
        conversationId: conversation.id,
        senderId: sender.id,
        senderName: sender.fullName,
        senderRole: sender.role,
        text: cleanText,
        type: 'text',
        replyToMessageId: replyTo?.id || '',
        replyToText: replyTo?.text || '',
        replyToSenderName: replyTo?.senderName || '',
        recipientIds: receiverIds,
        deliveredTo: [sender.id],
        seenBy: [sender.id],
        deliveredAtByUser: {
          [sender.id]: now,
        },
        seenAtByUser: {
          [sender.id]: now,
        },
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
    });

    if (receiverIds.length > 0) {
      await this.notificationService.notifyUsersByIds(receiverIds, {
        title: 'New message',
        message: `${sender.fullName || 'Someone'}: ${cleanText.substring(0, 60)}`,
        type: 'message',
        redirectUrl: '/messages',
        excludeUserId: sender.id,
      });
    }

    const unreadUpdates = this.createUnreadIncrementUpdate(
      conversation.participantIds || [],
      sender.id,
    );

    await runInInjectionContext(this.injector, () => {
      const conversationDoc = doc(
        this.firestore,
        `${this.conversationsCollection}/${conversation.id}`,
      );

      return updateDoc(conversationDoc, {
        lastMessage: cleanText,
        lastMessageAt: now,
        lastMessageSenderId: sender.id,
        lastMessageSenderName: sender.fullName || '',
        updatedAt: now,
        [`lastReadAtByUser.${sender.id}`]: now,
        [`lastDeliveredAtByUser.${sender.id}`]: now,
        [`unreadCounts.${sender.id}`]: 0,
        ...unreadUpdates,
      });
    });
  }

  async markMessagesAsDelivered(conversationId: string, userId: string): Promise<void> {
    const cleanConversationId = String(conversationId || '').trim();
    const cleanUserId = String(userId || '').trim();

    if (!cleanConversationId || !cleanUserId) return;

    const now = new Date().toISOString();

    await this.updateMessageReceipt(cleanConversationId, cleanUserId, 'deliveredTo', now);

    await runInInjectionContext(this.injector, () => {
      const conversationDoc = doc(
        this.firestore,
        `${this.conversationsCollection}/${cleanConversationId}`,
      );

      return updateDoc(conversationDoc, {
        [`lastDeliveredAtByUser.${cleanUserId}`]: now,
        updatedAt: now,
      });
    });
  }

  async markMessagesAsSeen(conversationId: string, userId: string): Promise<void> {
    const cleanConversationId = String(conversationId || '').trim();
    const cleanUserId = String(userId || '').trim();

    if (!cleanConversationId || !cleanUserId) return;

    const now = new Date().toISOString();

    await this.updateMessageReceipt(cleanConversationId, cleanUserId, 'seenBy', now);

    await runInInjectionContext(this.injector, () => {
      const conversationDoc = doc(
        this.firestore,
        `${this.conversationsCollection}/${cleanConversationId}`,
      );

      return updateDoc(conversationDoc, {
        [`unreadCounts.${cleanUserId}`]: 0,
        [`lastReadAtByUser.${cleanUserId}`]: now,
        updatedAt: now,
      });
    });
  }

  async unsendMessage(conversationId: string, messageId: string): Promise<void> {
    const cleanConversationId = String(conversationId || '').trim();
    const cleanMessageId = String(messageId || '').trim();

    if (!cleanConversationId || !cleanMessageId) return;

    const now = new Date().toISOString();

    await runInInjectionContext(this.injector, () => {
      const messageDoc = doc(
        this.firestore,
        `${this.conversationsCollection}/${cleanConversationId}/messages/${cleanMessageId}`,
      );

      return updateDoc(messageDoc, {
        text: 'This message was unsent.',
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
      });
    });
  }

  private async updateMessageReceipt(
    conversationId: string,
    userId: string,
    field: 'deliveredTo' | 'seenBy',
    now: string,
  ): Promise<void> {
    const snapshot = await runInInjectionContext(this.injector, () => {
      const messagesRef = collection(
        this.firestore,
        `${this.conversationsCollection}/${conversationId}/messages`,
      );

      return getDocs(messagesRef);
    });

    const updates = snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data() as ChatMessage;

      if (data.senderId === userId) {
        return;
      }

      const currentList = Array.isArray(data[field]) ? data[field] : [];

      if (currentList.includes(userId)) {
        return;
      }

      const timestampField = field === 'deliveredTo' ? 'deliveredAtByUser' : 'seenAtByUser';

      await runInInjectionContext(this.injector, () => {
        const messageDoc = doc(
          this.firestore,
          `${this.conversationsCollection}/${conversationId}/messages/${docSnap.id}`,
        );

        return updateDoc(messageDoc, {
          [field]: [...currentList, userId],
          [`${timestampField}.${userId}`]: now,
          updatedAt: now,
        });
      });
    });

    await Promise.all(updates);
  }

  private async findExistingPrivateConversation(
    currentUserId: string,
    targetUserId: string,
  ): Promise<string | null> {
    const snapshot = await runInInjectionContext(this.injector, () => {
      const conversationsRef = collection(this.firestore, this.conversationsCollection);
      const conversationsQuery = query(
        conversationsRef,
        where('type', '==', 'private'),
        where('participantIds', 'array-contains', currentUserId),
      );

      return getDocs(conversationsQuery);
    });

    const existing = snapshot.docs.find((docSnap) => {
      const data = docSnap.data() as Conversation;
      const participantIds = data.participantIds || [];

      return participantIds.length === 2 && participantIds.includes(targetUserId);
    });

    return existing?.id || null;
  }

  private createZeroCountMap(userIds: string[]): Record<string, number> {
    const map: Record<string, number> = {};

    userIds.forEach((userId) => {
      if (userId) {
        map[userId] = 0;
      }
    });

    return map;
  }

  private createUnreadIncrementUpdate(
    participantIds: string[],
    senderId: string,
  ): Record<string, any> {
    const updates: Record<string, any> = {};

    participantIds.forEach((participantId) => {
      if (!participantId || participantId === senderId) {
        return;
      }

      updates[`unreadCounts.${participantId}`] = increment(1);
    });

    return updates;
  }

  private uniqueUsers(users: any[]): any[] {
    const map = new Map<string, any>();

    users.forEach((user) => {
      if (user?.id) {
        map.set(user.id, user);
      }
    });

    return Array.from(map.values());
  }
}
