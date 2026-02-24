import { Router, Request, Response } from 'express';
import { getAuthService } from '../services/auth.service';
import { getUserService } from '../services/user.service';
import { authMiddleware } from '../middleware/auth';
import { requireUserId } from '../context/user-context';
import { getInboundEmailAddress } from '../config/email';

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

authRouter.patch('/profile', authMiddleware, async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required.' } });
    return;
  }
  if (name.length > 100) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name must be 100 characters or less.' } });
    return;
  }

  const userId = requireUserId();
  const userService = getUserService();
  try {
    const user = await userService.updateName(userId, name.trim());
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    res.status(400).json({
      error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Update failed.' }
    });
  }
});

authRouter.patch('/email', authMiddleware, async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and current password are required.' } });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email is invalid.' } });
    return;
  }

  const userId = requireUserId();
  const userService = getUserService();
  try {
    const user = await userService.updateEmail(userId, email, password);
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed.';
    if (message === 'Current password is incorrect.') {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
    } else if (message === 'Email already in use.') {
      res.status(409).json({ error: { code: 'CONFLICT', message } });
    } else {
      res.status(400).json({ error: { code: 'UPDATE_FAILED', message } });
    }
  }
});

authRouter.patch('/password', authMiddleware, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Current password and new password are required.' } });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters.' } });
    return;
  }

  const userId = requireUserId();
  const userService = getUserService();
  try {
    await userService.updatePassword(userId, currentPassword, newPassword);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed.';
    if (message === 'Current password is incorrect.') {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
    } else {
      res.status(400).json({ error: { code: 'UPDATE_FAILED', message } });
    }
  }
});

authRouter.get('/inbound-email', authMiddleware, async (_req: Request, res: Response) => {
  const userId = requireUserId();
  const userService = getUserService();
  const user = await userService.getUserById(userId);
  if (!user) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    return;
  }

  const address = user.inboundEmailCode
    ? getInboundEmailAddress(user.inboundEmailCode)
    : null;

  res.json({ address, enabled: address !== null });
});
