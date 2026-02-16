/**
 * API Client for Second Brain backend
 */

export type Category = 'people' | 'projects' | 'ideas' | 'task' | 'admin' | 'inbox';
export type Channel = 'chat' | 'email' | 'api';

export interface Entry {
  id: string;
  name?: string;
  [key: string]: unknown;
}

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

export interface LinkMutationOptions {
  type?: 'mention' | 'relationship';
}

export interface LinkDeleteOptions extends LinkMutationOptions {
  direction?: 'outgoing' | 'incoming';
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

export interface EntrySummary {
  id: string;
  path: string;
  name: string;
  category: Category;
  updated_at: string;
  status?: string;
  next_action?: string;
  one_liner?: string;
  due_date?: string;
  due_at?: string;
  duration_minutes?: number;
  fixed_at?: string;
  priority?: number;
  context?: string;
  last_touched?: string;
  original_text?: string;
  suggested_category?: Category;
}

export interface SearchHit {
  path: string;
  name: string;
  category: Category;
  matchedField: string;
  snippet: string;
  highlightRanges?: Array<{ start: number; end: number }>;
  score?: number;
  keywordScore?: number;
  semanticScore?: number;
}

export interface SearchResult {
  entries: SearchHit[];
  total: number;
}

export interface FocusTrack {
  id: string;
  youtubeId: string;
  title?: string | null;
  channelTitle?: string | null;
  rating: number;
  likesCount: number;
  dislikesCount: number;
  timesPlayed: number;
  lastPlayedAt?: string | null;
}

export interface FocusSession {
  id: string;
  entryPath: string;
  entryName?: string | null;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  completed: boolean;
  notes?: string | null;
  trackId?: string | null;
  createdAt: string;
}

export interface WeekPlanItem {
  entryPath: string;
  category: Category;
  title: string;
  sourceName: string;
  dueDate?: string;
  start: string;
  end: string;
  durationMinutes: number;
  reason: string;
}

export interface WeekPlanUnscheduledItem {
  entryPath: string;
  category: Category;
  title: string;
  sourceName: string;
  dueDate?: string;
  durationMinutes: number;
  reasonCode: 'outside_window' | 'outside_working_hours' | 'fixed_conflict' | 'no_free_slot';
  reason: string;
}

export interface WeekPlanResponse {
  startDate: string;
  endDate: string;
  granularityMinutes: number;
  bufferMinutes: number;
  items: WeekPlanItem[];
  totalMinutes: number;
  warnings?: string[];
  unscheduled: WeekPlanUnscheduledItem[];
  generatedAt: string;
  revision: string;
}

export interface CalendarPublishResponse {
  httpsUrl: string;
  webcalUrl: string;
  expiresAt: string;
}

export interface CalendarSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  color?: string | null;
  etag?: string | null;
  lastSyncAt?: string | null;
  fetchStatus: string;
  fetchError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarSyncResponse {
  source: CalendarSource;
  importedBlocks: number;
  totalBlocks: number;
}

export interface CalendarBusyBlock {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceColor: string | null;
  title: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
}

export interface CalendarSettings {
  workdayStartTime: string;
  workdayEndTime: string;
  workingDays: number[];
}

export interface RelationshipInsightsResponse {
  insights: RelationshipInsight[];
}

export interface EntryFilters {
  status?: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  filedEntryPath?: string;
  filedConfidence?: number;
  captureAction?: {
    type: 'start_focus_5m';
    entryPath: string;
    entryName: string;
    durationMinutes: number;
    label: string;
  };
  quickReplies?: Array<{
    id: string;
    label: string;
    message: string;
  }>;
  createdAt: string;
}

export interface ChatResponse {
  conversationId: string;
  message: ChatMessage;
  entry?: {
    path: string;
    category: string;
    name: string;
    confidence: number;
  };
  clarificationNeeded: boolean;
}

export interface CaptureResponse {
  entry: EntryWithPath;
  message: string;
  clarificationNeeded: boolean;
}

export interface Conversation {
  id: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

class ApiClient {
  private authToken: string = '';
  private baseUrl: string = '/api';

  /**
   * Set the authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Get the authentication token
   */
  getAuthToken(): string {
    return this.authToken;
  }

  /**
   * Make an authenticated request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.authToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Check content type for text responses
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('text/')) {
      return response.text() as Promise<T>;
    }

    return response.json();
  }

  /**
   * Health check (no auth required)
   */
  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }

  /**
   * Entry operations
   */
  entries = {
    /**
     * List entries with optional filters
     */
    list: async (category?: Category, filters?: EntryFilters): Promise<EntrySummary[]> => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (filters?.status) params.set('status', filters.status);
      
      const queryString = params.toString();
      const endpoint = queryString ? `/entries?${queryString}` : '/entries';
      
      const response = await this.request<{ entries: EntrySummary[] }>(endpoint);
      return response.entries;
    },

    /**
     * Get a single entry by path
     */
    get: async (path: string): Promise<EntryWithPath> => {
      return this.request<EntryWithPath>(`/entries/${path}`);
    },

    /**
     * Get links for a single entry
     */
    links: async (path: string): Promise<EntryLinksResponse> => {
      return this.request<EntryLinksResponse>(`/entries/${path}/links`);
    },

    addLink: async (
      path: string,
      targetPath: string,
      options?: LinkMutationOptions
    ): Promise<void> => {
      await this.request(`/entries/${path}/links`, {
        method: 'POST',
        body: JSON.stringify({
          targetPath,
          ...(options?.type ? { type: options.type } : {})
        })
      });
    },

    removeLink: async (
      path: string,
      targetPath: string,
      options?: LinkDeleteOptions
    ): Promise<number> => {
      const response = await this.request<{ removed: number }>(`/entries/${path}/links`, {
        method: 'DELETE',
        body: JSON.stringify({
          targetPath,
          ...(options?.direction ? { direction: options.direction } : {}),
          ...(options?.type ? { type: options.type } : {})
        })
      });
      return response.removed;
    },

    /**
     * Get lightweight graph data for a single entry
     */
    graph: async (path: string): Promise<EntryGraphResponse> => {
      return this.request<EntryGraphResponse>(`/entries/${path}/graph`);
    },

    /**
     * Create a new entry
     */
    create: async (category: Category, data: Record<string, unknown>): Promise<EntryWithPath> => {
      return this.request<EntryWithPath>('/entries', {
        method: 'POST',
        body: JSON.stringify({ category, ...data }),
      });
    },

    /**
     * Update an existing entry
     */
    update: async (path: string, updates: Record<string, unknown>): Promise<EntryWithPath> => {
      return this.request<EntryWithPath>(`/entries/${path}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },

    /**
     * Delete an entry
     */
    delete: async (path: string): Promise<void> => {
      await this.request<void>(`/entries/${path}`, {
        method: 'DELETE',
      });
    },
  };

  /**
   * Index operations
   */
  index = {
    /**
     * Get the index.md content
     */
    get: async (): Promise<string> => {
      return this.request<string>('/index');
    },
  };

  /**
   * Authentication operations
   */
  auth = {
    register: async (payload: { email: string; password: string; name?: string }): Promise<AuthResponse> => {
      return this.request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    login: async (payload: { email: string; password: string }): Promise<AuthResponse> => {
      return this.request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    me: async (): Promise<AuthUser> => {
      return this.request<AuthUser>('/auth/me');
    },
  };

  /**
   * Chat operations
   */
  chat = {
    /**
     * Send a chat message
     */
    send: async (message: string, conversationId?: string, hints?: string): Promise<ChatResponse> => {
      return this.request<ChatResponse>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, conversationId, hints }),
      });
    },

    /**
     * List conversations
     */
    listConversations: async (limit?: number, offset?: number): Promise<Conversation[]> => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', limit.toString());
      if (offset) params.set('offset', offset.toString());
      
      const queryString = params.toString();
      const endpoint = queryString ? `/chat/conversations?${queryString}` : '/chat/conversations';
      
      const response = await this.request<{ conversations: Conversation[] }>(endpoint);
      return response.conversations;
    },

    /**
     * Get messages for a conversation
     */
    getMessages: async (conversationId: string, limit?: number): Promise<ChatMessage[]> => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', limit.toString());
      
      const queryString = params.toString();
      const endpoint = queryString 
        ? `/chat/conversations/${conversationId}/messages?${queryString}` 
        : `/chat/conversations/${conversationId}/messages`;
      
      const response = await this.request<{ messages: ChatMessage[] }>(endpoint);
      return response.messages;
    },

    /**
     * Get a specific conversation
     */
    getConversation: async (conversationId: string): Promise<Conversation> => {
      return this.request<Conversation>(`/chat/conversations/${conversationId}`);
    },

    /**
     * Create a new empty chat conversation
     */
    createConversation: async (): Promise<Conversation> => {
      return this.request<Conversation>('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({})
      });
    },
  };

  /**
   * Capture operations
   */
  capture = {
    create: async (payload: { text: string; hints?: string }): Promise<CaptureResponse> => {
      return this.request<CaptureResponse>('/capture', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    transcribe: async (payload: { audioBase64: string; mimeType?: string }): Promise<{ text: string }> => {
      return this.request<{ text: string }>('/capture/transcribe', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  };

  /**
   * Search operations
   */
  search = {
    query: async (query: string, category?: Category, limit?: number): Promise<SearchResult> => {
      const params = new URLSearchParams();
      params.set('query', query);
      if (category) params.set('category', category);
      if (limit) params.set('limit', limit.toString());
      const endpoint = `/search?${params.toString()}`;
      return this.request<SearchResult>(endpoint);
    }
  };

  /**
   * Inbox triage operations
   */
  inbox = {
    triage: async (payload: {
      action: 'move' | 'resolve' | 'merge';
      paths: string[];
      targetCategory?: Category;
      targetPath?: string;
    }): Promise<{ entries?: EntryWithPath[]; entry?: EntryWithPath }> => {
      return this.request<{ entries?: EntryWithPath[]; entry?: EntryWithPath }>(`/inbox/triage`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  };

  /**
   * Focus operations
   */
  focus = {
    nextTrack: async (mode: 'auto' | 'new' = 'auto', excludeYoutubeId?: string): Promise<FocusTrack> => {
      const params = new URLSearchParams();
      params.set('mode', mode);
      if (excludeYoutubeId) params.set('exclude', excludeYoutubeId);
      return this.request<FocusTrack>(`/focus/tracks/next?${params.toString()}`);
    },
    rateTrack: async (youtubeId: string, rating: number): Promise<FocusTrack> => {
      return this.request<FocusTrack>(`/focus/tracks/rate`, {
        method: 'POST',
        body: JSON.stringify({ youtubeId, rating })
      });
    },
    recordSession: async (payload: {
      entryPath: string;
      durationSeconds: number;
      startedAt: string;
      endedAt: string;
      trackYoutubeId?: string;
      notes?: string;
    }): Promise<FocusSession> => {
      return this.request<FocusSession>(`/focus/sessions`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    logProgress: async (entryPath: string, note: string): Promise<void> => {
      await this.request<void>(`/focus/progress`, {
        method: 'POST',
        body: JSON.stringify({ entryPath, note })
      });
    },
    congrats: async (payload: { entryPath?: string; entryName?: string; minutes?: number }): Promise<{ message: string }> => {
      return this.request<{ message: string }>(`/focus/congrats`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  };

  calendar = {
    planWeek: async (
      startDate?: string,
      days?: number,
      options?: { granularityMinutes?: number; bufferMinutes?: number }
    ): Promise<WeekPlanResponse> => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (typeof days === 'number') params.set('days', String(days));
      if (typeof options?.granularityMinutes === 'number') {
        params.set('granularityMinutes', String(options.granularityMinutes));
      }
      if (typeof options?.bufferMinutes === 'number') {
        params.set('bufferMinutes', String(options.bufferMinutes));
      }
      const query = params.toString();
      const endpoint = query ? `/calendar/plan-week?${query}` : '/calendar/plan-week';
      return this.request<WeekPlanResponse>(endpoint);
    },
    publish: async (): Promise<CalendarPublishResponse> => {
      return this.request<CalendarPublishResponse>('/calendar/publish');
    },
    listSources: async (): Promise<CalendarSource[]> => {
      const response = await this.request<{ sources: CalendarSource[] }>('/calendar/sources');
      return response.sources;
    },
    settings: async (): Promise<CalendarSettings> => {
      return this.request<CalendarSettings>('/calendar/settings');
    },
    updateSettings: async (payload: Partial<CalendarSettings>): Promise<CalendarSettings> => {
      return this.request<CalendarSettings>('/calendar/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    },
    replan: async (payload?: {
      startDate?: string;
      days?: number;
      granularityMinutes?: number;
      bufferMinutes?: number;
    }): Promise<WeekPlanResponse> => {
      return this.request<WeekPlanResponse>('/calendar/replan', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    },
    createSource: async (payload: { name: string; url: string; color?: string }): Promise<CalendarSource> => {
      return this.request<CalendarSource>('/calendar/sources', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    updateSource: async (
      sourceId: string,
      payload: { name?: string; enabled?: boolean; color?: string | null }
    ): Promise<CalendarSource> => {
      return this.request<CalendarSource>(`/calendar/sources/${sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    },
    deleteSource: async (sourceId: string): Promise<void> => {
      await this.request<void>(`/calendar/sources/${sourceId}`, {
        method: 'DELETE'
      });
    },
    syncSource: async (sourceId: string): Promise<CalendarSyncResponse> => {
      return this.request<CalendarSyncResponse>(`/calendar/sources/${sourceId}/sync`, {
        method: 'POST'
      });
    },
    busyBlocks: async (startDate: string, endDate: string): Promise<CalendarBusyBlock[]> => {
      const response = await this.request<{ blocks: CalendarBusyBlock[] }>(
        `/calendar/busy-blocks?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      return response.blocks;
    }
  };

  insights = {
    relationships: async (limit = 5): Promise<RelationshipInsightsResponse> => {
      return this.request<RelationshipInsightsResponse>(`/insights/relationships?limit=${limit}`);
    }
  };
}

// Export singleton instance
export const api = new ApiClient();

// Also export the class for testing
export { ApiClient };
