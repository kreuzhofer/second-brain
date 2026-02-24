/**
 * Service Worker for JustDo.so
 * Handles push notification display and click events.
 * Scoped to proactive nudges only.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, tag, url } = payload;

  const options = {
    body: body || '',
    tag: tag || 'second-brain',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: url || '/' },
    // Don't re-buzz if same tag already showing (replace silently)
    renotify: false
  };

  event.waitUntil(
    self.registration.showNotification(title || 'JustDo.so', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if one exists
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(urlToOpen);
      })
  );
});
