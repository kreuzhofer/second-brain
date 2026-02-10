/**
 * EntryModal Component
 * Displays entry details in a modal using createPortal.
 * 
 * Requirements 11.1, 11.2, 11.3, 11.4
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api, EntryWithPath, EntryLinksResponse, EntryGraphResponse } from '@/services/api';
import { X, Loader2, FileText, User, Briefcase, Lightbulb, ClipboardList, Pencil, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  hasNotesChanges,
  resizeTextarea,
  runMutationAndRefresh,
  shouldPromptUnsavedNotes
} from '@/components/entry-modal-helpers';
import {
  buildTaskDuePayload,
  buildTaskFixedPayload,
  formatTaskDeadline,
  selectTaskDueInput,
  parseTaskDateTime
} from '@/components/entry-modal-task-schedule-helpers';
import { useEntries } from '@/state/entries';

interface EntryModalProps {
  entryPath: string | null;
  onClose: () => void;
  onStartFocus?: (entry: EntryWithPath) => void;
  onEntryClick?: (path: string) => void;
}

export function EntryModal({ entryPath, onClose, onStartFocus, onEntryClick }: EntryModalProps) {
  const { refresh } = useEntries();
  const [entry, setEntry] = useState<EntryWithPath | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<EntryLinksResponse | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [graph, setGraph] = useState<EntryGraphResponse | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [isLinkBusy, setIsLinkBusy] = useState(false);
  const [linkBusyKey, setLinkBusyKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'links' | 'meta'>('overview');
  const [taskDurationDraft, setTaskDurationDraft] = useState<string>('');
  const [taskDueDateDraft, setTaskDueDateDraft] = useState<string>('');
  const [taskDueTimeDraft, setTaskDueTimeDraft] = useState<string>('');
  const [taskDueTimeEnabled, setTaskDueTimeEnabled] = useState<boolean>(false);
  const [taskFixedDateDraft, setTaskFixedDateDraft] = useState<string>('');
  const [taskFixedTimeDraft, setTaskFixedTimeDraft] = useState<string>('');
  const [taskFixedTimeEnabled, setTaskFixedTimeEnabled] = useState<boolean>(false);
  const [isSavingTaskSchedule, setIsSavingTaskSchedule] = useState(false);
  const [taskScheduleError, setTaskScheduleError] = useState<string | null>(null);
  const [isMarkingTaskDone, setIsMarkingTaskDone] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (entryPath) {
      loadEntry(entryPath);
      loadLinks(entryPath);
      loadGraph(entryPath);
    } else {
      setEntry(null);
      setLinks(null);
      setGraph(null);
      setActiveTab('overview');
      setIsEditingNotes(false);
      setNotesError(null);
      setLinkDraft('');
      setIsLinkBusy(false);
      setLinkBusyKey(null);
    }
  }, [entryPath]);

  useEffect(() => {
    if (!entry || isEditingNotes) return;
    setNotesDraft(entry.content ?? '');
  }, [entry?.path, entry?.content, entry, isEditingNotes]);

  useEffect(() => {
    if (!entry || !isTaskCategory(entry.category)) {
      setTaskDurationDraft('');
      setTaskDueDateDraft('');
      setTaskDueTimeDraft('');
      setTaskDueTimeEnabled(false);
      setTaskFixedDateDraft('');
      setTaskFixedTimeDraft('');
      setTaskFixedTimeEnabled(false);
      return;
    }
    const duration = (entry.entry as any).duration_minutes;
    const dueAt = selectTaskDueInput((entry.entry as any).due_date, (entry.entry as any).due_at);
    const fixedAt = (entry.entry as any).fixed_at;
    const dueDraft = parseTaskDateTime(dueAt);
    const fixedDraft = parseTaskDateTime(fixedAt);
    setTaskDurationDraft(duration ? String(duration) : '30');
    setTaskDueDateDraft(dueDraft.date);
    setTaskDueTimeDraft(dueDraft.time);
    setTaskDueTimeEnabled(dueDraft.hasTime);
    setTaskFixedDateDraft(fixedDraft.date);
    setTaskFixedTimeDraft(fixedDraft.time);
    setTaskFixedTimeEnabled(fixedDraft.hasTime);
    setTaskScheduleError(null);
  }, [entry]);

  useEffect(() => {
    if (!isEditingNotes) return;
    resizeTextarea(notesRef.current);
  }, [isEditingNotes, notesDraft]);

  const loadEntry = async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.entries.get(path);
      setEntry(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entry');
    } finally {
      setIsLoading(false);
    }
  };

  const loadLinks = async (path: string) => {
    setLinksError(null);
    try {
      const data = await api.entries.links(path);
      setLinks(data);
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : 'Failed to load links');
    }
  };

  const loadGraph = async (path: string) => {
    setGraphError(null);
    try {
      const data = await api.entries.graph(path);
      setGraph(data);
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : 'Failed to load graph');
    }
  };

  const refreshLinksAndGraph = async (path: string) => {
    await Promise.all([loadLinks(path), loadGraph(path)]);
  };

  const handleAddLink = async () => {
    if (!entry) return;
    const targetPath = linkDraft.trim();
    if (!targetPath) {
      setLinksError('Enter a path to link (for example: people/lina-haidu).');
      return;
    }

    setIsLinkBusy(true);
    setLinksError(null);
    try {
      await api.entries.addLink(entry.path, targetPath);
      setLinkDraft('');
      await refreshLinksAndGraph(entry.path);
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : 'Failed to add link');
    } finally {
      setIsLinkBusy(false);
    }
  };

  const handleRemoveLink = async (targetPath: string, direction: 'outgoing' | 'incoming') => {
    if (!entry) return;
    const busyKey = `${direction}:${targetPath}`;
    setLinkBusyKey(busyKey);
    setLinksError(null);
    try {
      await api.entries.removeLink(entry.path, targetPath, { direction });
      await refreshLinksAndGraph(entry.path);
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : 'Failed to remove link');
    } finally {
      setLinkBusyKey(null);
    }
  };

  const startNotesEdit = () => {
    setNotesError(null);
    setNotesDraft(entry?.content ?? '');
    setIsEditingNotes(true);
  };

  const cancelNotesEdit = () => {
    setNotesError(null);
    setNotesDraft(entry?.content ?? '');
    setIsEditingNotes(false);
  };

  const confirmDiscardNotes = (): boolean => {
    if (!shouldPromptUnsavedNotes(isEditingNotes, entry?.content, notesDraft)) {
      return true;
    }
    return window.confirm('You have unsaved note changes. Discard them?');
  };

  const handleClose = async () => {
    if (isSavingNotes) return;
    if (!shouldPromptUnsavedNotes(isEditingNotes, entry?.content, notesDraft)) {
      onClose();
      return;
    }
    const shouldSave = window.confirm('You have unsaved note changes. Save them?');
    if (shouldSave) {
      await saveNotes();
      if (!hasNotesChanges(entry?.content, notesDraft)) {
        onClose();
      }
      return;
    }
    const discard = window.confirm('Discard unsaved note changes?');
    if (discard) {
      cancelNotesEdit();
      onClose();
    }
  };

  const saveNotes = async () => {
    if (!entry || isSavingNotes) return;
    if (!hasNotesChanges(entry.content, notesDraft)) {
      setIsEditingNotes(false);
      return;
    }
    setIsSavingNotes(true);
    setNotesError(null);
    try {
      const updated = await runMutationAndRefresh(
        () => api.entries.update(entry.path, { content: notesDraft }),
        refresh,
        () => setNotesError('Notes saved, but list refresh failed. Please refresh.')
      );
      setEntry(updated);
      setIsEditingNotes(false);
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to update notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const saveTaskSchedule = async () => {
    if (!entry || !isTaskCategory(entry.category)) return;
    const parsedDuration = Number(taskDurationDraft || '30');
    if (!Number.isFinite(parsedDuration) || parsedDuration < 5 || parsedDuration > 720) {
      setTaskScheduleError('Duration must be between 5 and 720 minutes.');
      return;
    }

    setIsSavingTaskSchedule(true);
    setTaskScheduleError(null);
    try {
      const duePayload = buildTaskDuePayload({
        date: taskDueDateDraft,
        time: taskDueTimeDraft,
        hasTime: taskDueTimeEnabled
      });
      const fixedPayload = buildTaskFixedPayload({
        date: taskFixedDateDraft,
        time: taskFixedTimeDraft,
        hasTime: taskFixedTimeEnabled
      });
      const updated = await runMutationAndRefresh(
        () => api.entries.update(entry.path, {
          duration_minutes: Math.floor(parsedDuration),
          ...duePayload,
          ...fixedPayload
        }),
        refresh,
        () => setTaskScheduleError('Schedule saved, but list refresh failed. Please refresh.')
      );
      setEntry(updated);
    } catch (err) {
      setTaskScheduleError(err instanceof Error ? err.message : 'Failed to update task schedule');
    } finally {
      setIsSavingTaskSchedule(false);
    }
  };

  const markTaskDone = async () => {
    if (!entry || !isTaskCategory(entry.category) || (entry.entry as any)?.status === 'done') return;
    setIsMarkingTaskDone(true);
    try {
      const updated = await runMutationAndRefresh(
        () => api.entries.update(entry.path, { status: 'done' }),
        refresh,
        () => setTaskScheduleError('Task marked done, but list refresh failed. Please refresh.')
      );
      setEntry(updated);
    } catch (err) {
      setTaskScheduleError(err instanceof Error ? err.message : 'Failed to mark task as done');
    } finally {
      setIsMarkingTaskDone(false);
    }
  };

  if (!entryPath) return null;

  const isTaskCategory = (category: string): boolean => category === 'task' || category === 'admin';

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'people':
        return <User className="h-5 w-5" />;
      case 'projects':
        return <Briefcase className="h-5 w-5" />;
      case 'ideas':
        return <Lightbulb className="h-5 w-5" />;
      case 'task':
      case 'admin':
        return <ClipboardList className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const formatFieldName = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const renderFieldValue = (key: string, value: unknown): React.ReactNode => {
    if (value === null || value === undefined) return '-';
    
    if (Array.isArray(value)) {
      if (value.length === 0) return '-';
      return (
        <ul className="list-disc list-inside">
          {value.map((item, i) => (
            <li key={i} className="text-sm">{String(item)}</li>
          ))}
        </ul>
      );
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    if (key.includes('date') || key.includes('_at')) {
      try {
        return new Date(String(value)).toLocaleDateString();
      } catch {
        return String(value);
      }
    }
    
    return String(value);
  };

  const hiddenFields = ['id', 'name', 'suggested_name', 'source_channel'];
  const taskScheduleFields = ['due_date', 'due_at', 'duration_minutes', 'fixed_at'];
  const metaFields = ['created_at', 'updated_at', 'confidence', 'total_focus_minutes', 'last_touched'];

  const getOverviewFieldEntries = (value: Record<string, unknown>) =>
    Object.entries(value).filter(
      ([key]) => !hiddenFields.includes(key) && !taskScheduleFields.includes(key) && !metaFields.includes(key)
    );

  const getMetaFieldEntries = (value: Record<string, unknown>) =>
    Object.entries(value).filter(([key]) => metaFields.includes(key));

  const formatDateTimeDisplay = (value: unknown): string => {
    if (typeof value !== 'string' || !value) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00`).toLocaleDateString();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  };

  const modalContent = (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {entry && getCategoryIcon(entry.category)}
            <h2 className="text-xl font-semibold">
              {String(entry?.entry?.name || entry?.entry?.suggested_name || 'Entry Details')}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" onClick={() => loadEntry(entryPath)} className="mt-4">
                Retry
              </Button>
            </div>
          )}

          {entry && !isLoading && !error && (
            <div className="space-y-6">
              {/* Category badge */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-muted rounded text-sm font-medium capitalize">
                  {isTaskCategory(entry.category) ? 'task' : entry.category}
                </span>
                <span className="text-sm text-muted-foreground">{entry.path}</span>
              </div>

              <div className="rounded-md border border-border p-1">
                {(['overview', 'schedule', 'links', 'meta'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`h-11 rounded px-3 text-sm font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {getOverviewFieldEntries(entry.entry as Record<string, unknown>).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <dt className="text-sm font-medium text-muted-foreground">{formatFieldName(key)}</dt>
                        <dd className="text-sm">{renderFieldValue(key, value)}</dd>
                      </div>
                    ))}
                    {getOverviewFieldEntries(entry.entry as Record<string, unknown>).length === 0 && (
                      <p className="text-sm text-muted-foreground">No overview fields available.</p>
                    )}
                  </div>

                  {isTaskCategory(entry.category) && (
                    <div className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                          Current schedule
                        </h3>
                        {(entry.entry as any)?.status !== 'done' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={markTaskDone}
                            disabled={isMarkingTaskDone}
                          >
                            {isMarkingTaskDone ? 'Marking...' : 'Mark done'}
                          </Button>
                        )}
                      </div>
                      <p className="text-sm">
                        Duration: {(entry.entry as any).duration_minutes ?? 30}m
                      </p>
                      <p className="text-sm">
                        Deadline: {formatTaskDeadline((entry.entry as any).due_date, (entry.entry as any).due_at)}
                      </p>
                      <p className="text-sm">
                        Fixed slot: {formatDateTimeDisplay((entry.entry as any).fixed_at)}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                        Notes
                      </h3>
                      <div className="flex items-center gap-1">
                        {!isEditingNotes && (
                          <button
                            type="button"
                            onClick={startNotesEdit}
                            className="h-8 w-8 rounded-md border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            aria-label="Edit notes"
                          >
                            <Pencil className="h-4 w-4 mx-auto" />
                          </button>
                        )}
                        {isEditingNotes && (
                          <>
                            <button
                              type="button"
                              onClick={saveNotes}
                              disabled={isSavingNotes || !hasNotesChanges(entry.content, notesDraft)}
                              className="h-8 w-8 rounded-md border border-transparent text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                              aria-label="Save notes"
                            >
                              {isSavingNotes ? (
                                <Loader2 className="h-4 w-4 mx-auto animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 mx-auto" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirmDiscardNotes()) {
                                  cancelNotesEdit();
                                }
                              }}
                              disabled={isSavingNotes}
                              className="h-8 w-8 rounded-md border border-transparent text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                              aria-label="Discard notes changes"
                            >
                              <X className="h-4 w-4 mx-auto" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {notesError && (
                      <p className="text-sm text-destructive">{notesError}</p>
                    )}

                    {isEditingNotes ? (
                      <textarea
                        ref={notesRef}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={notesDraft}
                        onChange={(event) => {
                          setNotesDraft(event.target.value);
                          resizeTextarea(event.currentTarget);
                        }}
                        placeholder="Add notes..."
                      />
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        {entry.content ? (
                          <p className="whitespace-pre-wrap">{entry.content}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">No notes yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'schedule' && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  {isTaskCategory(entry.category) ? (
                    <>
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                        Task schedule
                      </h3>
                      <label className="space-y-1 block">
                        <span className="text-xs text-muted-foreground">Duration (minutes)</span>
                        <input
                          type="number"
                          min={5}
                          max={720}
                          step={5}
                          className="h-11 w-full rounded-md border border-border bg-background px-3 text-base"
                          value={taskDurationDraft}
                          onChange={(event) => setTaskDurationDraft(event.target.value)}
                          disabled={isSavingTaskSchedule}
                        />
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Deadline date (optional)</span>
                          <input
                            type="date"
                            className="h-11 w-full rounded-md border border-border bg-background px-3 text-base"
                            value={taskDueDateDraft}
                            onChange={(event) => setTaskDueDateDraft(event.target.value)}
                            disabled={isSavingTaskSchedule}
                          />
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={taskDueTimeEnabled}
                              onChange={(event) => setTaskDueTimeEnabled(event.target.checked)}
                              disabled={isSavingTaskSchedule}
                            />
                            Set deadline time
                          </label>
                          {taskDueTimeEnabled && (
                            <input
                              type="time"
                              className="h-11 w-full rounded-md border border-border bg-background px-3 text-base"
                              value={taskDueTimeDraft}
                              onChange={(event) => setTaskDueTimeDraft(event.target.value)}
                              disabled={isSavingTaskSchedule}
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Fixed slot date (optional)</span>
                          <input
                            type="date"
                            className="h-11 w-full rounded-md border border-border bg-background px-3 text-base"
                            value={taskFixedDateDraft}
                            onChange={(event) => setTaskFixedDateDraft(event.target.value)}
                            disabled={isSavingTaskSchedule}
                          />
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={taskFixedTimeEnabled}
                              onChange={(event) => setTaskFixedTimeEnabled(event.target.checked)}
                              disabled={isSavingTaskSchedule}
                            />
                            Set fixed time
                          </label>
                          {taskFixedTimeEnabled && (
                            <input
                              type="time"
                              className="h-11 w-full rounded-md border border-border bg-background px-3 text-base"
                              value={taskFixedTimeDraft}
                              onChange={(event) => setTaskFixedTimeDraft(event.target.value)}
                              disabled={isSavingTaskSchedule}
                            />
                          )}
                        </div>
                      </div>
                      {taskScheduleError && (
                        <p className="text-sm text-destructive">{taskScheduleError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={saveTaskSchedule}
                          disabled={isSavingTaskSchedule}
                        >
                          {isSavingTaskSchedule ? 'Saving...' : 'Save schedule'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSavingTaskSchedule}
                          onClick={() => {
                            setTaskDueDateDraft('');
                            setTaskDueTimeDraft('');
                            setTaskDueTimeEnabled(false);
                            setTaskFixedDateDraft('');
                            setTaskFixedTimeDraft('');
                            setTaskFixedTimeEnabled(false);
                          }}
                        >
                          Clear schedule
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Schedule settings are available for tasks only.</p>
                  )}
                </div>
              )}

              {activeTab === 'links' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Linked items
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={linkDraft}
                        onChange={(event) => setLinkDraft(event.target.value)}
                        placeholder="Add link path (e.g. people/lina-haidu)"
                        className="h-11 flex-1 rounded-md border border-border bg-background px-3 text-base"
                        disabled={isLinkBusy || Boolean(linkBusyKey)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddLink}
                        disabled={isLinkBusy || Boolean(linkBusyKey)}
                      >
                        {isLinkBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        <span className="ml-1">Add</span>
                      </Button>
                    </div>
                    {links?.outgoing?.length ? (
                      <div className="mt-2 space-y-2">
                        {links.outgoing.map((link) => (
                          <div
                            key={link.path}
                            className="w-full rounded-md border border-border p-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                className="flex-1 text-left hover:bg-muted transition-colors rounded px-1 py-1"
                                onClick={() => onEntryClick?.(link.path)}
                              >
                                <div className="text-sm font-medium">{link.name}</div>
                                <div className="text-xs text-muted-foreground capitalize">
                                  {link.category}
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove link to ${link.name}`}
                                className="h-11 w-11 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                onClick={() => handleRemoveLink(link.path, 'outgoing')}
                                disabled={Boolean(linkBusyKey)}
                              >
                                {linkBusyKey === `outgoing:${link.path}` ? (
                                  <Loader2 className="h-4 w-4 mx-auto animate-spin" />
                                ) : (
                                  <X className="h-4 w-4 mx-auto" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">No linked items yet.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Backlinks
                    </h3>
                    {links?.incoming?.length ? (
                      <div className="mt-2 space-y-2">
                        {links.incoming.map((link) => (
                          <div
                            key={link.path}
                            className="w-full rounded-md border border-border p-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                className="flex-1 text-left hover:bg-muted transition-colors rounded px-1 py-1"
                                onClick={() => onEntryClick?.(link.path)}
                              >
                                <div className="text-sm font-medium">{link.name}</div>
                                <div className="text-xs text-muted-foreground capitalize">
                                  {link.category}
                                </div>
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove backlink from ${link.name}`}
                                className="h-11 w-11 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                onClick={() => handleRemoveLink(link.path, 'incoming')}
                                disabled={Boolean(linkBusyKey)}
                              >
                                {linkBusyKey === `incoming:${link.path}` ? (
                                  <Loader2 className="h-4 w-4 mx-auto animate-spin" />
                                ) : (
                                  <X className="h-4 w-4 mx-auto" />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">No backlinks yet.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                      Entity graph
                    </h3>
                    {graph ? (
                      <>
                        <p className="text-sm text-muted-foreground mt-2">
                          {graph.nodes.length - 1} connected item(s), {graph.edges.length} link(s)
                        </p>
                        <div className="mt-2 rounded-md border border-border p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Center</div>
                          <div className="text-sm font-medium mt-1">{graph.center.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{graph.center.category}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {graph.nodes
                              .filter((node) => node.path !== graph.center.path)
                              .map((node) => (
                                <button
                                  key={node.path}
                                  type="button"
                                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted transition-colors"
                                  onClick={() => onEntryClick?.(node.path)}
                                >
                                  {node.name}
                                </button>
                              ))}
                            {graph.nodes.length <= 1 && (
                              <span className="text-sm text-muted-foreground">No connected items yet.</span>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">No graph data available yet.</p>
                    )}
                  </div>

                  {linksError && (
                    <div className="text-sm text-destructive">{linksError}</div>
                  )}
                  {graphError && (
                    <div className="text-sm text-destructive">{graphError}</div>
                  )}
                </div>
              )}

              {activeTab === 'meta' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <dt className="text-sm font-medium text-muted-foreground">Path</dt>
                    <dd className="text-sm">{entry.path}</dd>
                  </div>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {getMetaFieldEntries(entry.entry as Record<string, unknown>).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <dt className="text-sm font-medium text-muted-foreground">{formatFieldName(key)}</dt>
                        <dd className="text-sm">{renderFieldValue(key, value)}</dd>
                      </div>
                    ))}
                    {getMetaFieldEntries(entry.entry as Record<string, unknown>).length === 0 && (
                      <p className="text-sm text-muted-foreground">No metadata fields available.</p>
                    )}
                  </dl>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-end gap-2">
            {entry && isTaskCategory(entry.category) && (entry.entry as any)?.status !== 'done' && (
              <Button
                variant="outline"
                onClick={markTaskDone}
                disabled={isMarkingTaskDone}
              >
                {isMarkingTaskDone ? 'Marking...' : 'Mark done'}
              </Button>
            )}
            {entry && isTaskCategory(entry.category) && (entry.entry as any)?.status !== 'done' && onStartFocus && (
              <Button
                onClick={() => {
                  onStartFocus(entry);
                  handleClose();
                }}
              >
                Focus now
              </Button>
            )}
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
