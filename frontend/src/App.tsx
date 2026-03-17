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
import { ProfileModal } from '@/components/ProfileModal';
import { api, EntryWithPath } from '@/services/api';
import { EntriesProvider } from '@/state/entries';
import { APP_SHELL_CLASSES, getMobileNavButtonClass } from '@/components/layout-shell-helpers';

function App() {
  const [authToken, setAuthToken] = useState<string>(() =>
    localStorage.getItem('justdo-auth-token') || ''
  );
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('token') ? 'reset' : 'login';
  });
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [resetToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [oauthConsent] = useState(() => {
    if (window.location.pathname !== '/oauth-consent') return null;
    const p = new URLSearchParams(window.location.search);
    const client_id = p.get('client_id');
    const redirect_uri = p.get('redirect_uri');
    const code_challenge = p.get('code_challenge');
    if (!client_id || !redirect_uri || !code_challenge) return null;
    return {
      client_id,
      client_name: p.get('client_name') || client_id,
      redirect_uri,
      code_challenge,
      state: p.get('state') || undefined,
      scope: p.get('scope') || undefined,
    };
  });
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [selectedEntryPath, setSelectedEntryPath] = useState<string | null>(null);
  const [focusEntry, setFocusEntry] = useState<EntryWithPath | null>(null);
  const [focusInitialMinutes, setFocusInitialMinutes] = useState<number | undefined>(undefined);
  const [mobilePanel, setMobilePanel] = useState<'focus' | 'chat'>('focus');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

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
      setUserName(user.name ?? '');
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
    if (authMode === 'forgot') {
      if (!authEmail) { setAuthError('Email is required.'); return; }
      setAuthBusy(true); setAuthError(null); setAuthSuccess(null);
      try {
        await api.auth.forgotPassword({ email: authEmail });
        setAuthSuccess('If an account with that email exists, a reset link has been sent. Check your inbox.');
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Failed to send reset email.');
      } finally { setAuthBusy(false); }
      return;
    }

    if (authMode === 'reset') {
      if (!authPassword || authPassword.length < 8) { setAuthError('Password must be at least 8 characters.'); return; }
      if (authPassword !== authConfirmPassword) { setAuthError('Passwords do not match.'); return; }
      setAuthBusy(true); setAuthError(null); setAuthSuccess(null);
      try {
        await api.auth.resetPassword({ token: resetToken, password: authPassword });
        setAuthSuccess('Password has been reset. You can now sign in.');
        window.history.replaceState({}, '', '/');
        setTimeout(() => { setAuthMode('login'); setAuthSuccess(null); }, 2000);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Failed to reset password.');
      } finally { setAuthBusy(false); }
      return;
    }

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
    setAuthSuccess(null);
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

  const handleOAuthConsent = async () => {
    if (!oauthConsent) return;
    setConsentBusy(true);
    setConsentError(null);
    try {
      const result = await api.auth.oauthConsent(oauthConsent);
      window.location.href = result.redirect_url;
    } catch (err) {
      setConsentError(err instanceof Error ? err.message : 'Authorization failed.');
      setConsentBusy(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('justdo-auth-token');
    api.setAuthToken('');
    setAuthToken('');
    setIsAuthenticated(false);
    setUserEmail('');
    setUserName('');
  };

  // Deep-link: open entry from ?open= query param (e.g. calendar quick-action)
  useEffect(() => {
    if (!isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const openPath = params.get('open');
    if (openPath) {
      setSelectedEntryPath(openPath);
      params.delete('open');
      const clean = params.toString();
      window.history.replaceState({}, '', clean ? `?${clean}` : window.location.pathname);
    }
  }, [isAuthenticated]);

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
                <UserSettingsMenu userEmail={userEmail} onLogout={handleLogout} onOpenProfile={() => setProfileOpen(true)} />
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
        {isAuthenticated && oauthConsent ? (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Authorize Access</CardTitle>
              <CardDescription>An AI agent wants to connect to your Second Brain.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-md border p-4 bg-muted/30">
                  <p className="text-sm">
                    <span className="font-semibold text-foreground">{oauthConsent.client_name}</span>
                    {' '}is requesting access to your Second Brain. This will allow the agent to read and write entries, search your knowledge base, and store memories.
                  </p>
                </div>
                {consentError && <p className="text-sm text-destructive">{consentError}</p>}
                <div className="flex gap-2">
                  <Button onClick={handleOAuthConsent} className="flex-1" disabled={consentBusy}>
                    {consentBusy ? 'Authorizing...' : 'Approve'}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => window.close()} disabled={consentBusy}>
                    Deny
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : !isAuthenticated ? (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Welcome to JustDo.so</CardTitle>
              <CardDescription>
                {oauthConsent ? 'Sign in to authorize agent access' :
                  authMode === 'login' ? 'Sign in to continue' :
                  authMode === 'register' ? 'Create your account' :
                  authMode === 'forgot' ? 'Reset your password' :
                  'Set a new password'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(authMode === 'login' || authMode === 'register' || authMode === 'forgot') && (
                  <div>
                    <Input
                      type="email"
                      placeholder="Email"
                      autoComplete="email"
                      value={authEmail}
                      onChange={(e) => { setAuthEmail(e.target.value); setAuthError(null); setAuthSuccess(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                    />
                  </div>
                )}
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
                {(authMode === 'login' || authMode === 'register') && (
                  <div>
                    <Input
                      type="password"
                      placeholder="Password"
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      value={authPassword}
                      onChange={(e) => { setAuthPassword(e.target.value); setAuthError(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                    />
                  </div>
                )}
                {authMode === 'reset' && (
                  <>
                    <div>
                      <Input
                        type="password"
                        placeholder="New password (min. 8 characters)"
                        autoComplete="new-password"
                        value={authPassword}
                        onChange={(e) => { setAuthPassword(e.target.value); setAuthError(null); }}
                      />
                    </div>
                    <div>
                      <Input
                        type="password"
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        value={authConfirmPassword}
                        onChange={(e) => { setAuthConfirmPassword(e.target.value); setAuthError(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                      />
                    </div>
                  </>
                )}
                {authError && <p className="text-sm text-destructive">{authError}</p>}
                {authSuccess && <p className="text-sm text-green-600 dark:text-green-400">{authSuccess}</p>}
                <Button onClick={handleAuthSubmit} className="w-full" disabled={authBusy}>
                  {authBusy ? 'Please wait…'
                    : authMode === 'login' ? 'Sign in'
                    : authMode === 'register' ? 'Create account'
                    : authMode === 'forgot' ? 'Send reset link'
                    : 'Reset password'}
                </Button>
                <div className="text-sm text-muted-foreground text-center space-y-1">
                  {authMode === 'login' && (
                    <>
                      <div>
                        <Button type="button" variant="link" className="px-1 text-xs" onClick={() => { setAuthMode('forgot'); setAuthError(null); setAuthSuccess(null); }}>
                          Forgot password?
                        </Button>
                      </div>
                      <div>
                        Need an account?{' '}
                        <Button type="button" variant="link" className="px-1" onClick={() => { setAuthMode('register'); setAuthError(null); }}>
                          Register
                        </Button>
                      </div>
                    </>
                  )}
                  {authMode === 'register' && (
                    <div>
                      Already have an account?{' '}
                      <Button type="button" variant="link" className="px-1" onClick={() => { setAuthMode('login'); setAuthError(null); }}>
                        Sign in
                      </Button>
                    </div>
                  )}
                  {(authMode === 'forgot' || authMode === 'reset') && (
                    <div>
                      <Button type="button" variant="link" className="px-1" onClick={() => { setAuthMode('login'); setAuthError(null); setAuthSuccess(null); }}>
                        Back to sign in
                      </Button>
                    </div>
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
            <ProfileModal
              open={profileOpen}
              userEmail={userEmail}
              userName={userName}
              onClose={() => setProfileOpen(false)}
              onProfileUpdate={(user) => {
                setUserEmail(user.email);
                setUserName(user.name);
              }}
              onLogout={handleLogout}
            />
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
