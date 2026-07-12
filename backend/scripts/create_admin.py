"""CLI: create an admin user directly in the database.

Usage:
    uv run python -m scripts.create_admin --email admin@example.com --password ... --full-name "Admin"

If any option is omitted, it is asked interactively.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from auth.models import User, UserRole  # noqa: E402
from auth.service import get_user_by_email  # noqa: E402
from core.db import async_session, engine  # noqa: E402
from core.security import hash_password  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create an admin user")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--full-name", dest="full_name")
    return parser.parse_args()


def _prompt(value: str | None, label: str, *, secret: bool = False) -> str:
    if value:
        return value
    getter = getpass.getpass if secret else input
    while True:
        result = getter(f"{label}: ").strip()
        if result:
            return result
        print(f"{label} cannot be empty.")


async def _create_admin(email: str, password: str, full_name: str) -> None:
    async with async_session() as db:
        existing = await get_user_by_email(db, email)
        if existing is not None:
            print(f"User with email {email!r} already exists (role={existing.role}).")
            sys.exit(1)

        admin = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role=UserRole.admin,
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        print(f"Admin created: id={admin.id} email={admin.email}")


async def _main() -> None:
    args = _parse_args()
    email = _prompt(args.email, "Email")
    full_name = _prompt(args.full_name, "Full name")
    password = _prompt(args.password, "Password", secret=True)
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)
    try:
        await _create_admin(email, password, full_name)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
