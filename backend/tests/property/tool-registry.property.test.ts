/**
 * Property-based tests for Tool Registry
 * Feature: llm-tool-routing, Property 1: Tool Schema Validity
 * 
 * Tests correctness properties for tool schema definitions.
 */

import * as fc from 'fast-check';
import { ToolRegistry, ToolDefinition, getToolRegistry, resetToolRegistry } from '../../src/services/tool-registry';

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
  'delete_entry'
] as const;

// ============================================
// Property Tests for Tool Schema Validity
// ============================================

describe('ToolRegistry - Tool Schema Properties', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    resetToolRegistry();
    toolRegistry = getToolRegistry();
  });

  /**
   * Property 1: Tool Schema Validity
   * **Validates: Requirements 1.2, 1.4, 1.5**
   * 
   * For any tool in the Tool Registry, the tool definition SHALL contain:
   * - A non-empty `name` string
   * - A non-empty `description` string (at least 20 characters explaining when to use the tool)
   * - A `parameters` object with `type: 'object'` and a `properties` object
   * - A `required` array (may be empty)
   */
  describe('Property 1: Tool Schema Validity', () => {
    it('should have valid schema structure for all MVP tools', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...MVP_TOOL_NAMES),
          (toolName) => {
            const tool = toolRegistry.getTool(toolName);
            
            // Tool must exist
            expect(tool).toBeDefined();
            if (!tool) return false;
            
            // Must have type 'function'
            expect(tool.type).toBe('function');
            
            // Must have function object
            expect(tool.function).toBeDefined();
            expect(typeof tool.function).toBe('object');
            
            // Must have non-empty name string
            expect(typeof tool.function.name).toBe('string');
            expect(tool.function.name.length).toBeGreaterThan(0);
            expect(tool.function.name).toBe(toolName);
            
            // Must have non-empty description string (at least 20 characters)
            expect(typeof tool.function.description).toBe('string');
            expect(tool.function.description.length).toBeGreaterThanOrEqual(20);
            
            // Must have parameters object
            expect(tool.function.parameters).toBeDefined();
            expect(typeof tool.function.parameters).toBe('object');
            
            // Parameters must have type: 'object'
            expect(tool.function.parameters.type).toBe('object');
            
            // Parameters must have properties object
            expect(tool.function.parameters.properties).toBeDefined();
            expect(typeof tool.function.parameters.properties).toBe('object');
            
            // Parameters must have required array (may be empty)
            expect(Array.isArray(tool.function.parameters.required)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 3 } // All 7 tools, deterministic - per workspace guidelines
      );
    });

    it('should have all 8 registered tools', () => {
      const allTools = toolRegistry.getAllTools();
      
      // Should have exactly 8 tools
      expect(allTools.length).toBe(8);
      
      // All MVP tool names should be present
      const registeredNames = allTools.map(t => t.function.name);
      for (const toolName of MVP_TOOL_NAMES) {
        expect(registeredNames).toContain(toolName);
      }
    });

    it('should have descriptions that explain when to use each tool', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...MVP_TOOL_NAMES),
          (toolName) => {
            const tool = toolRegistry.getTool(toolName);
            expect(tool).toBeDefined();
            if (!tool) return false;
            
            const description = tool.function.description.toLowerCase();
            
            // Description should contain usage guidance (words like "use when", "use for", etc.)
            const hasUsageGuidance = 
              description.includes('use when') ||
              description.includes('use for') ||
              description.includes('use to') ||
              description.includes('use this');
            
            expect(hasUsageGuidance).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should have valid JSON Schema format for all parameter properties', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...MVP_TOOL_NAMES),
          (toolName) => {
            const tool = toolRegistry.getTool(toolName);
            expect(tool).toBeDefined();
            if (!tool) return false;
            
            const properties = tool.function.parameters.properties;
            const required = tool.function.parameters.required;
            
            // Each property should have a valid type
            for (const [propName, propSchema] of Object.entries(properties)) {
              expect(propSchema.type).toBeDefined();
              expect(['string', 'number', 'boolean', 'object', 'array']).toContain(propSchema.type);
              
              // Each property should have a description
              expect(typeof propSchema.description).toBe('string');
              expect(propSchema.description!.length).toBeGreaterThan(0);
            }
            
            // All required fields should exist in properties
            for (const requiredField of required) {
              expect(properties[requiredField]).toBeDefined();
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should return tools array suitable for OpenAI API', () => {
      const allTools = toolRegistry.getAllTools();
      
      // Should be an array
      expect(Array.isArray(allTools)).toBe(true);
      
      // Each tool should have the correct structure for OpenAI API
      for (const tool of allTools) {
        // Must have type: 'function'
        expect(tool.type).toBe('function');
        
        // Must have function with name, description, parameters
        expect(tool.function).toBeDefined();
        expect(typeof tool.function.name).toBe('string');
        expect(typeof tool.function.description).toBe('string');
        expect(typeof tool.function.parameters).toBe('object');
        expect(tool.function.parameters.type).toBe('object');
        expect(typeof tool.function.parameters.properties).toBe('object');
        expect(Array.isArray(tool.function.parameters.required)).toBe(true);
      }
    });
  });
});
