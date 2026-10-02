import { api } from './client'
import type { QuizRead, ResultRead, SubmitRequest } from './types'

/**
 * Returns a different shape per role: the course owner and admins get
 * `correct_index` on every question, enrolled students do not. There is no
 * discriminator field — narrow with `isOwnerQuiz` from ./types.
 */
export function getQuiz(quizId: string, signal?: AbortSignal): Promise<QuizRead> {
  return api.get<QuizRead>(`/quizzes/${quizId}`, { signal })
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
