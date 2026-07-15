import uuid

from materials.models import DocumentChunk, Material, MaterialStatus


async def _seed_ready_material(db, lesson_id) -> tuple[Material, DocumentChunk]:
    mat = Material(
        lesson_id=lesson_id,
        filename="seed.txt",
        file_path="/tmp/seed.txt",
        file_type="txt",
        status=MaterialStatus.ready,
    )
    db.add(mat)
    await db.flush()
    chunk = DocumentChunk(
        material_id=mat.id,
        content="Test chunk content about photosynthesis.",
        embedding=[0.01] * 1536,
        chunk_index=0,
    )
    db.add(chunk)
    await db.commit()
    await db.refresh(mat)
    await db.refresh(chunk)
    return mat, chunk


async def test_ask_with_context_saves_answer_and_sources(
    client, enrolled_student, lessons, db, auth_headers, llm_mocks, monkeypatch
):
    _mat, chunk = await _seed_ready_material(db, lessons[0].id)

    # Force retrieval to return our chunk with low (relevant) distance.
    async def fake_search(_db, _lesson_id, _q, top_k=5):
        return [(chunk, 0.10)]

    monkeypatch.setattr("chat.service.search_chunks_by_lesson", fake_search)

    session = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(enrolled_student),
        json={"lesson_id": str(lessons[0].id)},
    )
    assert session.status_code == 201
    sid = session.json()["id"]

    ask = await client.post(
        f"/api/chat/sessions/{sid}/ask",
        headers=auth_headers(enrolled_student),
        json={"question": "Що це?"},
    )
    assert ask.status_code == 200
    body = ask.json()
    assert body["answer"] == "AI: Подумай про це."
    assert body["sources"] == [str(chunk.id)]

    msgs = await client.get(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(enrolled_student),
    )
    roles = [m["role"] for m in msgs.json()]
    assert roles == ["user", "assistant"]
    assert llm_mocks.generate.await_count == 1


async def test_ask_no_materials_returns_no_materials_without_llm_call(
    client, enrolled_student, lessons, auth_headers, llm_mocks
):
    session = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(enrolled_student),
        json={"lesson_id": str(lessons[0].id)},
    )
    sid = session.json()["id"]

    ask = await client.post(
        f"/api/chat/sessions/{sid}/ask",
        headers=auth_headers(enrolled_student),
        json={"question": "Anything?"},
    )
    assert ask.status_code == 200
    assert ask.json()["sources"] == []
    assert "матеріали" in ask.json()["answer"].lower()
    assert llm_mocks.generate.await_count == 0


async def test_ask_off_topic_returns_off_topic_without_llm_call(
    client, enrolled_student, lessons, db, auth_headers, llm_mocks, monkeypatch
):
    _mat, chunk = await _seed_ready_material(db, lessons[0].id)

    async def fake_search(_db, _lesson_id, _q, top_k=5):
        return [(chunk, 0.95)]  # above default threshold 0.55

    monkeypatch.setattr("chat.service.search_chunks_by_lesson", fake_search)

    session = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(enrolled_student),
        json={"lesson_id": str(lessons[0].id)},
    )
    sid = session.json()["id"]

    ask = await client.post(
        f"/api/chat/sessions/{sid}/ask",
        headers=auth_headers(enrolled_student),
        json={"question": "Off-topic thing"},
    )
    assert ask.status_code == 200
    assert ask.json()["sources"] == []
    assert "не" in ask.json()["answer"].lower()
    assert llm_mocks.generate.await_count == 0
