/**
 * Unit tests for ClassificationAgent
 * Tests classification logic, prompt building, response parsing, and error handling.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import {
  ClassificationAgent,
  ClassificationError,
  ClassificationAPIError,
  ClassificationTimeoutError,
  InvalidClassificationResponseError,
  resetClassificationAgent,
} from '../../../src/services/classification.service';
import {
  ClassificationInput,
  ClassificationResult,
  ContextWindow,
} from '../../../src/types/chat.types';
import { CLASSIFICATION_SYSTEM_PROMPT } from '../../../src/services/context.service';

// Mock OpenAI
const mockCreate = jest.fn();
const mockOpenAI = {
  chat: {
    completions: {
      create: mockCreate,
    },
  },
};

// Helper to create a valid classification response
function createValidResponse(overrides: Partial<{
  category: string;
  confidence: number;
  name: string;
  slug: string;
  fields: Record<string, unknown>;
  related_entries: string[];
  reasoning: string;
}> = {}): string {
  return JSON.stringify({
    category: 'projects',
    confidence: 0.85,
    name: 'Website Redesign',
    slug: 'website-redesign',
    fields: {
      status: 'active',
      nextAction: 'Create wireframes',
      relatedPeople: ['john-doe'],
    },
    related_entries: ['existing-project'],
    reasoning: 'This is a multi-step task with a clear goal.',
    ...overrides,
  });
}

// Helper to create a context window
function createContextWindow(overrides: Partial<ContextWindow> = {}): ContextWindow {
  return {
    systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
    indexContent: '# Index\n- projects/existing-project.md',
    summaries: [],
    recentMessages: [],
    ...overrides,
  };
}

// Helper to create classification input
function createClassificationInput(
  text: string,
  hints?: string,
  contextOverrides?: Partial<ContextWindow>
): ClassificationInput {
  return {
    text,
    hints,
    context: createContextWindow(contextOverrides),
  };
}

describe('ClassificationAgent', () => {
  let classificationAgent: ClassificationAgent;

  beforeEach(() => {
    resetClassificationAgent();
    classificationAgent = new ClassificationAgent(mockOpenAI as any, 5000);

    // Reset mock
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: createValidResponse(),
          },
        },
      ],
    });
  });

  // ============================================
  // classify() - Basic Functionality
  // ============================================

  describe('classify - basic functionality', () => {
    it('should classify a thought and return structured result', async () => {
      const input = createClassificationInput(
        'I need to redesign the company website with new branding'
      );

      const result = await classificationAgent.classify(input);

      expect(result).toMatchObject({
        category: 'projects',
        confidence: 0.85,
        name: 'Website Redesign',
        slug: 'website-redesign',
        reasoning: expect.any(String),
      });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should call OpenAI with correct model and parameters', async () => {
      const input = createClassificationInput('Test thought');

      await classificationAgent.classify(input);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 1000,
        }),
        expect.any(Object)
      );
    });

    it('should include system prompt in the API call', async () => {
      const input = createClassificationInput('Test thought');

      await classificationAgent.classify(input);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toBe(CLASSIFICATION_SYSTEM_PROMPT);
    });

    it('should include user input in the prompt', async () => {
      const input = createClassificationInput('My specific thought to classify');

      await classificationAgent.classify(input);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      expect(userContent).toContain('My specific thought to classify');
    });

    it('should include hints in the prompt when provided', async () => {
      const input = createClassificationInput(
        'Meeting with John about the project',
        '[person]'
      );

      await classificationAgent.classify(input);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      expect(userContent).toContain('[person]');
      expect(userContent).toContain('Hints');
    });

    it('should include index content in the prompt', async () => {
      const input = createClassificationInput('Test thought', undefined, {
        indexContent: '# My Index\n- people/john-doe.md\n- projects/website.md',
      });

      await classificationAgent.classify(input);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      expect(userContent).toContain('# My Index');
      expect(userContent).toContain('people/john-doe.md');
    });
  });

  // ============================================
  // classify() - Category Classification
  // ============================================

  describe('classify - category classification', () => {
    it('should classify as people category', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({
                category: 'people',
                name: 'John Doe',
                slug: 'john-doe',
                fields: {
                  context: 'Met at conference',
                  followUps: ['Send email'],
                  relatedProjects: [],
                },
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Met John Doe at the tech conference');
      const result = await classificationAgent.classify(input);

      expect(result.category).toBe('people');
      expect(result.fields).toMatchObject({
        context: 'Met at conference',
        followUps: ['Send email'],
        relatedProjects: [],
      });
    });

    it('should classify as projects category', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({
                category: 'projects',
                fields: {
                  status: 'active',
                  nextAction: 'Create wireframes',
                  relatedPeople: [],
                  dueDate: '2024-03-01',
                },
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Website redesign project');
      const result = await classificationAgent.classify(input);

      expect(result.category).toBe('projects');
      expect(result.fields).toMatchObject({
        status: 'active',
        nextAction: 'Create wireframes',
        dueDate: '2024-03-01',
      });
    });

    it('should classify as ideas category', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({
                category: 'ideas',
                name: 'AI-powered assistant',
                slug: 'ai-powered-assistant',
                fields: {
                  oneLiner: 'Build an AI assistant for daily tasks',
                  relatedProjects: ['automation-project'],
                },
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('What if we built an AI assistant?');
      const result = await classificationAgent.classify(input);

      expect(result.category).toBe('ideas');
      expect(result.fields).toMatchObject({
        oneLiner: 'Build an AI assistant for daily tasks',
        relatedProjects: ['automation-project'],
      });
    });

    it('should classify as admin category', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({
                category: 'admin',
                name: 'Pay electricity bill',
                slug: 'pay-electricity-bill',
                fields: {
                  status: 'pending',
                  dueDate: '2024-02-15',
                },
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Need to pay the electricity bill by Friday');
      const result = await classificationAgent.classify(input);

      expect(result.category).toBe('admin');
      expect(result.fields).toMatchObject({
        status: 'pending',
        dueDate: '2024-02-15',
      });
    });
  });

  // ============================================
  // classify() - Context Handling
  // ============================================

  describe('classify - context handling', () => {
    it('should include conversation summaries in prompt', async () => {
      const input = createClassificationInput('Follow up on that', undefined, {
        summaries: [
          {
            id: 'sum-1',
            conversationId: 'conv-1',
            summary: 'User discussed website project with John',
            messageCount: 10,
            startMessageId: 'msg-1',
            endMessageId: 'msg-10',
            createdAt: new Date(),
          },
        ],
      });

      await classificationAgent.classify(input);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      expect(userContent).toContain('Conversation summaries');
      expect(userContent).toContain('User discussed website project with John');
    });

    it('should include recent messages in prompt', async () => {
      const input = createClassificationInput('Yes, that one', undefined, {
        recentMessages: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            role: 'user',
            content: 'I want to track the website project',
            createdAt: new Date(),
          },
          {
            id: 'msg-2',
            conversationId: 'conv-1',
            role: 'assistant',
            content: 'Which project are you referring to?',
            createdAt: new Date(),
          },
        ],
      });

      await classificationAgent.classify(input);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      expect(userContent).toContain('Recent conversation');
      expect(userContent).toContain('I want to track the website project');
      expect(userContent).toContain('Which project are you referring to?');
    });

    it('should handle empty index content gracefully', async () => {
      const input = createClassificationInput('New thought', undefined, {
        indexContent: '',
      });

      await classificationAgent.classify(input);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      expect(userContent).toContain('(No existing entries)');
    });
  });

  // ============================================
  // classify() - Response Parsing
  // ============================================

  describe('classify - response parsing', () => {
    it('should normalize confidence to 0-1 range', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({ confidence: 1.5 }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect(result.confidence).toBe(1);
    });

    it('should normalize negative confidence to 0', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({ confidence: -0.5 }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect(result.confidence).toBe(0);
    });

    it('should normalize slug to URL-safe format', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({ slug: 'My Project Name!' }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect(result.slug).toBe('my-project-name');
      expect(result.slug).toMatch(/^[a-z0-9-]+$/);
    });

    it('should handle snake_case field names from LLM', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'projects',
                confidence: 0.8,
                name: 'Test Project',
                slug: 'test-project',
                fields: {
                  status: 'active',
                  next_action: 'Do something',
                  related_people: ['john'],
                  due_date: '2024-03-01',
                },
                related_entries: ['other'],
                reasoning: 'Test',
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect(result.fields).toMatchObject({
        status: 'active',
        nextAction: 'Do something',
        relatedPeople: ['john'],
        dueDate: '2024-03-01',
      });
    });

    it('should handle missing optional fields', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'admin',
                confidence: 0.9,
                name: 'Simple Task',
                slug: 'simple-task',
                fields: {
                  status: 'pending',
                },
                related_entries: [],
                reasoning: 'A simple admin task',
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect(result.fields).toMatchObject({
        status: 'pending',
      });
      expect((result.fields as any).dueDate).toBeUndefined();
    });

    it('should normalize related_entries to relatedEntries', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: createValidResponse({
                related_entries: ['project-a', 'project-b'],
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect(result.relatedEntries).toEqual(['project-a', 'project-b']);
    });
  });

  // ============================================
  // classify() - Error Handling
  // ============================================

  describe('classify - error handling', () => {
    it('should throw InvalidClassificationResponseError for invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'This is not valid JSON',
            },
          },
        ],
      });

      const input = createClassificationInput('Test');

      await expect(classificationAgent.classify(input)).rejects.toThrow(
        InvalidClassificationResponseError
      );
    });

    it('should throw InvalidClassificationResponseError for missing required fields', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'projects',
                // Missing confidence, name, slug, fields
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');

      await expect(classificationAgent.classify(input)).rejects.toThrow(
        InvalidClassificationResponseError
      );
    });

    it('should throw InvalidClassificationResponseError for invalid category', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'invalid_category',
                confidence: 0.8,
                name: 'Test',
                slug: 'test',
                fields: {},
                reasoning: 'Test',
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');

      await expect(classificationAgent.classify(input)).rejects.toThrow(
        InvalidClassificationResponseError
      );
    });

    it('should throw ClassificationAPIError when OpenAI returns empty response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const input = createClassificationInput('Test');

      await expect(classificationAgent.classify(input)).rejects.toThrow(
        ClassificationAPIError
      );
    });

    it('should throw ClassificationAPIError when OpenAI API fails', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const input = createClassificationInput('Test');

      await expect(classificationAgent.classify(input)).rejects.toThrow(
        ClassificationError
      );
    });

    it('should throw ClassificationTimeoutError when request times out', async () => {
      // Mock the OpenAI call to simulate an abort error (what happens on timeout)
      mockCreate.mockImplementation((_params: unknown, options: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          // Check if signal is already aborted or listen for abort
          if (options?.signal?.aborted) {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
            return;
          }
          
          options?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
          
          // Never resolve - let the timeout trigger
        });
      });

      // Create agent with very short timeout
      const shortTimeoutAgent = new ClassificationAgent(mockOpenAI as any, 10);
      const input = createClassificationInput('Test');

      await expect(shortTimeoutAgent.classify(input)).rejects.toThrow(
        ClassificationTimeoutError
      );
    });

    it('should include raw response in InvalidClassificationResponseError', async () => {
      const invalidJson = '{ invalid json }';
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: invalidJson,
            },
          },
        ],
      });

      const input = createClassificationInput('Test');

      try {
        await classificationAgent.classify(input);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidClassificationResponseError);
        expect((error as InvalidClassificationResponseError).rawResponse).toBe(
          invalidJson
        );
      }
    });
  });

  // ============================================
  // Field Normalization
  // ============================================

  describe('field normalization', () => {
    it('should default projects status to active if invalid', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'projects',
                confidence: 0.8,
                name: 'Test',
                slug: 'test',
                fields: {
                  status: 'invalid_status',
                  nextAction: 'Do something',
                  relatedPeople: [],
                },
                related_entries: [],
                reasoning: 'Test',
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect((result.fields as any).status).toBe('active');
    });

    it('should handle empty arrays for list fields', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'people',
                confidence: 0.8,
                name: 'Test Person',
                slug: 'test-person',
                fields: {
                  context: 'Met at event',
                  // Missing followUps and relatedProjects
                },
                related_entries: [],
                reasoning: 'Test',
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect((result.fields as any).followUps).toEqual([]);
      expect((result.fields as any).relatedProjects).toEqual([]);
    });

    it('should filter non-string values from arrays', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'people',
                confidence: 0.8,
                name: 'Test',
                slug: 'test',
                fields: {
                  context: 'Test',
                  followUps: ['valid', 123, null, 'also-valid'],
                  relatedProjects: [],
                },
                related_entries: ['valid', 456, 'also-valid'],
                reasoning: 'Test',
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect((result.fields as any).followUps).toEqual(['valid', 'also-valid']);
      expect(result.relatedEntries).toEqual(['valid', 'also-valid']);
    });

    it('should handle missing reasoning field', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'admin',
                confidence: 0.9,
                name: 'Task',
                slug: 'task',
                fields: { status: 'pending' },
                related_entries: [],
                // No reasoning field
              }),
            },
          },
        ],
      });

      const input = createClassificationInput('Test');
      const result = await classificationAgent.classify(input);

      expect(result.reasoning).toBe('');
    });
  });
});
