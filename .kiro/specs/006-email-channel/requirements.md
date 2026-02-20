# Requirements Document

## Introduction

The email channel enables bidirectional conversation with the JustDo.so application via SMTP/IMAP. Users can capture thoughts by sending emails to a configured address, receive confirmation replies, and engage in threaded conversations for course corrections. The system also supports outbound email delivery for digests and proactive messages, solving the "user not looking at app" problem.

## Glossary

- **Email_Service**: The core service responsible for sending and receiving emails via SMTP/IMAP protocols
- **Thread_Tracker**: Component that manages email thread identification using the `[SB-{uuid}]` format
- **IMAP_Poller**: Background process that periodically checks for new inbound emails
- **Subject_Parser**: Component that extracts category hints from email subject lines
- **Confirmation_Sender**: Component that sends reply emails confirming entry creation
- **Digest_Mailer**: Component that delivers scheduled digests via email

## Requirements

### Requirement 1: Email Configuration

**User Story:** As a system administrator, I want to configure email settings via environment variables, so that I can enable or disable the email channel without code changes.

#### Acceptance Criteria

1. THE Email_Service SHALL read SMTP configuration from environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
2. THE Email_Service SHALL read IMAP configuration from environment variables (IMAP_HOST, IMAP_USER, IMAP_PASS)
3. THE Email_Service SHALL read polling interval from EMAIL_POLL_INTERVAL environment variable
4. WHEN any required email environment variable is missing, THE Email_Service SHALL gracefully disable email functionality without crashing
5. WHEN email is disabled, THE Email_Service SHALL log a warning message indicating email channel is unavailable
6. THE Email_Service SHALL support an optional SMTP_SECURE environment variable to explicitly control TLS mode
7. WHEN SMTP_SECURE is not set, THE Email_Service SHALL auto-detect TLS mode based on port (465=implicit TLS, 587=STARTTLS)
8. WHEN SMTP_SECURE is set to "true", "yes", or "1", THE Email_Service SHALL use implicit TLS regardless of port
9. WHEN SMTP_SECURE is set to "false", "no", or "0", THE Email_Service SHALL use STARTTLS regardless of port

### Requirement 2: Inbound Email Processing

**User Story:** As a user, I want to send emails to capture thoughts, so that I can add entries to my JustDo.so without opening the app.

#### Acceptance Criteria

1. WHEN the IMAP_Poller runs, THE Email_Service SHALL connect to the configured IMAP server and fetch unread emails
2. WHEN a new email is received, THE Subject_Parser SHALL extract category hints from the subject line using bracket notation ([person], [project], [idea], [task])
3. WHEN a new email is received, THE Email_Service SHALL extract the plain text body content for classification
4. WHEN a new email is received, THE Email_Service SHALL pass the body text and any hints to the classification system
5. WHEN an email is successfully processed, THE Email_Service SHALL mark it as read on the IMAP server
6. WHEN an email fails to process, THE Email_Service SHALL log the error and leave the email unread for retry

### Requirement 3: Thread Identification

**User Story:** As a user, I want to reply to confirmation emails to course-correct classifications, so that I can fix mistakes without starting a new conversation.

#### Acceptance Criteria

1. WHEN a new conversation starts via email, THE Thread_Tracker SHALL generate a unique thread identifier in format `[SB-{uuid}]`
2. WHEN sending a confirmation reply, THE Confirmation_Sender SHALL include the thread identifier in both the subject line and email body footer
3. WHEN receiving an email, THE Thread_Tracker SHALL extract the thread identifier from the subject line
4. IF the thread identifier is not found in the subject, THEN THE Thread_Tracker SHALL search for it in the email body
5. WHEN a thread identifier is found, THE Thread_Tracker SHALL link the email to the existing conversation
6. WHEN no thread identifier is found, THE Thread_Tracker SHALL treat the email as a new conversation

### Requirement 4: Email Thread Database Tracking

**User Story:** As a developer, I want email threads tracked in the database, so that I can maintain conversation continuity across multiple email exchanges.

#### Acceptance Criteria

1. WHEN a new email is received, THE Email_Service SHALL create an EmailThread record with the email's Message-ID header
2. THE EmailThread record SHALL store the threadId linking related emails together
3. THE EmailThread record SHALL store the In-Reply-To header for threading
4. THE EmailThread record SHALL store the subject, sender address, and linked conversationId
5. WHEN looking up an email thread, THE Email_Service SHALL query by threadId to find related messages

### Requirement 5: Outbound Confirmation Emails

**User Story:** As a user, I want to receive confirmation emails when my thoughts are captured, so that I know the system processed my input.

#### Acceptance Criteria

1. WHEN an entry is created from an inbound email, THE Confirmation_Sender SHALL send a reply email to the original sender
2. THE confirmation email SHALL include the entry name, category, and confidence score
3. THE confirmation email SHALL be sent as a reply to the original email (using In-Reply-To header)
4. THE confirmation email subject SHALL include the thread identifier for future replies
5. IF the entry was routed to inbox due to low confidence, THEN THE confirmation email SHALL include clarification instructions
6. WHEN sending fails, THE Email_Service SHALL log the error but not block entry creation

### Requirement 6: Digest Email Delivery

**User Story:** As a user, I want to receive my daily and weekly digests via email, so that I stay informed even when not actively using the app.

#### Acceptance Criteria

1. WHEN a scheduled digest is generated, THE Digest_Mailer SHALL send it to the configured email address
2. THE digest email SHALL be sent as a new email thread (not a reply)
3. THE digest email subject SHALL indicate the digest type (Daily Digest or Weekly Review)
4. THE digest email body SHALL contain the formatted digest content
5. WHEN email is disabled, THE Digest_Mailer SHALL skip email delivery without error

### Requirement 7: IMAP Polling

**User Story:** As a system operator, I want the system to periodically check for new emails, so that inbound messages are processed in a timely manner.

#### Acceptance Criteria

1. WHEN the application starts and email is enabled, THE IMAP_Poller SHALL begin polling at the configured interval
2. THE IMAP_Poller SHALL only fetch emails from the INBOX folder
3. THE IMAP_Poller SHALL process emails in chronological order (oldest first)
4. WHEN the IMAP connection fails, THE IMAP_Poller SHALL log the error and retry on the next interval
5. THE IMAP_Poller SHALL not process the same email twice (track by Message-ID)

### Requirement 8: Email Content Parsing

**User Story:** As a user, I want my email content properly extracted, so that the classification system receives clean text.

#### Acceptance Criteria

1. WHEN parsing an email, THE Email_Service SHALL prefer plain text parts over HTML
2. IF only HTML is available, THEN THE Email_Service SHALL strip HTML tags to extract text
3. THE Email_Service SHALL remove email signatures (text after common signature delimiters like "-- " or "___")
4. THE Email_Service SHALL remove quoted reply content (lines starting with ">")
5. THE Email_Service SHALL trim whitespace from the extracted content

### Requirement 9: Course Correction via Email Reply

**User Story:** As a user, I want to reply to confirmation emails to reclassify entries, so that I can fix mistakes using the same email thread.

#### Acceptance Criteria

1. WHEN a reply email is received with a valid thread identifier, THE Email_Service SHALL load the existing conversation context
2. WHEN the reply contains a category hint in brackets, THE Email_Service SHALL trigger a move operation for the most recent entry
3. WHEN the reply contains additional text, THE Email_Service SHALL process it as a new message in the conversation
4. THE Email_Service SHALL send a confirmation reply after processing the course correction

### Requirement 10: Graceful Degradation

**User Story:** As a system operator, I want the application to function normally when email is not configured, so that email remains an optional feature.

#### Acceptance Criteria

1. WHEN email environment variables are not set, THE application SHALL start successfully without email functionality
2. WHEN email is disabled, THE IMAP_Poller SHALL not be started
3. WHEN email is disabled, THE Digest_Mailer SHALL skip email delivery silently
4. WHEN email is disabled, THE Email_Service SHALL return appropriate responses indicating email is unavailable
5. THE application logs SHALL clearly indicate whether email channel is enabled or disabled at startup

### Requirement 11: Startup Connection Verification

**User Story:** As a system operator, I want the application to verify email server connectivity at startup, so that I can quickly identify configuration issues.

#### Acceptance Criteria

1. WHEN email is enabled and the application starts, THE Email_Service SHALL verify SMTP connection and authentication
2. WHEN email is enabled and the application starts, THE Email_Service SHALL verify IMAP connection and authentication
3. THE startup logs SHALL display SMTP server details including host, port, and TLS mode (TLS or STARTTLS)
4. THE startup logs SHALL display IMAP server details including host, port, and TLS mode
5. WHEN SMTP verification succeeds, THE startup logs SHALL display a success indicator (✓)
6. WHEN SMTP verification fails, THE startup logs SHALL display the error message
7. WHEN IMAP verification succeeds, THE startup logs SHALL display a success indicator (✓)
8. WHEN IMAP verification fails, THE startup logs SHALL display the error message
9. WHEN verification fails, THE application SHALL continue to start (non-blocking) but log the failure
