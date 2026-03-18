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

  const instructions = `You are connected to JustDo.so — the user's personal knowledge management system.

JustDo.so stores structured entries organized by category:
- people: Contacts and relationships (fields: context, follow-ups, related projects)
- projects: Multi-step efforts with goals and timelines (fields: status, next action, related people, due date)
- ideas: Concepts and insights not yet committed to (fields: one-liner, related projects)
- tasks: Single actionable items (fields: status, due date, duration, priority)
- memories: Knowledge stored by AI agents like you (fields: memory type, confidence, expiration)

Use store_memory to save important information about the user that should persist across conversations. Use search and list tools to find existing knowledge before creating duplicates. Use get_entry to read full details of a specific entry.

When storing memories, choose the right memory_type:
- fact: Personal details, background, skills, opinions
- preference: How the user likes things done
- context: Project details, work situations, ongoing topics
- feedback: Corrections or preferences about your behavior
- relationship: People and connections between them`;

  const server = new Server(
    { name: 'justdoso', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions }
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
    const start = Date.now();

    try {
      let result: unknown;
      switch (name) {
        case 'store_memory':
          result = await handleStoreMemory(args as any, agentId, agentName);
          break;
        case 'recall_memories':
          result = await handleRecallMemories(args as any);
          break;
        case 'search_brain':
          result = await handleSearchBrain(args as any);
          break;
        case 'get_entry':
          result = await handleGetEntry(args as any);
          break;
        case 'list_entries':
          result = await handleListEntries(args as any);
          break;
        default:
          console.error(`[MCP] tool=${name} agent=${agentName} error="Unknown tool" ${Date.now() - start}ms`);
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
      console.error(`[MCP] tool=${name} agent=${agentName} status=ok ${Date.now() - start}ms`);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error: any) {
      console.error(`[MCP] tool=${name} agent=${agentName} status=error ${Date.now() - start}ms`, error.message, error.stack);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
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
