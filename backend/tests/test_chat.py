import uuid

from chat.service import SYSTEM_PROMPT_TEMPLATE
from materials.models import DocumentChunk, Material, MaterialStatus


def test_socratic_prompt_keeps_its_guardrails():
    """The LLM is mocked everywhere else, so prompt quality cannot be asserted
    end to end. What this does protect is the set of clauses the tutor's
    behaviour depends on — none of them should quietly disappear."""
    prompt = SYSTEM_PROMPT_TEMPLATE.lower()

    # Refuses to hand over a factual answer token.
    assert "не називаєш її" in prompt
    # Treats the student's message as a question, not as new instructions.
    assert "а не інструкція" in prompt
    assert "напиши одразу відповідь" in prompt
    # Still explains mechanisms, so the tutor stays useful.
    assert "коли відповідати повністю" in prompt
    # Never answers outside the retrieved context.
    assert "ніколи" in prompt
    assert "{context}" in SYSTEM_PROMPT_TEMPLATE

    # The old prompt offered "У матеріалі згадується..." as sample phrasing and
    # the model used it to deliver the answer politely. It must not come back.
    assert "у матеріалі згадується" not in prompt


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


async def test_ask_replays_the_thread_so_the_tutor_can_follow_up(
    client, enrolled_student, lessons, db, auth_headers, llm_mocks, monkeypatch
):
    """The Socratic method is a dialogue: without history the tutor cannot tell
    that the student is answering the question it just asked."""
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
    headers = auth_headers(enrolled_student)

    first = await client.post(
        f"/api/chat/sessions/{sid}/ask", headers=headers, json={"question": "Що таке хлорофіл?"}
    )
    assert first.status_code == 200
    # Nothing came before, so the first call carries no history.
    assert llm_mocks.generate.await_args.kwargs["history"] == []

    second = await client.post(
        f"/api/chat/sessions/{sid}/ask", headers=headers, json={"question": "Це пігмент?"}
    )
    assert second.status_code == 200

    history = llm_mocks.generate.await_args.kwargs["history"]
    # Oldest first, and the new question is the prompt — not part of history.
    assert [turn["role"] for turn in history] == ["user", "assistant"]
    assert history[0]["content"] == "Що таке хлорофіл?"
    assert "Це пігмент?" not in [turn["content"] for turn in history]


async def test_ask_history_is_capped(
    client, enrolled_student, lessons, db, auth_headers, llm_mocks, monkeypatch
):
    """An unbounded thread would grow the prompt (which already holds the lesson
    chunks) without limit."""
    from chat.service import HISTORY_LIMIT

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
    headers = auth_headers(enrolled_student)

    # Each ask stores a user message and an assistant message.
    for i in range(HISTORY_LIMIT):
        await client.post(
            f"/api/chat/sessions/{sid}/ask", headers=headers, json={"question": f"Питання {i}"}
        )

    history = llm_mocks.generate.await_args.kwargs["history"]
    assert len(history) == HISTORY_LIMIT
    # The window keeps the newest turns, so the oldest question has dropped out.
    assert "Питання 0" not in [turn["content"] for turn in history]


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    """Turn an SSE body into [(event, data), ...]."""
    import json as _json

    frames = []
    for block in body.strip().split("\n\n"):
        name = None
        payload = None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line.removeprefix("event: ")
            elif line.startswith("data: "):
                payload = _json.loads(line.removeprefix("data: "))
        if name is not None:
            frames.append((name, payload))
    return frames


async def test_ask_stream_emits_sources_then_tokens_then_done(
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

    response = await client.post(
        f"/api/chat/sessions/{sid}/ask/stream",
        headers=auth_headers(enrolled_student),
        json={"question": "Що таке хлорофіл?"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    frames = _parse_sse(response.text)
    names = [name for name, _ in frames]

    # Citations arrive before the answer, so the UI can render them while the
    # text is still coming in.
    assert names[0] == "sources"
    assert names[-1] == "done"
    assert names.count("token") > 1

    sources = frames[0][1]["sources"]
    assert [item["id"] for item in sources] == [str(chunk.id)]
    assert sources[0]["filename"] == "seed.txt"

    streamed = "".join(data["text"] for name, data in frames if name == "token")
    assert "Подумай" in streamed

    # What was streamed is what got stored.
    history = await client.get(
        f"/api/chat/sessions/{sid}/messages", headers=auth_headers(enrolled_student)
    )
    assistant = history.json()[1]
    assert assistant["role"] == "assistant"
    # Stored verbatim: the thread must match what the student saw.
    assert assistant["content"] == streamed


async def test_ask_stream_refusal_sends_no_sources_and_skips_the_llm(
    client, enrolled_student, lessons, auth_headers, llm_mocks
):
    session = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(enrolled_student),
        json={"lesson_id": str(lessons[0].id)},
    )
    sid = session.json()["id"]

    response = await client.post(
        f"/api/chat/sessions/{sid}/ask/stream",
        headers=auth_headers(enrolled_student),
        json={"question": "Будь-що?"},
    )
    assert response.status_code == 200

    frames = _parse_sse(response.text)
    assert frames[0][0] == "sources"
    assert frames[0][1]["sources"] == []
    assert frames[-1][0] == "done"

    streamed = "".join(data["text"] for name, data in frames if name == "token")
    assert "матеріали" in streamed.lower()
    assert llm_mocks.generate.await_count == 0


async def test_ask_stream_rejects_a_foreign_session(
    client, enrolled_student, student, lessons, db, auth_headers
):
    from auth.models import User, UserRole
    from core.security import hash_password

    session = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(enrolled_student),
        json={"lesson_id": str(lessons[0].id)},
    )
    sid = session.json()["id"]

    stranger = User(
        email="stranger_stream@t.com",
        hashed_password=hash_password("pass1234"),
        full_name="Stranger",
        role=UserRole.student,
        is_active=True,
    )
    db.add(stranger)
    await db.commit()
    await db.refresh(stranger)

    # Raised before the first yield, so it still surfaces as a real 403 rather
    # than a 200 carrying an error frame.
    response = await client.post(
        f"/api/chat/sessions/{sid}/ask/stream",
        headers=auth_headers(stranger),
        json={"question": "Чуже?"},
    )
    assert response.status_code == 403


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
