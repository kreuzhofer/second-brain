# Implementation Plan: Digests and Reviews

## Overview

This implementation plan breaks down the digests and reviews feature into incremental coding tasks. The approach builds from configuration and data access, through digest generation logic, to scheduling and API delivery. Property-based tests are included as optional sub-tasks to validate correctness properties from the design.

## Tasks

- [x] 1. Extend environment configuration for digest settings
  - [x] 1.1 Add digest configuration to env.ts
    - Add DIGEST_TIME, WEEKLY_REVIEW_DAY, WEEKLY_REVIEW_TIME, STALE_INBOX_DAYS to EnvConfig interface
    - Add parsing logic with defaults: "07:00", "sunday", "16:00", 3
    - Add validation for time format (HH:MM) and day of week
    - Log warnings for invalid values and use defaults
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 2. Create DigestService for content generation
  - [x] 2.1 Create digest.service.ts with basic structure
    - Create DigestService class with constructor accepting EntryService and IndexService
    - Define ActivityStats interface
    - Add singleton getter function
    - _Requirements: 1.1, 2.1_
  
  - [x] 2.2 Implement daily digest generation
    - Implement generateDailyDigest() method
    - Implement getTop3Items() to select active projects and pending admin tasks sorted by due date
    - Implement getStaleInboxItems() to find items older than STALE_INBOX_DAYS
    - Implement getSmallWins() to count completed admin tasks in last 7 days
    - Implement formatDailyDigest() with template from design
    - Add word count validation (< 150 words)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 2.3 Write property tests for daily digest
    - **Property 1: Top 3 Selection Respects Priority and Limit**
    - **Property 2: Stale Inbox Items Appear in Might Be Stuck**
    - **Property 3: Small Win Section Accuracy**
    - **Property 4: Daily Digest Structure Invariant**
    - **Property 5: Daily Digest Word Count Limit**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
  
  - [x] 2.4 Implement weekly review generation
    - Implement generateWeeklyReview() method
    - Implement getActivityStats() to count messages and entries in date range
    - Implement getOpenLoops() to find waiting/blocked projects and stale inbox items
    - Implement getSuggestions() for focus areas based on inbox, people, projects
    - Implement identifyTheme() based on entry categories and tags
    - Implement formatWeeklyReview() with template from design
    - Add word count validation (< 250 words)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 2.5 Write property tests for weekly review
    - **Property 6: Weekly Review Statistics Accuracy**
    - **Property 7: Open Loops Selection**
    - **Property 8: Weekly Review Structure Invariant**
    - **Property 9: Weekly Review Word Count Limit**
    - **Validates: Requirements 2.1, 2.2, 2.5, 2.6**

- [x] 3. Checkpoint - Verify digest generation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create CronService for job scheduling
  - [x] 4.1 Create cron.service.ts with scheduling logic
    - Create CronService class with node-cron integration
    - Implement generateCronExpression() for time and day-of-week conversion
    - Implement dayOfWeekToNumber() helper
    - Implement start() to schedule daily_digest and weekly_review jobs
    - Implement stop() to cancel all scheduled jobs
    - _Requirements: 3.1, 3.2_
  
  - [x] 4.2 Write property test for cron expression generation
    - **Property 10: Cron Expression Generation**
    - **Validates: Requirements 3.1, 3.2**
  
  - [x] 4.3 Implement job execution with CronJobRun tracking
    - Implement executeJob() method with CronJobRun record creation
    - Create CronJobRun with status "running" at job start
    - Update to "success" with result on completion
    - Update to "failed" with error message on failure
    - _Requirements: 3.3, 3.4, 3.5_
  
  - [x] 4.4 Implement concurrency control
    - Add runningJobs Set to track in-progress jobs
    - Check and skip if job already running
    - Clean up runningJobs on job completion
    - _Requirements: 3.6_
  
  - [x] 4.5 Write property test for concurrency control
    - **Property 11: Concurrent Job Prevention**
    - **Validates: Requirements 3.6**

- [x] 5. Implement chat delivery for digests
  - [x] 5.1 Add deliverToChat() method to DigestService
    - Get or create conversation with channel "chat"
    - Add digest content as assistant message
    - Ensure markdown formatting is preserved
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 5.2 Write property test for markdown output
    - **Property 12: Markdown Output Validity**
    - **Validates: Requirements 4.3**

- [x] 6. Create API endpoint for manual digest triggering
  - [x] 6.1 Create digest route
    - Create backend/src/routes/digest.ts
    - Implement GET /api/digest with type query parameter
    - Validate type is "daily" or "weekly"
    - Call DigestService without creating CronJobRun
    - Return DigestResponse with type, content, generatedAt
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 6.2 Register digest route in main router
    - Add digest route to backend/src/index.ts
    - Apply auth middleware
    - _Requirements: 5.1, 5.2_

- [x] 7. Integrate CronService with application startup
  - [x] 7.1 Initialize CronService in backend/src/index.ts
    - Import and start CronService after database connection
    - Add graceful shutdown to stop cron jobs
    - _Requirements: 3.1, 3.2_

- [x] 8. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The implementation uses existing EntryService, IndexService, and ConversationService
- CronJobRun model already exists in Prisma schema - no migration needed
