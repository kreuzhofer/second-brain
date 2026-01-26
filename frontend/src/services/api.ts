/**
 * API Client for Second Brain backend
 */

export type Category = 'people' | 'projects' | 'ideas' | 'admin' | 'inbox';
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

export interface EntrySummary {
  path: string;
  name: string;
  category: Category;
  updated_at: string;
  status?: string;
  next_action?: string;
  one_liner?: string;
  due_date?: string;
  context?: string;
  last_touched?: string;
  original_text?: string;
  suggested_category?: Category;
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
  };
}

// Export singleton instance
export const api = new ApiClient();

// Also export the class for testing
export { ApiClient };
