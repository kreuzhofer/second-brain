# Requirements Document

## Introduction

This document defines the requirements for the Digests and Reviews feature of the JustDo.so application. This feature provides proactive surfacing of relevant information through scheduled daily digests and weekly reviews, helping users stay on top of their knowledge base without manual effort.

The feature delivers concise, actionable summaries via the chat interface, following the design principle of "small, frequent, actionable output" with daily digests under 150 words and weekly reviews under 250 words.

## Glossary

- **Digest_Generator**: The service component responsible for generating daily digest and weekly review content
- **Cron_Scheduler**: The node-cron based scheduler that triggers digest and review generation at configured times
- **CronJobRun**: The database model that tracks execution history of scheduled jobs
- **Entry**: A markdown file with YAML frontmatter representing a person, project, idea, admin task, or inbox item
- **Index_Service**: The existing service that provides access to the index.md file containing entry summaries
- **Entry_Service**: The existing service that provides CRUD operations for entries
- **Conversation_Service**: The existing service that manages chat conversations and messages
- **Active_Project**: A project entry with status "active"
- **Waiting_Project**: A project entry with status "waiting" or "blocked"
- **Inbox_Item**: An entry in the inbox folder with status "needs_review"
- **Stale_Inbox_Item**: An inbox item that has been in needs_review status for more than a configurable threshold (default: 3 days)
- **Pending_Admin_Task**: An admin entry with status "pending"
- **Next_Action**: The concrete next step stored in a project entry

## Requirements

### Requirement 1: Daily Digest Generation

**User Story:** As a user, I want to receive a daily digest of my most important items, so that I can start my day with clear priorities.

#### Acceptance Criteria

1. WHEN the daily digest is generated, THE Digest_Generator SHALL include up to 3 top priority items based on active projects with next actions and pending admin tasks with due dates
2. WHEN an inbox item has been in needs_review status for more than the stale threshold, THE Digest_Generator SHALL include it in a "Might Be Stuck" section
3. WHEN admin tasks have been completed in the past 7 days, THE Digest_Generator SHALL include a "Small Win" section highlighting the accomplishment count and suggesting the next pending task
4. THE Digest_Generator SHALL format the daily digest with a greeting, Top 3 section, optional Might Be Stuck section, optional Small Win section, and a footer prompting for replies
5. THE Digest_Generator SHALL limit the daily digest to under 150 words

### Requirement 2: Weekly Review Generation

**User Story:** As a user, I want to receive a weekly review summarizing my activity and suggesting focus areas, so that I can reflect on progress and plan ahead.

#### Acceptance Criteria

1. WHEN the weekly review is generated, THE Digest_Generator SHALL include statistics for the past 7 days: thoughts captured (messages), entries created by category, and tasks completed
2. WHEN generating the weekly review, THE Digest_Generator SHALL identify the top 3 biggest open loops from waiting/blocked projects and stale inbox items
3. WHEN generating the weekly review, THE Digest_Generator SHALL suggest up to 3 focus areas for the next week based on inbox items needing resolution, people entries with old last_touched dates, and projects needing deadlines
4. WHEN generating the weekly review, THE Digest_Generator SHALL identify a theme from the week's activity based on entry categories and tags
5. THE Digest_Generator SHALL format the weekly review with sections: What Happened, Biggest Open Loops, Suggested Focus, Theme I Noticed, and a footer prompting for replies
6. THE Digest_Generator SHALL limit the weekly review to under 250 words

### Requirement 3: Scheduled Job Execution

**User Story:** As a user, I want digests and reviews to be generated automatically at configured times, so that I receive them without manual intervention.

#### Acceptance Criteria

1. THE Cron_Scheduler SHALL schedule the daily digest job to run at the time specified by DIGEST_TIME environment variable (default: 07:00) in the configured TIMEZONE
2. THE Cron_Scheduler SHALL schedule the weekly review job to run on the day specified by WEEKLY_REVIEW_DAY (default: sunday) at the time specified by WEEKLY_REVIEW_TIME (default: 16:00) in the configured TIMEZONE
3. WHEN a scheduled job starts, THE Cron_Scheduler SHALL create a CronJobRun record with status "running"
4. WHEN a scheduled job completes successfully, THE Cron_Scheduler SHALL update the CronJobRun record with status "success" and store the generated content in the result field
5. IF a scheduled job fails, THEN THE Cron_Scheduler SHALL update the CronJobRun record with status "failed" and store the error message in the result field
6. THE Cron_Scheduler SHALL prevent concurrent execution of the same job type

### Requirement 4: Digest Delivery via Chat

**User Story:** As a user, I want to receive digests and reviews in my chat interface, so that I can interact with them conversationally.

#### Acceptance Criteria

1. WHEN a digest or review is generated, THE Digest_Generator SHALL create a new conversation with channel "chat" if no recent conversation exists
2. WHEN a digest or review is generated, THE Digest_Generator SHALL add the content as an assistant message to the conversation
3. THE Digest_Generator SHALL format digest and review content as markdown for proper rendering in the chat UI

### Requirement 5: Manual Digest Triggering

**User Story:** As a user, I want to manually request a digest or review at any time, so that I can get an update when I need it.

#### Acceptance Criteria

1. WHEN a GET request is made to /api/digest with type=daily, THE API SHALL return the generated daily digest content
2. WHEN a GET request is made to /api/digest with type=weekly, THE API SHALL return the generated weekly review content
3. WHEN manually triggered, THE Digest_Generator SHALL generate fresh content based on current data without creating a CronJobRun record

### Requirement 6: Configuration Management

**User Story:** As a user, I want to configure digest timing through environment variables, so that I can customize when I receive updates.

#### Acceptance Criteria

1. THE System SHALL read TIMEZONE from environment variables with default "Europe/Berlin"
2. THE System SHALL read DIGEST_TIME from environment variables with default "07:00"
3. THE System SHALL read WEEKLY_REVIEW_DAY from environment variables with default "sunday"
4. THE System SHALL read WEEKLY_REVIEW_TIME from environment variables with default "16:00"
5. THE System SHALL read STALE_INBOX_DAYS from environment variables with default "3"
6. WHEN environment variables are invalid, THE System SHALL use default values and log a warning

