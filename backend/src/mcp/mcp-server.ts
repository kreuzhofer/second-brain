import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getPrismaClient } from '../lib/prisma';
import { UserService } from '../services/user.service';
import { STORE_MEMORY_TOOL_DEFINITION, handleStoreMemory } from './tools/store-memory';
import { RECALL_MEMORIES_TOOL_DEFINITION, handleRecallMemories } from './tools/recall-memories';
import { SEARCH_BRAIN_TOOL_DEFINITION, handleSearchBrain } from './tools/search-brain';
import { GET_ENTRY_TOOL_DEFINITION, handleGetEntry } from './tools/get-entry';
import { LIST_ENTRIES_TOOL_DEFINITION, handleListEntries } from './tools/list-entries';

const agentId = process.env.MCP_AGENT_ID || 'unknown';
const agentName = process.env.MCP_AGENT_NAME || 'Unknown Agent';

async function main(): Promise<void> {
  // Connect to database
  const prisma = getPrismaClient();
  await prisma.$connect();

  // Bootstrap default user (reuses the same logic as the main app)
  const userService = new UserService();
  await userService.ensureDefaultUser();

  const server = new Server(
    { name: 'justdo-brain', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      STORE_MEMORY_TOOL_DEFINITION,
      RECALL_MEMORIES_TOOL_DEFINITION,
      SEARCH_BRAIN_TOOL_DEFINITION,
      GET_ENTRY_TOOL_DEFINITION,
      LIST_ENTRIES_TOOL_DEFINITION,
    ]
  }));

  // Dispatch tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'store_memory': {
          const result = await handleStoreMemory(args as any, agentId, agentName);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'recall_memories': {
          const result = await handleRecallMemories(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'search_brain': {
          const result = await handleSearchBrain(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'get_entry': {
          const result = await handleGetEntry(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        case 'list_entries': {
          const result = await handleListEntries(args as any);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server failed to start:', error);
  process.exit(1);
});
