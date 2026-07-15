import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import require_role
from auth.models import User, UserRole
from auth.schemas import UserRead
from core.db import get_db
from users.schemas import RoleUpdate
from users.service import deactivate_user, get_user_or_404, list_users, update_user_role

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/", response_model=list[UserRead])
async def get_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
    limit: int = 20,
    offset: int = 0,
) -> list:
    return await list_users(db, limit=limit, offset=offset)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
) -> object:
    return await get_user_or_404(db, user_id)


@router.patch("/{user_id}/role", response_model=UserRead)
async def patch_user_role(
    user_id: uuid.UUID,
    payload: RoleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_role(UserRole.admin))],
) -> object:
    user = await get_user_or_404(db, user_id)
    return await update_user_role(db, user, payload.role)


@router.patch("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user_endpoint(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_admin: Annotated[User, Depends(require_role(UserRole.admin))],
) -> object:
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )
    user = await get_user_or_404(db, user_id)
    return await deactivate_user(db, user)
