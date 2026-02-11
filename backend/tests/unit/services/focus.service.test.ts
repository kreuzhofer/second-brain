import { chooseTrackCandidate, FocusService, FocusTrackCandidate } from '../../../src/services/focus.service';

const base = (overrides: Partial<FocusTrackCandidate>): FocusTrackCandidate => ({
  id: overrides.id || 'id',
  youtubeId: overrides.youtubeId || 'yt',
  rating: overrides.rating ?? 0,
  lastPlayedAt: overrides.lastPlayedAt ?? null
});

describe('chooseTrackCandidate', () => {
  it('prefers liked tracks when available', () => {
    const tracks = [
      base({ id: 'a', youtubeId: 'a', rating: 0 }),
      base({ id: 'b', youtubeId: 'b', rating: 1 })
    ];
    const pick = chooseTrackCandidate(tracks, { random: () => 0.1 });
    expect(pick?.youtubeId).toBe('b');
  });

  it('falls back to neutral when liked not chosen', () => {
    const tracks = [
      base({ id: 'a', youtubeId: 'a', rating: 0 }),
      base({ id: 'b', youtubeId: 'b', rating: 1 })
    ];
    const pick = chooseTrackCandidate(tracks, { random: () => 0.9 });
    expect(pick?.youtubeId).toBe('a');
  });

  it('skips disliked and excluded tracks', () => {
    const tracks = [
      base({ id: 'a', youtubeId: 'a', rating: -1 }),
      base({ id: 'b', youtubeId: 'b', rating: 0 })
    ];
    const pick = chooseTrackCandidate(tracks, { excludeYoutubeId: 'b' });
    expect(pick).toBeNull();
  });
});

describe('FocusService.generateCongratsMessage', () => {
  it('returns a completion-focused fallback when OpenAI key is missing', async () => {
    const service = new FocusService({} as any, { read: jest.fn() } as any, undefined as any, () => 0);
    (service as any).config.OPENAI_API_KEY = '';

    const message = await service.generateCongratsMessage({ entryName: 'Ship release notes' });

    expect(message).toBe('Well done, that is complete. Carry the momentum into one small first step on what is next.');
    expect(message.toLowerCase()).not.toContain('you\'ve got this');
  });

  it('instructs the model to acknowledge completion and avoid unfinished-task framing', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Nice close. Tiny next step: write the first line for the next task.' } }]
    });
    const service = new FocusService({} as any, { read: jest.fn() } as any, undefined as any, () => 0);
    (service as any).config.OPENAI_API_KEY = 'test-key';
    (service as any).openai = {
      chat: {
        completions: {
          create
        }
      }
    };

    const message = await service.generateCongratsMessage({ entryName: 'Ship release notes', minutes: 25 });

    expect(message).toBe('Nice close. Tiny next step: write the first line for the next task.');
    expect(create).toHaveBeenCalledTimes(1);
    const userPrompt = create.mock.calls[0][0].messages.find((msg: any) => msg.role === 'user')?.content as string;
    expect(userPrompt).toContain('Acknowledge the task is already complete.');
    expect(userPrompt).toContain('Offer only a tiny next-step suggestion for a different task.');
    expect(userPrompt).not.toContain('User struggles with procrastination.');
  });
});
