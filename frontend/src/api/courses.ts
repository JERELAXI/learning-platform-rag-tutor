import { api } from './client'
import type {
  CourseCreate,
  CourseRead,
  CourseUpdate,
  LessonCreate,
  LessonRead,
  LessonReorderItem,
  LessonUpdate,
} from './types'

export interface CourseFilters {
  published?: boolean
  search?: string
}

function buildQuery(filters: CourseFilters): string {
  const params = new URLSearchParams()
  if (filters.published !== undefined) params.set('published', String(filters.published))

  const search = filters.search?.trim() ?? ''
  if (search.length > 0) params.set('search', search)

  const queryString = params.toString()
  return queryString.length > 0 ? `?${queryString}` : ''
}

/** Note the trailing slash — the backend declares this route with one. */
export function listCourses(
  filters: CourseFilters = {},
  signal?: AbortSignal,
): Promise<CourseRead[]> {
  return api.get<CourseRead[]>(`/courses/${buildQuery(filters)}`, { signal })
}

export function getCourse(courseId: string, signal?: AbortSignal): Promise<CourseRead> {
  return api.get<CourseRead>(`/courses/${courseId}`, { signal })
}

/** Courses owned by the signed-in teacher, drafts included. Teacher+ only. */
export function listMyCourses(signal?: AbortSignal): Promise<CourseRead[]> {
  return api.get<CourseRead[]>('/courses/my', { signal })
}

export function createCourse(payload: CourseCreate): Promise<CourseRead> {
  return api.post<CourseRead>('/courses/', payload)
}

export function updateCourse(courseId: string, payload: CourseUpdate): Promise<CourseRead> {
  return api.patch<CourseRead>(`/courses/${courseId}`, payload)
}

/** Cascades to lessons, materials and their chunks. */
export function deleteCourse(courseId: string): Promise<void> {
  return api.delete(`/courses/${courseId}`)
}

/**
 * Titles, order and per-student `status`. The body of a locked lesson comes
 * back as `null` — read content through `getLesson`, which is the endpoint
 * that enforces the lock.
 */
export function listLessons(courseId: string, signal?: AbortSignal): Promise<LessonRead[]> {
  return api.get<LessonRead[]>(`/courses/${courseId}/lessons/`, { signal })
}

/** Answers 403 when the lesson is still locked for this student. */
export function getLesson(
  courseId: string,
  lessonId: string,
  signal?: AbortSignal,
): Promise<LessonRead> {
  return api.get<LessonRead>(`/courses/${courseId}/lessons/${lessonId}`, { signal })
}

/** Manual completion, allowed only for a lesson that has no quiz. */
export function completeLesson(courseId: string, lessonId: string): Promise<LessonRead> {
  return api.post<LessonRead>(`/courses/${courseId}/lessons/${lessonId}/complete`)
}

export function createLesson(courseId: string, payload: LessonCreate): Promise<LessonRead> {
  return api.post<LessonRead>(`/courses/${courseId}/lessons/`, payload)
}

export function updateLesson(
  courseId: string,
  lessonId: string,
  payload: LessonUpdate,
): Promise<LessonRead> {
  return api.patch<LessonRead>(`/courses/${courseId}/lessons/${lessonId}`, payload)
}

/** Cascades to the lesson's materials, chunks, quiz and progress rows. */
export function deleteLesson(courseId: string, lessonId: string): Promise<void> {
  return api.delete(`/courses/${courseId}/lessons/${lessonId}`)
}

/**
 * Bulk-sets `order`. Send every lesson of the course, not just the moved ones,
 * so the resulting sequence has no gaps or ties.
 *
 * Note the backend does not recompute LessonProgress afterwards: a student
 * mid-course can find a lesson that was `available` become logically locked
 * after a reshuffle. Accepted for the MVP — reorder before publishing.
 */
export function reorderLessons(
  courseId: string,
  items: LessonReorderItem[],
): Promise<LessonRead[]> {
  return api.patch<LessonRead[]>(`/courses/${courseId}/lessons/reorder`, items)
}
