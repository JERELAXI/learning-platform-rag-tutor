import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hasTokens,
  setTokens,
  subscribeToTokens,
} from './tokens'

const TOKENS = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'bearer',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('token store', () => {
  it('round-trips both tokens', () => {
    expect(hasTokens()).toBe(false)

    setTokens(TOKENS)

    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1')
    expect(hasTokens()).toBe(true)
  })

  it('forgets everything on clear', () => {
    setTokens(TOKENS)
    clearTokens()

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(hasTokens()).toBe(false)
  })

  it('notifies subscribers on write and on clear', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTokens(listener)

    setTokens(TOKENS)
    clearTokens()

    // This is the channel a failed refresh uses to reach AuthContext.
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setTokens(TOKENS)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('when localStorage is unavailable', () => {
  /** Private-mode Safari and blocked site data both make these throw. */
  function stubThrowingStorage(): void {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('denied')
      },
      setItem: () => {
        throw new DOMException('denied')
      },
      removeItem: () => {
        throw new DOMException('denied')
      },
      clear: () => {
        throw new DOMException('denied')
      },
      key: () => null,
      length: 0,
    })
  }

  it('reports no session instead of throwing', () => {
    stubThrowingStorage()

    // Losing persistence is acceptable; crashing the whole app is not.
    expect(() => getAccessToken()).not.toThrow()
    expect(getAccessToken()).toBeNull()
    expect(hasTokens()).toBe(false)
  })

  it('swallows failed writes and clears', () => {
    stubThrowingStorage()

    expect(() => setTokens(TOKENS)).not.toThrow()
    expect(() => clearTokens()).not.toThrow()
  })

  it('still notifies subscribers, so the UI stays consistent', () => {
    stubThrowingStorage()
    const listener = vi.fn()
    subscribeToTokens(listener)

    setTokens(TOKENS)

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
