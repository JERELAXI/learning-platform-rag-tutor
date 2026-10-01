import { api } from './client'
import type { CourseRead } from './types'

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
