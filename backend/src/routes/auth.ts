import { Router, Request, Response } from 'express';
import { getAuthService } from '../services/auth.service';
import { getUserService } from '../services/user.service';
import { authMiddleware } from '../middleware/auth';
import { requireUserId } from '../context/user-context';

export const authRouter = Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return emailRegex.test(email);
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
  if (!email || !password) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' }
    });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Email is invalid.' }
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters.' }
    });
    return;
  }

  const authService = getAuthService();
  try {
    const { user, token } = await authService.register({ email, password, name });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    res.status(400).json({
      error: { code: 'REGISTRATION_FAILED', message: error instanceof Error ? error.message : 'Registration failed.' }
    });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' }
    });
    return;
  }

  const authService = getAuthService();
  try {
    const { user, token } = await authService.login({ email, password });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' }
    });
  }
});

authRouter.get('/me', authMiddleware, async (_req: Request, res: Response) => {
  const userId = requireUserId();
  const userService = getUserService();
  const user = await userService.getUserById(userId);
  if (!user) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name });
});
