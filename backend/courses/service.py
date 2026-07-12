import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.models import User, UserRole
from courses.models import Course, Lesson
from courses.schemas import CourseCreate, CourseUpdate, LessonCreate, LessonUpdate


async def get_course_or_404(db: AsyncSession, course_id: uuid.UUID) -> Course:
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


def ensure_owner_or_admin(course: Course, user: User) -> None:
    if user.role == UserRole.admin:
        return
    if course.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the course owner")


# --- Course CRUD ---

async def list_courses(
    db: AsyncSession,
    *,
    published: bool | None = None,
    search: str | None = None,
) -> list[Course]:
    stmt = select(Course)
    if published is not None:
        stmt = stmt.where(Course.is_published == published)
    if search:
        stmt = stmt.where(Course.title.ilike(f"%{search}%"))
    result = await db.execute(stmt.order_by(Course.created_at.desc()))
    return list(result.scalars().all())


async def list_my_courses(db: AsyncSession, teacher_id: uuid.UUID) -> list[Course]:
    result = await db.execute(
        select(Course).where(Course.teacher_id == teacher_id).order_by(Course.created_at.desc())
    )
    return list(result.scalars().all())


async def create_course(db: AsyncSession, payload: CourseCreate, teacher_id: uuid.UUID) -> Course:
    course = Course(
        title=payload.title,
        description=payload.description,
        is_published=payload.is_published,
        teacher_id=teacher_id,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


async def update_course(db: AsyncSession, course: Course, payload: CourseUpdate) -> Course:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    await db.commit()
    await db.refresh(course)
    return course


async def delete_course(db: AsyncSession, course: Course) -> None:
    await db.delete(course)
    await db.commit()


# --- Lesson CRUD ---

async def get_lesson_or_404(
    db: AsyncSession, course_id: uuid.UUID, lesson_id: uuid.UUID
) -> Lesson:
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.course_id == course_id)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    return lesson


async def list_lessons(db: AsyncSession, course_id: uuid.UUID) -> list[Lesson]:
    result = await db.execute(
        select(Lesson).where(Lesson.course_id == course_id).order_by(Lesson.order)
    )
    return list(result.scalars().all())


async def create_lesson(
    db: AsyncSession, course_id: uuid.UUID, payload: LessonCreate
) -> Lesson:
    lesson = Lesson(
        course_id=course_id,
        title=payload.title,
        content=payload.content,
        order=payload.order,
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return lesson


async def update_lesson(db: AsyncSession, lesson: Lesson, payload: LessonUpdate) -> Lesson:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lesson, field, value)
    await db.commit()
    await db.refresh(lesson)
    return lesson


async def delete_lesson(db: AsyncSession, lesson: Lesson) -> None:
    await db.delete(lesson)
    await db.commit()
