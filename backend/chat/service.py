import logging
import uuid
from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth.models import User, UserRole
from chat.models import ChatMessage, ChatSession, MessageRole
from chat.schemas import (
    AskResponse,
    MessageRead,
    SessionCreate,
    SessionDetail,
    SourceRead,
)
from courses.service import get_course_or_404, get_lesson_or_404_by_id
from enrollments.service import is_lesson_accessible, is_student_enrolled
from core.config import settings
from core.llm import embed_text, generate
from materials.service import get_chunks_by_ids, search_chunks_by_lesson

logger = logging.getLogger(__name__)

TOP_K = 5

# Chunks run ~800 chars; a citation only needs enough to recognise the passage.
SNIPPET_MAX_CHARS = 300

SYSTEM_PROMPT_TEMPLATE = """Ти — AI-репетитор. Відповідай ТІЛЬКИ на основі наданого контексту.

Ти пояснюєш, а не видаєш готові відповіді.
- Якщо питання схоже на запит прямої відповіді з тесту — НЕ називай
  фінальну відповідь. Поясни релевантне поняття і постав навідне
  запитання, яке підведе студента до відповіді самостійно.
- Формулювання: "Подумай про...", "У матеріалі згадується...",
  "Яка різниця між X та Y?"
- Для звичайних питань — відповідай нормально й детально.

Якщо наданий контекст не містить інформації для відповіді на питання —
чесно скажи, що в матеріалах уроку цього немає, і запропонуй запитати
по темі уроку. НІКОЛИ не відповідай зі своїх загальних знань поза
контекстом, навіть якщо знаєш відповідь.

Контекст з матеріалів уроку:
{context}
"""

NO_MATERIALS_ANSWER = (
    "Матеріали уроку ще не завантажені або обробляються. "
    "Повернись пізніше, коли викладач додасть матеріали."
)

OFF_TOPIC_ANSWER = (
    "У матеріалах цього уроку немає інформації з цього питання. "
    "Спробуй запитати щось по темі уроку."
)


async def _get_session_or_404(
    db: AsyncSession, session_id: uuid.UUID
) -> ChatSession:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return session


def _ensure_owner(session: ChatSession, user: User) -> None:
    if session.student_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not the session owner"
        )


def _snippet(content: str) -> str:
    if len(content) <= SNIPPET_MAX_CHARS:
        return content
    return content[:SNIPPET_MAX_CHARS].rstrip() + "…"


async def _build_sources(
    db: AsyncSession, chunk_ids: Sequence[str]
) -> list[SourceRead]:
    """Resolve stored chunk ids into snippets, keeping the stored order.

    Ids that no longer resolve are dropped: a reprocessed material replaces its
    chunks with new ones, so old citations legitimately dangle.
    """
    parsed: list[uuid.UUID] = []
    for raw in chunk_ids:
        try:
            parsed.append(uuid.UUID(raw))
        except (AttributeError, TypeError, ValueError):
            continue
    if not parsed:
        return []
    by_id = {
        chunk.id: SourceRead(
            id=chunk.id,
            content=_snippet(chunk.content),
            filename=filename,
            chunk_index=chunk.chunk_index,
        )
        for chunk, filename in await get_chunks_by_ids(db, parsed)
    }
    return [by_id[chunk_id] for chunk_id in parsed if chunk_id in by_id]


async def _messages_to_reads(
    db: AsyncSession, messages: Sequence[ChatMessage]
) -> list[MessageRead]:
    """Serialize messages, resolving every message's sources in one query."""
    all_ids = [cid for m in messages for cid in (m.sources or [])]
    lookup = {str(s.id): s for s in await _build_sources(db, all_ids)}
    return [
        MessageRead(
            id=m.id,
            session_id=m.session_id,
            role=m.role,
            content=m.content,
            sources=[lookup[cid] for cid in (m.sources or []) if cid in lookup],
            created_at=m.created_at,
        )
        for m in messages
    ]


async def create_session(
    db: AsyncSession, payload: SessionCreate, user: User
) -> ChatSession:
    lesson = await get_lesson_or_404_by_id(db, payload.lesson_id)
    course = await get_course_or_404(db, lesson.course_id)

    privileged = user.role == UserRole.admin or course.teacher_id == user.id
    if not privileged:
        if not await is_student_enrolled(db, user.id, course.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Must be enrolled in the course to start a chat session",
            )
        if not await is_lesson_accessible(db, user.id, lesson.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Lesson is locked, complete previous lessons first",
            )

    title = payload.title or f"Chat: {lesson.title}"
    session = ChatSession(
        student_id=user.id, lesson_id=lesson.id, title=title[:255]
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def list_my_sessions(
    db: AsyncSession, user: User
) -> list[ChatSession]:
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.student_id == user.id)
        .order_by(ChatSession.created_at.desc())
    )
    return list(result.scalars().all())


async def get_session_with_messages(
    db: AsyncSession, session_id: uuid.UUID, user: User
) -> SessionDetail:
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.id == session_id)
        .options(selectinload(ChatSession.messages))
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _ensure_owner(session, user)
    return SessionDetail(
        id=session.id,
        student_id=session.student_id,
        lesson_id=session.lesson_id,
        title=session.title,
        created_at=session.created_at,
        messages=await _messages_to_reads(db, session.messages),
    )


async def list_session_messages(
    db: AsyncSession, session_id: uuid.UUID, user: User
) -> list[MessageRead]:
    session = await _get_session_or_404(db, session_id)
    _ensure_owner(session, user)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    return await _messages_to_reads(db, list(result.scalars().all()))


async def delete_session(
    db: AsyncSession, session_id: uuid.UUID, user: User
) -> None:
    session = await _get_session_or_404(db, session_id)
    _ensure_owner(session, user)
    await db.delete(session)
    await db.commit()


async def _save_and_return(
    db: AsyncSession, session_id: uuid.UUID, answer: str, sources: list[SourceRead]
) -> AskResponse:
    db.add(
        ChatMessage(
            session_id=session_id,
            role=MessageRole.assistant,
            content=answer,
            sources=[str(source.id) for source in sources],
        )
    )
    await db.commit()
    return AskResponse(answer=answer, sources=sources)


async def ask(
    db: AsyncSession, session_id: uuid.UUID, question: str, user: User
) -> AskResponse:
    session = await _get_session_or_404(db, session_id)
    _ensure_owner(session, user)

    user_msg = ChatMessage(
        session_id=session.id,
        role=MessageRole.user,
        content=question,
        sources=[],
    )
    db.add(user_msg)
    await db.commit()

    query_vec = await embed_text(question)
    scored = await search_chunks_by_lesson(
        db, session.lesson_id, query_vec, top_k=TOP_K
    )

    if not scored:
        return await _save_and_return(db, session.id, NO_MATERIALS_ANSWER, [])

    threshold = settings.RAG_DISTANCE_THRESHOLD
    relevant = [(c, d) for c, d in scored if d <= threshold]
    if not relevant:
        logger.info(
            "RAG off-topic: session=%s min_distance=%.4f threshold=%.4f",
            session.id,
            scored[0][1],
            threshold,
        )
        return await _save_and_return(db, session.id, OFF_TOPIC_ANSWER, [])

    chunks = [c for c, _ in relevant]
    context = "\n\n".join(
        f"[{i + 1}] {chunk.content}" for i, chunk in enumerate(chunks)
    )
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context=context)

    # Same code path as message history, so a live answer and its replay from
    # the DB always carry identically-shaped sources. It also fetches the
    # material filename, which retrieval doesn't select.
    sources = await _build_sources(db, [str(chunk.id) for chunk in chunks])
    answer = await generate(prompt=question, system=system_prompt)
    return await _save_and_return(db, session.id, answer, sources)
