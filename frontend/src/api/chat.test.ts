import { afterEach, describe, expect, it, vi } from 'vitest'

import { askStream } from './chat'
import { ApiError } from './client'
import { setTokens } from './tokens'
import type { SourceRead } from './types'

/** Serves `chunks` as the response body, one read() per chunk. */
function stubStreamingFetch(chunks: string[], status = 200): void {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } }),
    ),
  )
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

const SOURCE: SourceRead = {
  id: 'c1',
  content: 'Хлорофіл — пігмент…',
  filename: 'lecture.txt',
  chunk_index: 0,
}

function collect() {
  const sources: SourceRead[][] = []
  const tokens: string[] = []
  const errors: string[] = []
  return {
    sources,
    tokens,
    errors,
    handlers: {
      onSources: (value: SourceRead[]) => sources.push(value),
      onToken: (value: string) => tokens.push(value),
      onError: (value: string) => errors.push(value),
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('askStream', () => {
  it('dispatches sources, then tokens, and ignores done', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' })
    stubStreamingFetch([
      frame('sources', { sources: [SOURCE] }),
      frame('token', { text: 'Подумай ' }),
      frame('token', { text: 'про це.' }),
      frame('done', {}),
    ])

    const sink = collect()
    await askStream('s1', 'Що це?', sink.handlers)

    expect(sink.sources).toEqual([[SOURCE]])
    expect(sink.tokens.join('')).toBe('Подумай про це.')
    expect(sink.errors).toEqual([])
  })

  it('reassembles a frame split across two chunks', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' })
    const whole = frame('token', { text: 'цілісний' })
    const cut = Math.floor(whole.length / 2)

    // A network read can land anywhere, including mid-JSON. Parsing each chunk
    // on its own would throw here.
    stubStreamingFetch([whole.slice(0, cut), whole.slice(cut), frame('done', {})])

    const sink = collect()
    await askStream('s1', 'Що це?', sink.handlers)

    expect(sink.tokens).toEqual(['цілісний'])
  })

  it('handles several frames arriving in one chunk', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' })
    stubStreamingFetch([
      frame('sources', { sources: [] }) + frame('token', { text: 'раз ' }) + frame('token', { text: 'два' }),
      frame('done', {}),
    ])

    const sink = collect()
    await askStream('s1', 'Що це?', sink.handlers)

    expect(sink.tokens.join('')).toBe('раз два')
  })

  it('reports an error frame without discarding the text before it', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' })
    stubStreamingFetch([
      frame('sources', { sources: [SOURCE] }),
      frame('token', { text: 'почалося' }),
      frame('error', { detail: 'Відповідь обірвалася.' }),
    ])

    const sink = collect()
    await askStream('s1', 'Що це?', sink.handlers)

    expect(sink.tokens).toEqual(['почалося'])
    expect(sink.errors).toEqual(['Відповідь обірвалася.'])
  })

  it('throws ApiError for a 4xx instead of opening a stream', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Not the session owner' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const sink = collect()
    // The backend authorizes before it starts the response, so a refusal is a
    // normal error body — not an error frame inside the stream.
    await expect(askStream('s1', 'Що це?', sink.handlers)).rejects.toMatchObject({
      status: 403,
      detail: 'Not the session owner',
    })
    expect(sink.tokens).toEqual([])
  })

  it('surfaces a thrown ApiError as an ApiError instance', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))

    const sink = collect()
    await expect(askStream('s1', 'Що це?', sink.handlers)).rejects.toBeInstanceOf(ApiError)
  })
})
