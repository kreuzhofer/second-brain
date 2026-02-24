import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  api,
  CalendarBusyBlock,
  Category,
  EntrySummary,
  RelationshipInsight,
  WeekPlanResponse,
  CalendarPublishResponse,
  CalendarSource,
  CalendarSettings
} from '@/services/api';
import CalendarBoardView from '@/components/CalendarBoardView';
import { useEntries } from '@/state/entries';
import { getFocusRailButtonClass } from '@/components/layout-shell-helpers';
import {
  CALENDAR_VIEW_MODE_STORAGE_KEY,
  FOCUS_PANEL_TAB_STORAGE_KEY,
  getVisibleItems,
  parseCalendarViewMode,
  parseFocusPanelTab,
  shouldShowExpandToggle,
  type CalendarViewMode,
  type FocusPanelTab
} from '@/components/focus-panel-helpers';
import {
  formatBlockTime,
  formatExpiresAt,
  formatMinutes
} from '@/components/calendar-panel-helpers';
import {
  RefreshCw,
  Settings,
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

const CALENDAR_SOURCE_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399',
  '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc',
  '#e879f9', '#f472b6', '#fb7185', '#fca5a5', '#fdba74',
  '#fde047', '#86efac', '#67e8f9', '#93c5fd', '#c4b5fd'
];

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

const isTaskCategory = (category: string): boolean => category === 'task' || category === 'admin';

export function FocusPanel({ onEntryClick, maxItems = 5 }: FocusPanelProps) {
  const { entries, isLoading, error: loadError, refresh } = useEntries();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FocusPanelTab>(() => {
    if (typeof window === 'undefined') {
      return 'focus';
    }
    try {
      return parseFocusPanelTab(window.sessionStorage.getItem(FOCUS_PANEL_TAB_STORAGE_KEY)) || 'focus';
    } catch {
      return 'focus';
    }
  });
  const [focusSort, setFocusSort] = useState<'overdue' | 'newest'>('overdue');
  const [focusExpanded, setFocusExpanded] = useState(false);
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
  const [calendarGranularityMinutes, setCalendarGranularityMinutes] = useState(15);
  const [calendarBufferMinutes, setCalendarBufferMinutes] = useState(0);
  const [calendarPublish, setCalendarPublish] = useState<CalendarPublishResponse | null>(null);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSourcesLoading, setCalendarSourcesLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarBlocksExpanded, setCalendarBlocksExpanded] = useState(false);
  const [calendarSourceName, setCalendarSourceName] = useState('');
  const [calendarSourceUrl, setCalendarSourceUrl] = useState('');
  const [calendarSourceActionId, setCalendarSourceActionId] = useState<string | null>(null);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings | null>(null);
  const [calendarSettingsSaving, setCalendarSettingsSaving] = useState(false);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>(() => {
    if (typeof window === 'undefined') {
      return 'list';
    }
    try {
      return parseCalendarViewMode(window.sessionStorage.getItem(CALENDAR_VIEW_MODE_STORAGE_KEY)) || 'list';
    } catch {
      return 'list';
    }
  });
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [calendarBusyBlocks, setCalendarBusyBlocks] = useState<CalendarBusyBlock[]>([]);
  const [calendarBoardDays, setCalendarBoardDays] = useState<number>(3);
  const [calendarStartDayOffset, setCalendarStartDayOffset] = useState(0);
  const [colorPickerSourceId, setColorPickerSourceId] = useState<string | null>(null);
  const previousTabRef = useRef<FocusPanelTab | null>(null);
  const shouldAnchorCalendarToTodayRef = useRef(false);

  // Detect mobile and default to 1-column board view
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = () => {
      if (mq.matches) {
        setCalendarBoardDays((prev) => (prev === 3 ? 1 : prev));
      }
    };
    handler(); // check on mount
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
      // Manual refresh should bring calendar board back to today's date.
      shouldAnchorCalendarToTodayRef.current = true;
      // Sync all enabled external sources in parallel with plan/settings reload
      const syncExternal = async () => {
        const enabledSources = calendarSources.filter((s) => s.enabled);
        await Promise.allSettled(enabledSources.map((s) => api.calendar.syncSource(s.id)));
      };
      const [plan] = await Promise.all([
        loadCalendarPlan({ anchorToday: true }),
        loadCalendarSources(),
        loadCalendarSettings(),
        syncExternal()
      ]);
      // Reload sources + busy blocks after sync completes
      await loadCalendarSources();
      if (calendarViewMode === 'board' && plan) await loadBusyBlocks(plan);
    }
  };

  const getTodayOffsetForPlan = (plan: WeekPlanResponse): number => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const startMs = new Date(`${plan.startDate}T00:00:00Z`).getTime();
    const endMs = new Date(`${plan.endDate}T00:00:00Z`).getTime();
    const todayYmd = new Date().toISOString().slice(0, 10);
    const todayMs = new Date(`${todayYmd}T00:00:00Z`).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(todayMs)) {
      return 0;
    }
    const rawOffset = Math.floor((todayMs - startMs) / msPerDay);
    const maxOffset = Math.max(0, Math.floor((endMs - startMs) / msPerDay));
    return Math.max(0, Math.min(rawOffset, maxOffset));
  };

  const loadCalendarPlan = async (options?: { anchorToday?: boolean }): Promise<WeekPlanResponse | null> => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const plan = await api.calendar.planWeek(undefined, calendarPlanDays, {
        granularityMinutes: calendarGranularityMinutes,
        bufferMinutes: calendarBufferMinutes
      });
      setCalendarPlan(plan);
      if (options?.anchorToday) {
        setCalendarStartDayOffset(getTodayOffsetForPlan(plan));
      }
      return plan;
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to load week plan');
      return null;
    } finally {
      setCalendarLoading(false);
    }
  };

  const loadCalendarSettings = async () => {
    try {
      const settings = await api.calendar.settings();
      setCalendarSettings(settings);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to load calendar settings');
    }
  };

  const saveCalendarSettings = async () => {
    if (!calendarSettings) return;
    setCalendarError(null);
    setCalendarSettingsSaving(true);
    try {
      const updated = await api.calendar.updateSettings(calendarSettings);
      setCalendarSettings(updated);
      await loadCalendarPlan();
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to save calendar settings');
    } finally {
      setCalendarSettingsSaving(false);
    }
  };

  const runManualReplan = async () => {
    setCalendarError(null);
    setCalendarLoading(true);
    try {
      const plan = await api.calendar.replan({
        days: calendarPlanDays,
        granularityMinutes: calendarGranularityMinutes,
        bufferMinutes: calendarBufferMinutes
      });
      setCalendarPlan(plan);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to replan');
    } finally {
      setCalendarLoading(false);
    }
  };

  const loadBusyBlocks = async (plan: WeekPlanResponse) => {
    try {
      const blocks = await api.calendar.busyBlocks(plan.startDate, plan.endDate);
      setCalendarBusyBlocks(blocks);
    } catch {
      // Non-critical: board still works without busy blocks
      setCalendarBusyBlocks([]);
    }
  };

  const handleBoardMarkDone = async (entryPath: string) => {
    try {
      await api.entries.update(entryPath, { status: 'done' });
      await refresh();
      await loadCalendarPlan();
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to mark task done');
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

  const loadCalendarSources = async () => {
    setCalendarSourcesLoading(true);
    setCalendarError(null);
    try {
      const sources = await api.calendar.listSources();
      setCalendarSources(sources);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to load calendar sources');
    } finally {
      setCalendarSourcesLoading(false);
    }
  };

  const createCalendarSource = async () => {
    const name = calendarSourceName.trim();
    const url = calendarSourceUrl.trim();
    if (!name || !url) {
      setCalendarError('Source name and URL are required');
      return;
    }
    setCalendarError(null);
    setCalendarSourceActionId('create');
    try {
      const usedColors = new Set(calendarSources.map((s) => s.color).filter(Boolean));
      const color = CALENDAR_SOURCE_COLORS.find((c) => !usedColors.has(c)) || CALENDAR_SOURCE_COLORS[calendarSources.length % CALENDAR_SOURCE_COLORS.length];
      await api.calendar.createSource({ name, url, color });
      setCalendarSourceName('');
      setCalendarSourceUrl('');
      await Promise.all([loadCalendarSources(), loadCalendarPlan()]);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to add calendar source');
    } finally {
      setCalendarSourceActionId(null);
    }
  };

  const toggleCalendarSourceEnabled = async (source: CalendarSource) => {
    setCalendarError(null);
    setCalendarSourceActionId(source.id);
    try {
      await api.calendar.updateSource(source.id, { enabled: !source.enabled });
      await Promise.all([loadCalendarSources(), loadCalendarPlan()]);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to update source');
    } finally {
      setCalendarSourceActionId(null);
    }
  };

  const syncCalendarSource = async (sourceId: string) => {
    setCalendarError(null);
    setCalendarSourceActionId(sourceId);
    try {
      await api.calendar.syncSource(sourceId);
      await Promise.all([loadCalendarSources(), loadCalendarPlan()]);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to sync source');
    } finally {
      setCalendarSourceActionId(null);
    }
  };

  const deleteCalendarSource = async (sourceId: string) => {
    setCalendarError(null);
    setCalendarSourceActionId(sourceId);
    try {
      await api.calendar.deleteSource(sourceId);
      await Promise.all([loadCalendarSources(), loadCalendarPlan()]);
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : 'Failed to delete source');
    } finally {
      setCalendarSourceActionId(null);
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
    const enteringCalendar = activeTab === 'calendar' && previousTabRef.current !== 'calendar';
    if (enteringCalendar) {
      shouldAnchorCalendarToTodayRef.current = true;
    }
    previousTabRef.current = activeTab;
  }, [activeTab]);

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
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.sessionStorage.setItem(FOCUS_PANEL_TAB_STORAGE_KEY, activeTab);
    } catch {
      // Ignore storage errors in constrained browser contexts.
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.sessionStorage.setItem(CALENDAR_VIEW_MODE_STORAGE_KEY, calendarViewMode);
    } catch {
      // Ignore storage errors in constrained browser contexts.
    }
  }, [calendarViewMode]);

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    const anchorToday = shouldAnchorCalendarToTodayRef.current;
    shouldAnchorCalendarToTodayRef.current = false;
    Promise.all([
      loadCalendarPlan({ anchorToday }).then((plan) => {
        if (calendarViewMode === 'board' && plan) loadBusyBlocks(plan);
      }),
      loadCalendarSources(),
      loadCalendarSettings()
    ]);
  }, [activeTab, calendarPlanDays, calendarGranularityMinutes, calendarBufferMinutes, calendarViewMode, entries.length]);

  const focusItems = useMemo<FocusItem[]>(() => {
    const items = entries
      .filter((entry) => (
        (entry.category === 'projects' && entry.status === 'active') ||
        (isTaskCategory(entry.category) && entry.status === 'pending')
      ))
      .map((entry) => ({
        path: entry.path,
        title: entry.category === 'projects' ? (entry.next_action || entry.name) : entry.name,
        subtitle: entry.category === 'projects' && entry.next_action ? entry.name : entry.category === 'projects' ? 'Project' : 'Task',
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

    return sorted.map((entry) => entry.item);
  }, [entries, focusSort]);

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
  const pendingAdmin = entries.filter((entry) => isTaskCategory(entry.category) && entry.status === 'pending').length;

  const currentItems = activeTab === 'ideas'
    ? ideaItems
    : activeTab === 'people'
      ? peopleItems
      : getVisibleItems(focusItems, focusExpanded, maxItems);
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
      case 'task':
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
    <div className="flex h-full bg-background">
      <div className="flex-1 min-w-0">
        <div className="flex flex-row items-center justify-between space-y-0 p-2.5 sm:p-4 border-b">
          <div className="flex items-center gap-2">
            {activeTab === 'ideas' && <Lightbulb className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'people' && <User className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'calendar' && <Target className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'inbox' && <Inbox className="h-4 w-4 text-muted-foreground" />}
            {activeTab === 'recent' && <FileText className="h-4 w-4 text-muted-foreground" />}
            <h3 className="text-base sm:text-lg font-medium">{title}</h3>
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
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCalendarViewMode('list')}
                    className={`px-2 py-1 text-[10px] sm:text-[11px] uppercase tracking-wide ${
                      calendarViewMode === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground'
                    }`}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarViewMode('board')}
                    className={`px-2 py-1 text-[10px] sm:text-[11px] uppercase tracking-wide ${
                      calendarViewMode === 'board' ? 'bg-foreground text-background' : 'text-muted-foreground'
                    }`}
                  >
                    Board
                  </button>
                </div>
                {calendarViewMode === 'board' && (
                  <>
                    <label className="text-xs text-muted-foreground">Cols</label>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={calendarBoardDays}
                      onChange={(event) => setCalendarBoardDays(Number(event.target.value))}
                    >
                      {[1, 3, 5, 7].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </>
                )}
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
                <label className="text-xs text-muted-foreground">Slot</label>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={calendarGranularityMinutes}
                  onChange={(event) => setCalendarGranularityMinutes(Number(event.target.value))}
                >
                  {[15, 30, 60].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes}m
                    </option>
                  ))}
                </select>
                <label className="text-xs text-muted-foreground">Buffer</label>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={calendarBufferMinutes}
                  onChange={(event) => setCalendarBufferMinutes(Number(event.target.value))}
                >
                  {[0, 5, 10, 15, 30].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes}m
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={runManualReplan}
                  disabled={calendarLoading}
                >
                  Replan now
                </Button>
              </div>
            )}
            {activeTab === 'calendar' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCalendarSettingsOpen((prev) => !prev)}
                title="Calendar settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="space-y-2.5 sm:space-y-3 p-2.5 sm:p-4 pt-0">
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
            {calendarPlan && calendarPlan.warnings && calendarPlan.warnings.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1">
                {calendarPlan.warnings.length} item(s) could not be scheduled in this window.
              </div>
            )}

            {calendarSettingsOpen && (
            <>
            <div className="rounded-md border border-border p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Working hours</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={saveCalendarSettings}
                  disabled={!calendarSettings || calendarSettingsSaving}
                >
                  {calendarSettingsSaving ? 'Saving...' : 'Save hours'}
                </Button>
              </div>
              {calendarSettings && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Start</span>
                      <input
                        type="time"
                        className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                        value={calendarSettings.workdayStartTime}
                        onChange={(event) =>
                          setCalendarSettings((prev) =>
                            prev ? { ...prev, workdayStartTime: event.target.value } : prev
                          )
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">End</span>
                      <input
                        type="time"
                        className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                        value={calendarSettings.workdayEndTime}
                        onChange={(event) =>
                          setCalendarSettings((prev) =>
                            prev ? { ...prev, workdayEndTime: event.target.value } : prev
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { value: 1, label: 'Mon' },
                      { value: 2, label: 'Tue' },
                      { value: 3, label: 'Wed' },
                      { value: 4, label: 'Thu' },
                      { value: 5, label: 'Fri' },
                      { value: 6, label: 'Sat' },
                      { value: 0, label: 'Sun' }
                    ].map((day) => {
                      const enabled = calendarSettings.workingDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          className={`h-9 rounded-md border px-2 text-xs ${
                            enabled
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border text-muted-foreground'
                          }`}
                          onClick={() => {
                            setCalendarSettings((prev) => {
                              if (!prev) return prev;
                              const next = enabled
                                ? prev.workingDays.filter((current) => current !== day.value)
                                : [...prev.workingDays, day.value].sort((a, b) => a - b);
                              return {
                                ...prev,
                                workingDays: next.length > 0 ? next : prev.workingDays
                              };
                            });
                          }}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md border border-border p-2.5 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">External blocker calendars</div>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input
                  className="h-11 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                  placeholder="Calendar name"
                  value={calendarSourceName}
                  onChange={(event) => setCalendarSourceName(event.target.value)}
                />
                <input
                  className="h-11 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                  placeholder="https://.../calendar.ics"
                  value={calendarSourceUrl}
                  onChange={(event) => setCalendarSourceUrl(event.target.value)}
                />
                <Button
                  size="sm"
                  onClick={createCalendarSource}
                  disabled={calendarSourceActionId === 'create'}
                  className="h-11 sm:h-9"
                >
                  Add
                </Button>
              </div>
              {calendarSourcesLoading && (
                <p className="text-xs text-muted-foreground">Loading sources...</p>
              )}
              {!calendarSourcesLoading && calendarSources.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add one or more ICS/WebCal sources to block busy times in autoscheduling.
                </p>
              )}
              {!calendarSourcesLoading && calendarSources.length > 0 && (
                <div className="space-y-2">
                  {calendarSources.map((source) => (
                    <div key={source.id} className="rounded-md border border-border p-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{source.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{source.url}</div>
                        </div>
                        <span
                          className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                            source.enabled
                              ? 'border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10'
                              : 'border-border text-muted-foreground bg-muted'
                          }`}
                        >
                          {source.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="w-5 h-5 rounded-full border border-border shrink-0"
                          style={{ backgroundColor: source.color || '#94a3b8' }}
                          onClick={() => setColorPickerSourceId(colorPickerSourceId === source.id ? null : source.id)}
                          title="Change color"
                        />
                        {colorPickerSourceId === source.id && (
                          <div className="flex flex-wrap gap-1">
                            {CALENDAR_SOURCE_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={`w-4 h-4 rounded-full border ${source.color === c ? 'ring-2 ring-foreground ring-offset-1' : 'border-border'}`}
                                style={{ backgroundColor: c }}
                                onClick={async () => {
                                  setColorPickerSourceId(null);
                                  await api.calendar.updateSource(source.id, { color: c });
                                  await loadCalendarSources();
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          disabled={calendarSourceActionId === source.id}
                          onClick={() => toggleCalendarSourceEnabled(source)}
                        >
                          {source.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          disabled={calendarSourceActionId === source.id}
                          onClick={() => syncCalendarSource(source.id)}
                        >
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          disabled={calendarSourceActionId === source.id}
                          onClick={() => deleteCalendarSource(source.id)}
                        >
                          Delete
                        </Button>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Last sync: {source.lastSyncAt ? formatDate(source.lastSyncAt) : 'Never'} | Status: {source.fetchStatus}
                      </div>
                      {source.fetchError && (
                        <div className="text-[11px] text-destructive">{source.fetchError}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
            </>
            )}

            {calendarLoading && (
              <p className="text-sm text-muted-foreground">Loading calendar blocks...</p>
            )}

            {/* Board view */}
            {!calendarLoading && calendarViewMode === 'board' && calendarPlan && calendarSettings && (
              <CalendarBoardView
                plan={calendarPlan}
                busyBlocks={calendarBusyBlocks}
                calendarSources={calendarSources}
                settings={calendarSettings}
                visibleDays={calendarBoardDays}
                startDayOffset={calendarStartDayOffset}
                onNavigate={setCalendarStartDayOffset}
                onEntryClick={onEntryClick}
                onMarkDone={handleBoardMarkDone}
              />
            )}

            {/* List view */}
            {!calendarLoading && calendarViewMode === 'list' && calendarPlan && calendarPlan.items.length > 0 && (
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
            {!calendarLoading && calendarViewMode === 'list' && calendarPlan && calendarPlan.unscheduled.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Unscheduled</div>
                {calendarPlan.unscheduled.map((item) => (
                  <button
                    key={`${item.entryPath}-${item.reasonCode}`}
                    type="button"
                    onClick={() => onEntryClick(item.entryPath)}
                    className="w-full min-h-[44px] rounded-md border border-amber-500/40 bg-amber-500/10 p-2 sm:p-2.5 text-left"
                  >
                    <div className="text-sm font-medium">{item.sourceName}</div>
                    <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">{item.reason}</div>
                    <div className="mt-1 text-[11px] text-amber-900/80 dark:text-amber-200/80 uppercase tracking-wide">
                      {item.reasonCode.replace(/_/g, ' ')}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!calendarLoading && calendarViewMode === 'list' && calendarPlan && calendarPlan.items.length === 0 && (
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
                  {isTaskCategory(item.category) ? (
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
                        <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                          Overdue
                        </span>
                      )}
                      <span>Due {item.dueDate}</span>
                    </span>
                  )}
                </div>
              </button>
            ))}
            {activeTab === 'focus' && shouldShowExpandToggle(focusItems.length, maxItems) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setFocusExpanded((prev) => !prev)}
              >
                {focusExpanded ? 'Show less' : `Show all (${focusItems.length})`}
              </Button>
            )}
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
                  {(['people', 'projects', 'ideas', 'task'] as Category[]).map((cat) => (
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
        </div>
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
    </div>
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
