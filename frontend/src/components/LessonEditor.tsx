import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createLesson,
  deleteLesson,
  reorderLessons,
  updateLesson,
} from '../api/courses'
import type { LessonRead } from '../api/types'
import { errorMessage } from '../hooks/useApi'
import { DownIcon, UpIcon } from './icons'
import { Button, Card, ErrorBanner, Field } from './ui'

const TEXTAREA_CLASSES =
  'w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20'

function EditLessonForm({
  courseId,
  lesson,
  onDone,
  onError,
}: {
  courseId: string
  lesson: LessonRead
  onDone: () => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState(lesson.title)
  const [content, setContent] = useState(lesson.content ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    try {
      await updateLesson(courseId, lesson.id, { title, content: content || null })
      onDone()
    } catch (caught) {
      onError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="mt-3 space-y-3" onSubmit={(event) => void handleSave(event)}>
      <Field
        label="Назва уроку"
        name={`title-${lesson.id}`}
        required
        maxLength={255}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label className="block" htmlFor={`content-${lesson.id}`}>
        <span className="mb-1.5 block text-sm font-medium text-ink">Зміст</span>
        <textarea
          id={`content-${lesson.id}`}
          rows={6}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className={TEXTAREA_CLASSES}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" loading={saving} disabled={title.trim().length === 0}>
          Зберегти
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Скасувати
        </Button>
      </div>
    </form>
  )
}

function NewLessonForm({
  courseId,
  nextOrder,
  onCreated,
  onError,
}: {
  courseId: string
  nextOrder: number
  onCreated: () => void
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    try {
      await createLesson(courseId, { title, content: content || null, order: nextOrder })
      setTitle('')
      setContent('')
      setOpen(false)
      onCreated()
    } catch (caught) {
      onError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true)
        }}
      >
        Додати урок
      </Button>
    )
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-line p-4"
      onSubmit={(event) => void handleCreate(event)}
    >
      <Field
        label="Назва уроку"
        name="new-lesson-title"
        required
        maxLength={255}
        placeholder="Фотосинтез"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label className="block" htmlFor="new-lesson-content">
        <span className="mb-1.5 block text-sm font-medium text-ink">Зміст</span>
        <textarea
          id="new-lesson-content"
          rows={5}
          placeholder="Текст уроку, який побачить студент"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className={TEXTAREA_CLASSES}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" loading={saving} disabled={title.trim().length === 0}>
          Створити
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false)
          }}
        >
          Скасувати
        </Button>
      </div>
    </form>
  )
}

/** Owner-only lesson management: add, edit, reorder, delete. */
export function LessonEditor({
  courseId,
  lessons,
  onChanged,
}: {
  courseId: string
  lessons: LessonRead[]
  onChanged: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction
    if (target < 0 || target >= lessons.length) return

    // Swap, then renumber the whole list from 0 so the sequence never develops
    // gaps or ties — the backend takes order values verbatim.
    const reordered = [...lessons]
    const moved = reordered[index]
    const displaced = reordered[target]
    if (moved === undefined || displaced === undefined) return
    reordered[index] = displaced
    reordered[target] = moved

    setError(null)
    setBusy(true)
    try {
      await reorderLessons(
        courseId,
        reordered.map((lesson, position) => ({ lesson_id: lesson.id, order: position })),
      )
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(lesson: LessonRead): Promise<void> {
    if (
      !window.confirm(
        `Видалити урок «${lesson.title}»? Разом із ним зникнуть його матеріали, квіз і прогрес студентів.`,
      )
    ) {
      return
    }
    setError(null)
    setBusy(true)
    try {
      await deleteLesson(courseId, lesson.id)
      onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Уроки курсу</h2>
          <p className="mt-1 max-w-md text-xs text-ink-muted">
            Порядок визначає, у якій послідовності студент їх відкриває. Зміна
            порядку не перераховує вже наявний прогрес — краще впорядкувати
            курс до публікації.
          </p>
        </div>
        <NewLessonForm
          courseId={courseId}
          nextOrder={lessons.length}
          onCreated={onChanged}
          onError={setError}
        />
      </div>

      {error !== null ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {lessons.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Уроків ще немає. Додай перший — студенти побачать курс лише з уроками.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {lessons.map((lesson, index) => (
            <li key={lesson.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-5 shrink-0 text-xs tabular-nums text-ink-muted">
                  {String(index + 1)}
                </span>

                <Link
                  to={`lessons/${lesson.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand"
                >
                  {lesson.title}
                </Link>

                {lesson.quiz_id !== null ? (
                  <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                    є квіз
                  </span>
                ) : null}

                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label="Вище"
                    disabled={busy || index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    <UpIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label="Нижче"
                    disabled={busy || index === lessons.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <DownIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingId(editingId === lesson.id ? null : lesson.id)
                    }}
                  >
                    {editingId === lesson.id ? 'Згорнути' : 'Редагувати'}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void handleDelete(lesson)}>
                    Видалити
                  </Button>
                </div>
              </div>

              {editingId === lesson.id ? (
                <EditLessonForm
                  courseId={courseId}
                  lesson={lesson}
                  onError={setError}
                  onDone={() => {
                    setEditingId(null)
                    onChanged()
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
