import { useContext } from 'react'

import { AuthContext } from './context'
import type { AuthValue } from './context'

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth must be called inside <AuthProvider>')
  }
  return value
}
