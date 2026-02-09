/**
 * Entry type definitions for the Second Brain application
 */

export type Category = 'people' | 'projects' | 'ideas' | 'task' | 'admin' | 'inbox';
export type Channel = 'chat' | 'email' | 'api';
export type ProjectStatus = 'active' | 'waiting' | 'blocked' | 'someday' | 'done';
export type AdminStatus = 'pending' | 'done';
export type InboxStatus = 'needs_review';

/**
 * Base entry fields shared by all categories (except inbox)
 */
export interface BaseEntry {
  id: string;
  name: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  source_channel: Channel;
  confidence: number;
  focus_minutes_total?: number;
  focus_last_session?: string;
}

/**
 * People entry - information about a specific person
 */
export interface PeopleEntry extends BaseEntry {
  context: string;
  follow_ups: string[];
  related_projects: string[];
  last_touched: string;
}

/**
 * Projects entry - something with multiple steps, a goal, and a timeline
 */
export interface ProjectsEntry extends BaseEntry {
  status: ProjectStatus;
  next_action: string;
  related_people: string[];
  due_date?: string;
  stale?: boolean;
  stale_since?: string;
}

/**
 * Ideas entry - a concept, insight, or potential future thing
 */
export interface IdeasEntry extends BaseEntry {
  one_liner: string;
  related_projects: string[];
}

/**
 * Admin entry - a single task/errand with a due date
 */
export interface AdminEntry extends BaseEntry {
  status: AdminStatus;
  due_date?: string;
}

/**
 * Inbox entry - low-confidence items needing review
 */
export interface InboxEntry {
  id: string;
  original_text: string;
  suggested_category: Category;
  suggested_name: string;
  confidence: number;
  status: InboxStatus;
  source_channel: Channel;
  created_at: string;
}

/**
 * Union type for all entry types
 */
export type Entry = PeopleEntry | ProjectsEntry | IdeasEntry | AdminEntry | InboxEntry;

/**
 * Entry with path information (for API responses)
 */
export interface EntryWithPath {
  path: string;
  category: Category;
  entry: Entry;
  content: string;
}

export interface EntryLinkSummary {
  path: string;
  category: Category;
  name: string;
}

export interface EntryLinksResponse {
  outgoing: EntryLinkSummary[];
  incoming: EntryLinkSummary[];
}

export interface EntryGraphEdge {
  source: string;
  target: string;
  type: 'mention' | 'relationship';
}

export interface EntryGraphConnection {
  direction: 'incoming' | 'outgoing';
  via: 'mention' | 'relationship';
  reason: string;
  source: EntryLinkSummary;
  target: EntryLinkSummary;
  createdAt?: string;
}

export interface EntryGraphResponse {
  center: EntryLinkSummary;
  nodes: EntryLinkSummary[];
  edges: EntryGraphEdge[];
  connections?: EntryGraphConnection[];
}

export interface RelationshipInsight {
  person: EntryLinkSummary;
  score: number;
  relationshipCount: number;
  projectCount: number;
  mentionCount: number;
  relatedPeople: Array<EntryLinkSummary & { count: number }>;
  relatedProjects: Array<EntryLinkSummary & { count: number }>;
  lastInteractionAt?: string;
}

export interface RelationshipInsightsResponse {
  insights: RelationshipInsight[];
}

/**
 * Summary type for list operations
 */
export interface EntrySummary {
  id: string;
  path: string;
  name: string;
  category: Category;
  updated_at: string;
  // Category-specific summary fields
  status?: string;
  next_action?: string;
  one_liner?: string;
  due_date?: string;
  context?: string;
  last_touched?: string;
  original_text?: string;
  suggested_category?: Category;
}

/**
 * Filters for listing entries
 */
export interface EntryFilters {
  status?: string;
}

// ============================================
// Create Entry Input Types
// ============================================

export interface CreatePeopleInput {
  name: string;
  context: string;
  follow_ups?: string[];
  related_projects?: string[];
  tags?: string[];
  source_channel: Channel;
  confidence: number;
}

export interface CreateProjectsInput {
  name: string;
  status?: ProjectStatus;
  next_action: string;
  related_people?: string[];
  tags?: string[];
  due_date?: string;
  source_channel: Channel;
  confidence: number;
}

export interface CreateIdeasInput {
  name: string;
  one_liner: string;
  related_projects?: string[];
  tags?: string[];
  source_channel: Channel;
  confidence: number;
}

export interface CreateAdminInput {
  name: string;
  status?: AdminStatus;
  due_date?: string;
  tags?: string[];
  source_channel: Channel;
  confidence: number;
}

export interface CreateInboxInput {
  original_text: string;
  suggested_category: Category;
  suggested_name: string;
  confidence: number;
  source_channel: Channel;
}

export type CreateEntryInput = 
  | CreatePeopleInput 
  | CreateProjectsInput 
  | CreateIdeasInput 
  | CreateAdminInput 
  | CreateInboxInput;

// ============================================
// Update Entry Input Types
// ============================================

export interface UpdatePeopleInput {
  name?: string;
  context?: string;
  follow_ups?: string[];
  related_projects?: string[];
  tags?: string[];
  confidence?: number;
}

export interface UpdateProjectsInput {
  name?: string;
  status?: ProjectStatus;
  next_action?: string;
  related_people?: string[];
  tags?: string[];
  due_date?: string;
  confidence?: number;
  stale?: boolean;
  stale_since?: string;
}

export interface UpdateIdeasInput {
  name?: string;
  one_liner?: string;
  related_projects?: string[];
  tags?: string[];
  confidence?: number;
}

export interface UpdateAdminInput {
  name?: string;
  status?: AdminStatus;
  due_date?: string;
  tags?: string[];
  confidence?: number;
}

export interface UpdateInboxInput {
  original_text?: string;
  suggested_category?: Category;
  suggested_name?: string;
  confidence?: number;
}

export type UpdateEntryInput = 
  | UpdatePeopleInput 
  | UpdateProjectsInput 
  | UpdateIdeasInput 
  | UpdateAdminInput 
  | UpdateInboxInput;

// ============================================
// Body Content Update Types
// ============================================

/**
 * Body content update modes:
 * - append: Add content to end of existing body
 * - replace: Replace entire body with new content
 * - section: Append to a specific section (creates section if missing)
 */
export type BodyContentMode = 'append' | 'replace' | 'section';

/**
 * Body content update specification for EntryService.update()
 */
export interface BodyContentUpdate {
  content: string;
  mode: BodyContentMode;
  section?: string;  // Required when mode is 'section'
}
