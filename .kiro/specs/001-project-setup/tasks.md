# Implementation Plan: Project Setup

## Overview

This implementation plan establishes the foundational infrastructure for the Second Brain application. Tasks are organized to build incrementally: project scaffolding first, then backend foundation, database schema, entry system with git integration, index generation, and finally frontend foundation.

## Tasks

- [x] 1. Set up project scaffolding and Docker configuration
  - [x] 1.1 Create monorepo structure with root package.json and workspace configuration
    - Create root `package.json` with npm workspaces for `frontend` and `backend`
    - Create `.gitignore` for node_modules, dist, .env, etc.
    - Create `.env.example` with all required and optional environment variables
    - _Requirements: 1.1, 1.6_
  
  - [x] 1.2 Create Docker Compose configuration
    - Create `docker-compose.yml` with app and PostgreSQL containers
    - Configure PostgreSQL health check and app dependency
    - Mount `${DATA_PATH}` volume to `/data` in app container
    - Expose port 3000 for the application
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.7_
  
  - [x] 1.3 Create backend Dockerfile
    - Create `backend/Dockerfile` with Node.js base image
    - Configure multi-stage build for production
    - Set up Prisma client generation in build step
    - _Requirements: 1.2_

- [x] 2. Set up backend foundation with Express.js and TypeScript
  - [x] 2.1 Initialize backend package with TypeScript configuration
    - Create `backend/package.json` with Express, TypeScript, Prisma dependencies
    - Create `backend/tsconfig.json` with strict TypeScript settings
    - Create `backend/src/index.ts` entry point with Express app setup
    - _Requirements: 2.1, 2.2_
  
  - [x] 2.2 Implement environment configuration module
    - Create `backend/src/config/env.ts` with EnvConfig interface
    - Implement `loadEnvConfig()` function to load and validate env vars
    - Implement `validateRequiredEnvVars()` that throws MissingEnvVarError
    - Required vars: OPENAI_API_KEY, DATABASE_URL, API_KEY, DATA_PATH
    - Optional vars with defaults: TIMEZONE, CONFIDENCE_THRESHOLD, PORT
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [x] 2.3 Implement authentication middleware
    - Create `backend/src/middleware/auth.ts` with Bearer token validation
    - Validate Authorization header against API_KEY env var
    - Return 401 Unauthorized for missing/invalid tokens
    - _Requirements: 2.3, 2.4_
  
  - [x] 2.4 Write unit tests for auth middleware
    - Test valid token allows request
    - Test missing token returns 401
    - Test invalid token returns 401
    - _Requirements: 2.3, 2.4_
  
  - [x] 2.5 Implement health check endpoint
    - Create `backend/src/routes/health.ts` with GET /api/health
    - Return 200 OK with status information
    - No authentication required for health check
    - _Requirements: 2.5_

- [x] 3. Set up Prisma and database schema
  - [x] 3.1 Initialize Prisma with PostgreSQL configuration
    - Create `backend/prisma/schema.prisma` with PostgreSQL datasource
    - Configure Prisma client generator
    - _Requirements: 2.2, 2.6_
  
  - [x] 3.2 Define database models in Prisma schema
    - Create Conversation model with channel, externalId, timestamps
    - Create Message model with role, content, filedEntryPath, filedConfidence
    - Create ConversationSummary model with summary, messageCount, message IDs
    - Create EmailThread model with messageId, threadId, subject, fromAddress
    - Create CronJobRun model with jobName, status, result, timestamps
    - Create EntryAuditLog model with entryPath, operation, gitCommitHash, channel
    - Define enums: Channel, Role, JobStatus, Operation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [x] 3.3 Create Prisma client initialization module
    - Create `backend/src/lib/prisma.ts` with singleton Prisma client
    - Handle connection errors gracefully
    - _Requirements: 2.6_

- [x] 4. Checkpoint - Verify backend foundation
  - Ensure TypeScript compiles without errors
  - Ensure Prisma schema is valid
  - Ensure Docker Compose starts successfully
  - Ask the user if questions arise

- [x] 5. Implement entry type definitions
  - [x] 5.1 Create TypeScript interfaces for entry types
    - Create `backend/src/types/entry.types.ts`
    - Define BaseEntry interface with common fields
    - Define PeopleEntry, ProjectsEntry, IdeasEntry, AdminEntry, InboxEntry interfaces
    - Define Entry union type and EntrySummary interface
    - Define CreateEntryInput and UpdateEntryInput types per category
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Implement Git Service
  - [x] 6.1 Create Git Service with simple-git
    - Create `backend/src/services/git.service.ts`
    - Implement `initialize()` to init git repo if not exists
    - Implement `isInitialized()` to check for .git directory
    - Implement `commit(message, files)` returning commit hash
    - _Requirements: 9.1, 9.5, 9.6_
  
  - [x] 6.2 Implement commit message formatters
    - Implement `formatCreateCommit(category, name, confidence, channel)`
    - Implement `formatUpdateCommit(category, name, changeSummary, channel)`
    - Implement `formatDeleteCommit(category, name, channel)`
    - Format: `{operation}({category}): {entry_name} [{details}] [via: {channel}]`
    - _Requirements: 9.2, 9.3, 9.4_
  
  - [x] 6.3 Write unit tests for Git Service
    - Test repository initialization
    - Test commit message format
    - Test commit returns valid hash
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

- [x] 7. Implement Entry Service
  - [x] 7.1 Create Entry Service with gray-matter
    - Create `backend/src/services/entry.service.ts`
    - Implement file path resolution per category
    - Implement slug generation from entry name
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 7.2 Implement entry creation
    - Implement `create(category, data)` method
    - Generate UUID for id field
    - Set created_at and updated_at timestamps
    - Serialize frontmatter with gray-matter
    - Write file to appropriate category folder
    - Create git commit via Git Service
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 9.2_
  
  - [x] 7.3 Implement entry reading
    - Implement `read(path)` method
    - Parse markdown file with gray-matter
    - Return EntryNotFoundError if file doesn't exist
    - _Requirements: 6.1, 6.2_
  
  - [x] 7.4 Implement entry listing
    - Implement `list(category?, filters?)` method
    - Read all files from category folder
    - Support status filter for projects and admin
    - Return EntrySummary array
    - _Requirements: 6.3, 6.4_
  
  - [x] 7.5 Implement entry updating
    - Implement `update(path, updates)` method
    - Merge updates with existing frontmatter
    - Update updated_at timestamp
    - Update last_touched for people entries
    - Preserve content section
    - Create git commit via Git Service
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 9.3_
  
  - [x] 7.6 Implement entry deletion
    - Implement `delete(path)` method
    - Remove file from data folder
    - Return EntryNotFoundError if file doesn't exist
    - Create git commit via Git Service
    - _Requirements: 8.1, 8.2, 9.4_
  
  - [x] 7.7 Write property test for entry round-trip
    - **Property 3: Entry Serialization Round-Trip**
    - For any valid entry data, create then read should return equivalent data
    - **Validates: Requirements 5.6, 6.1**
  
  - [x] 7.8 Write unit tests for Entry Service
    - Test creation for each category
    - Test reading existing and non-existent entries
    - Test listing with and without filters
    - Test update merges fields correctly
    - Test deletion removes file
    - _Requirements: 5.1-5.7, 6.1-6.4, 7.1-7.5, 8.1-8.2_

- [x] 8. Implement Index Service
  - [x] 8.1 Create Index Service
    - Create `backend/src/services/index.service.ts`
    - Implement `regenerate()` method
    - Implement `getIndexContent()` method
    - _Requirements: 10.1_
  
  - [x] 8.2 Implement index generation logic
    - Generate header with timestamp and entry counts
    - Generate people table with Name, Context, Last Touched columns
    - Generate active projects table with Project, Next Action, Status columns
    - Generate waiting/blocked projects table with Project, Waiting On, Since columns
    - Generate ideas table with Idea, One-liner columns
    - Generate pending admin table with Task, Due columns
    - Generate inbox table with Captured, Original Text, Suggested columns
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
  
  - [x] 8.3 Integrate index regeneration with Entry Service
    - Call Index Service regenerate after create/update/delete
    - Include index.md in the same git commit as entry changes
    - _Requirements: 10.1, 10.9_
  
  - [x] 8.4 Write unit tests for Index Service
    - Test index contains correct header format
    - Test index contains correct table structure
    - Test entry counts match actual entries
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [x] 9. Checkpoint - Verify entry system
  - Ensure Entry Service CRUD operations work correctly
  - Ensure Git commits are created with correct format
  - Ensure index.md is regenerated on changes
  - Ask the user if questions arise

- [x] 10. Implement data folder initialization
  - [x] 10.1 Create initialization module
    - Create `backend/src/services/init.service.ts`
    - Check if data folder exists and is empty
    - Create category subdirectories: people, projects, ideas, admin, inbox
    - Create initial empty index.md
    - Initialize git repository with initial commit
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [x] 10.2 Integrate initialization on app startup
    - Call initialization service before starting Express server
    - Log initialization status
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 11. Implement API routes for entries
  - [x] 11.1 Create entries router
    - Create `backend/src/routes/entries.ts`
    - Apply auth middleware to all routes
    - _Requirements: 2.3_
  
  - [x] 11.2 Implement GET /api/entries endpoint
    - List entries with optional category and status query params
    - Return JSON array of EntrySummary objects
    - _Requirements: 6.3, 6.4_
  
  - [x] 11.3 Implement GET /api/entries/:path endpoint
    - Get single entry by path
    - Return 404 if not found
    - _Requirements: 6.1, 6.2_
  
  - [x] 11.4 Implement POST /api/entries endpoint
    - Create new entry from request body
    - Return created entry with 201 status
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 11.5 Implement PATCH /api/entries/:path endpoint
    - Update existing entry with partial data
    - Return updated entry
    - Return 404 if not found
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 11.6 Implement DELETE /api/entries/:path endpoint
    - Delete entry by path
    - Return 204 No Content on success
    - Return 404 if not found
    - _Requirements: 8.1, 8.2_
  
  - [x] 11.7 Implement GET /api/index endpoint
    - Return index.md content as text
    - _Requirements: 10.1_
  
  - [x] 11.8 Write integration tests for API routes
    - Test all CRUD endpoints
    - Test authentication requirement
    - Test error responses
    - _Requirements: 2.3, 2.4, 5.1-5.7, 6.1-6.4, 7.1-7.5, 8.1-8.2_

- [x] 12. Checkpoint - Verify backend API
  - Ensure all API endpoints work correctly
  - Ensure authentication is enforced
  - Ensure error responses are consistent
  - Ask the user if questions arise

- [x] 13. Set up frontend foundation
  - [x] 13.1 Initialize frontend with Vite and React
    - Create `frontend/package.json` with React 18, TypeScript, Vite dependencies
    - Create `frontend/vite.config.ts` with proxy to backend
    - Create `frontend/tsconfig.json` with React settings
    - Create `frontend/index.html` entry point
    - _Requirements: 3.1_
  
  - [x] 13.2 Configure Tailwind CSS
    - Install Tailwind CSS and dependencies
    - Create `frontend/tailwind.config.js`
    - Create `frontend/src/index.css` with Tailwind directives
    - _Requirements: 3.2_
  
  - [x] 13.3 Set up shadcn/ui
    - Initialize shadcn/ui with default configuration
    - Install base components (button, input, card)
    - _Requirements: 3.3_
  
  - [x] 13.4 Create basic App component
    - Create `frontend/src/main.tsx` entry point
    - Create `frontend/src/App.tsx` with basic layout
    - Verify Vite build outputs to dist folder
    - _Requirements: 3.1, 3.4_
  
  - [x] 13.5 Create API client service
    - Create `frontend/src/services/api.ts`
    - Implement setAuthToken method
    - Implement health, entries, and index API methods
    - Handle authentication header
    - _Requirements: 3.5_

- [x] 14. Configure backend to serve frontend
  - [x] 14.1 Add static file serving to Express
    - Serve frontend dist folder in production mode
    - Configure fallback to index.html for SPA routing
    - _Requirements: 3.5_

- [x] 15. Create project documentation
  - [x] 15.1 Create root README.md
    - Project overview and description
    - Prerequisites (Docker, Node.js)
    - Quick start guide with Docker Compose
    - Environment variable documentation
    - Development setup instructions
    - _Requirements: 1.1, 11.1-11.7_
  
  - [x] 15.2 Create API documentation
    - Document all API endpoints with request/response examples
    - Document authentication requirements
    - Document error response format
    - _Requirements: 2.3, 2.4, 2.5_
  
  - [x] 15.3 Create .env.example with documentation
    - Include all required and optional environment variables
    - Add comments explaining each variable
    - _Requirements: 11.1-11.7_

- [x] 16. Final checkpoint - Verify complete setup
  - Ensure Docker Compose starts all services
  - Ensure frontend loads in browser
  - Ensure API endpoints are accessible
  - Ensure entry CRUD operations work end-to-end
  - Ask the user if questions arise

## Notes

- All tasks are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (round-trip serialization)
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end API functionality
