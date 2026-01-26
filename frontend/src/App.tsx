import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brain, CheckCircle, AlertCircle } from 'lucide-react';
import { ChatUI } from '@/components/chat';
import { EntryModal } from '@/components/EntryModal';
import { RecentEntries } from '@/components/RecentEntries';
import { api } from '@/services/api';

interface HealthStatus {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

function App() {
  const [apiKey, setApiKey] = useState<string>(() => 
    localStorage.getItem('second-brain-api-key') || ''
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);

  // Check health on mount and try to get API key from server
  useEffect(() => {
    checkHealth();
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

  const checkHealth = async () => {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        const data = await response.json();
        setHealthStatus(data);
      }
    } catch (err) {
      console.error('Health check failed:', err);
    }
  };

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Second Brain</h1>
          </div>
          <div className="flex items-center gap-2">
            {healthStatus && (
              <span className="text-sm text-muted-foreground">
                v{healthStatus.version}
              </span>
            )}
            {isAuthenticated ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chat UI - Main area */}
            <div className="lg:col-span-2">
              <ChatUI onEntryClick={handleEntryClick} />
            </div>

            {/* Sidebar - Recent entries */}
            <div className="space-y-6">
              <RecentEntries onEntryClick={handleEntryClick} />
              
              {/* Category cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-lg font-bold">People</div>
                    <p className="text-xs text-muted-foreground">Contacts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-lg font-bold">Projects</div>
                    <p className="text-xs text-muted-foreground">Active work</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-lg font-bold">Ideas</div>
                    <p className="text-xs text-muted-foreground">Future</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-lg font-bold">Admin</div>
                    <p className="text-xs text-muted-foreground">Tasks</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Entry Modal */}
        <EntryModal 
          entryPath={selectedEntryPath} 
          onClose={handleCloseModal} 
        />
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
          Second Brain v0.1.0 - Your AI-powered knowledge management system
        </div>
      </footer>
    </div>
  );
}

export default App;
