import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { UserRead, UserRole } from '../api/types'
import { AuthContext } from './context'
import type { AuthStatus, AuthValue } from './context'
import { RequireAuth, RequireRole } from './guards'

function makeUser(role: UserRole): UserRead {
  return {
    id: 'u1',
    email: `${role}@example.com`,
    full_name: 'Test User',
    role,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function withAuth(status: AuthStatus, user: UserRead | null, children: ReactNode) {
  const value: AuthValue = {
    user,
    status,
    login: () => Promise.resolve(),
    register: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Mounts the guard at /teach with recognisable stand-ins for every landing. */
function renderGuarded(
  guard: ReactNode,
  status: AuthStatus,
  user: UserRead | null,
  startAt = '/teach',
) {
  return render(
    withAuth(
      status,
      user,
      <MemoryRouter initialEntries={[startAt]}>
        <Routes>
          <Route path="/login" element={<p>LOGIN SCREEN</p>} />
          <Route path="/" element={<p>HOME SCREEN</p>} />
          <Route element={guard}>
            <Route path="/teach" element={<p>PROTECTED SCREEN</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  )
}

describe('RequireAuth', () => {
  it('sends an anonymous visitor to the login screen', () => {
    renderGuarded(<RequireAuth />, 'anonymous', null)

    expect(screen.getByText('LOGIN SCREEN')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED SCREEN')).not.toBeInTheDocument()
  })

  it('waits while the stored token is being verified', () => {
    // Without this third state, reloading a deep link would bounce the user to
    // /login for the duration of the /auth/me call.
    renderGuarded(<RequireAuth />, 'loading', null)

    expect(screen.queryByText('LOGIN SCREEN')).not.toBeInTheDocument()
    expect(screen.queryByText('PROTECTED SCREEN')).not.toBeInTheDocument()
    expect(screen.getByText('Завантаження')).toBeInTheDocument()
  })

  it('lets an authenticated user through', () => {
    renderGuarded(<RequireAuth />, 'authenticated', makeUser('student'))

    expect(screen.getByText('PROTECTED SCREEN')).toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  it('turns a student away from a teacher-only route', () => {
    renderGuarded(<RequireRole minimum="teacher" />, 'authenticated', makeUser('student'))

    expect(screen.getByText('HOME SCREEN')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED SCREEN')).not.toBeInTheDocument()
  })

  it('admits a teacher to a teacher-only route', () => {
    renderGuarded(<RequireRole minimum="teacher" />, 'authenticated', makeUser('teacher'))

    expect(screen.getByText('PROTECTED SCREEN')).toBeInTheDocument()
  })

  it('admits an admin to a teacher-only route, since admin outranks teacher', () => {
    renderGuarded(<RequireRole minimum="teacher" />, 'authenticated', makeUser('admin'))

    expect(screen.getByText('PROTECTED SCREEN')).toBeInTheDocument()
  })

  it('turns a teacher away from an admin-only route', () => {
    renderGuarded(<RequireRole minimum="admin" />, 'authenticated', makeUser('teacher'))

    expect(screen.getByText('HOME SCREEN')).toBeInTheDocument()
  })

  it('sends a visitor with no user to the login screen', () => {
    renderGuarded(<RequireRole minimum="teacher" />, 'anonymous', null)

    expect(screen.getByText('LOGIN SCREEN')).toBeInTheDocument()
  })
})
