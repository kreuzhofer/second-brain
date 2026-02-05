/**
 * Digest Preferences Service
 * Stores and retrieves user preferences for digests.
 */

import { Category } from '../types/entry.types';
import { getPrismaClient } from '../lib/prisma';

export interface DigestPreferences {
  focusCategories?: Category[];
  maxItems?: number;
  maxOpenLoops?: number;
  maxSuggestions?: number;
  maxWords?: number;
  includeStaleInbox?: boolean;
  includeSmallWins?: boolean;
  includeOpenLoops?: boolean;
  includeSuggestions?: boolean;
  includeTheme?: boolean;
}

const DEFAULT_PREFERENCES: DigestPreferences = {
  maxItems: 3,
  maxOpenLoops: 3,
  maxSuggestions: 3,
  includeStaleInbox: true,
  includeSmallWins: true,
  includeOpenLoops: true,
  includeSuggestions: true,
  includeTheme: true
};

const DEFAULT_ID = 'default';

export class DigestPreferencesService {
  private prisma = getPrismaClient();

  async getPreferences(): Promise<DigestPreferences> {
    const record = await this.prisma.digestPreference.findUnique({ where: { id: DEFAULT_ID } });
    if (!record) {
      return { ...DEFAULT_PREFERENCES };
    }

    return {
      ...DEFAULT_PREFERENCES,
      focusCategories: (record.focusCategories as Category[]) || undefined,
      maxItems: record.maxItems,
      maxOpenLoops: record.maxOpenLoops,
      maxSuggestions: record.maxSuggestions,
      maxWords: record.maxWords ?? undefined,
      includeStaleInbox: record.includeStaleInbox,
      includeSmallWins: record.includeSmallWins,
      includeOpenLoops: record.includeOpenLoops,
      includeSuggestions: record.includeSuggestions,
      includeTheme: record.includeTheme
    };
  }

  async savePreferences(preferences: DigestPreferences): Promise<DigestPreferences> {
    const merged = { ...DEFAULT_PREFERENCES, ...preferences };
    await this.prisma.digestPreference.upsert({
      where: { id: DEFAULT_ID },
      create: {
        id: DEFAULT_ID,
        focusCategories: merged.focusCategories || [],
        maxItems: merged.maxItems || DEFAULT_PREFERENCES.maxItems!,
        maxOpenLoops: merged.maxOpenLoops || DEFAULT_PREFERENCES.maxOpenLoops!,
        maxSuggestions: merged.maxSuggestions || DEFAULT_PREFERENCES.maxSuggestions!,
        maxWords: merged.maxWords ?? null,
        includeStaleInbox: merged.includeStaleInbox ?? DEFAULT_PREFERENCES.includeStaleInbox!,
        includeSmallWins: merged.includeSmallWins ?? DEFAULT_PREFERENCES.includeSmallWins!,
        includeOpenLoops: merged.includeOpenLoops ?? DEFAULT_PREFERENCES.includeOpenLoops!,
        includeSuggestions: merged.includeSuggestions ?? DEFAULT_PREFERENCES.includeSuggestions!,
        includeTheme: merged.includeTheme ?? DEFAULT_PREFERENCES.includeTheme!
      },
      update: {
        focusCategories: merged.focusCategories || [],
        maxItems: merged.maxItems || DEFAULT_PREFERENCES.maxItems!,
        maxOpenLoops: merged.maxOpenLoops || DEFAULT_PREFERENCES.maxOpenLoops!,
        maxSuggestions: merged.maxSuggestions || DEFAULT_PREFERENCES.maxSuggestions!,
        maxWords: merged.maxWords ?? null,
        includeStaleInbox: merged.includeStaleInbox ?? DEFAULT_PREFERENCES.includeStaleInbox!,
        includeSmallWins: merged.includeSmallWins ?? DEFAULT_PREFERENCES.includeSmallWins!,
        includeOpenLoops: merged.includeOpenLoops ?? DEFAULT_PREFERENCES.includeOpenLoops!,
        includeSuggestions: merged.includeSuggestions ?? DEFAULT_PREFERENCES.includeSuggestions!,
        includeTheme: merged.includeTheme ?? DEFAULT_PREFERENCES.includeTheme!
      }
    });

    return merged;
  }

  async getMergedPreferences(overrides?: DigestPreferences): Promise<DigestPreferences> {
    const current = await this.getPreferences();
    return { ...current, ...(overrides || {}) };
  }
}

let digestPreferencesServiceInstance: DigestPreferencesService | null = null;

export function getDigestPreferencesService(): DigestPreferencesService {
  if (!digestPreferencesServiceInstance) {
    digestPreferencesServiceInstance = new DigestPreferencesService();
  }
  return digestPreferencesServiceInstance;
}
