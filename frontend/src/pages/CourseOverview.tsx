import { Link } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { LessonEditor } from '../components/LessonEditor'
import { Button, Card, EmptyState } from '../components/ui'
import { useCourseContext } from './courseContext'

/** Landing pane of a course: what it is, and the way into the lesson the
 *  student should be on. For the owner it is also where lessons are managed. */
export function CourseOverview() {
  const { course, lessons, reloadLessons } = useCourseContext()
  const { user } = useAuth()

  const isOwner =
    user !== null && (user.role === 'admin' || course.teacher_id === user.id)

  // Where to resume: the first unfinished unlocked lesson, else the first one
  // that is readable at all.
  const resumeTarget =
    lessons.find((lesson) => lesson.status === 'available') ??
    lessons.find((lesson) => lesson.status !== 'locked')

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{course.title}</h1>
          {isOwner && !course.is_published ? (
            <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-muted">
              чернетка
            </span>
          ) : null}
        </div>

        <p className="mt-2 max-w-2xl text-sm whitespace-pre-line text-ink-soft">
          {course.description ?? 'Опис курсу відсутній.'}
        </p>

        {lessons.length > 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Уроків у курсі: {String(lessons.length)}. Наступний відкривається після
            завершення попереднього.
          </p>
        ) : null}

        {resumeTarget !== undefined ? (
          <Link to={`lessons/${resumeTarget.id}`} className="mt-5 inline-block">
            <Button>
              {resumeTarget.status === 'available' ? 'Продовжити' : 'Почати'} —{' '}
              {resumeTarget.title}
            </Button>
          </Link>
        ) : null}
      </Card>

      {isOwner ? (
        <LessonEditor
          courseId={course.id}
          lessons={lessons}
          onChanged={reloadLessons}
        />
      ) : lessons.length === 0 ? (
        <EmptyState
          title="У курсі ще немає уроків"
          note="Викладач ще не додав жодного уроку. Зайди пізніше."
        />
      ) : null}
    </div>
  )
}
