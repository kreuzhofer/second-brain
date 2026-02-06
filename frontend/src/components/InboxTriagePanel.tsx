import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api, Category } from '@/services/api';
import { Loader2 } from 'lucide-react';
import { useEntries } from '@/state/entries';

interface InboxTriagePanelProps {
  onEntryClick: (path: string) => void;
  limit?: number;
}

const CATEGORY_OPTIONS: Category[] = ['people', 'projects', 'ideas', 'admin'];

export function InboxTriagePanel({ onEntryClick, limit = 6 }: InboxTriagePanelProps) {
  const { entries, isLoading, error: loadError, refresh } = useEntries();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetCategory, setTargetCategory] = useState<Category>('projects');
  const [targetPath, setTargetPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const inboxEntries = useMemo(() => {
    return entries.filter((entry) => entry.category === 'inbox');
  }, [entries]);

  const toggleSelection = (path: string) => {
    const next = new Set(selected);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === inboxEntries.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(inboxEntries.map((entry) => entry.path)));
  };

  const runAction = async (action: 'move' | 'resolve' | 'merge') => {
    if (selected.size === 0) {
      setError('Select at least one inbox item');
      return;
    }
    if (action === 'merge' && !targetPath.trim()) {
      setError('Target path is required for merge');
      return;
    }
    setError(null);
    setIsActionLoading(true);
    try {
      const paths = Array.from(selected);
      if (action === 'move') {
        await api.inbox.triage({ action, paths, targetCategory });
      }
      if (action === 'resolve') {
        await api.inbox.triage({ action, paths });
      }
      if (action === 'merge') {
        await api.inbox.triage({ action, paths, targetPath: targetPath.trim() });
      }
      await refresh();
      setSelected(new Set());
      setTargetPath('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Triage action failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  const combinedError = error ?? loadError;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg font-medium">Inbox Triage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={toggleAll} disabled={inboxEntries.length === 0}>
            {selected.size === inboxEntries.length && inboxEntries.length > 0 ? 'Clear All' : 'Select All'}
          </Button>
          <div className="flex gap-2 items-center">
            <select
              className="h-11 rounded-md border border-input bg-background px-2 text-base sm:h-9 sm:text-sm"
              value={targetCategory}
              onChange={(event) => setTargetCategory(event.target.value as Category)}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => runAction('move')} disabled={isLoading || isActionLoading}>
              Reclassify
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => runAction('resolve')} disabled={isLoading || isActionLoading}>
            Resolve
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <input
            className="h-11 rounded-md border border-input bg-background px-3 text-base sm:h-9 sm:text-sm"
            placeholder="Merge into entry path (e.g., projects/project-a)"
            value={targetPath}
            onChange={(event) => setTargetPath(event.target.value)}
          />
          <Button size="sm" onClick={() => runAction('merge')} disabled={isLoading || isActionLoading}>
            Merge Selected
          </Button>
        </div>

        {combinedError && <p className="text-sm text-destructive">{combinedError}</p>}

        {isLoading && inboxEntries.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading inbox...
          </div>
        )}

        {!isLoading && inboxEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">Inbox is clear.</p>
        )}

        {inboxEntries.length > 0 && (
          <>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(expanded ? inboxEntries : inboxEntries.slice(0, limit)).map((entry) => (
              <div key={entry.path} className="flex gap-3 rounded-md border border-border p-3 min-h-[44px]">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={selected.has(entry.path)}
                  onChange={() => toggleSelection(entry.path)}
                />
                <div className="flex-1">
                  <button
                    type="button"
                    className="text-sm font-medium text-left hover:underline"
                    onClick={() => onEntryClick(entry.path)}
                  >
                    {entry.name}
                  </button>
                  <div className="text-xs text-muted-foreground mt-1">
                    {entry.original_text || 'No preview available'}
                  </div>
                  {entry.suggested_category && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Suggested: {entry.suggested_category}
                    </div>
                  )}
                </div>
              </div>
              ))}
            </div>
            {inboxEntries.length > limit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? 'Show less' : `Show all (${inboxEntries.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
