/**
 * PushToggle Component
 * A bell icon button in the chat header that toggles push notifications.
 * Shows filled bell when subscribed, bell-off when not.
 * Hidden entirely if browser doesn't support push or server has no VAPID keys.
 */

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  isPushSupported,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush
} from '@/services/push';

export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!isPushSupported()) return;
      setSupported(true);
      const sub = await isPushSubscribed();
      setSubscribed(sub);
    };
    check();
  }, []);

  // Hide entirely if browser doesn't support push
  if (!supported) return null;

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        const success = await subscribeToPush();
        setSubscribed(success);
      }
    } catch (err) {
      console.error('Push toggle error:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={busy}
      className="min-h-[44px] px-2 text-sm text-muted-foreground hover:text-foreground flex items-center"
      title={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
      aria-label={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
    >
      {subscribed ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
    </button>
  );
}
