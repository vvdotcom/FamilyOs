"""The demo's voice flow at the household level: swap, confirm, "Hometide noticed", and asking twice."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app import rhythm
from app.companion import CompanionMutation, apply_edit
from app.domain import DomainError
from app.models import HouseholdSnapshot

TZ = ZoneInfo("America/Phoenix")


def household() -> HouseholdSnapshot:
    people = [("lindsey", "Lindsey", "adult"), ("jordan", "Jordan", "adult"), ("emma", "Emma", "child")]
    snap = HouseholdSnapshot.model_validate({
        "family": {"id": "f", "name": "Riveras", "timezone": "America/Phoenix", "memberIds": [p[0] for p in people]},
        "members": [{"id": i, "familyId": "f", "name": n, "initials": n[0], "role": r, "accentColor": "#123456"}
                    for i, n, r in people],
        "events": [], "chores": [], "routines": [],
    })
    monday = (datetime.now(TZ) - timedelta(days=datetime.now(TZ).weekday() + 7)).replace(hour=0, minute=0, second=0, microsecond=0)

    def weekly(event_id, title, weekday, hour, minute, minutes, who, **extra):
        start = monday + timedelta(days=weekday, hours=hour, minutes=minute)
        nonlocal snap
        snap = edit(snap, "event", {"id": event_id, "familyId": "f", "title": title, "category": "pickup",
                                    "startAt": start.isoformat(), "endAt": (start + timedelta(minutes=minutes)).isoformat(),
                                    "ownerMemberId": who[0], "memberIds": who, "recurrence": "weekly", **extra})

    for day in (1, 3):  # Jordan's meeting overlaps Emma's Tuesday and Thursday pickup.
        weekly(f"pickup-{day}", "Emma pickup", day, 15, 15, 20, ["emma"], responsibleMemberId="jordan",
               responsibilityType="pickup")
        weekly(f"meeting-{day}", "Team meeting", day, 14, 45, 75, ["jordan"])
    return snap


def edit(snap, kind, value, actor="parent"):
    updated = apply_edit(snap, CompanionMutation(expectedRevision=snap.revision, kind=kind, value=value), actor)
    updated.revision += 1
    return updated


def upcoming_pickup(snap):
    now = datetime.now(TZ)
    return min((e for e in snap.events if e.title == "Emma pickup" and datetime.fromisoformat(e.endAt) > now),
               key=lambda e: e.startAt)


def swap(snap, event, to, proposal_id):
    return edit(snap, "proposalCreate", {"id": proposal_id, "kind": "pickup_swap", "source": "voice",
                                          "requestedBy": "voice:parent", "summary": f"{to} takes {event.title}",
                                          "payload": {"eventId": event.id, "fromMemberId": event.responsibleMemberId,
                                                      "toMemberId": to}}, "voice")


def proposal(snap, proposal_id):
    return next(item for item in snap.proposals if item.id == proposal_id)


def test_swap_confirm_then_hometide_noticed_and_yes():
    snap = household()
    event = upcoming_pickup(snap)
    snap = swap(snap, event, "lindsey", "p1")
    snap = edit(snap, "proposalDecide", {"id": "p1", "action": "confirm"}, "tv-parent:x")
    assert proposal(snap, "p1").status == "confirmed"
    pattern = rhythm.next_suggestion(snap)
    assert pattern is not None and pattern.summary == "Make Lindsey the usual Emma pickup on Tuesdays and Thursdays?"
    snap = edit(snap, "proposalCreate", {"id": "r1", "kind": "routine", "source": "hometide", "requestedBy": "hometide",
                                          "summary": pattern.summary, "payload": {**pattern.payload, "insightId": pattern.id}},
                "system")
    snap = edit(snap, "proposalDecide", {"id": "r1", "action": "confirm"}, "tv-parent:x")
    assert proposal(snap, "r1").resultMessage.startswith("Done. Hometide will remember this routine.")


def test_asking_for_someone_who_already_has_it_is_refused_up_front():
    snap = household()
    event = upcoming_pickup(snap)
    snap = swap(snap, event, "lindsey", "p1")
    snap = edit(snap, "proposalDecide", {"id": "p1", "action": "confirm"}, "tv-parent:x")
    event = next(e for e in snap.events if e.id == event.id)
    try:
        swap(snap, event, "lindsey", "p2")
    except DomainError as error:
        assert error.code == "ALREADY_RESPONSIBLE" and "Lindsey already has Emma pickup" in error.message
    else:
        raise AssertionError("a request that can only fail must not be created")


def test_a_busy_adult_is_refused_up_front():
    snap = household()
    event = upcoming_pickup(snap)
    snap = edit(snap, "event", {"id": "dentist", "familyId": "f", "title": "Dentist", "category": "appointment",
                                "startAt": event.startAt, "endAt": event.endAt, "ownerMemberId": "lindsey",
                                "memberIds": ["lindsey"]})
    try:
        swap(snap, event, "lindsey", "p1")
    except DomainError as error:
        assert error.code == "MEMBER_BUSY"
    else:
        raise AssertionError("expected MEMBER_BUSY")


def test_an_overtaken_request_closes_instead_of_staying_stuck():
    snap = household()
    event = upcoming_pickup(snap)
    snap = swap(snap, event, "lindsey", "p1")
    # Someone fixes the same pickup by hand before the TV confirms.
    changed = next(e for e in snap.events if e.id == event.id).model_dump(mode="json")
    changed["responsibleMemberId"] = "lindsey"
    snap = edit(snap, "event", {k: v for k, v in changed.items() if v is not None})
    snap = edit(snap, "proposalDecide", {"id": "p1", "action": "confirm"}, "tv-parent:x")
    closed = proposal(snap, "p1")
    assert closed.status == "expired" and closed.resultMessage.startswith("Nothing was changed:")
    assert not [item for item in snap.proposals if item.status == "pending"]
