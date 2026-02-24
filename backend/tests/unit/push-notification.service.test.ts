/**
 * Unit tests for PushNotificationService.buildPayloadFromContent
 * Pure function tests — no mocks or DB needed.
 */

import { PushNotificationService } from '../../src/services/push-notification.service';

describe('PushNotificationService.buildPayloadFromContent', () => {
  it('extracts title from stale check content', () => {
    const content =
      "**🔍 Stale Project Check**\n\nThese projects haven't been updated in a while:\n\n- **My Project** (active) – 21 days";
    const payload = PushNotificationService.buildPayloadFromContent(
      'stale_check',
      content
    );
    expect(payload.title).toBe('Stale Project Check');
    expect(payload.tag).toBe('proactive-stale_check');
    expect(payload.body).toContain("haven't been updated");
  });

  it('extracts title from follow-up reminder content', () => {
    const content =
      '**👋 Follow-up Reminder**\n\nYou have pending follow-ups with:\n\n**Alice**';
    const payload = PushNotificationService.buildPayloadFromContent(
      'followup_reminder',
      content
    );
    expect(payload.title).toBe('Follow-up Reminder');
    expect(payload.tag).toBe('proactive-followup_reminder');
    expect(payload.body).toContain('pending follow-ups');
  });

  it('extracts title from inactivity nudge content', () => {
    const content =
      "**💭 Quick thought?**\n\nIt's been 5 days since your last capture. Even a small thought counts!\n\nReply with anything.";
    const payload = PushNotificationService.buildPayloadFromContent(
      'inactivity_nudge',
      content
    );
    expect(payload.title).toBe('Quick thought?');
    expect(payload.body).toContain('5 days');
    expect(payload.tag).toBe('proactive-inactivity_nudge');
  });

  it('truncates body over 120 chars', () => {
    const longLine = 'A'.repeat(200);
    const content = `**Title**\n\n${longLine}`;
    const payload = PushNotificationService.buildPayloadFromContent(
      'test_job',
      content
    );
    expect(payload.body.length).toBeLessThanOrEqual(120);
    expect(payload.body).toMatch(/\.\.\.$/);
  });

  it('falls back to defaults with unexpected format', () => {
    const payload = PushNotificationService.buildPayloadFromContent(
      'test',
      'plain text without bold'
    );
    expect(payload.title).toBe('Second Brain');
    expect(payload.body).toBe('You have a new nudge in your Second Brain.');
  });

  it('always sets url to /', () => {
    const payload = PushNotificationService.buildPayloadFromContent(
      'x',
      '**T**\nbody line'
    );
    expect(payload.url).toBe('/');
  });

  it('strips emoji from title', () => {
    const content = '**🌱 Time to capture?**\n\nContent here';
    const payload = PushNotificationService.buildPayloadFromContent(
      'nudge',
      content
    );
    expect(payload.title).toBe('Time to capture?');
    expect(payload.title).not.toMatch(/🌱/);
  });

  it('strips leading dash from body line', () => {
    const content = '**Title**\n\n- First bullet item here';
    const payload = PushNotificationService.buildPayloadFromContent(
      'job',
      content
    );
    expect(payload.body).toBe('First bullet item here');
  });

  it('skips bold lines when searching for body', () => {
    const content =
      '**Title**\n\n**Subtitle**\n\nActual body content here';
    const payload = PushNotificationService.buildPayloadFromContent(
      'job',
      content
    );
    expect(payload.body).toBe('Actual body content here');
  });
});
