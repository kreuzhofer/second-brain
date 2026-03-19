import OpenAI from 'openai';
import { getConfig } from '../config/env';

/**
 * Custom fetch that sets Connection: close on every request.
 *
 * Node.js undici reuses keep-alive connections that the OpenAI API may have
 * already closed, causing "SocketError: other side closed" in long-running
 * Docker containers. Disabling keep-alive prevents stale connection reuse.
 */
const noKeepAliveFetch: typeof globalThis.fetch = async (url, init) => {
  init = init || {};
  const headers = new Headers(init.headers);
  headers.set('Connection', 'close');
  return globalThis.fetch(url, { ...init, headers });
};

let instance: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!instance) {
    const config = getConfig();
    instance = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      maxRetries: 3,
      fetch: noKeepAliveFetch,
    });
  }
  return instance;
}
