export type ConversationType = 'private' | 'group';

export interface Conversation {
  id?: string;
  type: ConversationType;
  name: string;
  participantIds: string[];
  participantNames: string[];
  participantRoles: string[];
  sectionCode?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  unreadCounts?: Record<string, number>;
  lastReadAtByUser?: Record<string, string>;
  lastDeliveredAtByUser?: Record<string, string>;
}
