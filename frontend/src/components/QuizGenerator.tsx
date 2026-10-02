import { useState } from 'react'
import { Link } from 'react-router-dom'

import { generateQuiz } from '../api/quizzes'
import { errorMessage } from '../hooks/useApi'
import { SparkIcon } from './icons'
import { Button, Card, ErrorBanner, SelectField } from './ui'

/** Backend accepts 3–10 and defaults to 5. */
const QUESTION_COUNTS = [3, 4, 5, 6, 8, 10]

/** Owner-only: generate the lesson's single canonical quiz from its materials. */
export function QuizGenerator({
  lessonId,
  quizId,
  hasReadyMaterials,
  onGenerated,
}: {
  lessonId: string
  quizId: string | null
  hasReadyMaterials: boolean
  onGenerated: () => void
}) {
  const [count, setCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate(): Promise<void> {
    setError(null)
    setGenerating(true)
    try {
      await generateQuiz({ lesson_id: lessonId, num_questions: count })
      // The lesson now carries a quiz_id, which the sidebar and the student
      // view both read.
      onGenerated()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <SparkIcon className="size-4 shrink-0 text-brand" />
        <h2 className="text-sm font-semibold tracking-tight">Квіз уроку</h2>
      </div>

      {error !== null ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {quizId !== null ? (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Квіз уже існує. Студент має скласти його, щоб завершити урок і
            відкрити наступний.
          </p>
          <Link to="quiz" className="mt-3 inline-block">
            <Button variant="secondary">Переглянути квіз</Button>
          </Link>
        </>
      ) : !hasReadyMaterials ? (
        <p className="mt-2 text-sm text-ink-muted">
          Спершу завантаж матеріал і дочекайся статусу «готово» — питання
          генеруються з його тексту.
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-md text-sm text-ink-soft">
            AI складе питання з тексту матеріалів цього уроку. Квіз один на
            урок, тому згенерувати можна лише раз.
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-36">
              <SelectField
                label="Кількість питань"
                name="num-questions"
                value={String(count)}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {QUESTION_COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectField>
            </div>
            <Button loading={generating} onClick={() => void handleGenerate()}>
              {generating ? 'Генерую…' : 'Згенерувати квіз'}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
