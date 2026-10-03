import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import { useApi } from './useApi'

describe('useApi', () => {
  it('starts in loading and resolves to data', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a', 'b'])
    const { result } = renderHook(() => useApi(fetcher))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.data).toEqual(['a', 'b'])
    expect(result.current.error).toBeNull()
  })

  it('surfaces the ApiError detail rather than a generic message', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ApiError(403, 'Not the course owner'))
    const { result } = renderHook(() => useApi(fetcher))

    await waitFor(() => {
      expect(result.current.error).toBe('Not the course owner')
    })
    expect(result.current.data).toBeNull()
  })

  it('reports a network failure in words a user can act on', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useApi(fetcher))

    await waitFor(() => {
      expect(result.current.error).toContain('бекенд')
    })
  })

  it('refetches on reload', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(['first']).mockResolvedValueOnce(['second'])
    const { result } = renderHook(() => useApi(fetcher))

    await waitFor(() => {
      expect(result.current.data).toEqual(['first'])
    })

    act(() => {
      result.current.reload()
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(['second'])
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps the previous data while refetching', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(['first']).mockImplementationOnce(
      () => new Promise(() => undefined), // never settles
    )
    const { result } = renderHook(() => useApi(fetcher))

    await waitFor(() => {
      expect(result.current.data).toEqual(['first'])
    })

    act(() => {
      result.current.reload()
    })

    // Search results should swap in place, not blink away behind a spinner.
    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })
    expect(result.current.data).toEqual(['first'])
  })

  it('aborts the in-flight request when the fetcher changes', async () => {
    const signals: AbortSignal[] = []
    const first = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<string[]>(() => undefined)
    })
    const second = vi.fn().mockResolvedValue(['done'])

    const { result, rerender } = renderHook(({ fetcher }) => useApi(fetcher), {
      initialProps: { fetcher: first as (signal: AbortSignal) => Promise<string[]> },
    })

    expect(signals[0]?.aborted).toBe(false)

    rerender({ fetcher: second as (signal: AbortSignal) => Promise<string[]> })

    // Typing in a search box must not leave the old request to win a race.
    expect(signals[0]?.aborted).toBe(true)
    await waitFor(() => {
      expect(result.current.data).toEqual(['done'])
    })
  })

  it('ignores a rejection caused by its own abort', async () => {
    const first = vi.fn(
      (signal: AbortSignal) =>
        new Promise<string[]>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )
    const second = vi.fn().mockResolvedValue(['done'])

    const { result, rerender } = renderHook(({ fetcher }) => useApi(fetcher), {
      initialProps: { fetcher: first as (signal: AbortSignal) => Promise<string[]> },
    })

    rerender({ fetcher: second as (signal: AbortSignal) => Promise<string[]> })

    await waitFor(() => {
      expect(result.current.data).toEqual(['done'])
    })
    // An abort is our own doing, so it must never surface as an error banner.
    expect(result.current.error).toBeNull()
  })
})
