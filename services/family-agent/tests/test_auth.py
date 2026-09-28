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
        test_client.app.state.auth_store = main.auth_store
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


def test_parent_access_code_is_hashed_and_rate_limited(client: TestClient):
    create_verified_account(client)
    account_id = client.get('/v1/auth/session').json()['data']['account']['accountId']
    assert client.post('/v1/access-code', json={'code': '12'}).status_code == 422
    configured = client.post('/v1/access-code', json={'code': '4826'})
    assert configured.status_code == 200
    assert '4826' not in configured.text
    with client.app.state.auth_store._connection() as connection:
        row = connection.execute('SELECT salt, code_hash FROM parent_access_codes WHERE account_id = ?', (account_id,)).fetchone()
        assert row is not None and row['salt'] != b'4826' and row['code_hash'] != b'4826'
    for _ in range(5):
        assert client.post('/v1/access-code/change', json={'oldCode': '0000', 'newCode': '4827'}).status_code == 401
    limited = client.post('/v1/access-code/change', json={'oldCode': '4826', 'newCode': '4827'})
    assert limited.status_code == 429


def test_local_reward_approval_requires_code_and_deducts_once(client: TestClient):
    create_verified_account(client)
    response = client.post('/v1/access-code', json={'code': '4826'})
    assert response.status_code == 200
    snapshot = client.get('/v1/household').json()['data']
    revision = snapshot['revision']
    child = {
        'id': 'kid-1', 'familyId': snapshot['family']['id'], 'name': 'Sam', 'initials': 'S',
        'role': 'child', 'accentColor': '#2E7A3A',
    }
    result = client.post('/v1/companion/edit', json={'expectedRevision': revision, 'kind': 'member', 'value': child})
    revision = result.json()['data']['revision']
    chore = {'id': 'tidy-room', 'familyId': snapshot['family']['id'], 'title': 'Tidy room',
             'assignedToMemberId': 'kid-1', 'status': 'pending', 'points': 5}
    result = client.post('/v1/companion/edit', json={'expectedRevision': revision, 'kind': 'chore', 'value': chore})
    revision = result.json()['data']['revision']
    result = client.post('/v1/companion/edit', json={'expectedRevision': revision, 'kind': 'chore',
        'value': {**chore, 'status': 'completed'}})
    snapshot = result.json()['data']
    assert sum(item['delta'] for item in snapshot['starTransactions'] if item['memberId'] == 'kid-1') == 5
    reward = {'id': 'movie-night', 'title': 'Movie night', 'stars': 5, 'available': True}
    result = client.post('/v1/companion/edit', json={'expectedRevision': snapshot['revision'], 'kind': 'reward', 'value': reward})
    request = client.post('/v1/redemptions/request', json={'memberId': 'kid-1', 'rewardId': 'movie-night'})
    assert request.status_code == 200
    redemption_id = request.json()['data']['request']['id']
    pending = client.get('/v1/household').json()['data']
    assert sum(item['delta'] for item in pending['starTransactions'] if item['memberId'] == 'kid-1') == 5
    wrong = client.post(f'/v1/redemptions/{redemption_id}/decision', json={'action': 'approve', 'code': '0000'})
    assert wrong.status_code == 401
    approved = client.post(f'/v1/redemptions/{redemption_id}/decision', json={'action': 'approve', 'code': '4826'})
    assert approved.status_code == 200
    final = approved.json()['data']['household']
    assert sum(item['delta'] for item in final['starTransactions'] if item['memberId'] == 'kid-1') == 0
    assert client.post(f'/v1/redemptions/{redemption_id}/decision', json={'action': 'approve', 'code': '4826'}).status_code == 409


def test_child_mode_is_server_scoped_and_parent_unlock_rotates_session(client: TestClient):
    create_verified_account(client)
    assert client.post('/v1/access/child-session', json={'memberId': 'missing'}).status_code == 409
    assert client.post('/v1/access-code', json={'code': '4826'}).status_code == 200
    household = client.get('/v1/household').json()['data']
    adult = household['members'][0]
    child = {
        'id': 'kid-mode', 'familyId': household['family']['id'], 'name': 'Riley', 'initials': 'R',
        'role': 'child', 'accentColor': '#2E7A3A',
    }
    edit = client.post('/v1/companion/edit', json={'expectedRevision': household['revision'], 'kind': 'member', 'value': child})
    household = edit.json()['data']
    chore = {'id': 'kid-chore', 'familyId': household['family']['id'], 'title': 'Put shoes away',
             'assignedToMemberId': 'kid-mode', 'status': 'pending', 'points': 2}
    household = client.post('/v1/companion/edit', json={'expectedRevision': household['revision'], 'kind': 'chore', 'value': chore}).json()['data']
    code = client.post('/v1/access/child-session', json={'memberId': 'kid-mode'}).json()['data']['sessionToken']
    headers = {'Authorization': f'Bearer {code}'}
    session = client.get('/v1/auth/session', headers=headers).json()['data']
    assert session['accessMode'] == 'child' and session['memberId'] == 'kid-mode'
    assert client.post('/v1/companion/edit', headers=headers, json={
        'expectedRevision': household['revision'], 'kind': 'chore', 'value': {**chore, 'status': 'completed'},
    }).status_code == 403
    completed = client.post('/v1/companion/edit', headers=headers, json={
        'expectedRevision': household['revision'], 'kind': 'completeChore',
        'value': {'id': 'kid-chore', 'memberId': 'kid-mode'},
    })
    assert completed.status_code == 200
    assert completed.json()['data']['starTransactions'][0]['delta'] == 2
    assert client.post('/v1/access/parent-mode', headers=headers, json={'code': '0000'}).status_code == 401
    restored = client.post('/v1/access/parent-mode', headers=headers, json={'code': '4826'})
    assert restored.status_code == 200
    parent_token = restored.json()['data']['sessionToken']
    parent_headers = {'Authorization': f'Bearer {parent_token}'}
    parent_session = client.get('/v1/auth/session', headers=parent_headers).json()['data']
    assert parent_session['accessMode'] == 'parent' and parent_session['elevated'] is True
    # The phone keeps its child session to lock again; it never gains parent rights.
    assert client.get('/v1/auth/session', headers=headers).json()['data']['accessMode'] == 'child'
    assert client.post('/v1/companion/edit', headers=headers, json={
        'expectedRevision': completed.json()['data']['revision'], 'kind': 'chore', 'value': chore,
    }).status_code == 403
    assert client.post('/v1/companion/edit', headers=parent_headers, json={
        'expectedRevision': completed.json()['data']['revision'], 'kind': 'chore', 'value': chore,
    }).status_code == 200
    assert adult['role'] == 'adult'
