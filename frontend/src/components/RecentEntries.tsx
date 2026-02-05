/**
 * RecentEntries Component
 * Displays a list of recent entries with name, category, and creation time.
 * 
 * Requirements 10.3, 10.4
 */

import { useMemo, useState } from 'react';
import { EntrySummary } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, User, Briefcase, Lightbulb, ClipboardList, Inbox, RefreshCw } from 'lucide-react';
import { useEntries } from '@/state/entries';

interface RecentEntriesProps {
  onEntryClick: (path: string) => void;
  limit?: number;
}

export function RecentEntries({ onEntryClick, limit = 6 }: RecentEntriesProps) {
  const { entries, isLoading, error, refresh } = useEntries();
  const [expanded, setExpanded] = useState(false);
  const sortedEntries = useMemo<EntrySummary[]>(() => {
    return [...entries].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [entries]);

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">Recent Entries</CardTitle>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={refresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && sortedEntries.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh} className="mt-2">
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && sortedEntries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No entries yet. Start chatting to create some!
          </p>
        )}

        {sortedEntries.length > 0 && (
          <>
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(expanded ? sortedEntries : sortedEntries.slice(0, limit)).map((entry) => (
              <li key={entry.path}>
                <button
                  onClick={() => onEntryClick(entry.path)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
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
            {sortedEntries.length > limit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2"
                onClick={() => setExpanded((prev) => !prev)}
              >
                {expanded ? 'Show less' : `Show all (${sortedEntries.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
