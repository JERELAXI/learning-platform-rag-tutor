from io import BytesIO

from sqlalchemy import select

from materials.models import DocumentChunk


async def test_upload_txt_processes_to_ready(
    client, teacher, lesson, auth_headers, process_task, db
):
    r = await client.post(
        f"/api/lessons/{lesson.id}/materials/",
        headers=auth_headers(teacher),
        files={"file": ("sample.txt", BytesIO(b"hello world test content"), "text/plain")},
    )
    assert r.status_code == 202
    mat = r.json()
    assert mat["status"] == "pending"

    await process_task(mat["id"])

    check = await client.get(
        f"/api/lessons/{lesson.id}/materials/{mat['id']}",
        headers=auth_headers(teacher),
    )
    assert check.json()["status"] == "ready"

    result = await db.execute(
        select(DocumentChunk).where(DocumentChunk.material_id == mat["id"])
    )
    chunks = list(result.scalars().all())
    assert len(chunks) >= 1
    assert len(chunks[0].embedding) == 1536


async def test_upload_unsupported_extension_400(
    client, teacher, lesson, auth_headers
):
    r = await client.post(
        f"/api/lessons/{lesson.id}/materials/",
        headers=auth_headers(teacher),
        files={"file": ("bad.xyz", BytesIO(b"whatever"), "application/octet-stream")},
    )
    assert r.status_code == 400


async def test_list_materials_without_enrollment_403(
    client, lesson, student, auth_headers
):
    r = await client.get(
        f"/api/lessons/{lesson.id}/materials/",
        headers=auth_headers(student),
    )
    assert r.status_code == 403
