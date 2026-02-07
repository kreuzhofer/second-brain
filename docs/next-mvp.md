# Next MVP Plan

This document tracks the next MVP scope and progress.

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
- Intent Reliability MVP: In Progress
- Intent Guardrails (status alignment + unauthorized status blocking): Completed
- Reopen Fallback in `update_entry` (done-task recovery + disambiguation): Completed
- Tool-Call Guardrail Audit (cheap model, pre-execution for mutating chat tools): Completed
- Notes Editing (Entry Modal): Completed
- People Linking (Admin Tasks): Improved (verb + name filters, reduced false positives)
- Link Paths (no `.md`): Completed

## Notes
- Prioritize backend-first slices where possible.
- Keep API changes documented in `docs/API.md`.
- UI refocus: Added Focus panel, compact inbox/recent lists, and fixed chat auto-scroll behavior.
- Deep Focus: Adjusted timer-start music playback and notification permission request on start.
- Auth: JWT + password login/registration with default user via env.
- Storage: Fully DB-backed entries with revisions + embeddings (no filesystem memory store).

## Progress Log
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
