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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEntries } from '@/state/entries';

interface ChatUIProps {
  onEntryClick: (path: string) => void;
  className?: string;
}

export function ChatUI({ onEntryClick, className }: ChatUIProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
          response.message,
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

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  return (
    <Card className={cn('flex flex-col h-full min-h-[360px] sm:min-h-[520px]', className)}>
      <CardHeader className="flex-shrink-0 border-b p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle className="text-base sm:text-lg">Chat</CardTitle>
          </div>
          <button
            onClick={handleNewConversation}
            className="min-h-[44px] px-2 text-sm text-muted-foreground hover:text-foreground flex items-center"
          >
            New conversation
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <MessageList 
          messages={messages} 
          onEntryClick={onEntryClick}
          onQuickReply={handleSendMessage}
          isLoading={isLoading}
        />
        {error && (
          <div className="px-4 py-2 text-sm text-destructive bg-destructive/10">
            {error}
          </div>
        )}
        <InputBar 
          onSend={handleSendMessage} 
          disabled={isLoading} 
        />
      </CardContent>
    </Card>
  );
}
