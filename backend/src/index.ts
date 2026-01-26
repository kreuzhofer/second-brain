import express from 'express';
import { join } from 'path';
import { loadEnvConfig, validateRequiredEnvVars } from './config/env';
import { authMiddleware } from './middleware/auth';
import { healthRouter } from './routes/health';
import { entriesRouter } from './routes/entries';
import { indexRouter } from './routes/index-route';
import { chatRouter } from './routes/chat';
import { initializeDataFolder } from './services/init.service';

// Validate environment variables before starting
validateRequiredEnvVars();

const config = loadEnvConfig();
const app = express();

// Middleware
app.use(express.json());

// Public routes (no auth required)
app.use('/api/health', healthRouter);

// Convenience endpoint: expose API key for local single-user setup
// This allows the frontend to auto-authenticate without manual key entry
app.get('/api/auth/key', (req, res) => {
  res.json({ key: config.API_KEY });
});

// Protected routes
app.use('/api/entries', authMiddleware, entriesRouter);
app.use('/api/index', authMiddleware, indexRouter);
app.use('/api/chat', authMiddleware, chatRouter);

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
    // Initialize data folder structure
    await initializeDataFolder();
    
    app.listen(config.PORT, () => {
      console.log(`Second Brain API running on port ${config.PORT}`);
      console.log(`Data directory: ${config.DATA_PATH}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app };
