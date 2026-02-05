import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brain } from 'lucide-react';
import { ChatUI } from '@/components/chat';
import { EntryModal } from '@/components/EntryModal';
import { DeepFocusView } from '@/components/DeepFocusView';
import { SearchPanel } from '@/components/SearchPanel';
import { FocusPanel } from '@/components/FocusPanel';
import { api, EntryWithPath } from '@/services/api';
import { EntriesProvider } from '@/state/entries';

function App() {
  const [apiKey, setApiKey] = useState<string>(() => 
    localStorage.getItem('second-brain-api-key') || ''
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);
  const [focusEntry, setFocusEntry] = useState<EntryWithPath | null>(null);

  // Check health on mount and try to get API key from server
  useEffect(() => {
    // Try to fetch the API key from the server (for local dev convenience)
    fetchApiKey();
  }, []);

  const fetchApiKey = async () => {
    try {
      const response = await fetch('/api/auth/key');
      if (response.ok) {
        const data = await response.json();
        if (data.key) {
          setApiKey(data.key);
        }
      }
    } catch {
      // Server doesn't expose key, that's fine - user will enter manually
    }
  };

  // Check authentication when API key changes
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('second-brain-api-key', apiKey);
      api.setAuthToken(apiKey);
      checkAuth();
    } else {
      setIsAuthenticated(false);
    }
  }, [apiKey]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/entries', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      setIsAuthenticated(response.ok);
      if (!response.ok) {
        setError('Invalid API key');
      } else {
        setError(null);
      }
    } catch (err) {
      setIsAuthenticated(false);
      setError('Failed to connect to API');
    }
  };

  const handleEntryClick = (path: string) => {
    setSelectedEntryPath(path);
  };

  const handleCloseModal = () => {
    setSelectedEntryPath(null);
  };

  const handleStartFocus = (entry: EntryWithPath) => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined);
      }
    }
    setFocusEntry(entry);
  };

  const handleCloseFocus = () => {
    setFocusEntry(null);
  };

  return (
    <div className="min-h-screen h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">Second Brain</h1>
            </div>
            {isAuthenticated && (
              <div className="min-w-[360px] max-w-[520px] w-full flex justify-end">
                <SearchPanel onEntryClick={handleEntryClick} variant="header" />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 py-6 flex-1 min-h-0">
        {!isAuthenticated ? (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Welcome to Second Brain</CardTitle>
              <CardDescription>
                Enter your API key to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Input
                    type="password"
                    placeholder="Enter your API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  {error && (
                    <p className="text-sm text-destructive mt-2">{error}</p>
                  )}
                </div>
                <Button onClick={checkAuth} className="w-full">
                  Connect
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EntriesProvider enabled={isAuthenticated}>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-6 h-full min-h-0">
              <div className="flex flex-col min-h-0">
                <ChatUI onEntryClick={handleEntryClick} className="h-full" />
              </div>

              <div className="flex flex-col gap-4 min-h-0 lg:overflow-y-auto">
                <FocusPanel onEntryClick={handleEntryClick} />
              </div>
            </div>

            {/* Entry Modal */}
            <EntryModal 
              entryPath={selectedEntryPath} 
              onClose={handleCloseModal} 
              onStartFocus={handleStartFocus}
            />
            <DeepFocusView entry={focusEntry} onClose={handleCloseFocus} />
          </EntriesProvider>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="w-full px-4 py-1 text-center text-[10px] text-muted-foreground leading-none">
          Second Brain v0.1.0 - Your AI-powered knowledge management system
        </div>
      </footer>
    </div>
  );
}

export default App;
