# Second Brain – Product Vision Document

> A self-hosted, AI-powered personal knowledge management system that captures thoughts, classifies them automatically, and surfaces what matters – without external service dependencies.

**Version:** 0.1.0 (MVP)  
**Author:** Daniel  
**Date:** January 2026

---

## 1. Problem Statement

Human brains are optimized for thinking, not storage. We can hold 4-7 items in working memory, we're terrible at retrieval, and we suffer from the constant cognitive tax of open loops – things we need to remember but haven't written down reliably.

Traditional second brain tools (Notion, Obsidian, Roam) fail for most people because they require **taxonomy work at capture time**. They ask you to decide where a thought belongs, how to tag it, and what to name it – exactly when you're least motivated to do that work.

The result: notes pile up, trust erodes, systems get abandoned.

**This changes in 2026.** AI can now classify, route, summarize, and surface information without human intervention. The missing piece is a **self-hosted, dependency-minimal system** that combines:

- Frictionless capture from multiple channels
- Automatic classification with confidence-based routing
- Structured storage in plain markdown (portable, readable, version-controlled)
- Proactive surfacing of relevant information
- Git-based audit trail for accountability and rollback

---

## 2. Design Principles

These principles are derived from the 12 engineering patterns for reliable AI systems:

| # | Principle | Application |
|---|-----------|-------------|
| 1 | **One reliable behavior** | User's only job: capture raw thoughts. Everything else is automated. |
| 2 | **Separate memory / compute / interface** | Markdown files (memory), Express+LLM (compute), React+Email (interface) – independently swappable. |
| 3 | **Prompts as APIs** | Classification returns structured JSON, not prose. Deterministic schemas. |
| 4 | **Trust mechanisms over capabilities** | Confidence scores, inbox log, git history, feedback channels. |
| 5 | **Safe defaults** | Low confidence → inbox folder + ask for clarification. Never pollute main storage. |
| 6 | **Small, frequent, actionable output** | Daily digest < 150 words. Weekly review < 250 words. |
| 7 | **Next action as unit** | Projects store concrete next actions, not vague intentions. |
| 8 | **Routing over organizing** | AI routes into 4 stable categories. User never chooses folders. |
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
│  │                  PostgreSQL Container                         │   │
│  │  • Conversations    • Messages    • Email threads             │   │
│  │  • Conversation summaries         • Cron job state            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
           │                                      │
           │ Volume Mount                         │ SMTP / OpenAI
           ▼                                      ▼
    ┌─────────────────┐                  ┌─────────────────┐
    │  Local Folder   │                  │  External APIs  │
    │  /memory        │                  │  • OpenAI       │
    │  ├── people/    │                  │  • SMTP Server  │
    │  ├── projects/  │                  └─────────────────┘
    │  ├── ideas/     │
    │  ├── admin/     │
    │  ├── inbox/     │
    │  ├── index.md   │
    │  └── .git/      │
    └─────────────────┘
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Markdown + Git** | Portable, human-readable, version-controlled. No vendor lock-in. Works with any text editor. |
| **PostgreSQL for conversations** | Conversations are ephemeral working memory, not the second brain itself. Relational data (threads, summaries) fits SQL well. |
| **Single app container** | Frontend, backend, and cron in one container simplifies deployment. Cron uses in-process scheduler (node-cron), not system cron. |
| **Volume mount for data** | User owns their data. Back up by copying a folder. Move between machines trivially. |
| **No vector database (MVP)** | Auto-generated index.md + full-text search is sufficient for <500 entries. Add embeddings in v2 if needed. |

---

## 4. Data Models

### 4.1 Markdown Entry Schema

Each entry is a markdown file with YAML frontmatter:

**People** (`/memory/people/{slug}.md`)
```yaml
---
id: uuid
name: "Sarah Chen"
context: "Product lead at ClientCo, met at AWS Summit 2025"
follow_ups:
  - "Ask about Q2 launch timeline"
  - "Send article on AI adoption"
related_projects:
  - clientco-integration
last_touched: 2026-01-20
tags: [client, aws, enterprise]
created_at: 2025-11-15
updated_at: 2026-01-20
source_channel: email
confidence: 0.92
---

## Notes

- Prefers async communication
- Based in Munich, CET timezone
- Has budget authority for tools <€50k
```

**Projects** (`/memory/projects/{slug}.md`)
```yaml
---
id: uuid
name: "ClientCo Integration"
status: active  # active | waiting | blocked | someday | done
next_action: "Email Sarah to confirm API access by Wednesday"
related_people:
  - sarah-chen
  - thomas-mueller
tags: [client-work, integration, q1-2026]
due_date: 2026-02-15
created_at: 2026-01-10
updated_at: 2026-01-25
source_channel: chat
confidence: 0.88
---

## Notes

- Integration with their SAP system
- They're using S/4HANA Cloud
- Budget approved, waiting on IT security review

## Log

- 2026-01-25: Received API documentation
- 2026-01-15: Kickoff call completed
```

**Ideas** (`/memory/ideas/{slug}.md`)
```yaml
---
id: uuid
name: "Workshop: AI for Quote Generation"
one_liner: "Help manufacturing companies reduce pricing errors by 80% with AI-assisted quoting"
tags: [workshop, manufacturing, ai-consulting]
related_projects: []
created_at: 2026-01-22
updated_at: 2026-01-22
source_channel: api
confidence: 0.95
---

## Elaboration

German Mittelstand has massive pain points in quote generation:
- Complex product configurations
- Manual price lookups across multiple systems
- Error rates of 15-20% on quotes

Could be a signature workshop offering...
```

**Admin** (`/memory/admin/{slug}.md`)
```yaml
---
id: uuid
name: "Renew AWS certification"
status: pending  # pending | done
due_date: 2026-03-01
tags: [certification, aws]
created_at: 2026-01-20
updated_at: 2026-01-20
source_channel: email
confidence: 0.97
---

## Notes

- Solutions Architect Professional expires March 2026
- Book exam slot by mid-February
```

**Inbox** (`/memory/inbox/{YYYYMMDD-HHMMSS}-{slug}.md`)
```yaml
---
id: uuid
original_text: "that thing marcus mentioned about the warehouse automation"
suggested_category: projects
suggested_name: "Warehouse Automation Discussion"
confidence: 0.45
status: needs_review
source_channel: chat
created_at: 2026-01-26
---

## Agent Note

Low confidence classification. Possible interpretations:
1. A new project Marcus is working on
2. A reference to an existing conversation with Marcus
3. An idea for your consulting business

Please clarify by replying with more context or a category hint like [project] or [person:marcus].
```

### 4.2 Index.md Structure

Auto-generated on every change:

```markdown
# Second Brain Index

> Last updated: 2026-01-26T14:32:00Z
> Total entries: 47 (12 people, 18 projects, 9 ideas, 8 admin)

## People (12)

| Name | Context | Last Touched |
|------|---------|--------------|
| [Sarah Chen](people/sarah-chen.md) | Product lead at ClientCo | 2026-01-20 |
| [Thomas Mueller](people/thomas-mueller.md) | IT Director, ClientCo | 2026-01-18 |
| ... | ... | ... |

## Projects – Active (7)

| Project | Next Action | Status |
|---------|-------------|--------|
| [ClientCo Integration](projects/clientco-integration.md) | Email Sarah re: API access | active |
| [YouTube Channel Launch](projects/youtube-channel-launch.md) | Record intro video | active |
| ... | ... | ... |

## Projects – Waiting/Blocked (4)

| Project | Waiting On | Since |
|---------|------------|-------|
| [Office Renovation](projects/office-renovation.md) | Contractor quote | 2026-01-15 |
| ... | ... | ... |

## Ideas (9)

| Idea | One-liner |
|------|-----------|
| [Workshop: AI Quote Gen](ideas/workshop-ai-quote-gen.md) | Help manufacturing reduce pricing errors 80% |
| ... | ... |

## Admin – Pending (5)

| Task | Due |
|------|-----|
| [Renew AWS Cert](admin/renew-aws-cert.md) | 2026-03-01 |
| ... | ... |

## Inbox – Needs Review (2)

| Captured | Original Text | Suggested |
|----------|---------------|-----------|
| 2026-01-26 | "that thing marcus mentioned..." | projects |
| ... | ... | ... |
```

### 4.3 PostgreSQL Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Conversation sessions (chat or email thread)
model Conversation {
  id            String    @id @default(uuid())
  channel       Channel   // chat | email | api
  externalId    String?   // email thread ID, null for chat
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  messages      Message[]
  summaries     ConversationSummary[]
  
  @@index([channel, externalId])
}

enum Channel {
  chat
  email
  api
}

model Message {
  id              String       @id @default(uuid())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  
  role            Role         // user | assistant
  content         String
  
  // If this message resulted in filing an entry
  filedEntryPath  String?      // e.g., "projects/clientco-integration.md"
  filedConfidence Float?
  
  createdAt       DateTime     @default(now())
  
  @@index([conversationId, createdAt])
}

enum Role {
  user
  assistant
}

// Rolling summaries of older conversation segments
model ConversationSummary {
  id              String       @id @default(uuid())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id])
  
  summary         String       // LLM-generated summary
  messageCount    Int          // How many messages this summarizes
  startMessageId  String       // First message in this batch
  endMessageId    String       // Last message in this batch
  
  createdAt       DateTime     @default(now())
  
  @@index([conversationId, createdAt])
}

// Email-specific tracking
model EmailThread {
  id              String   @id @default(uuid())
  messageId       String   @unique // Email Message-ID header
  threadId        String   // Conversation thread grouping
  inReplyTo       String?  // Parent email Message-ID
  subject         String
  fromAddress     String
  
  conversationId  String   // Links to our Conversation
  
  createdAt       DateTime @default(now())
  
  @@index([threadId])
  @@index([conversationId])
}

// Cron job execution log
model CronJobRun {
  id          String   @id @default(uuid())
  jobName     String   // daily_digest | weekly_review | stale_check | nudge
  status      JobStatus
  result      String?  // Output or error message
  
  startedAt   DateTime @default(now())
  completedAt DateTime?
  
  @@index([jobName, startedAt])
}

enum JobStatus {
  running
  success
  failed
}

// Audit log for all entry operations
model EntryAuditLog {
  id            String   @id @default(uuid())
  entryPath     String   // e.g., "projects/foo.md"
  operation     Operation
  gitCommitHash String?
  channel       Channel
  messageId     String?  // Which message triggered this
  
  createdAt     DateTime @default(now())
  
  @@index([entryPath, createdAt])
}

enum Operation {
  create
  update
  delete
  move
}
```

---

## 5. LLM Tools

The agent uses OpenAI function calling to select and execute tools. The LLM decides which tool(s) to invoke based on user intent – it is not hardcoded.

### 5.1 Tool Selection Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Chat Orchestrator                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User Message                                                        │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    OpenAI Chat Completion                    │    │
│  │                    (with function calling)                   │    │
│  │                                                              │    │
│  │  System Prompt:                                              │    │
│  │  - Role: Personal knowledge assistant                        │    │
│  │  - Available tools (JSON schemas)                            │    │
│  │  - Current index.md for context                              │    │
│  │  - Conversation history                                      │    │
│  │                                                              │    │
│  │  LLM decides:                                                │    │
│  │  1. Which tool(s) to call (or none for conversation)         │    │
│  │  2. Tool arguments                                           │    │
│  │  3. Response to user                                         │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│              ┌──────────────┼──────────────┐                        │
│              ▼              ▼              ▼                        │
│         Tool Call      Tool Call      No Tool                       │
│              │              │              │                        │
│              ▼              ▼              ▼                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Tool Executor                              │   │
│  │  - Validates tool call                                        │   │
│  │  - Executes against services (EntryService, DigestService)    │   │
│  │  - Returns result to LLM for response generation              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** The LLM is the router. Code does not decide intent – the LLM does via tool selection.

### 5.2 MVP Tools

| Tool | Input | Output | Side Effects |
|------|-------|--------|--------------|
| `classify_and_capture` | `{ text: string, hints?: string }` | `{ category, name, path, confidence, reasoning }` | Writes .md file, git commit |
| `update_entry` | `{ path, updates }` | `{ path, commitHash }` | Modifies .md file, git commit |
| `move_entry` | `{ path, targetCategory }` | `{ newPath, commitHash }` | Moves file, git commit |
| `search_entries` | `{ query, category?, limit? }` | `{ results: Entry[] }` | None |
| `get_entry` | `{ path }` | `{ entry: Entry }` | None |
| `list_entries` | `{ category?, status?, limit? }` | `{ entries: EntrySummary[] }` | None |
| `generate_digest` | `{ type: 'daily' \| 'weekly' }` | `{ content: string }` | None |

**Note:** `classify_and_capture` combines classification + entry creation. The LLM calls this when the user shares a new thought. For queries, corrections, or conversation, the LLM uses other tools or responds directly.

### 5.3 Intent Examples

| User Says | LLM Tool Selection | Why |
|-----------|-------------------|-----|
| "Sarah mentioned the Q2 launch is delayed" | `classify_and_capture` | New information to capture |
| "Show me my active projects" | `list_entries({ category: 'projects', status: 'active' })` | Query, not capture |
| "What's in my inbox?" | `list_entries({ category: 'inbox' })` | Query |
| "Give me my daily digest" | `generate_digest({ type: 'daily' })` | Explicit request |
| "Actually, file that as a project" | `move_entry({ path: lastEntry, targetCategory: 'projects' })` | Course correction |
| "Tell me about the ClientCo project" | `get_entry({ path: 'projects/clientco-integration.md' })` | Retrieval |
| "How are you?" | (no tool) | Conversation, no action needed |
| "Search for anything about AWS" | `search_entries({ query: 'AWS' })` | Search query |

### 5.4 Tool Execution Flow (Capture Path)

When the LLM determines the user is sharing a new thought:

```
User Input → LLM selects classify_and_capture
                       │
                       ▼
              Classification (internal)
                       │
        ┌──────────────┴──────────────┐
        │                             │
   confidence >= 0.6             confidence < 0.6
        │                             │
        ▼                             ▼
   Create entry in              Create entry in
   target category              inbox/ folder
        │                             │
        ▼                             ▼
   LLM generates               LLM generates
   confirmation                clarification request
```

### 5.5 System Prompt Structure

```
You are a personal knowledge management assistant. You help the user capture thoughts, 
retrieve information, and stay organized.

You have access to these tools:
{tool_definitions_as_json_schema}

Guidelines:
- When the user shares a new thought, fact, or idea → use classify_and_capture
- When the user asks to see, list, or find entries → use list_entries or search_entries
- When the user asks for their digest → use generate_digest
- When the user wants to correct a recent classification → use move_entry
- When the user is just chatting → respond conversationally without tools

Current knowledge base index:
{index_content}

Recent conversation:
{conversation_history}
```

### 5.6 Extended Tools (Post-MVP)

| Tool | Purpose |
|------|---------|
| `detect_duplicates` | Before create, check for similar existing entries |
| `extract_action_items` | Parse vague input into concrete next actions |
| `link_entities` | Automatically connect related people/projects |
| `mark_stale` | Flag entries with no activity for N days |
| `archive_entry` | Move completed/abandoned entries to archive |
| `fetch_url_metadata` | Enrich links with title/summary |

### 5.7 Classification Schema (Internal to classify_and_capture)

When `classify_and_capture` is invoked, it internally uses this classification schema:

```json
{
  "category": "people" | "projects" | "ideas" | "admin",
  "confidence": 0.0-1.0,
  "name": "Short descriptive title",
  "slug": "url-safe-lowercase-slug",
  "fields": {
    // Category-specific fields...
  },
  "related_entries": ["slug1", "slug2"],
  "reasoning": "Brief explanation of classification decision"
}
```

**Category definitions:**
- **people**: Information about a specific person (contact, relationship, follow-ups)
- **projects**: Something with multiple steps, a goal, and a timeline
- **ideas**: A concept, insight, or potential future thing (no active commitment yet)
- **admin**: A single task/errand with a due date

If confidence < 0.6, the entry goes to inbox with `status: needs_review`.

---

## 6. Ingestion Channels

### 6.1 Chat UI (React)

Primary interface for interactive capture and conversation.

**Features:**
- Persistent conversation with context (last 15 messages + summaries)
- Real-time feedback on classifications
- Quick actions: "file this as [project]", "link to [person]"
- View recent entries without leaving chat
- Mobile-responsive

**UX Flow:**
1. User types thought
2. Agent classifies, creates entry
3. Agent responds with confirmation + entry link
4. User can course-correct: "Actually, that should be a project"
5. Agent updates accordingly

### 6.2 REST API

For integrations, mobile shortcuts, CLI tools.

**Endpoints:**

```
POST /api/capture
{
  "text": "Raw thought here",
  "hints": "optional category hint",
  "channel": "api"
}
→ { "entry": Entry, "message": "Filed as project: ..." }

GET /api/entries?category=projects&status=active
→ { "entries": Entry[] }

GET /api/entries/:path
→ { "entry": Entry }

PATCH /api/entries/:path
{ "updates": { "status": "done" } }
→ { "entry": Entry, "commitHash": "abc123" }

GET /api/digest?type=daily
→ { "digest": "..." }

GET /api/index
→ { "index": "..." }  // Raw index.md content
```

### 6.3 Email

Bidirectional conversation via SMTP.

**Thread Identification:**
Email threads are tracked using a unique thread identifier embedded in both the subject line and email body:
- Format: `[SB-{uuid}]` (e.g., `[SB-a1b2c3d4]`)
- On first email: System generates ID and includes it in reply subject
- On subsequent emails: User keeps the ID in subject when replying
- Fallback: ID is also embedded at the bottom of email body for clients that strip subjects
- Example subject: `Re: Filed as project: ClientCo Integration [SB-a1b2c3d4]`

**Inbound Flow:**
1. User sends email to configured address (or forwards to it)
2. App polls IMAP or receives webhook (depending on email provider)
3. Subject line parsed for hints (e.g., "[project] Website redesign")
4. Body passed to classifier
5. Entry created, confirmation reply sent
6. Thread ID tracked – user can reply to course-correct

**Outbound Flow:**
- Confirmations sent as replies to original thread
- Digests sent as new emails (configurable time)
- Clarification requests maintain thread

**Email Subject Conventions:**
- `[person] ...` → Force classify as person
- `[project] ...` → Force classify as project
- `[idea] ...` → Force classify as idea
- `[task] ...` → Force classify as admin
- No prefix → Auto-classify

---

## 7. Conversation Memory

### 7.1 Context Assembly

When processing a message, the agent receives:

```
System Prompt
├── Role and capabilities
├── Available tools
└── Current date/time

Context
├── index.md (always included, ~2-3k tokens)
├── Conversation summaries (oldest first, ~1k tokens)
├── Last 15 messages verbatim (~3-4k tokens)
└── Retrieved entries if search was used (~1-2k tokens)

User Message
└── Current input
```

Total context budget: ~8-10k tokens, leaving room for response.

### 7.1.1 Index.md Scalability

The index.md is always included in context so the LLM can resolve `related_entries` slugs and understand what exists. Token growth analysis:

| Entries | Estimated Tokens | Status |
|---------|------------------|--------|
| 50 | ~1,750 | ✅ Comfortable |
| 100 | ~3,500 | ✅ Within budget |
| 250 | ~8,750 | ⚠️ Tight, may need pruning |
| 500 | ~17,500 | ❌ Exceeds budget |

**MVP approach (<500 entries):** Full index.md in context. This is sufficient for personal use.

**Mitigation strategies for v2 (if needed):**
1. **Compact index format:** Remove tables, use terse list format (~40% reduction)
2. **Category filtering:** Only include categories relevant to current conversation
3. **Recency pruning:** Only include entries touched in last 90 days in full; older entries as slug-only list
4. **Two-phase lookup:** Include slug list only; LLM calls `get_entry` when it needs details
5. **Vector search:** Replace index with semantic retrieval (adds complexity)

**Decision:** Ship MVP with full index. Monitor token usage. Implement compact format if users hit 250+ entries.

### 7.2 Summarization Trigger

Summarization maintains a sliding window of readable context while preserving history.

**Trigger:** When total messages in conversation exceeds `MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE` (default: 15 + 10 = 25 messages).

**Process:**
1. Keep the most recent `MAX_VERBATIM_MESSAGES` (15) messages verbatim
2. Take the oldest `SUMMARIZE_BATCH_SIZE` (10) messages not yet summarized
3. Generate summary of those 10 messages
4. Store summary in `ConversationSummary` table
5. Summaries are prepended to context (oldest first) before verbatim messages

**Example:** At 25 messages, messages 1-10 get summarized. At 35 messages, messages 11-20 get summarized. The user always sees their last 15 messages in full context.

**Environment variables:**
- `MAX_VERBATIM_MESSAGES=15` – Recent messages kept verbatim
- `SUMMARIZE_BATCH_SIZE=10` – Messages per summary batch

**Summarization Prompt:**
```
Summarize this conversation segment for future context. Include:
- Key topics discussed
- Decisions made (e.g., "user wants X filed as Y")
- User preferences learned (e.g., "prefers brief confirmations")
- Any corrections user made to classifications

Be concise. This will be prepended to future conversations.
```

---

## 8. Scheduled Jobs (Cron)

| Job | Schedule | Action |
|-----|----------|--------|
| **Daily Digest** | 07:00 local | Generate digest, send via email (requesting in chat does not cancel scheduled email) |
| **Weekly Review** | Sunday 16:00 | Comprehensive review of week, send via email (requesting in chat does not cancel scheduled email) |
| **Stale Check** | Daily 09:00 | Flag projects with no update in 14 days |
| **Follow-up Reminder** | Daily 08:00 | Surface people entries with pending follow-ups |
| **Inactivity Nudge** | Daily 20:00 | If no captures in 3 days, send gentle nudge |
| **Index Regeneration** | Synchronous on every entry change | Keep index.md fresh (queued to prevent race conditions) |

### 8.1 Daily Digest Format

```markdown
Good morning, Daniel.

**Top 3 for Today:**
1. Email Sarah to confirm API access (ClientCo Integration)
2. Record intro video (YouTube Channel Launch)
3. Review contractor quote (Office Renovation) – waiting since Jan 15

**Might Be Stuck:**
- "Warehouse Automation" has been in inbox for 5 days. Want to clarify?

**Small Win:**
- You completed 3 admin tasks this week. AWS cert renewal is next.

---
Reply to this message to capture a thought.
```

### 8.2 Weekly Review Format

```markdown
# Week of January 20-26, 2026

**What Happened:**
- 12 thoughts captured
- 8 entries created (3 projects, 2 people, 2 ideas, 1 admin)
- 4 tasks completed

**Biggest Open Loops:**
1. ClientCo Integration – waiting on security review
2. YouTube Channel – no activity since Tuesday
3. 2 items still in inbox

**Suggested Focus for Next Week:**
1. Resolve inbox items
2. Follow up with Thomas Mueller (last contact: 12 days ago)
3. Set deadline for YouTube intro video

**Theme I Noticed:**
Most captures this week were client-related. Your consulting pipeline is active.

---
Reply with thoughts or adjustments.
```

---

## 9. Git Integration

### 9.1 Commit Strategy

Every entry operation creates an atomic commit:

```bash
# Create
git add people/sarah-chen.md
git commit -m "create(people): Sarah Chen [confidence: 0.92] [via: email]"

# Update
git add projects/clientco-integration.md
git commit -m "update(projects): ClientCo Integration - status: active→waiting [via: chat]"

# Move (reclassification)
git mv inbox/20260126-warehouse.md projects/warehouse-automation.md
git commit -m "move: inbox → projects: Warehouse Automation [user correction]"
```

### 9.2 Commit Message Format

```
{operation}({category}): {entry_name} [{details}] [via: {channel}]
```

Examples:
- `create(projects): Website Redesign [confidence: 0.87] [via: chat]`
- `update(people): Sarah Chen - added follow-up [via: email]`
- `move: inbox → ideas: AI Workshop [user correction via: chat]`

### 9.3 Recovery

User can always:
- `git log --oneline` to see history
- `git diff HEAD~1` to see last change
- `git revert HEAD` to undo last change
- `git checkout HEAD~5 -- projects/foo.md` to restore specific file

The app doesn't expose git UI, but the data is always recoverable via terminal.

---

## 10. Environment Configuration

```env
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://user:pass@db:5432/secondbrain

# Email (optional, enables email channel)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=secondbrain@example.com
SMTP_PASS=...
IMAP_HOST=imap.example.com
IMAP_USER=secondbrain@example.com
IMAP_PASS=...
EMAIL_POLL_INTERVAL=60  # seconds

# Preferences
TIMEZONE=Europe/Berlin
DIGEST_TIME=07:00
WEEKLY_REVIEW_DAY=sunday
WEEKLY_REVIEW_TIME=16:00
CONFIDENCE_THRESHOLD=0.6
STALE_DAYS=14
INACTIVITY_DAYS=3

# Conversation
MAX_VERBATIM_MESSAGES=15
SUMMARIZE_BATCH_SIZE=10
```

---

## 11. Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React 18 + TypeScript + Vite | Fast builds, type safety, modern DX |
| **UI Components** | Tailwind CSS + shadcn/ui | Rapid styling, accessible components |
| **Backend** | Express.js + TypeScript | Simple, flexible, good ecosystem |
| **Database** | PostgreSQL 16 | Reliable, battle-tested, Prisma support |
| **ORM** | Prisma | Type-safe queries, migrations, great DX |
| **LLM** | OpenAI API (GPT-5.2) | Best function calling, structured output |
| **Email** | Nodemailer + node-imap | Standard Node.js email libraries |
| **Scheduler** | node-cron | In-process, no external dependencies |
| **Git** | simple-git (npm) | Node.js git wrapper |
| **Markdown** | gray-matter + remark | Frontmatter parsing, markdown processing |
| **Container** | Docker + Docker Compose | Reproducible deployment |

---

## 12. MVP Scope

### 12.1 In Scope (v0.1)

**Core Loop:**
- [x] Capture via chat UI
- [x] Capture via REST API
- [x] Automatic classification with confidence
- [x] File to markdown with frontmatter
- [x] Git commit on every change
- [x] Auto-generate index.md
- [x] Low-confidence → inbox + clarification request
- [x] Course correction ("file that as project instead")

**LLM Tool Routing:**
- [ ] LLM-based intent detection (tool selection, not hardcoded)
- [ ] Query tools: list_entries, get_entry via chat
- [ ] Digest on demand via chat ("give me my daily digest")
- [ ] Conversational responses when no tool needed

**Conversation:**
- [x] Persistent chat sessions
- [x] Context: last 15 messages + summaries
- [x] Rolling summarization

**Digests:**
- [x] Daily digest (chat response)
- [x] Weekly review (chat response)

**Infrastructure:**
- [x] Docker Compose (app + PostgreSQL)
- [x] Volume mount for /memory
- [x] Environment-based configuration

### 12.2 Out of Scope (v0.1)

- Email channel (v0.2)
- Stale detection cron (v0.2)
- Follow-up reminders (v0.2)
- Inactivity nudges (v0.2)
- Duplicate detection (v0.2)
- Entity linking automation (v0.2)
- Mobile app (future)
- Multi-user support (not planned)

### 12.3 v0.2 Roadmap

1. **Email channel**: Full bidirectional email support
2. **Proactive crons**: Stale check, follow-ups, nudges
3. **Digest delivery**: Email delivery option for digests
4. **Smart linking**: Auto-detect when entry mentions known person/project
5. **Search improvements**: Full-text search with ranking

### 12.4 Future Considerations

- **Vector embeddings**: When >500 entries, add semantic search
- **Voice capture**: Whisper API for voice memos
- **Calendar integration**: Surface relevant entries before meetings
- **Browser extension**: Capture from any webpage
- **Mobile PWA**: Installable web app for phone capture

---

## 13. Success Metrics

How do we know this is working?

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Capture friction** | <5 seconds per thought | If it's slow, you won't use it |
| **Classification accuracy** | >85% correct without correction | Trust requires accuracy |
| **Daily active captures** | >3 per day (after habit forms) | System only works if you use it |
| **Inbox zero rate** | <5 items in inbox at any time | Low-confidence items get resolved |
| **Restart ease** | Resume in <10 minutes after a gap | Life happens; recovery must be easy |
| **Digest read rate** | Open >80% of daily digests | Surfacing must be valuable |

---

## 14. Open Questions

1. **Backup strategy**: Git provides history, but should we also have periodic full backups (zip + upload somewhere)?

2. **Entry archival**: When a project is "done", should it move to `/archive/projects/`? Or stay in place with `status: done`?

3. **Image handling**: If user pastes an image in chat (e.g., whiteboard photo), store in `/memory/assets/` and link from entry?

4. **Mobile capture**: For MVP, REST API works. Should we prioritize a PWA wrapper for "Add to Home Screen" experience?

5. **LLM fallback**: If OpenAI is down, queue captures locally and process when back? Or fail loudly?

---

## Appendix A: Folder Structure

```
/memory/                          # Volume mount point
├── .git/                       # Git repository
├── index.md                    # Auto-generated index
├── people/
│   ├── sarah-chen.md
│   └── thomas-mueller.md
├── projects/
│   ├── clientco-integration.md
│   └── youtube-channel-launch.md
├── ideas/
│   └── workshop-ai-quote-gen.md
├── admin/
│   └── renew-aws-cert.md
└── inbox/
    └── 20260126-143022-warehouse.md   # Format: YYYYMMDD-HHMMSS-{slug}.md
```

---

## Appendix B: Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://secondbrain:secondbrain@db:5432/secondbrain
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TIMEZONE=${TIMEZONE:-Europe/Berlin}
      # ... other env vars
    volumes:
      - ${DATA_PATH:-./memory}:/memory
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=secondbrain
      - POSTGRES_PASSWORD=secondbrain
      - POSTGRES_DB=secondbrain
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U secondbrain"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

## Appendix C: API Authentication (MVP)

For single-user self-hosted deployment, MVP uses a simple API key:

```env
API_KEY=your-secret-key-here
```

All API requests require header:
```
Authorization: Bearer your-secret-key-here
```

Chat UI stores key in localStorage after initial setup.

---

*Document version: 0.1.0*  
*Last updated: January 2026*
