"""Phase 14: movement breaks, kids' sports and carpools, and family night voting."""
from __future__ import annotations

import re
from pathlib import Path

from app.companion import CompanionMutation, apply_edit
from app.demo import create_demo_household
from app.domain import detect_conflicts, sports_reminders
from app.move import MOVE_ROUTINES
from conftest import b64, bearer, child_session, edit, household, pair_tv, parent_token
from datetime import datetime


def apply(snapshot, kind, value):
    return apply_edit(snapshot, CompanionMutation(expectedRevision=snapshot.revision, kind=kind, value=value))


TEAM = {"id": "u10", "name": "U10 Hawks", "activity": "Soccer", "memberIds": ["emma"], "uniform": "blue jersey",
        "gear": ["Shin guards", "Water bottle"], "driverIds": ["alex", "jordan"], "location": "Kino Sports Complex",
        "travelMinutes": 20}


# Movement breaks ---------------------------------------------------------------------------------

def test_move_session_awards_stars_once_per_child_per_session(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    body = {"routineId": "jungle-journey", "memberIds": ["emma", "leo", "alex"], "date": "2026-09-22", "eventId": "move-1"}
    assert api.client.post("/v1/move/complete", json=body, headers=bearer(tv)).status_code == 200
    assert api.client.post("/v1/move/complete", json=body, headers=bearer(tv)).status_code == 200  # Retry is harmless.
    snapshot = household(api, parent)
    moves = [item for item in snapshot["starTransactions"] if item["reason"] == "move_completed"]
    assert sorted(item["memberId"] for item in moves) == ["emma", "leo"] and all(item["delta"] == 3 for item in moves)
    assert api.client.post("/v1/move/complete", json={**body, "eventId": "move-2"}, headers=bearer(tv)).status_code == 200
    assert len([t for t in household(api, parent)["starTransactions"] if t["reason"] == "move_completed"]) == 4
    assert api.client.post("/v1/move/complete", json={**body, "routineId": "nope"}, headers=bearer(tv)).status_code == 404
    routines = api.client.get("/v1/move/routines", headers=bearer(tv)).json()["data"]
    assert "not medical" in routines["safetyNote"] and len(routines["routines"]) == 3


def test_move_catalog_matches_the_tv_copy():
    ts = Path(__file__).resolve().parents[3] / "packages" / "domain" / "src" / "move.ts"
    if not ts.exists():  # The service can be built without the monorepo (Docker).
        return
    ids = set(re.findall(r"id: '([a-z-]+)',\s*\n\s*name:", ts.read_text(encoding="utf-8")))
    assert ids == set(MOVE_ROUTINES)
    stars = dict(re.findall(r"id: '([a-z-]+)',\s*\n\s*name: '[^']+',\s*\n\s*stars: (\d+)", ts.read_text(encoding="utf-8")))
    assert {key: int(value) for key, value in stars.items()} == {key: value["stars"] for key, value in MOVE_ROUTINES.items()}


# Sports ------------------------------------------------------------------------------------------

def test_team_events_get_driver_rotation_gear_and_uniform():
    data = apply(create_demo_household(), "team", TEAM)
    game = {"id": "g1", "title": "Hawks vs Owls", "category": "sports", "teamId": "u10", "sportKind": "game",
            "startAt": "2026-09-26T09:00:00-07:00", "endAt": "2026-09-26T10:00:00-07:00", "ownerMemberId": "emma",
            "memberIds": ["emma"], "recurrence": "weekly", "arrivalMinutes": 15}
    data = apply(data, "event", game)
    series = sorted((e for e in data.events if e.teamId == "u10"), key=lambda e: e.startAt)
    assert len(series) == 12
    assert [e.responsibleMemberId for e in series[:4]] == ["alex", "jordan", "alex", "jordan"]
    assert all(e.responsibilityType == "drive" and e.uniform == "blue jersey" for e in series)
    assert [p.label for p in series[3].preparation] == ["Shin guards", "Water bottle"]
    assert series[0].location == "Kino Sports Complex" and series[0].travelMinutes == 20
    team = next(t for t in data.teams if t.id == "u10")
    assert team.rotationIndex == 12


def test_invalid_team_driver_is_rejected():
    from app.domain import DomainError
    import pytest

    with pytest.raises(DomainError):
        apply(create_demo_household(), "team", {**TEAM, "driverIds": ["emma"]})


def test_driver_needed_in_two_places_and_venue_travel_conflicts():
    data = create_demo_household()
    data = apply(data, "event", {"id": "drive-a", "title": "Drive to swim", "category": "sports", "startAt": "2026-09-22T16:00:00-07:00",
                                 "endAt": "2026-09-22T16:45:00-07:00", "ownerMemberId": "leo", "memberIds": ["leo"],
                                 "responsibleMemberId": "alex", "responsibilityType": "drive"})
    data = apply(data, "event", {"id": "drive-b", "title": "Drive to chess", "category": "school", "startAt": "2026-09-22T16:30:00-07:00",
                                 "endAt": "2026-09-22T17:00:00-07:00", "ownerMemberId": "emma", "memberIds": ["emma"],
                                 "responsibleMemberId": "alex", "responsibilityType": "drive", "location": "Chess club"})
    conflicts = detect_conflicts(data, datetime.fromisoformat("2026-09-22T12:00:00-07:00"))
    driver = [c for c in conflicts if c.title == "Driver needed in two places"]
    assert driver and driver[0].memberIds == ["alex"] and driver[0].suggestedMemberId != "alex"
    assert len({c.id for c in conflicts}) == len(conflicts)
    travel = [c for c in conflicts if c.title == "Not enough travel time"]
    # Emma: chess at 16:30-17:00 then soccer at Kino (20 min away) at 17:00.
    assert any("Emma needs about 20 minutes" in c.message for c in travel)


def test_sports_reminder_mentions_leave_time_and_missing_gear():
    data = apply(create_demo_household(), "team", TEAM)
    data = apply(data, "event", {"id": "prac", "title": "Soccer practice", "category": "sports", "teamId": "u10",
                                 "startAt": "2026-09-22T17:00:00-07:00", "endAt": "2026-09-22T18:00:00-07:00",
                                 "ownerMemberId": "emma", "memberIds": ["emma"], "arrivalMinutes": 10})
    reminders = sports_reminders(data, datetime.fromisoformat("2026-09-22T16:00:00-07:00"))
    text = next(item["text"] for item in reminders if item["eventId"] == "prac")
    assert text == "Leave for Soccer practice in 30 minutes; Shin guards, Water bottle not packed; wear blue jersey."


def test_ics_team_schedule_is_only_added_after_confirmation(api):
    parent = parent_token(api)
    assert edit(api, parent, "team", TEAM).status_code == 200
    ics = ("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Hawks game\nDTSTART:20261003T160000Z\nDTEND:20261003T170000Z\n"
           "END:VEVENT\nEND:VCALENDAR\n")
    draft = api.client.post("/v1/imports/drafts", json={"sourceType": "ics", "contentBase64": b64(ics.encode())},
                            headers=bearer(parent)).json()["data"]["draft"]
    assert not any(e["title"] == "Hawks game" for e in household(api, parent)["events"])
    saved = edit(api, parent, "importConfirm", {"id": draft["id"], "teamId": "u10", "memberIds": ["emma"]}).json()["data"]
    game = next(e for e in saved["events"] if e["title"] == "Hawks game")
    assert game["startAt"] == "2026-10-03T16:00:00+00:00" and game["sportKind"] == "game"
    assert game["responsibleMemberId"] == "alex" and [p["label"] for p in game["preparation"]] == TEAM["gear"]


def test_carpool_swap_goes_through_a_confirmed_proposal():
    data = apply(create_demo_household(), "team", TEAM)
    data = apply(data, "event", {"id": "g", "title": "Hawks game", "category": "sports", "teamId": "u10",
                                 "startAt": "2026-09-26T09:00:00-07:00", "endAt": "2026-09-26T10:00:00-07:00",
                                 "ownerMemberId": "emma", "memberIds": ["emma"]})
    data = apply(data, "proposalCreate", {"id": "p1", "kind": "pickup_swap", "summary": "Jordan drives instead",
                                          "payload": {"eventId": "g", "fromMemberId": "alex", "toMemberId": "jordan"}})
    assert next(e for e in data.events if e.id == "g").responsibleMemberId == "alex"
    data = apply(data, "proposalDecide", {"id": "p1", "action": "confirm"})
    assert next(e for e in data.events if e.id == "g").responsibleMemberId == "jordan"


def test_tv_can_check_gear_on_the_server(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    assert edit(api, tv, "prepToggle", {"id": "soccer-emma", "itemId": "water-bottle"}).status_code == 200
    soccer = next(e for e in household(api, parent)["events"] if e["id"] == "soccer-emma")
    assert all(item["completed"] for item in soccer["preparation"])


# Family night ------------------------------------------------------------------------------------

def test_family_night_vote_majority_and_picker_tie_break(api):
    parent = parent_token(api)
    assert api.client.post("/v1/access-code", json={"code": "4826"}, headers=bearer(parent)).status_code == 200
    settings = {"id": "settings", "weekday": 4, "time": "18:30", "activityType": "movie",
                "pickerOrder": ["emma", "leo", "alex", "jordan"]}
    saved = edit(api, parent, "familyNightSettings", settings).json()["data"]
    nights = sorted(e["startAt"] for e in saved["events"] if e.get("seriesId") == "family-night")
    assert len(nights) == 8 and nights[0] == "2026-09-25T18:30:00-07:00"
    day = "2026-09-25"
    for sid, title, who in [("s1", "Paddington", "emma"), ("s2", "Board games", "leo")]:
        assert edit(api, parent, "familyNightSuggest", {"id": sid, "date": day, "title": title, "byMemberId": who}).status_code == 200
    assert edit(api, parent, "familyNightSuggest", {"id": "s3", "date": day, "title": "paddington", "byMemberId": "leo"}).status_code == 409
    child = child_session(api, "emma")
    assert edit(api, child, "familyNightVote", {"id": day, "memberId": "leo", "suggestionId": "s2"}).status_code == 403
    assert edit(api, child, "familyNightVote", {"id": day, "memberId": "emma", "suggestionId": "s1"}).status_code == 200
    edit(api, parent, "familyNightVote", {"id": day, "memberId": "leo", "suggestionId": "s2"})
    tv = pair_tv(api, parent)
    poll = next(p for p in household(api, tv)["familyNightPolls"] if p["id"] == day)
    assert poll["votes"] == {"emma": "s1", "leo": "s2"}  # The TV sees live votes.
    assert edit(api, tv, "familyNightClose", {"id": day}).status_code == 403
    tie = edit(api, parent, "familyNightClose", {"id": day}).json()["data"]
    poll = next(p for p in tie["familyNightPolls"] if p["id"] == day)
    assert poll["status"] == "tie" and poll["pickerMemberId"] == "emma" and sorted(poll["tiedSuggestionIds"]) == ["s1", "s2"]
    assert edit(api, parent, "familyNightPick", {"id": day, "suggestionId": "nope"}).status_code == 422
    decided = edit(api, parent, "familyNightPick", {"id": day, "suggestionId": "s2"}).json()["data"]
    poll = next(p for p in decided["familyNightPolls"] if p["id"] == day)
    assert (poll["status"], poll["decidedBy"], poll["winnerSuggestionId"]) == ("decided", "picker", "s2")
    assert decided["familyNight"]["pickerIndex"] == 1  # Next week Leo picks.
    assert any(e["title"] == "Family night: Board games" for e in decided["events"])
    # Next week: a clear majority needs no picker.
    week2 = "2026-10-02"
    edit(api, parent, "familyNightSuggest", {"id": "t1", "date": week2, "title": "Pizza + puzzle", "byMemberId": "alex"})
    edit(api, parent, "familyNightSuggest", {"id": "t2", "date": week2, "title": "Bowling", "byMemberId": "jordan"})
    for member in ("alex", "jordan", "emma"):
        edit(api, parent, "familyNightVote", {"id": week2, "memberId": member, "suggestionId": "t1"})
    edit(api, parent, "familyNightVote", {"id": week2, "memberId": "leo", "suggestionId": "t2"})
    closed = edit(api, parent, "familyNightClose", {"id": week2}).json()["data"]
    poll = next(p for p in closed["familyNightPolls"] if p["id"] == week2)
    assert (poll["status"], poll["decidedBy"], poll["pickerMemberId"]) == ("decided", "majority", "leo")
    assert closed["familyNight"]["pickerIndex"] == 2
    assert api.client.get("/v1/family-night", headers=bearer(tv)).json()["data"]["picker"] == "alex"
