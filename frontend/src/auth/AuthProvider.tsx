import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import * as authApi from '../api/auth'
import { hasTokens, subscribeToTokens } from '../api/tokens'
import type { LoginRequest, UserRead, UserRegister } from '../api/types'
import { AuthContext } from './context'
import type { AuthStatus, AuthValue } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null)
  // A stored token means "probably signed in, verifying" — start in `loading`
  // so guards don't bounce the user to /login when they reload a deep link.
  const [status, setStatus] = useState<AuthStatus>(() =>
    hasTokens() ? 'loading' : 'anonymous',
  )

  useEffect(() => {
    let cancelled = false

    async function restoreSession(): Promise<void> {
      if (!hasTokens()) {
        setUser(null)
        setStatus('anonymous')
        return
      }
      try {
        const me = await authApi.getMe()
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      } catch {
        // Token present but rejected: expired beyond refresh, or deactivated.
        if (cancelled) return
        setUser(null)
        setStatus('anonymous')
      }
    }

    void restoreSession()

    // Only react to tokens being *cleared*. That happens when the fetch
    // interceptor fails to refresh in the middle of some unrelated request —
    // without this the UI would keep showing a signed-in shell. Token *writes*
    // are ignored on purpose: login() sets the user itself, and a silent
    // refresh keeps the same user, so re-fetching /me would be wasted work.
    const unsubscribe = subscribeToTokens(() => {
      if (!hasTokens()) {
        setUser(null)
        setStatus('anonymous')
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const login = useCallback(async (payload: LoginRequest): Promise<void> => {
    await authApi.login(payload)
    const me = await authApi.getMe()
    setUser(me)
    setStatus('authenticated')
  }, [])

  const register = useCallback(
    async (payload: UserRegister): Promise<void> => {
      await authApi.register(payload)
      // Registration returns the user but no tokens, so sign in right away —
      // bouncing someone to a login form after they just registered is
      // pointless friction.
      await login({ email: payload.email, password: payload.password })
    },
    [login],
  )

  const logout = useCallback(async (): Promise<void> => {
    await authApi.logout()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
