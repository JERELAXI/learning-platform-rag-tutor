import { api } from './client'
import type {
  QuizGenerate,
  QuizRead,
  QuizReadOwner,
  QuizUpdate,
  ResultRead,
  SubmitRequest,
} from './types'

/**
 * Feeds every ready chunk of the lesson to the LLM and asks for N questions in
 * strict JSON. Answers 400 when the lesson has no processed materials, and 400
 * again when a quiz already exists — there is one canonical quiz per lesson.
 */
export function generateQuiz(payload: QuizGenerate): Promise<QuizReadOwner> {
  return api.post<QuizReadOwner>('/quizzes/generate', payload)
}

/**
 * Returns a different shape per role: the course owner and admins get
 * `correct_index` on every question, enrolled students do not. There is no
 * discriminator field — narrow with `isOwnerQuiz` from ./types.
 */
export function getQuiz(quizId: string, signal?: AbortSignal): Promise<QuizRead> {
  return api.get<QuizRead>(`/quizzes/${quizId}`, { signal })
}

/**
 * Owner only. `questions` replaces the whole list — there is no per-question
 * patch — so send every question, edited or not. Each one must carry exactly
 * four options and a `correct_index` in 0–3, or the request is rejected.
 */
export function updateQuiz(quizId: string, payload: QuizUpdate): Promise<QuizReadOwner> {
  return api.patch<QuizReadOwner>(`/quizzes/${quizId}`, payload)
}

/**
 * Scores server-side. When the score clears `pass_threshold` the lesson is
 * marked completed and the next one unlocks, which `lesson_completed` reports.
 */
export function submitQuiz(quizId: string, payload: SubmitRequest): Promise<ResultRead> {
  return api.post<ResultRead>(`/quizzes/${quizId}/submit`, payload)
}

export function listMyResults(signal?: AbortSignal): Promise<ResultRead[]> {
  return api.get<ResultRead[]>('/quizzes/my-results', { signal })
}
