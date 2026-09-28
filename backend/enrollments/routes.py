import uuid
from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from auth.models import User
from core.db import get_db
from courses.service import get_courses_by_ids
from enrollments.models import Enrollment
from enrollments.schemas import EnrollmentCreate, EnrollmentRead
from enrollments.service import enroll_student, get_my_enrollments, unenroll

router = APIRouter(prefix="/api/enrollments", tags=["enrollments"])


async def _with_course_titles(
    db: AsyncSession, enrollments: Sequence[Enrollment]
) -> list[EnrollmentRead]:
    courses = await get_courses_by_ids(db, [e.course_id for e in enrollments])
    out: list[EnrollmentRead] = []
    for enrollment in enrollments:
        course = courses.get(enrollment.course_id)
        out.append(
            EnrollmentRead.model_validate(enrollment).model_copy(
                update={"course_title": course.title if course is not None else None}
            )
        )
    return out


@router.post("/", response_model=EnrollmentRead, status_code=status.HTTP_201_CREATED)
async def enroll(
    payload: EnrollmentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> EnrollmentRead:
    enrollment = await enroll_student(db, payload, student_id=current_user.id)
    return (await _with_course_titles(db, [enrollment]))[0]


@router.get("/my", response_model=list[EnrollmentRead])
async def my_enrollments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[EnrollmentRead]:
    enrollments = await get_my_enrollments(db, student_id=current_user.id)
    return await _with_course_titles(db, enrollments)


@router.delete("/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unenroll_endpoint(
    enrollment_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await unenroll(db, enrollment_id, student_id=current_user.id)
