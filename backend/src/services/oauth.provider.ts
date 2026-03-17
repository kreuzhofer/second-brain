import { randomUUID, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { getPrismaClient } from '../lib/prisma';
import { getApiKeyService } from './api-key.service';
import { getUserService } from './user.service';
import { getConfig } from '../config/env';

/**
 * Converts a Prisma OAuthClient record to the SDK's OAuthClientInformationFull type.
 */
function toClientInfo(record: {
  clientId: string;
  clientSecret: string | null;
  clientName: string | null;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  scope: string | null;
  clientIdIssuedAt: number | null;
  clientSecretExpiresAt: number | null;
}): OAuthClientInformationFull {
  return {
    client_id: record.clientId,
    client_secret: record.clientSecret ?? undefined,
    client_name: record.clientName ?? undefined,
    redirect_uris: record.redirectUris.map((u) => new URL(u)) as any,
    grant_types: record.grantTypes,
    response_types: record.responseTypes,
    token_endpoint_auth_method: record.tokenEndpointAuthMethod,
    scope: record.scope ?? undefined,
    client_id_issued_at: record.clientIdIssuedAt ?? undefined,
    client_secret_expires_at: record.clientSecretExpiresAt ?? undefined,
  };
}

class JustDoClientsStore implements OAuthRegisteredClientsStore {
  private prisma = getPrismaClient();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    console.log(`[MCP-AUTH] clientsStore.getClient(${clientId})`);
    const record = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });
    if (!record) {
      console.log(`[MCP-AUTH] clientsStore.getClient -> not found`);
      return undefined;
    }
    console.log(`[MCP-AUTH] clientsStore.getClient -> found name=${record.clientName}`);
    return toClientInfo(record);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): Promise<OAuthClientInformationFull> {
    console.log(`[MCP-AUTH] clientsStore.registerClient name=${client.client_name} redirect_uris=${client.redirect_uris?.map(u => u.toString()).join(',')}`);
    // The SDK may pass client_id at runtime even though the type omits it
    const runtimeClient = client as OAuthClientInformationFull;
    const clientId = runtimeClient.client_id || randomUUID();
    const clientSecret = client.client_secret || randomBytes(32).toString('hex');
    const clientIdIssuedAt = runtimeClient.client_id_issued_at || Math.floor(Date.now() / 1000);

    const record = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecret,
        clientName: client.client_name ?? null,
        redirectUris: client.redirect_uris.map((u) => u.toString()),
        grantTypes: client.grant_types ?? ['authorization_code', 'refresh_token'],
        responseTypes: client.response_types ?? ['code'],
        tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? 'client_secret_post',
        scope: client.scope ?? null,
        clientIdIssuedAt,
        clientSecretExpiresAt: client.client_secret_expires_at ?? null,
      },
    });

    return toClientInfo(record);
  }
}

export class JustDoOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: JustDoClientsStore;
  private prisma = getPrismaClient();

  constructor() {
    this.clientsStore = new JustDoClientsStore();
  }

  /**
   * Renders a login/consent page or processes a login form submission.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const req = res.req;
    const body = req.body || {};
    console.log(`[MCP-AUTH] authorize() client=${client.client_id} name=${client.client_name} redirect=${params.redirectUri} state=${params.state || '-'} method=${req.method}`);
    const isFormPost =
      req.method === 'POST' &&
      (typeof body.email === 'string' && typeof body.password === 'string');

    if (isFormPost) {
      // Login attempt
      const email = body.email as string;
      const password = body.password as string;

      const userService = getUserService();
      const user = await userService.getUserByEmail(email);

      if (!user || user.disabledAt) {
        this.renderLoginPage(res, client, params, 'Invalid email or password.');
        return;
      }

      const valid = await userService.verifyPassword(password, user.passwordHash);
      if (!valid) {
        this.renderLoginPage(res, client, params, 'Invalid email or password.');
        return;
      }

      // Generate auth code
      const code = randomBytes(32).toString('hex');
      await this.prisma.oAuthAuthorizationCode.create({
        data: {
          code,
          clientId: client.client_id,
          userId: user.id,
          redirectUri: params.redirectUri,
          codeChallenge: params.codeChallenge,
          scopes: params.scopes ?? [],
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        },
      });

      // Redirect back with code
      const redirectUrl = new URL(params.redirectUri);
      redirectUrl.searchParams.set('code', code);
      if (params.state) {
        redirectUrl.searchParams.set('state', params.state);
      }

      console.log(`[MCP-AUTH] authorize() -> login success user=${user.id} -> redirect ${redirectUrl.toString().slice(0, 120)}...`);
      res.redirect(302, redirectUrl.toString());
      return;
    }

    // Render login page
    this.renderLoginPage(res, client, params);
  }

  private renderLoginPage(
    res: Response,
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    error?: string
  ): void {
    const clientName = client.client_name || client.client_id;
    // Preserve all OAuth params as hidden fields so the form POSTs back to authorize
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize - JustDo Second Brain</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 1rem;
  }
  .card {
    background: #1e293b;
    border-radius: 12px;
    padding: 2rem;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.3);
  }
  .logo {
    text-align: center;
    margin-bottom: 1.5rem;
  }
  .logo h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #f1f5f9;
  }
  .logo p {
    font-size: 0.875rem;
    color: #94a3b8;
    margin-top: 0.25rem;
  }
  .consent-box {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  .consent-box p {
    font-size: 0.875rem;
    color: #cbd5e1;
    line-height: 1.5;
  }
  .consent-box .agent-name {
    color: #38bdf8;
    font-weight: 600;
  }
  .error {
    background: #7f1d1d;
    border: 1px solid #991b1b;
    color: #fecaca;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #94a3b8;
    margin-bottom: 0.375rem;
  }
  input[type="email"],
  input[type="password"] {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid #334155;
    border-radius: 6px;
    background: #0f172a;
    color: #f1f5f9;
    font-size: 1rem;
    margin-bottom: 1rem;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus {
    border-color: #38bdf8;
  }
  button {
    width: 100%;
    padding: 0.75rem;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  button:hover {
    background: #1d4ed8;
  }
  .footer {
    text-align: center;
    margin-top: 1.25rem;
    font-size: 0.75rem;
    color: #475569;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>JustDo Second Brain</h1>
    <p>Authorization Required</p>
  </div>
  <div class="consent-box">
    <p>
      <span class="agent-name">${escapeHtml(clientName)}</span>
      is requesting access to your Second Brain. This will allow the AI agent to
      read and write entries, search your knowledge base, and store memories on your behalf.
    </p>
  </div>
  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
  <form method="POST" action="">
    <input type="hidden" name="client_id" value="${escapeHtml(client.client_id)}">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
    <input type="hidden" name="state" value="${escapeHtml(params.state || '')}">
    <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
    <input type="hidden" name="code_challenge_method" value="S256">
    <input type="hidden" name="response_type" value="code">
    <input type="hidden" name="scope" value="${escapeHtml((params.scopes ?? []).join(' '))}">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" autocomplete="email" required autofocus>
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required>
    <button type="submit">Authorize Access</button>
  </form>
  <div class="footer">Sign in with your JustDo account to grant access.</div>
</div>
</body>
</html>`;

    res.status(200).type('html').send(html);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const record = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { code: authorizationCode },
    });
    if (!record) {
      throw new Error('Authorization code not found');
    }
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    console.log(`[MCP-AUTH] exchangeAuthorizationCode() code=${authorizationCode.slice(0, 8)}...`);
    const record = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { code: authorizationCode },
    });

    if (!record) {
      throw new Error('Authorization code not found');
    }

    if (record.usedAt) {
      throw new Error('Authorization code already used');
    }

    if (record.expiresAt < new Date()) {
      throw new Error('Authorization code expired');
    }

    // Mark as used
    await this.prisma.oAuthAuthorizationCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // Generate access token (JWT)
    const config = getConfig();
    const accessToken = jwt.sign(
      { sub: record.userId, clientId: record.clientId, type: 'mcp_access' },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Generate refresh token
    const refreshTokenValue = randomBytes(32).toString('hex');
    await this.prisma.oAuthRefreshToken.create({
      data: {
        token: refreshTokenValue,
        clientId: record.clientId,
        userId: record.userId,
        scopes: record.scopes,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: refreshTokenValue,
    };
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const record = await this.prisma.oAuthRefreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!record) {
      throw new Error('Refresh token not found');
    }

    if (record.revokedAt) {
      throw new Error('Refresh token has been revoked');
    }

    if (record.expiresAt < new Date()) {
      throw new Error('Refresh token expired');
    }

    // Revoke old refresh token (rotation)
    await this.prisma.oAuthRefreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    // Generate new access token
    const config = getConfig();
    const accessToken = jwt.sign(
      { sub: record.userId, clientId: record.clientId, type: 'mcp_access' },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Generate new refresh token
    const newRefreshTokenValue = randomBytes(32).toString('hex');
    await this.prisma.oAuthRefreshToken.create({
      data: {
        token: newRefreshTokenValue,
        clientId: record.clientId,
        userId: record.userId,
        scopes: scopes ?? record.scopes,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: newRefreshTokenValue,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    console.log(`[MCP-AUTH] verifyAccessToken() token=${token.slice(0, 12)}...`);
    const config = getConfig();

    // Try JWT first (OAuth tokens)
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as {
        sub: string;
        clientId: string;
        type: string;
      };

      if (decoded.type === 'mcp_access') {
        console.log(`[MCP-AUTH] verifyAccessToken -> JWT valid user=${decoded.sub} client=${decoded.clientId}`);
        return {
          token,
          clientId: decoded.clientId,
          scopes: [],
          extra: {
            userId: decoded.sub,
            agentId: decoded.clientId,
            agentName: `oauth-client:${decoded.clientId}`,
          },
        };
      }
    } catch (err: any) {
      console.log(`[MCP-AUTH] verifyAccessToken -> JWT failed: ${err.message}, trying API key fallback`);
    }

    // Fallback: legacy API key
    const apiKeyService = getApiKeyService();
    const result = await apiKeyService.verify(token);
    if (result) {
      console.log(`[MCP-AUTH] verifyAccessToken -> API key valid user=${result.userId} agent=${result.agentName}`);
      return {
        token,
        clientId: 'api-key',
        scopes: [],
        extra: {
          userId: result.userId,
          agentId: result.agentId,
          agentName: result.agentName,
        },
      };
    }

    throw new Error('Invalid access token');
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    // Try to revoke as refresh token
    const record = await this.prisma.oAuthRefreshToken.findUnique({
      where: { token: request.token },
    });

    if (record && !record.revokedAt) {
      await this.prisma.oAuthRefreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }

    // If it's an access token (JWT), we can't revoke it — it expires naturally.
    // Per RFC 7009, the server should respond with 200 OK regardless.
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let instance: JustDoOAuthProvider | null = null;

export function getOAuthProvider(): JustDoOAuthProvider {
  if (!instance) instance = new JustDoOAuthProvider();
  return instance;
}

export function resetOAuthProvider(): void {
  instance = null;
}
