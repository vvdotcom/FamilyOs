from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.companion import CompanionMutation, apply_edit
from app.demo import create_demo_household
from app.domain import DomainError
from app.models import ListItem


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


def test_recipes_quantity_merge_and_weekly_meal_occurrences():
    data = create_demo_household()
    recipe = {
        "id": "pasta", "name": "Pasta", "servings": 4,
        "ingredients": [{"name": "Tomato", "quantity": 2, "unit": "cups"},
                        {"name": "Pasta", "quantity": 1, "unit": "lb"}],
        "instructions": ["Boil pasta"],
    }
    data = edit(data, "recipe", recipe)
    meal = {"id": "pasta-night", "title": "Pasta night", "date": "2026-09-28",
            "recipeId": "pasta", "recurrence": "weekly"}
    data = edit(data, "meal", meal)
    series = [item for item in data.meals if item.seriesId]
    assert len(series) == 12
    assert series[1].date == "2026-10-05"
    data.listItems.append(ListItem(id="tomato", listName="Groceries", title="Tomato", quantity=1,
                                   unit="cups", ingredientName="tomato"))
    data = edit(data, "mealGroceries", {"id": "pasta-night"})
    tomato = next(item for item in data.listItems if item.id == "tomato")
    assert tomato.quantity == 3
    assert next(item for item in data.listItems if item.title == "Pasta").quantity == 1
    data = edit(data, "mealSeries", {"id": "pasta-night", "title": "Pasta bake", "applyToFuture": True})
    assert data.meals[0].title == "Pasta bake"
    assert all(item.title == "Pasta bake" for item in data.meals if item.seriesId)


def test_import_draft_requires_review_and_confirmation():
    from app.imports import ImportRequest, make_import_draft

    data = create_demo_household()
    draft = make_import_draft(ImportRequest(sourceType="email", sourceName="School notice",
        contentText="School event\n2026-10-02\nBring a jacket"))
    data = edit(data, "importDraft", draft.model_dump(mode="json"))
    assert data.importDrafts[0].status == "review"
    assert not any(item.title == draft.proposal.title for item in data.events)
    data = edit(data, "importConfirm", {"id": draft.id})
    assert data.importDrafts[0].status == "confirmed"
    assert any(item.id == f"import-{draft.id}" for item in data.events)
    with pytest.raises(DomainError):
        edit(data, "importConfirm", {"id": draft.id})


def test_cancelled_import_does_not_create_a_household_item():
    from app.imports import ImportRequest, make_import_draft

    data = create_demo_household()
    draft = make_import_draft(ImportRequest(sourceType="text", contentText="Task: bring library books"))
    data = edit(data, "importDraft", draft.model_dump(mode="json"))
    data = edit(data, "importCancel", {"id": draft.id})
    assert data.importDrafts[0].status == "cancelled"
    assert not any(item.id == f"import-{draft.id}" for item in data.chores)


def test_chore_stars_are_awarded_once_and_reversed_on_undo():
    data = create_demo_household()
    child = {"id": "star-child", "name": "Ari", "initials": "A", "role": "child", "accentColor": "#2E7A3A"}
    data = edit(data, "member", child)
    chore = {"id": "one-chore", "title": "Set the table", "assignedToMemberId": "star-child",
             "status": "pending", "points": 3}
    data = edit(data, "chore", chore)
    data = edit(data, "chore", {**chore, "status": "completed"})
    data = edit(data, "chore", {**chore, "status": "completed"})
    assert sum(item.delta for item in data.starTransactions if item.memberId == "star-child") == 3
    data = edit(data, "chore", chore)
    assert sum(item.delta for item in data.starTransactions if item.memberId == "star-child") == 0
    data = edit(data, "chore", {**chore, "status": "completed"})
    assert sum(item.delta for item in data.starTransactions if item.memberId == "star-child") == 0
    assert [item.reason for item in data.starTransactions] == ["chore_earned", "chore_reversed"]


def test_import_endpoint_is_parent_only_and_returns_draft_for_review(monkeypatch):
    import app.main as main
    from app.imports import ImportRequest

    data = create_demo_household()

    class Auth:
        def session(self, token):
            return {"accountId": token} if token == "parent-token" else None

    class Store:
        _data = data

        def snapshot(self):
            return self._data.model_copy(deep=True)

        def household(self, _owner):
            return self.snapshot()

        def transform(self, _owner, change):
            self._data = change(self._data)
            return self.snapshot()

    store = Store()
    monkeypatch.setattr(main, "IS_PRODUCTION", True)
    monkeypatch.setattr(main, "production_auth", Auth())
    monkeypatch.setattr(main, "production_store", store)
    client = TestClient(main.app)
    body = {"sourceType": "email", "contentText": "Task: bring library books"}
    assert client.post("/v1/imports/drafts", json=body).status_code == 401
    response = client.post("/v1/imports/drafts", json=body,
                           headers={"Authorization": "Bearer parent-token"})
    assert response.status_code == 200
    assert response.json()["data"]["draft"]["status"] == "review"


def test_route_requires_session_and_scopes_owner(monkeypatch):
    import app.main as main

    homes = {"owner-a": create_demo_household(), "owner-b": create_demo_household()}
    before_b = deepcopy(homes["owner-b"].model_dump())

    class Auth:
        def session(self, token):
            return {"accountId": token} if token in homes else None

    class Store:
        def household(self, owner):
            return homes[owner]

        def transform(self, owner, change):
            homes[owner] = change(homes[owner])
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
