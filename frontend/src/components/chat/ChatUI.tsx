/**
 * ChatUI Component
 * Main container for the chat interface.
 * 
 * Requirements 1.1, 2.1
 */

import { useState, useEffect, useCallback } from 'react';
import { api, ChatMessage, ChatResponse } from '@/services/api';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEntries } from '@/state/entries';
import { buildTaskCaptureAction } from './chat-capture-helpers';
import { PushToggle } from './PushToggle';

interface ChatUIProps {
  onEntryClick: (path: string) => void;
  onStartFocus?: (entryPath: string, durationMinutes: number) => Promise<void>;
  className?: string;
}

export function ChatUI({ onEntryClick, onStartFocus, className }: ChatUIProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingConversation, setIsResettingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useEntries();

  // Load existing conversation on mount
  useEffect(() => {
    loadRecentConversation();
  }, []);

  const loadRecentConversation = async () => {
    try {
      const conversations = await api.chat.listConversations(1);
      if (conversations.length > 0) {
        const recentConv = conversations[0];
        setConversationId(recentConv.id);
        const msgs = await api.chat.getMessages(recentConv.id);
        setMessages(msgs);
      }
    } catch (err) {
      // No existing conversation, that's fine
      console.log('No existing conversation found');
    }
  };

  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setIsLoading(true);
    setError(null);

    // Add user message optimistically
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response: ChatResponse = await api.chat.send(text, conversationId || undefined);
      const assistantMessage: ChatMessage = {
        ...response.message,
        captureAction: buildTaskCaptureAction(response.entry)
      };
      
      // Update conversation ID if this is a new conversation
      if (!conversationId) {
        setConversationId(response.conversationId);
      }

      // Replace temp user message and add assistant response
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== userMessage.id);
        return [
          ...withoutTemp,
          { ...userMessage, id: `user-${Date.now()}` },
          assistantMessage,
        ];
      });
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove the optimistic user message on error
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, refresh]);

  const handleNewConversation = useCallback(async () => {
    if (isLoading || isResettingConversation) return;

    setIsResettingConversation(true);
    setError(null);
    setMessages([]);
    try {
      const conversation = await api.chat.createConversation();
      setConversationId(conversation.id);
    } catch (err) {
      setConversationId(null);
      setError(err instanceof Error ? err.message : 'Failed to create new conversation');
    } finally {
      setIsResettingConversation(false);
    }
  }, [isLoading, isResettingConversation]);

  const handleCaptureAction = useCallback(async (action: NonNullable<ChatMessage['captureAction']>) => {
    if (!onStartFocus) return;
    try {
      setError(null);
      await onStartFocus(action.entryPath, action.durationMinutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start focus session');
    }
  }, [onStartFocus]);

  return (
    <div className={cn('flex flex-col h-full min-h-0 bg-background', className)}>
      <div className="flex-shrink-0 border-b p-2.5 sm:p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <h3 className="text-base sm:text-lg font-semibold">Chat</h3>
          </div>
          <div className="flex items-center">
            <PushToggle />
            <button
              onClick={handleNewConversation}
              disabled={isLoading || isResettingConversation}
              className="min-h-[44px] px-2 text-sm text-muted-foreground hover:text-foreground flex items-center"
            >
              New conversation
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col p-0 overflow-hidden">
        <MessageList 
          messages={messages} 
          onEntryClick={onEntryClick}
          onQuickReply={handleSendMessage}
          onCaptureAction={handleCaptureAction}
          isLoading={isLoading}
        />
        {error && (
          <div className="px-4 py-2 text-sm text-destructive bg-destructive/10">
            {error}
          </div>
        )}
        <InputBar 
          onSend={handleSendMessage} 
          disabled={isLoading || isResettingConversation} 
        />
      </div>
    </div>
  );
}
