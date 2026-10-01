/**
 * Token store, deliberately outside React.
 *
 * `client.ts` needs to read and rotate tokens from inside a fetch interceptor,
 * which can't call hooks. So the tokens live here and `AuthContext` subscribes
 * — that way a forced logout triggered deep inside a retry still reaches the UI.
 *
 * Every localStorage access is guarded: it throws in private-mode Safari and
 * when site data is blocked. Losing persistence there is acceptable (the user
 * logs in again); crashing the app is not.
 */

import type { TokenResponse } from './types'

const ACCESS_KEY = 'rag-tutor.access-token'
const REFRESH_KEY = 'rag-tutor.refresh-token'

const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Non-persistent session: tokens stay in memory via the module closure
    // only for this page load. Nothing else to do.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore — see write()
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY)
}

export function setTokens(tokens: TokenResponse): void {
  write(ACCESS_KEY, tokens.access_token)
  write(REFRESH_KEY, tokens.refresh_token)
  notify()
}

export function clearTokens(): void {
  remove(ACCESS_KEY)
  remove(REFRESH_KEY)
  notify()
}

export function hasTokens(): boolean {
  return getAccessToken() !== null
}

/** Subscribe to login/logout/refresh. Returns an unsubscribe function. */
export function subscribeToTokens(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
