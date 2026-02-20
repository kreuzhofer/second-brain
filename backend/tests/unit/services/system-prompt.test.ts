/**
 * Unit Tests for System Prompt Builder
 * 
 * Tests the buildSystemPrompt function to ensure it correctly constructs
 * the system prompt with all required components.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { buildSystemPrompt, SYSTEM_PROMPT_TEMPLATE_FOR_TESTING } from '../../../src/services/system-prompt';

describe('System Prompt Builder', () => {
  describe('buildSystemPrompt', () => {
    it('should return prompt with role description', () => {
      const result = buildSystemPrompt('', '');
      
      expect(result).toContain('personal knowledge management assistant');
      expect(result).toContain('JustDo.so');
      expect(result).toContain('capture thoughts');
      expect(result).toContain('retrieve information');
      expect(result).toContain('stay organized');
    });

    it('should include all 10 tool names', () => {
      const result = buildSystemPrompt('', '');
      
      // All 10 MVP tools must be mentioned
      expect(result).toContain('classify_and_capture');
      expect(result).toContain('list_entries');
      expect(result).toContain('get_entry');
      expect(result).toContain('generate_digest');
      expect(result).toContain('update_entry');
      expect(result).toContain('move_entry');
      expect(result).toContain('search_entries');
      expect(result).toContain('delete_entry');
      expect(result).toContain('find_duplicates');
      expect(result).toContain('merge_entries');
    });

    it('should include index content', () => {
      const indexContent = `# Knowledge Base Index
      
## People
- people/john-doe - John Doe

## Projects
- projects/clientco-integration - ClientCo Integration`;

      const result = buildSystemPrompt(indexContent, '');
      
      expect(result).toContain('Knowledge Base Index');
      expect(result).toContain('people/john-doe');
      expect(result).toContain('projects/clientco-integration');
    });

    it('should include conversation history', () => {
      const conversationHistory = `User: What projects do I have?
Assistant: You have 3 active projects...
User: Tell me more about ClientCo`;

      const result = buildSystemPrompt('', conversationHistory);
      
      expect(result).toContain('What projects do I have?');
      expect(result).toContain('You have 3 active projects');
      expect(result).toContain('Tell me more about ClientCo');
    });

    it('should handle empty index content', () => {
      const result = buildSystemPrompt('', 'Some conversation');
      
      expect(result).toContain('(No entries in knowledge base yet)');
      expect(result).not.toContain('{indexContent}');
    });

    it('should handle empty conversation history', () => {
      const result = buildSystemPrompt('Some index content', '');
      
      expect(result).toContain('(No previous conversation)');
      expect(result).not.toContain('{conversationHistory}');
    });

    it('should handle whitespace-only index content', () => {
      const result = buildSystemPrompt('   \n\t  ', 'Some conversation');
      
      expect(result).toContain('(No entries in knowledge base yet)');
    });

    it('should handle whitespace-only conversation history', () => {
      const result = buildSystemPrompt('Some index', '   \n\t  ');
      
      expect(result).toContain('(No previous conversation)');
    });

    it('should include usage guidelines for each tool', () => {
      const result = buildSystemPrompt('', '');
      
      // Guidelines section should explain when to use each tool
      expect(result).toContain('Guidelines:');
      
      // classify_and_capture guidance (Requirement 6.5)
      expect(result).toContain('new thought, fact, or idea');
      expect(result).toContain('classify_and_capture');
      
      // Query tools guidance (Requirement 6.6)
      expect(result).toContain('list_entries');
      expect(result).toContain('search_entries');
      
      // move_entry guidance (Requirement 6.7)
      expect(result).toContain('correct a recent classification');
      expect(result).toContain('move_entry');
      
      // Conversational guidance (Requirement 6.8)
      expect(result).toContain('greetings');
      expect(result).toContain('respond conversationally without tools');
    });

    it('should include tool descriptions explaining when to use them', () => {
      const result = buildSystemPrompt('', '');
      
      // Each tool should have a description of when to use it
      expect(result).toContain('new information to remember');
      expect(result).toContain('see/show/list their entries');
      expect(result).toContain('asks about a specific entry');
      expect(result).toContain('daily digest or weekly review');
      expect(result).toContain('modify an existing entry');
      expect(result).toContain('reclassify an entry');
      expect(result).toContain('find entries by keyword');
    });

    it('should have Current knowledge base index section', () => {
      const result = buildSystemPrompt('test index', '');
      
      expect(result).toContain('Current knowledge base index:');
    });

    it('should have Recent conversation section', () => {
      const result = buildSystemPrompt('', 'test conversation');
      
      expect(result).toContain('Recent conversation:');
    });

    it('should replace both placeholders when both have content', () => {
      const indexContent = 'My index content here';
      const conversationHistory = 'My conversation history here';
      
      const result = buildSystemPrompt(indexContent, conversationHistory);
      
      expect(result).toContain(indexContent);
      expect(result).toContain(conversationHistory);
      expect(result).not.toContain('{indexContent}');
      expect(result).not.toContain('{conversationHistory}');
    });

    it('should include the current date for resolving relative dates', () => {
      const result = buildSystemPrompt('', '');
      expect(result).toMatch(/Today's date is \d{4}-\d{2}-\d{2}/);
    });

    it('should instruct search-before-mutate flow when path is missing', () => {
      const result = buildSystemPrompt('', '');
      expect(result).toContain('When updating, moving, or deleting and you only have a title/name');
      expect(result).toContain('first call search_entries');
      expect(result).toContain('then call update_entry, move_entry, or delete_entry');
    });
  });

  describe('SYSTEM_PROMPT_TEMPLATE_FOR_TESTING', () => {
    it('should contain placeholders for dynamic content', () => {
      expect(SYSTEM_PROMPT_TEMPLATE_FOR_TESTING).toContain('{indexContent}');
      expect(SYSTEM_PROMPT_TEMPLATE_FOR_TESTING).toContain('{conversationHistory}');
    });

    it('should contain role description', () => {
      expect(SYSTEM_PROMPT_TEMPLATE_FOR_TESTING).toContain('personal knowledge management assistant');
    });
  });
});
