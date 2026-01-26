# Second Brain API Documentation

## Authentication

All API endpoints (except `/api/health`) require authentication using a Bearer token.

Include the token in the `Authorization` header:

```
Authorization: Bearer your-api-key-here
```

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
      "path": "projects/my-project.md",
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
GET /api/entries/projects/my-project.md
```

**Response** (200 OK):
```json
{
  "path": "projects/my-project.md",
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
    "message": "Entry not found: projects/non-existent.md"
  }
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
  "path": "projects/new-project.md",
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
PATCH /api/entries/projects/my-project.md
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
  "path": "projects/my-project.md",
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
DELETE /api/entries/projects/old-project.md
```

**Response** (204 No Content): Empty response body

---

### Get Index

Get the auto-generated index.md content.

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
| [John Doe](people/john-doe.md) | Met at conference | 2026-01-20 |
...
```

The response is returned as `text/markdown` content type.
