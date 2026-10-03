import { useState } from 'react'

import { updateQuiz } from '../api/quizzes'
import type { QuestionOwner, QuizReadOwner } from '../api/types'
import { errorMessage } from '../hooks/useApi'
import { Button, Card, ErrorBanner, Field } from './ui'

const OPTIONS_PER_QUESTION = 4

function blankQuestion(): QuestionOwner {
  return {
    question: '',
    options: Array.from({ length: OPTIONS_PER_QUESTION }, () => ''),
    correct_index: 0,
  }
}

/** Mirrors the backend's QuestionOwner validation so a mistake is caught before
 *  the request instead of coming back as a 422. */
function findProblem(questions: QuestionOwner[], threshold: number): string | null {
  if (questions.length === 0) return 'Квіз має містити хоча б одне питання.'

  for (const [index, question] of questions.entries()) {
    const position = index + 1
    if (question.question.trim().length === 0) {
      return `Питання ${String(position)}: текст не може бути порожнім.`
    }
    if (question.options.length !== OPTIONS_PER_QUESTION) {
      return `Питання ${String(position)}: має бути рівно ${String(OPTIONS_PER_QUESTION)} варіанти.`
    }
    if (question.options.some((option) => option.trim().length === 0)) {
      return `Питання ${String(position)}: усі варіанти мусять бути заповнені.`
    }
  }

  if (threshold < 0 || threshold > 100) return 'Поріг проходження має бути від 0 до 100.'
  return null
}

/** Owner-only editor for the AI-generated draft: fix wording, swap the correct
 *  answer, add or drop a question, move the pass mark. */
export function QuizEditor({
  quiz,
  onSaved,
  onCancel,
}: {
  quiz: QuizReadOwner
  onSaved: () => void
  onCancel: () => void
}) {
  const [questions, setQuestions] = useState<QuestionOwner[]>(() =>
    quiz.questions.map((question) => ({ ...question, options: [...question.options] })),
  )
  const [threshold, setThreshold] = useState(quiz.pass_threshold)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patchQuestion(index: number, changes: Partial<QuestionOwner>): void {
    setQuestions((previous) =>
      previous.map((question, position) =>
        position === index ? { ...question, ...changes } : question,
      ),
    )
  }

  function patchOption(questionIndex: number, optionIndex: number, value: string): void {
    setQuestions((previous) =>
      previous.map((question, position) => {
        if (position !== questionIndex) return question
        const options = [...question.options]
        options[optionIndex] = value
        return { ...question, options }
      }),
    )
  }

  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault()

    const problem = findProblem(questions, threshold)
    if (problem !== null) {
      setError(problem)
      return
    }

    setError(null)
    setSaving(true)
    try {
      await updateQuiz(quiz.id, { questions, pass_threshold: threshold })
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
      <Card className="p-5">
        <h2 className="text-sm font-semibold tracking-tight">Налаштування квіза</h2>
        <p className="mt-1 text-xs text-ink-muted">
          AI склав чернетку — виправ формулювання, якщо воно неточне, або познач
          іншу правильну відповідь.
        </p>
        <div className="mt-3 w-40">
          <Field
            label="Поріг проходження, %"
            name="pass-threshold"
            type="number"
            min={0}
            max={100}
            step={5}
            value={String(threshold)}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
        </div>
      </Card>

      {questions.map((question, questionIndex) => (
        <Card key={questionIndex} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">
              Питання {String(questionIndex + 1)}
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={questions.length === 1}
              onClick={() => {
                setQuestions((previous) =>
                  previous.filter((_, position) => position !== questionIndex),
                )
              }}
            >
              Видалити
            </Button>
          </div>

          <div className="mt-2">
            <Field
              label="Текст питання"
              name={`question-${String(questionIndex)}`}
              value={question.question}
              onChange={(event) => patchQuestion(questionIndex, { question: event.target.value })}
            />
          </div>

          <fieldset className="mt-3">
            <legend className="mb-1.5 text-sm font-medium text-ink">
              Варіанти — познач правильний
            </legend>
            <div className="space-y-1.5">
              {question.options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name={`correct-${String(questionIndex)}`}
                    aria-label={`Правильний варіант ${String(optionIndex + 1)}`}
                    className="shrink-0 accent-brand"
                    checked={question.correct_index === optionIndex}
                    onChange={() => patchQuestion(questionIndex, { correct_index: optionIndex })}
                  />
                  <input
                    type="text"
                    aria-label={`Варіант ${String(optionIndex + 1)}`}
                    value={option}
                    onChange={(event) =>
                      patchOption(questionIndex, optionIndex, event.target.value)
                    }
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 ${
                      question.correct_index === optionIndex
                        ? 'border-done bg-done-soft'
                        : 'border-line bg-surface'
                    }`}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </Card>
      ))}

      {error !== null ? <ErrorBanner message={error} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          Зберегти квіз
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setQuestions((previous) => [...previous, blankQuestion()])
          }}
        >
          Додати питання
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Скасувати
        </Button>
      </div>
    </form>
  )
}
