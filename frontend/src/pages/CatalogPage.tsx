import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { listCourses } from '../api/courses'
import { enroll, listMyEnrollments } from '../api/enrollments'
import type { CourseRead } from '../api/types'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Field,
  Spinner,
} from '../components/ui'
import { errorMessage, useApi, useDebounced } from '../hooks/useApi'

export function CatalogPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)

  // Only published courses are enrollable, so there is no reason to list drafts.
  const fetchCourses = useCallback(
    (signal: AbortSignal) => listCourses({ published: true, search: debouncedSearch }, signal),
    [debouncedSearch],
  )
  const courses = useApi(fetchCourses)

  // Needed to tell "Записатися" apart from "вже записаний" per card.
  const fetchEnrollments = useCallback((signal: AbortSignal) => listMyEnrollments(signal), [])
  const enrollments = useApi(fetchEnrollments)

  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const enrolledCourseIds = new Set((enrollments.data ?? []).map((item) => item.course_id))

  async function handleEnroll(course: CourseRead): Promise<void> {
    setEnrollError(null)
    setPendingCourseId(course.id)
    try {
      await enroll({ course_id: course.id })
      enrollments.reload()
    } catch (caught) {
      setEnrollError(errorMessage(caught))
    } finally {
      setPendingCourseId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Каталог курсів</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Опубліковані курси, доступні для запису.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Field
            label="Пошук"
            name="search"
            type="search"
            placeholder="Назва курсу"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </header>

      {enrollError !== null ? <ErrorBanner message={enrollError} /> : null}

      {courses.error !== null ? (
        <ErrorState message={courses.error} onRetry={courses.reload} />
      ) : courses.loading && courses.data === null ? (
        <div className="grid place-items-center py-16 text-ink-muted">
          <Spinner className="size-7" />
        </div>
      ) : (courses.data ?? []).length === 0 ? (
        <EmptyState
          title={search.trim().length > 0 ? 'Нічого не знайдено' : 'Курсів поки немає'}
          note={
            search.trim().length > 0
              ? 'Спробуй інший запит або очисти пошук.'
              : 'Коли викладач опублікує курс, він зʼявиться тут.'
          }
        />
      ) : (
        <div
          className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${
            courses.loading ? 'opacity-60' : ''
          }`}
        >
          {(courses.data ?? []).map((course) => {
            const alreadyEnrolled = enrolledCourseIds.has(course.id)
            return (
              <Card key={course.id} className="flex flex-col p-5">
                <h2 className="font-semibold tracking-tight">{course.title}</h2>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-ink-soft">
                  {course.description ?? 'Без опису.'}
                </p>

                <div className="mt-4">
                  {alreadyEnrolled ? (
                    <Link
                      to={`/courses/${course.id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                    >
                      Перейти до курсу →
                    </Link>
                  ) : (
                    <Button
                      className="w-full"
                      loading={pendingCourseId === course.id}
                      disabled={enrollments.loading}
                      onClick={() => void handleEnroll(course)}
                    >
                      Записатися
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
