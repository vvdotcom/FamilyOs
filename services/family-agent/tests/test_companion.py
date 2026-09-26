from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.companion import CompanionMutation, apply_edit
from app.demo import create_demo_household
from app.domain import DomainError


def edit(snapshot, kind, value):
    return apply_edit(snapshot, CompanionMutation(expectedRevision=snapshot.revision, kind=kind, value=value))


def event_value(snapshot):
    start = datetime.now(timezone.utc)
    return dict(id="new-event", title="Swimming", category="sports", startAt=start.isoformat(),
                endAt=(start + timedelta(hours=1)).isoformat(), ownerMemberId=snapshot.members[0].id,
                memberIds=[snapshot.members[0].id])


def test_event_create_edit_delete_and_revision():
    initial = create_demo_household()
    value = event_value(initial)
    created = edit(initial, "event", value)
    assert created.revision == initial.revision + 1
    assert len(created.events) == len(initial.events) + 1
    assert created.events[-1].familyId == initial.family.id
    updated = edit(created, "event", {**value, "title": "Swim practice"})
    assert len(updated.events) == len(created.events)
    assert updated.events[-1].title == "Swim practice"
    deleted = edit(updated, "deleteEvent", {"id": "new-event"})
    assert len(deleted.events) == len(initial.events)
    assert all(e.id != "new-event" for e in initial.events)


def test_stale_write_does_not_change_snapshot():
    initial = create_demo_household()
    updated = edit(initial, "event", event_value(initial))
    with pytest.raises(DomainError) as exc:
        apply_edit(updated, CompanionMutation(expectedRevision=initial.revision, kind="event", value=event_value(initial)))
    assert exc.value.status_code == 409
    assert updated.revision == 1


@pytest.mark.parametrize("change", [
    {"familyId": "someone-else"}, {"memberIds": ["foreign-member"]}, {"ownerMemberId": "foreign-member"},
    {"title": "   "}, {"startAt": "bad-date"}, {"endAt": "2020-01-01T00:00:00Z"},
    {"startAt": "2026-01-01T09:00:00", "endAt": "2026-01-01T10:00:00"}, {"unknownField": True},
])
def test_invalid_event_rejected(change):
    initial = create_demo_household()
    with pytest.raises(DomainError):
        edit(initial, "event", {**event_value(initial), **change})


def test_member_chore_and_list_persist_in_snapshot():
    initial = create_demo_household()
    updated = edit(initial, "member", dict(id="new-member", name="Jo", initials="J", role="child", accentColor="#6B45A8"))
    assert "new-member" in updated.family.memberIds
    chore = dict(id="new-chore", title="Feed the cat", assignedToMemberId="new-member", status="pending")
    updated = edit(updated, "chore", chore)
    updated = edit(updated, "chore", {**chore, "status": "completed"})
    assert updated.chores[-1].completedAt
    item = dict(id="milk", title="Milk", listName="Groceries", addedBy="Jo")
    updated = edit(updated, "listItem", item)
    updated = edit(updated, "listItem", {**item, "completed": True})
    assert updated.listItems[0].completed


def test_recipe_groceries_atomic_and_deduplicated():
    data = create_demo_household()
    meal = dict(id="meal", title="Tacos", date="2026-09-25", ingredients=["Milk", "Tortillas"])
    data = edit(data, "meal", meal)
    data = edit(data, "mealGroceries", {"id": "meal"})
    assert len(data.listItems) == 2
    data = edit(data, "mealGroceries", {"id": "meal"})
    assert len(data.listItems) == 2
    with pytest.raises(DomainError):
        edit(data, "meal", {**meal, "date": "2026-02-31"})


def test_route_requires_session_and_scopes_owner(monkeypatch):
    import app.main as main

    homes = {"owner-a": create_demo_household(), "owner-b": create_demo_household()}
    before_b = deepcopy(homes["owner-b"].model_dump())

    class Auth:
        def session(self, token):
            return {"accountId": token} if token in homes else None

    class Store:
        def companion_edit(self, owner, body):
            homes[owner] = apply_edit(homes[owner], body)
            return homes[owner]

    monkeypatch.setattr(main, "IS_PRODUCTION", True)
    monkeypatch.setattr(main, "production_auth", Auth())
    monkeypatch.setattr(main, "production_store", Store())
    client = TestClient(main.app)
    body = dict(expectedRevision=0, kind="event", value=event_value(homes["owner-a"]))
    assert client.post('/v1/companion/edit', json=body).status_code == 401
    result = client.post('/v1/companion/edit', json=body, headers={"Authorization": "Bearer owner-a"})
    assert result.status_code == 200
    assert homes["owner-b"].model_dump() == before_b
    assert client.post('/v1/companion/edit', json=body, headers={"Authorization": "Bearer owner-a"}).status_code == 409
