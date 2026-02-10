# Unified Roadmap and Progress

This is the canonical roadmap document for current MVP progress and next-level feature planning.

## Goals (High Impact, Low Risk)
- Semantic + keyword hybrid search with highlights and ranking.
- Inbox triage UI (batch reclassify/resolve/merge).
- Webhooks for downstream automations.
- Action extraction for projects/admin (next action capture).
- Duplicate detection + merge flow (backend-first).
- Adaptive digests with preferences and word caps.
- Daily momentum tip in daily digests (non-repeating).
- Optional: Offline queue with replay/dedupe when LLM is unavailable.

## Milestones
1. **Search MVP**
   - Hybrid search implementation (keyword + semantic).
   - Highlighting and ranking strategy documented.
   - API endpoints + tests.
2. **Inbox Triage UI**
   - Batch selection and reclassify.
   - Merge flow with conflict resolution basics.
   - UI tests and API integration.
3. **Webhooks**
   - Event schema + signing.
   - Delivery retries and backoff.
   - Integration tests.
4. **Action Extraction**
   - LLM-based action extraction for projects/admin.
   - Actions appended to entry body and next_action populated.
   - Unit tests.
5. **Duplicate Detection + Merge**
   - Duplicate search endpoints + tool support.
   - Merge operation for same-category entries.
   - Unit + integration tests.
6. **Adaptive Digests**
   - Digest preferences (focus, include flags, word limits).
   - Preferences API endpoints.
   - Digest formatting respects preferences.
7. **Daily Momentum Tip**
   - Rotating tips stored in `.config`.
   - Included in daily digest/email.
   - Unit tests.
8. **Offline Queue (Optional)**
   - Local queue + dedupe.
   - Replay pipeline + visibility.
   - Failure handling tests.

## Status
- Search MVP: Completed
- Inbox Triage UI: Completed
- Webhooks: Completed
- Action Extraction: Completed
- Duplicate Detection + Merge: Completed
- Adaptive Digests: Completed
- Daily Momentum Tip: Completed
- Offline Queue: Completed
- Intent Reliability MVP: Completed (phase 2 hardening)
- Intent Guardrails (status alignment + unauthorized status blocking): Completed
- Reopen Fallback in `update_entry` (done-task recovery + disambiguation): Completed
- Tool-Call Guardrail Audit (cheap model, pre-execution for mutating chat tools): Completed
- Notes Editing (Entry Modal): Completed
- People Linking (Admin Tasks): Improved (verb + name filters, reduced false positives)
- Link Paths (no `.md`): Completed
- Conversational disambiguation UX + execution memory: Completed (phase 2 baseline)
- Entity Graph + Backlinks phase 2: Completed
- Adaptive mobile + desktop space optimization: Completed (phase 2 shell + touch-first compaction)
- Duplicate capture failure UX (deterministic existing-entry response): Completed
- Calendar MVP phase 1: Completed (week planner + ICS/WebCal publish)
- Calendar blocker ingest phase 1: Completed (external ICS/WebCal sources + busy-block-aware autoscheduling)
- Relationship insights phase 1: Completed (top people/project summaries from graph links)

## Notes
- Prioritize backend-first slices where possible.
- Keep API changes documented in `docs/API.md`.
- UI refocus: Added Focus panel, compact inbox/recent lists, and fixed chat auto-scroll behavior.
- Deep Focus: Adjusted timer-start music playback and notification permission request on start.
- Auth: JWT + password login/registration with default user via env.
- Storage: Fully DB-backed entries with revisions + embeddings (no filesystem memory store).

## Next-Level Backlog (Unified)

### Priority Next
- Task model rework phase 1: add task duration, optional fixed appointment time, and deadline-aware autoscheduling.
- Entity graph analytics phase 3: graph-level filters and richer link inspection views in modal/panel surfaces.
- Relationship insights phase 2: add project-centric insights, trend windows, and actionable follow-up suggestions.

### Admin -> Task Migration Plan (Phases 1-3)
1. Phase 1 (DB migration, additive + backfill):
- Add `task` to `EntryCategory` enum (keep `admin` temporarily for compatibility).
- Backfill existing entries from `admin` to `task`.
- Backfill `DigestPreference.focusCategories[]` values from `admin` to `task`.
- Keep `AdminTaskDetails` table unchanged in this phase (no table rename yet).
2. Phase 2 (compatibility layer):
- Accept both `task` and `admin` in API/tool inputs.
- Canonicalize to `task` in outputs and newly generated paths.
- Keep legacy path compatibility by resolving `admin/<slug>` requests to `task/<slug>`.
3. Phase 3 (terminology switch):
- Replace user-facing wording from "admin task" to "task" in UI and prompts.
- Keep "admin task" as an input alias for chat/tool calls to avoid user disruption.
4. Safety constraints:
- Non-breaking rollout only (no destructive enum removal in this phase).
- Explicit migration naming and non-interactive execution.
- Compatibility tests must pass for both legacy and canonical task inputs.

### Intelligence and Linking
- Entity graph across people/projects/ideas with auto-links and backlink views. (In progress: lightweight graph API + modal graph view + cross-category people/project linking)
- Duplicate detection with merge flows and conflict resolution.
- Semantic + keyword hybrid search with highlights and ranking.
- Action extraction that turns vague notes into concrete next actions.
- Relationship insights (e.g., people touched by a project, recurring themes).
- LLM intent precision layer (cheap model) to interpret updates (title vs notes vs status), resolve ambiguity, and prevent accidental status changes.
- LLM entity extraction for updates and notes (people/projects/ideas mentions beyond regex verbs).
- LLM reopen resolver to match "bring back" requests to completed tasks with ranked candidates + disambiguation.
- LLM date normalization for natural language due dates (fallback to deterministic parsing).
- LLM hint extraction for chat/email (category hints, related entities, thread linking).
- Tool-call audit/guardrail step (cheap model) to validate tool args against user intent before execution.
- Multi-turn intent memory for chat mutations (carry pending operation + candidate target + requested field changes across follow-ups).
- Quick-reply confirmation chips for disambiguation prompts (e.g., `Save as admin task`, `Update title only`, `Update notes only`, `Cancel`).

### Capture and Interfaces
- Inbox triage UI for batch reclassify/merge/resolve.
- Full mobile UI optimization for the current feature set (responsive layout, touch-first navigation).
- Voice capture (Whisper) with background sync.
- Mobile PWA with offline-first capture queue.
- Browser extension for one-click capture with URL metadata.
- Keyboard shortcuts and quick capture tray.

### Proactive and Scheduling
- Calendar integration (pre-meeting context surfacing).
- Smart nudges based on deadlines, inactivity, and priority decay.
- Adaptive digests (user preferences, length caps, focus areas).
- Stale-project lifecycle with archive/hibernate automation.

### Calendar MVP (Next-Level)
- Plan-my-week assistant (build a schedule from tasks, priorities, and focus goals).
- Calendar publish: generate a subscription link (ICS/WebCal) for planned tasks.
- Calendar blocker ingest: import busy blocks from external ICS/WebCal calendars and route tasks around conflicts. (Completed phase 1)
- Focus blocks: create protected calendar blocks and sync back to Second Brain.

### Reliability and Data Management
- Offline queue when LLM is unavailable with replay and dedupe.
- Full audit UI with diffs and rollback in the app.
- Backup/export workflows (zip + optional cloud sync).
- Multi-profile or multi-user support (future).

### Developer and Ops
- Webhooks for downstream automations.
- Plug-in system for custom capture sources.
- Structured analytics dashboard for usage metrics.

## Progress Log
- 2026-02-09: Completed Admin -> Task migration phases 1-3 in one pass.
- 2026-02-09: Phase 1 shipped: added `task` enum category and backfilled `Entry.category`, `DigestPreference.focusCategories[]`, and `InboxDetails.suggestedCategory` from `admin` to `task` via Prisma migrations.
- 2026-02-09: Phase 2 shipped: API/tool compatibility now accepts both `admin` and `task` inputs while canonicalizing storage/output/path behavior to `task`, including legacy `admin/<slug>` read/update/delete fallback resolution.
- 2026-02-09: Phase 3 shipped: user-facing terminology updated to `task` across prompts, hints, index output, and UI panel/category labels while keeping admin alias support for backward compatibility.
- 2026-02-09: Verification complete: backend test suite passes (`75/75` suites, `895` tests), workspace build passes, and Docker stack rebuilt/redeployed with `docker compose up -d --build`.
- 2026-02-05: DB-backed entries and pgvector embeddings in place; tests updated for EntrySummary ids and normalized content; all backend tests passing.
- 2026-02-05: Added embedding backfill script (`npm run backfill:embeddings`) to populate missing vectors post-migration.
- 2026-02-05: Added auto embedding backfill on app startup (no CLI required in prod).
- 2026-02-05: Added current-date context to classification/action prompts and normalized relative due dates on capture to prevent incorrect past years; tests updated and passing.
- 2026-02-06: Entry notes are now editable in the modal with unobtrusive edit/save/cancel controls and auto-resizing editor.
- 2026-02-06: Removed `.md` from canonical entry links/paths while keeping backward-compatible parsing.
- 2026-02-06: Improved people inference for admin task updates (added pay verb, capitalized-name filter, expanded stopwords).
- 2026-02-06: Added intent reliability safeguards in `update_entry`: status is aligned to explicit intent when tool args disagree, implicit status changes are blocked, and reopen requests now fallback to completed-task matching when the requested path is not found.
- 2026-02-06: Added ambiguous reopen disambiguation error from `update_entry` when multiple completed tasks are equally likely matches.
- 2026-02-06: Verification: full backend test suite passed (`73/73` suites, `856` tests).
- 2026-02-06: Added tool-call guardrail audit step before mutating chat tools (`classify_and_capture`, `update_entry`, `move_entry`, `delete_entry`, `merge_entries`) with fail-closed behavior on guardrail mismatch or guardrail failure.
- 2026-02-06: Added dedicated tool guardrail model config key `OPENAI_MODEL_TOOL_GUARDRAIL` and wired service-level validation prompts.
- 2026-02-06: Verification: full backend test suite passed (`73/73` suites, `859` tests).
- 2026-02-06: Entity Graph + Backlinks MVP (phase 1): added `/api/entries/:path/graph`, graph retrieval in `EntryLinkService`, and a new graph section in entry modal (center + connected nodes + edge counts).
- 2026-02-06: Expanded auto-linking during capture/update beyond admin-only flows: project/person/idea updates can now create people links from LLM intent extraction and link referenced projects via `related_projects`.
- 2026-02-07: Reliability hardening for mutating chat tools completed: pre-mutation source resolution (`update/move/delete`), richer recent-message context for resolution, post-mutation verification gates, and mutation receipts for observability.
- 2026-02-07: Added persistent real API harness under `testing/real-api/` with core and extended scenarios to verify behavior against live models outside mocked tests.
- 2026-02-07: Verification: backend test suite passing (`73/73` suites, `873` tests). Core real-API mutation scenario stable; extended ambiguity-heavy scenario remains model-sensitive and is tracked for next iteration.
- 2026-02-08: Started conversational disambiguation + execution memory implementation in `ChatService`: multi-turn pending capture confirmation, deterministic reopen confirmation handling, and numbered reopen option execution from follow-up replies.
- 2026-02-08: Verification complete for phase 1: targeted integration tests for chat follow-up memory pass and full backend suite passes (`73/73` suites, `876` tests).
- 2026-02-09: Entity Graph + Backlinks phase 2 backend slice completed: stronger update-time people/project inference, sanitization against false-positive person phrases, project write-through linking with `createMissing`, and graph connection metadata in API types.
- 2026-02-09: Verification: full workspace test run passing (`frontend 3/3`, `backend 73/73`, `881` backend tests).
- 2026-02-09: Added relationship capture for people statements (e.g. `Chris and Amie have a relationship`): creates/reuses separate person entries and writes typed `relationship` links instead of creating synthetic combined-person entries.
- 2026-02-09: Added `relationship` to graph edge/connection types and updated graph rendering payloads to preserve link type semantics.
- 2026-02-09: Mobile/desktop layout compaction phase 1 completed: unified adaptive shell spacing tokens, tighter header/footer/main paddings, denser chat/focus panel spacing, and larger segmented right-rail tap targets.
- 2026-02-09: Enforced minimum `text-base` (16px) for input and textarea controls to prevent mobile browser auto-zoom; kept minimum 44px touch-target sizing for primary mobile controls.
- 2026-02-09: Added deterministic duplicate-capture handling in chat flow for `Entry already exists` errors from `classify_and_capture`, returning the existing entry path and update prompt instead of generic "can't capture" fallback text.
- 2026-02-09: Verification complete: targeted integration tests for duplicate-capture response, full backend test suite (`73/73`, `885` tests), frontend tests (`4/4` files, `13` tests), and Docker rebuild/redeploy succeeded.
- 2026-02-09: Confirmed conversational disambiguation + execution memory baseline is already implemented (pending-intent carry-over, follow-up confirmations, numbered-option selection, quick-reply chips) and removed it from `Priority Next`.
- 2026-02-09: Re-audited roadmap vs implementation details: marked adaptive mobile optimization phase 2 as completed and narrowed Entity Graph phase 2 remaining scope to UI backlink/link-management workflows.
- 2026-02-09: Completed Entity Graph + Backlinks phase 2 by adding manual link management APIs (`POST/DELETE /api/entries/:path/links`) and entry-modal UI workflows to add links and unlink outgoing/incoming backlinks with live graph refresh.
- 2026-02-09: Completed Calendar MVP phase 1 by adding week planning (`GET /api/calendar/plan-week`), publish links (`GET /api/calendar/publish`), and tokenized read-only ICS feed (`GET /api/calendar/feed.ics?token=...`) with integration tests.
- 2026-02-09: Completed Relationship Insights phase 1 with `GET /api/insights/relationships` and People-panel summaries (score, relationship/project/mention counts, top related people/projects).
- 2026-02-09: Added Calendar sharing UI in Focus panel: plan window summary, scheduled blocks list, and publish/copy/open controls for HTTPS ICS and WebCal links.
- 2026-02-09: Completed Calendar blocker ingest phase 1 backend: added `CalendarSource`/`CalendarBusyBlock` models, source CRUD/sync routes (`/api/calendar/sources*`), ICS parsing, and planner conflict avoidance against enabled busy blocks.
- 2026-02-09: Added Focus panel calendar source management UI (add/list/enable/sync/delete external ICS/WebCal sources) and warning surfacing for unscheduled items.
- 2026-02-09: Verification complete: targeted calendar integration tests plus full backend suite passing (`75/75`, `897` tests), followed by Docker rebuild/redeploy (`docker compose up -d --build`).
