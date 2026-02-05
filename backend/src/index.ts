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
import { initializeDataFolder, initializeEmailChannel, shutdownEmailChannel } from './services/init.service';
import { getCronService, resetCronService } from './services/cron.service';
import { getOfflineQueueService } from './services/offline-queue.service';
import { getToolExecutor } from './services/tool-executor';
import { getEmbeddingBackfillService } from './services/embedding-backfill.service';
import { getUserService } from './services/user.service';

// Validate environment variables before starting
validateRequiredEnvVars();

const config = loadEnvConfig();
const app = express();

// Middleware
app.use(express.json());

// Public routes (no auth required)
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);

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

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const publicPath = join(__dirname, '../public');
  app.use(express.static(publicPath));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(join(publicPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
      console.log(`Second Brain API running on port ${config.PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app };
