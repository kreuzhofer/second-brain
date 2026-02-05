/**
 * Tool Registry for LLM Tool Routing
 * 
 * Defines OpenAI function calling schemas for all MVP tools and provides
 * methods to retrieve and validate tool definitions.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

// ============================================
// JSON Schema Types
// ============================================

/**
 * JSON Schema type definitions for tool parameters
 */
export interface JsonSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

// ============================================
// Tool Definition Types
// ============================================

/**
 * OpenAI function calling tool definition
 * Matches the OpenAI API tools parameter format
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, JsonSchema>;
      required: string[];
    };
  };
}

/**
 * Result of validating tool arguments against schema
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// ============================================
// Tool Registry Class
// ============================================

/**
 * Registry of all available tools for LLM function calling
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition>;

  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * Register the default MVP tools
   */
  private registerDefaultTools(): void {
    // classify_and_capture
    this.registerTool({
      type: 'function',
      function: {
        name: 'classify_and_capture',
        description: 'Classify a thought and create an entry in the knowledge base. Use when the user shares new information, facts, ideas, or tasks to remember. This tool analyzes the content and automatically determines the best category (people, projects, ideas, or admin).',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The thought or information to capture'
            },
            hints: {
              type: 'string',
              description: 'Optional category hint like [project] or [person:name] to guide classification'
            }
          },
          required: ['text']
        }
      }
    });

    // list_entries
    this.registerTool({
      type: 'function',
      function: {
        name: 'list_entries',
        description: 'List entries from the knowledge base with optional filters. Use when the user asks to see, show, or list their entries, people, projects, ideas, or tasks.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['people', 'projects', 'ideas', 'admin', 'inbox'],
              description: 'Filter by category'
            },
            status: {
              type: 'string',
              description: 'Filter by status (e.g., active, pending, done)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of entries to return',
              default: 10
            }
          },
          required: []
        }
      }
    });

    // get_entry
    this.registerTool({
      type: 'function',
      function: {
        name: 'get_entry',
        description: 'Get the full details of a specific entry. Use when the user asks about a specific person, project, idea, or task by name or path.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The entry path (e.g., projects/clientco-integration.md)'
            }
          },
          required: ['path']
        }
      }
    });

    // generate_digest
    this.registerTool({
      type: 'function',
      function: {
        name: 'generate_digest',
        description: 'Generate a daily digest or weekly review. Use when the user asks for their digest, summary, or review of recent activity.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['daily', 'weekly'],
              description: 'Type of digest to generate'
            }
          },
          required: ['type']
        }
      }
    });

    // update_entry
    this.registerTool({
      type: 'function',
      function: {
        name: 'update_entry',
        description: 'Update an existing entry. Use when you need to change metadata fields like status, due_date, or next_action. Use "updates" to change metadata fields like status, due_date, next_action. Use "body_content" only to add notes or log entries to the body. To mark a task done, use updates: {status: "done"}. To add a note, use body_content with mode "section".',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The entry path to update'
            },
            updates: {
              type: 'object',
              description: 'Metadata fields to update. For admin/projects: status ("pending", "done", "active", "waiting", "blocked"). Also: next_action, due_date, context, tags.',
              additionalProperties: true
            },
            body_content: {
              type: 'object',
              description: 'Add notes or log entries to the body (not for status changes)',
              properties: {
                content: {
                  type: 'string',
                  description: 'Content to add/replace'
                },
                mode: {
                  type: 'string',
                  enum: ['append', 'replace', 'section'],
                  description: 'How to apply the content'
                },
                section: {
                  type: 'string',
                  description: 'Section name for section mode (e.g., Notes, Log)'
                }
              },
              required: ['content', 'mode']
            }
          },
          required: ['path']
        }
      }
    });

    // move_entry
    this.registerTool({
      type: 'function',
      function: {
        name: 'move_entry',
        description: 'Move an entry to a different category. Use when the user wants to reclassify an entry (e.g., "actually that should be a project" or "move this to ideas").',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The current entry path'
            },
            targetCategory: {
              type: 'string',
              enum: ['people', 'projects', 'ideas', 'admin'],
              description: 'The category to move the entry to'
            }
          },
          required: ['path', 'targetCategory']
        }
      }
    });

    // search_entries
    this.registerTool({
      type: 'function',
      function: {
        name: 'search_entries',
        description: 'Search for entries by keyword or semantic query. Use when the user wants to find entries containing specific terms or asks questions like "do I have anything about X?"',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            category: {
              type: 'string',
              enum: ['people', 'projects', 'ideas', 'admin', 'inbox'],
              description: 'Optional category to limit search'
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return',
              default: 10
            }
          },
          required: ['query']
        }
      }
    });

    // delete_entry
    this.registerTool({
      type: 'function',
      function: {
        name: 'delete_entry',
        description: 'Delete an entry from the knowledge base. Use when the user explicitly asks to remove, delete, or get rid of an entry.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The entry path to delete (e.g., admin/grocery-shopping.md)'
            }
          },
          required: ['path']
        }
      }
    });

    // find_duplicates
    this.registerTool({
      type: 'function',
      function: {
        name: 'find_duplicates',
        description: 'Find likely duplicate entries. Use when the user asks if something already exists or wants to check for duplicates before creating a new entry.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Optional name/title to compare'
            },
            text: {
              type: 'string',
              description: 'Optional text to compare (e.g., the thought content)'
            },
            category: {
              type: 'string',
              enum: ['people', 'projects', 'ideas', 'admin', 'inbox'],
              description: 'Optional category to limit search'
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return',
              default: 5
            },
            excludePath: {
              type: 'string',
              description: 'Optional path to exclude from duplicate results'
            }
          },
          required: []
        }
      }
    });

    // merge_entries
    this.registerTool({
      type: 'function',
      function: {
        name: 'merge_entries',
        description: 'Merge multiple entries into a target entry. Use when the user wants to combine duplicates or consolidate notes.',
        parameters: {
          type: 'object',
          properties: {
            targetPath: {
              type: 'string',
              description: 'The target entry path to keep'
            },
            sourcePaths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths of entries to merge into the target'
            }
          },
          required: ['targetPath', 'sourcePaths']
        }
      }
    });
  }

  /**
   * Register a tool definition
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.function.name, tool);
  }

  /**
   * Get all tool definitions for OpenAI API
   * Requirement 1.3: Export all tool schemas as an array suitable for the OpenAI chat completions API tools parameter
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool definition by name
   * Requirement 1.2: Return a valid OpenAI function calling schema with name, description, and parameters
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Validate tool arguments against schema
   * Requirement 1.4: Use JSON Schema format with required and optional fields clearly specified
   * 
   * Simple validation implementation that checks:
   * - Required fields are present
   * - Field types match schema
   * - Enum values are valid
   */
  validateArguments(toolName: string, args: unknown): ValidationResult {
    const tool = this.getTool(toolName);
    
    if (!tool) {
      return {
        valid: false,
        errors: [`Unknown tool: ${toolName}`]
      };
    }

    const errors: string[] = [];
    const schema = tool.function.parameters;
    
    // Check if args is an object
    if (typeof args !== 'object' || args === null) {
      return {
        valid: false,
        errors: ['Arguments must be an object']
      };
    }

    const argsObj = args as Record<string, unknown>;

    // Check required fields
    for (const requiredField of schema.required) {
      if (!(requiredField in argsObj) || argsObj[requiredField] === undefined) {
        errors.push(`Missing required field: ${requiredField}`);
      }
    }

    // Validate each provided field
    for (const [fieldName, fieldValue] of Object.entries(argsObj)) {
      const fieldSchema = schema.properties[fieldName];
      
      if (!fieldSchema) {
        // Unknown field - skip validation (allow additional properties)
        continue;
      }

      const fieldErrors = this.validateField(fieldName, fieldValue, fieldSchema);
      errors.push(...fieldErrors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Validate a single field against its schema
   */
  private validateField(fieldName: string, value: unknown, schema: JsonSchema): string[] {
    const errors: string[] = [];

    // Skip validation for null/undefined (handled by required check)
    if (value === null || value === undefined) {
      return errors;
    }

    // Type validation
    const actualType = this.getJsonType(value);
    if (actualType !== schema.type) {
      errors.push(`Field '${fieldName}' must be of type ${schema.type}, got ${actualType}`);
      return errors; // Skip further validation if type is wrong
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value as string)) {
      errors.push(`Field '${fieldName}' must be one of: ${schema.enum.join(', ')}`);
    }

    // Nested object validation
    if (schema.type === 'object' && schema.properties && typeof value === 'object') {
      const nestedObj = value as Record<string, unknown>;
      
      // Check nested required fields
      if (schema.required) {
        for (const requiredField of schema.required) {
          if (!(requiredField in nestedObj)) {
            errors.push(`Field '${fieldName}.${requiredField}' is required`);
          }
        }
      }

      // Validate nested properties
      for (const [nestedName, nestedValue] of Object.entries(nestedObj)) {
        const nestedSchema = schema.properties[nestedName];
        if (nestedSchema) {
          const nestedErrors = this.validateField(`${fieldName}.${nestedName}`, nestedValue, nestedSchema);
          errors.push(...nestedErrors);
        }
      }
    }

    // Array validation
    if (schema.type === 'array' && schema.items && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const itemErrors = this.validateField(`${fieldName}[${i}]`, value[i], schema.items);
        errors.push(...itemErrors);
      }
    }

    return errors;
  }

  /**
   * Get the JSON Schema type of a value
   */
  private getJsonType(value: unknown): string {
    if (Array.isArray(value)) {
      return 'array';
    }
    if (value === null) {
      return 'null';
    }
    return typeof value;
  }
}

// ============================================
// Singleton Instance
// ============================================

let toolRegistryInstance: ToolRegistry | null = null;

/**
 * Get the singleton ToolRegistry instance
 */
export function getToolRegistry(): ToolRegistry {
  if (!toolRegistryInstance) {
    toolRegistryInstance = new ToolRegistry();
  }
  return toolRegistryInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetToolRegistry(): void {
  toolRegistryInstance = null;
}
