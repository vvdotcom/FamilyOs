"""Hometide's rhythm: routines it learns from the family's own calendar, remembered across sessions.

Three kinds of pattern are found in the household calendar, deterministically, so every suggestion can be
explained and tested:

* ``recurring_conflict``: the same person is booked for a pickup or drive while something else keeps them busy,
  week after week (for example Jordan's Tuesday and Thursday team meeting during Emma's pickup). Once the family
  has fixed one of these by hand, Hometide suggests making the adult who is free every time the usual one.
* ``usual_driver``: one adult handles most of an activity's pickups or drives, and upcoming ones have nobody
  assigned. Hometide suggests the usual person.
* ``make_weekly``: the same event was added by hand at the same weekday and time three or more times.
  Hometide suggests making it a weekly event.

A suggestion becomes a ``routine`` proposal, so it reaches the family the way voice requests do: on the TV
(confirm with the remote) or in the phone app. Nothing changes until someone says yes, and a "no" is final for
that pattern. What Hometide noticed and what the family decided is written to Amazon Bedrock AgentCore Memory
(when configured), where the voice agent can recall it in later sessions: "What has Hometide learned?"
"""
from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from .demo import demo_now
from .domain import DomainError, is_available, member_name, overlaps, parse
from .models import CalendarEvent, HouseholdSnapshot

logger = logging.getLogger("familyos.agent.rhythm")

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
LOOKBACK_DAYS = 56
LOOKAHEAD_DAYS = 180
MIN_CONFLICT_REPEATS = 2      # Seen at least twice before it counts as a pattern.
MIN_MANUAL_REPEATS = 3        # Added by hand three times at the same slot.
USUAL_SHARE = 0.7             # "Usually" means at least 70% of the time.
SOURCE = "hometide"


@dataclass
class Pattern:
    id: str
    kind: str
    summary: str               # One line for the TV card headline (proposal summary, max 240 chars).
    detail: str                # Why Hometide thinks so.
    learned: str               # The sentence remembered when the family says yes.
    payload: dict[str, Any] = field(default_factory=dict)
    evidence: int = 0          # How many times the pattern was seen.


def _stable_id(*parts: str) -> str:
    return "rhythm-" + hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def _zone(snapshot: HouseholdSnapshot):
    from .household_ops import household_zone

    return household_zone(snapshot)


def _local(snapshot: HouseholdSnapshot, value: str) -> datetime:
    return parse(value).astimezone(_zone(snapshot))


def _clock(moment: datetime) -> str:
    return moment.strftime("%I:%M %p").lstrip("0")


def _days(weekdays: Iterable[int]) -> str:
    names = [WEEKDAY_NAMES[day] + "s" for day in sorted(set(weekdays))]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def _window(snapshot: HouseholdSnapshot, now: datetime) -> list[CalendarEvent]:
    start, end = now - timedelta(days=LOOKBACK_DAYS), now + timedelta(days=LOOKAHEAD_DAYS)
    return sorted((event for event in snapshot.events if not event.allDay and start <= parse(event.startAt) <= end),
                  key=lambda event: parse(event.startAt))


def _blocker(snapshot: HouseholdSnapshot, events: list[CalendarEvent], duty: CalendarEvent) -> CalendarEvent | None:
    person = duty.responsibleMemberId
    return next((other for other in events if other.id != duty.id and not other.allDay
                 and (person in other.memberIds or other.responsibleMemberId == person)
                 and overlaps(other, duty)), None)


def recurring_conflicts(snapshot: HouseholdSnapshot, now: datetime) -> list[Pattern]:
    events = _window(snapshot, now)
    groups: dict[tuple[str, str, str], list[tuple[CalendarEvent, CalendarEvent]]] = defaultdict(list)
    for duty in events:
        if not duty.responsibleMemberId or not duty.responsibilityType:
            continue
        blocker = _blocker(snapshot, events, duty)
        if blocker:
            groups[(duty.title.casefold(), duty.responsibleMemberId, blocker.title.casefold())].append((duty, blocker))
    titles = {event.id: event.title.casefold() for event in snapshot.events}
    patterns = []
    for (title, person, _), pairs in groups.items():
        if len(pairs) < MIN_CONFLICT_REPEATS:
            continue
        # Learn from the family: raise it once they've fixed one of these by hand (a confirmed swap).
        fixes = [item for item in snapshot.proposals if item.kind == "pickup_swap" and item.status == "confirmed"
                 and item.payload.get("fromMemberId") == person and titles.get(str(item.payload.get("eventId"))) == title]
        if not fixes:
            continue
        upcoming = [duty for duty, _ in pairs if parse(duty.startAt) >= now]
        if not upcoming:
            continue
        adults = [member for member in snapshot.members if member.role == "adult" and member.id != person]
        free = next((member for member in adults if all(is_available(snapshot, duty, member.id) for duty in upcoming)), None)
        if free is None:
            continue
        duty, blocker = pairs[0]
        weekdays = sorted({_local(snapshot, item.startAt).weekday() for item, _ in pairs})
        who, other = member_name(snapshot, person), free.name
        when = _days(weekdays)
        role = "drive" if duty.responsibilityType == "drive" else duty.responsibilityType or "pickup"
        task = duty.title if role in duty.title.casefold() else f"{duty.title} {role}"
        patterns.append(Pattern(
            id=_stable_id("recurring_conflict", duty.title.casefold(), person, blocker.title.casefold(), free.id),
            kind="recurring_conflict",
            summary=f"Make {other} the usual {task} on {when}?",
            detail=(f"{who}'s {blocker.title} overlaps it every week. You swapped one by hand; it comes up "
                    f"{len(pairs)} times, and {other} is free for all {len(upcoming)} upcoming ones."),
            learned=f"{other} is the usual {task} on {when}, because {who} has {blocker.title} then.",
            payload={"pattern": "recurring_conflict", "eventIds": [item.id for item in upcoming][:60],
                     "fromMemberId": person, "toMemberId": free.id, "weekdays": weekdays},
            evidence=len(pairs),
        ))
    return patterns


def usual_drivers(snapshot: HouseholdSnapshot, now: datetime) -> list[Pattern]:
    events = _window(snapshot, now)
    by_activity: dict[str, list[CalendarEvent]] = defaultdict(list)
    for event in events:
        if event.category in ("pickup", "dropoff", "drive", "sports"):
            by_activity[(event.teamId or event.title).casefold()].append(event)
    patterns = []
    for activity, items in by_activity.items():
        assigned = [item for item in items if item.responsibleMemberId and parse(item.startAt) < now + timedelta(days=1)]
        open_items = [item for item in items if not item.responsibleMemberId and parse(item.startAt) >= now]
        if len(assigned) < MIN_MANUAL_REPEATS or not open_items:
            continue
        counts = Counter(item.responsibleMemberId for item in assigned)
        person, times = counts.most_common(1)[0]
        if times / len(assigned) < USUAL_SHARE:
            continue
        free = [item for item in open_items if is_available(snapshot, item, str(person))]
        if not free:
            continue
        kind = Counter(item.responsibilityType for item in assigned if item.responsibilityType).most_common(1)
        role = kind[0][0] if kind else "drive"
        name, title = member_name(snapshot, str(person)), items[0].title
        patterns.append(Pattern(
            id=_stable_id("usual_driver", activity, str(person)),
            kind="usual_driver",
            summary=f"Make {name} the usual {role} for {title}?",
            detail=f"{name} did {times} of the last {len(assigned)}, and {len(free)} upcoming ones have nobody assigned.",
            learned=f"{name} is the usual {role} for {title}.",
            payload={"pattern": "usual_driver", "eventIds": [item.id for item in free][:60], "toMemberId": person,
                     "responsibilityType": role},
            evidence=times,
        ))
    return patterns


def manual_repeats(snapshot: HouseholdSnapshot, now: datetime) -> list[Pattern]:
    slots: dict[tuple[str, int, str], list[CalendarEvent]] = defaultdict(list)
    for event in _window(snapshot, now):
        if event.seriesId or event.recurrence or event.calendarId:
            continue
        local = _local(snapshot, event.startAt)
        slots[(event.title.casefold(), local.weekday(), local.strftime("%H:%M"))].append(event)
    patterns = []
    for (title, weekday, hhmm), items in slots.items():
        weeks = {_local(snapshot, item.startAt).isocalendar()[:2] for item in items}
        if len(weeks) < MIN_MANUAL_REPEATS:
            continue
        name = items[0].title
        start = _local(snapshot, items[0].startAt)
        patterns.append(Pattern(
            id=_stable_id("make_weekly", title, str(weekday), hhmm),
            kind="make_weekly",
            summary=f"Make {name} a weekly event?",
            detail=f"It was added by hand {len(weeks)} {WEEKDAY_NAMES[weekday]}s in a row, at {_clock(start)}.",
            learned=f"{name} is every {WEEKDAY_NAMES[weekday]} at {_clock(start)}.",
            payload={"pattern": "make_weekly", "eventIds": [item.id for item in items][:60],
                     "seriesId": _stable_id("series", title, str(weekday), hhmm)},
            evidence=len(weeks),
        ))
    return patterns


def find_patterns(snapshot: HouseholdSnapshot, now: datetime | None = None) -> list[Pattern]:
    """Every pattern in the calendar right now, strongest first."""
    current = now or demo_now()
    found = recurring_conflicts(snapshot, current) + usual_drivers(snapshot, current) + manual_repeats(snapshot, current)
    order = {"recurring_conflict": 0, "usual_driver": 1, "make_weekly": 2}
    return sorted(found, key=lambda item: (order[item.kind], -item.evidence, item.id))


def already_asked(snapshot: HouseholdSnapshot) -> set[str]:
    return {str(item.payload.get("insightId")) for item in snapshot.proposals if item.kind == "routine"}


def next_suggestion(snapshot: HouseholdSnapshot, now: datetime | None = None) -> Pattern | None:
    """The one pattern to raise now: never one the family already answered, and only one at a time."""
    if any(item.kind == "routine" and item.status == "pending" for item in snapshot.proposals):
        return None
    asked = already_asked(snapshot)
    return next((item for item in find_patterns(snapshot, now) if item.id not in asked), None)


def learned_routines(snapshot: HouseholdSnapshot) -> list[dict[str, str]]:
    """Routines the family confirmed, newest first. This is the local copy of what AgentCore Memory holds."""
    confirmed = [item for item in snapshot.proposals if item.kind == "routine" and item.status == "confirmed"]
    return [{"routine": str(item.payload.get("learned") or item.summary), "since": item.decidedAt or item.createdAt}
            for item in sorted(confirmed, key=lambda item: item.decidedAt or "", reverse=True)]


# Applying a confirmed routine (called from proposalDecide) ----------------------------------------

def validate_routine_payload(snapshot: HouseholdSnapshot, payload: dict) -> None:
    pattern = payload.get("pattern")
    ids = payload.get("eventIds")
    if pattern not in ("recurring_conflict", "usual_driver", "make_weekly") or not isinstance(ids, list) or not ids:
        raise DomainError(422, "INVALID_PROPOSAL", "That routine is missing its events.")
    if pattern in ("recurring_conflict", "usual_driver"):
        member = next((item for item in snapshot.members if item.id == payload.get("toMemberId")), None)
        if member is None or member.role != "adult":
            raise DomainError(422, "INVALID_PROPOSAL", "Choose an adult for pickups and driving.")


def apply_routine(snapshot: HouseholdSnapshot, payload: dict) -> int:
    """Apply a confirmed routine to the events that still match it. Returns how many events changed."""
    pattern = payload["pattern"]
    wanted = set(str(item) for item in payload["eventIds"])
    events = [item for item in snapshot.events if item.id in wanted]
    changed = 0
    for event in events:
        if pattern == "recurring_conflict":
            if event.responsibleMemberId == payload.get("fromMemberId") and is_available(snapshot, event, str(payload["toMemberId"])):
                event.responsibleMemberId = str(payload["toMemberId"])
                changed += 1
        elif pattern == "usual_driver":
            if not event.responsibleMemberId and is_available(snapshot, event, str(payload["toMemberId"])):
                event.responsibleMemberId = str(payload["toMemberId"])
                event.responsibilityType = payload.get("responsibilityType") or "drive"  # type: ignore[assignment]
                changed += 1
        elif pattern == "make_weekly" and not event.seriesId:
            event.seriesId = str(payload.get("seriesId"))[:80]
            event.recurrence = "weekly"
            changed += 1
    if not changed:
        raise DomainError(409, "STALE_PROPOSAL", "The calendar already changed, so there was nothing left to update.")
    return changed


# Memory: Amazon Bedrock AgentCore Memory, with the household's own proposals as the local copy ----------

def household_actor(owner: str | None) -> str:
    """AgentCore actor id: a hash, so no account id or name leaves Hometide."""
    return "household-" + hashlib.sha256(str(owner or "local").encode()).hexdigest()[:24]


class RhythmMemory:
    """Long-term family memory. ``remember`` never blocks or fails a request; ``recall`` returns [] on any error."""

    enabled = False
    provider = "local"

    def remember(self, owner: str | None, text: str, *, role: str = "ASSISTANT") -> None:  # pragma: no cover - interface
        return None

    def recall(self, owner: str | None, query: str, limit: int = 5) -> list[str]:  # pragma: no cover - interface
        return []


class AgentCoreMemory(RhythmMemory):
    enabled = True
    provider = "agentcore"
    SESSION = "hometide-rhythm"

    def __init__(self, memory_id: str, region: str, client: Any = None, background: bool = True) -> None:
        self.memory_id = memory_id
        self.region = region
        self._client = client
        self.background = background

    @property
    def client(self):
        if self._client is None:
            import boto3
            from botocore.config import Config

            self._client = boto3.client("bedrock-agentcore", region_name=self.region,
                                        config=Config(connect_timeout=3, read_timeout=8, retries={"max_attempts": 1}))
        return self._client

    def namespace(self, owner: str | None) -> str:
        return f"/households/{household_actor(owner)}/routines"

    def _write(self, owner: str | None, text: str, role: str) -> None:
        try:
            self.client.create_event(
                memoryId=self.memory_id, actorId=household_actor(owner), sessionId=self.SESSION,
                eventTimestamp=datetime.now(timezone.utc),
                payload=[{"conversational": {"content": {"text": text[:2000]}, "role": role}}],
            )
            logger.info("rhythm: remembered in AgentCore Memory (%s)", household_actor(owner)[:18])
        except Exception as error:  # Memory is an enhancement; the family's decision is already saved.
            logger.warning("rhythm: AgentCore Memory write failed: %s", type(error).__name__)

    def remember(self, owner: str | None, text: str, *, role: str = "ASSISTANT") -> None:
        if self.background:
            threading.Thread(target=self._write, args=(owner, text, role), daemon=True).start()
        else:
            self._write(owner, text, role)

    def recall(self, owner: str | None, query: str, limit: int = 5) -> list[str]:
        try:
            records = self.client.retrieve_memory_records(
                memoryId=self.memory_id, namespace=self.namespace(owner),
                searchCriteria={"searchQuery": query[:500] or "family routines", "topK": limit}, maxResults=limit,
            ).get("memoryRecordSummaries", [])
            texts = [str((item.get("content") or {}).get("text") or "").strip() for item in records]
            if not any(texts):  # Long-term extraction runs asynchronously; fall back to the raw events.
                events = self.client.list_events(memoryId=self.memory_id, actorId=household_actor(owner),
                                                 sessionId=self.SESSION, includePayloads=True, maxResults=20).get("events", [])
                texts = [str(part.get("conversational", {}).get("content", {}).get("text") or "")
                         for event in events for part in event.get("payload", [])]
            return [text for text in texts if text][:limit]
        except Exception as error:
            logger.warning("rhythm: AgentCore Memory recall failed: %s", type(error).__name__)
            return []


def memory_from_env() -> RhythmMemory:
    memory_id = os.getenv("HOMETIDE_AGENTCORE_MEMORY_ID", "").strip()
    if memory_id:
        return AgentCoreMemory(memory_id, os.getenv("AWS_REGION") or "us-west-2")
    return RhythmMemory()


# Orchestration ------------------------------------------------------------------------------------

class Rhythm:
    """Raises at most one routine at a time, re-checking only when the household changed."""

    def __init__(self, memory: RhythmMemory | None = None, min_interval: float = 30.0) -> None:
        self.memory = memory or memory_from_env()
        self.min_interval = min_interval
        self._checked: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def due(self, owner: str | None, revision: int) -> bool:
        key = str(owner)
        with self._lock:
            last = self._checked.get(key)
            if last and time.monotonic() - last[1] < (600 if last[0] == revision else self.min_interval):
                return False
            self._checked[key] = (revision, time.monotonic())
            return True

    def check(self, service, owner: str | None, snapshot: HouseholdSnapshot, *, force: bool = False) -> HouseholdSnapshot:
        """If a new pattern is waiting, turn it into a routine proposal. Returns the (possibly updated) snapshot."""
        if not force and not self.due(owner, snapshot.revision):
            return snapshot
        pattern = next_suggestion(snapshot)
        if pattern is None:
            return snapshot
        from uuid import uuid4

        from .permissions import Actor

        try:
            updated = service.edit(Actor("system", owner), "proposalCreate", {
                "id": uuid4().hex, "kind": "routine", "source": SOURCE, "requestedBy": SOURCE,
                "summary": pattern.summary[:240],
                "payload": {**pattern.payload, "insightId": pattern.id, "detail": pattern.detail[:300],
                            "learned": pattern.learned[:300], "evidence": pattern.evidence,
                            "memory": self.memory.provider},
            }, server=True)
        except DomainError as error:
            logger.info("rhythm: suggestion skipped (%s)", error.code)
            return snapshot
        self.memory.remember(owner, f"Hometide noticed: {pattern.summary} {pattern.detail}")
        logger.info("rhythm: suggested %s", pattern.kind)
        return updated

    def decided(self, owner: str | None, proposal) -> None:
        """Remember the family's answer to a routine, so later sessions know it."""
        if proposal.kind != "routine" or proposal.status not in ("confirmed", "rejected"):
            return
        learned = str(proposal.payload.get("learned") or proposal.summary)
        if proposal.status == "confirmed":
            self.memory.remember(owner, f"The family decided: {learned}", role="USER")
        else:
            self.memory.remember(owner, f"The family said no to this routine, so Hometide won't suggest it again: {proposal.summary}",
                                 role="USER")

    def recall(self, owner: str | None, snapshot: HouseholdSnapshot, query: str = "") -> dict[str, Any]:
        local = [item["routine"] for item in learned_routines(snapshot)]
        remembered = self.memory.recall(owner, query or "the family's usual routines and decisions") if self.memory.enabled else []
        return {"routines": local, "remembered": [text for text in remembered if text not in local],
                "memory": self.memory.provider}
