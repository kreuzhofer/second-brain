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

function createMcpServer(agentId: string, agentName: string, userId: string): Server {
  const server = new Server(
    { name: 'justdo-brain', version: '1.0.0' },
    { capabilities: { tools: {} } }
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

    // Set user context for this request
    setDefaultUserId(userId);

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
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (error: any) {
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
  });

  const server = createMcpServer(auth.agentId, auth.agentName, auth.userId);
  await server.connect(transport);

  const newSessionId = transport.sessionId;
  if (newSessionId) {
    transports.set(newSessionId, { transport, agentId: auth.agentId, agentName: auth.agentName, userId: auth.userId });
    transport.onclose = () => {
      transports.delete(newSessionId);
    };
  }

  setDefaultUserId(auth.userId);
  await transport.handleRequest(req, res, req.body);
});

// GET /mcp — SSE stream for server-initiated messages
mcpRouter.get('/', async (req: Request, res: Response) => {
  const auth = await authenticateRequest(req);
  if (!auth) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid API key required.' } });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid or missing session ID.' } });
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
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid API key required.' } });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid or missing session ID.' } });
    return;
  }

  const session = transports.get(sessionId)!;
  await session.transport.handleRequest(req, res);
  transports.delete(sessionId);
});
