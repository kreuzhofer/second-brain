import OpenAI, { toFile } from 'openai';
import { getConfig } from '../config/env';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const DEFAULT_MODEL = 'whisper-1';
const DEFAULT_MIME_TYPE = 'audio/webm';
const SUPPORTED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg'
]);

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg'
};

export class TranscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionValidationError';
  }
}

export class TranscriptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionUnavailableError';
  }
}

export class TranscriptionService {
  private config = getConfig();
  private openai: OpenAI | null = null;

  async transcribeBase64Audio(audioBase64: string, mimeType?: string): Promise<string> {
    const payload = audioBase64?.trim();
    if (!payload) {
      throw new TranscriptionValidationError('Audio payload is required.');
    }

    const normalizedMimeType = (mimeType || DEFAULT_MIME_TYPE)
      .toLowerCase()
      .split(';', 1)[0]
      .trim();
    if (!SUPPORTED_MIME_TYPES.has(normalizedMimeType)) {
      throw new TranscriptionValidationError(`Unsupported audio mime type: ${normalizedMimeType}`);
    }

    if (!/^[A-Za-z0-9+/=\s]+$/.test(payload)) {
      throw new TranscriptionValidationError('Audio payload must be base64 encoded.');
    }

    const audioBuffer = Buffer.from(payload, 'base64');
    if (audioBuffer.length === 0) {
      throw new TranscriptionValidationError('Audio payload is empty.');
    }
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      throw new TranscriptionValidationError('Audio payload exceeds 10MB limit.');
    }

    if (!this.config.OPENAI_API_KEY) {
      throw new TranscriptionUnavailableError('Voice transcription is unavailable: OPENAI_API_KEY is not configured.');
    }

    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: this.config.OPENAI_API_KEY });
    }

    const extension = EXT_BY_MIME[normalizedMimeType] ?? 'webm';
    const file = await toFile(audioBuffer, `voice-capture.${extension}`, { type: normalizedMimeType });
    const response = await this.openai.audio.transcriptions.create({
      model: DEFAULT_MODEL,
      file
    });
    const text = response.text?.trim();
    if (!text) {
      throw new Error('Transcription returned empty text.');
    }
    return text;
  }
}

let instance: TranscriptionService | null = null;

export function getTranscriptionService(): TranscriptionService {
  if (!instance) {
    instance = new TranscriptionService();
  }
  return instance;
}

export function resetTranscriptionService(): void {
  instance = null;
}
