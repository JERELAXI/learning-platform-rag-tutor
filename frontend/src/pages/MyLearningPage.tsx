import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { listMyEnrollments, unenroll } from '../api/enrollments'
import type { EnrollmentRead } from '../api/types'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  ErrorState,
  ProgressBar,
  Spinner,
} from '../components/ui'
import { errorMessage, useApi } from '../hooks/useApi'

function formatPercent(progress: number): string {
  return `${String(Math.round(progress))}%`
}

export function MyLearningPage() {
  const fetchEnrollments = useCallback((signal: AbortSignal) => listMyEnrollments(signal), [])
  const { data, error, loading, reload } = useApi(fetchEnrollments)

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleUnenroll(enrollment: EnrollmentRead): Promise<void> {
    const title = enrollment.course_title ?? 'цей курс'
    if (!window.confirm(`Відписатися від «${title}»? Прогрес буде втрачено.`)) return

    setActionError(null)
    setPendingId(enrollment.id)
    try {
      await unenroll(enrollment.id)
      reload()
    } catch (caught) {
      setActionError(errorMessage(caught))
    } finally {
      setPendingId(null)
    }
  }

  if (error !== null) return <ErrorState message={error} onRetry={reload} />

  // Only the first load blanks the screen; a reload keeps the list in place.
  if (loading && data === null) {
    return (
      <div className="grid place-items-center py-16 text-ink-muted">
        <Spinner className="size-7" />
      </div>
    )
  }

  const enrollments = data ?? []

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Моє навчання</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Курси, на які ти записаний, і твій прогрес по кожному.
        </p>
      </header>

      {actionError !== null ? <ErrorBanner message={actionError} /> : null}

      {enrollments.length === 0 ? (
        <EmptyState
          title="Ти ще не записаний на жоден курс"
          note="Вибери курс у каталозі — перший урок відкриється одразу."
          action={
            <Link to="/courses">
              <Button variant="secondary">До каталогу</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {enrollments.map((enrollment) => (
            <Card key={enrollment.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold tracking-tight">
                    {enrollment.course_title ?? 'Курс видалено'}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Записано {new Date(enrollment.enrolled_at).toLocaleDateString('uk-UA')}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link to={`/courses/${enrollment.course_id}`}>
                    <Button variant="secondary">Продовжити</Button>
                  </Link>
                  <Button
                    variant="ghost"
                    loading={pendingId === enrollment.id}
                    onClick={() => void handleUnenroll(enrollment)}
                  >
                    Відписатися
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <ProgressBar percent={enrollment.progress} />
                <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-ink-soft">
                  {formatPercent(enrollment.progress)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
