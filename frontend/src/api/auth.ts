import { api } from './client'
import { clearTokens, setTokens } from './tokens'
import type {
  ChangePasswordRequest,
  LoginRequest,
  TokenResponse,
  UserRead,
  UserRegister,
} from './types'

/** Registration does not return tokens — the caller logs in afterwards. */
export function register(payload: UserRegister): Promise<UserRead> {
  return api.post<UserRead>('/auth/register', payload, { anonymous: true })
}

/**
 * Uses `/auth/login-json` rather than `/auth/login`: the latter is the OAuth2
 * password flow and takes form-data with the email in a `username` field,
 * which exists so Swagger's Authorize button works.
 */
export async function login(payload: LoginRequest): Promise<TokenResponse> {
  const tokens = await api.post<TokenResponse>('/auth/login-json', payload, {
    anonymous: true,
  })
  setTokens(tokens)
  return tokens
}

export function getMe(): Promise<UserRead> {
  return api.get<UserRead>('/auth/me')
}

export async function logout(): Promise<void> {
  try {
    await api.post<{ detail: string }>('/auth/logout')
  } catch {
    // The server-side call is a no-op (there is no token blacklist), so a
    // network failure must not stop us from ending the session locally.
  }
  clearTokens()
}

export function changePassword(payload: ChangePasswordRequest): Promise<{ detail: string }> {
  return api.patch<{ detail: string }>('/auth/change-password', payload)
}
