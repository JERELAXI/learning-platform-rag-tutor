import { api, openStream } from './client'
import type {
  AskRequest,
  AskResponse,
  MessageRead,
  SessionCreate,
  SessionDetail,
  SessionRead,
  SourceRead,
} from './types'

/**
 * Answers 403 when the student is not enrolled, or when the lesson is still
 * locked — the first of the two barriers against leaking future content. The
 * second is in retrieval, which only ever searches this lesson's chunks.
 */
export function createSession(payload: SessionCreate): Promise<SessionRead> {
  return api.post<SessionRead>('/chat/sessions', payload)
}

/** Every session of the current user, newest first, across all lessons. */
export function listSessions(signal?: AbortSignal): Promise<SessionRead[]> {
  return api.get<SessionRead[]>('/chat/sessions', { signal })
}

export function getSession(sessionId: string, signal?: AbortSignal): Promise<SessionDetail> {
  return api.get<SessionDetail>(`/chat/sessions/${sessionId}`, { signal })
}

export function listMessages(sessionId: string, signal?: AbortSignal): Promise<MessageRead[]> {
  return api.get<MessageRead[]>(`/chat/sessions/${sessionId}/messages`, { signal })
}

/**
 * Embeds the question, retrieves the top chunks of this lesson, and answers
 * from them. `sources` is empty when the tutor refused: either the lesson has
 * no processed materials, or nothing cleared the relevance threshold.
 */
export function ask(sessionId: string, payload: AskRequest): Promise<AskResponse> {
  return api.post<AskResponse>(`/chat/sessions/${sessionId}/ask`, payload)
}

export function deleteSession(sessionId: string): Promise<void> {
  return api.delete(`/chat/sessions/${sessionId}`)
}

export interface AskStreamHandlers {
  /** Citations arrive before the answer, so they can render while it loads. */
  onSources: (sources: SourceRead[]) => void
  onToken: (text: string) => void
  /** The stream broke part-way; whatever arrived before is still valid. */
  onError: (detail: string) => void
}

interface SourcesFrame {
  sources: SourceRead[]
}

interface TokenFrame {
  text: string
}

interface ErrorFrame {
  detail: string
}

/**
 * Reads the SSE stream from `/ask/stream`.
 *
 * Hand-parsed rather than using EventSource: that API is GET-only and cannot
 * carry an Authorization header, both of which this endpoint needs.
 */
export async function askStream(
  sessionId: string,
  question: string,
  handlers: AskStreamHandlers,
): Promise<void> {
  const stream = await openStream(`/chat/sessions/${sessionId}/ask/stream`, {
    question,
  } satisfies AskRequest)

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffered = ''

  const handleFrame = (block: string): void => {
    let name = ''
    let raw = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) name = line.slice('event: '.length)
      else if (line.startsWith('data: ')) raw = line.slice('data: '.length)
    }
    if (name === '' || raw === '') return

    const payload: unknown = JSON.parse(raw)
    if (name === 'sources') handlers.onSources((payload as SourcesFrame).sources)
    else if (name === 'token') handlers.onToken((payload as TokenFrame).text)
    else if (name === 'error') handlers.onError((payload as ErrorFrame).detail)
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffered += decoder.decode(value, { stream: true })
    // Frames are separated by a blank line; a chunk can split one in half, so
    // only complete frames are consumed and the remainder waits for more data.
    let boundary = buffered.indexOf('\n\n')
    while (boundary >= 0) {
      handleFrame(buffered.slice(0, boundary))
      buffered = buffered.slice(boundary + 2)
      boundary = buffered.indexOf('\n\n')
    }
  }
}
