/**
 * Message Component
 * Displays a single message with entry links and confidence scores.
 * 
 * Requirements 2.4, 2.5, 5.1, 5.2, 5.3
 */

import { ChatMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import { FileText, User, Bot } from 'lucide-react';

interface MessageProps {
  message: ChatMessage;
  onEntryClick: (path: string) => void;
}

export function Message({ message, onEntryClick }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'flex flex-col max-w-[80%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-4 py-2',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Entry link and confidence */}
        {message.filedEntryPath && (
          <button
            onClick={() => onEntryClick(message.filedEntryPath!)}
            className={cn(
              'flex items-center gap-1 mt-1 text-xs hover:underline',
              isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            <FileText className="h-3 w-3" />
            <span>{message.filedEntryPath}</span>
            {message.filedConfidence !== undefined && (
              <span className="opacity-70">
                ({Math.round(message.filedConfidence * 100)}%)
              </span>
            )}
          </button>
        )}

        {/* Timestamp */}
        <span
          className={cn(
            'text-xs mt-1',
            isUser ? 'text-primary-foreground/50' : 'text-muted-foreground/50'
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
