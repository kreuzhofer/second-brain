# Implementation Plan: LLM Tool Routing

## Overview

This implementation plan refactors the chat service to use OpenAI function calling for LLM-based tool selection. The work is organized into phases: first adding new components (non-breaking), then refactoring the orchestrator, and finally switching over and cleaning up.

## Tasks

- [x] 1. Create Tool Registry
  - [x] 1.1 Create tool-registry.ts with ToolDefinition interface and ToolRegistry class
    - Define TypeScript interfaces for OpenAI function calling schemas
    - Implement getAllTools() and getTool() methods
    - Implement validateArguments() method using JSON Schema validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 1.2 Define schemas for all 7 MVP tools
    - classify_and_capture: text (required), hints (optional)
    - list_entries: category, status, limit (all optional)
    - get_entry: path (required)
    - generate_digest: type (required, enum: daily/weekly)
    - update_entry: path (required), updates (required)
    - move_entry: path (required), targetCategory (required)
    - search_entries: query (required), category (optional), limit (optional)
    - _Requirements: 1.1, 1.5_
  
  - [x] 1.3 Write property test for tool schema validity
    - **Property 1: Tool Schema Validity**
    - **Validates: Requirements 1.2, 1.4, 1.5**

- [x] 2. Create Search Service
  - [x] 2.1 Create search.service.ts with SearchService class
    - Implement search() method that searches across entry names, one-liners, context, and content
    - Use EntryService.list() to get all entries, then filter by query match
    - Support category filter and limit parameter
    - Sort results by relevance (match count)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 2.2 Write property test for search filtering and relevance
    - **Property 6: Search Results Filtering and Relevance**
    - **Validates: Requirements 3.7, 7.1, 7.2, 7.3, 7.4**

- [x] 3. Create Tool Executor
  - [x] 3.1 Create tool-executor.ts with ToolExecutor class
    - Implement execute() method that dispatches to tool-specific handlers
    - Define result types for each tool (CaptureResult, ListEntriesResult, etc.)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  
  - [x] 3.2 Implement classify_and_capture tool handler
    - Use existing ClassificationAgent for classification
    - Use existing EntryService for entry creation
    - Return CaptureResult with path, category, name, confidence, clarificationNeeded
    - _Requirements: 3.1_
  
  - [x] 3.3 Implement list_entries tool handler
    - Use EntryService.list() with category and status filters
    - Apply limit to results
    - Return ListEntriesResult with entries array and total count
    - _Requirements: 3.2_
  
  - [x] 3.4 Write property test for list entries filtering
    - **Property 2: List Entries Filtering**
    - **Validates: Requirements 3.2**
  
  - [x] 3.5 Implement get_entry tool handler
    - Use EntryService.read() to get full entry
    - Return GetEntryResult with entry data
    - _Requirements: 3.3_
  
  - [x] 3.6 Write property test for get entry round-trip
    - **Property 3: Get Entry Round-Trip**
    - **Validates: Requirements 3.3**
  
  - [x] 3.7 Implement generate_digest tool handler
    - Use DigestService.generateDailyDigest() or generateWeeklyReview()
    - Return DigestResult with type and content
    - _Requirements: 3.4_
  
  - [x] 3.8 Implement update_entry tool handler
    - Use EntryService.update() to apply changes
    - Return UpdateEntryResult with path and updated fields
    - _Requirements: 3.5_
  
  - [x] 3.9 Write property test for update entry application
    - **Property 4: Update Entry Application**
    - **Validates: Requirements 3.5**
  
  - [x] 3.10 Implement move_entry tool handler
    - Read existing entry, transform fields for target category
    - Create new entry in target category, delete old entry
    - Return MoveEntryResult with old and new paths
    - _Requirements: 3.6_
  
  - [x] 3.11 Write property test for move entry path change
    - **Property 5: Move Entry Path Change**
    - **Validates: Requirements 3.6**
  
  - [x] 3.12 Implement search_entries tool handler
    - Use SearchService.search() with query and options
    - Return SearchResult with entries and total
    - _Requirements: 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create System Prompt Builder
  - [x] 5.1 Create system-prompt.ts with buildSystemPrompt function
    - Include role description for knowledge management assistant
    - Include all tool names and usage guidelines
    - Include placeholder for index content
    - Include placeholder for conversation history
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  
  - [x] 5.2 Write property test for system prompt completeness
    - **Property 7: System Prompt Completeness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**

- [x] 6. Refactor Chat Orchestrator
  - [x] 6.1 Add processMessageWithTools method to ChatService
    - Assemble context using existing ContextAssembler
    - Build system prompt with tool schemas
    - Call OpenAI with tools parameter
    - Handle tool_calls response by executing tools via ToolExecutor
    - Send tool results back to OpenAI for final response
    - Handle conversational response (no tools)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 6.2 Add message storage with entry metadata
    - Store assistant messages with filedEntryPath and filedConfidence when entries are created
    - Trigger summarization check after message storage
    - _Requirements: 8.3, 8.4_
  
  - [x] 6.3 Write property test for message metadata persistence
    - **Property 8: Message Metadata Persistence**
    - **Validates: Requirements 8.3**
  
  - [x] 6.4 Write property test for confidence-based routing preservation
    - **Property 9: Confidence-Based Routing Preservation**
    - **Validates: Requirements 8.1**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Switch Over and Cleanup
  - [x] 8.1 Update processMessage to use processMessageWithTools
    - Replace hardcoded classification flow with tool-based flow
    - Remove course correction regex patterns (COURSE_CORRECTION_PATTERNS)
    - Remove detectCourseCorrection method
    - _Requirements: 2.7_
  
  - [x] 8.2 Update chat router to use refactored service
    - Ensure POST /api/chat uses the new flow
    - Update response format if needed
    - _Requirements: 2.1_
  
  - [x] 8.3 Write integration tests for full orchestration flow
    - Test tool selection with mocked OpenAI responses
    - Test conversational path (no tools)
    - Test multi-tool execution
    - Test error handling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 9. Final Checkpoint - Ensure all tests pass
  - All 467 tests pass
  - Docker containers rebuilt successfully

## Notes

- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The migration strategy allows for safe rollout with feature flag if needed
- Existing services (ClassificationAgent, EntryService, DigestService) are reused, not rewritten
