export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface ChatMessage {
  id?: string;
  conversationId: string;

  senderId: string;
  senderName: string;
  senderRole: string;

  text: string;
  type: MessageType;

  replyToMessageId?: string;
  replyToText?: string;
  replyToSenderName?: string;

  recipientIds?: string[];

  deliveredTo: string[];
  seenBy: string[];

  deliveredAtByUser?: Record<string, string>;
  seenAtByUser?: Record<string, string>;

  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;

  createdAt: string;
  updatedAt?: string;

  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
}
