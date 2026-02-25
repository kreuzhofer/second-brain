# JustDo.so – Product Vision Document

> An AI-powered personal knowledge management system that captures thoughts, classifies them automatically, and surfaces what matters.

**Version:** 0.3.0
**Author:** Daniel
**Last updated:** February 2026

---

## 1. Problem Statement

Human brains are optimized for thinking, not storage. We can hold 4-7 items in working memory, we're terrible at retrieval, and we suffer from the constant cognitive tax of open loops – things we need to remember but haven't written down reliably.

Traditional second brain tools (Notion, Obsidian, Roam) fail for most people because they require **taxonomy work at capture time**. They ask you to decide where a thought belongs, how to tag it, and what to name it – exactly when you're least motivated to do that work.

The result: notes pile up, trust erodes, systems get abandoned.

**This changes in 2026.** AI can now classify, route, summarize, and surface information without human intervention. The missing piece is a system that combines:

- Frictionless capture from multiple channels (chat, email, voice, API)
- Automatic classification with confidence-based routing
- Structured storage with revisions and semantic search
- Proactive surfacing of relevant information (digests, nudges, calendar planning)
- Multi-user support with per-user data isolation

---

## 2. Design Principles

These principles are derived from the 12 engineering patterns for reliable AI systems:

| # | Principle | Application |
|---|-----------|-------------|
| 1 | **One reliable behavior** | User's only job: capture raw thoughts. Everything else is automated. |
| 2 | **Separate memory / compute / interface** | PostgreSQL (memory), Express+LLM (compute), React+Email (interface) – independently swappable. |
| 3 | **Prompts as APIs** | Classification returns structured JSON, not prose. Deterministic schemas. |
| 4 | **Trust mechanisms over capabilities** | Confidence scores, inbox log, audit trail, feedback channels. |
| 5 | **Safe defaults** | Low confidence → inbox + ask for clarification. Never pollute main storage. |
| 6 | **Small, frequent, actionable output** | Daily digest < 150 words. Weekly review < 250 words. |
| 7 | **Next action as unit** | Tasks store concrete next actions, not vague intentions. |
| 8 | **Routing over organizing** | AI routes into stable categories. User never chooses folders. |
| 9 | **Minimal fields** | Each category has <6 fields. Add complexity only when evidence demands it. |
| 10 | **Design for restart** | Miss a week? No backlog guilt. Just brain-dump and resume. |
| 11 | **Core loop first** | Build capture → classify → file → digest. Add modules later. |
| 12 | **Maintainability over cleverness** | Fewer tools, clear logs, easy recovery. |

---

## 3. Solution Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Docker Compose                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    App Container                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │   React     │  │  Express.js │  │   Cron Scheduler    │   │   │
│  │  │  Chat UI    │  │   REST API  │  │  (node-cron)        │   │   │
│  │  │  (Vite)     │  │  + LLM Tools│  │                     │   │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │   │
│  │         │                │                     │              │   │
│  │         └────────────────┼─────────────────────┘              │   │
│  │                          │                                    │   │
│  │                   ┌──────▼──────┐                             │   │
│  │                   │   Prisma    │                             │   │
│  │                   │   Client    │                             │   │
│  │                   └──────┬──────┘                             │   │
│  └──────────────────────────┼───────────────────────────────────┘   │
│                             │                                        │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │             PostgreSQL Container (pgvector)                    │   │
│  │  • Entries + revisions  • Conversations + messages             │   │
│  │  • Vector embeddings    • Calendar sources + busy blocks       │   │
│  │  • Entity links + tags  • User accounts + preferences          │   │
│  │  • Push subscriptions   • Cron job state                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                │ SMTP/IMAP / OpenAI
                                ▼
                       ┌─────────────────┐
                       │  External APIs  │
                       │  • OpenAI       │
                       │  • SMTP/IMAP    │
                       └─────────────────┘
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **PostgreSQL + pgvector** | Entries, revisions, embeddings, and all user data in one database. Semantic search via pgvector. |
| **Fully DB-backed storage** | No filesystem dependency for data. Portable, backupable via pg_dump, supports multi-user isolation. |
| **Single app container** | Frontend, backend, and cron in one container simplifies deployment. Cron uses in-process scheduler (node-cron). |
| **JWT auth + AsyncLocalStorage** | Per-request user context isolation. All services automatically scope to the authenticated user. |
| **Per-user data isolation** | All data models carry `userId`. Services enforce user scoping at the query level. |

---

## 4. Data Models

All entry data is stored in PostgreSQL with Prisma ORM. The schema includes normalized detail tables per category, markdown sections/logs, immutable revisions, and pgvector embeddings.

### 4.1 Entry Categories

| Category | Purpose | Key Fields |
|----------|---------|------------|
| **people** | Information about a person | context, follow_ups, related_projects |
| **projects** | Multi-step work with a goal | status, next_action, related_people, due_date |
| **ideas** | Concepts and potential future work | one_liner, elaboration |
| **task** | Single actionable items | status, due_date, priority, duration, fixed_at |
| **inbox** | Low-confidence items needing review | suggested_category, confidence |

### 4.2 Core Schema Concepts

- **Entry**: Central model with category, slug, title, content (markdown), status, confidence, channel. User-scoped.
- **EntryRevision**: Immutable snapshots on every change. Full audit trail.
- **EntryEmbedding**: pgvector embeddings for semantic search.
- **EntryLink**: Typed relationships between entries (mentions, related_project, relationship, etc.).
- **EntrySection / EntryLog**: Structured content sections and chronological logs.
- **Category detail tables**: `PersonDetails`, `ProjectDetails`, `IdeaDetails`, `AdminTaskDetails`, `InboxDetails`.

### 4.3 User & Auth Models

- **User**: email, hashed password, name, role, inboundEmailCode, digestEmail settings, disabledAt.
- **Conversation / Message**: Per-user chat and email conversation history.
- **CalendarSource / CalendarBusyBlock / CalendarSettings**: Per-user calendar configuration.
- **PushSubscription**: Per-user web push notification subscriptions.
- **DigestPreference / DailyTipState**: Per-user digest and notification preferences.

See `backend/prisma/schema.prisma` for the full schema.

---

## 5. LLM Tools

The agent uses OpenAI function calling to select and execute tools. The LLM decides which tool(s) to invoke based on user intent.

### 5.1 Core Tools

| Tool | Input | Output | Side Effects |
|------|-------|--------|--------------|
| `classify_and_capture` | `{ text, hints? }` | `{ category, name, path, confidence }` | Creates entry |
| `update_entry` | `{ path, updates }` | `{ path, changes }` | Modifies entry |
| `move_entry` | `{ path, targetCategory }` | `{ newPath }` | Reclassifies entry |
| `delete_entry` | `{ path }` | `{ deleted }` | Removes entry |
| `merge_entries` | `{ sourcePath, targetPath }` | `{ mergedPath }` | Combines entries |
| `search_entries` | `{ query, category?, limit? }` | `{ results }` | None |
| `get_entry` | `{ path }` | `{ entry }` | None |
| `list_entries` | `{ category?, status?, limit? }` | `{ entries }` | None |
| `generate_digest` | `{ type }` | `{ content }` | None |

### 5.2 Safety Layer

All mutating tools pass through a **tool-call guardrail** (cheap LLM model) that validates tool arguments against user intent before execution. Mismatches are blocked with an explanation to the user.

### 5.3 Intent Features

- **Multi-turn disambiguation**: Pending operations carry across follow-up messages
- **Quick-reply chips**: Confirmation prompts for ambiguous requests
- **Reopen resolver**: Matches "bring back" requests to completed tasks with ranked candidates
- **Entity extraction**: Auto-links people, projects, and ideas mentioned in updates
- **Date normalization**: Natural language due dates parsed via LLM with deterministic fallback

---

## 6. Ingestion Channels

### 6.1 Chat UI (React)

Primary interface with persistent conversation, real-time classification feedback, and course correction.

### 6.2 Voice Capture

Push-to-talk in chat input. Audio transcribed via Whisper API, then processed as text input.

### 6.3 Email

Bidirectional SMTP/IMAP conversation. Per-user inbound routing via `+code` email suffixes. Thread tracking via `[SB-{id}]` identifiers. Category hints in subject line (`[project]`, `[person]`, etc.).

### 6.4 REST API

For integrations, mobile shortcuts, and CLI tools. All endpoints require JWT Bearer token.

---

## 7. Proactive Features

### 7.1 Digests

- **Daily digest**: Top priorities, stuck items, small wins. Sent via email (per-user) and available in chat.
- **Weekly review**: Comprehensive week summary with suggested focus areas.
- **Adaptive preferences**: Per-user focus categories, word limits, and delivery settings.
- **Daily momentum tip**: Non-repeating rotating tips included in digests.

### 7.2 Smart Nudges

- **Stale project detection**: Projects with no activity for 14 days (configurable).
- **Follow-up reminders**: People entries with pending follow-ups.
- **Inactivity nudges**: Gentle reminder after 3 days of no captures.
- **Web Push notifications**: VAPID-based push delivery for nudges (works with browser closed).

### 7.3 Calendar Planning

- **Week planner**: Auto-schedule tasks based on priority, duration, and deadlines.
- **External calendar integration**: Import ICS/WebCal sources as busy blocks; schedule around conflicts.
- **Calendar board view**: Outlook-style multi-day grid with task blocks and busy block overlays.
- **ICS/WebCal publish**: Shareable read-only calendar feed of planned tasks.
- **Working hours**: Per-user configurable work days and hours.
- **Task autoscheduler**: Configurable slot granularity, blocker buffers, stable ICS UIDs.

---

## 8. Conversation Memory

### 8.1 Context Assembly

When processing a message, the agent receives:
- System prompt with role, tools, and current date
- Current entry index for context
- Conversation summaries (oldest first)
- Last 15 messages verbatim
- Retrieved entries if search was used

### 8.2 Summarization

Rolling summarization maintains a sliding window. When messages exceed threshold, older batches are summarized and stored. The user always sees their last 15 messages in full context.

---

## 9. Scheduled Jobs (Cron)

| Job | Schedule | Action |
|-----|----------|--------|
| **Daily Digest** | 07:00 local | Generate digest, send via email + push |
| **Weekly Review** | Sunday 16:00 | Comprehensive review, send via email |
| **Stale Check** | Daily 09:00 | Flag projects with no update in 14 days |
| **Follow-up Reminder** | Daily 08:00 | Surface people entries with pending follow-ups |
| **Inactivity Nudge** | Daily 20:00 | If no captures in 3 days, send nudge |
| **Calendar Source Sync** | Hourly | Sync all enabled external calendar sources |

---

## 10. Environment Configuration

```env
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://user:pass@db:5432/secondbrain
JWT_SECRET=your-jwt-secret-here
DEFAULT_USER_EMAIL=you@example.com
DEFAULT_USER_PASSWORD=change-me-now

# Email (optional, enables email channel)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=secondbrain@example.com
SMTP_PASS=...
IMAP_HOST=imap.example.com
IMAP_USER=secondbrain@example.com
IMAP_PASS=...
EMAIL_POLL_INTERVAL=60

# Web Push (optional)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

# Preferences
TIMEZONE=Europe/Berlin
DIGEST_TIME=07:00
WEEKLY_REVIEW_DAY=sunday
WEEKLY_REVIEW_TIME=16:00
CONFIDENCE_THRESHOLD=0.6
STALE_DAYS=14
INACTIVITY_DAYS=3
```

See `.env.example` for all options with defaults.

---

## 11. Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React 18 + TypeScript + Vite | Fast builds, type safety, modern DX |
| **UI** | Tailwind CSS | Rapid styling, responsive layout, dark mode |
| **Backend** | Express.js + TypeScript | Simple, flexible, good ecosystem |
| **Database** | PostgreSQL 16 + pgvector | Entries, embeddings, and user data in one DB |
| **ORM** | Prisma | Type-safe queries, migrations, great DX |
| **LLM** | OpenAI API | Function calling, embeddings, classification |
| **Email** | Nodemailer + node-imap | Standard Node.js email libraries |
| **Scheduler** | node-cron | In-process, no external dependencies |
| **Container** | Docker + Docker Compose | Reproducible deployment |

---

## 12. Current Status & Roadmap

### 12.1 Completed (v0.1–v0.3)

**Core loop**: Chat capture, REST API capture, voice capture, email capture (bidirectional), automatic classification, confidence-based inbox routing, course correction.

**Intelligence**: Entity graph with auto-links and backlinks, duplicate detection + merge, semantic + keyword hybrid search, action extraction, relationship insights, LLM intent precision layer, tool-call guardrails, conversational disambiguation with execution memory.

**Proactive**: Daily/weekly digests with adaptive preferences, smart nudges (stale projects, follow-ups, inactivity), web push notifications.

**Calendar**: Week planner, external calendar blocker ingest, Outlook-style board view, task autoscheduler, ICS/WebCal publish.

**User management**: JWT auth, user registration, profile management (name, email, password), per-user email routing, per-user digest delivery, data export, account disable.

**Infrastructure**: Docker Compose deployment, PostgreSQL + pgvector, dark mode, responsive layout.

### 12.2 Next Up

See `docs/roadmap.md` for the detailed roadmap. Key priorities:

1. **Multi-user SaaS support** (5 phases): Email verification, password reset, rate limiting, admin role + user management, frontend auth UX, admin dashboard, usage quotas, session management.
2. **Pull-to-refresh in PWA mode**
3. **Mobile PWA with offline-first capture queue**
4. **Smart nudges phase 2** (deadline reminders, priority decay)

### 12.3 Future Considerations

- Calendar focus blocks (protected time blocks)
- Pre-meeting context surfacing
- Stale-project lifecycle with archive/hibernate
- Full audit UI with diffs and rollback
- Plug-in system for custom capture sources
- Browser extension for web capture

---

## 13. Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Capture friction** | <5 seconds per thought | If it's slow, you won't use it |
| **Classification accuracy** | >85% correct without correction | Trust requires accuracy |
| **Daily active captures** | >3 per day (after habit forms) | System only works if you use it |
| **Inbox zero rate** | <5 items in inbox at any time | Low-confidence items get resolved |
| **Restart ease** | Resume in <10 minutes after a gap | Life happens; recovery must be easy |
| **Digest read rate** | Open >80% of daily digests | Surfacing must be valuable |

---

*Document version: 0.3.0*
*Last updated: February 2026*
