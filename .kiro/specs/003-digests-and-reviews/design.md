# Design Document: Digests and Reviews

## Overview

The Digests and Reviews feature provides automated, scheduled generation of daily digests and weekly reviews for the Second Brain application. This feature proactively surfaces relevant information to help users stay on top of their knowledge base without manual effort.

The system uses node-cron for scheduling, leverages existing Entry and Index services for data access, and delivers content through the chat interface via the Conversation service. All job executions are tracked in the CronJobRun database table for observability and debugging.

Key design principles:
- **Small, actionable output**: Daily digest < 150 words, weekly review < 250 words
- **Next action as unit**: Focus on concrete next steps, not vague summaries
- **Minimal dependencies**: Reuse existing services (Entry, Index, Conversation)
- **Observability**: Track all job runs with status and results

## Architecture

```mermaid
flowchart TB
    subgraph Scheduling
        CRON[node-cron Scheduler]
        CONFIG[Environment Config]
    end
    
    subgraph Services
        DG[Digest Generator Service]
        ES[Entry Service]
        IS[Index Service]
        CS[Conversation Service]
    end
    
    subgraph Storage
        DB[(PostgreSQL)]
        FS[/data/ Markdown Files]
    end
    
    subgraph API
        REST[/api/digest Endpoint]
    end
    
    CONFIG --> CRON
    CRON -->|triggers| DG
    REST -->|manual trigger| DG
    
    DG --> ES
    DG --> IS
    DG --> CS
    
    ES --> FS
    IS --> FS
    CS --> DB
    DG -->|CronJobRun| DB
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Cron Scheduler** | Schedules and triggers digest/review jobs at configured times |
| **Digest Generator** | Generates digest/review content from entry data |
| **Entry Service** | Reads entry data from markdown files (existing) |
| **Index Service** | Provides index.md content for context (existing) |
| **Conversation Service** | Delivers content to chat interface (existing) |
| **CronJobRun** | Tracks job execution history (existing model) |

## Components and Interfaces

### DigestService

The core service responsible for generating digest and review content.

```typescript
interface DigestService {
  /**
   * Generate a daily digest
   * @returns The formatted digest content as markdown
   */
  generateDailyDigest(): Promise<string>;
  
  /**
   * Generate a weekly review
   * @returns The formatted review content as markdown
   */
  generateWeeklyReview(): Promise<string>;
  
  /**
   * Get statistics for a date range
   * @param startDate - Start of the range
   * @param endDate - End of the range
   * @returns Activity statistics
   */
  getActivityStats(startDate: Date, endDate: Date): Promise<ActivityStats>;
}

interface ActivityStats {
  messagesCount: number;
  entriesCreated: {
    people: number;
    projects: number;
    ideas: number;
    admin: number;
    total: number;
  };
  tasksCompleted: number;
}
```

### CronService

Manages scheduled job execution with concurrency control.

```typescript
interface CronService {
  /**
   * Initialize and start all scheduled jobs
   */
  start(): void;
  
  /**
   * Stop all scheduled jobs
   */
  stop(): void;
  
  /**
   * Check if a job is currently running
   * @param jobName - Name of the job
   * @returns True if the job is running
   */
  isJobRunning(jobName: string): boolean;
}

type JobName = 'daily_digest' | 'weekly_review';
```

### DigestConfig

Configuration interface for digest timing.

```typescript
interface DigestConfig {
  timezone: string;           // e.g., "Europe/Berlin"
  digestTime: string;         // e.g., "07:00"
  weeklyReviewDay: string;    // e.g., "sunday"
  weeklyReviewTime: string;   // e.g., "16:00"
  staleInboxDays: number;     // e.g., 3
}
```

### API Endpoint

```typescript
// GET /api/digest?type=daily|weekly
interface DigestResponse {
  type: 'daily' | 'weekly';
  content: string;
  generatedAt: string;
}
```

## Data Models

### CronJobRun (Existing)

The existing Prisma model is sufficient for tracking job execution:

```prisma
model CronJobRun {
  id          String    @id @default(uuid())
  jobName     String    // "daily_digest" | "weekly_review"
  status      JobStatus // running | success | failed
  result      String?   // Generated content or error message
  startedAt   DateTime  @default(now())
  completedAt DateTime?
  
  @@index([jobName, startedAt])
}
```

### Entry Data Access

The digest generator reads entry data through the existing Entry Service:

| Category | Fields Used |
|----------|-------------|
| **Projects** | name, status, next_action, due_date, updated_at |
| **Admin** | name, status, due_date, updated_at |
| **Inbox** | suggested_name, original_text, created_at, status |
| **People** | name, last_touched |

### Message Data Access

For weekly review statistics, we query the Message table:

```sql
-- Count messages in date range
SELECT COUNT(*) FROM "Message" 
WHERE "createdAt" >= :startDate 
AND "createdAt" < :endDate 
AND role = 'user';
```

## Digest Content Generation

### Daily Digest Algorithm

```
1. Load all entries via Entry Service
2. Select Top 3 items:
   a. Active projects with next_action, sorted by due_date (earliest first)
   b. Pending admin tasks, sorted by due_date (earliest first)
   c. Take first 3 from combined list
3. Find Stale Inbox Items:
   a. Filter inbox items with status "needs_review"
   b. Filter where created_at < (now - STALE_INBOX_DAYS)
4. Calculate Small Wins:
   a. Count admin tasks with status "done" and updated_at in last 7 days
   b. Find next pending admin task
5. Format output using template
6. Validate word count < 150
```

### Weekly Review Algorithm

```
1. Calculate date range (7 days ending now)
2. Get Activity Stats:
   a. Count user messages in date range
   b. Count entries created in date range by category
   c. Count admin tasks completed (status changed to "done") in date range
3. Find Open Loops:
   a. Waiting/blocked projects
   b. Stale inbox items
   c. Take top 3 by age
4. Generate Suggestions:
   a. Inbox items needing resolution
   b. People with last_touched > 7 days ago
   c. Active projects without due_date
5. Identify Theme:
   a. Count entries by category
   b. Extract common tags
   c. Generate theme sentence
6. Format output using template
7. Validate word count < 250
```

### Output Templates

**Daily Digest Template:**
```markdown
Good morning, {userName}.

**Top 3 for Today:**
1. {nextAction1} ({projectName1})
2. {nextAction2} ({projectName2})
3. {nextAction3} ({projectName3})

{IF staleInboxItems}
**Might Be Stuck:**
- "{inboxItemText}" has been in inbox for {days} days. Want to clarify?
{ENDIF}

{IF completedTasks > 0}
**Small Win:**
- You completed {completedTasks} admin tasks this week. {nextAdminTask} is next.
{ENDIF}

---
Reply to this message to capture a thought.
```

**Weekly Review Template:**
```markdown
# Week of {startDate} - {endDate}

**What Happened:**
- {messagesCount} thoughts captured
- {entriesCreated} entries created ({breakdown})
- {tasksCompleted} tasks completed

**Biggest Open Loops:**
1. {openLoop1}
2. {openLoop2}
3. {openLoop3}

**Suggested Focus for Next Week:**
1. {suggestion1}
2. {suggestion2}
3. {suggestion3}

**Theme I Noticed:**
{themeDescription}

---
Reply with thoughts or adjustments.
```

## Scheduling Implementation

### Cron Expression Generation

Convert human-readable config to cron expressions:

```typescript
function generateCronExpression(time: string, dayOfWeek?: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  
  if (dayOfWeek) {
    // Weekly: "0 16 * * 0" for Sunday 16:00
    const dayNum = dayOfWeekToNumber(dayOfWeek);
    return `${minutes} ${hours} * * ${dayNum}`;
  }
  
  // Daily: "0 7 * * *" for 07:00
  return `${minutes} ${hours} * * *`;
}

function dayOfWeekToNumber(day: string): number {
  const days: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6
  };
  return days[day.toLowerCase()] ?? 0;
}
```

### Timezone Handling

Use node-cron's timezone option:

```typescript
cron.schedule(expression, callback, {
  timezone: config.timezone
});
```

### Concurrency Control

Prevent overlapping job execution using in-memory flags:

```typescript
class CronService {
  private runningJobs: Set<string> = new Set();
  
  async executeJob(jobName: string, generator: () => Promise<string>): Promise<void> {
    if (this.runningJobs.has(jobName)) {
      console.log(`Job ${jobName} already running, skipping`);
      return;
    }
    
    this.runningJobs.add(jobName);
    try {
      // Execute job...
    } finally {
      this.runningJobs.delete(jobName);
    }
  }
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified for property-based testing:

### Property 1: Top 3 Selection Respects Priority and Limit

*For any* set of active projects and pending admin tasks, the daily digest's Top 3 section SHALL contain at most 3 items, and those items SHALL be ordered by due date (earliest first), with items having due dates appearing before items without due dates.

**Validates: Requirements 1.1**

### Property 2: Stale Inbox Items Appear in Might Be Stuck

*For any* set of inbox items with various creation dates, all items with status "needs_review" and created_at older than STALE_INBOX_DAYS SHALL appear in the "Might Be Stuck" section, and no items newer than the threshold SHALL appear.

**Validates: Requirements 1.2**

### Property 3: Small Win Section Accuracy

*For any* set of admin tasks with various statuses and updated_at dates, the Small Win section SHALL appear if and only if there exists at least one admin task with status "done" and updated_at within the last 7 days, and the count displayed SHALL equal the actual count of such tasks.

**Validates: Requirements 1.3**

### Property 4: Daily Digest Structure Invariant

*For any* valid entry data, the generated daily digest SHALL always contain: a greeting line, a "Top 3 for Today" section header, and a footer with "Reply to this message". The "Might Be Stuck" and "Small Win" sections are conditional but when present SHALL appear in that order.

**Validates: Requirements 1.4**

### Property 5: Daily Digest Word Count Limit

*For any* valid entry data (including edge cases with many entries, long names, and long next actions), the generated daily digest SHALL contain fewer than 150 words.

**Validates: Requirements 1.5**

### Property 6: Weekly Review Statistics Accuracy

*For any* set of messages and entries created within a date range, the weekly review's "What Happened" section SHALL report counts that exactly match the actual counts of user messages, entries created by category, and admin tasks completed.

**Validates: Requirements 2.1**

### Property 7: Open Loops Selection

*For any* set of projects and inbox items, the "Biggest Open Loops" section SHALL contain at most 3 items, selected from waiting/blocked projects and stale inbox items, ordered by age (oldest first).

**Validates: Requirements 2.2**

### Property 8: Weekly Review Structure Invariant

*For any* valid entry and activity data, the generated weekly review SHALL always contain sections in this order: "What Happened", "Biggest Open Loops", "Suggested Focus for Next Week", "Theme I Noticed", and a footer with "Reply with thoughts".

**Validates: Requirements 2.5**

### Property 9: Weekly Review Word Count Limit

*For any* valid entry and activity data (including edge cases with many entries and long content), the generated weekly review SHALL contain fewer than 250 words.

**Validates: Requirements 2.6**

### Property 10: Cron Expression Generation

*For any* valid time string in "HH:MM" format and optional day of week, the generated cron expression SHALL correctly represent that schedule. Specifically, parsing the cron expression back SHALL yield the same hour, minute, and day of week.

**Validates: Requirements 3.1, 3.2**

### Property 11: Concurrent Job Prevention

*For any* job name, if a job is currently running (in the runningJobs set), attempting to execute the same job SHALL return immediately without starting a new execution, and the running job count SHALL remain 1.

**Validates: Requirements 3.6**

### Property 12: Markdown Output Validity

*For any* generated digest or review content, the output SHALL be valid markdown that can be parsed without errors, containing only standard markdown elements (headers, bold, lists, horizontal rules).

**Validates: Requirements 4.3**

## Error Handling

### Job Execution Errors

| Error Scenario | Handling |
|----------------|----------|
| Entry Service unavailable | Log error, set CronJobRun status to "failed", store error message |
| Database connection lost | Retry once after 5 seconds, then fail with logged error |
| Invalid entry data | Skip malformed entries, continue with valid ones, log warning |
| Word count exceeded | Truncate content with "..." indicator, log warning |

### Configuration Errors

| Error Scenario | Handling |
|----------------|----------|
| Invalid DIGEST_TIME format | Use default "07:00", log warning |
| Invalid WEEKLY_REVIEW_DAY | Use default "sunday", log warning |
| Invalid TIMEZONE | Use default "Europe/Berlin", log warning |
| Missing env vars | Use defaults for all optional vars |

### API Errors

| Error Scenario | Response |
|----------------|----------|
| Invalid type parameter | 400 Bad Request with message |
| Generation failure | 500 Internal Server Error with error details |
| Unauthorized | 401 Unauthorized (existing auth middleware) |

## Testing Strategy

### Unit Tests

Unit tests focus on specific examples and edge cases:

1. **Digest Content Generation**
   - Empty entries (no projects, no admin tasks)
   - Single entry in each category
   - Entries without due dates
   - Entries with very long names (truncation)

2. **Cron Expression Parsing**
   - Valid time formats: "07:00", "23:59", "00:00"
   - Valid days: "sunday", "monday", "SUNDAY" (case insensitive)
   - Edge cases: midnight, end of day

3. **Configuration Loading**
   - Missing environment variables
   - Invalid format values
   - Boundary values

4. **API Endpoint**
   - Valid requests for daily/weekly
   - Invalid type parameter
   - Authentication required

### Property-Based Tests

Property tests use fast-check library with the following configuration:

- **numRuns**: 10-20 for pure functions (digest generation), 3-5 for DB operations
- Each test references its design document property via comment tag

**Test Tags Format**: `Feature: digests-and-reviews, Property {N}: {property_title}`

| Property | Test Focus | numRuns |
|----------|------------|---------|
| 1 | Top 3 selection with random projects/tasks | 15 |
| 2 | Stale inbox detection with random dates | 15 |
| 3 | Small win calculation with random tasks | 15 |
| 4 | Daily digest structure validation | 10 |
| 5 | Daily digest word count | 20 |
| 6 | Weekly stats accuracy | 10 |
| 7 | Open loops selection | 15 |
| 8 | Weekly review structure | 10 |
| 9 | Weekly review word count | 20 |
| 10 | Cron expression round-trip | 20 |
| 11 | Concurrency prevention | 10 |
| 12 | Markdown validity | 15 |

### Integration Tests

1. **End-to-end digest generation** - Verify full flow from entry data to chat message
2. **Cron job lifecycle** - Verify CronJobRun record creation and updates
3. **API endpoint** - Verify response format and content

### Test Data Generators (fast-check arbitraries)

```typescript
// Project entry generator
const projectArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  status: fc.constantFrom('active', 'waiting', 'blocked', 'someday', 'done'),
  next_action: fc.string({ maxLength: 100 }),
  due_date: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })),
  updated_at: fc.date()
});

// Admin task generator
const adminArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  status: fc.constantFrom('pending', 'done'),
  due_date: fc.option(fc.date()),
  updated_at: fc.date()
});

// Inbox item generator
const inboxArbitrary = fc.record({
  suggested_name: fc.string({ minLength: 1, maxLength: 50 }),
  original_text: fc.string({ maxLength: 200 }),
  status: fc.constant('needs_review'),
  created_at: fc.date()
});

// Time string generator (HH:MM format)
const timeArbitrary = fc.tuple(
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 })
).map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

// Day of week generator
const dayOfWeekArbitrary = fc.constantFrom(
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
);
```
