import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, EntrySummary } from '@/services/api';

interface EntriesContextValue {
  entries: EntrySummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EntriesContext = createContext<EntriesContextValue | undefined>(undefined);

interface EntriesProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export function EntriesProvider({ children, enabled = true }: EntriesProviderProps) {
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const all = await api.entries.list();
      setEntries(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const value = useMemo(
    () => ({ entries, isLoading, error, refresh }),
    [entries, error, isLoading, refresh]
  );

  return <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>;
}

export function useEntries(): EntriesContextValue {
  const context = useContext(EntriesContext);
  if (!context) {
    throw new Error('useEntries must be used within an EntriesProvider');
  }
  return context;
}
