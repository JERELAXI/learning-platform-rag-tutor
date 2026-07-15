from courses.models import Course


async def test_enroll_201_and_lesson_statuses(
    client, published_course, lessons, student, auth_headers
):
    r = await client.post(
        "/api/enrollments/",
        headers=auth_headers(student),
        json={"course_id": str(published_course.id)},
    )
    assert r.status_code == 201
    assert r.json()["progress"] == 0.0

    lst = await client.get(
        f"/api/courses/{published_course.id}/lessons/",
        headers=auth_headers(student),
    )
    assert lst.status_code == 200
    statuses = {l["title"]: l["status"] for l in lst.json()}
    assert statuses == {"L1": "available", "L2": "locked", "L3": "locked"}


async def test_enroll_duplicate_400(
    client, published_course, student, auth_headers
):
    body = {"course_id": str(published_course.id)}
    first = await client.post(
        "/api/enrollments/", headers=auth_headers(student), json=body
    )
    assert first.status_code == 201
    dup = await client.post(
        "/api/enrollments/", headers=auth_headers(student), json=body
    )
    assert dup.status_code == 400


async def test_enroll_unpublished_400(
    client, teacher, student, auth_headers, db
):
    draft = Course(
        title="Draft",
        teacher_id=teacher.id,
        is_published=False,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)

    r = await client.post(
        "/api/enrollments/",
        headers=auth_headers(student),
        json={"course_id": str(draft.id)},
    )
    assert r.status_code == 400
