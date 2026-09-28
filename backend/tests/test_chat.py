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
    assert [s["id"] for s in body["sources"]] == [str(chunk.id)]
    assert body["sources"][0]["content"] == "Test chunk content about photosynthesis."
    assert body["sources"][0]["filename"] == "seed.txt"
    assert body["sources"][0]["chunk_index"] == 0

    msgs = await client.get(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(enrolled_student),
    )
    history = msgs.json()
    roles = [m["role"] for m in history]
    assert roles == ["user", "assistant"]
    # History replays the same sources the live answer carried.
    assert history[0]["sources"] == []
    assert [s["id"] for s in history[1]["sources"]] == [str(chunk.id)]
    assert history[1]["sources"][0]["filename"] == "seed.txt"
    assert llm_mocks.generate.await_count == 1


async def test_session_detail_resolves_sources(
    client, enrolled_student, lessons, db, auth_headers, monkeypatch
):
    _mat, chunk = await _seed_ready_material(db, lessons[0].id)

    async def fake_search(_db, _lesson_id, _q, top_k=5):
        return [(chunk, 0.10)]

    monkeypatch.setattr("chat.service.search_chunks_by_lesson", fake_search)

    session = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(enrolled_student),
        json={"lesson_id": str(lessons[0].id)},
    )
    sid = session.json()["id"]
    await client.post(
        f"/api/chat/sessions/{sid}/ask",
        headers=auth_headers(enrolled_student),
        json={"question": "Що це?"},
    )

    detail = await client.get(
        f"/api/chat/sessions/{sid}", headers=auth_headers(enrolled_student)
    )
    assert detail.status_code == 200
    messages = detail.json()["messages"]
    assert len(messages) == 2
    assert [s["id"] for s in messages[1]["sources"]] == [str(chunk.id)]


async def test_sources_of_deleted_chunk_are_dropped(
    client, enrolled_student, lessons, db, auth_headers, monkeypatch
):
    """A reprocessed material replaces its chunks, so old citations dangle —
    history must still render, just without the unresolvable source."""
    mat, chunk = await _seed_ready_material(db, lessons[0].id)

    async def fake_search(_db, _lesson_id, _q, top_k=5):
        return [(chunk, 0.10)]

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
        json={"question": "Що це?"},
    )
    assert len(ask.json()["sources"]) == 1

    await db.delete(mat)  # cascades to its chunks
    await db.commit()

    msgs = await client.get(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(enrolled_student),
    )
    assert msgs.status_code == 200
    assert msgs.json()[1]["sources"] == []


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
