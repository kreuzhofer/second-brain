import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Target, MessageSquare } from 'lucide-react';
import { ChatUI } from '@/components/chat';
import { EntryModal } from '@/components/EntryModal';
import { DeepFocusView } from '@/components/DeepFocusView';
import { SearchPanel } from '@/components/SearchPanel';
import { FocusPanel } from '@/components/FocusPanel';
import { UserSettingsMenu } from '@/components/UserSettingsMenu';
import { api, EntryWithPath } from '@/services/api';
import { EntriesProvider } from '@/state/entries';
import { APP_SHELL_CLASSES, getMobileNavButtonClass } from '@/components/layout-shell-helpers';

function App() {
  const [authToken, setAuthToken] = useState<string>(() =>
    localStorage.getItem('justdo-auth-token') || ''
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
  const [focusInitialMinutes, setFocusInitialMinutes] = useState<number | undefined>(undefined);
  const [mobilePanel, setMobilePanel] = useState<'focus' | 'chat'>('focus');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');

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
      const user = await api.auth.me();
      setIsAuthenticated(true);
      setUserEmail(user.email);
      setAuthError(null);
    } catch (err) {
      setIsAuthenticated(false);
      setUserEmail('');
      localStorage.removeItem('justdo-auth-token');
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

      localStorage.setItem('justdo-auth-token', response.token);
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

  const handleLogout = () => {
    localStorage.removeItem('justdo-auth-token');
    api.setAuthToken('');
    setAuthToken('');
    setIsAuthenticated(false);
    setUserEmail('');
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
    setFocusInitialMinutes(undefined);
    setFocusEntry(entry);
  };

  const handleStartFocusFromPath = async (entryPath: string, durationMinutes: number) => {
    const entry = await api.entries.get(entryPath);
    setFocusInitialMinutes(durationMinutes);
    setFocusEntry(entry);
  };

  const handleCloseFocus = () => {
    setFocusEntry(null);
    setFocusInitialMinutes(undefined);
  };

  return (
    <div className={APP_SHELL_CLASSES.appRoot}>
      {/* Header */}
      <header className={APP_SHELL_CLASSES.header}>
        <div className={APP_SHELL_CLASSES.headerInner}>
          <div className={APP_SHELL_CLASSES.headerRow}>
            <div className={APP_SHELL_CLASSES.brandWrap}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6 sm:h-8 sm:w-8 shrink-0">
                <path d="M13 1L5 14h6l-2 9 10-14h-6z" fill="#4f46e5" />
              </svg>
              <h1 className={APP_SHELL_CLASSES.brandTitle}>
                JustDo.so
              </h1>
            </div>
            {isAuthenticated && (
              <div className={APP_SHELL_CLASSES.headerSearchWrap}>
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
                <UserSettingsMenu userEmail={userEmail} onLogout={handleLogout} />
              </div>
            )}
          </div>
          {isAuthenticated && mobileSearchOpen && (
            <div className={APP_SHELL_CLASSES.mobileSearchPanelWrap}>
              <SearchPanel onEntryClick={handleEntryClick} variant="header" />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={APP_SHELL_CLASSES.main}>
        {!isAuthenticated ? (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Welcome to JustDo.so</CardTitle>
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
            <div className={APP_SHELL_CLASSES.contentGrid}>
              <div className={APP_SHELL_CLASSES.chatColumn}>
                <ChatUI
                  onEntryClick={handleEntryClick}
                  onStartFocus={handleStartFocusFromPath}
                  className="h-full"
                />
              </div>

              <div className={APP_SHELL_CLASSES.desktopFocusColumn}>
                <FocusPanel onEntryClick={handleEntryClick} />
              </div>

              <div className="flex lg:hidden flex-col min-h-0">
                {mobilePanel === 'chat' ? (
                  <ChatUI
                    onEntryClick={handleEntryClick}
                    onStartFocus={handleStartFocusFromPath}
                    className="h-full"
                  />
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
            <DeepFocusView entry={focusEntry} onClose={handleCloseFocus} initialMinutes={focusInitialMinutes} />
          </EntriesProvider>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        {isAuthenticated && (
          <div className={APP_SHELL_CLASSES.bottomNav}>
            <div className={APP_SHELL_CLASSES.bottomNavInner}>
              <button
                type="button"
                onClick={() => setMobilePanel('focus')}
                className={getMobileNavButtonClass(mobilePanel === 'focus')}
              >
                <Target className="h-5 w-5" />
                Focus
              </button>
              <button
                type="button"
                onClick={() => setMobilePanel('chat')}
                className={getMobileNavButtonClass(mobilePanel === 'chat')}
              >
                <MessageSquare className="h-5 w-5" />
                Chat
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
