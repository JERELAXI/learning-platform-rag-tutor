from auth.models import UserRole


async def test_deactivate_then_activate_restores_login(
    client, admin, student, auth_headers
):
    """A wrong click must not lock an account out permanently."""
    deactivated = await client.patch(
        f"/api/users/{student.id}/deactivate", headers=auth_headers(admin)
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    denied = await client.post(
        "/api/auth/login-json",
        json={"email": student.email, "password": "pass1234"},
    )
    assert denied.status_code == 401

    activated = await client.patch(
        f"/api/users/{student.id}/activate", headers=auth_headers(admin)
    )
    assert activated.status_code == 200
    assert activated.json()["is_active"] is True

    allowed = await client.post(
        "/api/auth/login-json",
        json={"email": student.email, "password": "pass1234"},
    )
    assert allowed.status_code == 200
    assert "access_token" in allowed.json()


async def test_activate_is_idempotent(client, admin, teacher, auth_headers):
    for _ in range(2):
        response = await client.patch(
            f"/api/users/{teacher.id}/activate", headers=auth_headers(admin)
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is True


async def test_activate_requires_admin(client, teacher, student, auth_headers):
    response = await client.patch(
        f"/api/users/{student.id}/activate", headers=auth_headers(teacher)
    )
    assert response.status_code == 403


async def test_activate_unknown_user_404(client, admin, auth_headers):
    response = await client.patch(
        "/api/users/00000000-0000-0000-0000-000000000000/activate",
        headers=auth_headers(admin),
    )
    assert response.status_code == 404


async def test_admin_cannot_deactivate_self(client, admin, auth_headers):
    response = await client.patch(
        f"/api/users/{admin.id}/deactivate", headers=auth_headers(admin)
    )
    assert response.status_code == 400
    assert "yourself" in response.json()["detail"].lower()


async def test_role_change_round_trip(client, admin, student, auth_headers):
    promoted = await client.patch(
        f"/api/users/{student.id}/role",
        headers=auth_headers(admin),
        json={"role": UserRole.teacher.value},
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "teacher"

    demoted = await client.patch(
        f"/api/users/{student.id}/role",
        headers=auth_headers(admin),
        json={"role": UserRole.student.value},
    )
    assert demoted.json()["role"] == "student"
