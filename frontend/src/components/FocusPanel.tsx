import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api, Category, EntrySummary } from '@/services/api';
import { useEntries } from '@/state/entries';
import {
  RefreshCw,
  Circle,
  CheckCircle2,
  Lightbulb,
  User,
  Inbox,
  FileText,
  Briefcase,
  ClipboardList
} from 'lucide-react';

interface FocusPanelProps {
  onEntryClick: (path: string) => void;
  maxItems?: number;
}

interface FocusItem {
  path: string;
  title: string;
  subtitle: string;
  dueDate?: string;
  category: string;
  updatedAt?: string;
}

export function FocusPanel({ onEntryClick, maxItems = 5 }: FocusPanelProps) {
  const { entries, isLoading, error: loadError, refresh } = useEntries();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'focus' | 'ideas' | 'people' | 'inbox' | 'recent'>('focus');
  const [focusSort, setFocusSort] = useState<'overdue' | 'newest'>('overdue');
  const [inboxSelected, setInboxSelected] = useState<Set<string>>(new Set());
  const [targetCategory, setTargetCategory] = useState<Category>('projects');
  const [targetPath, setTargetPath] = useState('');
  const [inboxExpanded, setInboxExpanded] = useState(false);
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);

  const handleRefresh = async () => {
    await refresh();
    setInboxSelected(new Set());
  };

  const focusItems = useMemo<FocusItem[]>(() => {
    const items = entries
      .filter((entry) => (
        (entry.category === 'projects' && entry.status === 'active') ||
        (entry.category === 'admin' && entry.status === 'pending')
      ))
      .map((entry) => ({
        path: entry.path,
        title: entry.category === 'projects' ? (entry.next_action || entry.name) : entry.name,
        subtitle: entry.category === 'projects' && entry.next_action ? entry.name : entry.category === 'projects' ? 'Project' : 'Admin task',
        dueDate: entry.due_date,
        category: entry.category,
        updatedAt: entry.updated_at
      }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const withMeta = items.map((item) => {
      const dueDateValue = item.dueDate ? new Date(item.dueDate) : null;
      if (dueDateValue) {
        dueDateValue.setHours(0, 0, 0, 0);
      }
      const updatedAtValue = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
      const isOverdue = dueDateValue ? dueDateValue.getTime() < today.getTime() : false;
      return { item, dueDateValue, updatedAtValue, isOverdue };
    });

    const sorted = withMeta.sort((a, b) => {
      if (focusSort === 'newest') {
        return b.updatedAtValue - a.updatedAtValue;
      }

      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1;
      }

      if (a.dueDateValue && b.dueDateValue) {
        return a.dueDateValue.getTime() - b.dueDateValue.getTime();
      }
      if (a.dueDateValue && !b.dueDateValue) {
        return -1;
      }
      if (!a.dueDateValue && b.dueDateValue) {
        return 1;
      }
      return b.updatedAtValue - a.updatedAtValue;
    });

    return sorted.map((entry) => entry.item).slice(0, maxItems);
  }, [entries, focusSort, maxItems]);

  const ideaItems = useMemo<FocusItem[]>(() => {
    return entries
      .filter((entry) => entry.category === 'ideas')
      .map((entry) => ({
        path: entry.path,
        title: entry.name,
        subtitle: entry.one_liner || 'Idea',
        category: entry.category
      }))
      .slice(0, maxItems);
  }, [entries, maxItems]);

  const peopleItems = useMemo<FocusItem[]>(() => {
    return entries
      .filter((entry) => entry.category === 'people')
      .map((entry) => ({
        path: entry.path,
        title: entry.name,
        subtitle: entry.context || 'Person',
        category: entry.category
      }))
      .slice(0, maxItems);
  }, [entries, maxItems]);

  const inboxItems = useMemo<EntrySummary[]>(() => {
    return entries.filter((entry) => entry.category === 'inbox');
  }, [entries]);

  const recentItems = useMemo<EntrySummary[]>(() => {
    return [...entries].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [entries]);

  const inboxCount = entries.filter((entry) => entry.category === 'inbox').length;
  const activeProjects = entries.filter((entry) => entry.category === 'projects' && entry.status === 'active').length;
  const pendingAdmin = entries.filter((entry) => entry.category === 'admin' && entry.status === 'pending').length;

  const currentItems = activeTab === 'ideas' ? ideaItems : activeTab === 'people' ? peopleItems : focusItems;
  const emptyMessage = activeTab === 'focus'
    ? 'No active actions found. Capture a task or pick something from the inbox.'
    : activeTab === 'ideas'
      ? 'No ideas yet. Capture a spark and come back later.'
      : activeTab === 'people'
        ? 'No people captured yet. Add someone you want to keep in mind.'
        : activeTab === 'recent'
          ? 'No recent activity yet.'
        : 'Inbox is clear.';
  const combinedError = error ?? loadError;

  const title = activeTab === 'focus'
    ? 'Focus Now'
    : activeTab === 'ideas'
      ? 'Ideas'
      : activeTab === 'people'
        ? 'People'
        : activeTab === 'recent'
          ? 'Recent Entries'
          : 'Inbox';

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'people':
        return <User className="h-4 w-4" />;
      case 'projects':
        return <Briefcase className="h-4 w-4" />;
      case 'ideas':
        return <Lightbulb className="h-4 w-4" />;
      case 'admin':
        return <ClipboardList className="h-4 w-4" />;
      case 'inbox':
        return <Inbox className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const toggleInboxSelection = (path: string) => {
    const next = new Set(inboxSelected);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setInboxSelected(next);
  };

  const toggleInboxAll = () => {
    if (inboxSelected.size === inboxItems.length) {
      setInboxSelected(new Set());
      return;
    }
    setInboxSelected(new Set(inboxItems.map((entry) => entry.path)));
  };

  const runInboxAction = async (action: 'move' | 'resolve' | 'merge') => {
    if (inboxSelected.size === 0) {
      setError('Select at least one inbox item');
      return;
    }
    if (action === 'merge' && !targetPath.trim()) {
      setError('Target path is required for merge');
      return;
    }
    setError(null);
    setIsTriageLoading(true);
    try {
      const paths = Array.from(inboxSelected);
      if (action === 'move') {
        await api.inbox.triage({ action, paths, targetCategory });
      }
      if (action === 'resolve') {
        await api.inbox.triage({ action, paths });
      }
      if (action === 'merge') {
        await api.inbox.triage({ action, paths, targetPath: targetPath.trim() });
      }
      await handleRefresh();
      setTargetPath('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Triage action failed');
    } finally {
      setIsTriageLoading(false);
    }
  };

  return (
    <Card className="flex">
      <div className="flex-1 min-w-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6">
          <div className="flex items-center gap-2">
            {activeTab === 'ideas' && <Lightbulb className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'people' && <User className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'inbox' && <Inbox className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'recent' && <FileText className="h-4 w-4 text-muted-foreground" />}
            <CardTitle className="text-base sm:text-lg font-medium">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'focus' && (
              <div className="flex items-center rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFocusSort('overdue')}
                  className={`px-2 py-1 text-[10px] sm:text-[11px] uppercase tracking-wide ${
                    focusSort === 'overdue' ? 'bg-foreground text-background' : 'text-muted-foreground'
                  }`}
                >
                  Overdue
                </button>
                <button
                  type="button"
                  onClick={() => setFocusSort('newest')}
                  className={`px-2 py-1 text-[10px] sm:text-[11px] uppercase tracking-wide ${
                    focusSort === 'newest' ? 'bg-foreground text-background' : 'text-muted-foreground'
                  }`}
                >
                  Newest
                </button>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0">
        {activeTab === 'focus' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[11px] sm:text-xs text-muted-foreground">
              <div className="rounded-md border border-border px-3 py-2">
                <div className="text-sm font-semibold text-foreground">{activeProjects}</div>
                <div>Active projects</div>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <div className="text-sm font-semibold text-foreground">{pendingAdmin}</div>
                <div>Pending tasks</div>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <div className="text-sm font-semibold text-foreground">{inboxCount}</div>
                <div>Inbox items</div>
              </div>
            </div>
          </div>
        )}

        {combinedError && <p className="text-sm text-destructive">{combinedError}</p>}

        {activeTab !== 'inbox' && activeTab !== 'recent' && currentItems.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}

        {activeTab !== 'inbox' && activeTab !== 'recent' && currentItems.length > 0 && (
          <div className="space-y-2">
            {currentItems.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => onEntryClick(item.path)}
                className="w-full min-h-[44px] rounded-md border border-border p-2.5 sm:p-3 text-left hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2">
                  {item.category === 'admin' ? (
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="font-medium text-sm">{item.title}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex items-center justify-between gap-2">
                  <span className="truncate">{item.subtitle}</span>
                  {item.dueDate && (
                    <span className="shrink-0 flex items-center gap-2">
                      {isOverdueDate(item.dueDate) && (
                        <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-red-600">
                          Overdue
                        </span>
                      )}
                      <span>Due {item.dueDate}</span>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="space-y-3">
            {recentItems.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            )}
            {recentItems.length > 0 && (
              <>
                <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {(recentExpanded ? recentItems : recentItems.slice(0, Math.max(maxItems, 6))).map((entry) => (
                    <li key={entry.path}>
                      <button
                        onClick={() => onEntryClick(entry.path)}
                        className="w-full min-h-[44px] flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                      >
                        <div className="flex-shrink-0 text-muted-foreground">
                          {getCategoryIcon(entry.category)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {entry.category}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-xs text-muted-foreground">
                          {formatDate(entry.updated_at)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                {recentItems.length > Math.max(maxItems, 6) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setRecentExpanded((prev) => !prev)}
                  >
                    {recentExpanded ? 'Show less' : `Show all (${recentItems.length})`}
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'inbox' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleInboxAll}
                disabled={inboxItems.length === 0}
              >
                {inboxSelected.size === inboxItems.length && inboxItems.length > 0 ? 'Clear All' : 'Select All'}
              </Button>
              <div className="flex gap-2 items-center">
                <select
                  className="h-11 rounded-md border border-input bg-background px-2 text-base sm:h-9 sm:text-sm"
                  value={targetCategory}
                  onChange={(event) => setTargetCategory(event.target.value as Category)}
                >
                  {(['people', 'projects', 'ideas', 'admin'] as Category[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={() => runInboxAction('move')} disabled={isTriageLoading}>
                  Reclassify
                </Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => runInboxAction('resolve')} disabled={isTriageLoading}>
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
              <Button size="sm" onClick={() => runInboxAction('merge')} disabled={isTriageLoading}>
                Merge Selected
              </Button>
            </div>

            {inboxItems.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            )}

            {inboxItems.length > 0 && (
              <>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {(inboxExpanded ? inboxItems : inboxItems.slice(0, Math.max(maxItems, 6))).map((entry) => (
                    <div key={entry.path} className="flex gap-3 rounded-md border border-border p-3 min-h-[44px]">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={inboxSelected.has(entry.path)}
                        onChange={() => toggleInboxSelection(entry.path)}
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
                {inboxItems.length > Math.max(maxItems, 6) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setInboxExpanded((prev) => !prev)}
                  >
                    {inboxExpanded ? 'Show less' : `Show all (${inboxItems.length})`}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        </CardContent>
      </div>
      <div className="sticky top-3 self-start mt-3 mr-2 lg:top-4 lg:mt-4 lg:mr-3 flex flex-col shrink-0 max-h-[calc(100vh-140px)]">
        <div className="rounded-md border border-border overflow-hidden max-h-[calc(100vh-140px)] overflow-y-auto">
          {([
            { key: 'focus', label: 'Focus' },
            { key: 'ideas', label: 'Ideas' },
            { key: 'people', label: 'People' },
            { key: 'inbox', label: 'Inbox' },
            { key: 'recent', label: 'Recent' }
          ] as Array<{ key: typeof activeTab; label: string }>).map((tab, index, all) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center justify-center min-h-[44px] w-9 sm:w-10 px-1 py-2 text-[10px] uppercase tracking-wider transition-colors ${
                activeTab === tab.key ? 'bg-foreground text-background' : 'bg-background text-muted-foreground'
              } ${index < all.length - 1 ? 'border-b border-border' : ''}`}
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function isOverdueDate(dueDate: string): boolean {
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return false;
  parsed.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed.getTime() < today.getTime();
}
