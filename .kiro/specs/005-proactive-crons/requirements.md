# Requirements Document

## Introduction

This document defines the requirements for the Proactive Crons feature of the Second Brain application. This feature extends the existing cron infrastructure (from spec 003) to add three proactive scheduled jobs that help users stay on top of their knowledge base:

1. **Stale Check** - Flags projects with no updates in a configurable period
2. **Follow-up Reminder** - Surfaces people entries with pending follow-ups
3. **Inactivity Nudge** - Sends a gentle reminder if no captures have occurred recently

These jobs deliver their output via the chat interface, following the existing digest delivery pattern. The feature aligns with the product vision's goal of proactive surfacing without requiring manual intervention.

## Glossary

- **Cron_Scheduler**: The node-cron based scheduler that triggers job execution at configured times (existing from spec 003)
- **CronJobRun**: The database model that tracks execution history of scheduled jobs (existing)
- **Proactive_Service**: The new service component responsible for generating stale check, follow-up reminder, and inactivity nudge content
- **Entry_Service**: The existing service that provides CRUD operations for entries
- **Conversation_Service**: The existing service that manages chat conversations and messages
- **Stale_Project**: A project entry with status "active", "waiting", or "blocked" that has not been updated within STALE_DAYS
- **Follow_Up**: An item in a people entry's follow_ups array representing a pending action
- **Capture**: A user message in the chat system representing a thought or piece of information
- **Nudge**: A gentle reminder message delivered to the chat when user activity is low

## Requirements

### Requirement 1: Stale Project Detection

**User Story:** As a user, I want to be notified about projects that haven't been updated recently, so that I can review and take action on potentially stuck work.

#### Acceptance Criteria

1. THE Cron_Scheduler SHALL schedule the stale check job to run daily at 09:00 in the configured TIMEZONE
2. WHEN the stale check runs, THE Proactive_Service SHALL identify all projects with status "active", "waiting", or "blocked" that have an updated_at date older than STALE_DAYS (default: 14 days)
3. WHEN stale projects are found, THE Proactive_Service SHALL generate a message listing each stale project with its name, status, and days since last update
4. WHEN no stale projects are found, THE Proactive_Service SHALL NOT deliver any message to chat
5. THE Proactive_Service SHALL limit the stale projects list to the 5 oldest projects to keep the message concise
6. WHEN the stale check job completes, THE Cron_Scheduler SHALL create a CronJobRun record with the appropriate status and result

### Requirement 2: Follow-up Reminder

**User Story:** As a user, I want to be reminded about pending follow-ups with people, so that I can maintain my professional relationships.

#### Acceptance Criteria

1. THE Cron_Scheduler SHALL schedule the follow-up reminder job to run daily at 08:00 in the configured TIMEZONE
2. WHEN the follow-up reminder runs, THE Proactive_Service SHALL identify all people entries that have at least one item in their follow_ups array
3. WHEN people with follow-ups are found, THE Proactive_Service SHALL generate a message listing each person with their pending follow-up items
4. WHEN no people with follow-ups are found, THE Proactive_Service SHALL NOT deliver any message to chat
5. THE Proactive_Service SHALL limit the follow-up list to 5 people, prioritizing those with the oldest last_touched date
6. FOR EACH person in the follow-up list, THE Proactive_Service SHALL display up to 2 follow-up items
7. WHEN the follow-up reminder job completes, THE Cron_Scheduler SHALL create a CronJobRun record with the appropriate status and result

### Requirement 3: Inactivity Nudge

**User Story:** As a user, I want to receive a gentle reminder if I haven't captured any thoughts recently, so that I stay engaged with my second brain.

#### Acceptance Criteria

1. THE Cron_Scheduler SHALL schedule the inactivity nudge job to run daily at 20:00 in the configured TIMEZONE
2. WHEN the inactivity nudge runs, THE Proactive_Service SHALL check if any user messages have been created in the last INACTIVITY_DAYS (default: 3 days)
3. IF no user messages exist within INACTIVITY_DAYS, THEN THE Proactive_Service SHALL generate a gentle nudge message encouraging the user to capture a thought
4. IF user messages exist within INACTIVITY_DAYS, THEN THE Proactive_Service SHALL NOT deliver any message to chat
5. THE Proactive_Service SHALL vary the nudge message content to avoid repetition, using at least 3 different message variations
6. WHEN the inactivity nudge job completes, THE Cron_Scheduler SHALL create a CronJobRun record with the appropriate status and result

### Requirement 4: Configuration Management

**User Story:** As a user, I want to configure the proactive job thresholds through environment variables, so that I can customize the behavior to my needs.

#### Acceptance Criteria

1. THE System SHALL read STALE_DAYS from environment variables with default 14
2. THE System SHALL read INACTIVITY_DAYS from environment variables with default 3
3. THE System SHALL read STALE_CHECK_TIME from environment variables with default "09:00"
4. THE System SHALL read FOLLOWUP_REMINDER_TIME from environment variables with default "08:00"
5. THE System SHALL read INACTIVITY_NUDGE_TIME from environment variables with default "20:00"
6. WHEN environment variables contain invalid values, THE System SHALL use default values and log a warning

### Requirement 5: Chat Delivery

**User Story:** As a user, I want proactive notifications delivered to my chat interface, so that I can interact with them conversationally.

#### Acceptance Criteria

1. WHEN a proactive job generates content, THE Proactive_Service SHALL deliver it as an assistant message to the chat conversation
2. THE Proactive_Service SHALL format all proactive messages as markdown for proper rendering in the chat UI
3. WHEN delivering to chat, THE Proactive_Service SHALL reuse the existing conversation if one exists, or create a new one if not

### Requirement 6: Job Execution Tracking

**User Story:** As a system administrator, I want all proactive job executions tracked, so that I can monitor system health and debug issues.

#### Acceptance Criteria

1. WHEN a proactive job starts, THE Cron_Scheduler SHALL create a CronJobRun record with status "running"
2. WHEN a proactive job completes successfully, THE Cron_Scheduler SHALL update the CronJobRun record with status "success" and store the generated content (or "no action needed" if no message was sent)
3. IF a proactive job fails, THEN THE Cron_Scheduler SHALL update the CronJobRun record with status "failed" and store the error message
4. THE Cron_Scheduler SHALL prevent concurrent execution of the same proactive job type
