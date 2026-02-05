/**
 * Unit tests for SummarizationService
 * Tests summarization trigger logic, summary generation, and message retention.
 * 
 * Requirements: 9.1, 9.3, 9.5
 */

import { getPrismaClient, disconnectPrisma } from '../../../src/lib/prisma';
import {
  SummarizationService,
  SummarizationError,
  OpenAIError,
  resetSummarizationService,
} from '../../../src/services/summarization.service';
import {
  ConversationService,
  resetConversationService,
} from '../../../src/services/conversation.service';
import { Message } from '../../../src/types/chat.types';

// Mock OpenAI
const mockCreate = jest.fn();
const mockOpenAI = {
  chat: {
    completions: {
      create: mockCreate,
    },
  },
};

describe('SummarizationService', () => {
  let summarizationService: SummarizationService;
  let conversationService: ConversationService;
  const prisma = getPrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Reset singletons
    resetSummarizationService();
    resetConversationService();
    
    conversationService = new ConversationService();
    summarizationService = new SummarizationService(
      mockOpenAI as any,
      conversationService
    );

    // Reset mock
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Test summary: Key topics discussed, decisions made.',
          },
        },
      ],
    });

    // Clean up test data (order matters due to foreign keys)
    await prisma.message.deleteMany({});
    await prisma.conversationSummary.deleteMany({});
    await prisma.conversation.deleteMany({});
  });

  afterAll(async () => {
    await prisma.message.deleteMany({});
    await prisma.conversationSummary.deleteMany({});
    await prisma.conversation.deleteMany({});
    await disconnectPrisma();
  });

  // ============================================
  // generateSummary Tests
  // ============================================

  describe('generateSummary', () => {
    it('should generate a summary for a batch of messages', async () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'I need to track a new project called Website Redesign',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'msg-2',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'I\'ve created a new project entry for Website Redesign',
          filedEntryPath: 'projects/website-redesign.md',
          filedConfidence: 0.85,
          createdAt: new Date('2024-01-01T10:01:00Z'),
        },
      ];

      const summary = await summarizationService.generateSummary(messages);

      expect(summary).toBe('Test summary: Key topics discussed, decisions made.');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 500,
        })
      );
    });

    it('should include filing information in the prompt', async () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'Filed as a project',
          filedEntryPath: 'projects/test.md',
          filedConfidence: 0.9,
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ];

      await summarizationService.generateSummary(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      
      expect(userContent).toContain('projects/test.md');
      expect(userContent).toContain('0.90');
    });

    it('should throw SummarizationError for empty message array', async () => {
      await expect(summarizationService.generateSummary([]))
        .rejects.toThrow(SummarizationError);
      
      await expect(summarizationService.generateSummary([]))
        .rejects.toThrow('Cannot generate summary for empty message array');
    });

    it('should throw SummarizationError when OpenAI returns empty content', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Test message',
          createdAt: new Date(),
        },
      ];

      await expect(summarizationService.generateSummary(messages))
        .rejects.toThrow(SummarizationError);
    });

    it('should throw OpenAIError when API call fails', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Test message',
          createdAt: new Date(),
        },
      ];

      await expect(summarizationService.generateSummary(messages))
        .rejects.toThrow(OpenAIError);
    });

    it('should format messages with timestamps and roles', async () => {
      const testDate = new Date('2024-01-15T14:30:00Z');
      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Hello assistant',
          createdAt: testDate,
        },
      ];

      await summarizationService.generateSummary(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      const userContent = callArgs.messages[1].content;
      
      expect(userContent).toContain('User:');
      expect(userContent).toContain('Hello assistant');
      expect(userContent).toContain('2024-01-15');
    });

    it('should include system prompt for summarization', async () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Test',
          createdAt: new Date(),
        },
      ];

      await summarizationService.generateSummary(messages);

      const callArgs = mockCreate.mock.calls[0][0];
      const systemContent = callArgs.messages[0].content;
      
      expect(systemContent).toContain('Key topics discussed');
      expect(systemContent).toContain('Decisions made');
      expect(systemContent).toContain('User preferences learned');
    });
  });

  // ============================================
  // checkAndSummarize Tests
  // ============================================

  describe('checkAndSummarize', () => {
    it('should not summarize when message count is below threshold', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add fewer messages than MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE (default 25)
      for (let i = 0; i < 20; i++) {
        await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
      }

      await summarizationService.checkAndSummarize(conversation.id);

      // OpenAI should not be called
      expect(mockCreate).not.toHaveBeenCalled();

      // No summaries should be created
      const summaries = await conversationService.getSummaries(conversation.id);
      expect(summaries).toHaveLength(0);
    });

    it('should summarize when message count exceeds threshold', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add more messages than MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE (default 25)
      for (let i = 0; i < 26; i++) {
        await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
      }

      await summarizationService.checkAndSummarize(conversation.id);

      // OpenAI should be called
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // A summary should be created
      const summaries = await conversationService.getSummaries(conversation.id);
      expect(summaries).toHaveLength(1);
    });

    it('should retain MAX_VERBATIM_MESSAGES most recent messages unsummarized', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add 26 messages (threshold is 25, verbatim is 15)
      // So messages 1-10 should be summarized, 11-26 kept verbatim
      const messageIds: string[] = [];
      for (let i = 0; i < 26; i++) {
        const msg = await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
        messageIds.push(msg.id);
      }

      await summarizationService.checkAndSummarize(conversation.id);

      const summaries = await conversationService.getSummaries(conversation.id);
      expect(summaries).toHaveLength(1);

      // Summary should cover messages 1-10 (indices 0-9)
      // endMessageId should be message at index 9 (26 - 15 - 1 = 10, but batch size is 10)
      const summary = summaries[0];
      expect(summary.startMessageId).toBe(messageIds[0]);
      expect(summary.endMessageId).toBe(messageIds[9]);
      expect(summary.messageCount).toBe(10);
    });

    it('should not re-summarize already summarized messages', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add 26 messages
      for (let i = 0; i < 26; i++) {
        await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
      }

      // First summarization
      await summarizationService.checkAndSummarize(conversation.id);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Reset mock
      mockCreate.mockClear();

      // Second call should not create new summary (no new messages to summarize)
      await summarizationService.checkAndSummarize(conversation.id);
      expect(mockCreate).not.toHaveBeenCalled();

      const summaries = await conversationService.getSummaries(conversation.id);
      expect(summaries).toHaveLength(1);
    });

    it('should create additional summary when more messages are added', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add 26 messages
      for (let i = 0; i < 26; i++) {
        await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
      }

      // First summarization
      await summarizationService.checkAndSummarize(conversation.id);
      
      // Add 9 more messages (total 35)
      for (let i = 26; i < 35; i++) {
        await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
      }

      mockCreate.mockClear();

      // Second summarization should create another summary
      await summarizationService.checkAndSummarize(conversation.id);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      const summaries = await conversationService.getSummaries(conversation.id);
      expect(summaries).toHaveLength(2);
    });

    it('should handle conversation with no messages', async () => {
      const conversation = await conversationService.create('chat');

      // Should not throw
      await summarizationService.checkAndSummarize(conversation.id);

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should store summary with correct metadata', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add 26 messages
      const messages = [];
      for (let i = 0; i < 26; i++) {
        const msg = await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
        messages.push(msg);
      }

      await summarizationService.checkAndSummarize(conversation.id);

      const summaries = await conversationService.getSummaries(conversation.id);
      expect(summaries).toHaveLength(1);

      const summary = summaries[0];
      expect(summary.conversationId).toBe(conversation.id);
      expect(summary.summary).toBe('Test summary: Key topics discussed, decisions made.');
      expect(summary.startMessageId).toBe(messages[0].id);
      // With 26 messages and 15 verbatim, we summarize first 10 (indices 0-9)
      expect(summary.endMessageId).toBe(messages[9].id);
      expect(summary.messageCount).toBe(10);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('should handle exactly threshold number of messages', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add exactly 25 messages (threshold)
      for (let i = 0; i < 25; i++) {
        await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
      }

      await summarizationService.checkAndSummarize(conversation.id);

      // Should not summarize at exactly threshold
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should handle threshold + 1 messages', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add 26 messages (threshold + 1)
      for (let i = 0; i < 26; i++) {
        await conversationService.addMessage(
          conversation.id,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i + 1}`
        );
      }

      await summarizationService.checkAndSummarize(conversation.id);

      // Should summarize (batch size 10)
      expect(mockCreate).toHaveBeenCalledTimes(1);

      const summaries = await conversationService.getSummaries(conversation.id);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].messageCount).toBe(10);
    });

    it('should trim whitespace from generated summary', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: '  Summary with whitespace  \n\n',
            },
          },
        ],
      });

      const messages: Message[] = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Test',
          createdAt: new Date(),
        },
      ];

      const summary = await summarizationService.generateSummary(messages);
      expect(summary).toBe('Summary with whitespace');
    });
  });
});
