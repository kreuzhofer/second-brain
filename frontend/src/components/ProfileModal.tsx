/**
 * ProfileModal Component
 * Portal-based modal for user profile management (name, email, password).
 * Follows the EntryModal pattern: createPortal, backdrop click, Escape key.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, User, KeyRound, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';

interface ProfileModalProps {
  open: boolean;
  userEmail: string;
  userName: string;
  onClose: () => void;
  onProfileUpdate: (user: { email: string; name: string }) => void;
}

type Tab = 'profile' | 'password' | 'about';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
  { key: 'password', label: 'Password', icon: <KeyRound className="h-4 w-4" /> },
  { key: 'about', label: 'About', icon: <Info className="h-4 w-4" /> },
];

export function ProfileModal({ open, userEmail, userName, onClose, onProfileUpdate }: ProfileModalProps) {
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

  // Password tab state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

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
      setActiveTab('profile');
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

  if (!open) return null;

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">Account Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
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

          {activeTab === 'about' && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6 shrink-0">
                  <path d="M13 1L5 14h6l-2 9 10-14h-6z" fill="#4f46e5" />
                </svg>
                <span className="text-base font-semibold text-foreground">JustDo.so</span>
              </div>
              <p>AI-powered personal knowledge management.</p>
              <p className="text-xs">More settings (notifications, data export, account management) coming soon.</p>
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
