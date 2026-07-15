from materials.models import DocumentChunk, Material, MaterialStatus


async def _seed_material_with_text(db, lesson_id) -> None:
    mat = Material(
        lesson_id=lesson_id,
        filename="s.txt",
        file_path="/tmp/s.txt",
        file_type="txt",
        status=MaterialStatus.ready,
    )
    db.add(mat)
    await db.flush()
    db.add(
        DocumentChunk(
            material_id=mat.id,
            content="Some source text for the quiz.",
            embedding=[0.02] * 1536,
            chunk_index=0,
        )
    )
    await db.commit()


async def test_generate_teacher_201(
    client, teacher, lesson, db, auth_headers
):
    await _seed_material_with_text(db, lesson.id)
    r = await client.post(
        "/api/quizzes/generate",
        headers=auth_headers(teacher),
        json={"lesson_id": str(lesson.id), "num_questions": 4},
    )
    assert r.status_code == 201
    body = r.json()
    assert len(body["questions"]) == 4
    assert body["questions"][0]["correct_index"] in (0, 1, 2, 3)


async def test_generate_student_403(
    client, student, lesson, auth_headers
):
    r = await client.post(
        "/api/quizzes/generate",
        headers=auth_headers(student),
        json={"lesson_id": str(lesson.id), "num_questions": 3},
    )
    assert r.status_code == 403


async def test_generate_twice_400(
    client, teacher, lesson, db, auth_headers
):
    await _seed_material_with_text(db, lesson.id)
    body = {"lesson_id": str(lesson.id), "num_questions": 3}
    first = await client.post(
        "/api/quizzes/generate", headers=auth_headers(teacher), json=body
    )
    assert first.status_code == 201
    dup = await client.post(
        "/api/quizzes/generate", headers=auth_headers(teacher), json=body
    )
    assert dup.status_code == 400


async def test_get_quiz_student_hides_correct_index(
    client, enrolled_student, teacher, lessons, db, auth_headers
):
    await _seed_material_with_text(db, lessons[0].id)
    gen = await client.post(
        "/api/quizzes/generate",
        headers=auth_headers(teacher),
        json={"lesson_id": str(lessons[0].id), "num_questions": 3},
    )
    quiz_id = gen.json()["id"]

    student_view = await client.get(
        f"/api/quizzes/{quiz_id}", headers=auth_headers(enrolled_student)
    )
    assert student_view.status_code == 200
    for q in student_view.json()["questions"]:
        assert "correct_index" not in q

    teacher_view = await client.get(
        f"/api/quizzes/{quiz_id}", headers=auth_headers(teacher)
    )
    for q in teacher_view.json()["questions"]:
        assert "correct_index" in q


async def test_submit_scores_correctly(
    client, enrolled_student, teacher, lessons, db, auth_headers
):
    await _seed_material_with_text(db, lessons[0].id)
    gen = await client.post(
        "/api/quizzes/generate",
        headers=auth_headers(teacher),
        json={"lesson_id": str(lessons[0].id), "num_questions": 4},
    )
    quiz_id = gen.json()["id"]
    # Mock quiz correct_index = i % 4 → [0, 1, 2, 3]. Answer 2/4 correctly:
    answers = [0, 1, 0, 0]  # first two right, last two wrong

    r = await client.post(
        f"/api/quizzes/{quiz_id}/submit",
        headers=auth_headers(enrolled_student),
        json={"answers": answers},
    )
    assert r.status_code == 200
    assert r.json()["score"] == 50.0


async def test_generate_invalid_json_after_retry_502(
    client, teacher, lesson, db, auth_headers, llm_mocks
):
    await _seed_material_with_text(db, lesson.id)

    llm_mocks.generate.side_effect = ["not json", "still not json"]

    r = await client.post(
        "/api/quizzes/generate",
        headers=auth_headers(teacher),
        json={"lesson_id": str(lesson.id), "num_questions": 3},
    )
    assert r.status_code == 502
    assert llm_mocks.generate.await_count == 2
