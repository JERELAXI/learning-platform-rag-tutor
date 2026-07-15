"""Test fixtures.

Test isolation strategy:
- Session-scoped test DB `learning_platform_test` is created once on the same
  Postgres. `CREATE EXTENSION vector` runs before `Base.metadata.create_all`.
- Between tests every table is TRUNCATEd (RESTART IDENTITY CASCADE).
- The FastAPI app uses a `get_db` dependency-override pointing at the test
  session factory.
- LLM calls are patched (autouse) so tests never hit OpenAI.
- Celery `.delay()` on `process_material_task` is patched to a no-op; tests
  that need the async pipeline call `process_task(material_id)` directly.
  This avoids `asyncio.run()` being invoked inside the already-running test
  loop.
"""

import hashlib
import json
import re
import uuid
from types import SimpleNamespace
from typing import AsyncIterator, Iterator
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Preload all model modules so Base.metadata knows about every table.
from core.db import Base  # noqa: E402
from auth import models as _auth_models  # noqa: E402,F401
from courses import models as _courses_models  # noqa: E402,F401
from enrollments import models as _enrollments_models  # noqa: E402,F401
from materials import models as _materials_models  # noqa: E402,F401
from chat import models as _chat_models  # noqa: E402,F401
from quizzes import models as _quizzes_models  # noqa: E402,F401

from auth.models import User, UserRole
from core.config import settings
from core.db import get_db
from core.security import create_access_token, hash_password
from courses.models import Course, Lesson
from enrollments.models import Enrollment, LessonProgress, LessonProgressStatus
from main import app

TEST_DB = "learning_platform_test"


def _test_url() -> str:
    base, _, _ = settings.DATABASE_URL.rpartition("/")
    return f"{base}/{TEST_DB}"


# ─── DB lifecycle ─────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def test_engine() -> AsyncIterator[AsyncEngine]:
    admin = create_async_engine(settings.DATABASE_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}"'))
        await conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
    await admin.dispose()

    engine = create_async_engine(_test_url())
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()

    admin = create_async_engine(settings.DATABASE_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}"'))
    await admin.dispose()


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def session_factory(test_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def _truncate_tables(test_engine: AsyncEngine) -> AsyncIterator[None]:
    yield
    async with test_engine.begin() as conn:
        tables = ", ".join(
            f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)
        )
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest_asyncio.fixture
async def db(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session


# ─── HTTP client with dependency override ─────────────────────────────────────


@pytest_asyncio.fixture
async def client(session_factory) -> AsyncIterator[AsyncClient]:
    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ─── LLM mocks (autouse) ──────────────────────────────────────────────────────


def _fake_embed_impl(txt: str) -> list[float]:
    digest = hashlib.sha256(txt.encode("utf-8")).digest()
    raw = (digest * (1536 // 32 + 1))[:1536]
    return [(b - 128) / 128.0 for b in raw]


async def _fake_embed(txt: str) -> list[float]:
    return _fake_embed_impl(txt)


async def _fake_generate(prompt: str, system: str | None = None) -> str:
    if "multiple-choice" in prompt.lower():
        m = re.search(r"згенеруй\s+(\d+)\s+multiple", prompt.lower())
        n = int(m.group(1)) if m else 5
        return json.dumps(
            [
                {
                    "question": f"Q{i + 1}",
                    "options": ["a", "b", "c", "d"],
                    "correct_index": i % 4,
                }
                for i in range(n)
            ]
        )
    return "AI: Подумай про це."


@pytest.fixture(autouse=True)
def llm_mocks(monkeypatch) -> SimpleNamespace:
    embed = AsyncMock(side_effect=_fake_embed)
    generate = AsyncMock(side_effect=_fake_generate)
    for target in ("materials.service.embed_text", "chat.service.embed_text"):
        monkeypatch.setattr(target, embed)
    for target in ("chat.service.generate", "quizzes.service.generate"):
        monkeypatch.setattr(target, generate)
    return SimpleNamespace(embed=embed, generate=generate)


# ─── Celery: patch .delay() → no-op; tests trigger processing explicitly ─────


@pytest.fixture(autouse=True)
def _celery_delay_noop(monkeypatch) -> None:
    monkeypatch.setattr(
        "materials.routes.process_material_task.delay", lambda material_id: None
    )
    # Also configure eager for any code path that might use it later.
    from core.celery_app import celery_app

    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True


@pytest_asyncio.fixture
async def process_task(session_factory):
    """Helper to run the async processing pipeline directly, mimicking what
    the Celery worker would do."""
    from materials.service import process_material

    async def _run(material_id: str) -> None:
        await process_material(uuid.UUID(material_id), session_factory=session_factory)

    return _run


# ─── User / auth factories ────────────────────────────────────────────────────


async def _make_user(
    db: AsyncSession, role: UserRole, email: str | None = None
) -> User:
    user = User(
        email=email or f"{role.value}_{uuid.uuid4().hex[:8]}@t.com",
        hashed_password=hash_password("pass1234"),
        full_name=f"{role.value.title()} Test",
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _token(user: User) -> str:
    return create_access_token(str(user.id), str(user.role))


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(user)}"}


@pytest_asyncio.fixture
async def teacher(db) -> User:
    return await _make_user(db, UserRole.teacher)


@pytest_asyncio.fixture
async def student(db) -> User:
    return await _make_user(db, UserRole.student)


@pytest_asyncio.fixture
async def admin(db) -> User:
    return await _make_user(db, UserRole.admin)


@pytest.fixture
def auth_headers():
    return _auth


# ─── Domain factories ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def published_course(db, teacher) -> Course:
    course = Course(
        title="Test Course",
        description="test",
        teacher_id=teacher.id,
        is_published=True,
    )
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


@pytest_asyncio.fixture
async def lesson(db, published_course) -> Lesson:
    lsn = Lesson(
        course_id=published_course.id,
        title="L1",
        content="content",
        order=0,
    )
    db.add(lsn)
    await db.commit()
    await db.refresh(lsn)
    return lsn


@pytest_asyncio.fixture
async def lessons(db, published_course) -> list[Lesson]:
    items = [
        Lesson(course_id=published_course.id, title=f"L{i + 1}", order=i)
        for i in range(3)
    ]
    for l in items:
        db.add(l)
    await db.commit()
    for l in items:
        await db.refresh(l)
    return items


@pytest_asyncio.fixture
async def enrolled_student(db, student, published_course, lessons) -> User:
    enr = Enrollment(student_id=student.id, course_id=published_course.id)
    db.add(enr)
    for i, l in enumerate(lessons):
        db.add(
            LessonProgress(
                student_id=student.id,
                lesson_id=l.id,
                status=(
                    LessonProgressStatus.available
                    if i == 0
                    else LessonProgressStatus.locked
                ),
            )
        )
    await db.commit()
    return student
