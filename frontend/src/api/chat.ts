import { api } from './client'
import type {
  AskRequest,
  AskResponse,
  MessageRead,
  SessionCreate,
  SessionDetail,
  SessionRead,
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
