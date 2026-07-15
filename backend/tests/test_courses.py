async def test_create_course_teacher_201(client, teacher, auth_headers):
    r = await client.post(
        "/api/courses/",
        headers=auth_headers(teacher),
        json={"title": "Math", "is_published": True},
    )
    assert r.status_code == 201
    assert r.json()["teacher_id"] == str(teacher.id)


async def test_create_course_student_403(client, student, auth_headers):
    r = await client.post(
        "/api/courses/",
        headers=auth_headers(student),
        json={"title": "Math", "is_published": True},
    )
    assert r.status_code == 403


async def test_patch_others_course_403(
    client, published_course, auth_headers, db
):
    from auth.models import User, UserRole
    from core.security import hash_password
    import uuid

    stranger = User(
        email=f"stranger_{uuid.uuid4().hex[:6]}@t.com",
        hashed_password=hash_password("pass1234"),
        full_name="Stranger",
        role=UserRole.teacher,
        is_active=True,
    )
    db.add(stranger)
    await db.commit()
    await db.refresh(stranger)

    r = await client.patch(
        f"/api/courses/{published_course.id}",
        headers=auth_headers(stranger),
        json={"title": "Hacked"},
    )
    assert r.status_code == 403


async def test_list_lessons_without_enrollment_403(
    client, published_course, lesson, student, auth_headers
):
    r = await client.get(
        f"/api/courses/{published_course.id}/lessons/",
        headers=auth_headers(student),
    )
    assert r.status_code == 403
