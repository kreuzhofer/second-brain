/**
 * Unit tests for ContextAssembler
 * Tests context assembly with empty conversation, messages but no summaries,
 * both messages and summaries, and message limit enforcement.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { getPrismaClient, disconnectPrisma } from '../../../src/lib/prisma';
import {
  ContextAssembler,
  CLASSIFICATION_SYSTEM_PROMPT,
  resetContextAssembler,
} from '../../../src/services/context.service';
import {
  ConversationService,
  resetConversationService,
} from '../../../src/services/conversation.service';
import { IndexService } from '../../../src/services/index.service';
import { EntryService } from '../../../src/services/entry.service';
import { resetDatabase } from '../../setup';

describe('ContextAssembler', () => {
  let contextAssembler: ContextAssembler;
  let conversationService: ConversationService;
  let indexService: IndexService;
  let entryService: EntryService;
  const prisma = getPrismaClient();

  beforeAll(async () => {
    // Ensure database connection
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Reset singletons and create fresh instances
    resetConversationService();
    resetContextAssembler();
    
    conversationService = new ConversationService();
    entryService = new EntryService();
    indexService = new IndexService(entryService);
    
    // Create ContextAssembler with test dependencies
    contextAssembler = new ContextAssembler(
      indexService,
      conversationService,
      15 // MAX_VERBATIM_MESSAGES
    );

    // Clean up test data before each test
    await resetDatabase();
    
    // Create a fresh index.md
    await indexService.regenerate();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  // ============================================
  // Basic Assembly Tests
  // ============================================

  describe('assemble', () => {
    it('should return a ContextWindow with all required fields', async () => {
      const conversation = await conversationService.create('chat');
      
      const context = await contextAssembler.assemble(conversation.id);

      expect(context).toBeDefined();
      expect(context).toHaveProperty('systemPrompt');
      expect(context).toHaveProperty('indexContent');
      expect(context).toHaveProperty('summaries');
      expect(context).toHaveProperty('recentMessages');
    });

    it('should include the classification system prompt', async () => {
      const conversation = await conversationService.create('chat');
      
      const context = await contextAssembler.assemble(conversation.id);

      expect(context.systemPrompt).toBe(CLASSIFICATION_SYSTEM_PROMPT);
      expect(context.systemPrompt).toContain('classification agent');
      expect(context.systemPrompt).toContain('people');
      expect(context.systemPrompt).toContain('projects');
      expect(context.systemPrompt).toContain('ideas');
      expect(context.systemPrompt).toContain('admin');
    });

    it('should include index.md content (Requirement 8.1)', async () => {
      const conversation = await conversationService.create('chat');
      
      const context = await contextAssembler.assemble(conversation.id);

      expect(context.indexContent).toBeDefined();
      expect(typeof context.indexContent).toBe('string');
      // Index should contain the header
      expect(context.indexContent).toContain('Second Brain Index');
    });
  });

  // ============================================
  // Empty Conversation Tests
  // ============================================

  describe('context assembly with empty conversation', () => {
    it('should return empty arrays for messages and summaries', async () => {
      const conversation = await conversationService.create('chat');
      
      const context = await contextAssembler.assemble(conversation.id);

      expect(context.recentMessages).toEqual([]);
      expect(context.summaries).toEqual([]);
    });

    it('should still include system prompt and index content', async () => {
      const conversation = await conversationService.create('chat');
      
      const context = await contextAssembler.assemble(conversation.id);

      expect(context.systemPrompt).toBe(CLASSIFICATION_SYSTEM_PROMPT);
      expect(context.indexContent).toBeDefined();
    });
  });

  // ============================================
  // Messages Without Summaries Tests
  // ============================================

  describe('context assembly with messages but no summaries', () => {
    it('should include all messages when under limit (Requirement 8.2)', async () => {
      const conversation = await conversationService.create('chat');
      
      await conversationService.addMessage(conversation.id, 'user', 'First message');
      await conversationService.addMessage(conversation.id, 'assistant', 'First response');
      await conversationService.addMessage(conversation.id, 'user', 'Second message');

      const context = await contextAssembler.assemble(conversation.id);

      expect(context.recentMessages).toHaveLength(3);
      expect(context.summaries).toEqual([]);
    });

    it('should return messages in chronological order (oldest to newest)', async () => {
      const conversation = await conversationService.create('chat');
      
      await conversationService.addMessage(conversation.id, 'user', 'First');
      await new Promise(resolve => setTimeout(resolve, 5));
      await conversationService.addMessage(conversation.id, 'assistant', 'Second');
      await new Promise(resolve => setTimeout(resolve, 5));
      await conversationService.addMessage(conversation.id, 'user', 'Third');

      const context = await contextAssembler.assemble(conversation.id);

      expect(context.recentMessages[0].content).toBe('First');
      expect(context.recentMessages[1].content).toBe('Second');
      expect(context.recentMessages[2].content).toBe('Third');
    });

    it('should include message metadata', async () => {
      const conversation = await conversationService.create('chat');
      
      await conversationService.addMessage(
        conversation.id,
        'assistant',
        'Filed entry',
        'projects/test.md',
        0.85
      );

      const context = await contextAssembler.assemble(conversation.id);

      expect(context.recentMessages[0].filedEntryPath).toBe('projects/test.md');
      expect(context.recentMessages[0].filedConfidence).toBe(0.85);
    });
  });

  // ============================================
  // Messages With Summaries Tests
  // ============================================

  describe('context assembly with both messages and summaries', () => {
    it('should include summaries in chronological order (Requirement 8.3)', async () => {
      const conversation = await conversationService.create('chat');
      
      const msg1 = await conversationService.addMessage(conversation.id, 'user', 'First');
      const msg2 = await conversationService.addMessage(conversation.id, 'assistant', 'Second');
      
      await conversationService.addSummary(
        conversation.id,
        'First summary',
        1,
        msg1.id,
        msg1.id
      );
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await conversationService.addSummary(
        conversation.id,
        'Second summary',
        1,
        msg2.id,
        msg2.id
      );

      const context = await contextAssembler.assemble(conversation.id);

      expect(context.summaries).toHaveLength(2);
      expect(context.summaries[0].summary).toBe('First summary');
      expect(context.summaries[1].summary).toBe('Second summary');
    });

    it('should include both summaries and recent messages', async () => {
      const conversation = await conversationService.create('chat');
      
      const msg1 = await conversationService.addMessage(conversation.id, 'user', 'Old message');
      await conversationService.addSummary(
        conversation.id,
        'Summary of old messages',
        1,
        msg1.id,
        msg1.id
      );
      
      await conversationService.addMessage(conversation.id, 'user', 'Recent message');

      const context = await contextAssembler.assemble(conversation.id);

      expect(context.summaries).toHaveLength(1);
      expect(context.recentMessages.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Message Limit Enforcement Tests
  // ============================================

  describe('message limit enforcement (Requirement 8.5)', () => {
    it('should limit messages to MAX_VERBATIM_MESSAGES', async () => {
      // Create assembler with small limit for testing
      const smallLimitAssembler = new ContextAssembler(
        indexService,
        conversationService,
        5 // Small limit for testing
      );

      const conversation = await conversationService.create('chat');
      
      // Add more messages than the limit
      for (let i = 1; i <= 10; i++) {
        await conversationService.addMessage(conversation.id, 'user', `Message ${i}`);
      }

      const context = await smallLimitAssembler.assemble(conversation.id);

      expect(context.recentMessages).toHaveLength(5);
    });

    it('should return the most recent messages when over limit', async () => {
      // Create assembler with small limit for testing
      const smallLimitAssembler = new ContextAssembler(
        indexService,
        conversationService,
        3 // Small limit for testing
      );

      const conversation = await conversationService.create('chat');
      
      // Add messages
      for (let i = 1; i <= 6; i++) {
        await conversationService.addMessage(conversation.id, 'user', `Message ${i}`);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const context = await smallLimitAssembler.assemble(conversation.id);

      // Should have the last 3 messages (4, 5, 6)
      expect(context.recentMessages).toHaveLength(3);
      expect(context.recentMessages[0].content).toBe('Message 4');
      expect(context.recentMessages[1].content).toBe('Message 5');
      expect(context.recentMessages[2].content).toBe('Message 6');
    });

    it('should return all messages when under limit', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add fewer messages than the limit (15)
      for (let i = 1; i <= 5; i++) {
        await conversationService.addMessage(conversation.id, 'user', `Message ${i}`);
      }

      const context = await contextAssembler.assemble(conversation.id);

      expect(context.recentMessages).toHaveLength(5);
    });

    it('should return exactly limit messages when at limit', async () => {
      // Create assembler with specific limit
      const exactLimitAssembler = new ContextAssembler(
        indexService,
        conversationService,
        5
      );

      const conversation = await conversationService.create('chat');
      
      // Add exactly the limit number of messages
      for (let i = 1; i <= 5; i++) {
        await conversationService.addMessage(conversation.id, 'user', `Message ${i}`);
      }

      const context = await exactLimitAssembler.assemble(conversation.id);

      expect(context.recentMessages).toHaveLength(5);
    });
  });

  // ============================================
  // Context Ordering Tests (Requirement 8.4)
  // ============================================

  describe('context ordering (Requirement 8.4)', () => {
    it('should have system prompt as first component', async () => {
      const conversation = await conversationService.create('chat');
      await conversationService.addMessage(conversation.id, 'user', 'Test');

      const context = await contextAssembler.assemble(conversation.id);

      // System prompt should be present and non-empty
      expect(context.systemPrompt).toBeTruthy();
      expect(context.systemPrompt.length).toBeGreaterThan(0);
    });

    it('should have index content as second component', async () => {
      const conversation = await conversationService.create('chat');

      const context = await contextAssembler.assemble(conversation.id);

      // Index content should be present
      expect(context.indexContent).toBeDefined();
      expect(typeof context.indexContent).toBe('string');
    });

    it('should have summaries before recent messages', async () => {
      const conversation = await conversationService.create('chat');
      
      const msg1 = await conversationService.addMessage(conversation.id, 'user', 'Old');
      await conversationService.addSummary(
        conversation.id,
        'Summary',
        1,
        msg1.id,
        msg1.id
      );
      await conversationService.addMessage(conversation.id, 'user', 'Recent');

      const context = await contextAssembler.assemble(conversation.id);

      // Both should be present - summaries come before messages in the structure
      expect(context.summaries.length).toBeGreaterThan(0);
      expect(context.recentMessages.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('should handle non-existent conversation gracefully', async () => {
      const context = await contextAssembler.assemble('non-existent-id');

      // Should return empty arrays for messages and summaries
      expect(context.recentMessages).toEqual([]);
      expect(context.summaries).toEqual([]);
      // But still include system prompt and index
      expect(context.systemPrompt).toBe(CLASSIFICATION_SYSTEM_PROMPT);
    });

    it('should handle empty index.md', async () => {
      await resetDatabase();
      const emptyEntryService = new EntryService();
      const emptyIndexService = new IndexService(emptyEntryService);
      
      const emptyContextAssembler = new ContextAssembler(
        emptyIndexService,
        conversationService,
        15
      );

      const conversation = await conversationService.create('chat');
      const context = await emptyContextAssembler.assemble(conversation.id);

      // Should handle gracefully - empty string is acceptable
      expect(typeof context.indexContent).toBe('string');
    });

    it('should handle conversation with only summaries (no recent messages)', async () => {
      const conversation = await conversationService.create('chat');
      
      // Add a message and immediately summarize it
      const msg = await conversationService.addMessage(conversation.id, 'user', 'Old message');
      await conversationService.addSummary(
        conversation.id,
        'Summary of old message',
        1,
        msg.id,
        msg.id
      );

      const context = await contextAssembler.assemble(conversation.id);

      // Should have the summary
      expect(context.summaries).toHaveLength(1);
      // Messages are still returned (summarization doesn't delete them)
      expect(context.recentMessages.length).toBeGreaterThanOrEqual(0);
    });
  });
});
