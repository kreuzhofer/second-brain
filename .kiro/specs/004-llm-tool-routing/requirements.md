# Requirements Document

## Introduction

This specification implements the LLM tool-calling architecture described in the product vision (Section 5). Currently, the chat service (spec 002) has a hardcoded flow where every user message is treated as something to capture via the ClassificationAgent. Course correction uses regex patterns instead of LLM-based intent detection.

This spec refactors the chat orchestrator to use OpenAI function calling, allowing the LLM to decide which tool(s) to invoke based on user intent—or respond conversationally without calling any tool. This enables:
- Query tools (list_entries, get_entry, search_entries) accessible from chat
- Digest generation on demand via chat ("give me my daily digest")
- Natural course correction without regex patterns
- Conversational responses when no action is needed

## Glossary

- **Chat_Orchestrator**: The service that processes user messages, invokes the LLM with available tools, executes selected tools, and generates responses
- **Tool_Registry**: A module that defines all available tools with their OpenAI function calling schemas
- **Tool_Executor**: The component that validates and executes tool calls against underlying services
- **Intent**: The user's purpose behind a message (capture, query, correction, conversation)
- **Function_Calling**: OpenAI's mechanism for LLMs to select and invoke structured functions
- **Tool_Schema**: JSON schema defining a tool's name, description, and parameters for OpenAI function calling
- **ClassificationAgent**: The existing LLM-powered component that analyzes user input and determines category, fields, and confidence (from spec 002)
- **EntryService**: The existing service that provides CRUD operations for markdown entries (from spec 002)
- **DigestService**: The existing service that generates daily digests and weekly reviews (from spec 003)
- **ConversationService**: The existing service that manages chat conversations and messages (from spec 002)
- **ContextAssembler**: The existing service that builds context windows for LLM calls (from spec 002)

## Requirements

### Requirement 1: Tool Registry

**User Story:** As a developer, I want a centralized registry of all available tools with their OpenAI function calling schemas, so that the LLM can select appropriate tools based on user intent.

#### Acceptance Criteria

1. THE Tool_Registry SHALL define schemas for these MVP tools: classify_and_capture, list_entries, get_entry, generate_digest, update_entry, move_entry, search_entries
2. WHEN a tool schema is requested, THE Tool_Registry SHALL return a valid OpenAI function calling schema with name, description, and parameters
3. THE Tool_Registry SHALL export all tool schemas as an array suitable for the OpenAI chat completions API tools parameter
4. WHEN defining tool parameters, THE Tool_Registry SHALL use JSON Schema format with required and optional fields clearly specified
5. THE Tool_Registry SHALL include descriptive help text for each tool explaining when the LLM should select it

### Requirement 2: Chat Orchestrator Refactor

**User Story:** As a user, I want the system to understand my intent and respond appropriately, so that I can capture thoughts, query my knowledge base, or just have a conversation without the system always trying to capture everything.

#### Acceptance Criteria

1. WHEN a user message is received, THE Chat_Orchestrator SHALL send it to OpenAI with all available tool schemas and conversation context
2. WHEN the LLM returns a tool call, THE Chat_Orchestrator SHALL execute the specified tool with the provided arguments
3. WHEN the LLM returns multiple tool calls, THE Chat_Orchestrator SHALL execute them in sequence and aggregate results
4. WHEN the LLM returns no tool call, THE Chat_Orchestrator SHALL return the LLM's conversational response directly
5. WHEN a tool execution completes, THE Chat_Orchestrator SHALL send the result back to the LLM for response generation
6. IF a tool execution fails, THEN THE Chat_Orchestrator SHALL return an error message to the LLM and let it generate an appropriate user-facing response
7. THE Chat_Orchestrator SHALL remove the hardcoded course correction regex patterns and rely on LLM tool selection instead

### Requirement 3: Tool Implementations

**User Story:** As a user, I want to interact with my knowledge base through natural language, so that I can capture, query, update, and organize my entries without learning specific commands.

#### Acceptance Criteria

1. WHEN classify_and_capture is called with text and optional hints, THE Tool_Executor SHALL classify the thought and create an entry using existing ClassificationAgent and EntryService
2. WHEN list_entries is called with optional category, status, and limit filters, THE Tool_Executor SHALL return matching entries using EntryService.list()
3. WHEN get_entry is called with a path, THE Tool_Executor SHALL return the full entry using EntryService.read()
4. WHEN generate_digest is called with type (daily or weekly), THE Tool_Executor SHALL generate and return the digest using DigestService
5. WHEN update_entry is called with path and updates, THE Tool_Executor SHALL modify the entry using EntryService.update()
6. WHEN move_entry is called with path and target category, THE Tool_Executor SHALL move the entry to the new category and create a git commit
7. WHEN search_entries is called with a query, THE Tool_Executor SHALL perform full-text search across entry names, content, and frontmatter fields

### Requirement 4: Response Generation

**User Story:** As a user, I want clear and helpful responses after each interaction, so that I know what action was taken and can easily follow up.

#### Acceptance Criteria

1. WHEN classify_and_capture succeeds, THE Chat_Orchestrator SHALL generate a response confirming the entry was created with its path and confidence
2. WHEN list_entries returns results, THE Chat_Orchestrator SHALL format them as a readable list with key fields per category
3. WHEN get_entry returns an entry, THE Chat_Orchestrator SHALL present the entry details in a readable format
4. WHEN generate_digest completes, THE Chat_Orchestrator SHALL return the formatted digest content
5. WHEN update_entry succeeds, THE Chat_Orchestrator SHALL confirm the changes made
6. WHEN move_entry succeeds, THE Chat_Orchestrator SHALL confirm the entry was moved with old and new paths
7. WHEN search_entries returns results, THE Chat_Orchestrator SHALL format them as a list with relevance context
8. WHEN no results are found for list_entries or search_entries, THE Chat_Orchestrator SHALL inform the user and suggest alternatives

### Requirement 5: Conversational Path

**User Story:** As a user, I want to have natural conversations with the assistant without every message being treated as something to capture, so that I can ask questions, get clarification, or just chat.

#### Acceptance Criteria

1. WHEN the user sends a greeting or casual message, THE Chat_Orchestrator SHALL respond conversationally without invoking any tool
2. WHEN the user asks a question about how to use the system, THE Chat_Orchestrator SHALL provide helpful guidance without invoking any tool
3. WHEN the user asks a follow-up question about a previous response, THE Chat_Orchestrator SHALL use conversation context to provide a relevant answer
4. WHEN the LLM determines no tool is needed, THE Chat_Orchestrator SHALL return the LLM's response directly without any tool execution

### Requirement 6: System Prompt Construction

**User Story:** As a developer, I want a well-structured system prompt that guides the LLM to make appropriate tool selections, so that user intent is correctly interpreted.

#### Acceptance Criteria

1. THE Chat_Orchestrator SHALL include role description, available tools, and usage guidelines in the system prompt
2. THE Chat_Orchestrator SHALL include the current index.md content in the system prompt for context
3. THE Chat_Orchestrator SHALL include conversation history (summaries + recent messages) in the context
4. THE Chat_Orchestrator SHALL provide clear guidance on when to use each tool versus responding conversationally
5. THE System_Prompt SHALL instruct the LLM to use classify_and_capture when the user shares new information to remember
6. THE System_Prompt SHALL instruct the LLM to use query tools (list_entries, get_entry, search_entries) when the user asks about existing entries
7. THE System_Prompt SHALL instruct the LLM to use move_entry when the user wants to reclassify a recent entry
8. THE System_Prompt SHALL instruct the LLM to respond conversationally for greetings, questions about the system, and general chat

### Requirement 7: Search Implementation

**User Story:** As a user, I want to search my knowledge base using natural language, so that I can find entries without knowing exact paths or names.

#### Acceptance Criteria

1. WHEN search_entries is called, THE Tool_Executor SHALL search across entry names, one-liners, context fields, and markdown content
2. WHEN search_entries is called with a category filter, THE Tool_Executor SHALL limit results to that category
3. WHEN search_entries is called with a limit parameter, THE Tool_Executor SHALL return at most that many results
4. THE search_entries tool SHALL return results sorted by relevance (number of matches)
5. IF no entries match the search query, THEN THE Tool_Executor SHALL return an empty results array

### Requirement 8: Backward Compatibility

**User Story:** As a user, I want my existing chat workflows to continue working, so that the refactor doesn't break my current usage patterns.

#### Acceptance Criteria

1. WHEN a user shares a thought to capture, THE Chat_Orchestrator SHALL create an entry with the same confidence-based routing as before (high confidence → category, low confidence → inbox)
2. WHEN a user says "actually that should be a project", THE Chat_Orchestrator SHALL move the most recent entry to the projects category (same behavior as regex-based course correction)
3. THE Chat_Orchestrator SHALL continue to store messages in the conversation with filedEntryPath and filedConfidence when entries are created
4. THE Chat_Orchestrator SHALL continue to trigger summarization when conversation exceeds the threshold
