import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { hasRole } from '../api/types'
import type { UserRole } from '../api/types'
import { FullPageSpinner } from '../components/ui'
import { useAuth } from './useAuth'

/** Gate for everything behind a login. Remembers where the user was headed
 *  so the login screen can send them back there. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

/** Mirrors the backend's `role_level >= required` rule. Insufficient role
 *  lands on the home screen rather than a dead end. */
export function RequireRole({ minimum }: { minimum: UserRole }) {
  const { user, status } = useAuth()

  if (status === 'loading') return <FullPageSpinner />
  if (user === null) return <Navigate to="/login" replace />
  if (!hasRole(user.role, minimum)) return <Navigate to="/" replace />
  return <Outlet />
}
