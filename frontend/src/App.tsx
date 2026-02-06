import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brain, Search, Target, MessageSquare } from 'lucide-react';
import { ChatUI } from '@/components/chat';
import { EntryModal } from '@/components/EntryModal';
import { DeepFocusView } from '@/components/DeepFocusView';
import { SearchPanel } from '@/components/SearchPanel';
import { FocusPanel } from '@/components/FocusPanel';
import { api, EntryWithPath } from '@/services/api';
import { EntriesProvider } from '@/state/entries';

function App() {
  const [authToken, setAuthToken] = useState<string>(() =>
    localStorage.getItem('second-brain-auth-token') || ''
  );
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);
  const [focusEntry, setFocusEntry] = useState<EntryWithPath | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'focus' | 'chat'>('focus');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Check authentication when token changes
  useEffect(() => {
    if (!authToken) {
      api.setAuthToken('');
      setIsAuthenticated(false);
      return;
    }

    api.setAuthToken(authToken);
    checkSession();
  }, [authToken]);

  const checkSession = async () => {
    try {
      await api.auth.me();
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (err) {
      setIsAuthenticated(false);
      localStorage.removeItem('second-brain-auth-token');
      setAuthToken('');
      setAuthError('Session expired. Please sign in again.');
    }
  };

  const handleAuthSubmit = async () => {
    if (!authEmail || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }
    if (authMode === 'register' && authPassword.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = authMode === 'login'
        ? await api.auth.login({ email: authEmail, password: authPassword })
        : await api.auth.register({ email: authEmail, password: authPassword, name: authName || undefined });

      localStorage.setItem('second-brain-auth-token', response.token);
      api.setAuthToken(response.token);
      setAuthToken(response.token);
      setIsAuthenticated(true);
    } catch (err) {
      setIsAuthenticated(false);
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEntryClick = (path: string) => {
    setSelectedEntryPath(path);
    setMobileSearchOpen(false);
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
        <div className="w-full px-3 py-2 sm:px-4 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-3 flex-nowrap">
            <div className="flex items-center gap-2 min-w-0 max-w-[60%] sm:max-w-none">
              <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              <h1 className="text-base sm:text-2xl font-bold whitespace-nowrap truncate leading-none">
                Second Brain
              </h1>
            </div>
            {isAuthenticated && (
              <div className="flex items-center gap-2 w-full justify-end min-w-0">
                <div className="hidden lg:flex min-w-[360px] max-w-[520px] w-full justify-end">
                  <SearchPanel onEntryClick={handleEntryClick} variant="header" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="lg:hidden shrink-0"
                  onClick={() => setMobileSearchOpen((prev) => !prev)}
                >
                  <Search className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>
          {isAuthenticated && mobileSearchOpen && (
            <div className="mt-2 lg:hidden">
              <SearchPanel onEntryClick={handleEntryClick} variant="header" />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-2 py-3 sm:px-4 sm:py-6 flex-1 min-h-0 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-6">
        {!isAuthenticated ? (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Welcome to Second Brain</CardTitle>
              <CardDescription>
                {authMode === 'login'
                  ? 'Sign in to continue'
                  : 'Create your account'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Input
                    type="email"
                    placeholder="Email"
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>
                {authMode === 'register' && (
                  <div>
                    <Input
                      type="text"
                      placeholder="Name (optional)"
                      autoComplete="name"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <Input
                    type="password"
                    placeholder="Password"
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                  {authError && (
                    <p className="text-sm text-destructive mt-2">{authError}</p>
                  )}
                </div>
                <Button onClick={handleAuthSubmit} className="w-full" disabled={authBusy}>
                  {authBusy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
                </Button>
                <div className="text-sm text-muted-foreground text-center">
                  {authMode === 'login' ? (
                    <>
                      Need an account?{' '}
                      <Button
                        type="button"
                        variant="link"
                        className="px-1"
                        onClick={() => setAuthMode('register')}
                      >
                        Register
                      </Button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <Button
                        type="button"
                        variant="link"
                        className="px-1"
                        onClick={() => setAuthMode('login')}
                      >
                        Sign in
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EntriesProvider enabled={isAuthenticated}>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-3 sm:gap-6 h-full min-h-0">
              <div className="hidden lg:flex flex-col min-h-0">
                <ChatUI onEntryClick={handleEntryClick} className="h-full" />
              </div>

              <div className="hidden lg:flex flex-col gap-4 min-h-0 lg:overflow-y-auto">
                <FocusPanel onEntryClick={handleEntryClick} />
              </div>

              <div className="flex lg:hidden flex-col min-h-0">
                {mobilePanel === 'chat' ? (
                  <ChatUI onEntryClick={handleEntryClick} className="h-full" />
                ) : (
                  <FocusPanel onEntryClick={handleEntryClick} />
                )}
              </div>
            </div>

            {/* Entry Modal */}
            <EntryModal 
              entryPath={selectedEntryPath} 
              onClose={handleCloseModal} 
              onStartFocus={handleStartFocus}
              onEntryClick={handleEntryClick}
            />
            <DeepFocusView entry={focusEntry} onClose={handleCloseFocus} />
          </EntriesProvider>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        {isAuthenticated && (
          <div className="fixed bottom-0 left-0 right-0 lg:hidden border-t bg-background/95 backdrop-blur">
            <div className="flex items-center justify-around gap-2 px-2 pt-1 pb-[calc(6px+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setMobilePanel('focus')}
                className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 text-xs ${
                  mobilePanel === 'focus' ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <Target className="h-5 w-5" />
                Focus
              </button>
              <button
                type="button"
                onClick={() => setMobilePanel('chat')}
                className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 text-xs ${
                  mobilePanel === 'chat' ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <MessageSquare className="h-5 w-5" />
                Chat
              </button>
            </div>
          </div>
        )}
        <div className="hidden lg:block w-full px-4 py-1 text-center text-[10px] text-muted-foreground leading-none">
          Second Brain
        </div>
      </footer>
    </div>
  );
}

export default App;
