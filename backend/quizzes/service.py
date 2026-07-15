import json
import logging
import re
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth.models import User, UserRole
from courses.service import get_course_or_404, get_lesson_or_404_by_id
from core.llm import generate
from enrollments.service import (
    complete_lesson,
    is_student_enrolled,
    recalculate_progress,
)
from materials.service import get_lesson_full_text
from quizzes.models import Quiz, QuizResult
from quizzes.schemas import QuizGenerate, QuizUpdate, ResultRead, SubmitRequest

logger = logging.getLogger(__name__)


QUIZ_PROMPT_TEMPLATE = """На основі наведеного нижче матеріалу уроку згенеруй {n} multiple-choice питань.

Вимоги:
- Мова питань — та сама, що і мова матеріалу.
- Кожне питання має РІВНО 4 варіанти відповідей.
- Тільки один варіант правильний.
- Поверни ТІЛЬКИ валідний JSON-масив без пояснень, без markdown, без обгортки ```json.
- Формат кожного елемента: {{"question": str, "options": [str, str, str, str], "correct_index": int (0-3)}}

Матеріал уроку:
{text}
"""


def _strip_code_fence(raw: str) -> str:
    s = raw.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", s, re.DOTALL)
    if fenced:
        return fenced.group(1).strip()
    return s


def _validate_questions(data: Any, expected_n: int) -> list[dict[str, Any]]:
    if not isinstance(data, list):
        raise ValueError("Top-level must be a list")
    if len(data) != expected_n:
        raise ValueError(f"Expected {expected_n} questions, got {len(data)}")
    for i, q in enumerate(data):
        if not isinstance(q, dict):
            raise ValueError(f"Question {i} is not an object")
        if not isinstance(q.get("question"), str) or not q["question"].strip():
            raise ValueError(f"Question {i}: missing/empty 'question'")
        options = q.get("options")
        if not isinstance(options, list) or len(options) != 4:
            raise ValueError(f"Question {i}: 'options' must be a list of 4")
        if not all(isinstance(o, str) and o.strip() for o in options):
            raise ValueError(f"Question {i}: option strings invalid")
        ci = q.get("correct_index")
        if not isinstance(ci, int) or ci < 0 or ci > 3:
            raise ValueError(f"Question {i}: 'correct_index' must be int 0-3")
    return data


async def _course_for_lesson(
    db: AsyncSession, lesson_id: uuid.UUID
):
    lesson = await get_lesson_or_404_by_id(db, lesson_id)
    course = await get_course_or_404(db, lesson.course_id)
    return lesson, course


def _ensure_owner_or_admin(course, user: User) -> None:
    if user.role == UserRole.admin:
        return
    if course.teacher_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not the course owner"
        )


async def _ensure_can_view(db: AsyncSession, course, user: User) -> None:
    if user.role == UserRole.admin or course.teacher_id == user.id:
        return
    if await is_student_enrolled(db, user.id, course.id):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Must be enrolled in the course to access the quiz",
    )


async def quiz_exists_for_lesson(
    db: AsyncSession, lesson_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(Quiz.id).where(Quiz.lesson_id == lesson_id)
    )
    return result.scalar_one_or_none() is not None


async def get_quiz_or_404(db: AsyncSession, quiz_id: uuid.UUID) -> Quiz:
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = result.scalar_one_or_none()
    if quiz is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found"
        )
    return quiz


async def _generate_questions_with_llm(
    text: str, n: int
) -> tuple[list[dict[str, Any]], bool]:
    prompt = QUIZ_PROMPT_TEMPLATE.format(n=n, text=text)
    retry = False
    raw = await generate(prompt=prompt)
    try:
        parsed = json.loads(_strip_code_fence(raw))
        return _validate_questions(parsed, n), retry
    except (ValueError, json.JSONDecodeError) as first_exc:
        logger.warning("quiz generate: first parse failed: %s", first_exc)
        retry = True
        raw2 = await generate(
            prompt=prompt + "\n\nВАЖЛИВО: поверни ТІЛЬКИ валідний JSON-масив, без markdown.",
        )
        try:
            parsed2 = json.loads(_strip_code_fence(raw2))
            return _validate_questions(parsed2, n), retry
        except (ValueError, json.JSONDecodeError) as second_exc:
            logger.error("quiz generate: retry parse failed: %s", second_exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="LLM failed to produce a valid quiz JSON after retry",
            )


async def generate_quiz(
    db: AsyncSession, payload: QuizGenerate, user: User
) -> Quiz:
    _lesson, course = await _course_for_lesson(db, payload.lesson_id)
    _ensure_owner_or_admin(course, user)

    existing = await db.execute(
        select(Quiz).where(Quiz.lesson_id == payload.lesson_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quiz already exists, use PATCH to edit",
        )

    text = await get_lesson_full_text(db, payload.lesson_id)
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lesson has no ready materials to generate a quiz from",
        )

    logger.info(
        "quiz generate: lesson=%s num_questions=%d text_len=%d",
        payload.lesson_id,
        payload.num_questions,
        len(text),
    )
    questions, retry = await _generate_questions_with_llm(text, payload.num_questions)
    logger.info(
        "quiz generate: lesson=%s parsed_ok retry=%s",
        payload.lesson_id,
        retry,
    )

    quiz = Quiz(lesson_id=payload.lesson_id, questions=questions)
    db.add(quiz)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quiz already exists, use PATCH to edit",
        )
    await db.refresh(quiz)
    return quiz


async def update_quiz(
    db: AsyncSession, quiz_id: uuid.UUID, payload: QuizUpdate, user: User
) -> Quiz:
    quiz = await get_quiz_or_404(db, quiz_id)
    _lesson, course = await _course_for_lesson(db, quiz.lesson_id)
    _ensure_owner_or_admin(course, user)

    if payload.questions is not None:
        raw = [q.model_dump() for q in payload.questions]
        quiz.questions = _validate_questions(raw, len(raw))
    if payload.pass_threshold is not None:
        quiz.pass_threshold = payload.pass_threshold

    await db.commit()
    await db.refresh(quiz)
    return quiz


async def get_quiz_for_user(
    db: AsyncSession, quiz_id: uuid.UUID, user: User
) -> tuple[Quiz, bool]:
    """Return (quiz, is_owner_or_admin). Caller picks a response schema."""
    quiz = await get_quiz_or_404(db, quiz_id)
    _lesson, course = await _course_for_lesson(db, quiz.lesson_id)
    await _ensure_can_view(db, course, user)
    is_owner_or_admin = (
        user.role == UserRole.admin or course.teacher_id == user.id
    )
    return quiz, is_owner_or_admin


async def submit_quiz(
    db: AsyncSession, quiz_id: uuid.UUID, payload: SubmitRequest, user: User
) -> ResultRead:
    quiz = await get_quiz_or_404(db, quiz_id)
    _lesson, course = await _course_for_lesson(db, quiz.lesson_id)

    # enrolled OR owner OR admin — teacher can self-test their own quiz
    if not (
        user.role == UserRole.admin
        or course.teacher_id == user.id
        or await is_student_enrolled(db, user.id, course.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Must be enrolled in the course to submit the quiz",
        )

    total = len(quiz.questions)
    if len(payload.answers) != total:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Expected {total} answers, got {len(payload.answers)}",
        )

    correct = sum(
        1
        for q, a in zip(quiz.questions, payload.answers)
        if isinstance(a, int) and a == q["correct_index"]
    )
    score = (correct / total) * 100.0 if total > 0 else 0.0

    result = QuizResult(
        student_id=user.id,
        quiz_id=quiz.id,
        score=score,
        answers=list(payload.answers),
    )
    db.add(result)
    await db.commit()
    await db.refresh(result)

    passed = score >= quiz.pass_threshold
    lesson_completed = False
    logger.info(
        "quiz submit: quiz=%s student=%s score=%.2f passed=%s",
        quiz.id,
        user.id,
        score,
        passed,
    )

    if passed and user.role != UserRole.admin and course.teacher_id != user.id:
        await complete_lesson(db, user.id, quiz.lesson_id)
        await recalculate_progress(db, user.id, course.id)
        lesson_completed = True

    return ResultRead.model_validate(result).model_copy(
        update={"passed": passed, "lesson_completed": lesson_completed}
    )


async def list_my_results(
    db: AsyncSession, user: User
) -> list[QuizResult]:
    result = await db.execute(
        select(QuizResult)
        .where(QuizResult.student_id == user.id)
        .order_by(QuizResult.submitted_at.desc())
    )
    return list(result.scalars().all())
