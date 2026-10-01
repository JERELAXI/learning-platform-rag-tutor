import { createContext } from 'react'

import type { LoginRequest, UserRead, UserRegister } from '../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthValue {
  user: UserRead | null
  status: AuthStatus
  login: (payload: LoginRequest) => Promise<void>
  register: (payload: UserRegister) => Promise<void>
  logout: () => Promise<void>
}

/** Context object and its types live apart from the provider component so that
 *  no file mixes component and non-component exports — React Fast Refresh
 *  silently stops working for files that do. */
export const AuthContext = createContext<AuthValue | null>(null)
