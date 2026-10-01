/**
 * HTTP transport for the backend API.
 *
 * Responsibilities kept here and nowhere else:
 *  - attach the Bearer access token
 *  - on 401, refresh once and replay the request (single-flight, so N parallel
 *    requests that all expire together trigger one refresh, not N)
 *  - turn FastAPI error bodies into a single readable `ApiError.detail`
 *  - normalise 204 into `void`
 *
 * Paths are passed in with their exact trailing slash (`/courses/` but
 * `/courses/{id}`). The backend declares some routes with a trailing slash and
 * answers 307 otherwise; the redirect would work same-origin, but relying on it
 * is noise in the network tab.
 */

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens'
import type { RefreshRequest, TokenResponse } from './types'

/** Dev requests are proxied by Vite, so this stays relative and same-origin. */
const BASE = '/api'

export class ApiError extends Error {
  // Written out rather than declared as constructor parameter properties:
  // the scaffold enables `erasableSyntaxOnly`, which forbids syntax that
  // emits code.
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

interface ValidationIssue {
  loc?: (string | number)[]
  msg?: string
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** FastAPI sends `{detail: string}`, or `{detail: [{loc, msg}]}` for a 422. */
function formatDetail(status: number, payload: unknown): string {
  if (typeof payload === 'string' && payload.length > 0) return payload

  if (payload !== null && typeof payload === 'object' && 'detail' in payload) {
    const { detail } = payload as { detail: unknown }

    if (typeof detail === 'string' && detail.length > 0) return detail

    if (Array.isArray(detail)) {
      const issues = (detail as ValidationIssue[])
        .map((issue) => {
          const field = (issue.loc ?? []).filter((part) => part !== 'body').join('.')
          const message = issue.msg ?? ''
          return field.length > 0 ? `${field}: ${message}` : message
        })
        .filter((line) => line.length > 0)
      if (issues.length > 0) return issues.join('; ')
    }
  }

  return `HTTP ${status}`
}

// ─── single-flight token refresh ──────────────────────────────────────────────

let inFlightRefresh: Promise<boolean> | null = null

async function requestNewTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (refreshToken === null) return false

  try {
    const response = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken } satisfies RefreshRequest),
    })
    if (!response.ok) return false
    setTokens((await response.json()) as TokenResponse)
    return true
  } catch {
    // Network failure — treat as "could not refresh" and let the caller 401.
    return false
  }
}

function refreshOnce(): Promise<boolean> {
  inFlightRefresh ??= requestNewTokens().finally(() => {
    inFlightRefresh = null
  })
  return inFlightRefresh
}

// ─── request pipeline ─────────────────────────────────────────────────────────

export interface RequestOptions {
  /** Send without a token and skip the refresh-and-replay step (login, register). */
  anonymous?: boolean
  signal?: AbortSignal
}

interface SendOptions extends RequestOptions {
  body?: unknown
}

function send(
  method: string,
  path: string,
  options: SendOptions,
  withAuth: boolean,
): Promise<Response> {
  const headers = new Headers()
  let body: BodyInit | undefined

  if (options.body instanceof FormData) {
    // Let the browser set the multipart boundary itself.
    body = options.body
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  if (withAuth) {
    const token = getAccessToken()
    if (token !== null) headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(`${BASE}${path}`, { method, headers, body, signal: options.signal })
}

async function request<T>(method: string, path: string, options: SendOptions = {}): Promise<T> {
  const withAuth = options.anonymous !== true
  let response = await send(method, path, options, withAuth)

  if (response.status === 401 && withAuth && (await refreshOnce())) {
    response = await send(method, path, options, true)
  }

  if (response.status === 401 && withAuth) {
    // Refresh was impossible or the replay still failed: the session is over.
    // Clearing notifies AuthContext, which routes back to the login screen.
    clearTokens()
  }

  if (!response.ok) {
    throw new ApiError(response.status, formatDetail(response.status, await readBody(response)))
  }

  if (response.status === 204) return undefined as T
  return (await readBody(response)) as T
}

export const api = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('GET', path, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('POST', path, { ...options, body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, { ...options, body }),

  delete: <T = void>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('DELETE', path, options),
}
