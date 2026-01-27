# Requirements Document

## Introduction

This feature enhances entry content management in the Second Brain application. Currently, entries are created with only frontmatter (metadata) and no body content. The product vision shows entries should have both frontmatter AND body content (Notes sections, Logs, Elaboration, etc.). Additionally, users cannot delete entries through the LLM interface.

This spec addresses three gaps:
1. Body content generation during entry creation
2. Body content editing capabilities
3. Entry deletion through the LLM

## Glossary

- **Entry**: A markdown file in the memory directory with YAML frontmatter and optional body content
- **Frontmatter**: YAML metadata at the top of an entry file (id, name, status, etc.)
- **Body_Content**: Markdown content below the frontmatter (Notes, Log, Elaboration sections)
- **Entry_Service**: Backend service responsible for CRUD operations on entries
- **Tool_Registry**: Service that defines LLM tool schemas for function calling
- **Tool_Executor**: Service that executes LLM tool calls against underlying services
- **Classification_Agent**: LLM-powered service that classifies user input into categories
- **Category**: One of people, projects, ideas, admin, or inbox

## Requirements

### Requirement 1: Body Content Generation on Entry Creation

**User Story:** As a user, I want the LLM to generate organized body content when creating entries, so that my captured information is structured and useful rather than just raw text in metadata.

#### Acceptance Criteria

1. WHEN the classify_and_capture tool creates an entry, THE Classification_Agent SHALL generate appropriate body content based on the input text and category
2. WHEN creating a people entry, THE Classification_Agent SHALL generate a Notes section with relevant observations about the person
3. WHEN creating a projects entry, THE Classification_Agent SHALL generate Notes and/or Log sections with project-relevant information
4. WHEN creating an ideas entry, THE Classification_Agent SHALL generate an Elaboration section expanding on the idea
5. WHEN creating an admin entry, THE Classification_Agent SHALL generate a Notes section if the input contains additional context beyond the task itself
6. WHEN the Entry_Service creates an entry with body content, THE Entry_Service SHALL write both frontmatter and body content to the markdown file
7. THE Classification_Agent SHALL extract and organize information intelligently, not simply copy the raw input text verbatim

### Requirement 2: Body Content Editing

**User Story:** As a user, I want to add notes and update body content of existing entries, so that I can keep my knowledge base current with new information.

#### Acceptance Criteria

1. WHEN a user requests to add content to an entry, THE update_entry tool SHALL accept a body_content parameter for modifying the entry body
2. WHEN body_content is provided with mode "append", THE Entry_Service SHALL append the new content to the existing body
3. WHEN body_content is provided with mode "replace", THE Entry_Service SHALL replace the entire body with the new content
4. WHEN body_content is provided with mode "section", THE Entry_Service SHALL append content to a specific section (e.g., Notes, Log)
5. IF the specified section does not exist, THEN THE Entry_Service SHALL create the section before appending
6. WHEN appending to a Log section, THE Entry_Service SHALL prepend the current date to the log entry
7. THE Entry_Service SHALL preserve existing frontmatter when updating body content

### Requirement 3: Entry Deletion

**User Story:** As a user, I want to delete entries through natural language commands, so that I can remove outdated or incorrect information from my knowledge base.

#### Acceptance Criteria

1. THE Tool_Registry SHALL expose a delete_entry tool to the LLM
2. WHEN the delete_entry tool is called, THE Tool_Executor SHALL invoke Entry_Service.delete() with the specified path
3. WHEN an entry is successfully deleted, THE delete_entry tool SHALL return the deleted entry's path and name
4. IF the specified entry does not exist, THEN THE delete_entry tool SHALL return an error indicating the entry was not found
5. WHEN an entry is deleted, THE Entry_Service SHALL regenerate the index and create a git commit

### Requirement 4: Classification Response Enhancement

**User Story:** As a developer, I want the classification response to include body content, so that entries can be created with both metadata and content in a single operation.

#### Acceptance Criteria

1. THE Classification_Agent SHALL return a body_content field in the ClassificationResult
2. WHEN generating body_content, THE Classification_Agent SHALL use category-appropriate section headers (Notes, Log, Elaboration)
3. THE Classification_Agent SHALL format body_content as valid markdown
4. IF the input text contains no additional context worth capturing in the body, THEN THE Classification_Agent SHALL return an empty body_content string
