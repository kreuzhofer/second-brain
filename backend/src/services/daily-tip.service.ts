/**
 * Daily Tip Service
 * Generates concise, non-repeating tips to help overcome procrastination.
 */

import OpenAI from 'openai';
import { getPrismaClient } from '../lib/prisma';
import { getConfig } from '../config/env';

export interface DailyTipState {
  order: number[];
  cursor: number;
  lastTip?: string;
  updatedAt?: string;
}

const DEFAULT_ID = 'default';
const FALLBACK_TIP = 'Pick the smallest next action and do it for two minutes to start momentum.';

export class DailyTipService {
  private prisma = getPrismaClient();
  private openai: OpenAI | null = null;
  private random: () => number;

  constructor(random: () => number = Math.random, openaiClient?: OpenAI) {
    this.random = random;
    if (openaiClient) {
      this.openai = openaiClient;
    }
  }

  async getNextTip(): Promise<string> {
    const state = await this.loadState();
    const tip = await this.generateTip(state.lastTip);

    await this.saveState({
      order: Array.isArray(state.order) ? state.order : [],
      cursor: Number.isFinite(state.cursor) ? state.cursor : 0,
      lastTip: tip,
      updatedAt: new Date().toISOString()
    });

    return tip;
  }

  private async generateTip(lastTip?: string): Promise<string> {
    const config = getConfig();
    if (!this.openai && !config.OPENAI_API_KEY) {
      return FALLBACK_TIP;
    }

    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }

    const attempts = 3;
    const basePrompt = [
      'You are a concise, practical coach helping a heavy procrastinator.',
      'Return exactly one tip in 1-2 sentences, max 25 words.',
      'Make it immediately actionable and motivating, no fluff, no emojis.',
      lastTip ? `Previous tip (avoid repeating or paraphrasing): ${lastTip}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You create short, high-impact action tips.' },
            { role: 'user', content: basePrompt }
          ],
          temperature: 0.9,
          max_tokens: 80
        });

        const content = response.choices?.[0]?.message?.content?.trim() ?? '';
        const tip = content.replace(/\s+/g, ' ').trim();
        if (!tip) continue;
        if (lastTip && tip.toLowerCase() === lastTip.toLowerCase()) {
          continue;
        }
        return tip;
      } catch {
        // try again
      }
    }

    return FALLBACK_TIP;
  }

  private async loadState(): Promise<DailyTipState> {
    const record = await this.prisma.dailyTipState.findUnique({ where: { id: DEFAULT_ID } });
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
    await this.prisma.dailyTipState.upsert({
      where: { id: DEFAULT_ID },
      create: {
        id: DEFAULT_ID,
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
