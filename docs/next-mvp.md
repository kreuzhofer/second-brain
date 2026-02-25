# Unified Roadmap and Progress

This is the canonical roadmap document for current MVP progress and next-level feature planning.

## Completed Features

### Core MVP Milestones
All original milestones shipped:
- Search MVP (hybrid keyword + semantic, highlights, ranking)
- Inbox Triage UI (batch reclassify/merge/resolve)
- Webhooks (event schema, signing, retries, backoff)
- Action Extraction (LLM-based, next_action population)
- Duplicate Detection + Merge (endpoints, tool support, same-category merge)
- Adaptive Digests (preferences, focus, word limits)
- Daily Momentum Tip (rotating tips in digest/email)
- Offline Queue (local queue, dedupe, replay pipeline)

### Intelligence and Linking
- Entity Graph + Backlinks (phases 1-2: graph API, modal graph view, cross-category linking, manual link management, backlink UI)
- Relationship insights phase 1 (top people/project summaries from graph links)
- LLM intent precision layer (cheap model for title vs notes vs status interpretation)
- LLM entity extraction (people/projects/ideas mentions beyond regex)
- LLM reopen resolver (completed-task matching with ranked candidates + disambiguation)
- LLM date normalization (natural language due dates with deterministic fallback)
- Tool-call guardrail audit (cheap model pre-execution validation for mutating chat tools)
- Multi-turn intent memory (pending operations + candidate targets across follow-ups)
- Quick-reply confirmation chips (disambiguation prompts)
- Conversational disambiguation UX + execution memory
- Duplicate capture failure UX (deterministic existing-entry response)
- Intent reliability MVP + guardrails (status alignment, unauthorized status blocking)
- Reopen fallback in `update_entry` (done-task recovery + disambiguation)
- People linking improvements (verb + name filters, reduced false positives)
- Link paths (no `.md`)
- Notes editing (entry modal)

### Capture and Interfaces
- Voice capture phase 1 (chat push-to-talk + Whisper transcription)
- Post-capture task-start CTA phase 1 (`Start 5 minutes now` action, Deep Focus preload)
- Adaptive mobile + desktop space optimization (phase 2 shell + touch-first compaction)
- Frontend design polish (compact layout, dark mode with system/light/dark toggle, settings gear menu)

### Calendar
- Calendar MVP phase 1 (week planner + ICS/WebCal publish)
- Calendar blocker ingest phase 1 (external ICS/WebCal sources + busy-block-aware autoscheduling)
- Calendar board view — Outlook-style (multi-day grid, configurable columns, busy-block overlay with source colors, task check-off, list/board toggle, mobile-responsive, day/week navigation)
- Task autoscheduler v1 + calendar export coherence (configurable slot granularity, blocker buffers, stable ICS UIDs)
- Task model rework phases 1-3 (scheduling fields, priority editor, working-hours settings, manual replan, structured unscheduled reasons, feed freshness metadata)
- Task detail modal schedule UX cleanup (overview/schedule/meta tabs, mark-done action)
- Task deadline display/save correctness
- Task list consistency after modal mutations
- Focus list expansion control (top 5 + Show all/Show less)

### Proactive
- Smart nudges phase 1 (stale project detection, follow-up reminders, inactivity nudges — cron-scheduled, chat-delivered, property-tested)
- Web Push notifications (VAPID-based subscription, service worker, push delivery for proactive nudges, bell toggle)

### User Management
- User Profile & Account Management — all 4 phases:
  - Phase 1: Name edit, password change, email change + profile modal UI
  - Phase 2: Per-user inbound email routing (inboundEmailCode + IMAP filtering)
  - Phase 3: JSON data export + account disable (soft delete)
  - Phase 4: Per-user digest email delivery (digestEmail + digestEmailEnabled)
- Admin -> Task migration phases 1-3 (enum addition, backfill, compatibility layer, terminology switch)

---

## Not Yet Implemented

### Priority Next
1. **Multi-user SaaS support** (see spec below)
2. **Pull-to-refresh in PWA mode** — detect standalone PWA display mode and add pull-to-refresh gesture for mobile users.
3. **Mobile PWA with offline-first capture queue.**
4. **Smart nudges phase 2** — deadline-based reminders (nudge when task due dates approach), priority decay (auto-deprioritize tasks that sit unworked).

### AI Handoff: Next Thing To Implement
This section is the execution contract for any coding agent.

_(No item currently queued. Pick from Priority Next or the backlog below.)_

### Multi-User SaaS Spec

#### Current State (already done)
- All 19 data models are user-scoped (`userId` + `onDelete: Cascade`)
- All services enforce `userId` in queries via `requireUserId()` + AsyncLocalStorage
- All data routes behind `authMiddleware`; JWT Bearer token auth
- Registration endpoint exists (`POST /api/auth/register`)
- Per-user email routing (inbound email codes) and digest delivery
- Profile management modal (name, email, password, data export, account disable)
- Frontend login/register toggle in `App.tsx` (no separate pages)

#### What's Missing

**Auth hardening:**
- No email verification on registration (anyone can claim any email)
- No password reset flow (locked out if password forgotten)
- No rate limiting on auth or API endpoints
- No registration controls (open to anyone, no invite system)
- Token stored in localStorage (XSS-vulnerable); no refresh token strategy
- No periodic session revalidation; no server-side logout/token revocation

**Admin & management:**
- No admin/superuser role — no way to manage users or view system health
- No user management API or UI
- No ability to re-enable disabled accounts

**Frontend auth UX:**
- Login/register is an inline card in App.tsx, not a proper page
- No "forgot password" link or reset flow
- No email verification landing page
- Brief flash of login screen on page refresh before session validates
- No auth context/provider — all state in App.tsx root

**Operational:**
- No per-user usage quotas (entries, API calls, storage)
- No admin audit logging
- No system health/usage dashboard

#### Implementation Phases

**Phase 1: Auth hardening**
- Email verification flow: send verification email on register → verify link → activate account. Unverified accounts can log in but see a "verify your email" banner and cannot use email channel.
- Password reset flow: `POST /api/auth/forgot-password` sends reset link → `POST /api/auth/reset-password` with token sets new password. Token expires in 1 hour.
- Registration controls: `REGISTRATION_MODE` env var — `open` (default, anyone can register), `invite` (require invite code), `closed` (no new registrations).
- Rate limiting: per-IP rate limits on `/api/auth/login` (5/min), `/api/auth/register` (3/min), `/api/auth/forgot-password` (3/min). Per-user rate limit on API endpoints (100/min default, configurable).
- Schema: add `emailVerified Boolean @default(false)`, `emailVerificationToken String?`, `passwordResetToken String?`, `passwordResetExpiresAt DateTime?` to User model.

**Phase 2: Admin role & user management**
- Add `role` field to User model: `user` (default), `admin`. Promote default user to admin on bootstrap.
- Admin middleware: `requireAdmin()` that checks `role === 'admin'` after `authMiddleware`.
- Admin API endpoints:
  - `GET /api/admin/users` — list all users (paginated, with stats: entry count, last active, verified, disabled).
  - `PATCH /api/admin/users/:id` — enable/disable user, change role.
  - `GET /api/admin/stats` — system-wide stats (total users, entries, conversations, storage).
- Admin can re-enable disabled accounts.
- Audit log for admin actions (who did what, when).

**Phase 3: Frontend auth UX**
- Dedicated login page (`/login`) with "Forgot password?" link and "Create account" link.
- Registration page (`/register`) with email verification notice after submit.
- Password reset pages: request (`/forgot-password`) and reset (`/reset-password?token=...`).
- Email verification landing page (`/verify-email?token=...`).
- Auth context/provider extracted from App.tsx into `AuthProvider` with proper loading state (no login flash on refresh).
- Redirect to `/login` on token expiry with "session expired" message.

**Phase 4: Admin dashboard UI**
- Admin-only route (`/admin`) with sidebar navigation.
- User management table: search, filter by status (active/disabled/unverified), sort by last active.
- User detail view: activity summary, entry counts by category, last login, enable/disable toggle, role selector.
- System stats panel: total users, entries, conversations, storage usage, active sessions.
- System health: cron job status, email channel status, database size.

**Phase 5: Usage controls & session management**
- Per-user quotas: max entries (configurable, default unlimited for self-hosted), max storage (embedding count). Enforced at service layer; 429 when exceeded. Admin can override per user.
- Token refresh: `POST /api/auth/refresh` returns new JWT using existing valid token (extends session without re-login). Frontend auto-refreshes before expiry.
- Server-side logout: `POST /api/auth/logout` adds token to a short-lived blocklist (Redis or in-memory with TTL matching token expiry). `POST /api/auth/logout-all` invalidates all tokens by bumping a `tokenVersion` on User model.
- Active sessions: track last-used metadata per token (IP, user agent, last seen). `GET /api/auth/sessions` lists active sessions. `DELETE /api/auth/sessions/:id` revokes specific session.

#### Safety Constraints
- Non-breaking rollout: existing single-user deployments continue working unchanged.
- Default user is auto-promoted to admin on startup (backward compatible).
- `REGISTRATION_MODE=open` is the default (no action needed for existing deploys).
- Unverified email does not block login — it only restricts email channel features.
- All admin endpoints require both `authMiddleware` + `requireAdmin()`.
- Rate limiting is best-effort (in-memory by default; Redis adapter optional).

### Intelligence and Linking
- LLM hint extraction for chat/email (category hints, related entities, thread linking).

### Capture and Interfaces
- Pull-to-refresh in PWA mode (detect `display-mode: standalone` and add pull-to-refresh gesture).
- Mobile PWA with offline-first capture queue.

### Proactive and Scheduling
- Calendar integration: pre-meeting context surfacing (show relevant entries before upcoming meetings).
- Stale-project lifecycle with archive/hibernate automation.

### Calendar
- Focus blocks: create protected calendar blocks and sync back to JustDo.so.

### Reliability and Data Management
- Full audit UI with diffs and rollback in the app.
- Backup/export workflows (zip + optional cloud sync).

### Developer and Ops
- Plug-in system for custom capture sources.
- Structured analytics dashboard for usage metrics (partially covered by admin stats in multi-user Phase 4).

---

## Notes
- Prioritize backend-first slices where possible.
- Keep API changes documented in `docs/API.md`.
- Auth: JWT + password login/registration with default user via env.
- Storage: Fully DB-backed entries with revisions + embeddings (no filesystem memory store).

## Security
See [`.local.security-report.md`](.local.security-report.md) for a comprehensive security analysis covering vulnerabilities, outdated libraries, and recommendations for improvement.

## Progress Log
- 2026-02-24: Completed Web Push notifications for proactive nudges: VAPID-based push subscription (PushSubscription model + migration), push-notification.service.ts, push API routes (vapid-key, subscribe, unsubscribe, status), service worker (sw.js), frontend push.ts helper + PushToggle component in chat header, cron integration for best-effort push delivery alongside chat.
- 2026-02-24: Verification complete: backend tests passing (unit + integration for push), frontend TypeScript clean, Docker rebuild/redeploy succeeded. End-to-end push tested with Firefox (macOS) — notifications delivered with browser tab open and closed.
- 2026-02-16: Completed post-capture task-start CTA phase 1 end-to-end.
- 2026-02-16: Completed voice capture phase 1 with hold-to-talk in chat input and backend transcription endpoint `POST /api/capture/transcribe`.
- 2026-02-11: Completed Calendar board view (Outlook-style) end-to-end with mobile-responsive layout, day/week navigation, source colors, location display, hourly auto-sync cron.
- 2026-02-10: Completed Task model rework phases 1-3 (scheduling fields, priority, working-hours settings, replan endpoint, unscheduled reasons, feed freshness metadata).
- 2026-02-10: Completed auto-scheduler v1 + calendar export coherence (granularity, buffers, stable UIDs).
- 2026-02-10: Completed task detail modal UX cleanup, deadline display fixes, focus-list expansion, and task list consistency after modal mutations.
- 2026-02-09: Completed Admin -> Task migration phases 1-3 in one pass (enum, backfill, compatibility, terminology).
- 2026-02-09: Completed Entity Graph + Backlinks phase 2 (manual link management APIs + entry-modal link/unlink UI).
- 2026-02-09: Completed Calendar MVP phase 1 (week planning, publish links, tokenized ICS feed).
- 2026-02-09: Completed Calendar blocker ingest phase 1 (CalendarSource/CalendarBusyBlock models, ICS parsing, planner conflict avoidance).
- 2026-02-09: Completed Relationship Insights phase 1 (relationship API + People-panel summaries).
- 2026-02-09: Completed adaptive mobile + desktop space optimization phase 2.
- 2026-02-09: Added deterministic duplicate-capture handling and relationship capture for people statements.
- 2026-02-08: Completed conversational disambiguation + execution memory (multi-turn pending capture, reopen confirmation, numbered option execution).
- 2026-02-07: Completed reliability hardening for mutating chat tools (pre-mutation resolution, verification gates, mutation receipts).
- 2026-02-06: Completed tool-call guardrail audit, Entity Graph phase 1, intent reliability safeguards, notes editing, link path cleanup.
- 2026-02-05: DB-backed entries and pgvector embeddings in place; embedding backfill script and auto-startup backfill added.
