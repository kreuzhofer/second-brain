import { Request, Response, NextFunction } from 'express';
import { getUserService } from '../services/user.service';
import { getAuthService } from '../services/auth.service';
import { runWithUserId } from '../context/user-context';

/**
 * Authentication middleware
 * Validates Bearer token in Authorization header as a JWT
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  const authService = getAuthService();
  const userService = getUserService();

  const payload = authService.verifyToken(token);
  if (!payload) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token'
      }
    });
    return;
  }

  const user = await userService.getUserById(payload.userId);
  if (!user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token'
      }
    });
    return;
  }

  if (user.disabledAt) {
    res.status(403).json({
      error: {
        code: 'ACCOUNT_DISABLED',
        message: 'Account is disabled'
      }
    });
    return;
  }

  runWithUserId(user.id, () => next());
}
