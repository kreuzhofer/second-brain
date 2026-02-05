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

## Notes
- Prioritize backend-first slices where possible.
- Keep API changes documented in `docs/API.md`.
- UI refocus: Added Focus panel, compact inbox/recent lists, and fixed chat auto-scroll behavior.
- Deep Focus: Adjusted timer-start music playback and notification permission request on start.

## Progress Log
- 2026-02-05: DB-backed entries and pgvector embeddings in place; tests updated for EntrySummary ids and normalized content; all backend tests passing.
- 2026-02-05: Added embedding backfill script (`npm run backfill:embeddings`) to populate missing vectors post-migration.
- 2026-02-05: Added auto embedding backfill on app startup (no CLI required in prod).
- 2026-02-05: Added current-date context to classification/action prompts and normalized relative due dates on capture to prevent incorrect past years; tests updated and passing.
