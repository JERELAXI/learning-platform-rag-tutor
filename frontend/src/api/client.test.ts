import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api } from './client'
import { getAccessToken, hasTokens, setTokens } from './tokens'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function signIn(): void {
  setTokens({
    access_token: 'old-access',
    refresh_token: 'the-refresh',
    token_type: 'bearer',
  })
}

/** Reads the Authorization header off a recorded fetch call. */
function authHeaderOf(call: unknown[]): string | null {
  const init = call[1] as RequestInit | undefined
  const headers = init?.headers
  return headers instanceof Headers ? headers.get('Authorization') : null
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request pipeline', () => {
  it('attaches the access token and parses the body', async () => {
    signIn()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'u1' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.get<{ id: string }>('/auth/me')

    expect(result).toEqual({ id: 'u1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me')
    expect(authHeaderOf(fetchMock.mock.calls[0] ?? [])).toBe('Bearer old-access')
  })

  it('sends no token and never refreshes for an anonymous call', async () => {
    signIn()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'Invalid email or password' }))
    vi.stubGlobal('fetch', fetchMock)

    // A failed login must not be mistaken for an expired session: refreshing
    // there would log out whoever is already signed in.
    await expect(
      api.post('/auth/login-json', { email: 'a@b.com', password: 'nope' }, { anonymous: true }),
    ).rejects.toThrow(ApiError)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(authHeaderOf(fetchMock.mock.calls[0] ?? [])).toBeNull()
    expect(hasTokens()).toBe(true)
  })

  it('returns undefined for 204 instead of failing to parse', async () => {
    signIn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(api.delete('/enrollments/e1')).resolves.toBeUndefined()
  })

  it('leaves Content-Type to the browser for FormData', async () => {
    signIn()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(202, { id: 'm1' }))
    vi.stubGlobal('fetch', fetchMock)

    const body = new FormData()
    body.append('file', new File(['x'], 'a.txt'))
    await api.post('/lessons/l1/materials/', body)

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Headers).get('Content-Type')).toBeNull()
    expect(init.body).toBe(body)
  })
})

describe('error detail', () => {
  it('uses the string form FastAPI sends for HTTPException', async () => {
    signIn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(403, { detail: 'Not the course owner' })),
    )

    await expect(api.get('/courses/c1')).rejects.toMatchObject({
      status: 403,
      detail: 'Not the course owner',
    })
  })

  it('joins the field messages of a 422 validation array', async () => {
    signIn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(422, {
          detail: [
            { loc: ['body', 'email'], msg: 'An email address must have an @-sign.' },
            { loc: ['body', 'password'], msg: 'Field required' },
          ],
        }),
      ),
    )

    await expect(api.post('/auth/register', {})).rejects.toMatchObject({
      status: 422,
      detail: 'email: An email address must have an @-sign.; password: Field required',
    })
  })

  it('falls back to the status when the body carries no detail', async () => {
    signIn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))

    await expect(api.get('/courses/')).rejects.toMatchObject({ detail: 'HTTP 500' })
  })
})

describe('401 handling', () => {
  it('refreshes once and replays the original request', async () => {
    signIn()
    const fetchMock = vi
      .fn()
      // 1. the original request, with the stale token
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Could not validate credentials' }))
      // 2. the refresh
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
        }),
      )
      // 3. the replay
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u1' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get<{ id: string }>('/auth/me')).resolves.toEqual({ id: 'u1' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/refresh')
    // The replay must carry the token the refresh produced, not the stale one.
    expect(authHeaderOf(fetchMock.mock.calls[2] ?? [])).toBe('Bearer new-access')
    expect(getAccessToken()).toBe('new-access')
  })

  it('refreshes only once for several requests that expire together', async () => {
    signIn()
    let refreshes = 0
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1
        return Promise.resolve(
          jsonResponse(200, {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            token_type: 'bearer',
          }),
        )
      }
      // Anything still presenting the stale token is rejected.
      return Promise.resolve(
        getAccessToken() === 'old-access'
          ? jsonResponse(401, { detail: 'Could not validate credentials' })
          : jsonResponse(200, { ok: true }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([
      api.get('/courses/'),
      api.get('/enrollments/my'),
      api.get('/chat/sessions'),
      api.get('/quizzes/my-results'),
      api.get('/auth/me'),
    ])

    expect(results).toHaveLength(5)
    // Five simultaneous 401s, one trip to /auth/refresh — the point of the
    // single-flight guard.
    expect(refreshes).toBe(1)
  })

  it('clears the session when the refresh itself is rejected', async () => {
    signIn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Could not validate credentials' }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Invalid refresh token' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 })

    // Cleared tokens are what tells AuthContext to drop back to the login screen.
    expect(hasTokens()).toBe(false)
  })

  it('does not attempt a refresh when there is no refresh token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { detail: 'Could not validate credentials' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
