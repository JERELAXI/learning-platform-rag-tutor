import { api } from './client'
import type { EnrollmentCreate, EnrollmentRead } from './types'

/** Also seeds LessonProgress server-side: the first lesson becomes
 *  `available`, the rest `locked`. */
export function enroll(payload: EnrollmentCreate): Promise<EnrollmentRead> {
  return api.post<EnrollmentRead>('/enrollments/', payload)
}

/** Each row carries a freshly recalculated `progress` and the course title. */
export function listMyEnrollments(signal?: AbortSignal): Promise<EnrollmentRead[]> {
  return api.get<EnrollmentRead[]>('/enrollments/my', { signal })
}

export function unenroll(enrollmentId: string): Promise<void> {
  return api.delete(`/enrollments/${enrollmentId}`)
}
