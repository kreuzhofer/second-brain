import { chooseTrackCandidate, FocusTrackCandidate } from '../../../src/services/focus.service';

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
