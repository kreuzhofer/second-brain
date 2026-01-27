# Implementation Plan: Entry Content Management

## Overview

This implementation adds body content support to entry creation and updates, plus a delete_entry tool. The work is organized to build incrementally: first enhance types, then services, then tools, with tests alongside each component.

## Tasks

- [x] 1. Enhance ClassificationResult type and Classification Agent
  - [x] 1.1 Add bodyContent field to ClassificationResult interface
    - Update `backend/src/types/chat.types.ts`
    - Add `bodyContent: string` to ClassificationResult
    - _Requirements: 4.1_
  
  - [x] 1.2 Update Classification Agent prompt and response parsing
    - Update `backend/src/services/classification.service.ts`
    - Add body_content to CLASSIFICATION_SCHEMA
    - Add category-specific body content generation instructions
    - Parse and normalize bodyContent in parseClassificationResponse()
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.2_

- [x] 2. Enhance EntryService for body content
  - [x] 2.1 Update EntryService.create() to accept body content
    - Update `backend/src/services/entry.service.ts`
    - Add optional `bodyContent?: string` parameter to create()
    - Use `matter.stringify(bodyContent || '', entry)` for serialization
    - _Requirements: 1.6_
  
  - [x] 2.2 Write property test for entry creation round-trip
    - **Property 1: Entry Creation with Body Content Round-Trip**
    - **Validates: Requirements 1.6**
  
  - [x] 2.3 Add BodyContentUpdate interface and update() enhancement
    - Add BodyContentUpdate interface to `backend/src/types/entry.types.ts`
    - Update EntryService.update() to accept optional bodyUpdate parameter
    - Implement append mode: concatenate to existing body
    - Implement replace mode: overwrite entire body
    - Implement section mode: find or create section, append content
    - Add date prefix for Log section entries
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  
  - [x] 2.4 Write property tests for body update modes
    - **Property 2: Body Append Preserves Existing Content**
    - **Property 3: Body Replace Overwrites Content**
    - **Property 4: Section Append Adds to Correct Section**
    - **Property 5: Log Entries Get Date Prefix**
    - **Property 6: Body Updates Preserve Frontmatter**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

- [x] 3. Checkpoint - Ensure EntryService tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add delete_entry tool
  - [x] 4.1 Register delete_entry tool in ToolRegistry
    - Update `backend/src/services/tool-registry.ts`
    - Add delete_entry tool definition with path parameter
    - _Requirements: 3.1_
  
  - [x] 4.2 Implement handleDeleteEntry in ToolExecutor
    - Update `backend/src/services/tool-executor.ts`
    - Add DeleteEntryResult interface
    - Implement handleDeleteEntry() method
    - Add case to execute() switch statement
    - _Requirements: 3.2, 3.3, 3.4, 3.5_
  
  - [x] 4.3 Write unit tests for delete_entry tool
    - Test successful deletion returns path and name
    - Test non-existent entry returns error
    - _Requirements: 3.3, 3.4_

- [x] 5. Update update_entry tool for body content
  - [x] 5.1 Update update_entry schema in ToolRegistry
    - Add body_content parameter to update_entry tool schema
    - Include content, mode, and section properties
    - _Requirements: 2.1_
  
  - [x] 5.2 Update handleUpdateEntry in ToolExecutor
    - Parse body_content from args
    - Pass bodyUpdate to EntryService.update()
    - Include body update info in response
    - _Requirements: 2.1_
  
  - [x] 5.3 Write unit tests for update_entry body content
    - Test append mode via tool
    - Test replace mode via tool
    - Test section mode via tool
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. Update classify_and_capture tool for body content
  - [x] 6.1 Update handleClassifyAndCapture in ToolExecutor
    - Extract bodyContent from ClassificationResult
    - Pass bodyContent to EntryService.create()
    - _Requirements: 1.1, 1.6_
  
  - [x] 6.2 Write integration test for classify_and_capture with body content
    - Mock ClassificationAgent to return body content
    - Verify created entry has body content
    - _Requirements: 1.1, 1.6_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Property tests use `{ numRuns: 3 }` per workspace guidelines
- The Classification Agent prompt changes (1.2) affect LLM behavior - manual testing recommended
- Body content is stored below the YAML frontmatter delimiter using gray-matter
