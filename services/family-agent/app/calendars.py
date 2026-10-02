"""Read-only calendar subscriptions: Google, iCloud, Outlook, or any iCal (.ics) link.

A parent pastes the calendar's private iCal link once. The server re-reads it on a schedule and
mirrors the next few months of events into the household, where they show on the TV and phone and
take part in conflict detection. Hometide never writes back.

The link is a secret (anyone holding it can read that calendar), so it is encrypted at rest, kept out
of the household snapshot, and never returned to any client. It is fetched only over HTTPS from a
public internet address that is checked before connecting and pinned for the connection, so a link
cannot be used to reach the server's own network.
"""
from __future__ import annotations

import hashlib
import ipaddress
import os
import re
import socket
from datetime import date, datetime, timedelta, timezone
from typing import Callable
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import httpx
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .demo import demo_now
from .domain import DomainError
from .household_ops import calendar_members, household_zone
from .models import CalendarEvent, CalendarSubscriptionMeta, HouseholdSnapshot

MAX_CALENDARS = 10
MAX_BYTES = 3_000_000
MAX_EVENTS_PER_CALENDAR = 400
MAX_REDIRECTS = 3
PAST_DAYS = 7
FUTURE_DAYS = 90
USER_AGENT = "FamilyOS-CalendarSync/1.0 (read-only)"

# (status, lower-cased headers, body) for one GET to ``url`` connected to ``address``.
Fetcher = Callable[[str, str], tuple[int, dict[str, str], bytes]]
Resolver = Callable[[str], str]


# Links -------------------------------------------------------------------------------------------

def normalize_url(raw: str) -> str:
    """Accept https:// and webcal:// links; reject anything else before any network access."""
    value = (raw or "").strip()
    if value.lower().startswith("webcal://"):
        value = "https://" + value[len("webcal://"):]
    if len(value) > 2048:
        raise DomainError(422, "INVALID_CALENDAR_LINK", "That calendar link is too long.")
    try:
        parsed = urlparse(value)
        port = parsed.port
    except ValueError as error:
        raise DomainError(422, "INVALID_CALENDAR_LINK", "That doesn't look like a calendar link.") from error
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise DomainError(422, "INVALID_CALENDAR_LINK", "Paste the calendar's iCal link. It starts with https:// or webcal://.")
    if parsed.username or parsed.password or port not in (None, 443):
        raise DomainError(422, "INVALID_CALENDAR_LINK", "That calendar link isn't supported. Copy the iCal link again.")
    return value


def guess_provider(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host == "google.com" or host.endswith(".google.com"):
        return "google"
    if host == "icloud.com" or host.endswith(".icloud.com"):
        return "icloud"
    if any(host == suffix or host.endswith("." + suffix) for suffix in ("outlook.com", "office365.com", "live.com")):
        return "outlook"
    return "ics"


def display_host(url: str) -> str:
    """The server name only. Paths and query strings can contain the secret part of the link."""
    return (urlparse(url).hostname or "")[:120]


# Encryption at rest ------------------------------------------------------------------------------

def link_key(secret: bytes) -> bytes:
    return hashlib.sha256(b"familyos:calendar-links:v1:" + secret).digest()


def seal_link(key: bytes, owner: str, calendar_id: str, url: str) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, url.encode("utf-8"), f"{owner}|{calendar_id}".encode("utf-8"))


def open_link(key: bytes, owner: str, calendar_id: str, sealed: bytes) -> str | None:
    try:
        return AESGCM(key).decrypt(sealed[:12], sealed[12:], f"{owner}|{calendar_id}".encode("utf-8")).decode("utf-8")
    except (InvalidTag, ValueError):
        return None  # The server key changed; the parent reconnects the calendar.


# Fetching ----------------------------------------------------------------------------------------

def resolve_public(host: str) -> str:
    """Resolve ``host`` to one public address, refusing private, loopback, and other internal ones."""
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError, OSError) as error:
        raise DomainError(422, "CALENDAR_UNREACHABLE", "We couldn't find that calendar's server. Check the link.") from error
    addresses = []
    for info in infos:
        address = ipaddress.ip_address(str(info[4][0]).split("%")[0])
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        if not address.is_global or address.is_multicast:
            raise DomainError(422, "INVALID_CALENDAR_LINK", "That calendar link points to a private network address.")
        addresses.append(address)
    if not addresses:
        raise DomainError(422, "CALENDAR_UNREACHABLE", "We couldn't find that calendar's server. Check the link.")
    return str(sorted(addresses, key=lambda item: item.version)[0])  # Prefer IPv4.


def http_fetch(url: str, address: str) -> tuple[int, dict[str, str], bytes]:
    """GET ``url`` over a connection to the already-checked ``address`` (no second DNS lookup)."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").encode("idna").decode("ascii")
    pinned = parsed._replace(netloc=f"[{address}]" if ":" in address else address).geturl()
    headers = {"Host": host, "User-Agent": USER_AGENT, "Accept": "text/calendar, text/plain;q=0.8, */*;q=0.5"}
    with httpx.Client(timeout=httpx.Timeout(10.0), follow_redirects=False, trust_env=False) as client:
        # TLS still verifies the certificate against the real host name (SNI), not the address.
        with client.stream("GET", pinned, headers=headers, extensions={"sni_hostname": host}) as response:
            body = bytearray()
            if response.status_code == 200:
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise DomainError(413, "CALENDAR_TOO_LARGE", "That calendar is too large to sync.")
            return response.status_code, {key.lower(): value for key, value in response.headers.items()}, bytes(body)


def fetch_ics(url: str, fetcher: Fetcher = http_fetch, resolver: Resolver = resolve_public) -> bytes:
    """Download an iCal file, re-checking every redirect."""
    current = normalize_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        address = resolver(urlparse(current).hostname or "")
        try:
            status, headers, body = fetcher(current, address)
        except DomainError:
            raise
        except Exception as error:  # Report the category only; never echo the private link.
            raise DomainError(502, "CALENDAR_UNREACHABLE", "We couldn't reach that calendar right now.") from error
        if status in (301, 302, 303, 307, 308) and headers.get("location"):
            current = normalize_url(urljoin(current, headers["location"]))
            continue
        if status in (401, 403, 404, 410):
            raise DomainError(422, "CALENDAR_NOT_SHARED",
                              "That calendar link didn't work. It may be private, reset, or expired. Copy it again.")
        if status != 200:
            raise DomainError(502, "CALENDAR_UNREACHABLE", "That calendar's server didn't answer. We'll try again later.")
        if not body.lstrip(b"\xef\xbb\xbf \r\n\t").startswith(b"BEGIN:VCALENDAR"):
            raise DomainError(422, "NOT_A_CALENDAR",
                              "That link opens a web page, not a calendar. Copy the iCal (.ics) link instead.")
        return body
    raise DomainError(422, "CALENDAR_UNREACHABLE", "That calendar link redirects too many times.")


# Parsing -----------------------------------------------------------------------------------------

_CATEGORY_WORDS = (
    ("sports", re.compile(r"\b(practice|tournament|scrimmage|soccer|baseball|softball|t-ball|basketball|hockey|swim meet|"
                          r"gymnastics|lacrosse|volleyball|football|tennis|karate)\b", re.I)),
    ("appointment", re.compile(r"\b(dentist|doctor|dr|orthodontist|appointment|appt|checkup|check-up|pediatrician|vet)\b", re.I)),
    ("school", re.compile(r"\b(school|parent-teacher|pta|pto|field trip|early release|early dismissal|half day)\b", re.I)),
)


def guess_category(title: str) -> str:
    for category, pattern in _CATEGORY_WORDS:
        if pattern.search(title):
            return category
    return "family"


def _as_datetime(value, zone: ZoneInfo) -> tuple[datetime, bool]:
    """An aware datetime, and whether the value was an all-day date."""
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=zone)), False
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=zone), True
    raise ValueError("Unsupported date value")


def _clean(value: object, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def events_from_ics(content: bytes, meta: CalendarSubscriptionMeta, snapshot: HouseholdSnapshot,
                    now: datetime | None = None) -> list[CalendarEvent]:
    """Expand the calendar (including repeating events) into Hometide events for the sync window."""
    import icalendar
    import recurring_ical_events

    zone = household_zone(snapshot)
    current = now or demo_now()
    window_start, window_end = current - timedelta(days=PAST_DAYS), current + timedelta(days=FUTURE_DAYS)
    try:
        calendar = icalendar.Calendar.from_ical(content)
        occurrences = recurring_ical_events.of(calendar).between(window_start, window_end)
    except Exception as error:
        raise DomainError(422, "NOT_A_CALENDAR", "That calendar couldn't be read.") from error
    members = calendar_members(snapshot, meta.memberIds)
    if not members:
        raise DomainError(422, "HOUSEHOLD_NOT_READY", "Add a family member before connecting a calendar.")
    events: dict[str, CalendarEvent] = {}
    for component in occurrences:
        if str(component.get("STATUS", "")).upper() == "CANCELLED":
            continue
        try:
            begins, all_day = _as_datetime(component.get("DTSTART").dt, zone)
            if component.get("DTEND") is not None:
                ends, _ = _as_datetime(component.get("DTEND").dt, zone)
            elif component.get("DURATION") is not None:
                ends = begins + component.get("DURATION").dt
            else:
                ends = begins + (timedelta(days=1) if all_day else timedelta(hours=1))
        except (AttributeError, ValueError, TypeError, OverflowError):
            continue
        if ends <= begins:
            ends = begins + (timedelta(days=1) if all_day else timedelta(minutes=30))
        title = _clean(component.get("SUMMARY"), 120) or "Busy"
        uid = str(component.get("UID") or title)
        digest = hashlib.sha256(f"{uid}|{begins.isoformat()}".encode("utf-8")).hexdigest()[:20]
        event_id = f"cal-{meta.id[:24]}-{digest}"
        events[event_id] = CalendarEvent(
            id=event_id, familyId=snapshot.family.id, title=title, category=guess_category(title),
            startAt=begins.astimezone(zone).isoformat(timespec="seconds"),
            endAt=ends.astimezone(zone).isoformat(timespec="seconds"),
            ownerMemberId=members[0], memberIds=list(members), location=_clean(component.get("LOCATION"), 240) or None,
            source=meta.provider, allDay=all_day, calendarId=meta.id,
        )
    ordered = sorted(events.values(), key=lambda item: (item.startAt, item.id))
    return ordered[:MAX_EVENTS_PER_CALENDAR]


# Applying a sync ---------------------------------------------------------------------------------

def apply_sync(snapshot: HouseholdSnapshot, calendar_id: str, events: list[CalendarEvent] | None,
               error: DomainError | None = None) -> HouseholdSnapshot:
    """Replace one calendar's mirrored events. The revision moves only when the events changed.

    A failed fetch (``events is None``) keeps the last good copy on screen and records why.
    """
    updated = snapshot.model_copy(deep=True)
    meta = next((item for item in updated.calendars if item.id == calendar_id), None)
    if meta is None:
        return updated  # Removed while this sync was running.
    shown_before = (meta.status, meta.message, meta.eventCount)
    events_changed = False
    if events is None:
        meta.status = "error"
        meta.message = friendly_status(error) if error else "Couldn't sync this calendar. Retrying automatically."
    else:
        members = calendar_members(updated, meta.memberIds)
        for event in events:  # Members may have changed while the calendar was downloading.
            event.memberIds = [member_id for member_id in event.memberIds if member_id in members] or members
            event.ownerMemberId = event.memberIds[0]
        meta.status, meta.message = "ok", ""
        meta.lastSyncedAt = datetime.now(timezone.utc).isoformat(timespec="seconds")
        meta.eventCount = len(events)
        before = [item.model_dump() for item in updated.events if item.calendarId == calendar_id]
        events_changed = before != [item.model_dump() for item in events]
        if events_changed:
            updated.events = [item for item in updated.events if item.calendarId != calendar_id] + events
    # A routine sync with no news leaves the revision alone, so it never makes an edit look stale.
    if events_changed or (meta.status, meta.message, meta.eventCount) != shown_before:
        updated.revision += 1
    return updated


def friendly_status(error: DomainError) -> str:
    if error.status_code >= 500:
        return "Couldn't reach this calendar. Retrying automatically."
    return error.message[:160]
