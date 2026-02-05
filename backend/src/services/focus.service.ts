import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { getPrismaClient } from '../lib/prisma';
import { EntryService, getEntryService } from './entry.service';
import { getConfig } from '../config/env';

export interface FocusTrackCandidate {
  id: string;
  youtubeId: string;
  rating: number;
  lastPlayedAt: Date | null;
}

export function chooseTrackCandidate(
  tracks: FocusTrackCandidate[],
  options?: {
    excludeYoutubeId?: string;
    random?: () => number;
  }
): FocusTrackCandidate | null {
  const random = options?.random ?? Math.random;
  const excludeYoutubeId = options?.excludeYoutubeId;
  const eligible = tracks.filter((track) => track.rating >= 0 && track.youtubeId !== excludeYoutubeId);
  if (eligible.length === 0) {
    return null;
  }

  const liked = eligible.filter((track) => track.rating > 0);
  const neutral = eligible.filter((track) => track.rating === 0);

  const sortByLastPlayed = (a: FocusTrackCandidate, b: FocusTrackCandidate) => {
    const aTime = a.lastPlayedAt ? a.lastPlayedAt.getTime() : 0;
    const bTime = b.lastPlayedAt ? b.lastPlayedAt.getTime() : 0;
    return aTime - bTime;
  };

  if (liked.length > 0 && (neutral.length === 0 || random() < 0.7)) {
    return [...liked].sort(sortByLastPlayed)[0];
  }

  if (neutral.length > 0) {
    return [...neutral].sort(sortByLastPlayed)[0];
  }

  return [...liked].sort(sortByLastPlayed)[0] ?? null;
}

type Fetcher = (input: string) => Promise<{
  ok: boolean;
  json: () => Promise<any>;
  text: () => Promise<string>;
}>;

interface YouTubeResult {
  youtubeId: string;
  title: string;
  channelTitle: string;
}

export class FocusService {
  private prisma: PrismaClient;
  private entryService: EntryService;
  private config = getConfig();
  private fetcher: Fetcher;
  private random: () => number;
  private openai: OpenAI | null = null;

  constructor(
    prisma?: PrismaClient,
    entryService?: EntryService,
    fetcher: Fetcher = ((input: string) => (globalThis as any).fetch(input)) as Fetcher,
    random: () => number = Math.random
  ) {
    this.prisma = prisma || getPrismaClient();
    this.entryService = entryService || getEntryService();
    this.fetcher = fetcher;
    this.random = random;
  }

  async generateCongratsMessage(payload: {
    entryPath?: string;
    entryName?: string;
    minutes?: number;
  }): Promise<string> {
    const fallbackMessages = [
      'Nice work finishing that. Momentum beats perfection—keep rolling.',
      'That’s a real win. You just cleared an open loop—use that energy.',
      'Well done. You showed up and finished; that’s how progress compounds.',
      'Great job closing it out. One less thing weighing on your mind.',
      'You did the hard part: you started and finished. Keep it going.'
    ];

    const fallback = fallbackMessages[Math.floor(this.random() * fallbackMessages.length)];
    let resolvedName = payload.entryName;
    if (!resolvedName && payload.entryPath) {
      const entry = await this.entryService.read(payload.entryPath);
      const entryData = entry.entry as any;
      resolvedName = entryData.name || entryData.suggested_name;
    }
    const minutes = payload.minutes;

    if (!this.config.OPENAI_API_KEY) {
      return fallback;
    }

    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: this.config.OPENAI_API_KEY });
    }

    try {
      const prompt = [
        `Task: ${resolvedName ?? 'an admin task'}`,
        minutes ? `Focus minutes: ${minutes}` : '',
        'Tone: short, motivating, practical. User struggles with procrastination.',
        'Return 1-2 sentences. Avoid fluff or emojis.'
      ]
        .filter(Boolean)
        .join('\n');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a concise, encouraging focus coach.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 80
      });

      const message = response.choices?.[0]?.message?.content?.trim();
      return message || fallback;
    } catch {
      return fallback;
    }
  }

  async getNextTrack(options?: { mode?: 'auto' | 'new'; excludeYoutubeId?: string }) {
    const mode = options?.mode ?? 'auto';
    if (mode === 'auto') {
      const existing = await this.prisma.focusTrack.findMany({
        orderBy: [{ lastPlayedAt: 'asc' }]
      });

      const candidate = chooseTrackCandidate(existing, {
        excludeYoutubeId: options?.excludeYoutubeId,
        random: this.random
      });

      if (candidate) {
        return this.markPlayed(candidate.id);
      }
    }

    const discovered = await this.discoverTrack(options?.excludeYoutubeId);
    if (discovered) {
      return this.markPlayed(discovered.id);
    }

    const fallback = await this.prisma.focusTrack.findMany({
      orderBy: [{ lastPlayedAt: 'asc' }]
    });
    const candidate = chooseTrackCandidate(fallback, {
      excludeYoutubeId: options?.excludeYoutubeId,
      random: this.random
    });
    if (!candidate) {
      if (!this.config.YOUTUBE_API_KEY) {
        throw new Error('Focus music unavailable. Set YOUTUBE_API_KEY to enable YouTube discovery.');
      }
      throw new Error('No focus tracks available yet.');
    }
    return this.markPlayed(candidate.id);
  }

  async rateTrack(youtubeId: string, rating: number) {
    if (![1, 0, -1].includes(rating)) {
      throw new Error('Rating must be -1, 0, or 1');
    }
    const existing = await this.prisma.focusTrack.findUnique({ where: { youtubeId } });
    if (!existing) {
      throw new Error('Track not found');
    }

    const updates: Record<string, any> = { rating };
    if (existing.rating !== rating) {
      if (rating === 1) {
        updates.likesCount = { increment: 1 };
      }
      if (rating === -1) {
        updates.dislikesCount = { increment: 1 };
      }
    }

    return this.prisma.focusTrack.update({
      where: { youtubeId },
      data: updates
    });
  }

  async recordSession(payload: {
    entryPath: string;
    durationSeconds: number;
    startedAt: string;
    endedAt: string;
    trackYoutubeId?: string;
    notes?: string;
  }) {
    const { entryPath, durationSeconds, startedAt, endedAt, trackYoutubeId, notes } = payload;
    const entry = await this.entryService.read(entryPath);
    const entryName = (entry.entry as any)?.name ?? null;
    const entryId = (entry.entry as any)?.id ?? null;

    const track = trackYoutubeId
      ? await this.prisma.focusTrack.findUnique({ where: { youtubeId: trackYoutubeId } })
      : null;

    const session = await this.prisma.focusSession.create({
      data: {
        entryPath,
        entryId,
        entryName,
        durationSeconds,
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        notes: notes || null,
        trackId: track?.id ?? null
      }
    });

    const minutes = Math.round(durationSeconds / 60);
    const logLine = notes
      ? `Deep focus session (${minutes} min): ${notes}`
      : `Deep focus session (${minutes} min)`;

    await this.entryService.update(
      entryPath,
      {} as any,
      'api',
      { mode: 'section', section: 'Log', content: logLine }
    );

    const existingMinutes = Number((entry.entry as any)?.focus_minutes_total ?? 0);
    const focusMinutesTotal = existingMinutes + minutes;

    await this.entryService.update(
      entryPath,
      {
        focus_minutes_total: focusMinutesTotal,
        focus_last_session: new Date(endedAt).toISOString()
      } as any,
      'api',
      undefined
    );

    return session;
  }

  async logProgress(entryPath: string, note: string) {
    await this.entryService.update(
      entryPath,
      {} as any,
      'api',
      { mode: 'section', section: 'Log', content: `Progress: ${note}` }
    );
  }

  private async markPlayed(trackId: string) {
    return this.prisma.focusTrack.update({
      where: { id: trackId },
      data: {
        timesPlayed: { increment: 1 },
        lastPlayedAt: new Date()
      }
    });
  }

  private async discoverTrack(excludeYoutubeId?: string) {
    if (!this.config.YOUTUBE_API_KEY) {
      return null;
    }

    const terms = this.config.FOCUS_MUSIC_SEARCH_TERMS;
    if (terms.length === 0) {
      return null;
    }

    const term = terms[Math.floor(this.random() * terms.length)];
    const results = await this.searchYouTube(term);
    if (results.length === 0) {
      return null;
    }

    const existingIds = await this.prisma.focusTrack.findMany({
      where: { youtubeId: { in: results.map((item) => item.youtubeId) } },
      select: { youtubeId: true }
    });
    const existingSet = new Set(existingIds.map((item) => item.youtubeId));

    const candidate = results.find(
      (item) => !existingSet.has(item.youtubeId) && item.youtubeId !== excludeYoutubeId
    );

    if (!candidate) {
      return null;
    }

    return this.prisma.focusTrack.create({
      data: {
        youtubeId: candidate.youtubeId,
        title: candidate.title,
        channelTitle: candidate.channelTitle,
        searchTerm: term
      }
    });
  }

  private async searchYouTube(term: string): Promise<YouTubeResult[]> {
    const key = this.config.YOUTUBE_API_KEY;
    if (!key) {
      return [];
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', this.config.FOCUS_MUSIC_RESULTS_LIMIT.toString());
    url.searchParams.set('q', term);
    url.searchParams.set('key', key);

    const response = await this.fetcher(url.toString());
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`YouTube search failed: ${message}`);
    }

    const data = await response.json() as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }>;
    };

    const items = data.items || [];
    return items
      .map((item) => ({
        youtubeId: item.id?.videoId,
        title: item.snippet?.title,
        channelTitle: item.snippet?.channelTitle
      }))
      .filter((item): item is YouTubeResult => Boolean(item.youtubeId && item.title && item.channelTitle));
  }
}

let focusService: FocusService | null = null;

export function getFocusService(): FocusService {
  if (!focusService) {
    focusService = new FocusService();
  }
  return focusService;
}
