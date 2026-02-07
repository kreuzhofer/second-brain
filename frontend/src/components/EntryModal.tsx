/**
 * EntryModal Component
 * Displays entry details in a modal using createPortal.
 * 
 * Requirements 11.1, 11.2, 11.3, 11.4
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api, EntryWithPath, EntryLinksResponse, EntryGraphResponse } from '@/services/api';
import { X, Loader2, FileText, User, Briefcase, Lightbulb, ClipboardList, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hasNotesChanges, resizeTextarea, shouldPromptUnsavedNotes } from '@/components/entry-modal-helpers';

interface EntryModalProps {
  entryPath: string | null;
  onClose: () => void;
  onStartFocus?: (entry: EntryWithPath) => void;
  onEntryClick?: (path: string) => void;
}

export function EntryModal({ entryPath, onClose, onStartFocus, onEntryClick }: EntryModalProps) {
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
      setIsEditingNotes(false);
      setNotesError(null);
    }
  }, [entryPath]);

  useEffect(() => {
    if (!entry || isEditingNotes) return;
    setNotesDraft(entry.content ?? '');
  }, [entry?.path, entry?.content, entry, isEditingNotes]);

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
      const updated = await api.entries.update(entry.path, { content: notesDraft });
      setEntry(updated);
      setIsEditingNotes(false);
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to update notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  if (!entryPath) return null;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'people':
        return <User className="h-5 w-5" />;
      case 'projects':
        return <Briefcase className="h-5 w-5" />;
      case 'ideas':
        return <Lightbulb className="h-5 w-5" />;
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

  // Fields to exclude from display
  const excludedFields = ['id', 'source_channel'];

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
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
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
                  {entry.category}
                </span>
                <span className="text-sm text-muted-foreground">{entry.path}</span>
              </div>

              {/* Frontmatter fields */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Details
                </h3>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(entry.entry)
                    .filter(([key]) => !excludedFields.includes(key))
                    .map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <dt className="text-sm font-medium text-muted-foreground">
                          {formatFieldName(key)}
                        </dt>
                        <dd className="text-sm">
                          {renderFieldValue(key, value)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>

              {/* Links section */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Linked items
                  </h3>
                  {links?.outgoing?.length ? (
                    <div className="mt-2 space-y-2">
                      {links.outgoing.map((link) => (
                        <button
                          key={link.path}
                          type="button"
                          className="w-full text-left rounded-md border border-border p-2 hover:bg-muted transition-colors"
                          onClick={() => onEntryClick?.(link.path)}
                        >
                          <div className="text-sm font-medium">{link.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {link.category}
                          </div>
                        </button>
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
                        <button
                          key={link.path}
                          type="button"
                          className="w-full text-left rounded-md border border-border p-2 hover:bg-muted transition-colors"
                          onClick={() => onEntryClick?.(link.path)}
                        >
                          <div className="text-sm font-medium">{link.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {link.category}
                          </div>
                        </button>
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
              </div>

              {linksError && (
                <div className="text-sm text-destructive">
                  {linksError}
                </div>
              )}
              {graphError && (
                <div className="text-sm text-destructive">
                  {graphError}
                </div>
              )}

              {/* Content section */}
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-end gap-2">
            {entry?.category === 'admin' && (entry.entry as any)?.status !== 'done' && onStartFocus && (
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
