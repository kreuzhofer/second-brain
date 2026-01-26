import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/env';

/**
 * Authentication middleware
 * Validates Bearer token in Authorization header against API_KEY
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing authorization header'
      }
    });
    return;
  }
  
  // Check for Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authorization format. Use: Bearer <token>'
      }
    });
    return;
  }
  
  const token = parts[1];
  const config = getConfig();
  
  if (token !== config.API_KEY) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      }
    });
    return;
  }
  
  next();
}
