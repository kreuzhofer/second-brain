import { randomBytes } from 'crypto';
import { resetDatabase, TEST_USER_ID } from '../setup';
import { getOAuthProvider, resetOAuthProvider } from '../../src/services/oauth.provider';
import { getPrismaClient } from '../../src/lib/prisma';
import { setDefaultUserId } from '../../src/context/user-context';
import { getApiKeyService } from '../../src/services/api-key.service';

describe('OAuth flow for MCP', () => {
  beforeEach(async () => {
    await resetDatabase();
    resetOAuthProvider();
    setDefaultUserId(TEST_USER_ID);
  });

  it('registers a client via DCR', async () => {
    const provider = getOAuthProvider();
    const registered = await provider.clientsStore.registerClient!({
      redirect_uris: [new URL('https://example.com/callback')] as any,
      client_name: 'Test Agent',
      client_secret: 'test-secret',
    });

    expect(registered.client_id).toBeDefined();
    expect(registered.client_secret).toBeDefined();
    expect(registered.client_name).toBe('Test Agent');

    const retrieved = await provider.clientsStore.getClient(registered.client_id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.client_id).toBe(registered.client_id);
  });

  it('registers a public client (no secret) when token_endpoint_auth_method is none', async () => {
    const provider = getOAuthProvider();
    const registered = await provider.clientsStore.registerClient!({
      redirect_uris: [new URL('https://example.com/callback')] as any,
      client_name: 'ChatGPT Public Client',
      token_endpoint_auth_method: 'none',
    });

    expect(registered.client_id).toBeDefined();
    expect(registered.client_secret).toBeUndefined();
    expect(registered.token_endpoint_auth_method).toBe('none');
    expect(registered.client_name).toBe('ChatGPT Public Client');

    const retrieved = await provider.clientsStore.getClient(registered.client_id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.client_secret).toBeUndefined();
  });

  it('registers as public client when no secret and no auth method provided', async () => {
    const provider = getOAuthProvider();
    const registered = await provider.clientsStore.registerClient!({
      redirect_uris: [new URL('https://chatgpt.com/callback')] as any,
      client_name: 'ChatGPT',
    });

    expect(registered.client_id).toBeDefined();
    expect(registered.client_secret).toBeUndefined();
    expect(registered.token_endpoint_auth_method).toBe('none');
  });

  it('full auth code exchange flow', async () => {
    const provider = getOAuthProvider();
    const prisma = getPrismaClient();

    // Register client
    const client = await provider.clientsStore.registerClient!({
      redirect_uris: [new URL('https://example.com/callback')] as any,
      client_name: 'Test Agent',
      client_secret: 'test-secret',
    });

    // Create auth code directly (simulates what authorize() does after login)
    const code = randomBytes(32).toString('hex');
    await prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId: client.client_id,
        userId: TEST_USER_ID,
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'test-challenge',
        scopes: [],
        expiresAt: new Date(Date.now() + 600_000),
      }
    });

    // Exchange code for tokens
    const tokens = await provider.exchangeAuthorizationCode(
      client as any,
      code,
      undefined,
      'https://example.com/callback'
    );

    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
    expect(tokens.token_type).toBe('bearer');
    expect(tokens.expires_in).toBe(3600);

    // Verify access token
    const authInfo = await provider.verifyAccessToken(tokens.access_token);
    expect(authInfo.token).toBe(tokens.access_token);
    expect((authInfo.extra as any).userId).toBe(TEST_USER_ID);

    // Refresh token
    const newTokens = await provider.exchangeRefreshToken(
      client as any,
      tokens.refresh_token!,
      []
    );
    expect(newTokens.access_token).toBeDefined();
    expect(newTokens.refresh_token).toBeDefined();

    // Revoke
    await provider.revokeToken!(client as any, { token: newTokens.refresh_token! });

    // Verify revoked refresh token fails
    await expect(provider.exchangeRefreshToken(
      client as any,
      newTokens.refresh_token!,
      []
    )).rejects.toThrow('revoked');
  });

  it('rejects expired auth code', async () => {
    const provider = getOAuthProvider();
    const prisma = getPrismaClient();

    const client = await provider.clientsStore.registerClient!({
      redirect_uris: [new URL('https://example.com/callback')] as any,
      client_name: 'Test',
      client_secret: 'secret',
    });

    const code = randomBytes(32).toString('hex');
    await prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId: client.client_id,
        userId: TEST_USER_ID,
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'challenge',
        scopes: [],
        expiresAt: new Date(Date.now() - 1000), // expired
      }
    });

    await expect(provider.exchangeAuthorizationCode(
      client as any, code
    )).rejects.toThrow('expired');
  });

  it('rejects already-used auth code', async () => {
    const provider = getOAuthProvider();
    const prisma = getPrismaClient();

    const client = await provider.clientsStore.registerClient!({
      redirect_uris: [new URL('https://example.com/callback')] as any,
      client_name: 'Test',
      client_secret: 'secret',
    });

    const code = randomBytes(32).toString('hex');
    await prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId: client.client_id,
        userId: TEST_USER_ID,
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'challenge',
        scopes: [],
        expiresAt: new Date(Date.now() + 600_000),
        usedAt: new Date(), // already used
      }
    });

    await expect(provider.exchangeAuthorizationCode(
      client as any, code
    )).rejects.toThrow('already used');
  });

  it('legacy API key works via verifyAccessToken', async () => {
    const apiKeyService = getApiKeyService();
    const created = await apiKeyService.create(TEST_USER_ID, 'Test Agent');

    const provider = getOAuthProvider();
    const authInfo = await provider.verifyAccessToken(created.key);

    expect((authInfo.extra as any).userId).toBe(TEST_USER_ID);
    expect((authInfo.extra as any).agentName).toBe('Test Agent');
  });

  it('rejects invalid access token', async () => {
    const provider = getOAuthProvider();
    await expect(provider.verifyAccessToken('invalid-token'))
      .rejects.toThrow('Invalid access token');
  });

  it('challengeForAuthorizationCode returns the stored challenge', async () => {
    const provider = getOAuthProvider();
    const prisma = getPrismaClient();

    const client = await provider.clientsStore.registerClient!({
      redirect_uris: [new URL('https://example.com/callback')] as any,
      client_name: 'Test',
      client_secret: 'secret',
    });

    const code = randomBytes(32).toString('hex');
    await prisma.oAuthAuthorizationCode.create({
      data: {
        code,
        clientId: client.client_id,
        userId: TEST_USER_ID,
        redirectUri: 'https://example.com/callback',
        codeChallenge: 'my-pkce-challenge',
        scopes: [],
        expiresAt: new Date(Date.now() + 600_000),
      }
    });

    const challenge = await provider.challengeForAuthorizationCode(client as any, code);
    expect(challenge).toBe('my-pkce-challenge');
  });
});
