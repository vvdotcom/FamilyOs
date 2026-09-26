from __future__ import annotations

from app.domain import DemoRepository, DomainError
from app.pairing import PairingRegistry


def test_pairing_code_is_one_time_and_tv_session_can_be_revoked():
    registry = PairingRegistry(key=b"test-pairing-key")
    challenge = registry.create("Living Room TV", "127.0.0.1")
    assert registry.claim(challenge["challengeId"], challenge["pollingToken"])["status"] == "pending"

    paired = registry.approve("owner-a", challenge["code"])
    assert paired["deviceName"] == "Living Room TV"
    session = registry.claim(challenge["challengeId"], challenge["pollingToken"])
    assert session["status"] == "approved"
    device = registry.device(session["deviceToken"])
    assert device and device.owner_id == "owner-a"
    assert registry.devices("owner-a")[0]["deviceId"] == device.id

    registry.revoke("owner-a", device.id)
    assert registry.device(session["deviceToken"]) is None
    try:
        registry.claim(challenge["challengeId"], challenge["pollingToken"])
    except DomainError as error:
        assert error.status_code == 410
    else:
        raise AssertionError("A revoked device must not receive a new session.")


def test_pairing_code_requires_parent_approval_and_wrong_code_does_not_pair():
    registry = PairingRegistry(key=b"test-pairing-key")
    challenge = registry.create("Kitchen TV", "127.0.0.1")
    try:
        registry.approve("owner-a", "000000" if challenge["code"] != "000000" else "000001")
    except DomainError as error:
        assert error.status_code == 401
    else:
        raise AssertionError("An incorrect code must be rejected.")
    assert registry.claim(challenge["challengeId"], challenge["pollingToken"])["status"] == "pending"


def test_local_pairing_routes_issue_read_only_tv_sessions(monkeypatch):
    from fastapi.testclient import TestClient
    import app.main as main

    class LocalAuth:
        def session(self, token):
            if token == "parent-session":
                return {"accountId": "owner-a", "householdName": "Test House"}
            return None

    monkeypatch.setattr(main, "IS_PRODUCTION", False)
    monkeypatch.setattr(main, "auth_store", LocalAuth())
    monkeypatch.setattr(main, "repository", DemoRepository())
    monkeypatch.setattr(main, "pairing_registry", PairingRegistry(key=b"route-test"))
    client = TestClient(main.app)

    created = client.post("/v1/pairing/challenges", json={"deviceName": "Den TV"})
    assert created.status_code == 200
    challenge = created.json()["data"]
    assert len(challenge["code"]) == 6

    assert client.post("/v1/pairing/approve", json={"code": challenge["code"]}).status_code == 401
    approved = client.post(
        "/v1/pairing/approve", json={"code": challenge["code"]},
        headers={"Authorization": "Bearer parent-session"},
    )
    assert approved.status_code == 200
    device_id = approved.json()["data"]["deviceId"]

    claimed = client.post(
        f"/v1/pairing/challenges/{challenge['challengeId']}/claim",
        json={"pollingToken": challenge["pollingToken"]},
    )
    tv_token = claimed.json()["data"]["deviceToken"]
    tv_headers = {"Authorization": f"Bearer {tv_token}"}
    initial = client.get("/v1/household", headers=tv_headers)
    assert initial.status_code == 200
    assert initial.json()["data"]["revision"] == 0

    edits = [
        ("event", {
            "id": "phone-calendar-event", "title": "Phone calendar sync", "category": "family",
            "startAt": "2030-09-22T18:00:00-07:00", "endAt": "2030-09-22T18:30:00-07:00",
            "ownerMemberId": "alex", "memberIds": ["alex"], "allDay": False,
        }),
        ("chore", {
            "id": "phone-chore", "title": "Phone chore sync", "assignedToMemberId": "emma",
            "status": "pending", "points": 3,
        }),
        ("listItem", {
            "id": "phone-list-item", "listName": "Groceries", "title": "Phone list sync",
            "category": "Produce", "completed": False, "addedBy": "Alex",
        }),
        ("meal", {
            "id": "phone-meal", "title": "Phone meal sync", "date": "2030-09-22",
            "category": "Dinner", "cookIds": ["alex"], "servings": 4, "minutes": 25,
            "ingredients": ["Rice"], "instructions": ["Cook rice"],
        }),
    ]
    for revision, (kind, value) in enumerate(edits):
        changed = client.post(
            "/v1/companion/edit",
            json={"expectedRevision": revision, "kind": kind, "value": value},
            headers={"Authorization": "Bearer parent-session"},
        )
        assert changed.status_code == 200, changed.text
        assert changed.json()["data"]["revision"] == revision + 1

    synced = client.get("/v1/household", headers=tv_headers).json()["data"]
    assert synced["revision"] == 4
    assert any(item["id"] == "phone-calendar-event" for item in synced["events"])
    assert any(item["id"] == "phone-chore" for item in synced["chores"])
    assert any(item["id"] == "phone-list-item" for item in synced["listItems"])
    assert any(item["id"] == "phone-meal" for item in synced["meals"])

    assert client.post(
        "/v1/companion/edit",
        json={"expectedRevision": 0, "kind": "member", "value": {"id": "intruder"}},
        headers=tv_headers,
    ).status_code == 401

    revoked = client.post(
        f"/v1/devices/{device_id}/revoke", headers={"Authorization": "Bearer parent-session"}
    )
    assert revoked.status_code == 200
    assert main.pairing_registry.device(tv_token) is None

    class ProductionAuth:
        def session(self, _token):
            return None

    class ProductionStore:
        def device_session(self, token):
            device = main.pairing_registry.device(token)
            return {"ownerSub": device.owner_id} if device else None

    monkeypatch.setattr(main, "IS_PRODUCTION", True)
    monkeypatch.setattr(main, "production_auth", ProductionAuth())
    monkeypatch.setattr(main, "production_store", ProductionStore())
    assert client.get("/v1/household", headers={"Authorization": f"Bearer {tv_token}"}).status_code == 401

