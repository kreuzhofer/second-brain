import { AsyncLocalStorage } from 'node:async_hooks';

interface UserContextState {
  userId: string;
}

const storage = new AsyncLocalStorage<UserContextState>();
let defaultUserId: string | null = null;

export function runWithUserId<T>(userId: string, fn: () => T): T {
  return storage.run({ userId }, fn);
}

export function getCurrentUserId(): string | null {
  return storage.getStore()?.userId ?? defaultUserId;
}

export function requireUserId(): string {
  const userId = getCurrentUserId();
  if (!userId) {
    throw new Error('Missing user context');
  }
  return userId;
}

export function setDefaultUserId(userId: string): void {
  defaultUserId = userId;
}

export function clearDefaultUserId(): void {
  defaultUserId = null;
}
