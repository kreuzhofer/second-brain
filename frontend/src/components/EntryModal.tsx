/**
 * EntryModal Component
 * Displays entry details in a modal using createPortal.
 * 
 * Requirements 11.1, 11.2, 11.3, 11.4
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api, EntryWithPath } from '@/services/api';
import { X, Loader2, FileText, User, Briefcase, Lightbulb, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EntryModalProps {
  entryPath: string | null;
  onClose: () => void;
}

export function EntryModal({ entryPath, onClose }: EntryModalProps) {
  const [entry, setEntry] = useState<EntryWithPath | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entryPath) {
      loadEntry(entryPath);
    } else {
      setEntry(null);
    }
  }, [entryPath]);

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
        if (e.target === e.currentTarget) onClose();
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

              {/* Content section */}
              {entry.content && (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Notes
                  </h3>
                  <div className="prose prose-sm max-w-none">
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
