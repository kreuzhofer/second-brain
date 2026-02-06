/**
 * Property-based tests for System Prompt Builder
 * Feature: llm-tool-routing, Property 7: System Prompt Completeness
 * 
 * Tests correctness properties for system prompt construction.
 */

import * as fc from 'fast-check';
import { buildSystemPrompt } from '../../src/services/system-prompt';

// ============================================
// Constants
// ============================================

const MVP_TOOL_NAMES = [
  'classify_and_capture',
  'list_entries',
  'get_entry',
  'generate_digest',
  'update_entry',
  'move_entry',
  'search_entries',
  'delete_entry',
  'find_duplicates',
  'merge_entries'
] as const;

// ============================================
// Arbitraries for Test Data Generation
// ============================================

/**
 * Generate random index content strings
 * Simulates various states of the knowledge base index
 */
const indexContentArbitrary = fc.oneof(
  // Empty content
  fc.constant(''),
  // Whitespace only
  fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 10 }),
  // Simple index content
  fc.string({ minLength: 1, maxLength: 200 }),
  // Realistic index content with entries
  fc.array(
    fc.record({
      category: fc.constantFrom('people', 'projects', 'ideas', 'admin', 'inbox'),
      name: fc.string({ minLength: 1, maxLength: 50 })
    }),
    { minLength: 1, maxLength: 10 }
  ).map(entries => 
    entries.map(e => `- ${e.category}/${e.name}`).join('\n')
  )
);

/**
 * Generate random conversation history strings
 * Simulates various states of conversation history
 */
const conversationHistoryArbitrary = fc.oneof(
  // Empty history
  fc.constant(''),
  // Whitespace only
  fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 10 }),
  // Simple history
  fc.string({ minLength: 1, maxLength: 200 }),
  // Realistic conversation history
  fc.array(
    fc.record({
      role: fc.constantFrom('user', 'assistant'),
      content: fc.string({ minLength: 1, maxLength: 100 })
    }),
    { minLength: 1, maxLength: 5 }
  ).map(messages =>
    messages.map(m => `${m.role}: ${m.content}`).join('\n')
  )
);

// ============================================
// Property Tests for System Prompt Completeness
// ============================================

describe('SystemPrompt - System Prompt Completeness Properties', () => {
  /**
   * Property 7: System Prompt Completeness
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**
   * 
   * For any assembled system prompt, the prompt SHALL contain:
   * - A role description mentioning "knowledge management assistant"
   * - References to all 10 tool names
   * - Guidelines for when to use each tool type
   * - The current index.md content (or placeholder if empty)
   * - Conversation history section
   */
  describe('Property 7: System Prompt Completeness', () => {
    it('should contain role description mentioning knowledge management assistant', () => {
      fc.assert(
        fc.property(
          indexContentArbitrary,
          conversationHistoryArbitrary,
          (indexContent, conversationHistory) => {
            const prompt = buildSystemPrompt(indexContent, conversationHistory);
            
            // Should contain role description
            const promptLower = prompt.toLowerCase();
            expect(promptLower).toContain('knowledge management assistant');
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should contain references to all 10 tool names', () => {
      fc.assert(
        fc.property(
          indexContentArbitrary,
          conversationHistoryArbitrary,
          (indexContent, conversationHistory) => {
            const prompt = buildSystemPrompt(indexContent, conversationHistory);
            
            // Should contain all 10 MVP tool names
            for (const toolName of MVP_TOOL_NAMES) {
              expect(prompt).toContain(toolName);
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should contain guidelines for when to use each tool type', () => {
      fc.assert(
        fc.property(
          indexContentArbitrary,
          conversationHistoryArbitrary,
          (indexContent, conversationHistory) => {
            const prompt = buildSystemPrompt(indexContent, conversationHistory);
            const promptLower = prompt.toLowerCase();
            
            // Should have guidelines section
            expect(promptLower).toContain('guidelines');
            
            // Should have guidance for classify_and_capture (Requirement 6.5)
            expect(promptLower).toMatch(/classify_and_capture.*use when|use.*classify_and_capture/i);
            
            // Should have guidance for query tools (Requirement 6.6)
            expect(promptLower).toMatch(/list_entries.*use when|use.*list_entries/i);
            expect(promptLower).toMatch(/get_entry.*use when|use.*get_entry/i);
            expect(promptLower).toMatch(/search_entries.*use when|use.*search_entries/i);
            
            // Should have guidance for move_entry (Requirement 6.7)
            expect(promptLower).toMatch(/move_entry.*use when|use.*move_entry/i);
            
            // Should have guidance for conversational responses (Requirement 6.8)
            expect(promptLower).toMatch(/chatting|greetings|conversational/i);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should contain index content or placeholder if empty', () => {
      fc.assert(
        fc.property(
          indexContentArbitrary,
          conversationHistoryArbitrary,
          (indexContent, conversationHistory) => {
            const prompt = buildSystemPrompt(indexContent, conversationHistory);
            
            // Should have index section header
            expect(prompt.toLowerCase()).toContain('knowledge base index');
            
            // Should contain the index content or a placeholder
            const trimmedIndex = indexContent.trim();
            if (trimmedIndex) {
              // If index content is provided, it should be in the prompt
              expect(prompt).toContain(trimmedIndex);
            } else {
              // If index content is empty, should have a placeholder
              expect(prompt.toLowerCase()).toMatch(/no entries|empty|placeholder|\(no/i);
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should contain conversation history section', () => {
      fc.assert(
        fc.property(
          indexContentArbitrary,
          conversationHistoryArbitrary,
          (indexContent, conversationHistory) => {
            const prompt = buildSystemPrompt(indexContent, conversationHistory);
            
            // Should have conversation history section header
            expect(prompt.toLowerCase()).toContain('conversation');
            
            // Should contain the conversation history or a placeholder
            const trimmedHistory = conversationHistory.trim();
            if (trimmedHistory) {
              // If conversation history is provided, it should be in the prompt
              expect(prompt).toContain(trimmedHistory);
            } else {
              // If conversation history is empty, should have a placeholder
              expect(prompt.toLowerCase()).toMatch(/no previous|empty|placeholder|\(no/i);
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should satisfy all completeness requirements for any input combination', () => {
      fc.assert(
        fc.property(
          indexContentArbitrary,
          conversationHistoryArbitrary,
          (indexContent, conversationHistory) => {
            const prompt = buildSystemPrompt(indexContent, conversationHistory);
            const promptLower = prompt.toLowerCase();
            
            // Requirement 6.1: Role description, available tools, and usage guidelines
            expect(promptLower).toContain('knowledge management assistant');
            expect(promptLower).toContain('you have access to these tools');
            expect(promptLower).toContain('guidelines');
            
            // Requirement 6.2: Current index.md content
            expect(promptLower).toContain('knowledge base index');
            
            // Requirement 6.3: Conversation history
            expect(promptLower).toContain('conversation');
            
            // Requirement 6.4: Clear guidance on when to use each tool
            for (const toolName of MVP_TOOL_NAMES) {
              expect(prompt).toContain(toolName);
            }
            
            // Requirement 6.5: Instruct to use classify_and_capture for new information
            expect(promptLower).toMatch(/classify_and_capture.*new information|shares.*classify_and_capture/i);
            
            // Requirement 6.6: Instruct to use query tools for existing entries
            expect(promptLower).toMatch(/list_entries.*entries|get_entry.*entry|search_entries.*find/i);
            
            // Requirement 6.7: Instruct to use move_entry for reclassification
            expect(promptLower).toMatch(/move_entry.*reclassify|move_entry.*classification/i);
            
            // Requirement 6.8: Instruct to respond conversationally for greetings/chat
            expect(promptLower).toMatch(/chatting|greetings|conversational/i);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});
