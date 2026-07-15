async def test_register_ok(client):
    r = await client.post(
        "/api/auth/register",
        json={
            "email": "new@t.com",
            "password": "pass1234",
            "full_name": "New",
            "role": "student",
        },
    )
    assert r.status_code == 201
    assert r.json()["email"] == "new@t.com"


async def test_register_duplicate_400(client):
    body = {
        "email": "dup@t.com",
        "password": "pass1234",
        "full_name": "Dup",
        "role": "student",
    }
    r1 = await client.post("/api/auth/register", json=body)
    assert r1.status_code == 201
    r2 = await client.post("/api/auth/register", json=body)
    assert r2.status_code == 400


async def test_register_admin_forbidden_422(client):
    r = await client.post(
        "/api/auth/register",
        json={
            "email": "bad@t.com",
            "password": "pass1234",
            "full_name": "Bad",
            "role": "admin",
        },
    )
    assert r.status_code == 422


async def test_login_ok_and_wrong_password(client, teacher):
    r = await client.post(
        "/api/auth/login",
        data={"username": teacher.email, "password": "pass1234"},
    )
    assert r.status_code == 200
    assert "access_token" in r.json()

    bad = await client.post(
        "/api/auth/login",
        data={"username": teacher.email, "password": "wrong"},
    )
    assert bad.status_code == 401


async def test_me_requires_token(client, teacher, auth_headers):
    no_token = await client.get("/api/auth/me")
    assert no_token.status_code == 401

    with_token = await client.get("/api/auth/me", headers=auth_headers(teacher))
    assert with_token.status_code == 200
    assert with_token.json()["email"] == teacher.email


async def test_deactivated_user_cannot_login_and_token_rejected(
    client, db, student, auth_headers
):
    headers = auth_headers(student)

    # Verify token works before deactivation
    ok = await client.get("/api/auth/me", headers=headers)
    assert ok.status_code == 200

    student.is_active = False
    await db.commit()

    # Old token → 401
    old = await client.get("/api/auth/me", headers=headers)
    assert old.status_code == 401

    # Fresh login → 401
    login = await client.post(
        "/api/auth/login",
        data={"username": student.email, "password": "pass1234"},
    )
    assert login.status_code == 401
