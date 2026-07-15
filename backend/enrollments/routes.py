import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from auth.models import User
from core.db import get_db
from enrollments.schemas import EnrollmentCreate, EnrollmentRead
from enrollments.service import enroll_student, get_my_enrollments, unenroll

router = APIRouter(prefix="/api/enrollments", tags=["enrollments"])


@router.post("/", response_model=EnrollmentRead, status_code=status.HTTP_201_CREATED)
async def enroll(
    payload: EnrollmentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    return await enroll_student(db, payload, student_id=current_user.id)


@router.get("/my", response_model=list[EnrollmentRead])
async def my_enrollments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list:
    return await get_my_enrollments(db, student_id=current_user.id)


@router.delete("/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unenroll_endpoint(
    enrollment_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await unenroll(db, enrollment_id, student_id=current_user.id)
