/**
 * MessageList Component
 * Displays messages in chronological order with auto-scroll.
 * 
 * Requirements 2.1, 2.2, 2.3, 2.6
 */

import { useEffect, useRef } from 'react';
import { ChatMessage } from '@/services/api';
import { Message } from './Message';
import { Loader2 } from 'lucide-react';

interface MessageListProps {
  messages: ChatMessage[];
  onEntryClick: (path: string) => void;
  onQuickReply?: (message: string) => void;
  isLoading?: boolean;
}

export function MessageList({ messages, onEntryClick, onQuickReply, isLoading }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">Start a conversation</p>
          <p className="text-sm mt-1">
            Type a thought, idea, or task and I'll help you organize it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <Message 
          key={message.id} 
          message={message} 
          onEntryClick={onEntryClick}
          onQuickReply={onQuickReply}
          disableQuickReplies={Boolean(isLoading)}
        />
      ))}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Thinking...</span>
        </div>
      )}
    </div>
  );
}
