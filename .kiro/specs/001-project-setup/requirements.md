# Requirements Document

## Introduction

This document defines the requirements for the foundational setup of the Second Brain application - a self-hosted, AI-powered personal knowledge management system. This spec covers the project scaffolding, backend/frontend foundations, database schema, markdown entry system with YAML frontmatter, index generation, and git integration.

## Glossary

- **Second_Brain_App**: The main application container running React frontend, Express.js backend, and scheduled jobs
- **Entry**: A markdown file with YAML frontmatter representing a piece of knowledge (person, project, idea, or admin task)
- **Category**: One of five entry types: people, projects, ideas, admin, or inbox
- **Frontmatter**: YAML metadata at the top of a markdown file between `---` delimiters
- **Data_Folder**: The `/memory` volume-mounted directory containing all markdown entries and git repository
- **Index_Generator**: Component that auto-generates index.md summarizing all entries
- **Entry_Service**: Backend service handling CRUD operations for markdown entries
- **Git_Service**: Backend service managing git operations for the data folder
- **Prisma_Client**: Type-safe database client for PostgreSQL operations
- **API_Server**: Express.js REST API server handling HTTP requests

## Requirements

### Requirement 1: Project Structure and Docker Setup

**User Story:** As a developer, I want a well-organized monorepo with Docker Compose configuration, so that I can easily develop and deploy the application.

#### Acceptance Criteria

1. THE Second_Brain_App SHALL use a monorepo structure with separate `/frontend` and `/backend` directories
2. THE Second_Brain_App SHALL include a `docker-compose.yml` file defining app and PostgreSQL containers
3. WHEN Docker Compose starts, THE Second_Brain_App SHALL expose port 3000 for the application
4. WHEN Docker Compose starts, THE PostgreSQL container SHALL be healthy before the app container starts
5. THE Second_Brain_App SHALL mount the external data directory (specified by `DATA_PATH` environment variable) as a volume at `/memory` inside the container
6. THE Second_Brain_App SHALL include a root `package.json` with workspace configuration for the monorepo
7. THE Data_Folder SHALL be located outside the project directory to maintain separate git repositories for code and data

### Requirement 2: Backend Foundation

**User Story:** As a developer, I want an Express.js + TypeScript backend with Prisma ORM, so that I can build type-safe APIs with database access.

#### Acceptance Criteria

1. THE API_Server SHALL be built with Express.js and TypeScript
2. THE API_Server SHALL use Prisma as the ORM for PostgreSQL database access
3. THE API_Server SHALL validate the `Authorization` header containing a Bearer token against the configured `API_KEY` environment variable
4. WHEN a request lacks a valid Bearer token, THE API_Server SHALL return a 401 Unauthorized response
5. THE API_Server SHALL expose a health check endpoint at `GET /api/health`
6. THE Prisma_Client SHALL connect to PostgreSQL using the `DATABASE_URL` environment variable

### Requirement 3: Frontend Foundation

**User Story:** As a developer, I want a React 18 + TypeScript + Vite frontend with Tailwind CSS, so that I can build a modern, responsive UI.

#### Acceptance Criteria

1. THE Second_Brain_App frontend SHALL be built with React 18, TypeScript, and Vite
2. THE Second_Brain_App frontend SHALL use Tailwind CSS for styling
3. THE Second_Brain_App frontend SHALL include shadcn/ui component library setup
4. WHEN the frontend builds, THE Vite bundler SHALL output production assets to a dist folder
5. THE API_Server SHALL serve the frontend static files in production mode

### Requirement 4: Database Schema

**User Story:** As a developer, I want a Prisma schema defining conversations, messages, summaries, and audit logs, so that I can persist application state.

#### Acceptance Criteria

1. THE Prisma_Client schema SHALL define a `Conversation` model with id, channel (chat/email/api), externalId, timestamps, and relations to messages and summaries
2. THE Prisma_Client schema SHALL define a `Message` model with id, conversationId, role (user/assistant), content, filedEntryPath, filedConfidence, and createdAt
3. THE Prisma_Client schema SHALL define a `ConversationSummary` model with id, conversationId, summary text, messageCount, startMessageId, endMessageId, and createdAt
4. THE Prisma_Client schema SHALL define an `EntryAuditLog` model with id, entryPath, operation (create/update/delete/move), gitCommitHash, channel, messageId, and createdAt
5. THE Prisma_Client schema SHALL define a `CronJobRun` model with id, jobName, status (running/success/failed), result, startedAt, and completedAt
6. THE Prisma_Client schema SHALL define an `EmailThread` model with id, messageId, threadId, inReplyTo, subject, fromAddress, conversationId, and createdAt

### Requirement 5: Markdown Entry Creation

**User Story:** As a user, I want to create markdown entries with YAML frontmatter in the appropriate category folder, so that my knowledge is organized and stored.

#### Acceptance Criteria

1. WHEN creating a people entry, THE Entry_Service SHALL write a markdown file to `/memory/people/{slug}.md` with frontmatter containing id, name, context, follow_ups array, related_projects array, last_touched, tags array, created_at, updated_at, source_channel, and confidence
2. WHEN creating a projects entry, THE Entry_Service SHALL write a markdown file to `/memory/projects/{slug}.md` with frontmatter containing id, name, status (active/waiting/blocked/someday/done), next_action, related_people array, tags array, due_date, created_at, updated_at, source_channel, and confidence
3. WHEN creating an ideas entry, THE Entry_Service SHALL write a markdown file to `/memory/ideas/{slug}.md` with frontmatter containing id, name, one_liner, tags array, related_projects array, created_at, updated_at, source_channel, and confidence
4. WHEN creating an admin entry, THE Entry_Service SHALL write a markdown file to `/memory/admin/{slug}.md` with frontmatter containing id, name, status (pending/done), due_date, tags array, created_at, updated_at, source_channel, and confidence
5. WHEN creating an inbox entry, THE Entry_Service SHALL write a markdown file to `/memory/inbox/{timestamp}-{slug}.md` with frontmatter containing id, original_text, suggested_category, suggested_name, confidence, status (needs_review), source_channel, and created_at
6. THE Entry_Service SHALL use the gray-matter library to serialize frontmatter and content into markdown files
7. THE Entry_Service SHALL generate a UUID for the id field of each new entry

### Requirement 6: Markdown Entry Reading

**User Story:** As a user, I want to read and parse markdown entries with their frontmatter, so that I can view my stored knowledge.

#### Acceptance Criteria

1. WHEN reading an entry, THE Entry_Service SHALL parse the markdown file using gray-matter to extract frontmatter and content
2. WHEN reading an entry that does not exist, THE Entry_Service SHALL return a not-found error
3. WHEN listing entries by category, THE Entry_Service SHALL return all entries from the specified category folder
4. THE Entry_Service SHALL support listing entries filtered by status for projects and admin categories

### Requirement 7: Markdown Entry Updating

**User Story:** As a user, I want to update existing markdown entries, so that I can keep my knowledge current.

#### Acceptance Criteria

1. WHEN updating an entry, THE Entry_Service SHALL merge the provided updates with existing frontmatter
2. WHEN updating an entry, THE Entry_Service SHALL set the updated_at field to the current timestamp
3. WHEN updating a people entry, THE Entry_Service SHALL set the last_touched field to the current timestamp
4. WHEN updating an entry that does not exist, THE Entry_Service SHALL return a not-found error
5. THE Entry_Service SHALL preserve the original content section when only updating frontmatter fields

### Requirement 8: Markdown Entry Deletion

**User Story:** As a user, I want to delete markdown entries, so that I can remove outdated knowledge.

#### Acceptance Criteria

1. WHEN deleting an entry, THE Entry_Service SHALL remove the markdown file from the data folder
2. WHEN deleting an entry that does not exist, THE Entry_Service SHALL return a not-found error

### Requirement 9: Git Integration

**User Story:** As a user, I want all entry operations to create git commits, so that I have a complete audit trail and can recover from mistakes.

#### Acceptance Criteria

1. WHEN the application starts and no git repository exists in `/memory`, THE Git_Service SHALL initialize a new git repository
2. WHEN an entry is created, THE Git_Service SHALL create a commit with message format `create({category}): {entry_name} [confidence: {confidence}] [via: {channel}]`
3. WHEN an entry is updated, THE Git_Service SHALL create a commit with message format `update({category}): {entry_name} - {change_summary} [via: {channel}]`
4. WHEN an entry is deleted, THE Git_Service SHALL create a commit with message format `delete({category}): {entry_name} [via: {channel}]`
5. THE Git_Service SHALL use the simple-git library for all git operations
6. THE Git_Service SHALL return the commit hash after each successful commit

### Requirement 10: Index Generation

**User Story:** As a user, I want an auto-generated index.md file summarizing all entries, so that I can quickly see what's in my second brain.

#### Acceptance Criteria

1. WHEN any entry is created, updated, or deleted, THE Index_Generator SHALL regenerate `/memory/index.md`
2. THE Index_Generator SHALL include a header with last updated timestamp and total entry counts by category
3. THE Index_Generator SHALL list people entries in a table with Name, Context, and Last Touched columns
4. THE Index_Generator SHALL list active projects in a table with Project, Next Action, and Status columns
5. THE Index_Generator SHALL list waiting/blocked projects in a separate table with Project, Waiting On, and Since columns
6. THE Index_Generator SHALL list ideas in a table with Idea and One-liner columns
7. THE Index_Generator SHALL list pending admin tasks in a table with Task and Due columns
8. THE Index_Generator SHALL list inbox items needing review in a table with Captured, Original Text, and Suggested columns
9. WHEN the index is regenerated, THE Git_Service SHALL NOT create a separate commit for the index update

### Requirement 11: Environment Configuration

**User Story:** As a developer, I want environment-based configuration, so that I can customize the application for different deployments.

#### Acceptance Criteria

1. THE Second_Brain_App SHALL require the `OPENAI_API_KEY` environment variable
2. THE Second_Brain_App SHALL require the `DATABASE_URL` environment variable
3. THE Second_Brain_App SHALL require the `API_KEY` environment variable for API authentication
4. THE Second_Brain_App SHALL require the `DATA_PATH` environment variable specifying the external data directory location
5. THE Second_Brain_App SHALL support optional `TIMEZONE` environment variable defaulting to `Europe/Berlin`
6. THE Second_Brain_App SHALL support optional `CONFIDENCE_THRESHOLD` environment variable defaulting to `0.6`
7. IF a required environment variable is missing, THEN THE Second_Brain_App SHALL fail to start with a descriptive error message

### Requirement 12: Data Folder Initialization

**User Story:** As a user, I want the data folder structure to be automatically created on first run, so that I don't have to manually set up directories.

#### Acceptance Criteria

1. WHEN the application starts and the data folder is empty, THE Second_Brain_App SHALL create the `people`, `projects`, `ideas`, `admin`, and `inbox` subdirectories
2. WHEN the application starts and the data folder is empty, THE Index_Generator SHALL create an initial empty `index.md` file
3. WHEN the application starts and the data folder is empty, THE Git_Service SHALL initialize a git repository and create an initial commit
