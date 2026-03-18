import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
// eslint-disable-next-line deprecation/deprecation
import { Server } from '@modelcontextprotocol/sdk/server/index.js'; // Using low-level Server for raw JSON schema tool definitions
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getOAuthProvider } from '../services/oauth.provider';
import { setDefaultUserId } from '../context/user-context';
import { STORE_MEMORY_TOOL_DEFINITION, handleStoreMemory } from '../mcp/tools/store-memory';
import { RECALL_MEMORIES_TOOL_DEFINITION, handleRecallMemories } from '../mcp/tools/recall-memories';
import { SEARCH_BRAIN_TOOL_DEFINITION, handleSearchBrain } from '../mcp/tools/search-brain';
import { GET_ENTRY_TOOL_DEFINITION, handleGetEntry } from '../mcp/tools/get-entry';
import { LIST_ENTRIES_TOOL_DEFINITION, handleListEntries } from '../mcp/tools/list-entries';

export const mcpRouter = Router();

// Store active transports by session ID
const transports = new Map<string, { transport: StreamableHTTPServerTransport; agentId: string; agentName: string; userId: string }>();

const MCP_SERVER_INSTRUCTIONS = `You are connected to JustDo.so — the user's personal knowledge management system.

JustDo.so stores structured entries organized by category:
- **people**: Contacts and relationships (fields: context, follow-ups, related projects)
- **projects**: Multi-step efforts with goals and timelines (fields: status, next action, related people, due date)
- **ideas**: Concepts and insights not yet committed to (fields: one-liner, related projects)
- **tasks**: Single actionable items (fields: status, due date, duration, priority)
- **memories**: Knowledge stored by AI agents like you (fields: memory type, confidence, expiration)

Use store_memory to save important information about the user that should persist across conversations. Use search and list tools to find existing knowledge before creating duplicates. Use get_entry to read full details of a specific entry.

When storing memories, choose the right memory_type:
- fact: Personal details, background, skills, opinions
- preference: How the user likes things done
- context: Project details, work situations, ongoing topics
- feedback: Corrections or preferences about your behavior
- relationship: People and connections between them`;

function createMcpServer(agentId: string, agentName: string, userId: string): Server {
  const server = new Server(
    { name: 'justdoso', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: MCP_SERVER_INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      STORE_MEMORY_TOOL_DEFINITION,
      RECALL_MEMORIES_TOOL_DEFINITION,
      SEARCH_BRAIN_TOOL_DEFINITION,
      GET_ENTRY_TOOL_DEFINITION,
      LIST_ENTRIES_TOOL_DEFINITION,
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const start = Date.now();

    // Set user context for this request
    setDefaultUserId(userId);

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
          console.log(`[MCP] tool=${name} agent=${agentName} error="Unknown tool" ${Date.now() - start}ms`);
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
      console.log(`[MCP] tool=${name} agent=${agentName} status=ok ${Date.now() - start}ms`);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error: any) {
      console.error(`[MCP] tool=${name} agent=${agentName} status=error ${Date.now() - start}ms`, error.message, error.stack);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  });

  return server;
}

async function authenticateRequest(req: Request): Promise<{ userId: string; agentId: string; agentName: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const authInfo = await getOAuthProvider().verifyAccessToken(token);
    const extra = authInfo.extra as { userId: string; agentId: string; agentName: string } | undefined;
    if (extra?.userId) return extra;
  } catch {
    // Token verification failed
  }
  return null;
}

// POST /mcp — client sends JSON-RPC requests
mcpRouter.post('/', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth) {
    res.status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${req.protocol}://${req.get('host')}/.well-known/oauth-protected-resource/mcp"`)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Valid access token required. Connect via OAuth or use an API key.' } });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  console.log(`[MCP-AUTH] POST /mcp sessionId=${sessionId || '(none)'} known=${sessionId ? transports.has(sessionId) : '-'} total_sessions=${transports.size}`);

  if (sessionId && transports.has(sessionId)) {
    // Existing session
    const session = transports.get(sessionId)!;
    setDefaultUserId(session.userId);
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  // New session — create transport + server
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      console.log(`[MCP-AUTH] session initialized: ${sessionId}`);
      transports.set(sessionId, { transport, agentId: auth.agentId, agentName: auth.agentName, userId: auth.userId });
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      console.log(`[MCP-AUTH] session closed: ${sid}`);
      transports.delete(sid);
    }
  };

  const server = createMcpServer(auth.agentId, auth.agentName, auth.userId);
  await server.connect(transport);

  setDefaultUserId(auth.userId);
  await transport.handleRequest(req, res, req.body);
});

// GET /mcp — SSE stream for server-initiated messages
mcpRouter.get('/', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth) {
    res.status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${req.protocol}://${req.get('host')}/.well-known/oauth-protected-resource/mcp"`)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Valid access token required. Connect via OAuth or use an API key.' } });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  console.log(`[MCP-AUTH] GET /mcp sessionId=${sessionId || '(none)'} known=${sessionId ? transports.has(sessionId) : '-'}`);
  if (!sessionId || !transports.has(sessionId)) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
    return;
  }

  const session = transports.get(sessionId)!;
  setDefaultUserId(session.userId);
  await session.transport.handleRequest(req, res);
});

// DELETE /mcp — terminate session
mcpRouter.delete('/', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth) {
    res.status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${req.protocol}://${req.get('host')}/.well-known/oauth-protected-resource/mcp"`)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Valid access token required. Connect via OAuth or use an API key.' } });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  console.log(`[MCP-AUTH] DELETE /mcp sessionId=${sessionId || '(none)'} known=${sessionId ? transports.has(sessionId) : '-'}`);
  if (!sessionId || !transports.has(sessionId)) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found.' } });
    return;
  }

  const session = transports.get(sessionId)!;
  await session.transport.handleRequest(req, res);
  transports.delete(sessionId);
});
