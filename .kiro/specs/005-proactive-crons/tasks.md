# Implementation Plan: Proactive Crons

## Overview

This implementation plan extends the existing cron infrastructure to add three proactive scheduled jobs: stale check, follow-up reminder, and inactivity nudge. The approach builds incrementally on the existing CronService and follows established patterns from spec 003.

## Tasks

- [x] 1. Extend environment configuration for proactive cron settings
  - [x] 1.1 Add proactive cron configuration to env.ts
    - Add STALE_DAYS, INACTIVITY_DAYS to EnvConfig interface
    - Add STALE_CHECK_TIME, FOLLOWUP_REMINDER_TIME, INACTIVITY_NUDGE_TIME to EnvConfig interface
    - Add parsing logic with defaults: 14, 3, "09:00", "08:00", "20:00"
    - Add validation for time formats and numeric values
    - Log warnings for invalid values and use defaults
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 2. Create ProactiveService for content generation
  - [x] 2.1 Create proactive.service.ts with basic structure
    - Create ProactiveService class with constructor accepting EntryService and ConversationService
    - Define StaleProject and FollowUpPerson interfaces
    - Add singleton getter function
    - Add deliverToChat method (reuse pattern from DigestService)
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 2.2 Implement stale project detection
    - Implement getStaleProjects() to find projects older than STALE_DAYS
    - Filter by status: active, waiting, blocked
    - Sort by staleness (oldest first)
    - Limit to 5 projects
    - Implement generateStaleCheck() returning content or null
    - Implement formatStaleCheck() with template from design
    - _Requirements: 1.2, 1.3, 1.4, 1.5_
  
  - [x] 2.3 Write property tests for stale check
    - **Property 1: Stale Project Detection Correctness**
    - **Property 2: Stale Check Output Invariants**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
  
  - [x] 2.4 Implement follow-up reminder
    - Implement getPeopleWithFollowUps() to find people with non-empty follow_ups
    - Sort by last_touched (oldest first)
    - Limit to 5 people, 2 follow-ups per person
    - Implement generateFollowUpReminder() returning content or null
    - Implement formatFollowUpReminder() with template from design
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 2.5 Write property tests for follow-up reminder
    - **Property 3: Follow-up Detection Correctness**
    - **Property 4: Follow-up Output Invariants**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
  
  - [x] 2.6 Implement inactivity nudge
    - Implement checkUserActivity() to query recent user messages
    - Implement getNudgeMessage() with 3+ message variations
    - Implement generateInactivityNudge() returning content or null
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  
  - [x] 2.7 Write property tests for inactivity nudge
    - **Property 5: Inactivity Detection Correctness**
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 3. Checkpoint - Verify proactive content generation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend CronService for proactive jobs
  - [x] 4.1 Extend JobName type and add proactive job scheduling
    - Add 'stale_check', 'followup_reminder', 'inactivity_nudge' to JobName type
    - Add scheduling for stale check at STALE_CHECK_TIME
    - Add scheduling for follow-up reminder at FOLLOWUP_REMINDER_TIME
    - Add scheduling for inactivity nudge at INACTIVITY_NUDGE_TIME
    - _Requirements: 1.1, 2.1, 3.1_
  
  - [x] 4.2 Implement executeProactiveJob method
    - Create CronJobRun with status "running" at job start
    - Call generator function
    - If content is null, update CronJobRun with "no action needed"
    - If content exists, deliver to chat and update CronJobRun with content
    - Handle errors and update CronJobRun with "failed" status
    - _Requirements: 1.6, 2.7, 3.6, 6.1, 6.2, 6.3, 6.4_
  
  - [x] 4.3 Write property test for markdown output validity
    - **Property 6: Proactive Message Markdown Validity**
    - **Validates: Requirements 5.2**

- [x] 5. Wire proactive jobs into CronService start()
  - [x] 5.1 Add proactive job initialization to CronService.start()
    - Schedule stale_check job with executeProactiveJob
    - Schedule followup_reminder job with executeProactiveJob
    - Schedule inactivity_nudge job with executeProactiveJob
    - Ensure all jobs use timezone from config
    - _Requirements: 1.1, 2.1, 3.1_

- [x] 6. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The implementation reuses existing EntryService, ConversationService, and CronService patterns
- CronJobRun model already supports new job names - no migration needed
- Tests run with `npm test --prefix backend` using `{ numRuns: 3 }` for property tests
