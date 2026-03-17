import { randomUUID, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { getPrismaClient } from '../lib/prisma';
import { getApiKeyService } from './api-key.service';
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
    redirect_uris: record.redirectUris as any,
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
   * Redirects to the SPA consent page, which handles both login (if needed) and consent in the browser.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    console.log(`[MCP-AUTH] authorize() client=${client.client_id} name=${client.client_name} redirect=${params.redirectUri} state=${params.state || '-'}`);

    // Redirect to the SPA consent page with all OAuth params
    const config = getConfig();
    const baseUrl = config.PUBLIC_URL || `http://localhost:${config.PORT}`;
    const consentUrl = new URL('/oauth-consent', baseUrl);
    consentUrl.searchParams.set('client_id', client.client_id);
    consentUrl.searchParams.set('client_name', client.client_name || client.client_id);
    consentUrl.searchParams.set('redirect_uri', params.redirectUri);
    consentUrl.searchParams.set('code_challenge', params.codeChallenge);
    if (params.state) consentUrl.searchParams.set('state', params.state);
    if (params.scopes?.length) consentUrl.searchParams.set('scope', params.scopes.join(' '));

    console.log(`[MCP-AUTH] authorize() -> redirecting to SPA consent page`);
    res.redirect(302, consentUrl.toString());
  }

  /**
   * Generates an authorization code for a user who has consented.
   * Called by the /api/auth/oauth-consent endpoint after JWT validation.
   */
  async generateAuthorizationCode(
    userId: string,
    clientId: string,
    redirectUri: string,
    codeChallenge: string,
    _state?: string,
    scopes?: string[]
  ): Promise<string> {
    const code = randomBytes(32).toString('hex');
    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId,
        userId,
        redirectUri,
        codeChallenge,
        scopes: scopes ?? [],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });
    console.log(`[MCP-AUTH] generateAuthorizationCode() user=${userId} client=${clientId}`);
    return code;
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

let instance: JustDoOAuthProvider | null = null;

export function getOAuthProvider(): JustDoOAuthProvider {
  if (!instance) instance = new JustDoOAuthProvider();
  return instance;
}

export function resetOAuthProvider(): void {
  instance = null;
}
