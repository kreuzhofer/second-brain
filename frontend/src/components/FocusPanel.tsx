import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  api,
  Category,
  EntrySummary,
  RelationshipInsight,
  WeekPlanResponse,
  CalendarPublishResponse
} from '@/services/api';
import { useEntries } from '@/state/entries';
import { getFocusRailButtonClass } from '@/components/layout-shell-helpers';
import {
  formatBlockTime,
  formatExpiresAt,
  formatMinutes,
  formatPlanRange
} from '@/components/calendar-panel-helpers';
import {
  RefreshCw,
  Circle,
  CheckCircle2,
  Lightbulb,
  User,
  Inbox,
  FileText,
  Briefcase,
  ClipboardList,
  Target
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
  const [activeTab, setActiveTab] = useState<'focus' | 'ideas' | 'people' | 'inbox' | 'recent' | 'calendar'>('focus');
  const [focusSort, setFocusSort] = useState<'overdue' | 'newest'>('overdue');
  const [inboxSelected, setInboxSelected] = useState<Set<string>>(new Set());
  const [targetCategory, setTargetCategory] = useState<Category>('projects');
  const [targetPath, setTargetPath] = useState('');
  const [inboxExpanded, setInboxExpanded] = useState(false);
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [peopleInsights, setPeopleInsights] = useState<RelationshipInsight[]>([]);
  const [peopleInsightsLoading, setPeopleInsightsLoading] = useState(false);
  const [peopleInsightsError, setPeopleInsightsError] = useState<string | null>(null);
  const [calendarPlan, setCalendarPlan] = useState<WeekPlanResponse | null>(null);
  const [calendarPlanDays, setCalendarPlanDays] = useState(7);
  const [calendarPublish, setCalendarPublish] = useState<CalendarPublishResponse | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarBlocksExpanded, setCalendarBlocksExpanded] = useState(false);

  const handleRefresh = async () => {
    await refresh();
    setInboxSelected(new Set());
    if (activeTab === 'people') {
      setPeopleInsightsLoading(true);
      setPeopleInsightsError(null);
      try {
        const result = await api.insights.relationships(5);
        setPeopleInsights(result.insights);
      } catch (err) {
        setPeopleInsightsError(err instanceof Error ? err.message : 'Failed to load relationship insights');
      } finally {
        setPeopleInsightsLoading(false);
      }
    }
    if (activeTab === 'calendar') {
      await loadCalendarPlan();
    }
  };

  const loadCalendarPlan = async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const plan = await api.calendar.planWeek(undefined, calendarPlanDays);
      setCalendarPlan(plan);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to load week plan');
    } finally {
      setCalendarLoading(false);
    }
  };

  const handlePublishLinks = async () => {
    setCalendarError(null);
    try {
      const published = await api.calendar.publish();
      setCalendarPublish(published);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to generate calendar links');
    }
  };

  const copyText = async (value: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
      const element = document.createElement('textarea');
      element.value = value;
      element.setAttribute('readonly', 'true');
      element.style.position = 'absolute';
      element.style.left = '-9999px';
      document.body.appendChild(element);
      element.select();
      document.execCommand('copy');
      document.body.removeChild(element);
    } catch {
      setCalendarError('Unable to copy link. Please copy manually.');
    }
  };

  useEffect(() => {
    if (activeTab !== 'people') {
      return;
    }

    let cancelled = false;
    setPeopleInsightsLoading(true);
    setPeopleInsightsError(null);
    api.insights.relationships(5)
      .then((result) => {
        if (!cancelled) {
          setPeopleInsights(result.insights);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPeopleInsightsError(err instanceof Error ? err.message : 'Failed to load relationship insights');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPeopleInsightsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, entries.length]);

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    loadCalendarPlan();
  }, [activeTab, calendarPlanDays, entries.length]);

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
        : activeTab === 'calendar'
          ? 'No planned blocks yet.'
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
        : activeTab === 'calendar'
          ? 'Calendar'
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
    <Card className="flex h-full">
      <div className="flex-1 min-w-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2.5 sm:p-4">
          <div className="flex items-center gap-2">
            {activeTab === 'ideas' && <Lightbulb className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'people' && <User className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'calendar' && <Target className="h-4 w-4 text-muted-foreground" />}
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
            {activeTab === 'calendar' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Days</label>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={calendarPlanDays}
                  onChange={(event) => setCalendarPlanDays(Number(event.target.value))}
                >
                  {[5, 7, 10, 14].map((dayCount) => (
                    <option key={dayCount} value={dayCount}>
                      {dayCount}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5 sm:space-y-3 p-2.5 sm:p-4 pt-0">
        {activeTab === 'focus' && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-[11px] sm:text-xs text-muted-foreground">
              <div className="rounded-md border border-border px-2 py-1.5">
                <div className="text-sm font-semibold text-foreground">{activeProjects}</div>
                <div>Active projects</div>
              </div>
              <div className="rounded-md border border-border px-2 py-1.5">
                <div className="text-sm font-semibold text-foreground">{pendingAdmin}</div>
                <div>Pending tasks</div>
              </div>
              <div className="rounded-md border border-border px-2 py-1.5">
                <div className="text-sm font-semibold text-foreground">{inboxCount}</div>
                <div>Inbox items</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'people' && (
          <div className="space-y-2 rounded-md border border-border p-2.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Relationship insights
            </div>
            {peopleInsightsLoading && (
              <p className="text-xs text-muted-foreground">Loading insights...</p>
            )}
            {!peopleInsightsLoading && peopleInsightsError && (
              <p className="text-xs text-destructive">{peopleInsightsError}</p>
            )}
            {!peopleInsightsLoading && !peopleInsightsError && peopleInsights.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No relationship patterns yet. Add links between people and projects.
              </p>
            )}
            {!peopleInsightsLoading && !peopleInsightsError && peopleInsights.length > 0 && (
              <div className="space-y-1.5">
                {peopleInsights.slice(0, 3).map((insight) => (
                  <button
                    key={insight.person.path}
                    type="button"
                    onClick={() => onEntryClick(insight.person.path)}
                    className="w-full min-h-[44px] rounded-md border border-border px-2.5 py-2 text-left hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{insight.person.name}</span>
                      <span className="text-[11px] text-muted-foreground">Score {insight.score}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      <span>{insight.relationshipCount} relationship(s)</span>
                      <span>{insight.projectCount} project link(s)</span>
                      <span>{insight.mentionCount} mention(s)</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-3">
            {calendarError && <p className="text-sm text-destructive">{calendarError}</p>}
            {calendarPlan && (
              <div className="rounded-md border border-border p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Plan window</div>
                    <div className="text-sm font-medium">{formatPlanRange(calendarPlan.startDate, calendarPlan.endDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Total focus</div>
                    <div className="text-sm font-medium">{formatMinutes(calendarPlan.totalMinutes)}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {calendarPlan.items.length} scheduled block(s)
                </div>
              </div>
            )}

            <div className="rounded-md border border-border p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Calendar sharing</div>
                <Button size="sm" variant="outline" onClick={handlePublishLinks}>
                  Generate links
                </Button>
              </div>
              {!calendarPublish && (
                <p className="text-xs text-muted-foreground">
                  Generate a read-only ICS/WebCal subscription link for your current week plan.
                </p>
              )}
              {calendarPublish && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">HTTPS (ICS)</div>
                    <input
                      className="h-11 rounded-md border border-input bg-background px-2 text-xs w-full"
                      readOnly
                      value={calendarPublish.httpsUrl}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyText(calendarPublish.httpsUrl)}>
                        Copy HTTPS
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">WebCal</div>
                    <input
                      className="h-11 rounded-md border border-input bg-background px-2 text-xs w-full"
                      readOnly
                      value={calendarPublish.webcalUrl}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyText(calendarPublish.webcalUrl)}>
                        Copy WebCal
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          window.location.href = calendarPublish.webcalUrl;
                        }}
                      >
                        Open WebCal
                      </Button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Token expires {formatExpiresAt(calendarPublish.expiresAt)}
                  </div>
                </div>
              )}
            </div>

            {calendarLoading && (
              <p className="text-sm text-muted-foreground">Loading calendar blocks...</p>
            )}
            {!calendarLoading && calendarPlan && calendarPlan.items.length > 0 && (
              <div className="space-y-2">
                {(calendarBlocksExpanded ? calendarPlan.items : calendarPlan.items.slice(0, Math.max(maxItems, 6))).map((item) => (
                  <button
                    key={`${item.entryPath}-${item.start}`}
                    type="button"
                    onClick={() => onEntryClick(item.entryPath)}
                    className="w-full min-h-[44px] rounded-md border border-border p-2 sm:p-2.5 text-left hover:bg-accent transition-colors"
                  >
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatBlockTime(item.start, item.end)}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{item.entryPath}</span>
                      <span className="shrink-0">{formatMinutes(item.durationMinutes)}</span>
                    </div>
                  </button>
                ))}
                {calendarPlan.items.length > Math.max(maxItems, 6) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setCalendarBlocksExpanded((prev) => !prev)}
                  >
                    {calendarBlocksExpanded ? 'Show less' : `Show all (${calendarPlan.items.length})`}
                  </Button>
                )}
              </div>
            )}
            {!calendarLoading && calendarPlan && calendarPlan.items.length === 0 && (
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            )}
          </div>
        )}

        {combinedError && <p className="text-sm text-destructive">{combinedError}</p>}

        {activeTab !== 'inbox' && activeTab !== 'recent' && activeTab !== 'calendar' && currentItems.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}

        {activeTab !== 'inbox' && activeTab !== 'recent' && activeTab !== 'calendar' && currentItems.length > 0 && (
          <div className="space-y-2">
            {currentItems.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => onEntryClick(item.path)}
                className="w-full min-h-[44px] rounded-md border border-border p-2 sm:p-2.5 text-left hover:bg-accent transition-colors"
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
                  className="h-11 rounded-md border border-input bg-background px-2 text-base sm:h-9"
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
                className="h-11 rounded-md border border-input bg-background px-3 text-base sm:h-9"
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
      <div className="sticky top-2 self-start mt-2 mr-2 sm:top-3 sm:mt-3 sm:mr-3 flex flex-col shrink-0 max-h-[calc(100dvh-120px)]">
        <div className="rounded-md border border-border overflow-hidden max-h-[calc(100dvh-120px)] overflow-y-auto bg-background">
          {([
            { key: 'focus', label: 'Focus' },
            { key: 'calendar', label: 'Calendar' },
            { key: 'ideas', label: 'Ideas' },
            { key: 'people', label: 'People' },
            { key: 'inbox', label: 'Inbox' },
            { key: 'recent', label: 'Recent' }
          ] as Array<{ key: typeof activeTab; label: string }>).map((tab, index, all) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={getFocusRailButtonClass(activeTab === tab.key, index === all.length - 1)}
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
