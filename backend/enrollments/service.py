import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from courses.service import (
    get_course_or_404,
    get_lesson_or_404_by_id,
    get_next_lesson_by_order,
    get_previous_lesson_by_order,
    list_lessons,
)
from enrollments.models import Enrollment, LessonProgress, LessonProgressStatus
from enrollments.schemas import EnrollmentCreate

logger = logging.getLogger(__name__)


async def _get_progress(
    db: AsyncSession, student_id: uuid.UUID, lesson_id: uuid.UUID
) -> LessonProgress | None:
    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.student_id == student_id,
            LessonProgress.lesson_id == lesson_id,
        )
    )
    return result.scalar_one_or_none()


async def _seed_lesson_progress(
    db: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> None:
    lessons = await list_lessons(db, course_id)
    if not lessons:
        return
    for i, lesson in enumerate(lessons):
        db.add(
            LessonProgress(
                student_id=student_id,
                lesson_id=lesson.id,
                status=(
                    LessonProgressStatus.available
                    if i == 0
                    else LessonProgressStatus.locked
                ),
            )
        )


async def enroll_student(
    db: AsyncSession, payload: EnrollmentCreate, student_id: uuid.UUID
) -> Enrollment:
    course = await get_course_or_404(db, payload.course_id)
    if not course.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Course is not published",
        )

    enrollment = Enrollment(student_id=student_id, course_id=payload.course_id)
    db.add(enrollment)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already enrolled in this course",
        )

    await _seed_lesson_progress(db, student_id, payload.course_id)
    await db.commit()
    await db.refresh(enrollment)
    return enrollment


async def get_my_enrollments(
    db: AsyncSession, student_id: uuid.UUID
) -> list[Enrollment]:
    result = await db.execute(
        select(Enrollment)
        .where(Enrollment.student_id == student_id)
        .order_by(Enrollment.enrolled_at.desc())
    )
    enrollments = list(result.scalars().all())
    for e in enrollments:
        await recalculate_progress(db, student_id, e.course_id)
        await db.refresh(e)
    return enrollments


async def get_enrollment_or_404(
    db: AsyncSession, enrollment_id: uuid.UUID
) -> Enrollment:
    result = await db.execute(
        select(Enrollment).where(Enrollment.id == enrollment_id)
    )
    enrollment = result.scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found"
        )
    return enrollment


async def unenroll(
    db: AsyncSession, enrollment_id: uuid.UUID, student_id: uuid.UUID
) -> None:
    enrollment = await get_enrollment_or_404(db, enrollment_id)
    if enrollment.student_id != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not the enrollment owner",
        )
    await db.delete(enrollment)
    await db.commit()


async def is_student_enrolled(
    db: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.course_id == course_id,
        )
    )
    return result.scalar_one_or_none() is not None


# ── LessonProgress ────────────────────────────────────────────────────────────


async def get_lesson_status(
    db: AsyncSession, student_id: uuid.UUID, lesson_id: uuid.UUID
) -> LessonProgressStatus:
    """Return the LessonProgress status for a student+lesson.

    Self-heals if no row exists (teacher added a lesson after the student had
    enrolled): computes the status from the previous lesson's completion and
    persists a new row.
    """
    existing = await _get_progress(db, student_id, lesson_id)
    if existing is not None:
        return existing.status

    lesson = await get_lesson_or_404_by_id(db, lesson_id)
    prev = await get_previous_lesson_by_order(db, lesson.course_id, lesson.order)
    if prev is None:
        computed = LessonProgressStatus.available
    else:
        prev_progress = await _get_progress(db, student_id, prev.id)
        computed = (
            LessonProgressStatus.available
            if prev_progress is not None
            and prev_progress.status == LessonProgressStatus.completed
            else LessonProgressStatus.locked
        )
    db.add(
        LessonProgress(
            student_id=student_id, lesson_id=lesson_id, status=computed
        )
    )
    await db.commit()
    return computed


async def is_lesson_accessible(
    db: AsyncSession, student_id: uuid.UUID, lesson_id: uuid.UUID
) -> bool:
    status_value = await get_lesson_status(db, student_id, lesson_id)
    return status_value != LessonProgressStatus.locked


async def get_lesson_statuses_for_course(
    db: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> dict[uuid.UUID, LessonProgressStatus]:
    """Return {lesson_id: status} for all lessons in the course, self-healing gaps."""
    lessons = await list_lessons(db, course_id)
    if not lessons:
        return {}
    lesson_ids = [l.id for l in lessons]
    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.student_id == student_id,
            LessonProgress.lesson_id.in_(lesson_ids),
        )
    )
    existing = {p.lesson_id: p.status for p in result.scalars().all()}
    if len(existing) < len(lessons):
        for lesson in lessons:
            if lesson.id not in existing:
                existing[lesson.id] = await get_lesson_status(
                    db, student_id, lesson.id
                )
    return existing


async def complete_lesson(
    db: AsyncSession, student_id: uuid.UUID, lesson_id: uuid.UUID
) -> None:
    """Mark lesson completed (idempotent) and unlock the next lesson by order."""
    progress = await _get_progress(db, student_id, lesson_id)
    if progress is None:
        await get_lesson_status(db, student_id, lesson_id)
        progress = await _get_progress(db, student_id, lesson_id)
        assert progress is not None

    if progress.status != LessonProgressStatus.completed:
        progress.status = LessonProgressStatus.completed
        progress.completed_at = func.now()
        logger.info(
            "lesson_progress: student=%s lesson=%s -> completed",
            student_id,
            lesson_id,
        )

    lesson = await get_lesson_or_404_by_id(db, lesson_id)
    next_lesson = await get_next_lesson_by_order(
        db, lesson.course_id, lesson.order
    )
    if next_lesson is not None:
        next_prog = await _get_progress(db, student_id, next_lesson.id)
        if next_prog is None:
            db.add(
                LessonProgress(
                    student_id=student_id,
                    lesson_id=next_lesson.id,
                    status=LessonProgressStatus.available,
                )
            )
            logger.info(
                "lesson_progress: student=%s lesson=%s -> available (unlocked next)",
                student_id,
                next_lesson.id,
            )
        elif next_prog.status == LessonProgressStatus.locked:
            next_prog.status = LessonProgressStatus.available
            logger.info(
                "lesson_progress: student=%s lesson=%s -> available (unlocked next)",
                student_id,
                next_lesson.id,
            )

    await db.commit()


async def recalculate_progress(
    db: AsyncSession, student_id: uuid.UUID, course_id: uuid.UUID
) -> float:
    lessons = await list_lessons(db, course_id)
    total = len(lessons)
    if total == 0:
        percent = 0.0
    else:
        lesson_ids = [l.id for l in lessons]
        result = await db.execute(
            select(func.count(LessonProgress.id)).where(
                LessonProgress.student_id == student_id,
                LessonProgress.lesson_id.in_(lesson_ids),
                LessonProgress.status == LessonProgressStatus.completed,
            )
        )
        completed = int(result.scalar_one())
        percent = (completed / total) * 100.0

    enr_result = await db.execute(
        select(Enrollment).where(
            Enrollment.student_id == student_id,
            Enrollment.course_id == course_id,
        )
    )
    enrollment = enr_result.scalar_one_or_none()
    if enrollment is not None:
        enrollment.progress = percent
        await db.commit()
    return percent
