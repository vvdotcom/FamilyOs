"""The shared demo (judge) account can put its family back to a saved starting point; no other account can."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.demo import create_demo_household
from app.demo_reset import restored_snapshot, with_demo_flag
from conftest import bearer, parent_token

DEMO = "judge-demo@example.test"


def test_restored_snapshot_moves_the_revision_on_and_drops_deleted_photos_and_calendars():
    data = create_demo_household().model_dump(mode="json")
    data["revision"] = 7
    photo = dict(width=10, height=10, bytes=100, createdAt="2026-10-01T09:00:00-07:00")
    data["photos"] = [dict(photo, id="kept"), dict(photo, id="deleted")]
    data["calendars"] = [dict(id="holidays", label="US holidays"), dict(id="gone", label="Work")]
    data["events"].append(dict(data["events"][0], id="from-gone", calendarId="gone"))

    restored = restored_snapshot(data, current_revision=41, photo_ids={"kept"}, calendar_ids={"holidays"})

    assert restored.revision == 42                     # past the live household, so TVs refresh
    assert [item.id for item in restored.photos] == ["kept"]
    assert [item.id for item in restored.calendars] == ["holidays"]
    assert "from-gone" not in {item.id for item in restored.events}
    assert len(restored.events) == len(create_demo_household().events)


def test_demo_flag_comes_only_from_the_configured_list(monkeypatch):
    monkeypatch.delenv("FAMILYOS_DEMO_ACCOUNTS", raising=False)
    assert with_demo_flag({"email": DEMO})["demo"] is False
    monkeypatch.setenv("FAMILYOS_DEMO_ACCOUNTS", f" Other@example.test , {DEMO.upper()} ")
    assert with_demo_flag({"email": DEMO})["demo"] is True
    assert with_demo_flag({"email": "parent@example.test"})["demo"] is False
    assert with_demo_flag(None) is None


def test_local_session_reports_the_demo_account(api, monkeypatch):
    monkeypatch.setenv("FAMILYOS_DEMO_ACCOUNTS", DEMO)
    demo = parent_token(api, DEMO)
    other = parent_token(api, "parent@example.test")
    assert api.client.get("/v1/auth/session", headers=bearer(demo)).json()["data"]["account"]["demo"] is True
    assert api.client.get("/v1/auth/session", headers=bearer(other)).json()["data"]["account"]["demo"] is False


class _Auth:
    def session(self, token):
        return {"accountId": token} if token in ("demo-owner", "family-owner") else None


class _Store:
    def __init__(self):
        self.restored, self.saved = [], []
        self.emails = {"demo-owner": DEMO, "family-owner": "family@example.test"}

    def account_for_owner(self, owner):
        return {"accountId": owner, "email": self.emails[owner]}

    def restore_demo_baseline(self, owner):
        self.restored.append(owner)
        return create_demo_household()

    def save_demo_baseline(self, owner):
        self.saved.append(owner)
        return "2026-10-17T12:00:00+00:00"


def _hosted(monkeypatch):
    import app.main as main
    store = _Store()
    monkeypatch.setattr(main, "IS_PRODUCTION", True)
    monkeypatch.setattr(main, "production_auth", _Auth())
    monkeypatch.setattr(main, "production_store", store)
    monkeypatch.setenv("FAMILYOS_DEMO_ACCOUNTS", DEMO)
    monkeypatch.setenv("FAMILYOS_DEMO_ADMIN_TOKEN", "owner-secret")
    return TestClient(main.app), store


def test_hosted_reset_works_only_for_the_demo_account(monkeypatch):
    client, store = _hosted(monkeypatch)
    assert client.post("/v1/demo/reset").status_code == 401
    assert client.post("/v1/demo/reset", headers=bearer("family-owner")).status_code == 404   # a real family: no such thing
    assert store.restored == []
    reply = client.post("/v1/demo/reset", headers=bearer("demo-owner"))
    assert reply.status_code == 200, reply.text
    assert store.restored == ["demo-owner"]
    assert reply.json()["data"]["family"]["id"] == "family-home"


def test_hosted_baseline_needs_the_admin_token_and_the_demo_account(monkeypatch):
    client, store = _hosted(monkeypatch)
    assert client.post("/v1/demo/baseline", headers=bearer("demo-owner")).status_code == 403       # a judge can't
    wrong = {**bearer("demo-owner"), "X-Hometide-Demo-Admin": "guess"}
    assert client.post("/v1/demo/baseline", headers=wrong).status_code == 403
    owner_family = {**bearer("family-owner"), "X-Hometide-Demo-Admin": "owner-secret"}
    assert client.post("/v1/demo/baseline", headers=owner_family).status_code == 404
    owner = {**bearer("demo-owner"), "X-Hometide-Demo-Admin": "owner-secret"}
    reply = client.post("/v1/demo/baseline", headers=owner)
    assert reply.status_code == 200 and store.saved == ["demo-owner"]
    monkeypatch.delenv("FAMILYOS_DEMO_ADMIN_TOKEN")
    assert client.post("/v1/demo/baseline", headers=owner).status_code == 403                      # off unless configured
