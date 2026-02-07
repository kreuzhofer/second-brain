# Second Brain API Documentation

## Authentication

All API endpoints (except `/api/health` and `/api/auth/*`) require authentication using a Bearer token.

Obtain a JWT via `POST /api/auth/login` (or `POST /api/auth/register` for new users), then include it in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

### Login

```
POST /api/auth/login
```

**Request Body**:
```json
{
  "email": "you@example.com",
  "password": "your-password"
}
```

**Response** (200 OK):
```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "email": "you@example.com",
    "name": "Your Name"
  }
}
```

### Register

```
POST /api/auth/register
```

**Request Body**:
```json
{
  "email": "you@example.com",
  "password": "your-password",
  "name": "Your Name"
}
```

### Current User

```
GET /api/auth/me
```

Returns the authenticated user profile.

### Error Response (401 Unauthorized)

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing authorization header"
  }
}
```

## Error Response Format

All errors follow a consistent JSON format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}  // Optional additional details
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token |
| `NOT_FOUND` | 404 | Entry or resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `CONFLICT` | 409 | Entry already exists |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Endpoints

### Health Check

Check if the API is running.

```
GET /api/health
```

**Authentication**: Not required

**Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-01-26T10:00:00.000Z",
  "service": "second-brain-api",
  "version": "0.1.0"
}
```

---

### List Entries

List all entries with optional filtering.

```
GET /api/entries
GET /api/entries?category=projects
GET /api/entries?category=projects&status=active
```

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `category` | string | Filter by category: `people`, `projects`, `ideas`, `admin`, `inbox` |
| `status` | string | Filter by status (for projects: `active`, `waiting`, `blocked`, `someday`, `done`; for admin: `pending`, `done`) |

**Response** (200 OK):
```json
{
  "entries": [
    {
      "path": "projects/my-project",
      "name": "My Project",
      "category": "projects",
      "updated_at": "2026-01-26T10:00:00.000Z",
      "status": "active",
      "next_action": "Complete the task"
    }
  ]
}
```

---

### Get Entry

Get a single entry by path.

```
GET /api/entries/:path
```

**Example**:
```
GET /api/entries/projects/my-project
```

**Response** (200 OK):
```json
{
  "path": "projects/my-project",
  "category": "projects",
  "entry": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Project",
    "status": "active",
    "next_action": "Complete the task",
    "related_people": [],
    "tags": ["work"],
    "created_at": "2026-01-20T10:00:00.000Z",
    "updated_at": "2026-01-26T10:00:00.000Z",
    "source_channel": "api",
    "confidence": 0.85
  },
  "content": "## Notes\n\nProject notes here..."
}
```

**Error Response** (404 Not Found):
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Entry not found: projects/non-existent"
  }
}
```

---

### Get Entry Links and Backlinks

Get outgoing links (items this entry references) and incoming backlinks.

```
GET /api/entries/:path/links
GET /api/entries/projects/my-project/links
```

Paths in responses omit the `.md` suffix.

**Response** (200 OK):
```json
{
  "outgoing": [
    { "path": "people/lina-haidu", "category": "people", "name": "Lina Haidu" }
  ],
  "incoming": [
    { "path": "admin/call-lina-haidu", "category": "admin", "name": "Call Lina Haidu" }
  ]
}
```

---

### Get Entry Graph

Get lightweight graph data for an entry: center node, connected nodes, and directed edges.

```
GET /api/entries/:path/graph
GET /api/entries/admin/call-lina-haidu/graph
```

**Response** (200 OK):
```json
{
  "center": { "path": "admin/call-lina-haidu", "category": "admin", "name": "Call Lina Haidu" },
  "nodes": [
    { "path": "admin/call-lina-haidu", "category": "admin", "name": "Call Lina Haidu" },
    { "path": "people/lina-haidu", "category": "people", "name": "Lina Haidu" }
  ],
  "edges": [
    { "source": "admin/call-lina-haidu", "target": "people/lina-haidu", "type": "mention" }
  ]
}
```

---

### Create Entry

Create a new entry.

```
POST /api/entries
```

**Request Body**:

The request body must include `category` and category-specific fields.

#### People Entry
```json
{
  "category": "people",
  "name": "John Doe",
  "context": "Met at conference",
  "follow_ups": ["Send email"],
  "related_projects": ["project-slug"],
  "tags": ["contact"],
  "source_channel": "api",
  "confidence": 0.9
}
```

#### Projects Entry
```json
{
  "category": "projects",
  "name": "New Project",
  "status": "active",
  "next_action": "Define requirements",
  "related_people": ["john-doe"],
  "tags": ["work"],
  "due_date": "2026-02-15",
  "source_channel": "api",
  "confidence": 0.85
}
```

#### Ideas Entry
```json
{
  "category": "ideas",
  "name": "Great Idea",
  "one_liner": "A brief description of the idea",
  "related_projects": [],
  "tags": ["innovation"],
  "source_channel": "api",
  "confidence": 0.95
}
```

#### Admin Entry
```json
{
  "category": "admin",
  "name": "Important Task",
  "status": "pending",
  "due_date": "2026-02-01",
  "tags": ["urgent"],
  "source_channel": "api",
  "confidence": 0.99
}
```

#### Inbox Entry
```json
{
  "category": "inbox",
  "original_text": "Something to review later",
  "suggested_category": "projects",
  "suggested_name": "Possible Project",
  "confidence": 0.45,
  "source_channel": "chat"
}
```

**Response** (201 Created):
```json
{
  "path": "projects/new-project",
  "category": "projects",
  "entry": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "New Project",
    "status": "active",
    "next_action": "Define requirements",
    "related_people": [],
    "tags": ["work"],
    "due_date": "2026-02-15",
    "created_at": "2026-01-26T10:00:00.000Z",
    "updated_at": "2026-01-26T10:00:00.000Z",
    "source_channel": "api",
    "confidence": 0.85
  },
  "content": ""
}
```

---

### Update Entry

Update an existing entry with partial data.

```
PATCH /api/entries/:path
```

**Example**:
```
PATCH /api/entries/projects/my-project
```

**Request Body**:
```json
{
  "status": "done",
  "next_action": "Project completed"
}
```

**Response** (200 OK):
```json
{
  "path": "projects/my-project",
  "category": "projects",
  "entry": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Project",
    "status": "done",
    "next_action": "Project completed",
    "updated_at": "2026-01-26T12:00:00.000Z"
  },
  "content": "## Notes\n\nProject notes here..."
}
```

---

### Delete Entry

Delete an entry.

```
DELETE /api/entries/:path
```

**Example**:
```
DELETE /api/entries/projects/old-project
```

**Response** (204 No Content): Empty response body

---

### Search Entries

Hybrid keyword + semantic search across entries.

```
GET /api/search?query=design
GET /api/search?query=design&category=projects&limit=10
```

**Embedding Backfill (Startup Behavior)**:
- The app auto-backfills missing embeddings on startup when `EMBEDDING_BACKFILL_ENABLED` is not `false`.
- Optional env flags: `EMBEDDING_BACKFILL_CATEGORY`, `EMBEDDING_BACKFILL_LIMIT`, `EMBEDDING_BACKFILL_BATCH_SIZE`, `EMBEDDING_BACKFILL_SLEEP_MS`, `EMBEDDING_MAX_CHARS`.

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Search query (required) |
| `category` | string | Optional category filter |
| `limit` | number | Max results (optional) |

**Response** (200 OK):
```json
{
  "entries": [
    {
      "path": "projects/website-redesign",
      "name": "Website Redesign",
      "category": "projects",
      "matchedField": "content",
      "snippet": "...new dashboard design for clients...",
      "highlightRanges": [{ "start": 19, "end": 25 }],
      "score": 0.86,
      "keywordScore": 2,
      "semanticScore": 0.78
    }
  ],
  "total": 1
}
```

---

### Inbox Triage (Batch)

Batch triage for inbox entries: move, resolve, or merge.

```
POST /api/inbox/triage
```

**Move**:
```json
{
  "action": "move",
  "paths": ["inbox/20260126-101010-foo"],
  "targetCategory": "projects"
}
```

**Resolve (delete)**:
```json
{
  "action": "resolve",
  "paths": ["inbox/20260126-101010-foo"]
}
```

**Merge**:
```json
{
  "action": "merge",
  "paths": ["inbox/20260126-101010-foo"],
  "targetPath": "projects/my-project"
}
```

**Response**:
- Move: `200 OK` with `{ "entries": [...] }`
- Resolve: `204 No Content`
- Merge: `200 OK` with `{ "entry": { ... } }`

---

### Deep Focus

Start a deep focus session with music discovery and log progress.

```
GET /api/focus/tracks/next?mode=auto
GET /api/focus/tracks/next?mode=new&exclude=YOUTUBE_ID
```

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | string | `auto` (prefer liked/neutral) or `new` (force discovery) |
| `exclude` | string | Optional YouTube ID to exclude from selection |

**Response** (200 OK):
```json
{
  "id": "uuid",
  "youtubeId": "abc123",
  "title": "Deep Focus Music",
  "channelTitle": "Focus Channel",
  "rating": 1,
  "timesPlayed": 3,
  "lastPlayedAt": "2026-02-05T10:00:00.000Z"
}
```

```
POST /api/focus/tracks/rate
```

**Request Body**:
```json
{ "youtubeId": "abc123", "rating": 1 }
```

**Response** (200 OK): updated track object.

```
POST /api/focus/sessions
```

**Request Body**:
```json
{
  "entryPath": "admin/renew-aws-certification",
  "durationSeconds": 1500,
  "startedAt": "2026-02-05T09:00:00.000Z",
  "endedAt": "2026-02-05T09:25:00.000Z",
  "trackYoutubeId": "abc123",
  "notes": "Reviewed prep outline"
}
```

**Response** (200 OK): focus session object.

```
POST /api/focus/progress
```

**Request Body**:
```json
{ "entryPath": "admin/renew-aws-certification", "note": "Booked exam date" }
```

**Response**: `204 No Content`

---

### Focus Congratulation

Generate a short congratulatory message after completing a task.

```
POST /api/focus/congrats
```

**Request Body**:
```json
{
  "entryPath": "admin/renew-aws-certification",
  "entryName": "Renew AWS certification",
  "minutes": 25
}
```

**Response** (200 OK):
```json
{ "message": "Nice work finishing that. Momentum beats perfection—keep rolling." }
```

---

### Find Duplicates

Detect likely duplicates for a given entry or text.

```
GET /api/duplicates?path=projects/my-project
POST /api/duplicates
```

**POST Body**:
```json
{
  "name": "Project Alpha",
  "text": "Project Alpha kickoff notes...",
  "category": "projects",
  "limit": 5
}
```

**Response** (200 OK):
```json
{
  "duplicates": [
    {
      "path": "projects/project-alpha",
      "name": "Project Alpha",
      "category": "projects",
      "matchedField": "semantic",
      "snippet": "Project Alpha kickoff...",
      "score": 0.9,
      "reason": "semantic_similarity"
    }
  ]
}
```

---

### Merge Entries

Merge multiple entries into a target entry (same category).

```
POST /api/entries/merge
```

**Request Body**:
```json
{
  "targetPath": "projects/project-alpha",
  "sourcePaths": ["projects/project-alpha-old"]
}
```

**Response** (200 OK):
```json
{
  "path": "projects/project-alpha",
  "category": "projects",
  "entry": { "name": "Project Alpha" },
  "content": "..."
}
```

---

### Get Index

Get the auto-generated index content.

```
GET /api/index
```

**Response** (200 OK):
```markdown
# Second Brain Index

> Last updated: 2026-01-26T10:00:00.000Z
> Total entries: 10 (3 people, 4 projects, 2 ideas, 1 admin)

## People (3)

| Name | Context | Last Touched |
|------|---------|--------------|
| [John Doe](people/john-doe) | Met at conference | 2026-01-20 |
...
```

The response is returned as `text/markdown` content type.

---

### Capture Thought

Capture a raw thought and let the system classify it.

```
POST /api/capture
```

**Request Body**:
```json
{
  "text": "Raw thought here",
  "hints": "optional category hint"
}
```

**Response** (201 Created):
```json
{
  "entry": {
    "path": "projects/new-project",
    "category": "projects",
    "entry": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "New Project",
      "status": "active",
      "next_action": "Define requirements",
      "created_at": "2026-01-26T10:00:00.000Z",
      "updated_at": "2026-01-26T10:00:00.000Z",
      "source_channel": "api",
      "confidence": 0.85
    },
    "content": ""
  },
  "message": "Filed as project: New Project.",
  "clarificationNeeded": false
}
```

---

### Chat

#### Send Message

```
POST /api/chat
```

**Request Body**:
```json
{
  "message": "Sarah mentioned the Q2 launch is delayed",
  "conversationId": "optional-conversation-id",
  "hints": "optional category hint"
}
```

**Response** (201 Created):
```json
{
  "conversationId": "uuid",
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "Got it! I've filed...",
    "filedEntryPath": "projects/clientco-integration",
    "filedConfidence": 0.88,
    "createdAt": "2026-01-26T10:00:00.000Z"
  },
  "entry": {
    "path": "projects/clientco-integration",
    "category": "projects",
    "name": "ClientCo Integration",
    "confidence": 0.88
  },
  "clarificationNeeded": false,
  "toolsUsed": ["classify_and_capture"]
}
```

#### List Conversations

```
GET /api/chat/conversations?limit=20&offset=0
```

**Response** (200 OK):
```json
{
  "conversations": [
    {
      "id": "uuid",
      "channel": "chat",
      "createdAt": "2026-01-26T10:00:00.000Z",
      "updatedAt": "2026-01-26T10:05:00.000Z",
      "messageCount": 12
    }
  ]
}
```

#### Get Conversation Messages

```
GET /api/chat/conversations/:id/messages?limit=50
```

**Response** (200 OK):
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Hello",
      "createdAt": "2026-01-26T10:00:00.000Z"
    }
  ]
}
```

---

### Digest

Manually generate a daily digest or weekly review.

```
GET /api/digest?type=daily
GET /api/digest?type=weekly
```

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | `daily` or `weekly` |
| `send` | string | `true` to also send via email (optional) |

**Response** (200 OK):
```json
{
  "type": "daily",
  "content": "Good morning...",
  "generatedAt": "2026-01-26T10:00:00.000Z",
  "emailSent": false
}
```

#### Digest Preferences

```
GET /api/digest/preferences
PUT /api/digest/preferences
```

**PUT Body**:
```json
{
  "focusCategories": ["projects", "admin"],
  "maxItems": 2,
  "maxWords": 140,
  "includeStaleInbox": false
}
```

---

## Offline Queue

Capture requests are queued when the LLM is unavailable and replayed automatically.

### Queue Status

```
GET /api/queue/status
```

**Response**:
```json
{
  "pending": 2,
  "processing": 0,
  "failed": 1
}
```

### Failed Queue Items

```
GET /api/queue/failed
```

**Response**:
```json
{
  "failed": [
    {
      "id": "hash",
      "tool": "classify_and_capture",
      "args": { "text": "..." },
      "channel": "api",
      "createdAt": "2026-02-04T10:00:00.000Z",
      "attempts": 6,
      "lastError": "OpenAI API error: rate limit",
      "nextAttemptAt": "2026-02-04T10:10:00.000Z"
    }
  ]
}
```

## Webhooks

Webhooks are configured via environment variables (see `.env.example`).
When enabled, the system posts JSON payloads on entry lifecycle events:

- `entry.created`
- `entry.updated`
- `entry.deleted`
- `entry.moved`

Each request includes:
- `X-Second-Brain-Event` header with the event type.
- `X-Second-Brain-Signature` header (`sha256=...`) if `WEBHOOK_SECRET` is set.

Example payload:
```json
{
  "id": "uuid",
  "type": "entry.updated",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "data": {
    "path": "projects/my-project",
    "category": "projects",
    "channel": "api",
    "commitHash": "abc123"
  }
}
```
