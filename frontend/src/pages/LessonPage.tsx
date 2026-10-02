import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { completeLesson, getLesson } from '../api/courses'
import { listMaterials } from '../api/materials'
import { isMaterialInFlight } from '../api/types'
import type { MaterialRead, MaterialStatus } from '../api/types'
import { FileIcon, SparkIcon } from '../components/icons'
import {
  Button,
  Card,
  ErrorBanner,
  ErrorState,
  Spinner,
} from '../components/ui'
import { errorMessage, useApi } from '../hooks/useApi'
import { useCourseContext } from './courseContext'

const MATERIAL_LABELS: Record<MaterialStatus, string> = {
  pending: 'у черзі',
  processing: 'обробляється',
  ready: 'готово',
  error: 'помилка',
}

const MATERIAL_TONES: Record<MaterialStatus, string> = {
  pending: 'text-ink-muted',
  processing: 'text-brand',
  ready: 'text-done',
  error: 'text-danger',
}

function MaterialRow({ material }: { material: MaterialRead }) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <FileIcon className="size-4 shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1 truncate text-sm">{material.filename}</span>
      <span
        className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${MATERIAL_TONES[material.status]}`}
      >
        {isMaterialInFlight(material.status) ? <Spinner className="size-3" /> : null}
        {MATERIAL_LABELS[material.status]}
      </span>
    </li>
  )
}

export function LessonPage() {
  const { courseId = '', lessonId = '' } = useParams()
  const { reloadLessons } = useCourseContext()

  // Fetched on its own rather than taken from the sidebar list: this is the
  // endpoint that enforces the lock, so going through it means the UI cannot
  // show a body the server would have refused.
  const fetchLesson = useCallback(
    (signal: AbortSignal) => getLesson(courseId, lessonId, signal),
    [courseId, lessonId],
  )
  const lesson = useApi(fetchLesson)

  const fetchMaterials = useCallback(
    (signal: AbortSignal) => listMaterials(lessonId, signal),
    [lessonId],
  )
  const materials = useApi(fetchMaterials)

  const [completing, setCompleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleComplete(): Promise<void> {
    setActionError(null)
    setCompleting(true)
    try {
      await completeLesson(courseId, lessonId)
      // Statuses moved server-side: this lesson is completed and the next one
      // unlocked, so both the sidebar and this pane are stale.
      reloadLessons()
      lesson.reload()
    } catch (caught) {
      setActionError(errorMessage(caught))
    } finally {
      setCompleting(false)
    }
  }

  if (lesson.error !== null) {
    return <ErrorState message={lesson.error} onRetry={lesson.reload} />
  }
  if (lesson.data === null) {
    return (
      <div className="grid place-items-center py-16 text-ink-muted">
        <Spinner className="size-7" />
      </div>
    )
  }

  const current = lesson.data
  const isStudent = current.status !== null
  const hasQuiz = current.quiz_id !== null
  const materialList = materials.data ?? []

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      {/* Left: the lesson itself */}
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{current.title}</h1>
            {current.status === 'completed' ? (
              <span className="rounded-full bg-done-soft px-3 py-1 text-xs font-medium text-done">
                завершено
              </span>
            ) : null}
          </div>

          <div className="mt-4 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
            {current.content ?? 'У цього уроку поки немає текстового змісту.'}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold tracking-tight">Матеріали уроку</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Саме з цих файлів AI-репетитор бере відповіді.
          </p>

          {materials.error !== null ? (
            <p className="mt-3 text-sm text-danger">{materials.error}</p>
          ) : materials.loading && materials.data === null ? (
            <div className="py-4">
              <Spinner className="size-4 text-ink-muted" />
            </div>
          ) : materialList.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Викладач ще не завантажив матеріали — репетитору поки нема на що
              опиратися.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {materialList.map((material) => (
                <MaterialRow key={material.id} material={material} />
              ))}
            </ul>
          )}
        </Card>

        {isStudent ? (
          <Card className="p-5">
            {actionError !== null ? (
              <div className="mb-3">
                <ErrorBanner message={actionError} />
              </div>
            ) : null}

            {hasQuiz ? (
              <>
                <h2 className="text-sm font-semibold tracking-tight">Перевірка знань</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Щоб завершити урок і відкрити наступний, склади квіз.
                </p>
                <Link to="quiz" className="mt-3 inline-block">
                  <Button>
                    {current.status === 'completed' ? 'Пройти квіз ще раз' : 'Пройти квіз'}
                  </Button>
                </Link>
              </>
            ) : current.status === 'completed' ? (
              <p className="text-sm text-ink-soft">
                Урок завершено. Наступний уже відкритий у списку ліворуч.
              </p>
            ) : (
              <>
                <h2 className="text-sm font-semibold tracking-tight">Завершення уроку</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  У цього уроку немає квіза — познач його завершеним, щоб відкрити
                  наступний.
                </p>
                <Button
                  className="mt-3"
                  loading={completing}
                  onClick={() => void handleComplete()}
                >
                  Позначити завершеним
                </Button>
              </>
            )}
          </Card>
        ) : null}
      </div>

      {/* Right: the tutor. Filled in by the next step; the column exists now so
          the split layout is settled and the lesson does not reflow later. */}
      <Card className="flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center xl:sticky xl:top-20">
        <SparkIcon className="size-6 text-brand" />
        <h2 className="text-sm font-semibold tracking-tight">AI-репетитор</h2>
        <p className="max-w-56 text-xs text-ink-muted">
          Чат із цитатами з матеріалів уроку — наступний крок.
        </p>
      </Card>
    </div>
  )
}
