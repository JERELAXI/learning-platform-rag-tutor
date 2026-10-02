import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { hasRole } from '../api/types'
import type { UserRole } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { Button } from './ui'

interface NavItem {
  to: string
  label: string
  /** Minimum role; omitted means any signed-in user. */
  minimum?: UserRole
}

const NAV_ITEMS: NavItem[] = [
  { to: '/courses', label: 'Каталог' },
  { to: '/my', label: 'Моє навчання' },
  { to: '/teach', label: 'Викладання', minimum: 'teacher' },
  { to: '/admin/users', label: 'Користувачі', minimum: 'admin' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'студент',
  teacher: 'викладач',
  admin: 'адмін',
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((part) => part[0] ?? '').join('')
  return letters.toUpperCase() || '?'
}

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleLogout(): Promise<void> {
    setSigningOut(true)
    try {
      await logout()
      void navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.minimum === undefined || (user !== null && hasRole(user.role, item.minimum)),
  )

  return (
    <div className="flex min-h-dvh flex-col bg-canvas font-sans text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <NavLink to="/" className="mr-2 font-semibold tracking-tight whitespace-nowrap">
            Socratic
          </NavLink>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition ${
                    isActive
                      ? 'bg-brand-soft font-medium text-brand'
                      : 'text-ink-soft hover:bg-canvas hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user !== null ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-sm leading-tight font-medium">{user.full_name}</div>
                <div className="text-xs leading-tight text-ink-muted">
                  {ROLE_LABELS[user.role]}
                </div>
              </div>
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
              >
                {initials(user.full_name)}
              </span>
              <Button variant="ghost" loading={signingOut} onClick={() => void handleLogout()}>
                Вийти
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
