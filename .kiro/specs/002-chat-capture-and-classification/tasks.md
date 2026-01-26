# Implementation Plan: Chat Capture and Classification

## Overview

This implementation plan breaks down the Chat Capture and Classification feature into discrete coding tasks. The plan follows an incremental approach, building core services first, then the classification agent, conversation management, and finally the frontend chat UI.

## Tasks

- [x] 1. Set up configuration and types
  - [x] 1.1 Add chat configuration to environment config
    - Add OPENAI_API_KEY, CONFIDENCE_THRESHOLD, MAX_VERBATIM_MESSAGES, SUMMARIZE_AFTER_MESSAGES to config
    - Add validation for required OPENAI_API_KEY
    - _Requirements: 4.5, 8.5, 9.4_
  - [x] 1.2 Create chat-related TypeScript types
    - Create types for ClassificationInput, ClassificationResult, CategoryFields
    - Create types for ChatRequest, ChatResponse, ContextWindow
    - Create types for CourseCorrectRequest, CourseCorrectResponse
    - _Requirements: 3.2, 3.6_

- [x] 2. Implement Conversation Service
  - [x] 2.1 Create ConversationService class with CRUD operations
    - Implement create(), getById(), getMostRecent() methods
    - Implement addMessage(), getMessages(), getMessageCount() methods
    - Implement getSummaries(), addSummary() methods
    - Use Prisma client for database operations
    - _Requirements: 7.1, 7.2, 7.4, 7.5_
  - [x] 2.2 Write unit tests for ConversationService
    - Test message creation and retrieval
    - Test conversation creation for different channels
    - Test summary creation with valid message ranges
    - _Requirements: 7.1, 7.2, 7.4_
  - [x] 2.3 Write property test for message persistence
    - **Property 9: Message Persistence**
    - **Validates: Requirements 7.1, 7.2, 7.4**

- [x] 3. Implement Context Assembler
  - [x] 3.1 Create ContextAssembler class
    - Implement assemble() method that builds ContextWindow
    - Include index.md content from IndexService
    - Include conversation summaries in chronological order
    - Include last N messages (configurable via MAX_VERBATIM_MESSAGES)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 3.2 Write property test for context assembly completeness
    - **Property 11: Context Assembly Completeness**
    - **Validates: Requirements 8.1, 8.2, 8.3**
  - [x] 3.3 Write property test for context ordering
    - **Property 12: Context Ordering**
    - **Validates: Requirements 8.4**

- [x] 4. Implement Summarization Service
  - [x] 4.1 Create SummarizationService class
    - Implement checkAndSummarize() method with threshold check
    - Implement generateSummary() method using OpenAI API
    - Create summarization prompt for capturing key topics and decisions
    - _Requirements: 9.1, 9.3, 9.5_
  - [x] 4.2 Write property test for summarization trigger
    - **Property 13: Summarization Trigger**
    - **Validates: Requirements 9.1**
  - [x] 4.3 Write property test for message retention after summarization
    - **Property 15: Message Retention After Summarization**
    - **Validates: Requirements 9.5**

- [x] 5. Checkpoint - Core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Classification Agent
  - [x] 6.1 Create ClassificationAgent class with OpenAI integration
    - Implement classify() method that calls OpenAI API
    - Build classification prompt with system instructions and context
    - Parse structured JSON response from LLM
    - Handle API errors and timeouts
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 6.2 Implement slug generation utility
    - Create generateSlug() function for URL-safe slugs
    - Handle special characters, unicode, spaces
    - Enforce max length and no consecutive hyphens
    - _Requirements: 3.5_
  - [x] 6.3 Write property test for slug URL-safety
    - **Property 2: Slug URL-Safety**
    - **Validates: Requirements 3.5**
  - [x] 6.4 Implement category-specific field extraction
    - Extract fields based on classified category
    - Apply defaults for optional fields
    - Validate field structure matches category schema
    - _Requirements: 3.6_
  - [x] 6.5 Write property test for category-field consistency
    - **Property 3: Category-Field Consistency**
    - **Validates: Requirements 3.6**
  - [x] 6.6 Implement hint parsing
    - Parse [project], [person], [idea], [task] hints from message
    - Parse [person:name] format for entity linking
    - Pass extracted hints to classification
    - _Requirements: 10.1, 10.2_
  - [x] 6.7 Write property test for hint extraction
    - **Property 16: Hint Extraction and Application**
    - **Validates: Requirements 10.1**

- [x] 7. Implement Chat Service
  - [x] 7.1 Create ChatService class orchestrating the flow
    - Implement processMessage() method
    - Coordinate ConversationService, ContextAssembler, ClassificationAgent
    - Handle confidence-based routing to category or inbox
    - Generate appropriate response messages
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_
  - [x] 7.2 Write property test for confidence-based routing
    - **Property 4: Confidence-Based Routing**
    - **Validates: Requirements 4.1, 4.2**
  - [x] 7.3 Write property test for inbox entry structure
    - **Property 5: Inbox Entry Structure**
    - **Validates: Requirements 4.3**
  - [x] 7.4 Implement course correction handling
    - Detect course correction intent from message
    - Move entry to new category using EntryService
    - Transform fields to match new category schema
    - Generate confirmation response
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 7.5 Write property test for course correction detection
    - **Property 6: Course Correction Detection**
    - **Validates: Requirements 6.1**
  - [x] 7.6 Write property test for entry move operation
    - **Property 7: Entry Move Operation**
    - **Validates: Requirements 6.2**

- [x] 8. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Chat API Routes
  - [x] 9.1 Create chat router with POST /api/chat endpoint
    - Accept message text and optional hints
    - Call ChatService.processMessage()
    - Return ChatApiResponse with entry details if created
    - _Requirements: 12.1, 12.4_
  - [x] 9.2 Create GET /api/conversations endpoint
    - Return list of conversations with message counts
    - Support pagination
    - _Requirements: 12.2_
  - [x] 9.3 Create GET /api/conversations/:id/messages endpoint
    - Return messages for a specific conversation
    - Include filed entry metadata
    - _Requirements: 12.3_
  - [x] 9.4 Write property test for API authentication
    - **Property 17: API Authentication Enforcement**
    - **Validates: Requirements 12.5**
  - [x] 9.5 Write integration tests for chat API
    - Test full flow from POST /api/chat to entry creation
    - Test conversation retrieval
    - Test message retrieval
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 10. Implement Frontend Chat Components
  - [x] 10.1 Create ChatUI component structure
    - Create main ChatUI container component
    - Set up state for messages, loading, conversation
    - Implement API service calls for chat operations
    - _Requirements: 1.1, 2.1_
  - [x] 10.2 Create InputBar component
    - Create text input with send button
    - Handle Enter key submission
    - Handle button click submission
    - Clear input and maintain focus after send
    - Show loading state during processing
    - _Requirements: 1.2, 1.3, 1.4, 1.5_
  - [x] 10.3 Create MessageList component
    - Display messages in chronological order
    - Style user messages aligned right
    - Style assistant messages aligned left
    - Auto-scroll to newest message
    - _Requirements: 2.1, 2.2, 2.3, 2.6_
  - [x] 10.4 Create Message component with entry links
    - Display message content
    - Show entry path as clickable link when present
    - Show confidence score when present
    - _Requirements: 2.4, 2.5, 5.1, 5.2, 5.3_
  - [x] 10.5 Write property test for message chronological ordering
    - **Property 18: Message Chronological Ordering**
    - **Validates: Requirements 2.1**

- [x] 11. Implement Entry Modal
  - [x] 11.1 Create EntryModal component using createPortal
    - Fetch entry details when opened
    - Display all frontmatter fields
    - Display markdown content
    - Provide close button
    - Make content scrollable
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x] 11.2 Write unit tests for EntryModal
    - Test modal opens on entry link click
    - Test entry data is displayed
    - Test close button works
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 12. Implement Recent Entries View
  - [x] 12.1 Add recent entries command handling
    - Detect "view recent entries" command
    - Fetch recent entries from API
    - Display entry list with name, category, creation time
    - _Requirements: 10.3, 10.4_

- [x] 13. Wire up Chat UI to App
  - [x] 13.1 Integrate ChatUI into main App component
    - Replace placeholder dashboard with ChatUI
    - Handle entry click to open modal
    - Ensure responsive layout for mobile
    - _Requirements: 1.6_

- [x] 14. Final checkpoint - Feature complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The implementation builds incrementally: services → agent → API → frontend
- Existing EntryService, GitService, and IndexService are reused from 001-project-setup
