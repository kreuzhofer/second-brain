import { Router, Request, Response } from 'express';
import { getAuthService } from '../services/auth.service';
import { getUserService } from '../services/user.service';
import { authMiddleware } from '../middleware/auth';
import { requireUserId } from '../context/user-context';
import { getInboundEmailAddress } from '../config/email';
import { getPrismaClient } from '../lib/prisma';
import { getSmtpSender } from '../services/smtp-sender';
import { getConfig } from '../config/env';
import { getOAuthProvider } from '../services/oauth.provider';

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'Account is disabled') {
      res.status(403).json({
        error: { code: 'ACCOUNT_DISABLED', message: 'Account is disabled.' }
      });
    } else {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' }
      });
    }
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

authRouter.get('/digest-email', authMiddleware, async (_req: Request, res: Response) => {
  const userId = requireUserId();
  const userService = getUserService();
  try {
    const result = await userService.getDigestEmail(userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: { code: 'FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to fetch digest email.' }
    });
  }
});

authRouter.patch('/digest-email', authMiddleware, async (req: Request, res: Response) => {
  const { email, enabled } = req.body as { email?: string; enabled?: boolean };

  if (email !== undefined && email !== null) {
    if (typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email is invalid.' } });
      return;
    }
  }

  const userId = requireUserId();
  const userService = getUserService();
  try {
    const result = await userService.updateDigestEmail(userId, { email, enabled });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: { code: 'UPDATE_FAILED', message: error instanceof Error ? error.message : 'Update failed.' }
    });
  }
});

authRouter.get('/export', authMiddleware, async (_req: Request, res: Response) => {
  const userId = requireUserId();
  const prisma = getPrismaClient();

  const [
    entries,
    conversations,
    digestPreferences,
    calendarSources,
    calendarSettings,
    entryLinks,
    focusTracks,
    focusSessions,
  ] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      include: {
        projectDetails: true,
        adminDetails: true,
        ideaDetails: true,
        personDetails: true,
        inboxDetails: true,
        sections: true,
        logs: true,
        tags: { include: { tag: true } },
        revisions: true,
      },
    }),
    prisma.conversation.findMany({
      where: { userId },
      include: { messages: true, summaries: true },
    }),
    prisma.digestPreference.findMany({ where: { userId } }),
    prisma.calendarSource.findMany({ where: { userId } }),
    prisma.calendarSettings.findFirst({ where: { userId } }),
    prisma.entryLink.findMany({ where: { userId } }),
    prisma.focusTrack.findMany({ where: { userId } }),
    prisma.focusSession.findMany({ where: { userId } }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    entries,
    conversations,
    digestPreferences,
    calendarSources,
    calendarSettings,
    entryLinks,
    focusTracks,
    focusSessions,
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="justdo-export-${dateStr}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

authRouter.post('/disable', authMiddleware, async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password is required.' } });
    return;
  }

  const userId = requireUserId();
  const userService = getUserService();
  try {
    await userService.disableUser(userId, password);
    res.json({ disabled: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disable account.';
    if (message === 'Current password is incorrect.') {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
    } else {
      res.status(400).json({ error: { code: 'DISABLE_FAILED', message } });
    }
  }
});

// ============================================
// Password Reset (public, no auth required)
// ============================================

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email || !isValidEmail(email)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'A valid email address is required.' }
    });
    return;
  }

  const userService = getUserService();
  const token = await userService.createPasswordResetToken(email.trim().toLowerCase());

  // Always return success to prevent email enumeration
  if (!token) {
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    return;
  }

  const smtpSender = getSmtpSender();
  if (!smtpSender.isAvailable()) {
    res.status(503).json({
      error: { code: 'EMAIL_NOT_CONFIGURED', message: 'Password reset requires email to be configured. Contact your administrator.' }
    });
    return;
  }

  const config = getConfig();
  const baseUrl = config.PUBLIC_URL || `http://localhost:${config.PORT}`;
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  await smtpSender.sendEmail({
    to: email.trim().toLowerCase(),
    subject: 'Reset your JustDo.so password',
    text: `You requested a password reset for your JustDo.so account.\n\nClick this link to set a new password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e293b; margin-bottom: 16px;">Reset your password</h2>
        <p style="color: #475569; line-height: 1.6;">You requested a password reset for your JustDo.so account.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="color: #94a3b8; font-size: 14px;">This link is valid for 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });

  res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Reset token is required.' }
    });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters.' }
    });
    return;
  }

  const userService = getUserService();
  try {
    await userService.consumePasswordResetToken(token, password);
    res.json({ message: 'Password has been reset. You can now log in.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset password.';
    res.status(400).json({ error: { code: 'RESET_FAILED', message } });
  }
});

// ============================================
// OAuth Consent (authenticated via JWT)
// ============================================

authRouter.post('/oauth-consent', authMiddleware, async (req: Request, res: Response) => {
  const userId = requireUserId();
  const { client_id, redirect_uri, code_challenge, state, scope } = req.body as {
    client_id?: string;
    redirect_uri?: string;
    code_challenge?: string;
    state?: string;
    scope?: string;
  };

  if (!client_id || !redirect_uri || !code_challenge) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Missing required OAuth parameters.' }
    });
    return;
  }

  const provider = getOAuthProvider();

  // Verify the client exists
  const client = await provider.clientsStore.getClient(client_id);
  if (!client) {
    res.status(400).json({
      error: { code: 'INVALID_CLIENT', message: 'Unknown OAuth client.' }
    });
    return;
  }

  const scopes = scope ? scope.split(' ').filter(Boolean) : [];

  try {
    const code = await provider.generateAuthorizationCode(
      userId, client_id, redirect_uri, code_challenge, state, scopes
    );

    // Build the redirect URL with code + state
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    res.json({ redirect_url: redirectUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate authorization.';
    res.status(500).json({ error: { code: 'AUTHORIZATION_FAILED', message } });
  }
});
