import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from auth.models import User
from chat.schemas import (
    AskRequest,
    AskResponse,
    MessageRead,
    SessionCreate,
    SessionDetail,
    SessionRead,
)
from chat.service import (
    ask,
    create_session,
    delete_session,
    get_session_with_messages,
    list_my_sessions,
    list_session_messages,
)
from core.db import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post(
    "/sessions",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_session_endpoint(
    payload: SessionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    return await create_session(db, payload, current_user)


@router.get("/sessions", response_model=list[SessionRead])
async def get_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list:
    return await list_my_sessions(db, current_user)


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> object:
    return await get_session_with_messages(db, session_id, current_user)


@router.post("/sessions/{session_id}/ask", response_model=AskResponse)
async def ask_question(
    session_id: uuid.UUID,
    payload: AskRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AskResponse:
    return await ask(db, session_id, payload.question, current_user)


@router.get(
    "/sessions/{session_id}/messages", response_model=list[MessageRead]
)
async def get_messages(
    session_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list:
    return await list_session_messages(db, session_id, current_user)


@router.delete(
    "/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_session_endpoint(
    session_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await delete_session(db, session_id, current_user)
