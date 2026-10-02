import { useOutletContext } from 'react-router-dom'

import type { CourseRead, LessonRead } from '../api/types'

/** What CoursePage hands to whatever renders inside it. Kept out of
 *  CoursePage.tsx so that file exports only components and Fast Refresh keeps
 *  working. */
export interface CourseOutletContext {
  course: CourseRead
  lessons: LessonRead[]
  /** Call after an action that changes lesson statuses (quiz pass, complete). */
  reloadLessons: () => void
}

export function useCourseContext(): CourseOutletContext {
  return useOutletContext<CourseOutletContext>()
}
