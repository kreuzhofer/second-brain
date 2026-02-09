import {
  ToolRegistry,
  ToolDefinition,
  ValidationResult,
  getToolRegistry,
  resetToolRegistry
} from '../../../src/services/tool-registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    resetToolRegistry();
    registry = new ToolRegistry();
  });

  describe('getAllTools', () => {
    it('should return all 10 registered tools', () => {
      const tools = registry.getAllTools();
      expect(tools.length).toBe(10);
    });

    it('should return tools with correct names', () => {
      const tools = registry.getAllTools();
      const toolNames = tools.map(t => t.function.name);
      
      expect(toolNames).toContain('classify_and_capture');
      expect(toolNames).toContain('list_entries');
      expect(toolNames).toContain('get_entry');
      expect(toolNames).toContain('generate_digest');
      expect(toolNames).toContain('update_entry');
      expect(toolNames).toContain('move_entry');
      expect(toolNames).toContain('search_entries');
      expect(toolNames).toContain('delete_entry');
      expect(toolNames).toContain('find_duplicates');
      expect(toolNames).toContain('merge_entries');
    });

    it('should return tools in OpenAI function calling format', () => {
      const tools = registry.getAllTools();
      
      for (const tool of tools) {
        expect(tool.type).toBe('function');
        expect(tool.function).toBeDefined();
        expect(tool.function.name).toBeDefined();
        expect(tool.function.description).toBeDefined();
        expect(tool.function.parameters).toBeDefined();
        expect(tool.function.parameters.type).toBe('object');
        expect(tool.function.parameters.properties).toBeDefined();
        expect(Array.isArray(tool.function.parameters.required)).toBe(true);
      }
    });

    it('should have descriptions with at least 20 characters', () => {
      const tools = registry.getAllTools();
      
      for (const tool of tools) {
        expect(tool.function.description.length).toBeGreaterThanOrEqual(20);
      }
    });
  });

  describe('getTool', () => {
    it('should return a specific tool by name', () => {
      const tool = registry.getTool('classify_and_capture');
      
      expect(tool).toBeDefined();
      expect(tool?.function.name).toBe('classify_and_capture');
    });

    it('should return undefined for unknown tool', () => {
      const tool = registry.getTool('unknown_tool');
      expect(tool).toBeUndefined();
    });

    it('should return tool with correct schema for classify_and_capture', () => {
      const tool = registry.getTool('classify_and_capture');
      
      expect(tool?.function.parameters.properties.text).toBeDefined();
      expect(tool?.function.parameters.properties.hints).toBeDefined();
      expect(tool?.function.parameters.required).toContain('text');
    });

    it('should return tool with correct schema for list_entries', () => {
      const tool = registry.getTool('list_entries');
      
      expect(tool?.function.parameters.properties.category).toBeDefined();
      expect(tool?.function.parameters.properties.status).toBeDefined();
      expect(tool?.function.parameters.properties.limit).toBeDefined();
      expect(tool?.function.parameters.required).toEqual([]);
    });

    it('should return tool with correct schema for get_entry', () => {
      const tool = registry.getTool('get_entry');
      
      expect(tool?.function.parameters.properties.path).toBeDefined();
      expect(tool?.function.parameters.required).toContain('path');
    });

    it('should return tool with correct schema for generate_digest', () => {
      const tool = registry.getTool('generate_digest');
      
      expect(tool?.function.parameters.properties.type).toBeDefined();
      expect(tool?.function.parameters.properties.type.enum).toEqual(['daily', 'weekly']);
      expect(tool?.function.parameters.required).toContain('type');
    });

    it('should return tool with correct schema for update_entry', () => {
      const tool = registry.getTool('update_entry');
      
      expect(tool?.function.parameters.properties.path).toBeDefined();
      expect(tool?.function.parameters.properties.updates).toBeDefined();
      expect(tool?.function.parameters.properties.body_content).toBeDefined();
      expect(tool?.function.parameters.required).toContain('path');
      // updates is no longer required since body_content can be used alone
      expect(tool?.function.parameters.required).not.toContain('updates');
    });

    it('should return tool with correct body_content schema for update_entry', () => {
      const tool = registry.getTool('update_entry');
      const bodyContent = tool?.function.parameters.properties.body_content;
      
      expect(bodyContent).toBeDefined();
      expect(bodyContent?.type).toBe('object');
      expect(bodyContent?.properties?.content).toBeDefined();
      expect(bodyContent?.properties?.content?.type).toBe('string');
      expect(bodyContent?.properties?.mode).toBeDefined();
      expect(bodyContent?.properties?.mode?.type).toBe('string');
      expect(bodyContent?.properties?.mode?.enum).toEqual(['append', 'replace', 'section']);
      expect(bodyContent?.properties?.section).toBeDefined();
      expect(bodyContent?.properties?.section?.type).toBe('string');
      expect(bodyContent?.required).toEqual(['content', 'mode']);
    });

    it('should return tool with correct schema for move_entry', () => {
      const tool = registry.getTool('move_entry');
      
      expect(tool?.function.parameters.properties.path).toBeDefined();
      expect(tool?.function.parameters.properties.targetCategory).toBeDefined();
      expect(tool?.function.parameters.properties.targetCategory.enum).toEqual(['people', 'projects', 'ideas', 'admin']);
      expect(tool?.function.parameters.required).toContain('path');
      expect(tool?.function.parameters.required).toContain('targetCategory');
    });

    it('should return tool with correct schema for search_entries', () => {
      const tool = registry.getTool('search_entries');
      
      expect(tool?.function.parameters.properties.query).toBeDefined();
      expect(tool?.function.parameters.properties.category).toBeDefined();
      expect(tool?.function.parameters.properties.limit).toBeDefined();
      expect(tool?.function.parameters.required).toContain('query');
    });

    it('should return tool with correct schema for find_duplicates', () => {
      const tool = registry.getTool('find_duplicates');

      expect(tool?.function.parameters.properties.name).toBeDefined();
      expect(tool?.function.parameters.properties.text).toBeDefined();
      expect(tool?.function.parameters.properties.category).toBeDefined();
    });

    it('should return tool with correct schema for merge_entries', () => {
      const tool = registry.getTool('merge_entries');

      expect(tool?.function.parameters.properties.targetPath).toBeDefined();
      expect(tool?.function.parameters.properties.sourcePaths).toBeDefined();
      expect(tool?.function.parameters.required).toContain('targetPath');
      expect(tool?.function.parameters.required).toContain('sourcePaths');
    });

  });

  describe('validateArguments', () => {
    describe('unknown tool', () => {
      it('should return invalid for unknown tool', () => {
        const result = registry.validateArguments('unknown_tool', {});
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Unknown tool: unknown_tool');
      });
    });

    describe('non-object arguments', () => {
      it('should return invalid for null arguments', () => {
        const result = registry.validateArguments('classify_and_capture', null);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Arguments must be an object');
      });

      it('should return invalid for string arguments', () => {
        const result = registry.validateArguments('classify_and_capture', 'invalid');
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Arguments must be an object');
      });
    });

    describe('required fields', () => {
      it('should return invalid when required field is missing', () => {
        const result = registry.validateArguments('classify_and_capture', {});
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: text');
      });

      it('should return valid when all required fields are present', () => {
        const result = registry.validateArguments('classify_and_capture', {
          text: 'Test thought'
        });
        
        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
      });

      it('should return valid when no fields are required', () => {
        const result = registry.validateArguments('list_entries', {});
        
        expect(result.valid).toBe(true);
      });
    });

    describe('type validation', () => {
      it('should return invalid for wrong type', () => {
        const result = registry.validateArguments('classify_and_capture', {
          text: 123 // should be string
        });
        
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toContain("Field 'text' must be of type string");
      });

      it('should return invalid for wrong number type', () => {
        const result = registry.validateArguments('list_entries', {
          limit: 'ten' // should be number
        });
        
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toContain("Field 'limit' must be of type number");
      });
    });

    describe('enum validation', () => {
      it('should return valid for valid enum value', () => {
        const result = registry.validateArguments('generate_digest', {
          type: 'daily'
        });
        
        expect(result.valid).toBe(true);
      });

      it('should return invalid for invalid enum value', () => {
        const result = registry.validateArguments('generate_digest', {
          type: 'monthly'
        });
        
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toContain("Field 'type' must be one of: daily, weekly");
      });

      it('should validate category enum', () => {
        const result = registry.validateArguments('list_entries', {
          category: 'invalid_category'
        });
        
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toContain("Field 'category' must be one of:");
      });

      it('should accept valid category enum', () => {
        const result = registry.validateArguments('list_entries', {
          category: 'projects'
        });
        
        expect(result.valid).toBe(true);
      });
    });

    describe('optional fields', () => {
      it('should allow optional fields to be omitted', () => {
        const result = registry.validateArguments('classify_and_capture', {
          text: 'Test thought'
          // hints is optional
        });
        
        expect(result.valid).toBe(true);
      });

      it('should validate optional fields when provided', () => {
        const result = registry.validateArguments('classify_and_capture', {
          text: 'Test thought',
          hints: '[project]'
        });
        
        expect(result.valid).toBe(true);
      });
    });

    describe('complex validations', () => {
      it('should validate update_entry with nested object', () => {
        const result = registry.validateArguments('update_entry', {
          path: 'projects/test',
          updates: {
            status: 'active',
            next_action: 'Do something'
          }
        });
        
        expect(result.valid).toBe(true);
      });

      it('should validate update_entry with only path (no updates or body_content)', () => {
        const result = registry.validateArguments('update_entry', {
          path: 'projects/test'
        });
        
        expect(result.valid).toBe(true);
      });

      it('should validate update_entry with body_content', () => {
        const result = registry.validateArguments('update_entry', {
          path: 'projects/test',
          body_content: {
            content: 'New note content',
            mode: 'append'
          }
        });
        
        expect(result.valid).toBe(true);
      });

      it('should validate update_entry with body_content section mode', () => {
        const result = registry.validateArguments('update_entry', {
          path: 'projects/test',
          body_content: {
            content: 'Log entry',
            mode: 'section',
            section: 'Log'
          }
        });
        
        expect(result.valid).toBe(true);
      });

      it('should reject update_entry with invalid body_content mode', () => {
        const result = registry.validateArguments('update_entry', {
          path: 'projects/test',
          body_content: {
            content: 'Some content',
            mode: 'invalid_mode'
          }
        });
        
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toContain("must be one of: append, replace, section");
      });

      it('should validate search_entries with all parameters', () => {
        const result = registry.validateArguments('search_entries', {
          query: 'test search',
          category: 'projects',
          limit: 5
        });
        
        expect(result.valid).toBe(true);
      });

      it('should validate move_entry with valid target category', () => {
        const result = registry.validateArguments('move_entry', {
          path: 'inbox/test',
          targetCategory: 'projects'
        });
        
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('registerTool', () => {
    it('should allow registering custom tools', () => {
      const customTool: ToolDefinition = {
        type: 'function',
        function: {
          name: 'custom_tool',
          description: 'A custom tool for testing purposes',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Input value' }
            },
            required: ['input']
          }
        }
      };

      registry.registerTool(customTool);
      
      const retrieved = registry.getTool('custom_tool');
      expect(retrieved).toEqual(customTool);
      expect(registry.getAllTools().length).toBe(11);
    });
  });

  describe('delete_entry tool', () => {
    it('should return tool with correct schema for delete_entry', () => {
      const tool = registry.getTool('delete_entry');
      
      expect(tool).toBeDefined();
      expect(tool?.function.name).toBe('delete_entry');
      expect(tool?.function.description).toContain('Delete an entry');
      expect(tool?.function.parameters.properties.path).toBeDefined();
      expect(tool?.function.parameters.properties.path.type).toBe('string');
      expect(tool?.function.parameters.required).toContain('path');
    });

    it('should validate delete_entry arguments correctly', () => {
      const validResult = registry.validateArguments('delete_entry', {
        path: 'admin/grocery-shopping'
      });
      expect(validResult.valid).toBe(true);

      const missingPathResult = registry.validateArguments('delete_entry', {});
      expect(missingPathResult.valid).toBe(false);
      expect(missingPathResult.errors).toContain('Missing required field: path');

      const wrongTypeResult = registry.validateArguments('delete_entry', {
        path: 123
      });
      expect(wrongTypeResult.valid).toBe(false);
    });
  });

  describe('getToolRegistry singleton', () => {
    it('should return the same instance', () => {
      resetToolRegistry();
      const instance1 = getToolRegistry();
      const instance2 = getToolRegistry();
      
      expect(instance1).toBe(instance2);
    });

    it('should return fresh instance after reset', () => {
      const instance1 = getToolRegistry();
      resetToolRegistry();
      const instance2 = getToolRegistry();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});
