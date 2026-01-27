# Design Document: Proactive Crons

## Overview

The Proactive Crons feature extends the existing cron infrastructure to add three scheduled jobs that proactively surface relevant information to users:

1. **Stale Check** (09:00 daily) - Identifies projects that haven't been updated recently
2. **Follow-up Reminder** (08:00 daily) - Surfaces people with pending follow-up items
3. **Inactivity Nudge** (20:00 daily) - Encourages engagement when capture activity is low

The implementation follows the established patterns from spec 003 (Digests and Reviews):
- Uses node-cron for scheduling with timezone support
- Tracks job execution via CronJobRun records
- Delivers content through the chat interface
- Provides environment variable configuration

Key design principles:
- **Conditional delivery**: Only send messages when there's actionable content
- **Concise output**: Keep messages short and focused
- **Non-intrusive**: Gentle nudges, not aggressive notifications
- **Reuse existing infrastructure**: Leverage CronService, ConversationService, EntryService

## Architecture

```mermaid
flowchart TB
    subgraph Scheduling
        CRON[CronService]
        CONFIG[Environment Config]
    end
    
    subgraph Services
        PS[ProactiveService]
        ES[EntryService]
        CS[ConversationService]
    end
    
    subgraph Storage
        DB[(PostgreSQL)]
        FS[/memory/ Markdown Files]
    end
    
    subgraph Jobs
        SC[Stale Check Job]
        FR[Follow-up Reminder Job]
        IN[Inactivity Nudge Job]
    end
    
    CONFIG --> CRON
    CRON -->|09:00| SC
    CRON -->|08:00| FR
    CRON -->|20:00| IN
    
    SC --> PS
    FR --> PS
    IN --> PS
    
    PS --> ES
    PS --> CS
    PS -->|check messages| DB
    
    ES --> FS
    CS --> DB
    CRON -->|CronJobRun| DB
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **CronService** | Schedules and triggers proactive jobs at configured times (extended from spec 003) |
| **ProactiveService** | Generates stale check, follow-up reminder, and inactivity nudge content |
| **EntryService** | Reads entry data from markdown files (existing) |
| **ConversationService** | Delivers content to chat interface (existing) |
| **CronJobRun** | Tracks job execution history (existing model) |

## Components and Interfaces

### ProactiveService

The core service responsible for generating proactive notification content.

```typescript
interface ProactiveService {
  /**
   * Generate stale project check content
   * @returns Content string if stale projects found, null otherwise
   */
  generateStaleCheck(): Promise<string | null>;
  
  /**
   * Generate follow-up reminder content
   * @returns Content string if follow-ups found, null otherwise
   */
  generateFollowUpReminder(): Promise<string | null>;
  
  /**
   * Generate inactivity nudge content
   * @returns Content string if user inactive, null otherwise
   */
  generateInactivityNudge(): Promise<string | null>;
  
  /**
   * Deliver content to chat (reuses existing pattern)
   * @param content - The markdown content to deliver
   */
  deliverToChat(content: string): Promise<void>;
}
```

### StaleProject Interface

```typescript
interface StaleProject {
  name: string;
  status: 'active' | 'waiting' | 'blocked';
  daysSinceUpdate: number;
  path: string;
}
```

### FollowUpPerson Interface

```typescript
interface FollowUpPerson {
  name: string;
  followUps: string[];
  lastTouched: string | null;
  daysSinceContact: number;
}
```

### Extended CronService

The existing CronService will be extended to support the new job types:

```typescript
// Extended JobName type
type JobName = 
  | 'daily_digest' 
  | 'weekly_review' 
  | 'stale_check' 
  | 'followup_reminder' 
  | 'inactivity_nudge';
```

### Extended EnvConfig

```typescript
interface EnvConfig {
  // ... existing fields ...
  
  // Proactive cron configuration
  STALE_DAYS: number;           // default: 14
  INACTIVITY_DAYS: number;      // default: 3
  STALE_CHECK_TIME: string;     // default: "09:00"
  FOLLOWUP_REMINDER_TIME: string; // default: "08:00"
  INACTIVITY_NUDGE_TIME: string;  // default: "20:00"
}
```

## Data Models

### Entry Data Access

The ProactiveService reads entry data through the existing EntryService:

| Category | Fields Used | Purpose |
|----------|-------------|---------|
| **Projects** | name, status, updated_at, path | Stale project detection |
| **People** | name, follow_ups, last_touched | Follow-up reminders |

### Message Data Access

For inactivity detection, we query the Message table:

```sql
-- Check for recent user messages
SELECT COUNT(*) FROM "Message" 
WHERE "createdAt" >= :thresholdDate
AND role = 'user';
```

### CronJobRun (Existing)

The existing Prisma model supports the new job types without modification:

```prisma
model CronJobRun {
  id          String    @id @default(uuid())
  jobName     String    // Now includes: "stale_check", "followup_reminder", "inactivity_nudge"
  status      JobStatus // running | success | failed
  result      String?   // Generated content, "no action needed", or error message
  startedAt   DateTime  @default(now())
  completedAt DateTime?
  
  @@index([jobName, startedAt])
}
```

## Content Generation

### Stale Check Algorithm

```
1. Load all projects via EntryService
2. Filter to status in ['active', 'waiting', 'blocked']
3. Calculate days since updated_at for each
4. Filter where daysSinceUpdate > STALE_DAYS
5. Sort by daysSinceUpdate descending (oldest first)
6. Take top 5
7. If empty, return null (no message)
8. Format output using template
```

### Follow-up Reminder Algorithm

```
1. Load all people entries via EntryService
2. Filter to entries with non-empty follow_ups array
3. Calculate days since last_touched for each
4. Sort by daysSinceContact descending (oldest first)
5. Take top 5 people
6. For each person, take up to 2 follow-up items
7. If empty, return null (no message)
8. Format output using template
```

### Inactivity Nudge Algorithm

```
1. Calculate threshold date (now - INACTIVITY_DAYS)
2. Query Message table for user messages since threshold
3. If count > 0, return null (user is active)
4. Select random nudge message from variations
5. Format output using template
```

### Output Templates

**Stale Check Template:**
```markdown
**🔍 Stale Project Check**

These projects haven't been updated in a while:

{FOR EACH project}
- **{name}** ({status}) – {daysSinceUpdate} days since last update
{END FOR}

Consider reviewing these to keep things moving.
```

**Follow-up Reminder Template:**
```markdown
**👋 Follow-up Reminder**

You have pending follow-ups with:

{FOR EACH person}
**{name}** (last contact: {daysSinceContact} days ago)
{FOR EACH followUp, max 2}
  - {followUp}
{END FOR}
{END FOR}

Reply to mark any as done or add notes.
```

**Inactivity Nudge Template (Variations):**
```markdown
// Variation 1
**💭 Quick thought?**

It's been {days} days since your last capture. Even a small thought counts!

Reply with anything on your mind.

// Variation 2
**🌱 Time to capture?**

Your second brain misses you! {days} days without a new thought.

What's one thing you're working on right now?

// Variation 3
**📝 Gentle nudge**

Haven't heard from you in {days} days. No pressure, but your future self will thank you for capturing that idea floating around.

What's on your mind?
```

## Scheduling Implementation

### Cron Expression Generation

Reuses the existing `generateCronExpression` function from spec 003:

```typescript
// Stale check at 09:00 daily
const staleCheckExpr = generateCronExpression('09:00'); // "0 9 * * *"

// Follow-up reminder at 08:00 daily
const followUpExpr = generateCronExpression('08:00'); // "0 8 * * *"

// Inactivity nudge at 20:00 daily
const inactivityExpr = generateCronExpression('20:00'); // "0 20 * * *"
```

### Conditional Delivery Pattern

Unlike digests which always generate content, proactive jobs only deliver when there's actionable content:

```typescript
async executeProactiveJob(
  jobName: JobName,
  generator: () => Promise<string | null>
): Promise<CronJobResult> {
  // ... create CronJobRun with status 'running' ...
  
  const content = await generator();
  
  if (content === null) {
    // No action needed - update CronJobRun but don't deliver
    await this.prisma.cronJobRun.update({
      where: { id: cronJobRun.id },
      data: {
        status: 'success',
        result: 'no action needed',
        completedAt: new Date()
      }
    });
    return { jobName, success: true, content: null };
  }
  
  // Deliver to chat and update CronJobRun
  await this.proactiveService.deliverToChat(content);
  // ... update CronJobRun with content ...
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified for property-based testing:

### Property 1: Stale Project Detection Correctness

*For any* set of projects with various statuses and updated_at dates, the stale detection function SHALL return exactly those projects where:
- status is "active", "waiting", or "blocked", AND
- updated_at is older than STALE_DAYS

If no projects meet these criteria, the function SHALL return null.

**Validates: Requirements 1.2, 1.4**

### Property 2: Stale Check Output Invariants

*For any* non-empty set of stale projects, the generated stale check message SHALL:
- Contain at most 5 projects
- Include each project's name, status, and days since update
- List projects in order of staleness (oldest first)

**Validates: Requirements 1.3, 1.5**

### Property 3: Follow-up Detection Correctness

*For any* set of people entries with various follow_ups arrays, the follow-up detection function SHALL return exactly those people where follow_ups array has at least one item. If no people have follow-ups, the function SHALL return null.

**Validates: Requirements 2.2, 2.4**

### Property 4: Follow-up Output Invariants

*For any* non-empty set of people with follow-ups, the generated follow-up reminder message SHALL:
- Contain at most 5 people
- List people in order of last_touched (oldest first)
- Include at most 2 follow-up items per person
- Include each person's name and their follow-up items

**Validates: Requirements 2.3, 2.5, 2.6**

### Property 5: Inactivity Detection Correctness

*For any* set of messages with various creation dates and roles, the inactivity detection function SHALL:
- Return a nudge message if no user messages exist within INACTIVITY_DAYS
- Return null if at least one user message exists within INACTIVITY_DAYS

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 6: Proactive Message Markdown Validity

*For any* generated proactive message (stale check, follow-up reminder, or inactivity nudge), the output SHALL be valid markdown that can be parsed without errors.

**Validates: Requirements 5.2**

## Error Handling

### Job Execution Errors

| Error Scenario | Handling |
|----------------|----------|
| EntryService unavailable | Log error, set CronJobRun status to "failed", store error message |
| Database connection lost | Retry once after 5 seconds, then fail with logged error |
| Invalid entry data | Skip malformed entries, continue with valid ones, log warning |

### Configuration Errors

| Error Scenario | Handling |
|----------------|----------|
| Invalid STALE_DAYS value | Use default 14, log warning |
| Invalid INACTIVITY_DAYS value | Use default 3, log warning |
| Invalid time format for job schedules | Use default times, log warning |

### Conditional Delivery

| Scenario | Behavior |
|----------|----------|
| No stale projects found | Return null, CronJobRun result = "no action needed" |
| No follow-ups found | Return null, CronJobRun result = "no action needed" |
| User is active | Return null, CronJobRun result = "no action needed" |

## Testing Strategy

### Unit Tests

Unit tests focus on specific examples and edge cases:

1. **Stale Project Detection**
   - Empty projects list
   - All projects are fresh (none stale)
   - Mix of stale and fresh projects
   - Projects with different statuses (active, waiting, blocked, done, someday)
   - Edge case: project updated exactly STALE_DAYS ago

2. **Follow-up Reminder**
   - Empty people list
   - All people have empty follow_ups arrays
   - Mix of people with and without follow-ups
   - Person with more than 2 follow-ups (verify truncation)
   - Edge case: person with null last_touched

3. **Inactivity Nudge**
   - No messages in database
   - Only assistant messages (no user messages)
   - User message exactly at threshold boundary
   - Recent user messages (should return null)

4. **Configuration Loading**
   - Missing environment variables (use defaults)
   - Invalid numeric values
   - Invalid time formats

### Property-Based Tests

Property tests use fast-check library with the following configuration:

- **numRuns**: 3 (per workspace guidelines)
- Each test references its design document property via comment tag

**Test Tags Format**: `Feature: proactive-crons, Property {N}: {property_title}`

| Property | Test Focus | numRuns |
|----------|------------|---------|
| 1 | Stale project filtering with random projects | 3 |
| 2 | Stale check output format and limits | 3 |
| 3 | Follow-up filtering with random people | 3 |
| 4 | Follow-up output format and limits | 3 |
| 5 | Inactivity detection with random messages | 3 |
| 6 | Markdown validity of generated content | 3 |

### Integration Tests

1. **End-to-end stale check** - Verify full flow from entry data to chat message
2. **End-to-end follow-up reminder** - Verify full flow with people entries
3. **End-to-end inactivity nudge** - Verify message query and delivery
4. **Cron job lifecycle** - Verify CronJobRun record creation and updates
5. **Conditional delivery** - Verify no message sent when conditions not met

### Test Data Generators (fast-check arbitraries)

```typescript
// Project entry generator for stale check testing
const projectArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  status: fc.constantFrom('active', 'waiting', 'blocked', 'someday', 'done'),
  updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
  path: fc.string({ minLength: 1, maxLength: 30 }).map(s => `projects/${s}.md`)
});

// People entry generator for follow-up testing
const personArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  follow_ups: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
  last_touched: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0]))
});

// Message generator for inactivity testing
const messageArbitrary = fc.record({
  role: fc.constantFrom('user', 'assistant'),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
});

// Days configuration generator
const daysConfigArbitrary = fc.integer({ min: 1, max: 30 });
```
