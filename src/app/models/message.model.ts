export type MessageType = 'text';

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

  deliveredTo: string[];
  seenBy: string[];

  createdAt: string;
  updatedAt?: string;
  isDeleted: boolean;
}
