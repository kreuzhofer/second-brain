import {
  TranscriptionService,
  TranscriptionUnavailableError,
  TranscriptionValidationError
} from '../../../src/services/transcription.service';

describe('TranscriptionService', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = '';
  });

  afterAll(() => {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
      return;
    }
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it('accepts supported mime types with codec parameters', async () => {
    const service = new TranscriptionService();

    await expect(
      service.transcribeBase64Audio('aGVsbG8=', 'audio/webm;codecs=opus')
    ).rejects.toBeInstanceOf(TranscriptionUnavailableError);
  });

  it('rejects unsupported mime types', async () => {
    const service = new TranscriptionService();

    await expect(
      service.transcribeBase64Audio('aGVsbG8=', 'audio/flac')
    ).rejects.toBeInstanceOf(TranscriptionValidationError);
  });
});
