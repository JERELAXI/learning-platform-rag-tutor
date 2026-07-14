import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user, require_role
from auth.models import User, UserRole
from core.db import get_db
from courses.schemas import (
    CourseCreate,
    CourseRead,
    CourseUpdate,
    LessonCreate,
    LessonRead,
    LessonReorderItem,
    LessonUpdate,
)
from courses.service import (
    create_course,
    create_lesson,
    delete_course,
    delete_lesson,
    ensure_owner_or_admin,
    get_course_or_404,
    get_lesson_or_404,
    list_courses,
    list_lessons,
    list_my_courses,
    reorder_lessons,
    update_course,
    update_lesson,
)
from enrollments.models import LessonProgressStatus
from enrollments.service import (
    complete_lesson,
    get_lesson_status,
    get_lesson_statuses_for_course,
    is_student_enrolled,
    recalculate_progress,
)
from quizzes.service import quiz_exists_for_lesson

courses_router = APIRouter(prefix="/api/courses", tags=["courses"])
lessons_router = APIRouter(prefix="/api/courses/{course_id}/lessons", tags=["lessons"])


# ── Courses ────────────────────────────────────────────────────────────────────


@courses_router.get("/", response_model=list[CourseRead])
async def get_courses(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
    published: bool | None = None,
    search: str | None = None,
) -> list:
    return await list_courses(db, published=published, search=search)


# /my MUST be before /{id} so FastAPI doesn't match "my" as a UUID
@courses_router.get("/my", response_model=list[CourseRead])
async def get_my_courses(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.teacher))],
) -> list:
    return await list_my_courses(db, teacher_id=current_user.id)


@courses_router.post("/", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
async def create_course_endpoint(
    payload: CourseCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.teacher))],
) -> object:
    return await create_course(db, payload, teacher_id=current_user.id)


@courses_router.get("/{course_id}", response_model=CourseRead)
async def get_course(
    course_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> object:
    return await get_course_or_404(db, course_id)


@courses_router.patch("/{course_id}", response_model=CourseRead)
async def patch_course(
    course_id: uuid.UUID,
    payload: CourseUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await get_course_or_404(db, course_id)
    ensure_owner_or_admin(course, current_user)
    return await update_course(db, course, payload)


@courses_router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_endpoint(
    course_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    course = await get_course_or_404(db, course_id)
    ensure_owner_or_admin(course, current_user)
    await delete_course(db, course)


# ── Lessons ────────────────────────────────────────────────────────────────────


def _is_privileged(user: User, course) -> bool:
    return user.role == UserRole.admin or course.teacher_id == user.id


@lessons_router.get("/", response_model=list[LessonRead])
async def get_lessons(
    course_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list:
    course = await get_course_or_404(db, course_id)
    privileged = _is_privileged(current_user, course)
    if not (privileged or await is_student_enrolled(db, current_user.id, course_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Must be enrolled in the course to view lessons",
        )
    lessons = await list_lessons(db, course_id)
    if privileged:
        return [LessonRead.model_validate(l) for l in lessons]
    statuses = await get_lesson_statuses_for_course(
        db, current_user.id, course_id
    )
    return [
        LessonRead.model_validate(l).model_copy(
            update={"status": statuses.get(l.id, LessonProgressStatus.locked)}
        )
        for l in lessons
    ]


@lessons_router.post("/", response_model=LessonRead, status_code=status.HTTP_201_CREATED)
async def create_lesson_endpoint(
    course_id: uuid.UUID,
    payload: LessonCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await get_course_or_404(db, course_id)
    ensure_owner_or_admin(course, current_user)
    return await create_lesson(db, course_id, payload)


# NB: /reorder MUST be before /{lesson_id} routes so "reorder" isn't parsed as UUID.
@lessons_router.patch("/reorder", response_model=list[LessonRead])
async def reorder_lessons_endpoint(
    course_id: uuid.UUID,
    payload: list[LessonReorderItem],
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list:
    course = await get_course_or_404(db, course_id)
    ensure_owner_or_admin(course, current_user)
    items = [(item.lesson_id, item.order) for item in payload]
    return await reorder_lessons(db, course_id, items)


@lessons_router.get("/{lesson_id}", response_model=LessonRead)
async def get_lesson(
    course_id: uuid.UUID,
    lesson_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await get_course_or_404(db, course_id)
    privileged = _is_privileged(current_user, course)
    if not (privileged or await is_student_enrolled(db, current_user.id, course_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Must be enrolled in the course to view lessons",
        )
    lesson = await get_lesson_or_404(db, course_id, lesson_id)
    if privileged:
        return LessonRead.model_validate(lesson)
    lesson_status = await get_lesson_status(db, current_user.id, lesson_id)
    if lesson_status == LessonProgressStatus.locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lesson is locked, complete previous lessons first",
        )
    return LessonRead.model_validate(lesson).model_copy(
        update={"status": lesson_status}
    )


@lessons_router.patch("/{lesson_id}", response_model=LessonRead)
async def patch_lesson(
    course_id: uuid.UUID,
    lesson_id: uuid.UUID,
    payload: LessonUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await get_course_or_404(db, course_id)
    ensure_owner_or_admin(course, current_user)
    lesson = await get_lesson_or_404(db, course_id, lesson_id)
    return await update_lesson(db, lesson, payload)


@lessons_router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson_endpoint(
    course_id: uuid.UUID,
    lesson_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    course = await get_course_or_404(db, course_id)
    ensure_owner_or_admin(course, current_user)
    lesson = await get_lesson_or_404(db, course_id, lesson_id)
    await delete_lesson(db, lesson)


@lessons_router.post("/{lesson_id}/complete", response_model=LessonRead)
async def complete_lesson_endpoint(
    course_id: uuid.UUID,
    lesson_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await get_course_or_404(db, course_id)
    if not await is_student_enrolled(db, current_user.id, course_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Must be enrolled to complete a lesson",
        )
    lesson = await get_lesson_or_404(db, course_id, lesson_id)
    lesson_status = await get_lesson_status(db, current_user.id, lesson_id)
    if lesson_status == LessonProgressStatus.locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lesson is locked, complete previous lessons first",
        )
    if await quiz_exists_for_lesson(db, lesson_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pass the quiz to complete this lesson",
        )
    await complete_lesson(db, current_user.id, lesson_id)
    await recalculate_progress(db, current_user.id, course_id)
    new_status = await get_lesson_status(db, current_user.id, lesson_id)
    _ = course
    return LessonRead.model_validate(lesson).model_copy(
        update={"status": new_status}
    )
