import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getQuiz, submitQuiz } from '../api/quizzes'
import { isOwnerQuiz } from '../api/types'
import type { QuizRead, ResultRead } from '../api/types'
import { BackIcon, CheckIcon } from '../components/icons'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Spinner,
} from '../components/ui'
import { errorMessage, useApi } from '../hooks/useApi'
import { useCourseContext } from './courseContext'

function ResultCard({
  result,
  threshold,
  onRetry,
  lessonHref,
}: {
  result: ResultRead
  threshold: number
  onRetry: () => void
  lessonHref: string
}) {
  return (
    <Card className="p-6 text-center">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Результат</p>
      <p
        className={`mt-1 text-4xl font-semibold tabular-nums ${
          result.passed ? 'text-done' : 'text-danger'
        }`}
      >
        {String(Math.round(result.score))}%
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Проходження від {String(Math.round(threshold))}%
      </p>

      <div className="mt-4">
        {result.passed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-done-soft px-3 py-1 text-sm font-medium text-done">
            <CheckIcon className="size-4" />
            Квіз складено
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-danger-soft px-3 py-1 text-sm font-medium text-danger">
            Не склав — спробуй ще раз
          </span>
        )}
      </div>

      {result.lesson_completed ? (
        <p className="mt-3 text-sm text-ink-soft">
          Урок завершено, наступний уже відкритий у списку ліворуч.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to={lessonHref}>
          <Button variant="secondary">Повернутися до уроку</Button>
        </Link>
        <Button variant="ghost" onClick={onRetry}>
          Пройти ще раз
        </Button>
      </div>
    </Card>
  )
}

export function QuizPage() {
  const { courseId = '', lessonId = '' } = useParams()
  const { lessons, reloadLessons } = useCourseContext()
  const lessonHref = `/courses/${courseId}/lessons/${lessonId}`

  const lesson = lessons.find((item) => item.id === lessonId) ?? null
  const quizId = lesson?.quiz_id ?? null

  const fetchQuiz = useCallback(
    (signal: AbortSignal): Promise<QuizRead | null> =>
      quizId === null ? Promise.resolve(null) : getQuiz(quizId, signal),
    [quizId],
  )
  const quiz = useApi(fetchQuiz)

  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [result, setResult] = useState<ResultRead | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetAttempt(): void {
    setResult(null)
    setAnswers([])
    setError(null)
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (quiz.data === null || quizId === null) return

    // The backend rejects a partial submission, so block it here with a clearer
    // message than a 422 would give.
    const filled = answers.filter((answer) => answer !== null).length
    if (filled < quiz.data.questions.length) {
      setError(
        `Відповіси на всі питання: ${String(filled)} із ${String(quiz.data.questions.length)}.`,
      )
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const submitted = await submitQuiz(quizId, { answers: answers as number[] })
      setResult(submitted)
      if (submitted.lesson_completed) {
        // Statuses moved server-side — the sidebar must pick up the unlock.
        reloadLessons()
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  if (quizId === null) {
    return (
      <EmptyState
        title="У цього уроку немає квіза"
        note="Викладач ще не згенерував перевірку знань для цього уроку."
        action={
          <Link to={lessonHref}>
            <Button variant="secondary">До уроку</Button>
          </Link>
        }
      />
    )
  }

  if (quiz.error !== null) return <ErrorState message={quiz.error} onRetry={quiz.reload} />

  if (quiz.data === null) {
    return (
      <div className="grid place-items-center py-16 text-ink-muted">
        <Spinner className="size-7" />
      </div>
    )
  }

  const current = quiz.data
  const showsAnswers = isOwnerQuiz(current)

  if (result !== null) {
    return (
      <ResultCard
        result={result}
        threshold={current.pass_threshold}
        onRetry={resetAttempt}
        lessonHref={lessonHref}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          to={lessonHref}
          className="inline-flex items-center gap-1 text-xs text-ink-muted transition hover:text-ink"
        >
          <BackIcon className="size-3.5" />
          {lesson?.title ?? 'До уроку'}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Перевірка знань</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {String(current.questions.length)} питань, по одній правильній відповіді.
          Проходження від {String(Math.round(current.pass_threshold))}%.
        </p>
      </div>

      {showsAnswers ? (
        <div className="rounded-lg border border-brand/20 bg-brand-soft px-3 py-2 text-sm text-brand">
          Ти бачиш правильні відповіді, бо це твій курс. Студентам вони не
          надсилаються.
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        {current.questions.map((item, questionIndex) => (
          <Card key={questionIndex} className="p-5">
            <fieldset>
              <legend className="text-sm font-medium">
                <span className="text-ink-muted">{String(questionIndex + 1)}. </span>
                {item.question}
              </legend>

              <div className="mt-3 space-y-1.5">
                {item.options.map((option, optionIndex) => {
                  const isCorrect =
                    showsAnswers && 'correct_index' in item && item.correct_index === optionIndex
                  return (
                    <label
                      key={optionIndex}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                        answers[questionIndex] === optionIndex
                          ? 'border-brand bg-brand-soft'
                          : 'border-line hover:bg-canvas'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${String(questionIndex)}`}
                        className="mt-0.5 accent-brand"
                        checked={answers[questionIndex] === optionIndex}
                        onChange={() => {
                          setAnswers((previous) => {
                            const next = [...previous]
                            next[questionIndex] = optionIndex
                            return next
                          })
                        }}
                      />
                      <span className="flex-1">{option}</span>
                      {isCorrect ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-done" /> : null}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </Card>
        ))}

        {error !== null ? <ErrorBanner message={error} /> : null}

        <Button type="submit" loading={submitting}>
          Відправити відповіді
        </Button>
      </form>
    </div>
  )
}
