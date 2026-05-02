import { Injectable } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { Conversation } from '../../models/conversation.model';
import { ChatMessage } from '../../models/message.model';

@Injectable({
  providedIn: 'root',
})
export class MessagesService {
  private readonly conversationsCollection = 'conversations';
  private readonly usersCollection = 'users';

  constructor(private firestore: Firestore) {}

  getUsers(): Observable<any[]> {
    return new Observable<any[]>((observer) => {
      const usersRef = collection(this.firestore, this.usersCollection);

      const unsubscribe = onSnapshot(
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

      return () => unsubscribe();
    });
  }

  getConversationsByUser(userId: string): Observable<Conversation[]> {
    return new Observable<Conversation[]>((observer) => {
      const conversationsRef = collection(this.firestore, this.conversationsCollection);
      const conversationsQuery = query(
        conversationsRef,
        where('participantIds', 'array-contains', userId),
      );

      const unsubscribe = onSnapshot(
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

      return () => unsubscribe();
    });
  }

  getMessages(conversationId: string): Observable<ChatMessage[]> {
    return new Observable<ChatMessage[]>((observer) => {
      const messagesRef = collection(
        this.firestore,
        `${this.conversationsCollection}/${conversationId}/messages`,
      );

      const unsubscribe = onSnapshot(
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

      return () => unsubscribe();
    });
  }

  async createPrivateConversation(currentUser: any, targetUser: any): Promise<string> {
    const existingId = await this.findExistingPrivateConversation(currentUser.id, targetUser.id);

    if (existingId) {
      return existingId;
    }

    const now = new Date().toISOString();
    const conversationsRef = collection(this.firestore, this.conversationsCollection);

    const docRef = await addDoc(conversationsRef, {
      type: 'private',
      name: `${currentUser.fullName} / ${targetUser.fullName}`,
      participantIds: [currentUser.id, targetUser.id],
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
    const conversationsRef = collection(this.firestore, this.conversationsCollection);

    const docRef = await addDoc(conversationsRef, {
      type: 'group',
      name: cleanName,
      participantIds: uniqueParticipants.map((user) => user.id),
      participantNames: uniqueParticipants.map((user) => user.fullName),
      participantRoles: uniqueParticipants.map((user) => user.role),
      sectionCode: currentUser.sectionCode || currentUser.section || '',
      createdBy: currentUser.id,
      createdAt: now,
      updatedAt: now,
      lastMessage: '',
      lastMessageAt: '',
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

    const messagesRef = collection(
      this.firestore,
      `${this.conversationsCollection}/${conversation.id}/messages`,
    );

    await addDoc(messagesRef, {
      conversationId: conversation.id,
      senderId: sender.id,
      senderName: sender.fullName,
      senderRole: sender.role,
      text: cleanText,
      type: 'text',
      replyToMessageId: replyTo?.id || '',
      replyToText: replyTo?.text || '',
      replyToSenderName: replyTo?.senderName || '',
      deliveredTo: [sender.id],
      seenBy: [sender.id],
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    const conversationDoc = doc(
      this.firestore,
      `${this.conversationsCollection}/${conversation.id}`,
    );

    await updateDoc(conversationDoc, {
      lastMessage: cleanText,
      lastMessageAt: now,
      updatedAt: now,
    });
  }

  async markMessagesAsDelivered(conversationId: string, userId: string): Promise<void> {
    await this.updateMessageReceipt(conversationId, userId, 'deliveredTo');
  }

  async markMessagesAsSeen(conversationId: string, userId: string): Promise<void> {
    await this.updateMessageReceipt(conversationId, userId, 'seenBy');
  }

  async unsendMessage(conversationId: string, messageId: string): Promise<void> {
    const messageDoc = doc(
      this.firestore,
      `${this.conversationsCollection}/${conversationId}/messages/${messageId}`,
    );

    await updateDoc(messageDoc, {
      text: 'This message was unsent.',
      isDeleted: true,
      updatedAt: new Date().toISOString(),
    });
  }

  private async updateMessageReceipt(
    conversationId: string,
    userId: string,
    field: 'deliveredTo' | 'seenBy',
  ): Promise<void> {
    const messagesRef = collection(
      this.firestore,
      `${this.conversationsCollection}/${conversationId}/messages`,
    );

    const snapshot = await getDocs(messagesRef);

    const updates = snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data() as ChatMessage;

      if (data.senderId === userId) {
        return;
      }

      const currentList = Array.isArray(data[field]) ? data[field] : [];

      if (currentList.includes(userId)) {
        return;
      }

      const messageDoc = doc(
        this.firestore,
        `${this.conversationsCollection}/${conversationId}/messages/${docSnap.id}`,
      );

      await updateDoc(messageDoc, {
        [field]: [...currentList, userId],
        updatedAt: new Date().toISOString(),
      });
    });

    await Promise.all(updates);
  }

  private async findExistingPrivateConversation(
    currentUserId: string,
    targetUserId: string,
  ): Promise<string | null> {
    const conversationsRef = collection(this.firestore, this.conversationsCollection);
    const conversationsQuery = query(
      conversationsRef,
      where('type', '==', 'private'),
      where('participantIds', 'array-contains', currentUserId),
    );

    const snapshot = await getDocs(conversationsQuery);

    const existing = snapshot.docs.find((docSnap) => {
      const data = docSnap.data() as Conversation;
      return data.participantIds.includes(targetUserId);
    });

    return existing?.id || null;
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
