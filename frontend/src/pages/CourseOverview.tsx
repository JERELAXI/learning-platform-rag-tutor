import { Link } from 'react-router-dom'

import { Button, Card, EmptyState } from '../components/ui'
import { useCourseContext } from './courseContext'

/** Landing pane of a course: what it is, and the way into the lesson the
 *  student should be on. */
export function CourseOverview() {
  const { course, lessons } = useCourseContext()

  // Where to resume: the first unfinished unlocked lesson, else the first one
  // that is readable at all.
  const resumeTarget =
    lessons.find((lesson) => lesson.status === 'available') ??
    lessons.find((lesson) => lesson.status !== 'locked')

  if (lessons.length === 0) {
    return (
      <EmptyState
        title="У курсі ще немає уроків"
        note="Викладач ще не додав жодного уроку. Зайди пізніше."
      />
    )
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">{course.title}</h1>
      <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-ink-soft">
        {course.description ?? 'Опис курсу відсутній.'}
      </p>

      <p className="mt-4 text-sm text-ink-muted">
        Уроків у курсі: {String(lessons.length)}. Наступний відкривається після
        завершення попереднього.
      </p>

      {resumeTarget !== undefined ? (
        <Link to={`lessons/${resumeTarget.id}`} className="mt-5 inline-block">
          <Button>
            {resumeTarget.status === 'available' ? 'Продовжити' : 'Почати'} —{' '}
            {resumeTarget.title}
          </Button>
        </Link>
      ) : null}
    </Card>
  )
}
