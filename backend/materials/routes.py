import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from auth.models import User, UserRole
from core.db import get_db
from courses.models import Course
from courses.service import ensure_owner_or_admin, get_lesson_or_404_by_id
from enrollments.service import is_student_enrolled
from materials.schemas import MaterialRead
from materials.service import (
    delete_material,
    get_material_or_404,
    list_lesson_materials,
    reset_material_for_reprocess,
    save_upload,
)
from materials.tasks import process_material_task

router = APIRouter(prefix="/api/lessons/{lesson_id}/materials", tags=["materials"])


async def _get_course_for_lesson(db: AsyncSession, lesson_id: uuid.UUID) -> Course:
    lesson = await get_lesson_or_404_by_id(db, lesson_id)
    result = await db.execute(select(Course).where(Course.id == lesson.course_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )
    return course


async def _ensure_can_view(db: AsyncSession, course: Course, user: User) -> None:
    if user.role == UserRole.admin or course.teacher_id == user.id:
        return
    if await is_student_enrolled(db, user.id, course.id):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Must be enrolled in the course to view materials",
    )


@router.post(
    "/",
    response_model=MaterialRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_material(
    lesson_id: uuid.UUID,
    file: UploadFile,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await _get_course_for_lesson(db, lesson_id)
    ensure_owner_or_admin(course, current_user)
    material = await save_upload(db, lesson_id, file)
    process_material_task.delay(str(material.id))
    return material


@router.get("/", response_model=list[MaterialRead])
async def list_materials(
    lesson_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list:
    course = await _get_course_for_lesson(db, lesson_id)
    await _ensure_can_view(db, course, current_user)
    return await list_lesson_materials(db, lesson_id)


@router.get("/{material_id}", response_model=MaterialRead)
async def get_material(
    lesson_id: uuid.UUID,
    material_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await _get_course_for_lesson(db, lesson_id)
    await _ensure_can_view(db, course, current_user)
    material = await get_material_or_404(db, material_id)
    if material.lesson_id != lesson_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        )
    return material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material_endpoint(
    lesson_id: uuid.UUID,
    material_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    course = await _get_course_for_lesson(db, lesson_id)
    ensure_owner_or_admin(course, current_user)
    material = await get_material_or_404(db, material_id)
    if material.lesson_id != lesson_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        )
    await delete_material(db, material)


@router.post(
    "/{material_id}/reprocess",
    response_model=MaterialRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def reprocess_material(
    lesson_id: uuid.UUID,
    material_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    course = await _get_course_for_lesson(db, lesson_id)
    ensure_owner_or_admin(course, current_user)
    material = await get_material_or_404(db, material_id)
    if material.lesson_id != lesson_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Material not found"
        )
    await reset_material_for_reprocess(db, material)
    process_material_task.delay(str(material.id))
    return material
