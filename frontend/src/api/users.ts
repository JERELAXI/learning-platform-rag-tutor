import { api } from './client'
import type { UserRead, UserRole } from './types'

export interface UserPage {
  limit: number
  offset: number
}

/**
 * Admin only. The endpoint returns a plain array with no total count, so a
 * caller can only tell "there may be more" from getting a full page back.
 */
export function listUsers(page: UserPage, signal?: AbortSignal): Promise<UserRead[]> {
  const params = new URLSearchParams({
    limit: String(page.limit),
    offset: String(page.offset),
  })
  return api.get<UserRead[]>(`/users/?${params.toString()}`, { signal })
}

export function updateUserRole(userId: string, role: UserRole): Promise<UserRead> {
  return api.patch<UserRead>(`/users/${userId}/role`, { role })
}

/** Blocks sign-in. Refuses to deactivate the caller themselves (400). */
export function deactivateUser(userId: string): Promise<UserRead> {
  return api.patch<UserRead>(`/users/${userId}/deactivate`)
}

/** Restores access after a deactivation. Idempotent. */
export function activateUser(userId: string): Promise<UserRead> {
  return api.patch<UserRead>(`/users/${userId}/activate`)
}
