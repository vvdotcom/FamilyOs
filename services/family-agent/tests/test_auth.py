from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FAMILYOS_AUTH_MODE", "local")
    monkeypatch.setenv("FAMILYOS_AUTH_DB_PATH", str(tmp_path / "familyos-auth.sqlite3"))
    monkeypatch.setenv("FAMILYOS_LOCAL_AUTH_SHOW_CODES", "true")
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("RAILWAY_PROJECT_ID", raising=False)
    main = importlib.reload(importlib.import_module("app.main"))
    with TestClient(main.app) as test_client:
        yield test_client


def local_code(client: TestClient, email: str, purpose: str) -> str:
    response = client.get("/v1/auth/dev-email/latest", params={"email": email, "purpose": purpose})
    assert response.status_code == 200
    return response.json()["data"]["code"]


def create_verified_account(client: TestClient, email: str = "parent@example.test") -> None:
    response = client.post(
        "/v1/auth/sign-up",
        json={
            "email": email,
            "password": "family-secret-123",
            "parentName": "Alex Rivera",
            "householdName": "Rivera Family",
        },
    )
    assert response.status_code == 200
    assert "password" not in response.text.lower()
    code = local_code(client, email, "verify_email")
    verified = client.post("/v1/auth/verify-email", json={"email": email, "code": code})
    assert verified.status_code == 200


def test_local_parent_account_requires_verified_email_and_signs_out(client: TestClient):
    response = client.post(
        "/v1/auth/sign-up",
        json={
            "email": "parent@example.test",
            "password": "family-secret-123",
            "parentName": "Alex Rivera",
            "householdName": "Rivera Family",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["verificationRequired"] is True

    before_verification = client.post(
        "/v1/auth/sign-in", json={"email": "parent@example.test", "password": "family-secret-123"}
    )
    assert before_verification.status_code == 403

    code = local_code(client, "parent@example.test", "verify_email")
    verified = client.post("/v1/auth/verify-email", json={"email": "parent@example.test", "code": code})
    assert verified.status_code == 200
    assert verified.cookies.get("familyos_session")
    assert verified.headers["set-cookie"].lower().find("httponly") >= 0

    session = client.get("/v1/auth/session").json()["data"]
    assert session["authenticated"] is True
    assert session["account"]["householdName"] == "Rivera Family"

    signed_out = client.post("/v1/auth/sign-out")
    assert signed_out.status_code == 200
    assert client.get("/v1/auth/session").json()["data"]["authenticated"] is False


def test_local_password_recovery_revokes_sessions_and_accepts_new_password(client: TestClient):
    create_verified_account(client)
    assert client.get("/v1/auth/session").json()["data"]["authenticated"] is True

    response = client.post("/v1/auth/forgot-password", json={"email": "parent@example.test"})
    assert response.status_code == 200
    code = local_code(client, "parent@example.test", "reset_password")

    reset = client.post(
        "/v1/auth/reset-password",
        json={"email": "parent@example.test", "code": code, "newPassword": "different-secret-456"},
    )
    assert reset.status_code == 200
    assert client.get("/v1/auth/session").json()["data"]["authenticated"] is False
    assert client.post(
        "/v1/auth/sign-in", json={"email": "parent@example.test", "password": "family-secret-123"}
    ).status_code == 401
    assert client.post(
        "/v1/auth/sign-in", json={"email": "parent@example.test", "password": "different-secret-456"}
    ).status_code == 200


def test_verification_code_is_single_use_and_attempt_limited(client: TestClient):
    response = client.post(
        "/v1/auth/sign-up",
        json={
            "email": "parent@example.test",
            "password": "family-secret-123",
            "parentName": "Alex",
            "householdName": "Rivera Family",
        },
    )
    assert response.status_code == 200
    code = local_code(client, "parent@example.test", "verify_email")
    assert client.post("/v1/auth/verify-email", json={"email": "parent@example.test", "code": code}).status_code == 200
    reused = client.post("/v1/auth/verify-email", json={"email": "parent@example.test", "code": code})
    assert reused.status_code == 400


def test_companion_page_is_served_by_the_local_api(client: TestClient):
    response = client.get("/companion/")
    assert response.status_code == 200
    assert "Create parent account" in response.text


def test_deployment_environment_fails_closed(monkeypatch, tmp_path):
    monkeypatch.setenv("FAMILYOS_AUTH_MODE", "local")
    monkeypatch.setenv("FAMILYOS_AUTH_DB_PATH", str(tmp_path / "blocked.sqlite3"))
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="blocked unless Cognito authentication"):
        importlib.reload(importlib.import_module("app.main"))


def test_native_bearer_session_requires_token_and_is_revoked_on_signout(client: TestClient):
    create_verified_account(client)
    browser_reply = client.post('/v1/auth/sign-in', json={
        'email': 'parent@example.test', 'password': 'family-secret-123',
    })
    assert 'sessionToken' not in browser_reply.json()['data']
    client.cookies.clear()
    reply = client.post('/v1/auth/sign-in', headers={'X-FamilyOS-Session-Transport': 'bearer'}, json={
        'email': 'parent@example.test', 'password': 'family-secret-123',
    })
    token = reply.json()['data']['sessionToken']
    assert reply.headers['cache-control'] == 'no-store'
    assert 'set-cookie' not in reply.headers
    assert client.get('/v1/auth/session').json()['data']['authenticated'] is False
    headers = {'Authorization': f'Bearer {token}'}
    assert client.get('/v1/auth/session', headers=headers).json()['data']['authenticated'] is True
    assert client.post('/v1/auth/sign-out', headers=headers).status_code == 200
    assert client.get('/v1/auth/session', headers=headers).json()['data']['authenticated'] is False
