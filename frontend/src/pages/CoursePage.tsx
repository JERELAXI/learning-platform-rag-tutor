import { useCallback } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'

import { getCourse, listLessons } from '../api/courses'
import type { LessonRead } from '../api/types'
import { BackIcon, CheckIcon, CurrentIcon, LockIcon } from '../components/icons'
import { Card, ErrorState, ProgressBar, Spinner } from '../components/ui'
import { useApi } from '../hooks/useApi'
import type { CourseOutletContext } from './courseContext'

function LessonStatusIcon({ status }: { status: LessonRead['status'] }) {
  if (status === 'completed') return <CheckIcon className="size-4 text-done" />
  if (status === 'locked') return <LockIcon className="size-4 text-ink-muted" />
  // `available`, or null for a teacher/admin who has no progress row.
  return <CurrentIcon className="size-4 text-brand" />
}

export function CoursePage() {
  const { courseId = '' } = useParams()

  const fetchCourse = useCallback(
    (signal: AbortSignal) => getCourse(courseId, signal),
    [courseId],
  )
  const fetchLessons = useCallback(
    (signal: AbortSignal) => listLessons(courseId, signal),
    [courseId],
  )

  const course = useApi(fetchCourse)
  const lessons = useApi(fetchLessons)

  if (course.error !== null) {
    return <ErrorState message={course.error} onRetry={course.reload} />
  }
  if (lessons.error !== null) {
    return <ErrorState message={lessons.error} onRetry={lessons.reload} />
  }
  if (course.data === null || lessons.data === null) {
    return (
      <div className="grid place-items-center py-16 text-ink-muted">
        <Spinner className="size-7" />
      </div>
    )
  }

  const lessonList = lessons.data
  // Progress is derived from the statuses already on screen rather than
  // fetched: it is the same completed/total the backend stores on Enrollment,
  // and one source on this screen cannot disagree with the other.
  const tracked = lessonList.filter((lesson) => lesson.status !== null)
  const completed = tracked.filter((lesson) => lesson.status === 'completed').length
  const percent = tracked.length > 0 ? (completed / tracked.length) * 100 : 0

  const context: CourseOutletContext = {
    course: course.data,
    lessons: lessonList,
    reloadLessons: lessons.reload,
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr] lg:items-start">
      <Card className="p-4 lg:sticky lg:top-20">
        <Link
          to="/my"
          className="inline-flex items-center gap-1 text-xs text-ink-muted transition hover:text-ink"
        >
          <BackIcon className="size-3.5" />
          Моє навчання
        </Link>

        <h2 className="mt-2 font-semibold tracking-tight">{course.data.title}</h2>

        {tracked.length > 0 ? (
          <div className="mt-3 flex items-center gap-2">
            <ProgressBar percent={percent} />
            <span className="shrink-0 text-xs font-medium tabular-nums text-ink-soft">
              {String(Math.round(percent))}%
            </span>
          </div>
        ) : null}

        <nav className="mt-4 space-y-0.5">
          {lessonList.map((lesson, index) => {
            const locked = lesson.status === 'locked'
            const label = (
              <>
                <LessonStatusIcon status={lesson.status} />
                <span className="w-4 shrink-0 text-xs tabular-nums text-ink-muted">
                  {String(index + 1)}
                </span>
                <span className="truncate">{lesson.title}</span>
              </>
            )

            if (locked) {
              return (
                <div
                  key={lesson.id}
                  aria-disabled="true"
                  title="Заверши попередній урок, щоб відкрити цей"
                  className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-muted"
                >
                  {label}
                </div>
              )
            }

            return (
              <NavLink
                key={lesson.id}
                to={`lessons/${lesson.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                    isActive
                      ? 'bg-brand-soft font-medium text-brand'
                      : 'text-ink-soft hover:bg-canvas hover:text-ink'
                  }`
                }
              >
                {label}
              </NavLink>
            )
          })}
        </nav>
      </Card>

      <Outlet context={context} />
    </div>
  )
}
