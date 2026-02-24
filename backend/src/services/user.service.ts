import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getPrismaClient } from '../lib/prisma';
import { setDefaultUserId } from '../context/user-context';
import { getConfig } from '../config/env';

export interface UserBootstrapResult {
  userId: string;
  email: string;
}

export class UserService {
  private prisma = getPrismaClient();
  private defaultUserId: string | null = null;

  getDefaultUserId(): string | null {
    return this.defaultUserId;
  }

  setDefaultUserId(userId: string): void {
    this.defaultUserId = userId;
    setDefaultUserId(userId);
  }

  async ensureDefaultUser(): Promise<UserBootstrapResult> {
    const config = getConfig();
    const email = config.DEFAULT_USER_EMAIL;
    const password = config.DEFAULT_USER_PASSWORD;
    const name = config.DEFAULT_USER_NAME || 'Default User';

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      const passwordMatches = await this.verifyPassword(password, existing.passwordHash);
      if (!passwordMatches || existing.name !== name) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash: await this.hashPassword(password), name }
        });
      }
      // Backfill inbound email code for existing users
      if (!existing.inboundEmailCode) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { inboundEmailCode: this.generateInboundEmailCode() }
        });
      }
      this.setDefaultUserId(existing.id);
      return { userId: existing.id, email };
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await this.hashPassword(password),
        inboundEmailCode: this.generateInboundEmailCode()
      }
    });

    this.setDefaultUserId(user.id);
    return { userId: user.id, email };
  }

  async createUser(payload: { email: string; password: string; name?: string | null }) {
    const passwordHash = await this.hashPassword(payload.password);
    return this.prisma.user.create({
      data: {
        email: payload.email,
        name: payload.name ?? null,
        passwordHash,
        inboundEmailCode: this.generateInboundEmailCode()
      }
    });
  }

  async getUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async updateName(userId: string, name: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { name } });
  }

  async updateEmail(userId: string, newEmail: string, currentPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found.');
    const valid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Current password is incorrect.');
    const existing = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existing && existing.id !== userId) throw new Error('Email already in use.');
    return this.prisma.user.update({ where: { id: userId }, data: { email: newEmail } });
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found.');
    const valid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Current password is incorrect.');
    const hash = await this.hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  }

  async backfillUserIds(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.entry.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.tag.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.conversation.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.message.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.conversationSummary.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.emailThread.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.entryAuditLog.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.focusTrack.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.focusSession.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.digestPreference.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.dailyTipState.updateMany({ where: { userId: null }, data: { userId } }),
      this.prisma.offlineQueueItem.updateMany({ where: { userId: null }, data: { userId } })
    ]);
  }

  async ensureTestUser(email: string, password: string, id: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    const passwordHash = await this.hashPassword(password);

    if (existing) {
      this.setDefaultUserId(existing.id);
      return;
    }

    const user = await this.prisma.user.create({
      data: {
        id,
        email,
        name: 'Test User',
        passwordHash
      }
    });

    this.setDefaultUserId(user.id);
  }

  async disableUser(userId: string, currentPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found.');
    const valid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Current password is incorrect.');
    await this.prisma.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
  }

  async getUserByInboundCode(code: string) {
    return this.prisma.user.findUnique({ where: { inboundEmailCode: code } });
  }

  generateInboundEmailCode(): string {
    return crypto.randomBytes(3).toString('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}

let userServiceInstance: UserService | null = null;

export function getUserService(): UserService {
  if (!userServiceInstance) {
    userServiceInstance = new UserService();
  }
  return userServiceInstance;
}

export function resetUserService(): void {
  userServiceInstance = null;
}
