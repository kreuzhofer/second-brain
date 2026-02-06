/**
 * Daily Tip Service
 * Generates concise, non-repeating tips to help overcome procrastination.
 */

import OpenAI from 'openai';
import { getPrismaClient } from '../lib/prisma';
import { getConfig } from '../config/env';
import { requireUserId } from '../context/user-context';

export interface DailyTipState {
  order: number[];
  cursor: number;
  lastTip?: string;
  updatedAt?: string;
}

export type MomentumTipKind = 'daily' | 'weekly';

export type MomentumTipSource = 'ai' | 'fallback';

export interface MomentumTipResult {
  tip: string;
  source: MomentumTipSource;
  kind: MomentumTipKind;
}

const FALLBACK_TIP = 'Pick the smallest next action and do it for two minutes to start momentum.';

const DAILY_FALLBACK_TIPS = [
  'Pick the smallest next action and do it for two minutes to start momentum.',
  'Set a 10-minute timer and start the easiest task. Stop when it rings, then decide if you want another 10.',
  'Open your task list, choose one item, and write the very first step. Do that step now.',
  'Remove one tiny friction (close a tab, clear the desk), then begin the task for five minutes.',
  'Start with an ugly draft for five minutes. Progress over perfection builds momentum.'
];

const WEEKLY_FALLBACK_TIPS = [
  'Pick one outcome for the upcoming week, block the first 30-minute session, and choose a small reward when you finish it.',
  'Choose a weekly focus, decide the first step you will do on Monday, and pre-select a reward for completing it.',
  'Set a simple weekly target, schedule two work blocks, and promise yourself a concrete treat when you deliver.',
  'Plan a momentum ritual for the upcoming week (daily 10-minute start) and a celebration if you keep it three days.',
  'Identify one key task for the week and a reward you will give yourself when it is done. Put both on your calendar.'
];

export class DailyTipService {
  private prisma = getPrismaClient();
  private openai: OpenAI | null = null;
  private random: () => number;
  private model: string;

  constructor(random: () => number = Math.random, openaiClient?: OpenAI) {
    this.random = random;
    this.model = getConfig().OPENAI_MODEL_DAILY_TIP || 'gpt-4o-mini';
    if (openaiClient) {
      this.openai = openaiClient;
    }
  }

  async getNextTip(kind: MomentumTipKind = 'daily'): Promise<MomentumTipResult> {
    const state = await this.loadState();
    const lastTipState = this.parseLastTipState(state.lastTip);
    const lastTipForKind = kind === 'weekly' ? lastTipState.weekly : lastTipState.daily;
    const result = await this.generateTip(kind, lastTipForKind);
    const updatedTips = {
      daily: lastTipState.daily,
      weekly: lastTipState.weekly
    };
    if (kind === 'weekly') {
      updatedTips.weekly = result.tip;
    } else {
      updatedTips.daily = result.tip;
    }
    const serializedLastTip = this.serializeLastTipState(updatedTips, kind === 'weekly' || lastTipState.isJson);

    await this.saveState({
      order: Array.isArray(state.order) ? state.order : [],
      cursor: Number.isFinite(state.cursor) ? state.cursor : 0,
      lastTip: serializedLastTip,
      updatedAt: new Date().toISOString()
    });

    return {
      tip: result.tip,
      source: result.source,
      kind
    };
  }

  private async generateTip(
    kind: MomentumTipKind,
    lastTip?: string
  ): Promise<{ tip: string; source: MomentumTipSource }> {
    const config = getConfig();
    if (!this.openai && !config.OPENAI_API_KEY) {
      const fallback = this.getFallbackTip(kind, lastTip);
      console.warn(`DailyTipService: Missing OpenAI key, using fallback ${kind} tip.`);
      return { tip: fallback, source: 'fallback' };
    }

    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }

    const attempts = 3;
    const { prompt, maxWords } = this.buildPrompt(kind, lastTip);
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: 'You create short, high-impact action tips.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.9,
          max_tokens: 80
        });

        const content = response.choices?.[0]?.message?.content?.trim() ?? '';
        const tip = this.normalizeTip(content);
        if (!tip) continue;
        if (lastTip && tip.toLowerCase() === lastTip.toLowerCase()) {
          continue;
        }
        if (this.countWords(tip) > maxWords) {
          continue;
        }
        return { tip, source: 'ai' };
      } catch (error) {
        lastError = error;
      }
    }

    const fallback = this.getFallbackTip(kind, lastTip);
    console.warn(`DailyTipService: Failed to generate ${kind} tip, using fallback.`, lastError);
    return { tip: fallback, source: 'fallback' };
  }

  private buildPrompt(kind: MomentumTipKind, lastTip?: string): { prompt: string; maxWords: number } {
    if (kind === 'weekly') {
      const basePrompt = [
        'You are a concise, practical coach helping someone build momentum for the upcoming week.',
        'Return exactly one tip in 1-2 sentences, max 30 words.',
        'Include a concrete reward or celebration for progress.',
        'Make it immediately actionable and motivating, no fluff, no emojis.',
        lastTip ? `Previous tip (avoid repeating or paraphrasing): ${lastTip}` : ''
      ]
        .filter(Boolean)
        .join('\n');

      return { prompt: basePrompt, maxWords: 30 };
    }

    const basePrompt = [
      'You are a concise, practical coach helping a heavy procrastinator build momentum today.',
      'Return exactly one tip in 1-2 sentences, max 25 words.',
      'Make it immediately actionable and motivating, no fluff, no emojis.',
      lastTip ? `Previous tip (avoid repeating or paraphrasing): ${lastTip}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    return { prompt: basePrompt, maxWords: 25 };
  }

  private normalizeTip(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  private getFallbackTip(kind: MomentumTipKind, lastTip?: string): string {
    const tips = kind === 'weekly' ? WEEKLY_FALLBACK_TIPS : DAILY_FALLBACK_TIPS;
    if (tips.length === 0) {
      return FALLBACK_TIP;
    }
    const last = lastTip?.toLowerCase().trim();
    const candidates = last ? tips.filter(tip => tip.toLowerCase().trim() !== last) : tips;
    const pool = candidates.length > 0 ? candidates : tips;
    const index = Math.floor(this.random() * pool.length);
    return pool[Math.min(Math.max(index, 0), pool.length - 1)];
  }

  private parseLastTipState(lastTip?: string): { daily?: string; weekly?: string; isJson: boolean } {
    if (!lastTip) {
      return { isJson: false };
    }
    const trimmed = lastTip.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as { daily?: unknown; weekly?: unknown };
        const daily = typeof parsed.daily === 'string' ? parsed.daily : undefined;
        const weekly = typeof parsed.weekly === 'string' ? parsed.weekly : undefined;
        if (daily || weekly) {
          return { daily, weekly, isJson: true };
        }
      } catch {
        // fall through to legacy handling
      }
    }

    return { daily: lastTip, isJson: false };
  }

  private serializeLastTipState(
    tips: { daily?: string; weekly?: string },
    forceJson: boolean
  ): string | undefined {
    if (!tips.daily && !tips.weekly) {
      return undefined;
    }
    if (!forceJson && tips.daily && !tips.weekly) {
      return tips.daily;
    }
    return JSON.stringify({
      daily: tips.daily ?? null,
      weekly: tips.weekly ?? null
    });
  }

  private async loadState(): Promise<DailyTipState> {
    const userId = requireUserId();
    const record = await this.prisma.dailyTipState.findUnique({ where: { userId } });
    if (!record) {
      return { order: [], cursor: 0 };
    }

    return {
      order: Array.isArray(record.order) ? record.order : [],
      cursor: typeof record.cursor === 'number' ? record.cursor : 0,
      lastTip: record.lastTip || undefined,
      updatedAt: record.updatedAt ? record.updatedAt.toISOString() : undefined
    };
  }

  private async saveState(state: DailyTipState): Promise<void> {
    const userId = requireUserId();
    await this.prisma.dailyTipState.upsert({
      where: { userId },
      create: {
        userId,
        order: state.order,
        cursor: state.cursor,
        lastTip: state.lastTip ?? null,
        updatedAt: state.updatedAt ? new Date(state.updatedAt) : null
      },
      update: {
        order: state.order,
        cursor: state.cursor,
        lastTip: state.lastTip ?? null,
        updatedAt: state.updatedAt ? new Date(state.updatedAt) : null
      }
    });
  }
}

let dailyTipServiceInstance: DailyTipService | null = null;

export function getDailyTipService(): DailyTipService {
  if (!dailyTipServiceInstance) {
    dailyTipServiceInstance = new DailyTipService();
  }
  return dailyTipServiceInstance;
}

export function resetDailyTipService(): void {
  dailyTipServiceInstance = null;
}
