import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../api/client'

/** Turns anything thrown by the client into something worth showing a user. */
export function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError) return caught.detail
  return 'Не вдалося зв’язатися з сервером. Перевір, чи запущений бекенд.'
}

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  /** Re-runs the fetcher — call after a mutation that changes this data. */
  reload: () => void
}

interface State<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Minimal data fetching: load on mount, abort on unmount or re-run, expose a
 * manual reload. Deliberately not a cache — the places needing invalidation
 * are few (quiz submit, lesson complete, material polling), so an explicit
 * `reload()` is easier to follow than a query library's cache keys.
 *
 * `fetcher` must be stable: wrap it in `useCallback` over the values it closes
 * over, otherwise every render refetches.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>): AsyncState<T> {
  const [reloadCount, setReloadCount] = useState(0)
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true })

  // Which (fetcher, reloadCount) pair `state` describes. When that pair
  // changes, flip back to loading *during render* instead of inside the
  // effect: a setState in the effect would queue a second render pass on
  // every single request. This is React's documented "adjusting state when
  // props change" pattern. Previous `data` is kept so a re-search swaps the
  // list in place rather than flashing a spinner over it.
  const [requestedFor, setRequestedFor] = useState({ fetcher, reloadCount })
  if (requestedFor.fetcher !== fetcher || requestedFor.reloadCount !== reloadCount) {
    setRequestedFor({ fetcher, reloadCount })
    setState((previous) => ({ data: previous.data, error: null, loading: true }))
  }

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    fetcher(controller.signal)
      .then((result) => {
        if (cancelled) return
        setState({ data: result, error: null, loading: false })
      })
      .catch((caught: unknown) => {
        // An abort is our own doing (unmount, or the fetcher changed), not a
        // failure worth reporting.
        if (cancelled || controller.signal.aborted) return
        setState({ data: null, error: errorMessage(caught), loading: false })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fetcher, reloadCount])

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1)
  }, [])

  return { ...state, reload }
}

/**
 * Runs `tick` on an interval while `active` is true, and stops as soon as it
 * turns false. Used to follow material processing: upload answers 202 and a
 * Celery worker finishes the job, so the only way to learn the outcome is to
 * keep asking.
 */
export function usePollingWhile(active: boolean, tick: () => void, intervalMs = 3000): void {
  useEffect(() => {
    if (!active) return
    const timer = setInterval(tick, intervalMs)
    return () => {
      clearInterval(timer)
    }
  }, [active, tick, intervalMs])
}

/** Delays a fast-changing value — so typing in a search box does not fire a
 *  request per keystroke. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])

  return debounced
}
