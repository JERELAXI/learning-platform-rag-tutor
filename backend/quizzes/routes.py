import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user, require_role
from auth.models import User, UserRole
from core.db import get_db
from quizzes.schemas import (
    QuizGenerate,
    QuizReadOwner,
    QuizReadStudent,
    QuizUpdate,
    ResultRead,
    SubmitRequest,
)
from quizzes.service import (
    generate_quiz,
    get_quiz_for_user,
    list_my_results,
    submit_quiz,
    update_quiz,
)

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.post(
    "/generate",
    response_model=QuizReadOwner,
    status_code=status.HTTP_201_CREATED,
)
async def generate_endpoint(
    payload: QuizGenerate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.teacher))],
) -> object:
    return await generate_quiz(db, payload, current_user)


@router.get("/my-results", response_model=list[ResultRead])
async def my_results(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list:
    return await list_my_results(db, current_user)


@router.patch("/{quiz_id}", response_model=QuizReadOwner)
async def patch_quiz(
    quiz_id: uuid.UUID,
    payload: QuizUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.teacher))],
) -> object:
    return await update_quiz(db, quiz_id, payload, current_user)


@router.get(
    "/{quiz_id}", response_model=QuizReadOwner | QuizReadStudent
)
async def get_quiz(
    quiz_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    quiz, is_owner = await get_quiz_for_user(db, quiz_id, current_user)
    if is_owner:
        return QuizReadOwner.model_validate(quiz)
    return QuizReadStudent.model_validate(quiz)


@router.post("/{quiz_id}/submit", response_model=ResultRead)
async def submit_endpoint(
    quiz_id: uuid.UUID,
    payload: SubmitRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    return await submit_quiz(db, quiz_id, payload, current_user)
