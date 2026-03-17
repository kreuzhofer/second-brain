import express from 'express';
import { join } from 'path';
import { loadEnvConfig, validateRequiredEnvVars } from './config/env';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { entriesRouter } from './routes/entries';
import { indexRouter } from './routes/index-route';
import { chatRouter } from './routes/chat';
import { authRouter } from './routes/auth';
import { digestRouter } from './routes/digest';
import { captureRouter } from './routes/capture';
import { searchRouter } from './routes/search';
import { inboxRouter } from './routes/inbox';
import { duplicatesRouter } from './routes/duplicates';
import { queueRouter } from './routes/queue';
import { focusRouter } from './routes/focus';
import { calendarRouter, calendarPublicRouter } from './routes/calendar';
import { insightsRouter } from './routes/insights';
import { pushRouter } from './routes/push';
import { apiKeysRouter } from './routes/api-keys';
import { mcpRouter } from './routes/mcp';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { getOAuthProvider } from './services/oauth.provider';
import { initializeDataFolder, initializeEmailChannel, shutdownEmailChannel } from './services/init.service';
import { getCronService, resetCronService } from './services/cron.service';
import { getOfflineQueueService } from './services/offline-queue.service';
import { getToolExecutor } from './services/tool-executor';
import { getEmbeddingBackfillService } from './services/embedding-backfill.service';
import { getUserService } from './services/user.service';
import { JSON_BODY_LIMIT } from './config/http';

// Validate environment variables before starting
validateRequiredEnvVars();

const config = loadEnvConfig();
const app = express();

// Middleware
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// MCP/OAuth request logging
app.use((req, res, next) => {
  const path = req.path;
  if (path.startsWith('/.well-known') || path === '/authorize' || path === '/token' ||
      path === '/register' || path === '/revoke' || path.startsWith('/mcp')) {
    const start = Date.now();
    console.log(`[MCP-AUTH] --> ${req.method} ${path} from=${req.ip} origin=${req.get('origin') || '-'} content-type=${req.get('content-type') || '-'}`);
    if (req.method === 'POST' && path !== '/mcp') {
      // Log body for OAuth endpoints (not MCP tool calls which are large)
      const bodyStr = JSON.stringify(req.body || {});
      console.log(`[MCP-AUTH]     body=${bodyStr.slice(0, 500)}`);
    }
    const originalEnd = res.end.bind(res);
    res.end = function (...args: any[]) {
      const ms = Date.now() - start;
      console.log(`[MCP-AUTH] <-- ${req.method} ${path} status=${res.statusCode} ${ms}ms`);
      if (res.statusCode >= 400) {
        // Log response body for errors
        const chunk = args[0];
        if (chunk && typeof chunk === 'string') {
          console.log(`[MCP-AUTH]     error-body=${chunk.slice(0, 500)}`);
        } else if (chunk && Buffer.isBuffer(chunk)) {
          console.log(`[MCP-AUTH]     error-body=${chunk.toString('utf-8').slice(0, 500)}`);
        }
      }
      return originalEnd(...args);
    } as any;
  }
  next();
});

// OAuth 2.0 for MCP (must be at app root before other routes)
const serverUrl = new URL(config.PUBLIC_URL || `http://localhost:${config.PORT}`);
console.log(`[MCP-AUTH] OAuth issuer URL: ${serverUrl.toString()}, resource: ${new URL('/mcp', serverUrl).toString()}`);
app.use(mcpAuthRouter({
  provider: getOAuthProvider(),
  issuerUrl: serverUrl,
  baseUrl: serverUrl,
  resourceServerUrl: new URL('/mcp', serverUrl),
  resourceName: 'JustDo Second Brain',
  clientRegistrationOptions: { rateLimit: false },
  authorizationOptions: { rateLimit: false },
  tokenOptions: { rateLimit: false },
  revocationOptions: { rateLimit: false },
}));

// Public routes (no auth required)
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/calendar', calendarPublicRouter);
app.use('/mcp', mcpRouter);

// Protected routes
app.use('/api/entries', authMiddleware, entriesRouter);
app.use('/api/index', authMiddleware, indexRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/digest', authMiddleware, digestRouter);
app.use('/api/capture', authMiddleware, captureRouter);
app.use('/api/search', authMiddleware, searchRouter);
app.use('/api/inbox', authMiddleware, inboxRouter);
app.use('/api/duplicates', authMiddleware, duplicatesRouter);
app.use('/api/queue', authMiddleware, queueRouter);
app.use('/api/focus', authMiddleware, focusRouter);
app.use('/api/calendar', authMiddleware, calendarRouter);
app.use('/api/insights', authMiddleware, insightsRouter);
app.use('/api/push', authMiddleware, pushRouter);
app.use('/api/api-keys', authMiddleware, apiKeysRouter);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const publicPath = join(__dirname, '../public');
  app.use(express.static(publicPath));
  
  // SPA fallback - serve index.html for all non-API/OAuth routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/.well-known') ||
        req.path === '/authorize' ||
        req.path === '/token' ||
        req.path === '/register' ||
        req.path === '/revoke' ||
        req.path === '/mcp') {
      return next();
    }
    res.sendFile(join(publicPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if ((err as Error & { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Request payload exceeds ${JSON_BODY_LIMIT} JSON body limit`
      }
    });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
});

// Start server
async function start() {
  try {
    const userService = getUserService();
    const { userId } = await userService.ensureDefaultUser();
    await userService.backfillUserIds(userId);

    // Initialize data folder structure
    await initializeDataFolder();

    // Initialize email channel (verifies connectivity, starts polling if enabled)
    await initializeEmailChannel();
    
    // Start cron scheduler for digests and reviews
    const cronService = getCronService();
    cronService.start();

    // Start offline queue replay worker
    const offlineQueue = getOfflineQueueService();
    const toolExecutor = getToolExecutor();
    offlineQueue.startProcessing(async (item) => {
      const result = await toolExecutor.execute(
        { name: item.tool, arguments: item.args },
        { channel: item.channel, context: item.context, allowQueue: false }
      );
      if (result.success && result.data && (result.data as any).queued) {
        return { success: false, error: 'LLM unavailable, capture re-queued' };
      }
      return { success: result.success, error: result.error };
    });

    // Start embedding backfill (runs only when missing embeddings exist)
    const embeddingBackfill = getEmbeddingBackfillService();
    embeddingBackfill.start();
    
    // Graceful shutdown handler
    const shutdown = async () => {
      console.log('Shutting down gracefully...');
      await shutdownEmailChannel();
      resetCronService();
      offlineQueue.stopProcessing();
      process.exit(0);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    app.listen(config.PORT, () => {
      console.log(`JustDo.so API running on port ${config.PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app };
