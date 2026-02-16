/**
 * Chat-related type definitions for the Second Brain application
 * Implements types for chat capture and classification feature
 */

import { Category, Channel } from './entry.types';

// ============================================
// Classification Types
// ============================================

/**
 * Input for the Classification Agent
 */
export interface ClassificationInput {
  text: string;
  hints?: string;
  context: ContextWindow;
}

/**
 * Result returned by the Classification Agent
 */
export interface ClassificationResult {
  category: 'people' | 'projects' | 'ideas' | 'task' | 'admin';
  confidence: number;
  name: string;
  slug: string;
  fields: CategoryFields;
  relatedEntries: string[];
  reasoning: string;
  bodyContent: string;  // Generated markdown body content
}

/**
 * Union type for category-specific fields
 */
export type CategoryFields =
  | PeopleFields
  | ProjectsFields
  | IdeasFields
  | AdminFields;

/**
 * Fields specific to people entries
 */
export interface PeopleFields {
  context: string;
  followUps: string[];
  relatedProjects: string[];
}

/**
 * Fields specific to projects entries
 */
export interface ProjectsFields {
  status: 'active' | 'waiting' | 'blocked' | 'someday';
  nextAction: string;
  relatedPeople: string[];
  dueDate?: string;
}

/**
 * Fields specific to ideas entries
 */
export interface IdeasFields {
  oneLiner: string;
  relatedProjects: string[];
}

/**
 * Fields specific to admin entries
 */
export interface AdminFields {
  status: 'pending';
  dueDate?: string;
  dueAt?: string;
  durationMinutes?: number;
  fixedAt?: string;
  priority?: number;
  relatedPeople: string[];
}

// ============================================
// Context Window Types
// ============================================

/**
 * Conversation summary stored in the database
 */
export interface ConversationSummary {
  id: string;
  conversationId: string;
  summary: string;
  messageCount: number;
  startMessageId: string;
  endMessageId: string;
  createdAt: Date;
}

/**
 * Message in a conversation
 */
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  filedEntryPath?: string;
  filedConfidence?: number;
  quickReplies?: QuickReplyOption[];
  createdAt: Date;
}

export interface QuickReplyOption {
  id: string;
  label: string;
  message: string;
}

export interface CaptureAction {
  type: 'start_focus_5m';
  entryPath: string;
  entryName: string;
  durationMinutes: number;
  label: string;
}

/**
 * Context window assembled for LLM calls
 */
export interface ContextWindow {
  indexContent: string;
  summaries: ConversationSummary[];
  recentMessages: Message[];
  systemPrompt: string;
}

// ============================================
// Chat API Types
// ============================================

/**
 * Request body for POST /api/chat
 */
export interface ChatRequest {
  message: string;
  conversationId?: string;
  hints?: string;
}

/**
 * Assistant message in a chat response
 */
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  content: string;
  filedEntryPath?: string;
  filedConfidence?: number;
  quickReplies?: QuickReplyOption[];
  captureAction?: CaptureAction;
  createdAt: Date;
}

/**
 * Response from the chat service
 */
export interface ChatResponse {
  conversationId: string;
  message: AssistantMessage;
  entry?: {
    path: string;
    category: Category;
    name: string;
    confidence: number;
  };
  clarificationNeeded: boolean;
  toolsUsed?: string[];
}

// ============================================
// Course Correction Types
// ============================================

/**
 * Request for course correction (reclassification)
 */
export interface CourseCorrectRequest {
  conversationId: string;
  targetCategory: Category;
  entryPath: string;
}

/**
 * Response from course correction operation
 */
export interface CourseCorrectResponse {
  success: boolean;
  newPath: string;
  message: string;
}

// ============================================
// Conversation Types
// ============================================

/**
 * Conversation entity
 */
export interface Conversation {
  id: string;
  channel: Channel;
  externalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// API Response Types
// ============================================

/**
 * API response for POST /api/chat
 */
export interface ChatApiResponse {
  conversationId: string;
  message: {
    id: string;
    role: 'assistant';
    content: string;
    filedEntryPath?: string;
    filedConfidence?: number;
    quickReplies?: QuickReplyOption[];
    captureAction?: CaptureAction;
    createdAt: string;
  };
  entry?: {
    path: string;
    category: string;
    name: string;
    confidence: number;
  };
  clarificationNeeded: boolean;
  toolsUsed?: string[];
}

/**
 * API response for GET /api/conversations
 */
export interface ConversationsResponse {
  conversations: {
    id: string;
    channel: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }[];
}

/**
 * API response for GET /api/conversations/:id/messages
 */
export interface MessagesResponse {
  messages: {
    id: string;
    role: string;
    content: string;
    filedEntryPath?: string;
    filedConfidence?: number;
    quickReplies?: QuickReplyOption[];
    createdAt: string;
  }[];
}
