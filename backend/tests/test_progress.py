from typing import Any

from quizzes.models import Quiz


async def _create_quiz(db, lesson_id, n=2):
    q = Quiz(
        lesson_id=lesson_id,
        questions=[
            {
                "question": f"Q{i}",
                "options": ["a", "b", "c", "d"],
                "correct_index": i % 4,
            }
            for i in range(n)
        ],
        pass_threshold=60.0,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q


async def test_get_locked_lesson_403(
    client, enrolled_student, lessons, published_course, auth_headers
):
    r = await client.get(
        f"/api/courses/{published_course.id}/lessons/{lessons[1].id}",
        headers=auth_headers(enrolled_student),
    )
    assert r.status_code == 403


async def test_lesson_list_withholds_locked_content(
    client, enrolled_student, lessons, published_course, teacher, db, auth_headers
):
    """Status alone is not protection — the list must not ship locked bodies."""
    for lesson in lessons:
        lesson.content = f"secret body of {lesson.title}"
    await db.commit()

    lst = await client.get(
        f"/api/courses/{published_course.id}/lessons/",
        headers=auth_headers(enrolled_student),
    )
    assert lst.status_code == 200
    by_title = {item["title"]: item for item in lst.json()}

    assert by_title["L1"]["status"] == "available"
    assert by_title["L1"]["content"] == "secret body of L1"
    for title in ("L2", "L3"):
        assert by_title[title]["status"] == "locked"
        assert by_title[title]["content"] is None

    # The owner sees every body — they wrote them.
    owner_view = await client.get(
        f"/api/courses/{published_course.id}/lessons/",
        headers=auth_headers(teacher),
    )
    assert all(item["content"] is not None for item in owner_view.json())


async def test_chat_session_on_locked_403(
    client, enrolled_student, lessons, auth_headers
):
    r = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(enrolled_student),
        json={"lesson_id": str(lessons[1].id)},
    )
    assert r.status_code == 403


async def test_manual_complete_no_quiz_unlocks_next(
    client, enrolled_student, lessons, published_course, auth_headers
):
    r = await client.post(
        f"/api/courses/{published_course.id}/lessons/{lessons[0].id}/complete",
        headers=auth_headers(enrolled_student),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"

    lst = await client.get(
        f"/api/courses/{published_course.id}/lessons/",
        headers=auth_headers(enrolled_student),
    )
    st = {l["title"]: l["status"] for l in lst.json()}
    assert st == {"L1": "completed", "L2": "available", "L3": "locked"}

    my = await client.get(
        "/api/enrollments/my", headers=auth_headers(enrolled_student)
    )
    assert abs(my.json()[0]["progress"] - 33.33) < 0.1


async def test_manual_complete_lesson_with_quiz_400(
    client, enrolled_student, lessons, published_course, db, auth_headers
):
    await _create_quiz(db, lessons[0].id)
    r = await client.post(
        f"/api/courses/{published_course.id}/lessons/{lessons[0].id}/complete",
        headers=auth_headers(enrolled_student),
    )
    assert r.status_code == 400
    assert "quiz" in r.json()["detail"].lower()


async def test_quiz_pass_completes_lesson_and_unlocks_next(
    client, enrolled_student, lessons, db, auth_headers
):
    quiz = await _create_quiz(db, lessons[0].id, n=2)  # correct = [0, 1]
    r = await client.post(
        f"/api/quizzes/{quiz.id}/submit",
        headers=auth_headers(enrolled_student),
        json={"answers": [0, 1]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["score"] == 100.0
    assert data["passed"] is True
    assert data["lesson_completed"] is True

    lst = await client.get(
        f"/api/courses/{lessons[0].course_id}/lessons/",
        headers=auth_headers(enrolled_student),
    )
    st = {l["title"]: l["status"] for l in lst.json()}
    assert st["L1"] == "completed"
    assert st["L2"] == "available"
    assert st["L3"] == "locked"


async def test_quiz_fail_keeps_next_locked(
    client, enrolled_student, lessons, db, auth_headers
):
    quiz = await _create_quiz(db, lessons[0].id, n=2)  # correct = [0, 1]
    r = await client.post(
        f"/api/quizzes/{quiz.id}/submit",
        headers=auth_headers(enrolled_student),
        json={"answers": [1, 2]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["score"] == 0.0
    assert data["passed"] is False
    assert data["lesson_completed"] is False

    lst = await client.get(
        f"/api/courses/{lessons[0].course_id}/lessons/",
        headers=auth_headers(enrolled_student),
    )
    st = {l["title"]: l["status"] for l in lst.json()}
    assert st["L2"] == "locked"
