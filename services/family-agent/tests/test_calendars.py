"""Connected calendars: private iCal links from Google, iCloud, or Outlook, mirrored read-only."""
from __future__ import annotations

import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from conftest import bearer, child_session, edit, household, pair_tv, parent_token
from app import calendars
from app.domain import DomainError
from app.models import CalendarSubscriptionMeta, HouseholdSnapshot

NOW = datetime(2026, 9, 22, 14, 30, tzinfo=ZoneInfo("America/Phoenix"))
GOOGLE_LINK = "https://calendar.google.com/calendar/ical/alex%40example.test/private-0123456789abcdef/basic.ics"

# Demo "now" is Tuesday 2026-09-22 14:30 in America/Phoenix (see conftest).
FEED = b"""BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Test//FamilyOS//EN\r
X-WR-CALNAME:Alex\r
BEGIN:VTIMEZONE\r
TZID:America/Los_Angeles\r
BEGIN:DAYLIGHT\r
TZOFFSETFROM:-0800\r
TZOFFSETTO:-0700\r
DTSTART:19700308T020000\r
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r
TZNAME:PDT\r
END:DAYLIGHT\r
BEGIN:STANDARD\r
TZOFFSETFROM:-0700\r
TZOFFSETTO:-0800\r
DTSTART:19701101T020000\r
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r
TZNAME:PST\r
END:STANDARD\r
END:VTIMEZONE\r
BEGIN:VEVENT\r
UID:practice-1@test\r
SUMMARY:Soccer practice\r
LOCATION:Reid Park Field 3\r
DTSTART;TZID=America/Los_Angeles:20260915T170000\r
DTEND;TZID=America/Los_Angeles:20260915T180000\r
RRULE:FREQ=WEEKLY;COUNT=6\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:practice-1@test\r
RECURRENCE-ID;TZID=America/Los_Angeles:20260929T170000\r
SUMMARY:Soccer practice (moved)\r
DTSTART;TZID=America/Los_Angeles:20260930T170000\r
DTEND;TZID=America/Los_Angeles:20260930T180000\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:no-school@test\r
SUMMARY:No school\r
DTSTART;VALUE=DATE:20260925\r
DTEND;VALUE=DATE:20260926\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:dentist@test\r
SUMMARY:Dentist\r
DTSTART:20260923T180000Z\r
DURATION:PT45M\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled@test\r
SUMMARY:Cancelled lunch\r
STATUS:CANCELLED\r
DTSTART:20260924T190000Z\r
DTEND:20260924T200000Z\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:old@test\r
SUMMARY:Last spring\r
DTSTART:20260401T190000Z\r
DTEND:20260401T200000Z\r
END:VEVENT\r
END:VCALENDAR\r
"""


@pytest.fixture
def feed(monkeypatch):
    """Serve calendar links from memory. ``state['body']`` is what the next download returns."""
    state = {"body": FEED, "calls": []}

    def fake_fetch(url: str) -> bytes:
        state["calls"].append(url)
        if isinstance(state["body"], DomainError):
            raise state["body"]
        return state["body"]

    monkeypatch.setattr(calendars, "fetch_ics", fake_fetch)
    return state


def connect(api, token: str, url: str = GOOGLE_LINK, **extra):
    return api.client.post("/v1/calendars", headers=bearer(token), json={"label": "Alex's calendar", "url": url, **extra})


def synced(snapshot: dict) -> list[dict]:
    return [item for item in snapshot["events"] if item.get("calendarId")]


# Link checks -------------------------------------------------------------------------------------

def test_links_are_normalized_and_providers_recognized():
    assert calendars.normalize_url(" webcal://p42-caldav.icloud.com/published/2/abc ") == "https://p42-caldav.icloud.com/published/2/abc"
    assert calendars.guess_provider(GOOGLE_LINK) == "google"
    assert calendars.guess_provider("https://p42-caldav.icloud.com/published/2/abc") == "icloud"
    assert calendars.guess_provider("https://outlook.office365.com/owa/calendar/x/y/calendar.ics") == "outlook"
    assert calendars.guess_provider("https://schools.example.org/district.ics") == "ics"
    assert calendars.guess_provider("https://evilgoogle.com/cal.ics") == "ics"
    assert calendars.display_host(GOOGLE_LINK) == "calendar.google.com"


@pytest.mark.parametrize("url", [
    "http://calendar.google.com/calendar/ical/x/basic.ics",
    "ftp://example.org/cal.ics",
    "file:///etc/passwd",
    "https://user:pass@example.org/cal.ics",
    "https://example.org:8443/cal.ics",
    "calendar.google.com/calendar/ical/x/basic.ics",
    "https://example.org/" + "a" * 2100,
])
def test_unsupported_links_are_refused_before_any_download(url):
    with pytest.raises(DomainError) as error:
        calendars.normalize_url(url)
    assert error.value.code == "INVALID_CALENDAR_LINK"


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "10.1.2.3", "192.168.1.20", "169.254.169.254", "::1", "100.64.0.1"])
def test_private_network_addresses_are_refused(host):
    with pytest.raises(DomainError) as error:
        calendars.resolve_public(host)
    assert error.value.code == "INVALID_CALENDAR_LINK"


def test_every_redirect_is_rechecked():
    hops = []

    def resolver(host: str) -> str:
        if host == "internal.example":
            raise DomainError(422, "INVALID_CALENDAR_LINK", "private")
        return "93.184.215.14"

    def fetcher(url: str, address: str):
        hops.append((url, address))
        return 302, {"location": "https://internal.example/steal"}, b""

    with pytest.raises(DomainError) as error:
        calendars.fetch_ics("https://calendar.example.org/cal.ics", fetcher=fetcher, resolver=resolver)
    assert error.value.code == "INVALID_CALENDAR_LINK"
    assert hops == [("https://calendar.example.org/cal.ics", "93.184.215.14")]  # Never connected to the second host.


def test_redirect_to_plain_http_is_refused():
    def fetcher(url, address):
        return 301, {"location": "http://calendar.example.org/cal.ics"}, b""

    with pytest.raises(DomainError) as error:
        calendars.fetch_ics("https://calendar.example.org/cal.ics", fetcher=fetcher, resolver=lambda host: "93.184.215.14")
    assert error.value.code == "INVALID_CALENDAR_LINK"


@pytest.mark.parametrize(("status", "body", "code"), [
    (404, b"", "CALENDAR_NOT_SHARED"),
    (403, b"", "CALENDAR_NOT_SHARED"),
    (500, b"", "CALENDAR_UNREACHABLE"),
    (200, b"<!doctype html><html>Sign in</html>", "NOT_A_CALENDAR"),
])
def test_download_failures_have_plain_answers(status, body, code):
    with pytest.raises(DomainError) as error:
        calendars.fetch_ics("https://calendar.example.org/cal.ics", fetcher=lambda url, address: (status, {}, body),
                            resolver=lambda host: "93.184.215.14")
    assert error.value.code == code
    assert "calendar.example.org" not in error.value.message


def test_links_are_encrypted_and_bound_to_their_household():
    key = calendars.link_key(b"server-secret")
    sealed = calendars.seal_link(key, "owner-a", "cal-1", GOOGLE_LINK)
    assert GOOGLE_LINK.encode() not in sealed
    assert calendars.open_link(key, "owner-a", "cal-1", sealed) == GOOGLE_LINK
    assert calendars.open_link(key, "owner-b", "cal-1", sealed) is None
    assert calendars.open_link(calendars.link_key(b"other-secret"), "owner-a", "cal-1", sealed) is None


# Parsing -----------------------------------------------------------------------------------------

def _snapshot() -> HouseholdSnapshot:
    from app.domain import DemoRepository
    return DemoRepository().snapshot()


def test_feed_expands_repeats_exceptions_and_all_day_items():
    meta = CalendarSubscriptionMeta(id="c1", label="Alex", provider="google", memberIds=["alex", "emma"])
    events = calendars.events_from_ics(FEED, meta, _snapshot(), now=NOW)
    titles = [(item.title, item.startAt) for item in events]
    # Weekly practice 5 pm Pacific = 5 pm Phoenix in September (Phoenix has no daylight saving).
    assert ("Soccer practice", "2026-09-15T17:00:00-07:00") in titles
    assert ("Soccer practice", "2026-09-22T17:00:00-07:00") in titles
    assert ("Soccer practice (moved)", "2026-09-30T17:00:00-07:00") in titles
    assert not any(start.startswith("2026-09-29") for _, start in titles)  # The moved occurrence is not doubled.
    assert "Cancelled lunch" not in [title for title, _ in titles]
    assert "Last spring" not in [title for title, _ in titles]  # Outside the sync window.
    no_school = next(item for item in events if item.title == "No school")
    assert no_school.allDay and no_school.startAt == "2026-09-25T00:00:00-07:00" and no_school.category == "school"
    dentist = next(item for item in events if item.title == "Dentist")
    assert dentist.startAt == "2026-09-23T11:00:00-07:00" and dentist.endAt == "2026-09-23T11:45:00-07:00"
    assert dentist.category == "appointment"
    practice = next(item for item in events if item.title == "Soccer practice")
    assert practice.category == "sports" and practice.location == "Reid Park Field 3"
    assert all(item.source == "google" and item.calendarId == "c1" and item.memberIds == ["alex", "emma"] for item in events)
    assert len({item.id for item in events}) == len(events)


def test_event_ids_are_stable_between_syncs():
    meta = CalendarSubscriptionMeta(id="c1", label="Alex", provider="ics")
    first = [item.id for item in calendars.events_from_ics(FEED, meta, _snapshot(), now=NOW)]
    second = [item.id for item in calendars.events_from_ics(FEED, meta, _snapshot(), now=NOW)]
    assert first == second


def test_garbage_is_not_a_calendar():
    meta = CalendarSubscriptionMeta(id="c1", label="Alex", provider="ics")
    with pytest.raises(DomainError) as error:
        calendars.events_from_ics(b"BEGIN:VCALENDAR\r\nthis is not ical", meta, _snapshot())
    assert error.value.code == "NOT_A_CALENDAR"


# API ---------------------------------------------------------------------------------------------

def test_parent_connects_a_calendar_and_events_appear(api, feed):
    parent = parent_token(api)
    reply = connect(api, parent, memberIds=["alex"])
    assert reply.status_code == 200, reply.text
    data = reply.json()["data"]
    calendar = data["calendar"]
    assert calendar["provider"] == "google" and calendar["host"] == "calendar.google.com"
    assert calendar["status"] == "ok" and calendar["eventCount"] == len(synced(data["household"])) > 0
    assert calendar["label"] == "Alex's calendar"
    snapshot = household(api, parent)
    assert any(item["title"] == "Dentist" for item in synced(snapshot))
    assert any(entry["action"] == "calendarAdd" for entry in snapshot["auditLog"])
    # The TV sees the events too.
    tv = pair_tv(api, parent)
    assert any(item["title"] == "Dentist" for item in synced(household(api, tv)))


def test_the_private_link_never_reaches_a_client_or_the_database_in_plain_text(api, feed):
    parent = parent_token(api)
    connect(api, parent)
    for path in ("/v1/household", "/v1/events"):
        assert "private-0123456789abcdef" not in api.client.get(path, headers=bearer(parent)).text
    tv = pair_tv(api, parent)
    assert "private-0123456789abcdef" not in api.client.get("/v1/household", headers=bearer(tv)).text
    database = api.main.auth_store.path
    with sqlite3.connect(database) as connection:
        stored = b"".join(bytes(row[0]) for row in connection.execute("SELECT sealed_url FROM calendar_links"))
    assert stored and b"private-0123456789abcdef" not in stored


def test_bad_links_save_nothing(api, feed):
    parent = parent_token(api)
    feed["body"] = DomainError(422, "NOT_A_CALENDAR", "That link opens a web page, not a calendar.")
    reply = connect(api, parent)
    assert reply.status_code == 422 and reply.json()["error"]["code"] == "NOT_A_CALENDAR"
    assert household(api, parent)["calendars"] == []
    assert api.main.auth_store.calendar_links() == []


def test_same_link_twice_is_refused(api, feed):
    parent = parent_token(api)
    assert connect(api, parent).status_code == 200
    reply = connect(api, parent)
    assert reply.status_code == 409 and reply.json()["error"]["code"] == "CALENDAR_ALREADY_CONNECTED"


def test_only_parents_connect_calendars(api, feed):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    assert api.client.post("/v1/access-code", json={"code": "2468"}, headers=bearer(parent)).status_code == 200
    child = child_session(api, "emma")
    assert connect(api, tv).status_code in (401, 403)
    assert connect(api, child).status_code == 403
    assert connect(api, "not-a-token").status_code == 401
    # The server-only steps can't be called directly, even by a parent.
    direct = edit(api, parent, "calendarAdd", {"id": "fake", "label": "Fake", "provider": "google", "host": "x", "memberIds": []})
    assert direct.status_code == 403 and direct.json()["error"]["code"] == "CONFIRMATION_REQUIRED"


def test_synced_events_are_read_only(api, feed):
    parent = parent_token(api)
    connect(api, parent)
    snapshot = household(api, parent)
    event = next(item for item in synced(snapshot) if item["title"] == "Dentist")
    changed = edit(api, parent, "event", {**event, "title": "Renamed"})
    assert changed.status_code == 409 and changed.json()["error"]["code"] == "SYNCED_EVENT_READ_ONLY"
    deleted = edit(api, parent, "deleteEvent", {"id": event["id"]})
    assert deleted.status_code == 409
    # A family's own event can't pretend to be a synced one.
    own = {**event, "id": "own-event", "title": "Our own", "calendarId": "whatever", "source": "google"}
    saved = edit(api, parent, "event", own)
    assert saved.status_code == 200, saved.text
    mine = next(item for item in saved.json()["data"]["events"] if item["id"] == "own-event")
    assert mine["calendarId"] is None and mine["source"] == "manual"


def test_resync_replaces_changed_events_and_keeps_the_revision_when_nothing_changed(api, feed):
    parent = parent_token(api)
    calendar_id = connect(api, parent).json()["data"]["calendar"]["id"]
    before = household(api, parent)
    api.main._manual_syncs.clear()
    same = api.client.post(f"/v1/calendars/{calendar_id}/sync", headers=bearer(parent))
    assert same.status_code == 200
    assert same.json()["data"]["household"]["revision"] == before["revision"]  # No news: no stale edits.
    feed["body"] = FEED.replace(b"SUMMARY:Dentist", b"SUMMARY:Dentist (Dr. Kim)")
    api.main._manual_syncs.clear()
    after = api.client.post(f"/v1/calendars/{calendar_id}/sync", headers=bearer(parent)).json()["data"]["household"]
    assert after["revision"] == before["revision"] + 1
    titles = [item["title"] for item in synced(after)]
    assert "Dentist (Dr. Kim)" in titles and "Dentist" not in titles


def test_manual_sync_is_rate_limited(api, feed):
    parent = parent_token(api)
    calendar_id = connect(api, parent).json()["data"]["calendar"]["id"]
    api.main._manual_syncs.clear()
    assert api.client.post(f"/v1/calendars/{calendar_id}/sync", headers=bearer(parent)).status_code == 200
    again = api.client.post(f"/v1/calendars/{calendar_id}/sync", headers=bearer(parent))
    assert again.status_code == 429


def test_a_failing_feed_keeps_the_last_good_events(api, feed):
    parent = parent_token(api)
    calendar_id = connect(api, parent).json()["data"]["calendar"]["id"]
    count = len(synced(household(api, parent)))
    feed["body"] = DomainError(502, "CALENDAR_UNREACHABLE", "down")
    assert api.main.sync_all_calendars() == 1
    snapshot = household(api, parent)
    calendar = next(item for item in snapshot["calendars"] if item["id"] == calendar_id)
    assert calendar["status"] == "error" and "Retrying" in calendar["message"]
    assert len(synced(snapshot)) == count
    feed["body"] = FEED
    api.main.sync_all_calendars()
    calendar = next(item for item in household(api, parent)["calendars"] if item["id"] == calendar_id)
    assert calendar["status"] == "ok" and calendar["message"] == ""


def test_changing_whose_calendar_moves_its_events(api, feed):
    parent = parent_token(api)
    calendar_id = connect(api, parent, memberIds=["alex"]).json()["data"]["calendar"]["id"]
    saved = edit(api, parent, "calendarMeta", {"id": calendar_id, "label": "Emma's school", "memberIds": ["emma"]})
    assert saved.status_code == 200, saved.text
    data = saved.json()["data"]
    assert next(item for item in data["calendars"] if item["id"] == calendar_id)["label"] == "Emma's school"
    assert all(item["memberIds"] == ["emma"] and item["ownerMemberId"] == "emma" for item in synced(data))
    assert edit(api, parent, "calendarMeta", {"id": calendar_id, "memberIds": ["stranger"]}).status_code == 422


def test_disconnect_removes_events_and_the_stored_link(api, feed):
    parent = parent_token(api)
    calendar_id = connect(api, parent).json()["data"]["calendar"]["id"]
    reply = api.client.post(f"/v1/calendars/{calendar_id}/delete", headers=bearer(parent))
    assert reply.status_code == 200
    data = reply.json()["data"]
    assert data["calendars"] == [] and synced(data) == []
    assert api.main.auth_store.calendar_links() == []
    assert api.client.post(f"/v1/calendars/{calendar_id}/delete", headers=bearer(parent)).status_code == 404


def test_all_day_items_do_not_create_conflicts(api, feed):
    parent = parent_token(api)
    connect(api, parent, memberIds=["alex", "jordan", "emma", "leo"])
    conflicts = api.client.get("/v1/conflicts", headers=bearer(parent)).json()["data"]
    snapshot = household(api, parent)
    all_day = {item["id"] for item in synced(snapshot) if item["allDay"]}
    assert all_day and not any(set(item["eventIds"]) & all_day for item in conflicts)


def test_voice_cannot_move_a_synced_event(api, feed):
    from app.household_ops import _validate_proposal_payload
    parent = parent_token(api)
    connect(api, parent)
    snapshot = api.main.service().snapshot(None)
    event = next(item for item in snapshot.events if item.calendarId)
    with pytest.raises(DomainError) as error:
        _validate_proposal_payload(snapshot, "reschedule", {
            "eventId": event.id, "startAt": "2026-09-23T12:00:00-07:00", "endAt": "2026-09-23T13:00:00-07:00"})
    assert error.value.code == "SYNCED_EVENT_READ_ONLY"
