import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from courses.service import get_course_or_404
from enrollments.models import Enrollment
from enrollments.schemas import EnrollmentCreate


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
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already enrolled in this course",
        )
    await db.refresh(enrollment)
    return enrollment


async def get_my_enrollments(db: AsyncSession, student_id: uuid.UUID) -> list[Enrollment]:
    result = await db.execute(
        select(Enrollment)
        .where(Enrollment.student_id == student_id)
        .order_by(Enrollment.enrolled_at.desc())
    )
    return list(result.scalars().all())


async def get_enrollment_or_404(db: AsyncSession, enrollment_id: uuid.UUID) -> Enrollment:
    result = await db.execute(select(Enrollment).where(Enrollment.id == enrollment_id))
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
