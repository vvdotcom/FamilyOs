"""Phase 7-10 behaviour through the real HTTP routes (local mode, demo household)."""
from __future__ import annotations

import io
import sqlite3
from datetime import datetime, timedelta, timezone

from PIL import Image

from conftest import PASSWORD, b64, bearer, edit, household, image_bytes, pair_tv, parent_token


def set_code(api, parent: str, code: str = "4826") -> None:
    assert api.client.post("/v1/access-code", json={"code": code}, headers=bearer(parent)).status_code == 200


# Phase 8 ---------------------------------------------------------------------------------------

def test_reward_approval_cannot_bypass_the_parent_code_through_generic_edits(api):
    parent = parent_token(api)
    set_code(api, parent)
    assert edit(api, parent, "reward", {"id": "movie", "title": "Movie night", "stars": 1}).status_code == 200
    request = api.client.post("/v1/redemptions/request", json={"memberId": "emma", "rewardId": "movie"}, headers=bearer(parent))
    assert request.status_code == 200
    redemption = request.json()["data"]["request"]["id"]
    for kind, value in [("redemptionDecision", {"id": redemption, "action": "approve"}),
                        ("starAdjustment", {"id": "x", "memberId": "emma", "delta": 50}),
                        ("redemptionRequest", {"id": "y", "memberId": "emma", "rewardId": "movie", "stars": 1,
                                               "status": "pending", "requestedAt": "2026-09-22T00:00:00Z"})]:
        reply = edit(api, parent, kind, value)
        assert reply.status_code == 403 and reply.json()["error"]["code"] == "CONFIRMATION_REQUIRED"
    assert household(api, parent)["redemptions"][0]["status"] == "pending"


def test_star_correction_needs_code_and_cannot_go_negative(api):
    parent = parent_token(api)
    set_code(api, parent)
    body = {"memberId": "leo", "delta": 4, "code": "0000"}
    assert api.client.post("/v1/stars/adjust", json=body, headers=bearer(parent)).status_code == 401
    assert api.client.post("/v1/stars/adjust", json={**body, "code": "4826"}, headers=bearer(parent)).status_code == 200
    negative = api.client.post("/v1/stars/adjust", json={**body, "delta": -99, "code": "4826"}, headers=bearer(parent))
    assert negative.status_code == 409
    balance = sum(item["delta"] for item in household(api, parent)["starTransactions"] if item["memberId"] == "leo")
    assert balance == 4


def test_redemption_can_be_marked_fulfilled_only_after_approval(api):
    parent = parent_token(api)
    set_code(api, parent)
    edit(api, parent, "reward", {"id": "park", "title": "Park trip", "stars": 1})
    edit(api, parent, "chore", {"id": "pack-backpack", "title": "Pack backpack", "assignedToMemberId": "emma",
                                "status": "completed", "points": 5})
    request = api.client.post("/v1/redemptions/request", json={"memberId": "emma", "rewardId": "park"}, headers=bearer(parent))
    redemption = request.json()["data"]["request"]["id"]
    assert edit(api, parent, "redemptionFulfill", {"id": redemption}).status_code == 409
    api.client.post(f"/v1/redemptions/{redemption}/decision", json={"action": "approve", "code": "4826"}, headers=bearer(parent))
    assert edit(api, parent, "redemptionFulfill", {"id": redemption}).status_code == 200
    assert household(api, parent)["redemptions"][0]["status"] == "fulfilled"


# Phase 9 ---------------------------------------------------------------------------------------

def test_paired_tv_permissions_parent_mode_and_audit(api):
    parent = parent_token(api)
    set_code(api, parent)
    tv = pair_tv(api, parent)
    edit(api, parent, "listItem", {"id": "milk", "listName": "Groceries", "title": "Milk"})
    # Shared-screen actions persist on the server.
    assert edit(api, tv, "listItemToggle", {"id": "milk"}).status_code == 200
    assert edit(api, tv, "completeChore", {"id": "pack-backpack"}).status_code == 200
    snapshot = household(api, parent)
    assert next(item for item in snapshot["listItems"] if item["id"] == "milk")["completed"] is True
    assert sum(item["delta"] for item in snapshot["starTransactions"] if item["memberId"] == "emma") == 5
    # Parent-level changes need the code on the TV.
    chore = {"id": "pack-backpack", "title": "Pack backpack", "assignedToMemberId": "emma", "status": "pending", "points": 5}
    denied = edit(api, tv, "chore", chore)
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "PARENT_CODE_REQUIRED"
    assert api.client.post("/v1/tv/parent-mode", json={"code": "1111"}, headers=bearer(tv)).status_code == 401
    unlocked = api.client.post("/v1/tv/parent-mode", json={"code": "4826"}, headers=bearer(tv))
    assert unlocked.status_code == 200
    assert api.client.get("/v1/tv/session", headers=bearer(tv)).json()["data"]["elevated"] is True
    assert edit(api, tv, "chore", chore).status_code == 200  # Undo returns the stars.
    assert edit(api, tv, "member", {"id": "x", "name": "X", "initials": "X", "role": "adult", "accentColor": "#123456"}).status_code == 403
    api.client.post("/v1/tv/lock", json={}, headers=bearer(tv))
    assert api.client.get("/v1/tv/session", headers=bearer(tv)).json()["data"]["elevated"] is False
    snapshot = household(api, parent)
    assert sum(item["delta"] for item in snapshot["starTransactions"] if item["memberId"] == "emma") == 0
    actors = [entry["actor"] for entry in snapshot["auditLog"]]
    assert "parent" in actors and any(actor.startswith("tv:") for actor in actors) and any(actor.startswith("tv-parent:") for actor in actors)
    assert "4826" not in str(snapshot["auditLog"])


def test_tv_parent_mode_expires(api):
    parent = parent_token(api)
    set_code(api, parent)
    tv = pair_tv(api, parent)
    api.client.post("/v1/tv/parent-mode", json={"code": "4826"}, headers=bearer(tv))
    device = api.main.pairing_registry.device(tv)
    device.elevated_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert api.client.get("/v1/tv/session", headers=bearer(tv)).json()["data"]["elevated"] is False


def test_parent_unlock_from_child_mode_expires_after_inactivity(api, tmp_path):
    parent = parent_token(api)
    set_code(api, parent)
    child = api.client.post("/v1/access/child-session", json={"memberId": "emma"}, headers=bearer(parent)).json()["data"]["sessionToken"]
    unlocked = api.client.post("/v1/access/parent-mode", json={"code": "4826"}, headers=bearer(child)).json()["data"]
    assert unlocked["idleMinutes"] == 15
    elevated = unlocked["sessionToken"]
    assert api.client.get("/v1/auth/session", headers=bearer(elevated)).json()["data"]["elevated"] is True
    with sqlite3.connect(tmp_path / "familyos-auth.sqlite3") as db:
        db.execute("UPDATE sessions SET last_used_at = '2000-01-01T00:00:00+00:00' WHERE elevated = 1")
    assert api.client.get("/v1/auth/session", headers=bearer(elevated)).json()["data"]["authenticated"] is False
    assert api.client.get("/v1/auth/session", headers=bearer(child)).json()["data"]["accessMode"] == "child"


def test_parent_code_recovery_requires_the_account_password(api):
    parent = parent_token(api)
    set_code(api, parent)
    wrong = api.client.post("/v1/access-code/reset", json={"newCode": "1357", "password": "not-the-password"}, headers=bearer(parent))
    assert wrong.status_code == 401
    child = api.client.post("/v1/access/child-session", json={"memberId": "leo"}, headers=bearer(parent)).json()["data"]["sessionToken"]
    assert api.client.post("/v1/access-code/reset", json={"newCode": "1357", "password": PASSWORD}, headers=bearer(child)).status_code == 403
    parent = api.client.post("/v1/access/parent-mode", json={"code": "4826"}, headers=bearer(child)).json()["data"]["sessionToken"]
    assert api.client.post("/v1/access-code/reset", json={"newCode": "1357", "password": PASSWORD}, headers=bearer(parent)).status_code == 200
    assert api.client.post("/v1/access/parent-mode", json={"code": "4826"}, headers=bearer(child)).status_code == 401
    assert api.client.post("/v1/access/parent-mode", json={"code": "1357"}, headers=bearer(child)).status_code == 200


def test_revoke_all_signs_out_parent_and_child_sessions(api):
    parent = parent_token(api)
    set_code(api, parent)
    other = api.client.post("/v1/auth/sign-in", json={"email": "parent@example.test", "password": PASSWORD},
                            headers={"X-FamilyOS-Session-Transport": "bearer"}).json()["data"]["sessionToken"]
    api.client.cookies.clear()
    child = api.client.post("/v1/access/child-session", json={"memberId": "emma"}, headers=bearer(other)).json()["data"]["sessionToken"]
    assert api.client.post("/v1/auth/sessions/revoke-all", headers=bearer(parent)).status_code == 200
    for token in (parent, child):
        assert api.client.get("/v1/auth/session", headers=bearer(token)).json()["data"]["authenticated"] is False


def test_child_cannot_change_roles_or_use_another_childs_identity(api):
    parent = parent_token(api)
    set_code(api, parent)
    child = api.client.post("/v1/access/child-session", json={"memberId": "emma"}, headers=bearer(parent)).json()["data"]["sessionToken"]
    assert edit(api, child, "member", {"id": "emma", "name": "Emma", "initials": "E", "role": "adult",
                                       "accentColor": "#A98BF3"}).status_code == 403
    assert edit(api, child, "completeChore", {"id": "feed-cat", "memberId": "leo"}).status_code == 403
    assert api.client.post("/v1/redemptions/request", json={"memberId": "leo", "rewardId": "x"}, headers=bearer(child)).status_code == 403
    assert api.client.post("/v1/tv/parent-mode", json={"code": "4826"}, headers=bearer(child)).status_code == 403
    permissions = api.client.get("/v1/permissions", headers=bearer(child)).json()["data"]
    assert permissions["actor"] == "child" and "household members and roles" in permissions["matrix"]


# Phase 7 ---------------------------------------------------------------------------------------

def test_list_items_can_be_removed_and_recipes_parse_quantities(api):
    parent = parent_token(api)
    edit(api, parent, "listItem", {"id": "eggs", "listName": "Weekend", "title": "Eggs"})
    assert edit(api, parent, "deleteListItem", {"id": "eggs"}).status_code == 200
    assert edit(api, parent, "deleteListItem", {"id": "eggs"}).status_code == 404
    text = "Pancakes\nIngredients:\n2 cups flour\n1 egg\nsalt\nInstructions:\nMix\nCook"
    draft = api.client.post("/v1/imports/drafts", json={"sourceType": "text", "contentText": text}, headers=bearer(parent)).json()["data"]["draft"]
    assert draft["proposal"]["kind"] == "recipe" and "quantities" in draft["proposal"]["fieldsNeedingReview"]
    saved = api.client.post("/v1/companion/edit", headers=bearer(parent), json={
        "expectedRevision": household(api, parent)["revision"], "kind": "importConfirm", "value": {"id": draft["id"]}}).json()["data"]
    recipe = next(item for item in saved["recipes"] if item["name"] == "Pancakes")
    assert recipe["ingredients"][0] == {"name": "flour", "quantity": 2.0, "unit": "cups"}
    assert recipe["ingredients"][2] == {"name": "salt", "quantity": None, "unit": None}


def test_import_times_use_household_timezone_and_fields_are_editable(api):
    parent = parent_token(api)
    text = "School open house\nOctober 3, 2026 at 5:30 pm\nWhere: Riverside School"
    draft = api.client.post("/v1/imports/drafts", json={"sourceType": "email", "contentText": text}, headers=bearer(parent)).json()["data"]["draft"]
    proposal = draft["proposal"]
    assert (proposal["date"], proposal["startTime"], proposal["location"]) == ("2026-10-03", "17:30", "Riverside School")
    assert "participants" in proposal["fieldsNeedingReview"]
    saved = edit(api, parent, "importConfirm", {"id": draft["id"], "title": "Open house", "startTime": "18:00",
                                                "endTime": "19:30", "memberIds": ["emma", "alex"]}).json()["data"]
    event = next(item for item in saved["events"] if item["id"] == f"import-{draft['id']}")
    assert event["title"] == "Open house" and event["startAt"] == "2026-10-03T18:00:00-07:00"
    assert event["endAt"] == "2026-10-03T19:30:00-07:00" and event["memberIds"] == ["emma", "alex"]
    assert event["source"] == "import"


def test_repeated_import_is_flagged_as_duplicate_and_cancel_changes_nothing(api):
    parent = parent_token(api)
    body = {"sourceType": "email", "contentText": "Soccer practice\n2026-10-05 at 4pm"}
    first = api.client.post("/v1/imports/drafts", json=body, headers=bearer(parent)).json()["data"]["draft"]
    second = api.client.post("/v1/imports/drafts", json=body, headers=bearer(parent)).json()["data"]
    assert "duplicate" in second["draft"]["proposal"]["fieldsNeedingReview"]
    assert second["draft"]["proposal"]["duplicateOf"] == f"draft:{first['id']}"
    events_before = len(second["household"]["events"])
    after = edit(api, parent, "importCancel", {"id": second["draft"]["id"]}).json()["data"]
    assert len(after["events"]) == events_before


def test_email_file_ics_and_malformed_imports(api):
    parent = parent_token(api)
    eml = b"From: coach@example.test\r\nSubject: Team photo day\r\nContent-Type: text/plain\r\n\r\nGame: Oct 10 2026 at 9am\r\n"
    reply = api.client.post("/v1/imports/drafts", json={"sourceType": "email", "contentBase64": b64(eml)}, headers=bearer(parent))
    assert reply.status_code == 200 and reply.json()["data"]["draft"]["proposal"]["title"] == "Team photo day"
    ics = ("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:U10 Soccer game\r\nDTSTART:20261010T160000Z\r\n"
           "DTEND:20261010T170000Z\r\nLOCATION:Field 3\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:U10 Practice\r\n"
           "DTSTART;TZID=America/Phoenix:20261013T170000\r\nDTEND;TZID=America/Phoenix:20261013T180000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
    drafts = api.client.post("/v1/imports/drafts", json={"sourceType": "ics", "contentBase64": b64(ics.encode())},
                             headers=bearer(parent)).json()["data"]["drafts"]
    assert [item["proposal"]["title"] for item in drafts] == ["U10 Soccer game", "U10 Practice"]
    assert drafts[1]["proposal"]["startAt"] == "2026-10-13T17:00:00-07:00"
    assert api.client.post("/v1/imports/drafts", json={"sourceType": "email", "contentBase64": "***"}, headers=bearer(parent)).status_code == 422
    assert api.client.post("/v1/imports/drafts", json={"sourceType": "flyer", "contentBase64": b64(b"\x00\x01binary")},
                           headers=bearer(parent)).status_code == 415
    photo = api.client.post("/v1/imports/drafts", json={"sourceType": "photo", "contentBase64": b64(image_bytes())}, headers=bearer(parent))
    assert photo.status_code == 503  # No AI provider in tests: the parent is told to paste text instead.


def test_weekly_event_recurrence_creates_future_occurrences(api):
    parent = parent_token(api)
    value = {"id": "piano", "title": "Piano", "category": "school", "startAt": "2026-09-24T16:00:00-07:00",
             "endAt": "2026-09-24T16:45:00-07:00", "ownerMemberId": "leo", "memberIds": ["leo"], "recurrence": "weekly",
             "responsibleMemberId": "jordan", "responsibilityType": "drive",
             "preparation": [{"id": "books", "label": "Piano books", "completed": False}]}
    saved = edit(api, parent, "event", value).json()["data"]
    series = sorted((item for item in saved["events"] if item["id"].startswith("piano")), key=lambda item: item["startAt"])
    assert len(series) == 12 and series[1]["startAt"] == "2026-10-01T16:00:00-07:00"
    assert len({item["seriesId"] for item in series}) == 1 and series[5]["responsibleMemberId"] == "jordan"


# Phase 10 photos ---------------------------------------------------------------------------------

def test_photo_upload_strips_metadata_and_is_household_private(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    raw = image_bytes(exif_gps=True, size=(3000, 2000))
    assert Image.open(io.BytesIO(raw)).getexif()  # The fixture really carries EXIF/GPS.
    reply = api.client.post("/v1/photos", json={"contentBase64": b64(raw), "caption": "Beach day"}, headers=bearer(parent))
    assert reply.status_code == 200, reply.text
    photo = reply.json()["data"]["photo"]
    assert (photo["width"], photo["height"]) == (1620, 1080) and photo["selected"] is True
    served = api.client.get(f"/v1/photos/{photo['id']}/tv", headers=bearer(tv))
    assert served.status_code == 200 and served.headers["content-type"] == "image/jpeg"
    stored = Image.open(io.BytesIO(served.content))
    assert not stored.getexif() and "exif" not in stored.info
    assert api.client.get(f"/v1/photos/{photo['id']}/tv").status_code == 401
    assert api.client.post(f"/v1/photos/{photo['id']}/update", json={"rotation": 90, "selected": False},
                           headers=bearer(tv)).status_code == 401
    updated = api.client.post(f"/v1/photos/{photo['id']}/update", json={"rotation": 90, "selected": False, "caption": "Beach"},
                              headers=bearer(parent)).json()["data"]["photos"][0]
    assert (updated["rotation"], updated["selected"], updated["caption"]) == (90, False, "Beach")
    assert api.client.post(f"/v1/photos/{photo['id']}/delete", headers=bearer(parent)).status_code == 200
    assert api.client.get(f"/v1/photos/{photo['id']}/thumb", headers=bearer(parent)).status_code == 404
    assert household(api, parent)["photos"] == []


def test_photo_upload_rejects_non_images_and_oversized_files(api):
    parent = parent_token(api)
    assert api.client.post("/v1/photos", json={"contentBase64": b64(b"GIF89a....fake")}, headers=bearer(parent)).status_code == 415
    assert api.client.post("/v1/photos", json={"contentBase64": b64(b"\xff\xd8\xff" + b"0" * 20)}, headers=bearer(parent)).status_code == 422
    big = b"\xff\xd8\xff" + b"0" * 10_000_001
    assert api.client.post("/v1/photos", json={"contentBase64": b64(big)}, headers=bearer(parent)).status_code in (413, 422)
