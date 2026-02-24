import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { resolveTheme, getStoredTheme, getSystemTheme } from './use-theme';

// Provide a minimal localStorage mock for the node test environment
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
  get length() { return storage.size; },
  key: (_i: number) => null as string | null
};

// Provide a minimal matchMedia mock
const matchMediaMock = vi.fn().mockReturnValue({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
});

beforeEach(() => {
  storage.clear();
  (globalThis as Record<string, unknown>).localStorage = localStorageMock;
  (globalThis as Record<string, unknown>).window = { matchMedia: matchMediaMock, localStorage: localStorageMock };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).window;
});

describe('use-theme helpers', () => {
  describe('getStoredTheme', () => {
    it('returns system when nothing is stored', () => {
      expect(getStoredTheme()).toBe('system');
    });

    it('returns light when stored', () => {
      localStorageMock.setItem('justdo-theme', 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('returns dark when stored', () => {
      localStorageMock.setItem('justdo-theme', 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('returns system when stored', () => {
      localStorageMock.setItem('justdo-theme', 'system');
      expect(getStoredTheme()).toBe('system');
    });

    it('returns system for invalid stored value', () => {
      localStorageMock.setItem('justdo-theme', 'invalid');
      expect(getStoredTheme()).toBe('system');
    });
  });

  describe('resolveTheme', () => {
    it('returns light for light', () => {
      expect(resolveTheme('light')).toBe('light');
    });

    it('returns dark for dark', () => {
      expect(resolveTheme('dark')).toBe('dark');
    });

    it('resolves system to light when prefers-color-scheme is light', () => {
      matchMediaMock.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
      expect(resolveTheme('system')).toBe('light');
    });

    it('resolves system to dark when prefers-color-scheme is dark', () => {
      matchMediaMock.mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
      expect(resolveTheme('system')).toBe('dark');
    });
  });

  describe('getSystemTheme', () => {
    it('returns light when system prefers light', () => {
      matchMediaMock.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
      expect(getSystemTheme()).toBe('light');
    });

    it('returns dark when system prefers dark', () => {
      matchMediaMock.mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
      expect(getSystemTheme()).toBe('dark');
    });
  });
});
