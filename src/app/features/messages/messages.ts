import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

import { AuthService } from '../../core/services/auth.service';
import { MessagesService } from '../../core/services/message.service';
import { Conversation } from '../../models/conversation.model';
import { ChatMessage } from '../../models/message.model';
import { User } from '../../models/user.model';

type ChatUser = User & {
  id: string;
  sectionCode?: string;
  section?: string;
  program?: string;
  studentId?: string;
  facultyId?: string;
};

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.html',
  styleUrl: './messages.scss',
})
export class Messages implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageScroll') messageScroll?: ElementRef<HTMLDivElement>;
  @ViewChild('composerTextarea') composerTextarea?: ElementRef<HTMLTextAreaElement>;

  currentUser: ChatUser | null = null;

  users: ChatUser[] = [];
  conversations: Conversation[] = [];
  messages: ChatMessage[] = [];

  selectedConversation: Conversation | null = null;
  selectedRecipientIds: string[] = [];

  searchTerm = '';
  contactSearchTerm = '';
  messageText = '';
  groupName = '';

  isLoading = true;
  isSending = false;
  showNewChatPanel = false;
  showEmojiPanel = false;
  isChatOpenOnMobile = false;
  chatMode: 'private' | 'group' = 'private';

  replyToMessage: ChatMessage | null = null;

  readonly quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥', '✅', '👀', '😊', '🎉'];

  private shouldScrollToBottom = false;
  private subscriptions: Subscription[] = [];
  private messagesSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private messagesService: MessagesService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser() as ChatUser | null;
    this.loadUsers();
    this.loadConversations();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.messagesSubscription?.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  get filteredConversations(): Conversation[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) {
      return this.conversations;
    }

    return this.conversations.filter((conversation) =>
      [
        this.getConversationTitle(conversation),
        this.getConversationPreview(conversation),
        conversation.lastMessage,
        conversation.lastMessageSenderName,
        conversation.participantNames?.join(' '),
        conversation.participantRoles?.join(' '),
        conversation.sectionCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }

  get allowedContacts(): ChatUser[] {
    if (!this.currentUser) return [];

    const keyword = this.contactSearchTerm.trim().toLowerCase();

    return this.users
      .filter((user) => user.id !== this.currentUser?.id)
      .filter((user) => this.canChatWith(user))
      .filter((user) => {
        if (!keyword) return true;

        return [
          user.fullName,
          user.username,
          user.email,
          user.role,
          user.sectionCode,
          user.section,
          user.program,
          user.studentId,
          user.facultyId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  get selectedRecipients(): ChatUser[] {
    return this.users.filter((user) => this.selectedRecipientIds.includes(user.id));
  }

  get canCreateChat(): boolean {
    if (this.chatMode === 'private') {
      return this.selectedRecipientIds.length === 1;
    }

    return this.groupName.trim().length > 0 && this.selectedRecipientIds.length > 0;
  }

  get activeConversationTitle(): string {
    if (!this.selectedConversation) return 'Select a conversation';
    return this.getConversationTitle(this.selectedConversation);
  }

  get activeConversationSubtitle(): string {
    if (!this.selectedConversation) {
      return 'Choose an existing chat or start a new one.';
    }

    if (this.selectedConversation.type === 'group') {
      return this.getConversationMembersLabel(this.selectedConversation);
    }

    const otherUser = this.getOtherParticipantUser(this.selectedConversation);
    const roleLabel = this.getRoleLabel(
      otherUser?.role || this.getOtherParticipantRole(this.selectedConversation),
    );

    return `${roleLabel} • Private conversation`;
  }

  get activeOtherParticipant(): string {
    if (!this.selectedConversation || !this.currentUser) return '';

    const index = this.selectedConversation.participantIds.findIndex(
      (id) => id !== this.currentUser?.id,
    );

    return this.selectedConversation.participantNames?.[index] || '';
  }

  get hasAllowedContacts(): boolean {
    return this.allowedContacts.length > 0;
  }

  loadUsers(): void {
    const sub = this.messagesService.getUsers().subscribe({
      next: (users) => {
        this.users = (users || []) as ChatUser[];
      },
      error: () => {
        this.users = [];
        this.showError('Unable to load contacts. Please refresh the page and try again.');
      },
    });

    this.subscriptions.push(sub);
  }

  loadConversations(): void {
    if (!this.currentUser?.id) {
      this.isLoading = false;
      return;
    }

    const sub = this.messagesService.getConversationsByUser(this.currentUser.id).subscribe({
      next: (conversations) => {
        this.conversations = conversations || [];
        this.isLoading = false;

        if (!this.selectedConversation && this.conversations.length > 0) {
          this.selectConversation(this.conversations[0], false);
          return;
        }

        if (this.selectedConversation?.id) {
          const refreshedConversation = this.conversations.find(
            (conversation) => conversation.id === this.selectedConversation?.id,
          );

          if (refreshedConversation) {
            this.selectedConversation = refreshedConversation;
          }
        }
      },
      error: () => {
        this.conversations = [];
        this.isLoading = false;
        this.showError('Unable to load conversations. Please refresh the page and try again.');
      },
    });

    this.subscriptions.push(sub);
  }

  selectConversation(conversation: Conversation, openOnMobile = true): void {
    this.selectedConversation = conversation;
    this.replyToMessage = null;
    this.showEmojiPanel = false;
    this.messages = [];
    this.shouldScrollToBottom = true;

    if (openOnMobile) {
      this.isChatOpenOnMobile = true;
    }

    this.messagesSubscription?.unsubscribe();

    if (!conversation.id || !this.currentUser?.id) return;

    this.messagesService.markMessagesAsDelivered(conversation.id, this.currentUser.id);
    this.messagesService.markMessagesAsSeen(conversation.id, this.currentUser.id);

    this.messagesSubscription = this.messagesService.getMessages(conversation.id).subscribe({
      next: (messages) => {
        this.messages = messages || [];
        this.shouldScrollToBottom = true;

        if (conversation.id && this.currentUser?.id) {
          this.messagesService.markMessagesAsSeen(conversation.id, this.currentUser.id);
        }
      },
      error: () => {
        this.messages = [];
        this.showError('Unable to load messages for this conversation.');
      },
    });
  }

  async startConversation(): Promise<void> {
    if (!this.currentUser || !this.canCreateChat) return;

    try {
      let conversationId = '';

      if (this.chatMode === 'private') {
        const targetUser = this.users.find((user) => user.id === this.selectedRecipientIds[0]);

        if (!targetUser) return;

        conversationId = await this.messagesService.createPrivateConversation(
          this.currentUser,
          targetUser,
        );
      } else {
        conversationId = await this.messagesService.createGroupConversation(
          this.currentUser,
          this.groupName,
          this.selectedRecipients,
        );
      }

      this.resetNewChatPanel();
      this.showToast('Conversation is ready.');

      const createdConversation = this.conversations.find((item) => item.id === conversationId);

      if (createdConversation) {
        this.selectConversation(createdConversation);
      }
    } catch (error) {
      this.showError(
        'Failed to start conversation. Please check the selected contact and try again.',
      );
    }
  }

  async sendMessage(): Promise<void> {
    if (!this.currentUser || !this.selectedConversation || !this.messageText.trim()) {
      return;
    }

    this.isSending = true;

    try {
      await this.messagesService.sendMessage(
        this.selectedConversation,
        this.currentUser,
        this.messageText,
        this.replyToMessage,
      );

      this.messageText = '';
      this.replyToMessage = null;
      this.showEmojiPanel = false;
      this.resetComposerHeight();
      this.shouldScrollToBottom = true;
    } catch (error) {
      this.showError('Failed to send message. Please check your connection and try again.');
    } finally {
      this.isSending = false;
    }
  }

  onMessageInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onComposerInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement | null;

    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }

  setReply(message: ChatMessage): void {
    if (message.isDeleted) return;
    this.replyToMessage = message;
    this.showEmojiPanel = false;
    setTimeout(() => this.composerTextarea?.nativeElement.focus(), 0);
  }

  cancelReply(): void {
    this.replyToMessage = null;
  }

  async unsend(message: ChatMessage): Promise<void> {
    if (!this.selectedConversation?.id || !message.id) return;
    if (!this.isMine(message)) return;

    const result = await Swal.fire({
      title: 'Unsend message?',
      text: 'This message will be replaced with an unsent-message notice.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, unsend',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      customClass: {
        popup: 'sams-swal-popup',
        title: 'sams-swal-title',
        htmlContainer: 'sams-swal-text',
        confirmButton: 'sams-swal-confirm',
        cancelButton: 'sams-swal-cancel',
      },
      buttonsStyling: false,
    });

    if (!result.isConfirmed) return;

    try {
      await this.messagesService.unsendMessage(this.selectedConversation.id, message.id);
      this.showToast('Message unsent.');
    } catch (error) {
      this.showError('Failed to unsend message. Please try again.');
    }
  }

  toggleNewChatPanel(): void {
    this.showNewChatPanel = !this.showNewChatPanel;
    this.showEmojiPanel = false;

    if (!this.showNewChatPanel) {
      this.resetNewChatPanel();
    }
  }

  closeNewChatPanel(): void {
    this.resetNewChatPanel();
  }

  setChatMode(mode: 'private' | 'group'): void {
    this.chatMode = mode;
    this.selectedRecipientIds = [];
    this.groupName = '';
  }

  toggleRecipient(user: ChatUser): void {
    if (this.chatMode === 'private') {
      this.selectedRecipientIds = [user.id];
      return;
    }

    if (this.selectedRecipientIds.includes(user.id)) {
      this.selectedRecipientIds = this.selectedRecipientIds.filter((id) => id !== user.id);
      return;
    }

    this.selectedRecipientIds = [...this.selectedRecipientIds, user.id];
  }

  isRecipientSelected(user: ChatUser): boolean {
    return this.selectedRecipientIds.includes(user.id);
  }

  isMine(message: ChatMessage): boolean {
    return message.senderId === this.currentUser?.id;
  }

  getConversationTitle(conversation: Conversation): string {
    if (!this.currentUser) return conversation.name || 'Conversation';

    if (conversation.type === 'group') {
      return conversation.name || 'Group Chat';
    }

    const index = conversation.participantIds.findIndex((id) => id !== this.currentUser?.id);

    return conversation.participantNames?.[index] || conversation.name || 'Private Chat';
  }

  getConversationInitial(conversation: Conversation): string {
    return this.getInitials(this.getConversationTitle(conversation));
  }

  getConversationPreview(conversation: Conversation): string {
    const lastMessage = conversation.lastMessage?.trim();

    if (lastMessage) {
      if (conversation.lastMessageSenderId === this.currentUser?.id) {
        return `You: ${lastMessage}`;
      }

      return lastMessage;
    }

    return conversation.type === 'group' ? 'Group conversation started' : 'Private chat started';
  }

  getUnreadCount(conversation: Conversation): number {
    if (!this.currentUser?.id) return 0;

    const count = conversation.unreadCounts?.[this.currentUser.id];

    if (typeof count !== 'number') return 0;

    return Math.max(0, count);
  }

  hasUnread(conversation: Conversation): boolean {
    return this.getUnreadCount(conversation) > 0;
  }

  getUnreadBadgeLabel(conversation: Conversation): string {
    const count = this.getUnreadCount(conversation);

    if (count > 99) {
      return '99+';
    }

    return String(count);
  }

  isConversationSelected(conversation: Conversation): boolean {
    return this.selectedConversation?.id === conversation.id;
  }

  getConversationMembersLabel(conversation: Conversation): string {
    const count = conversation.participantIds?.length || 0;
    return `${count} ${count === 1 ? 'member' : 'members'}`;
  }

  getConversationTypeLabel(conversation: Conversation): string {
    return conversation.type === 'group' ? 'Group chat' : 'Private chat';
  }

  getOtherParticipantUser(conversation: Conversation): ChatUser | null {
    if (!this.currentUser) return null;

    const otherId = conversation.participantIds.find((id) => id !== this.currentUser?.id);

    if (!otherId) return null;

    return this.users.find((user) => user.id === otherId) || null;
  }

  getOtherParticipantRole(conversation: Conversation): string {
    if (!this.currentUser) return '';

    const index = conversation.participantIds.findIndex((id) => id !== this.currentUser?.id);

    return conversation.participantRoles?.[index] || '';
  }

  getConversationParticipantNames(conversation: Conversation): string {
    if (!this.currentUser) return conversation.participantNames?.join(', ') || '';

    return (conversation.participantNames || [])
      .filter((name) => name !== this.currentUser?.fullName)
      .join(', ');
  }

  getUserInitial(user?: ChatUser | null): string {
    return this.getInitials(user?.fullName || user?.username || 'User');
  }

  getMessageInitial(message: ChatMessage): string {
    return this.getInitials(message.senderName || 'User');
  }

  getMessageReceiptLabel(message: ChatMessage): string {
    if (!this.isMine(message) || !this.selectedConversation || message.isDeleted) {
      return '';
    }

    const otherParticipants = (this.selectedConversation.participantIds || []).filter(
      (id) => id !== this.currentUser?.id,
    );

    if (otherParticipants.length === 0) return 'Sent';

    const seenByAll = otherParticipants.every((id) => message.seenBy?.includes(id));
    if (seenByAll) return 'Seen';

    const deliveredToAll = otherParticipants.every((id) => message.deliveredTo?.includes(id));
    if (deliveredToAll) return 'Delivered';

    return 'Sent';
  }

  getMessageStatusText(message: ChatMessage): string {
    const receipt = this.getMessageReceiptLabel(message);
    const time = this.formatMessageTime(message.createdAt);

    if (!receipt) return time;
    if (!time) return receipt;

    return `${time} · ${receipt}`;
  }

  shouldShowDateDivider(index: number): boolean {
    const currentMessage = this.messages[index];
    const previousMessage = this.messages[index - 1];

    if (!currentMessage) return false;
    if (!previousMessage) return true;

    return this.toDateKey(currentMessage.createdAt) !== this.toDateKey(previousMessage.createdAt);
  }

  getMessageDateLabel(value?: string): string {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (this.toDateKey(value) === this.toDateKey(today.toISOString())) {
      return 'Today';
    }

    if (this.toDateKey(value) === this.toDateKey(yesterday.toISOString())) {
      return 'Yesterday';
    }

    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
    };

    if (date.getFullYear() !== today.getFullYear()) {
      options.year = 'numeric';
    }

    return date.toLocaleDateString([], options);
  }

  formatConversationTime(value?: string): string {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const key = this.toDateKey(value);

    if (key === this.toDateKey(today.toISOString())) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    if (key === this.toDateKey(yesterday.toISOString())) {
      return 'Yesterday';
    }

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
  }

  formatMessageTime(value?: string): string {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getRoleLabel(role?: string): string {
    if (role === 'teacher') return 'Faculty';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';
    if (role === 'admin') return 'Admin';
    return role || 'User';
  }

  insertEmoji(emoji: string): void {
    this.messageText = `${this.messageText}${emoji}`;
    setTimeout(() => this.composerTextarea?.nativeElement.focus(), 0);
  }

  toggleEmojiPanel(): void {
    this.showEmojiPanel = !this.showEmojiPanel;
  }

  closeEmojiPanel(): void {
    this.showEmojiPanel = false;
  }

  backToConversations(): void {
    this.isChatOpenOnMobile = false;
  }

  trackByConversationId(index: number, conversation: Conversation): string {
    return conversation.id || `${conversation.createdAt}-${index}`;
  }

  trackByMessageId(index: number, message: ChatMessage): string {
    return message.id || `${message.createdAt}-${index}`;
  }

  trackByUserId(index: number, user: ChatUser): string {
    return user.id || `${user.fullName}-${index}`;
  }

  private canChatWith(user: ChatUser): boolean {
    if (!this.currentUser) return false;

    const currentRole = this.currentUser.role;
    const targetRole = user.role;

    if (currentRole === 'teacher') {
      return targetRole === 'student' || targetRole === 'teacher';
    }

    if (currentRole === 'student') {
      if (targetRole === 'teacher') return true;

      if (targetRole === 'student') {
        const currentSection = String(
          this.currentUser.sectionCode || this.currentUser.section || '',
        ).toLowerCase();

        const targetSection = String(user.sectionCode || user.section || '').toLowerCase();

        if (!currentSection || !targetSection) {
          return true;
        }

        return currentSection === targetSection;
      }
    }

    return false;
  }

  private resetNewChatPanel(): void {
    this.showNewChatPanel = false;
    this.chatMode = 'private';
    this.selectedRecipientIds = [];
    this.contactSearchTerm = '';
    this.groupName = '';
  }

  private scrollToBottom(): void {
    const element = this.messageScroll?.nativeElement;

    if (!element) return;

    element.scrollTop = element.scrollHeight;
  }

  private resetComposerHeight(): void {
    const textarea = this.composerTextarea?.nativeElement;

    if (!textarea) return;

    textarea.style.height = 'auto';
  }

  private getInitials(value: string): string {
    const words = value.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) return 'U';
    if (words.length === 1) return words[0].charAt(0).toUpperCase();

    return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
  }

  private toDateKey(value?: string): string {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private showToast(message: string): void {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: message,
      showConfirmButton: false,
      timer: 1800,
      timerProgressBar: true,
      customClass: {
        popup: 'sams-swal-toast',
        title: 'sams-swal-toast-title',
      },
    });
  }

  private showError(message: string): void {
    Swal.fire({
      icon: 'error',
      title: 'Messages Error',
      text: message,
      confirmButtonText: 'OK',
      customClass: {
        popup: 'sams-swal-popup',
        title: 'sams-swal-title',
        htmlContainer: 'sams-swal-text',
        confirmButton: 'sams-swal-confirm',
      },
      buttonsStyling: false,
    });
  }
}
