import uuid
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from auth.models import User
from auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserRead,
    UserRegister,
)
from auth.service import (
    authenticate_user,
    change_user_password,
    get_user_by_id,
    register_user,
)
from core.db import get_db
from core.security import create_access_token, create_refresh_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_tokens(user: User) -> TokenResponse:
    subject = str(user.id)
    role = str(user.role)
    return TokenResponse(
        access_token=create_access_token(subject, role),
        refresh_token=create_refresh_token(subject, role),
    )


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: UserRegister,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    return await register_user(db, payload)


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """OAuth2 password flow (form-data). `username` field holds the user's email.

    Swagger's Authorize button uses this endpoint.
    """
    user = await authenticate_user(db, form_data.username, form_data.password)
    return _issue_tokens(user)


@router.post("/login-json", response_model=TokenResponse)
async def login_json(
    payload: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """JSON alternative to /login for non-OAuth2 clients."""
    user = await authenticate_user(db, payload.email, payload.password)
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
    )
    try:
        data = decode_token(payload.refresh_token)
    except jwt.PyJWTError as e:
        raise exc from e
    if data.get("type") != "refresh":
        raise exc
    sub = data.get("sub")
    if not sub:
        raise exc
    try:
        user_id = uuid.UUID(sub)
    except ValueError as e:
        raise exc from e
    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise exc
    return _issue_tokens(user)


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    _: Annotated[User, Depends(get_current_user)],
) -> dict[str, str]:
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserRead)
async def me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


@router.patch("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    await change_user_password(
        db, current_user, payload.current_password, payload.new_password
    )
    return {"detail": "Password updated"}
