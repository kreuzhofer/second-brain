import jwt, { JwtPayload, SignOptions, Secret } from 'jsonwebtoken';
import { getConfig } from '../config/env';
import { UserService, getUserService } from './user.service';

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

export class AuthService {
  private userService: UserService;
  private config = getConfig();

  constructor(userService?: UserService) {
    this.userService = userService || getUserService();
  }

  async register(payload: { email: string; password: string; name?: string | null }) {
    const existing = await this.userService.getUserByEmail(payload.email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const user = await this.userService.createUser({
      email: payload.email,
      password: payload.password,
      name: payload.name ?? null
    });

    return { user, token: this.signToken(user.id, user.email) };
  }

  async login(payload: { email: string; password: string }) {
    const user = await this.userService.getUserByEmail(payload.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const valid = await this.userService.verifyPassword(payload.password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    return { user, token: this.signToken(user.id, user.email) };
  }

  verifyToken(token: string): AuthTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.config.JWT_SECRET) as JwtPayload;
      const userId = decoded.sub as string | undefined;
      const email = decoded.email as string | undefined;
      if (!userId || !email) return null;
      return { userId, email };
    } catch {
      return null;
    }
  }

  private signToken(userId: string, email: string): string {
    const options: SignOptions = {
      subject: userId,
      expiresIn: this.config.JWT_EXPIRES_IN as SignOptions['expiresIn']
    };

    return jwt.sign(
      { email },
      this.config.JWT_SECRET as Secret,
      options
    );
  }
}

let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}

export function resetAuthService(): void {
  authServiceInstance = null;
}
