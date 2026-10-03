import { Navigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'

/** Sends each role to the screen it actually works on: an admin manages
 *  accounts, everyone else starts from the catalogue. */
export function HomeRedirect() {
  const { user } = useAuth()

  if (user?.role === 'admin') return <Navigate to="/admin/users" replace />
  return <Navigate to="/courses" replace />
}
