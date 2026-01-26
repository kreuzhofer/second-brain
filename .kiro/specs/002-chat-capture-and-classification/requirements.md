# Requirements Document

## Introduction

This document specifies the requirements for the Chat Capture and Classification feature of the Second Brain application. This feature provides the core user interface for capturing thoughts via a chat interface and automatically classifying them using LLM-powered tools. The system routes high-confidence classifications directly to storage while sending low-confidence items to an inbox for user clarification.

## Glossary

- **Chat_UI**: The React-based conversational interface where users input raw thoughts and receive classification feedback
- **Classification_Agent**: The LLM-powered component that analyzes user input and determines category, fields, and confidence
- **Confidence_Score**: A numeric value (0.0-1.0) indicating the Classification_Agent's certainty about a classification
- **Confidence_Threshold**: The configurable boundary (default 0.6) that determines automatic filing vs inbox routing
- **Conversation**: A persistent chat session stored in PostgreSQL with associated messages and summaries
- **Message**: A single user or assistant turn within a Conversation
- **Conversation_Summary**: An LLM-generated summary of older messages used to maintain context
- **Context_Window**: The assembled context provided to the LLM including index.md, summaries, and recent messages
- **Entry**: A markdown file with YAML frontmatter stored in the data folder
- **Category**: One of people, projects, ideas, admin, or inbox
- **Course_Correction**: User-initiated reclassification of an entry after initial filing

## Requirements

### Requirement 1: Chat Message Input

**User Story:** As a user, I want to type thoughts into a chat interface, so that I can capture information quickly without worrying about organization.

#### Acceptance Criteria

1. WHEN the Chat_UI loads, THE Chat_UI SHALL display a text input field at the bottom of the screen
2. WHEN a user types a message and presses Enter, THE Chat_UI SHALL send the message to the backend for processing
3. WHEN a user types a message and clicks the send button, THE Chat_UI SHALL send the message to the backend for processing
4. WHEN a message is being processed, THE Chat_UI SHALL display a loading indicator
5. WHEN a message is sent, THE Chat_UI SHALL clear the input field and maintain focus for the next entry
6. THE Chat_UI SHALL be responsive and functional on mobile devices with viewport widths from 320px to 1920px

### Requirement 2: Chat Message Display

**User Story:** As a user, I want to see my conversation history, so that I can track what I've captured and how it was classified.

#### Acceptance Criteria

1. THE Chat_UI SHALL display messages in chronological order with the newest message visible
2. WHEN a user message is displayed, THE Chat_UI SHALL show it aligned to the right with a distinct visual style
3. WHEN an assistant message is displayed, THE Chat_UI SHALL show it aligned to the left with a distinct visual style
4. WHEN a message resulted in filing an entry, THE Chat_UI SHALL display the entry path as a clickable link
5. WHEN a message resulted in filing an entry, THE Chat_UI SHALL display the confidence score
6. THE Chat_UI SHALL auto-scroll to the newest message when new messages arrive

### Requirement 3: Thought Classification

**User Story:** As a user, I want my thoughts automatically classified, so that I don't have to decide where they belong.

#### Acceptance Criteria

1. WHEN a user submits a thought, THE Classification_Agent SHALL analyze the text and return a classification result
2. THE Classification_Agent SHALL return a JSON object containing category, name, slug, fields, confidence, and reasoning
3. THE Classification_Agent SHALL classify thoughts into exactly one of: people, projects, ideas, or admin
4. THE Classification_Agent SHALL use the current index.md content as context for classification decisions
5. THE Classification_Agent SHALL generate a URL-safe slug from the classified name
6. THE Classification_Agent SHALL extract category-specific fields based on the classification

### Requirement 4: Confidence-Based Routing

**User Story:** As a user, I want uncertain classifications to go to my inbox, so that my main storage isn't polluted with misclassified items.

#### Acceptance Criteria

1. WHEN the Classification_Agent returns a Confidence_Score greater than or equal to the Confidence_Threshold, THE system SHALL create an Entry in the appropriate category folder
2. WHEN the Classification_Agent returns a Confidence_Score less than the Confidence_Threshold, THE system SHALL create an Entry in the inbox folder
3. WHEN an Entry is created in the inbox folder, THE system SHALL include the original text, suggested category, and reasoning in the Entry
4. WHEN an Entry is created in the inbox folder, THE Chat_UI SHALL display a clarification request asking the user for more context
5. THE Confidence_Threshold SHALL default to 0.6 and be configurable via environment variable

### Requirement 5: Classification Confirmation

**User Story:** As a user, I want immediate feedback on how my thought was classified, so that I can verify or correct the classification.

#### Acceptance Criteria

1. WHEN an Entry is successfully created, THE Chat_UI SHALL display a confirmation message with the category and entry name
2. WHEN an Entry is successfully created, THE Chat_UI SHALL display the confidence score
3. WHEN an Entry is successfully created, THE Chat_UI SHALL display a link to view the entry
4. WHEN an Entry is created with low confidence, THE Chat_UI SHALL explain why confidence was low using the reasoning field

### Requirement 6: Course Correction

**User Story:** As a user, I want to correct misclassifications, so that entries end up in the right place.

#### Acceptance Criteria

1. WHEN a user sends a message like "Actually, that should be a project", THE Classification_Agent SHALL interpret this as a course correction request
2. WHEN a course correction is requested, THE system SHALL move the Entry from its current location to the new category
3. WHEN a course correction is requested, THE system SHALL update the Entry fields to match the new category schema
4. WHEN a course correction is completed, THE Chat_UI SHALL display a confirmation of the move
5. WHEN a course correction moves an Entry from inbox, THE system SHALL update the Entry status from needs_review

### Requirement 7: Conversation Persistence

**User Story:** As a user, I want my chat history preserved, so that I can continue conversations across sessions.

#### Acceptance Criteria

1. WHEN a user sends a message, THE system SHALL store the Message in the PostgreSQL database
2. WHEN an assistant responds, THE system SHALL store the response Message in the PostgreSQL database
3. WHEN the Chat_UI loads, THE system SHALL retrieve and display the most recent Conversation
4. WHEN a Message is stored, THE system SHALL associate it with the current Conversation
5. WHEN a Message results in filing an Entry, THE system SHALL store the entry path and confidence with the Message

### Requirement 8: Conversation Context Assembly

**User Story:** As a user, I want the assistant to remember our conversation context, so that it can make better classification decisions.

#### Acceptance Criteria

1. WHEN processing a message, THE system SHALL assemble a Context_Window containing the current index.md content
2. WHEN processing a message, THE system SHALL include the last 15 messages verbatim in the Context_Window
3. WHEN processing a message, THE system SHALL include all Conversation_Summaries for the current Conversation
4. THE Context_Window SHALL present summaries before recent messages in chronological order
5. THE maximum number of verbatim messages SHALL be configurable via environment variable (default 15)

### Requirement 9: Conversation Summarization

**User Story:** As a user, I want long conversations summarized, so that context is preserved without overwhelming the system.

#### Acceptance Criteria

1. WHEN a Conversation exceeds the summarization threshold in message count, THE system SHALL generate a Conversation_Summary
2. THE Conversation_Summary SHALL capture key topics, decisions made, and user preferences learned
3. WHEN a Conversation_Summary is created, THE system SHALL store the start and end message IDs it covers
4. THE summarization threshold SHALL default to 20 messages and be configurable via environment variable
5. THE system SHALL retain the last 15 messages verbatim even after summarization

### Requirement 10: Quick Actions

**User Story:** As a user, I want shortcuts for common operations, so that I can work efficiently.

#### Acceptance Criteria

1. WHEN a user includes a hint like "[project]" in their message, THE Classification_Agent SHALL use this as a strong signal for category classification
2. WHEN a user includes a hint like "[person:name]" in their message, THE Classification_Agent SHALL attempt to link to an existing person entry
3. WHEN a user asks to "view recent entries", THE Chat_UI SHALL display a list of recently created entries
4. WHEN displaying recent entries, THE Chat_UI SHALL show entry name, category, and creation time

### Requirement 11: Entry Viewing

**User Story:** As a user, I want to view entry details without leaving the chat, so that I can stay in my workflow.

#### Acceptance Criteria

1. WHEN a user clicks an entry link in the chat, THE Chat_UI SHALL display the entry details in a modal or side panel
2. WHEN displaying entry details, THE Chat_UI SHALL show all frontmatter fields and content
3. WHEN displaying entry details, THE Chat_UI SHALL provide a close action to return to the chat
4. THE entry detail view SHALL be scrollable for entries with long content

### Requirement 12: API Integration

**User Story:** As a developer, I want a REST API for chat operations, so that I can integrate with other tools.

#### Acceptance Criteria

1. THE system SHALL expose a POST /api/chat endpoint that accepts message text and optional hints
2. THE system SHALL expose a GET /api/conversations endpoint that returns conversation history
3. THE system SHALL expose a GET /api/conversations/:id/messages endpoint that returns messages for a conversation
4. WHEN the POST /api/chat endpoint is called, THE system SHALL process the message through the Classification_Agent
5. THE API endpoints SHALL require authentication via Bearer token
