import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { createCourse, deleteCourse, listMyCourses, updateCourse } from '../api/courses'
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
import { errorMessage, useApi } from '../hooks/useApi'

function NewCourseForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Created as a draft on purpose: a course with no lessons has nothing to
      // offer, so publishing is a separate, deliberate step.
      await createCourse({ title, description: description || null, is_published: false })
      setTitle('')
      setDescription('')
      setOpen(false)
      onCreated()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => {
          setOpen(true)
        }}
      >
        Створити курс
      </Button>
    )
  }

  return (
    <Card className="w-full p-5">
      <h2 className="text-sm font-semibold tracking-tight">Новий курс</h2>
      <form className="mt-3 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
        {error !== null ? <ErrorBanner message={error} /> : null}

        <Field
          label="Назва"
          name="title"
          required
          maxLength={255}
          placeholder="Біологія: клітина"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <label className="block" htmlFor="course-description">
          <span className="mb-1.5 block text-sm font-medium text-ink">Опис</span>
          <textarea
            id="course-description"
            rows={3}
            placeholder="Про що цей курс"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        <div className="flex gap-2">
          <Button type="submit" loading={submitting} disabled={title.trim().length === 0}>
            Створити
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
          >
            Скасувати
          </Button>
        </div>
      </form>
    </Card>
  )
}

function CourseRow({
  course,
  onChanged,
  onError,
}: {
  course: CourseRead
  onChanged: () => void
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function togglePublished(): Promise<void> {
    setBusy(true)
    try {
      await updateCourse(course.id, { is_published: !course.is_published })
      onChanged()
    } catch (caught) {
      onError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (
      !window.confirm(
        `Видалити «${course.title}»? Разом із ним зникнуть уроки, матеріали та прогрес студентів.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await deleteCourse(course.id)
      onChanged()
    } catch (caught) {
      onError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold tracking-tight">{course.title}</h3>
            {course.is_published ? (
              <span className="rounded-full bg-done-soft px-2.5 py-0.5 text-xs font-medium text-done">
                опубліковано
              </span>
            ) : (
              <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                чернетка
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 max-w-xl text-sm text-ink-soft">
            {course.description ?? 'Без опису.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link to={`/courses/${course.id}`}>
            <Button variant="secondary">Уроки</Button>
          </Link>
          <Button variant="ghost" loading={busy} onClick={() => void togglePublished()}>
            {course.is_published ? 'Зняти з публікації' : 'Опублікувати'}
          </Button>
          <Button variant="ghost" loading={busy} onClick={() => void handleDelete()}>
            Видалити
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function TeachPage() {
  const fetchCourses = useCallback((signal: AbortSignal) => listMyCourses(signal), [])
  const courses = useApi(fetchCourses)
  const [actionError, setActionError] = useState<string | null>(null)

  if (courses.error !== null) {
    return <ErrorState message={courses.error} onRetry={courses.reload} />
  }
  if (courses.loading && courses.data === null) {
    return (
      <div className="grid place-items-center py-16 text-ink-muted">
        <Spinner className="size-7" />
      </div>
    )
  }

  const list = courses.data ?? []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Викладання</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Твої курси — чернетки та опубліковані. Студенти бачать лише
            опубліковані.
          </p>
        </div>
        <NewCourseForm onCreated={courses.reload} />
      </header>

      {actionError !== null ? <ErrorBanner message={actionError} /> : null}

      {list.length === 0 ? (
        <EmptyState
          title="Курсів ще немає"
          note="Створи курс, додай до нього уроки з матеріалами, і аж тоді публікуй."
        />
      ) : (
        <div className="space-y-3">
          {list.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              onChanged={courses.reload}
              onError={setActionError}
            />
          ))}
        </div>
      )}
    </div>
  )
}
