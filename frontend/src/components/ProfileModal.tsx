/**
 * ProfileModal Component
 * Portal-based modal for user profile management (name, email, password).
 * Follows the EntryModal pattern: createPortal, backdrop click, Escape key.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, User, KeyRound, Shield, Copy, Check, Mail, Download, Send, Bot, ChevronDown, ChevronRight, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, AgentApiKey, AgentApiKeyCreateResponse, OAuthConnection } from '@/services/api';
import { cn } from '@/lib/utils';

interface ProfileModalProps {
  open: boolean;
  userEmail: string;
  userName: string;
  onClose: () => void;
  onProfileUpdate: (user: { email: string; name: string }) => void;
  onLogout?: () => void;
}

type Tab = 'profile' | 'password' | 'account' | 'apikeys' | 'connections' | 'prompts';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
  { key: 'password', label: 'Password', icon: <KeyRound className="h-4 w-4" /> },
  { key: 'account', label: 'Account', icon: <Shield className="h-4 w-4" /> },
  { key: 'apikeys', label: 'API Keys', icon: <Bot className="h-4 w-4" /> },
  { key: 'connections', label: 'Connections', icon: <Link className="h-4 w-4" /> },
  { key: 'prompts', label: 'Prompts', icon: <Copy className="h-4 w-4" /> },
];

const EXTRACTION_PROMPTS: { title: string; description: string; prompt: string }[] = [
  {
    title: 'Extract knowledge from this conversation',
    description: 'Saves key facts, people, projects, and ideas from the current chat into your JustDo.so.',
    prompt: `Review our entire conversation so far. Extract and store every piece of important information using the store_memory tool. For each item, choose the best memory_type:
- "fact" for things about me (preferences, background, skills, opinions)
- "relationship" for people I mentioned and my connection to them
- "context" for project details, work situations, or ongoing topics
- "feedback" for corrections or preferences I expressed about how you should behave

Use descriptive titles. Include enough detail in the content that the memory is useful on its own. Don't store trivial or redundant information.`,
  },
  {
    title: 'Import a pasted conversation',
    description: 'Paste an old chat below this prompt and the AI will extract everything into your JustDo.so.',
    prompt: `I'm going to paste a conversation below. Please carefully analyze it and use store_memory to capture ALL important information:

1. Facts about me (preferences, background, decisions made)
2. People mentioned (who they are, relationship to me, any follow-ups)
3. Projects discussed (status, decisions, next actions)
4. Ideas or insights worth remembering
5. Any feedback or corrections I gave

For each memory, pick the appropriate memory_type (fact, preference, context, feedback, relationship) and write a clear title and detailed content. Don't skip anything significant.

Here is the conversation:
`,
  },
  {
    title: 'Dump everything you know about me',
    description: 'Asks the AI to transfer all knowledge it has about you into your JustDo.so.',
    prompt: `You likely have knowledge about me from our conversations. I want to capture ALL of it in my JustDo.so knowledge base. Please go through everything you know about me and use store_memory for each piece of information:

- My personal details, background, and role
- My preferences and how I like things done
- People in my life and my relationships with them
- Projects I'm working on and their status
- Ideas I've shared
- Feedback I've given you about how to help me

Be thorough. Use the appropriate memory_type for each item. Better to store too much than too little.`,
  },
  {
    title: 'Capture a project in detail',
    description: 'Extracts everything about a specific project — context, people, status, decisions, next actions.',
    prompt: `I want to capture everything about a specific project into my JustDo.so knowledge base.

First, use search_brain to check what already exists about this project: [PROJECT NAME]

Then, based on what you know and what's missing, use store_memory to save:
- Project context and goals (memory_type: "context")
- Key people involved and their roles (memory_type: "relationship")
- Important decisions made (memory_type: "context")
- Current status and blockers (memory_type: "context")
- Next actions and deadlines (memory_type: "context")

Replace [PROJECT NAME] with the actual project name before running.`,
  },
  {
    title: 'Capture relationships and people',
    description: 'Extracts all people mentioned in conversation with context about each relationship.',
    prompt: `Review our conversation and identify every person I've mentioned. For each person, use store_memory with memory_type "relationship" to capture:

- Who they are (role, title, organization)
- How I know them / my relationship to them
- Any relevant context (what we discussed about them, pending follow-ups)
- Their connection to my projects or other people

Use their name as the title. Be specific in the content — vague memories aren't useful.`,
  },
];

export function ProfileModal({ open, userEmail, userName, onClose, onProfileUpdate, onLogout }: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Profile tab state
  const [name, setName] = useState(userName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  // Email state
  const [email, setEmail] = useState(userEmail);
  const [emailPassword, setEmailPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Inbound email state
  const [inboundEmail, setInboundEmail] = useState<string | null>(null);
  const [inboundCopied, setInboundCopied] = useState(false);

  // Password tab state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Digest email state
  const [digestEmail, setDigestEmail] = useState('');
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [digestSuccess, setDigestSuccess] = useState(false);

  // Account tab state
  const [exportBusy, setExportBusy] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  // API Keys tab state
  const [apiKeys, setApiKeys] = useState<AgentApiKey[]>([]);
  const [apiKeysBusy, setApiKeysBusy] = useState(false);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyResult, setNewKeyResult] = useState<AgentApiKeyCreateResponse | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState<string | null>(null);
  const [configCopied, setConfigCopied] = useState<string | null>(null);

  // OAuth Connections tab state
  const [oauthConnections, setOauthConnections] = useState<OAuthConnection[]>([]);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Prompts tab state
  const [promptCopied, setPromptCopied] = useState<number | null>(null);

  // Sync props when modal opens
  useEffect(() => {
    if (open) {
      setName(userName);
      setEmail(userEmail);
      setEmailPassword('');
      setNameError(null);
      setNameSuccess(false);
      setEmailError(null);
      setEmailSuccess(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      setPasswordSuccess(false);
      setInboundCopied(false);
      setDisablePassword('');
      setDisableError(null);
      setActiveTab('profile');

      // Reset API keys state
      setApiKeys([]);
      setApiKeysError(null);
      setNewKeyName('');
      setNewKeyResult(null);
      setKeyCopied(false);

      // Reset OAuth connections state
      setOauthConnections([]);
      setOauthError(null);

      // Fetch inbound email address
      api.auth.inboundEmail()
        .then((res) => setInboundEmail(res.address))
        .catch(() => setInboundEmail(null));

      // Fetch digest email settings
      api.auth.digestEmail()
        .then((res) => {
          setDigestEmail(res.email ?? '');
          setDigestEnabled(res.enabled);
        })
        .catch(() => {
          setDigestEmail('');
          setDigestEnabled(false);
        });
    }
  }, [open, userName, userEmail]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSaveName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return;
    }
    if (trimmed.length > 100) {
      setNameError('Name must be 100 characters or less.');
      return;
    }
    setNameBusy(true);
    setNameError(null);
    setNameSuccess(false);
    try {
      const updated = await api.auth.updateProfile({ name: trimmed });
      setName(updated.name ?? '');
      setNameSuccess(true);
      onProfileUpdate({ email: updated.email, name: updated.name ?? '' });
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to update name.');
    } finally {
      setNameBusy(false);
    }
  }, [name, onProfileUpdate]);

  const handleSaveEmail = useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!emailPassword) {
      setEmailError('Current password is required to change email.');
      return;
    }
    setEmailBusy(true);
    setEmailError(null);
    setEmailSuccess(false);
    try {
      const updated = await api.auth.updateEmail({ email: trimmedEmail, password: emailPassword });
      setEmail(updated.email);
      setEmailPassword('');
      setEmailSuccess(true);
      onProfileUpdate({ email: updated.email, name: updated.name ?? '' });
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to update email.');
    } finally {
      setEmailBusy(false);
    }
  }, [email, emailPassword, onProfileUpdate]);

  const handleSavePassword = useCallback(async () => {
    if (!currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      await api.auth.updatePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setPasswordBusy(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleExport = useCallback(async () => {
    setExportBusy(true);
    try {
      const blob = await api.auth.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `justdo-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silent — browser download handles errors visually
    } finally {
      setExportBusy(false);
    }
  }, []);

  const handleSaveDigest = useCallback(async () => {
    if (digestEnabled && digestEmail) {
      const trimmed = digestEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setDigestError('Please enter a valid email address.');
        return;
      }
    }
    setDigestBusy(true);
    setDigestError(null);
    setDigestSuccess(false);
    try {
      const result = await api.auth.updateDigestEmail({
        email: digestEmail.trim() || null,
        enabled: digestEnabled,
      });
      setDigestEmail(result.email ?? '');
      setDigestEnabled(result.enabled);
      setDigestSuccess(true);
    } catch (err) {
      setDigestError(err instanceof Error ? err.message : 'Failed to update digest email.');
    } finally {
      setDigestBusy(false);
    }
  }, [digestEmail, digestEnabled]);

  const handleDisable = useCallback(async () => {
    if (!disablePassword) {
      setDisableError('Password is required.');
      return;
    }
    setDisableBusy(true);
    setDisableError(null);
    try {
      await api.auth.disableAccount({ password: disablePassword });
      onClose();
      onLogout?.();
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : 'Failed to disable account.');
    } finally {
      setDisableBusy(false);
    }
  }, [disablePassword, onClose, onLogout]);

  const loadApiKeys = useCallback(async () => {
    setApiKeysBusy(true);
    setApiKeysError(null);
    try {
      const result = await api.apiKeys.list();
      setApiKeys(result.keys);
    } catch (err) {
      setApiKeysError(err instanceof Error ? err.message : 'Failed to load API keys.');
    } finally {
      setApiKeysBusy(false);
    }
  }, []);

  const handleCreateKey = useCallback(async () => {
    const trimmed = newKeyName.trim();
    if (!trimmed) {
      setApiKeysError('Agent name is required.');
      return;
    }
    setApiKeysBusy(true);
    setApiKeysError(null);
    try {
      const result = await api.apiKeys.create({ agentName: trimmed });
      setNewKeyResult(result);
      setNewKeyName('');
      await loadApiKeys();
    } catch (err) {
      setApiKeysError(err instanceof Error ? err.message : 'Failed to create API key.');
    } finally {
      setApiKeysBusy(false);
    }
  }, [newKeyName, loadApiKeys]);

  const handleRevokeKey = useCallback(async (id: string) => {
    try {
      await api.apiKeys.revoke(id);
      await loadApiKeys();
    } catch (err) {
      setApiKeysError(err instanceof Error ? err.message : 'Failed to revoke key.');
    }
  }, [loadApiKeys]);

  const handleDeleteKey = useCallback(async (id: string) => {
    try {
      await api.apiKeys.delete(id);
      await loadApiKeys();
    } catch (err) {
      setApiKeysError(err instanceof Error ? err.message : 'Failed to delete key.');
    }
  }, [loadApiKeys]);

  const loadOauthConnections = useCallback(async () => {
    setOauthBusy(true);
    setOauthError(null);
    try {
      const result = await api.oauthConnections.list();
      setOauthConnections(result.connections);
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to load connections.');
    } finally {
      setOauthBusy(false);
    }
  }, []);

  const handleRevokeConnection = useCallback(async (clientId: string) => {
    try {
      await api.oauthConnections.revoke(clientId);
      await loadOauthConnections();
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to revoke connection.');
    }
  }, [loadOauthConnections]);

  // Load API keys when switching to the apikeys tab
  useEffect(() => {
    if (open && activeTab === 'apikeys') {
      loadApiKeys();
    }
  }, [open, activeTab, loadApiKeys]);

  // Load OAuth connections when switching to the connections tab
  useEffect(() => {
    if (open && activeTab === 'connections') {
      loadOauthConnections();
    }
  }, [open, activeTab, loadOauthConnections]);

  if (!open) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">Account Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
                activeTab === tab.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Display Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="profile-name">
                  Display Name
                </label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameSuccess(false);
                    setNameError(null);
                  }}
                  placeholder="Your name"
                  maxLength={100}
                />
                {nameError && <p className="text-sm text-destructive">{nameError}</p>}
                {nameSuccess && <p className="text-sm text-green-600 dark:text-green-400">Name updated.</p>}
                <Button onClick={handleSaveName} disabled={nameBusy} size="sm">
                  {nameBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Save Name
                </Button>
              </div>

              <hr />

              {/* Email */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="profile-email">
                  Email Address
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailSuccess(false);
                    setEmailError(null);
                  }}
                  placeholder="you@example.com"
                />
                <label className="text-sm font-medium" htmlFor="profile-email-password">
                  Current Password
                </label>
                <Input
                  id="profile-email-password"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => {
                    setEmailPassword(e.target.value);
                    setEmailError(null);
                  }}
                  placeholder="Required to change email"
                  autoComplete="current-password"
                />
                {emailError && <p className="text-sm text-destructive">{emailError}</p>}
                {emailSuccess && <p className="text-sm text-green-600 dark:text-green-400">Email updated.</p>}
                <Button onClick={handleSaveEmail} disabled={emailBusy} size="sm">
                  {emailBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Save Email
                </Button>
              </div>

              {/* Inbound Email Address */}
              <hr />
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  Personal Inbound Email
                </label>
                {inboundEmail ? (
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                      {inboundEmail}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(inboundEmail);
                        setInboundCopied(true);
                        setTimeout(() => setInboundCopied(false), 2000);
                      }}
                    >
                      {inboundCopied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Email capture not configured.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Send emails to this address to capture them as entries.
                </p>
              </div>

              {/* Digest Email */}
              <hr />
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Send className="h-4 w-4" />
                  Digest Email
                </label>
                <p className="text-xs text-muted-foreground">
                  Receive daily digest and weekly review emails at a custom address.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={digestEnabled}
                    onChange={(e) => {
                      setDigestEnabled(e.target.checked);
                      setDigestSuccess(false);
                      setDigestError(null);
                    }}
                    className="rounded"
                  />
                  Enable digest email delivery
                </label>
                {digestEnabled && (
                  <Input
                    type="email"
                    value={digestEmail}
                    onChange={(e) => {
                      setDigestEmail(e.target.value);
                      setDigestSuccess(false);
                      setDigestError(null);
                    }}
                    placeholder={userEmail || 'you@example.com'}
                  />
                )}
                {digestError && <p className="text-sm text-destructive">{digestError}</p>}
                {digestSuccess && <p className="text-sm text-green-600 dark:text-green-400">Digest email updated.</p>}
                <Button onClick={handleSaveDigest} disabled={digestBusy} size="sm">
                  {digestBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Save Digest Settings
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="current-password">
                  Current Password
                </label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                  }}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="new-password">
                  New Password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                  }}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="confirm-password">
                  Confirm New Password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                  }}
                  autoComplete="new-password"
                />
              </div>
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              {passwordSuccess && (
                <p className="text-sm text-green-600 dark:text-green-400">Password changed successfully.</p>
              )}
              <Button onClick={handleSavePassword} disabled={passwordBusy} size="sm">
                {passwordBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Change Password
              </Button>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6 shrink-0">
                  <path d="M13 1L5 14h6l-2 9 10-14h-6z" fill="#4f46e5" />
                </svg>
                <span className="text-base font-semibold text-foreground">JustDo.so</span>
              </div>

              {/* Export Data */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Download className="h-4 w-4" />
                  Export Data
                </label>
                <p className="text-xs text-muted-foreground">
                  Download all your entries, conversations, preferences, and calendar data as JSON.
                </p>
                <Button onClick={handleExport} disabled={exportBusy} size="sm" variant="outline">
                  {exportBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Download Export
                </Button>
              </div>

              <hr />

              {/* Disable Account */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-destructive">Disable Account</label>
                <p className="text-xs text-muted-foreground">
                  Disabling your account will prevent you from logging in. Your data will be preserved.
                </p>
                <Input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => {
                    setDisablePassword(e.target.value);
                    setDisableError(null);
                  }}
                  placeholder="Enter your password to confirm"
                  autoComplete="current-password"
                />
                {disableError && <p className="text-sm text-destructive">{disableError}</p>}
                <Button
                  onClick={handleDisable}
                  disabled={disableBusy}
                  size="sm"
                  variant="destructive"
                >
                  {disableBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Disable Account
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'apikeys' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Create API Key</label>
                <p className="text-xs text-muted-foreground">
                  API keys let AI agents (Claude Desktop, Cursor, etc.) access your JustDo.so via MCP.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={newKeyName}
                    onChange={(e) => { setNewKeyName(e.target.value); setApiKeysError(null); }}
                    placeholder="Agent name (e.g. Claude Desktop)"
                    className="flex-1"
                  />
                  <Button onClick={handleCreateKey} disabled={apiKeysBusy} size="sm">
                    Create
                  </Button>
                </div>
              </div>

              {newKeyResult && (
                <div className="rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 p-3 space-y-2">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Key created! Copy it now — it won't be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-background px-2 py-1 rounded flex-1 truncate border">
                      {newKeyResult.key}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(newKeyResult.key);
                        setKeyCopied(true);
                        setTimeout(() => setKeyCopied(false), 2000);
                      }}
                    >
                      {keyCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              {apiKeysError && <p className="text-sm text-destructive">{apiKeysError}</p>}

              <hr />

              <div className="space-y-2">
                <label className="text-sm font-medium">Your API Keys</label>
                {apiKeysBusy && apiKeys.length === 0 && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!apiKeysBusy && apiKeys.length === 0 && (
                  <p className="text-sm text-muted-foreground">No API keys yet.</p>
                )}
                {apiKeys.length > 0 && (
                  <ul className="space-y-2">
                    {apiKeys.map((k) => (
                      <li key={k.id} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{k.agentName}</span>
                          <code className="text-xs text-muted-foreground">{k.keyPrefix}...</code>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created {new Date(k.createdAt).toLocaleDateString()}
                          {k.revokedAt && <span className="text-destructive ml-2">(revoked)</span>}
                        </div>
                        <div className="flex gap-2 mt-1">
                          {!k.revokedAt && (
                            <Button size="sm" variant="outline" onClick={() => handleRevokeKey(k.id)}>
                              Revoke
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteKey(k.id)}>
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <hr />

              <div className="space-y-2">
                <label className="text-sm font-medium">Setup Guide</label>
                <p className="text-xs text-muted-foreground">
                  Connect an AI agent to your JustDo.so via the MCP endpoint. Create an API key above, then configure your agent with the instructions below.
                </p>

                {/* Claude Code */}
                <SetupGuideSection
                  id="claude-code"
                  title="Claude Code"
                  openId={setupGuideOpen}
                  onToggle={setSetupGuideOpen}
                >
                  <p className="text-xs text-muted-foreground pt-2">
                    Add a <code className="bg-muted px-1 rounded">.mcp.json</code> file to your project root:
                  </p>
                  <ConfigSnippet
                    id="claude-code"
                    configCopied={configCopied}
                    setConfigCopied={setConfigCopied}
                    content={`{
  "mcpServers": {
    "justdo-brain": {
      "url": "${window.location.origin}/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Replace <code className="bg-muted px-1 rounded">&lt;your-api-key&gt;</code> with the key you created above.
                    Restart Claude Code after adding the file.
                  </p>
                </SetupGuideSection>

                {/* Claude Desktop */}
                <SetupGuideSection
                  id="claude-desktop"
                  title="Claude Desktop"
                  openId={setupGuideOpen}
                  onToggle={setSetupGuideOpen}
                >
                  <p className="text-xs text-muted-foreground pt-2">
                    Open <strong>Settings &rarr; Developer &rarr; Edit Config</strong> and add to the <code className="bg-muted px-1 rounded">mcpServers</code> object:
                  </p>
                  <ConfigSnippet
                    id="claude-desktop"
                    configCopied={configCopied}
                    setConfigCopied={setConfigCopied}
                    content={`"justdo-brain": {
  "url": "${window.location.origin}/mcp",
  "headers": {
    "Authorization": "Bearer <your-api-key>"
  }
}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Config file location:<br />
                    <strong>macOS:</strong> <code className="bg-muted px-1 rounded text-[11px]">~/Library/Application Support/Claude/claude_desktop_config.json</code><br />
                    <strong>Windows:</strong> <code className="bg-muted px-1 rounded text-[11px]">%APPDATA%\Claude\claude_desktop_config.json</code>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Replace <code className="bg-muted px-1 rounded">&lt;your-api-key&gt;</code> with the key you created above. Restart Claude Desktop after saving.
                  </p>
                </SetupGuideSection>

                {/* Cursor */}
                <SetupGuideSection
                  id="cursor"
                  title="Cursor"
                  openId={setupGuideOpen}
                  onToggle={setSetupGuideOpen}
                >
                  <p className="text-xs text-muted-foreground pt-2">
                    Add a <code className="bg-muted px-1 rounded">.cursor/mcp.json</code> file to your project root:
                  </p>
                  <ConfigSnippet
                    id="cursor"
                    configCopied={configCopied}
                    setConfigCopied={setConfigCopied}
                    content={`{
  "mcpServers": {
    "justdo-brain": {
      "url": "${window.location.origin}/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Or go to <strong>Cursor Settings &rarr; MCP</strong>, click <strong>Add new MCP server</strong>, and paste the URL with your API key.
                  </p>
                </SetupGuideSection>

                {/* Other agents */}
                <SetupGuideSection
                  id="other"
                  title="Other MCP-compatible agents"
                  openId={setupGuideOpen}
                  onToggle={setSetupGuideOpen}
                >
                  <p className="text-xs text-muted-foreground pt-2">
                    Any agent that supports MCP over HTTP (Streamable HTTP transport) can connect:
                  </p>
                  <div className="text-xs space-y-1.5 pt-1">
                    <div><strong>MCP Endpoint:</strong> <code className="bg-muted px-1 rounded">{window.location.origin}/mcp</code></div>
                    <div><strong>Auth:</strong> <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;your-api-key&gt;</code></div>
                    <div><strong>Transport:</strong> Streamable HTTP (POST/GET/DELETE)</div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2">
                    <strong>Available tools:</strong> store_memory, recall_memories, search_brain, get_entry, list_entries
                  </p>
                </SetupGuideSection>
              </div>
            </div>
          )}

          {activeTab === 'connections' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">OAuth Connections</label>
                <p className="text-xs text-muted-foreground">
                  External apps (like ChatGPT) connected to your JustDo.so via OAuth. Revoking a connection will sign out that app.
                </p>
              </div>

              {oauthError && <p className="text-sm text-destructive">{oauthError}</p>}

              {oauthBusy && oauthConnections.length === 0 && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!oauthBusy && oauthConnections.length === 0 && (
                <p className="text-sm text-muted-foreground">No connected apps.</p>
              )}
              {oauthConnections.length > 0 && (
                <ul className="space-y-2">
                  {oauthConnections.map((c) => (
                    <li key={c.clientId} className="rounded-md border p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.clientName || c.clientId}</span>
                        {c.activeTokens > 0 && (
                          <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                        )}
                        {c.activeTokens === 0 && (
                          <span className="text-xs text-muted-foreground">No active sessions</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Connected {new Date(c.createdAt).toLocaleDateString()}
                      </div>
                      {c.activeTokens > 0 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevokeConnection(c.clientId)}
                          className="mt-1"
                        >
                          Revoke Access
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'prompts' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Knowledge Extraction Prompts</label>
                <p className="text-xs text-muted-foreground">
                  Copy these prompts into ChatGPT, Claude, or any MCP-connected AI to extract and store knowledge in your JustDo.so.
                </p>
              </div>

              <ul className="space-y-2">
                {EXTRACTION_PROMPTS.map((p, i) => (
                  <li key={i} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <span className="font-medium">{p.title}</span>
                        <p className="text-xs text-muted-foreground">{p.description}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-8 w-8 p-0"
                        onClick={() => {
                          navigator.clipboard.writeText(p.prompt);
                          setPromptCopied(i);
                          setTimeout(() => setPromptCopied(null), 2000);
                        }}
                      >
                        {promptCopied === i ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-end flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function SetupGuideSection({
  id, title, openId, onToggle, children
}: {
  id: string;
  title: string;
  openId: string | null;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = openId === id;
  return (
    <div className="rounded-md border overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted transition-colors text-left"
        onClick={() => onToggle(isOpen ? null : id)}
      >
        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        {title}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 space-y-2 border-t bg-muted/30">
          {children}
        </div>
      )}
    </div>
  );
}

function ConfigSnippet({
  id, content, configCopied, setConfigCopied
}: {
  id: string;
  content: string;
  configCopied: string | null;
  setConfigCopied: (v: string | null) => void;
}) {
  return (
    <div className="relative">
      <pre className="text-xs bg-background border rounded p-2 pr-12 overflow-x-auto whitespace-pre">{content}</pre>
      <Button
        size="sm"
        variant="outline"
        className="absolute top-1 right-1 h-7 px-2"
        onClick={() => {
          navigator.clipboard.writeText(content);
          setConfigCopied(id);
          setTimeout(() => setConfigCopied(null), 2000);
        }}
      >
        {configCopied === id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}
