/**
 * InputBar Component
 * Text input with send button for chat messages.
 * 
 * Requirements 1.2, 1.3, 1.4, 1.5
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, Mic } from 'lucide-react';
import { api } from '@/services/api';
import { getVoiceButtonUiState, hasAudioCaptureSupport, toBase64Payload } from './chat-capture-helpers';

interface InputBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [message, setMessage] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Maintain focus after send
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      setVoiceError(null);
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const releaseStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      releaseStream();
    };
  }, []);

  const readBlobAsDataUrl = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read voice capture.'));
      reader.onloadend = () => {
        const value = reader.result;
        if (typeof value !== 'string') {
          reject(new Error('Invalid voice capture data.'));
          return;
        }
        resolve(value);
      };
      reader.readAsDataURL(blob);
    });
  };

  const handleVoiceStop = async (mimeType: string) => {
    try {
      setIsTranscribing(true);
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      chunksRef.current = [];
      const dataUrl = await readBlobAsDataUrl(blob);
      const response = await api.capture.transcribe({
        audioBase64: toBase64Payload(dataUrl),
        mimeType: mimeType || 'audio/webm'
      });
      const transcript = response.text.trim();
      if (!transcript) {
        throw new Error('Transcription was empty.');
      }
      setVoiceError(null);
      onSend(transcript);
      setMessage('');
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Voice capture failed.');
    } finally {
      setIsTranscribing(false);
      setIsRecording(false);
      releaseStream();
    }
  };

  const startVoiceCapture = async () => {
    if (disabled || isRecording || isTranscribing) return;
    if (!hasAudioCaptureSupport(globalThis as unknown as { navigator?: { mediaDevices?: { getUserMedia?: unknown } }; MediaRecorder?: unknown })) {
      setVoiceError('Voice capture is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });

      chunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void handleVoiceStop(recorder.mimeType || 'audio/webm');
      };

      recorderRef.current = recorder;
      streamRef.current = stream;
      setVoiceError(null);
      setIsRecording(true);
      recorder.start();
    } catch (err) {
      releaseStream();
      setIsRecording(false);
      setVoiceError(err instanceof Error ? err.message : 'Microphone access failed.');
    }
  };

  const stopVoiceCapture = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }
    recorder.stop();
  };

  const voiceButtonUi = getVoiceButtonUiState({ isRecording, isTranscribing });

  return (
    <div className="flex-shrink-0 border-t p-2.5 sm:p-3">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a thought, idea, or task..."
          disabled={disabled}
          className="flex-1 min-w-0"
        />
        <Button
          onClick={handleSend}
          disabled={disabled || isTranscribing || !message.trim()}
          size="icon"
          className="shrink-0"
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={disabled || isTranscribing}
          className={voiceButtonUi.className}
          aria-label={voiceButtonUi.label}
          title={voiceButtonUi.label}
          aria-pressed={isRecording}
          onPointerDown={(e) => {
            e.preventDefault();
            void startVoiceCapture();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            stopVoiceCapture();
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            stopVoiceCapture();
          }}
          onPointerLeave={(e) => {
            e.preventDefault();
            stopVoiceCapture();
          }}
        >
          {isTranscribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      </div>
      {voiceError && (
        <p className="text-[11px] sm:text-xs text-destructive mt-2 leading-tight">{voiceError}</p>
      )}
      <p className="text-[11px] sm:text-xs text-muted-foreground mt-2 leading-tight">
        Tip: Use [project], [person], [idea], or [task] to hint the category
      </p>
    </div>
  );
}
