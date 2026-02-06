import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, Category, SearchHit } from '@/services/api';
import { Search, Loader2 } from 'lucide-react';

interface SearchPanelProps {
  onEntryClick: (path: string) => void;
  variant?: 'panel' | 'header';
}

const CATEGORY_OPTIONS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'People' },
  { value: 'projects', label: 'Projects' },
  { value: 'ideas', label: 'Ideas' },
  { value: 'admin', label: 'Admin' },
  { value: 'inbox', label: 'Inbox' }
];

export function SearchPanel({ onEntryClick, variant = 'panel' }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      setError('Enter a search query');
      setHasSearched(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const response = await api.search.query(query.trim(), category === 'all' ? undefined : category, 25);
      setResults(response.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const renderSnippet = (snippet: string, ranges?: Array<{ start: number; end: number }>) => {
    if (!ranges || ranges.length === 0) {
      return <span>{snippet}</span>;
    }

    const parts: Array<{ text: string; highlight: boolean }> = [];
    let cursor = 0;
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    for (const range of sorted) {
      if (range.start > cursor) {
        parts.push({ text: snippet.slice(cursor, range.start), highlight: false });
      }
      parts.push({ text: snippet.slice(range.start, range.end), highlight: true });
      cursor = range.end;
    }
    if (cursor < snippet.length) {
      parts.push({ text: snippet.slice(cursor), highlight: false });
    }

    return (
      <span>
        {parts.map((part, index) =>
          part.highlight ? (
            <mark key={`${index}-${part.text}`} className="bg-yellow-200 text-foreground px-0.5 rounded">
              {part.text}
            </mark>
          ) : (
            <span key={`${index}-${part.text}`}>{part.text}</span>
          )
        )}
      </span>
    );
  };

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-[220px]">
        <Input
          placeholder="Search your second brain..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleSearch();
            }
          }}
          className={variant === 'header' ? 'h-11 sm:h-9' : undefined}
        />
      </div>
      <select
        className="h-11 rounded-md border border-input bg-background px-3 text-base sm:h-9 sm:text-sm"
        value={category}
        onChange={(event) => setCategory(event.target.value as Category | 'all')}
      >
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button onClick={handleSearch} disabled={isLoading} className="h-11 sm:h-9">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </Button>
    </div>
  );

  const resultsBlock = (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {hasSearched && results.length === 0 && !isLoading && !error && (
        <p className="text-sm text-muted-foreground">No results yet. Try a keyword or phrase.</p>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <button
              key={result.path}
              type="button"
              onClick={() => onEntryClick(result.path)}
              className="w-full text-left rounded-md border border-border p-3 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{result.name}</div>
                <span className="text-xs text-muted-foreground uppercase">{result.category}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {renderSnippet(result.snippet, result.highlightRanges)}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  if (variant === 'header') {
    return (
      <div className="space-y-2">
        {controls}
        {hasSearched && (
          <div className="rounded-md border border-border bg-background p-3 shadow-sm space-y-3">
            {resultsBlock}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">Search</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {controls}
        {resultsBlock}
      </CardContent>
    </Card>
  );
}
