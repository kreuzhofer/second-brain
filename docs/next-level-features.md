# Next-Level Features Backlog

This document captures post-MVP enhancements we can return to after closing current spec gaps.

## Intelligence and Linking
- Entity graph across people/projects/ideas with auto-links and backlink views.
- Duplicate detection with merge flows and conflict resolution.
- Semantic + keyword hybrid search with highlights and ranking.
- Action extraction that turns vague notes into concrete next actions.
- Relationship insights (e.g., people touched by a project, recurring themes).
- LLM intent precision layer (cheap model) to interpret updates (title vs notes vs status), resolve ambiguity, and prevent accidental status changes.
- LLM entity extraction for updates and notes (people/projects/ideas mentions beyond regex verbs).
- LLM reopen resolver to match “bring back” requests to completed tasks with ranked candidates + disambiguation.
- LLM date normalization for natural language due dates (fallback to deterministic parsing).
- LLM hint extraction for chat/email (category hints, related entities, thread linking).
- Tool-call audit/guardrail step (cheap model) to validate tool args against user intent before execution.

## Capture and Interfaces
- Inbox triage UI for batch reclassify/merge/resolve.
- Full mobile UI optimization for the current feature set (responsive layout, touch-first navigation).
- Voice capture (Whisper) with background sync.
- Mobile PWA with offline-first capture queue.
- Browser extension for one-click capture with URL metadata.
- Keyboard shortcuts and quick capture tray.

## Proactive and Scheduling
- Calendar integration (pre‑meeting context surfacing).
- Smart nudges based on deadlines, inactivity, and priority decay.
- Adaptive digests (user preferences, length caps, focus areas).
- Stale‑project lifecycle with archive/hibernate automation.

### Calendar MVP (Next‑Level)
- Plan‑my‑week assistant (build a schedule from tasks, priorities, and focus goals).
- Calendar publish: generate a subscription link (ICS/WebCal) for planned tasks.
- Calendar write‑back: ingest updates from Outlook/ICS to reschedule tasks.
- Focus blocks: create protected calendar blocks and sync back to Second Brain.

## Reliability and Data Management
- Offline queue when LLM is unavailable with replay and dedupe.
- Full audit UI with diffs and rollback in the app.
- Backup/export workflows (zip + optional cloud sync).
- Multi‑profile or multi‑user support (future).

## Developer and Ops
- Webhooks for downstream automations.
- Plug‑in system for custom capture sources.
- Structured analytics dashboard for usage metrics.
