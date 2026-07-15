import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from auth.models import ROLE_LEVEL, User, UserRole
from auth.service import get_user_by_id
from core.db import get_db
from core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not token:
        raise _CREDENTIALS_EXC
    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:
        raise _CREDENTIALS_EXC from exc

    if payload.get("type") != "access":
        raise _CREDENTIALS_EXC

    sub = payload.get("sub")
    if not sub:
        raise _CREDENTIALS_EXC
    try:
        user_id = uuid.UUID(sub)
    except ValueError as exc:
        raise _CREDENTIALS_EXC from exc

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise _CREDENTIALS_EXC
    return user


def require_role(min_role: UserRole):
    required_level = ROLE_LEVEL[min_role]

    async def _dep(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return current_user

    return _dep
