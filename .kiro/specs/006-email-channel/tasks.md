# Implementation Plan: Email Channel

## Overview

This implementation plan builds the email channel feature incrementally, starting with configuration and parsing utilities, then building up to the full IMAP polling and SMTP sending capabilities. Each task builds on previous work, with property tests validating core parsing logic.

## Tasks

- [x] 1. Set up email configuration and dependencies
  - [x] 1.1 Install email dependencies (nodemailer, node-imap, mailparser, and their type definitions)
    - Run `npm install nodemailer node-imap mailparser` in backend
    - Run `npm install -D @types/nodemailer @types/node-imap @types/mailparser` in backend
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 1.2 Create email configuration module (`backend/src/config/email.ts`)
    - Define EmailConfig interface with smtp, imap, pollInterval, and enabled fields
    - Implement loadEmailConfig() function that reads from environment variables
    - Handle missing variables gracefully (set enabled: false)
    - Export getEmailConfig() singleton accessor
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 1.3 Write unit tests for email configuration loading
    - Test with all variables set
    - Test with partial variables (SMTP only, IMAP only)
    - Test with no variables (graceful degradation)
    - Test with invalid port values
    - _Requirements: 1.4_

- [x] 2. Implement email parsing utilities
  - [x] 2.1 Create EmailParser class (`backend/src/services/email-parser.ts`)
    - Implement extractHint() for subject line category hints
    - Implement extractThreadId() for thread ID extraction from subject and body
    - Implement extractText() for body text cleaning (HTML stripping, signature removal, quote removal)
    - Export singleton accessor
    - _Requirements: 2.2, 2.3, 3.3, 3.4, 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 2.2 Write property test for subject hint extraction
    - **Property 3: Subject hint extraction**
    - Generate subjects with various hint types and verify correct extraction
    - **Validates: Requirements 2.2**
  
  - [x] 2.3 Write property test for thread ID extraction
    - **Property 6: Thread ID extraction with fallback**
    - Generate emails with thread ID in subject, body, or both
    - Verify extraction works from either location
    - **Validates: Requirements 3.3, 3.4**
  
  - [x] 2.4 Write property test for email body text extraction
    - **Property 9: Email body text extraction and cleaning**
    - Generate emails with plain text, HTML, signatures, and quotes
    - Verify cleaning rules are applied correctly
    - **Validates: Requirements 2.3, 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 3. Checkpoint - Ensure parsing tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement thread tracking
  - [x] 4.1 Create ThreadTracker class (`backend/src/services/thread-tracker.ts`)
    - Implement generateThreadId() to create `[SB-{8 hex chars}]` format IDs
    - Implement formatThreadId() for email inclusion
    - Implement createThread() to store EmailThread records
    - Implement findConversation() to look up by threadId
    - Implement getByMessageId() to check for duplicates
    - Export singleton accessor
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 4.2 Write property test for thread ID format
    - **Property 4: Thread ID format consistency**
    - Generate many thread IDs and verify format compliance
    - **Validates: Requirements 3.1**
  
  - [x] 4.3 Write unit tests for ThreadTracker database operations
    - Test createThread() stores correct fields
    - Test findConversation() returns correct conversationId
    - Test getByMessageId() for duplicate detection
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Implement SMTP sending
  - [x] 5.1 Create SmtpSender class (`backend/src/services/smtp-sender.ts`)
    - Initialize nodemailer transporter from EmailConfig
    - Implement sendEmail() for generic email sending
    - Implement sendReply() that sets In-Reply-To and References headers
    - Handle send failures gracefully (log and return error result)
    - Export singleton accessor
    - _Requirements: 5.1, 5.3, 5.6_
  
  - [x] 5.2 Create ConfirmationSender class (`backend/src/services/confirmation-sender.ts`)
    - Implement formatConfirmationEmail() to build confirmation content
    - Include entry name, category, confidence in message
    - Include clarification instructions for low-confidence entries
    - Include thread ID in subject and body footer
    - Implement sendConfirmation() that uses SmtpSender
    - Export singleton accessor
    - _Requirements: 5.2, 5.4, 5.5_
  
  - [x] 5.3 Write property test for confirmation email content
    - **Property 7: Confirmation email content based on confidence**
    - Generate entries with various confidence levels
    - Verify correct content inclusion based on confidence
    - **Validates: Requirements 5.2, 5.3, 5.5**
  
  - [x] 5.4 Write property test for thread ID in confirmation emails
    - **Property 5: Thread ID presence in confirmation emails**
    - Verify thread ID appears in both subject and body
    - **Validates: Requirements 3.2, 5.4**

- [x] 6. Checkpoint - Ensure sending tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement IMAP polling
  - [x] 7.1 Create ImapPoller class (`backend/src/services/imap-poller.ts`)
    - Initialize node-imap connection from EmailConfig
    - Implement start() to begin polling at configured interval
    - Implement stop() to halt polling
    - Implement pollNow() for manual polling (testing)
    - Fetch only UNSEEN emails from INBOX
    - Process emails in chronological order
    - Mark processed emails as read
    - Handle connection errors gracefully
    - Export singleton accessor
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 7.2 Write unit tests for IMAP poller (with mocked IMAP)
    - Test start/stop lifecycle
    - Test error handling on connection failure
    - _Requirements: 7.4_

- [x] 8. Implement main EmailService
  - [x] 8.1 Create EmailService class (`backend/src/services/email.service.ts`)
    - Compose EmailParser, ThreadTracker, SmtpSender, ConfirmationSender, ImapPoller
    - Implement isEnabled() to check configuration status
    - Implement processInboundEmail() to orchestrate inbound flow
    - Implement startPolling() and stopPolling() delegating to ImapPoller
    - Wire inbound emails to ChatService for processing
    - Send confirmation replies after processing
    - Export singleton accessor
    - _Requirements: 2.4, 2.5, 2.6, 9.1, 9.2, 9.3, 9.4_
  
  - [x] 8.2 Write integration tests for EmailService
    - Test processInboundEmail() with mocked dependencies
    - Test course correction flow via email reply
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 9. Implement digest email delivery
  - [x] 9.1 Create DigestMailer class (`backend/src/services/digest-mailer.ts`)
    - Implement sendDailyDigest() to format and send daily digest
    - Implement sendWeeklyReview() to format and send weekly review
    - Implement isAvailable() to check if email is enabled
    - Skip silently when email is disabled
    - Send as new thread (no In-Reply-To)
    - Export singleton accessor
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 9.2 Write property test for digest email formatting
    - **Property 8: Digest email formatting**
    - Verify subject indicates digest type
    - Verify body contains digest content
    - Verify no In-Reply-To header
    - **Validates: Requirements 6.2, 6.3, 6.4**
  
  - [x] 9.3 Integrate DigestMailer with existing DigestService
    - Modify DigestService to call DigestMailer after generating digest
    - Ensure email delivery doesn't block digest generation
    - _Requirements: 6.1, 6.5_

- [x] 10. Checkpoint - Ensure all email tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire email channel into application startup
  - [x] 11.1 Update application initialization (`backend/src/services/init.service.ts`)
    - Load email configuration at startup
    - Log email channel status (enabled/disabled)
    - Start IMAP polling if email is enabled
    - _Requirements: 10.1, 10.2, 10.5_
  
  - [x] 11.2 Update environment configuration types (`backend/src/config/env.ts`)
    - Add email-related fields to EnvConfig interface
    - Document optional nature of email variables
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 11.3 Write integration test for graceful degradation
    - Test application starts without email config
    - Test EmailService.isEnabled() returns false
    - Test DigestMailer skips delivery silently
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Property tests use `{ numRuns: 3 }` for database operations and `{ numRuns: 5-10 }` for pure parsing functions per workspace guidelines
- The email channel is designed to be completely optional - the application functions normally without it
- IMAP polling uses node-imap library; SMTP uses nodemailer
- Email parsing uses mailparser for robust MIME handling
