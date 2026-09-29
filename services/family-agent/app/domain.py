from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from threading import RLock
from uuid import uuid4

from .demo import create_demo_household, demo_now
from .models import CalendarEvent, Conflict, FamilyBriefing, HouseholdContext, HouseholdSnapshot, ProposedAction


class DomainError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class DemoRepository:
    """Small in-memory repository for isolated local demos."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._data = create_demo_household()
        self._actions: dict[str, ProposedAction] = {}
        self._history: list[dict[str, object]] = []

    def snapshot(self) -> HouseholdSnapshot:
        with self._lock:
            return self._data.model_copy(deep=True)

    def reset(self) -> HouseholdSnapshot:
        with self._lock:
            self._data = create_demo_household()
            self._actions.clear()
            self._history.clear()
            return self._data.model_copy(deep=True)

    def events(self, start: datetime | None = None, end: datetime | None = None) -> list[CalendarEvent]:
        with self._lock:
            values = self._data.events
            if start:
                values = [item for item in values if parse(item.endAt) > start]
            if end:
                values = [item for item in values if parse(item.startAt) < end]
            return [item.model_copy(deep=True) for item in values]

    def conflicts(self) -> list[Conflict]:
        with self._lock:
            return detect_conflicts(self._data, demo_now())

    def propose(self, conflict_id: str, event_id: str, target_member_id: str) -> ProposedAction:
        with self._lock:
            for existing in self._actions.values():
                if (existing.conflictId == conflict_id and existing.eventId == event_id
                        and existing.toMemberId == target_member_id and existing.status == "proposed"):
                    return existing.model_copy(deep=True)
            conflicts = detect_conflicts(self._data, demo_now())
            conflict = next((item for item in conflicts if item.id == conflict_id), None)
            event = next((item for item in self._data.events if item.id == event_id), None)
            member = next((item for item in self._data.members if item.id == target_member_id), None)
            if conflict is None or conflict.type != "responsibility_overlap" or event_id not in conflict.eventIds:
                raise DomainError(409, "STALE_CONFLICT", "That conflict is no longer active. Refresh the family schedule.")
            if event is None or not event.responsibleMemberId:
                raise DomainError(422, "INVALID_ACTION", "This event has no pickup responsibility to change.")
            if member is None or member.role != "adult" or not is_available(self._data, event, target_member_id):
                raise DomainError(422, "INVALID_ACTION", "Choose an available adult for this pickup.")
            action = ProposedAction(
                id=f"action:{uuid4().hex}", type="reassign_responsibility", status="proposed",
                eventId=event.id, conflictId=conflict.id, fromMemberId=event.responsibleMemberId,
                toMemberId=member.id, createdAt=demo_now().isoformat(),
            )
            self._actions[action.id] = action
            return action.model_copy(deep=True)

    def confirm(self, action_id: str) -> tuple[ProposedAction, CalendarEvent, list[dict[str, object]]]:
        with self._lock:
            action = self._actions.get(action_id)
            if action is None:
                raise DomainError(404, "ACTION_NOT_FOUND", "That suggestion could not be found.")
            event = next((item for item in self._data.events if item.id == action.eventId), None)
            if action.status == "confirmed" and event is not None:
                return action.model_copy(deep=True), event.model_copy(deep=True), deepcopy(self._history)
            if action.status != "proposed" or event is None:
                raise DomainError(409, "ACTION_NOT_PENDING", "That suggestion is no longer waiting for confirmation.")
            active = next((item for item in detect_conflicts(self._data, demo_now()) if item.id == action.conflictId), None)
            if (active is None or event.responsibleMemberId != action.fromMemberId
                    or not is_available(self._data, event, action.toMemberId)):
                raise DomainError(409, "STALE_ACTION", "The schedule changed. Review the pickup again before confirming.")
            event.responsibleMemberId = action.toMemberId
            action.status = "confirmed"
            action.confirmedAt = demo_now().isoformat()
            self._history.append({
                **action.model_dump(mode="json"),
            })
            return action.model_copy(deep=True), event.model_copy(deep=True), deepcopy(self._history)

    def cancel(self, action_id: str) -> ProposedAction:
        with self._lock:
            action = self._actions.get(action_id)
            if action is None:
                raise DomainError(404, "ACTION_NOT_FOUND", "That suggestion could not be found.")
            if action.status == "confirmed":
                raise DomainError(409, "ACTION_ALREADY_CONFIRMED", "A confirmed pickup change cannot be cancelled as a proposal.")
            action.status = "cancelled"
            return action.model_copy(deep=True)

    def action_history(self) -> list[ProposedAction]:
        with self._lock:
            return [ProposedAction.model_validate(item) for item in reversed(self._history)]


def detect_conflicts(snapshot: HouseholdSnapshot, now: datetime | None = None) -> list[Conflict]:
    current = now or demo_now()
    # All-day items (birthdays, holidays, "no school") are informational and never conflict.
    events = sorted((item for item in snapshot.events if not item.allDay), key=lambda item: (parse(item.startAt), item.id))
    conflicts: list[Conflict] = []
    for index, first in enumerate(events):
        for second in events[index + 1:]:
            if parse(second.startAt) >= parse(first.endAt):
                break
            shared = sorted(set(first.memberIds).intersection(second.memberIds))
            if shared:
                names = " and ".join(member_name(snapshot, item) for item in shared)
                conflicts.append(make_conflict("event_overlap", [first, second], shared,
                    "Schedule overlap", f"{names} have events at the same time."))

    for responsibility in [item for item in events if item.responsibleMemberId and item.responsibilityType]:
        member_id = responsibility.responsibleMemberId or ""
        # A driver is also busy when they are responsible for another overlapping event.
        busy = next((item for item in events if item.id != responsibility.id
                     and (member_id in item.memberIds or item.responsibleMemberId == member_id)
                     and overlaps(item, responsibility)), None)
        if busy:
            candidate = next((member.id for member in snapshot.members if member.role == "adult"
                              and member.id != member_id and is_available(snapshot, responsibility, member.id)), None)
            if busy.responsibleMemberId == member_id and member_id not in busy.memberIds:
                title = "Driver needed in two places"
            else:
                title = "Pickup conflict" if responsibility.responsibilityType == "pickup" else "Family conflict"
            conflicts.append(make_conflict("responsibility_overlap", [busy, responsibility], [member_id], title,
                f"{member_name(snapshot, member_id)} is busy during {responsibility.title}.", candidate))
        else:
            previous = sorted([item for item in events if item.id != responsibility.id and member_id in item.memberIds
                               and parse(item.endAt) <= parse(responsibility.startAt)],
                              key=lambda item: parse(item.endAt), reverse=True)
            if previous and parse(previous[0].endAt) + timedelta(minutes=20) > parse(responsibility.startAt):
                conflicts.append(make_conflict("travel_buffer", [previous[0], responsibility], [member_id],
                    "Travel time is tight", f"There may not be enough time between {previous[0].title} and {responsibility.title}."))

    # Venue-to-venue travel: back-to-back events at different places need their travel time.
    for member in snapshot.members:
        mine = [item for item in events if member.id in item.memberIds and not item.allDay]
        for first, second in zip(mine, mine[1:]):
            if not (first.location and second.location and second.travelMinutes):
                continue
            if first.location.strip().casefold() == second.location.strip().casefold():
                continue
            gap = (parse(second.startAt) - parse(first.endAt)).total_seconds() / 60
            if 0 <= gap < second.travelMinutes:
                conflicts.append(make_conflict("travel_buffer", [first, second], [member.id],
                    "Not enough travel time",
                    f"{member.name} needs about {second.travelMinutes} minutes to get from {first.title} to {second.title}."))

    for event in events:
        remaining = [item.label for item in event.preparation if not item.completed]
        until_start = (parse(event.startAt) - current).total_seconds() / 60
        if remaining and 0 <= until_start <= 60:
            conflicts.append(make_conflict("preparation", [event], event.memberIds,
                f"{event.title} preparation", f"Still needed: {', '.join(remaining)}."))
    unique = {item.id: item for item in conflicts}
    return sorted(unique.values(), key=lambda item: (parse(item.startsAt), item.id))


def sports_reminders(snapshot: HouseholdSnapshot, now: datetime | None = None, horizon_minutes: int = 180) -> list[dict[str, object]]:
    """Speakable 'leave soon' reminders for sports events starting within the horizon."""
    current = now or demo_now()
    reminders = []
    for event in sorted(snapshot.events, key=lambda item: parse(item.startAt)):
        if event.category != "sports":
            continue
        until = (parse(event.startAt) - current).total_seconds() / 60
        if not 0 <= until <= horizon_minutes:
            continue
        lead = (event.travelMinutes or 0) + (event.arrivalMinutes or 0)
        leave_in = max(0, round(until - lead))
        missing = [item.label for item in event.preparation if not item.completed]
        driver = member_name(snapshot, event.responsibleMemberId) if event.responsibleMemberId else None
        text = f"Leave for {event.title} in {leave_in} minutes"
        if missing:
            text += f"; {', '.join(missing[:3])} not packed"
        if event.uniform:
            text += f"; wear {event.uniform}"
        reminders.append({"eventId": event.id, "leaveInMinutes": leave_in, "missing": missing,
                          "driver": driver, "text": text + "."})
    return reminders


def is_available(snapshot: HouseholdSnapshot, target_event: CalendarEvent, member_id: str) -> bool:
    member = next((item for item in snapshot.members if item.id == member_id), None)
    if member is None or member.role != "adult" or member_id == target_event.responsibleMemberId:
        return False
    start, end = parse(target_event.startAt), parse(target_event.endAt)
    return not any(
        event.id != target_event.id and not event.allDay
        and (member_id in event.memberIds or event.responsibleMemberId == member_id)
        and start < parse(event.endAt) and parse(event.startAt) < end
        for event in snapshot.events
    )


def make_conflict(kind: str, events: list[CalendarEvent], members: list[str], title: str, message: str,
                  suggested: str | None = None) -> Conflict:
    event_ids = sorted(item.id for item in events)
    member_ids = sorted(members)
    return Conflict(
        id=f"conflict:{kind}:{':'.join(event_ids)}:{':'.join(member_ids)}",
        type=kind, severity="warning", title=title, message=message, eventIds=event_ids,
        memberIds=member_ids, startsAt=min(item.startAt for item in events),
        endsAt=max(item.endAt for item in events), suggestedMemberId=suggested,
    )


def member_name(snapshot: HouseholdSnapshot, member_id: str) -> str:
    return next((item.name for item in snapshot.members if item.id == member_id), "…")


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def overlaps(first: CalendarEvent, second: CalendarEvent) -> bool:
    return parse(first.startAt) < parse(second.endAt) and parse(second.startAt) < parse(first.endAt)


def snapshot_context(snapshot: HouseholdSnapshot, now: datetime | None = None) -> HouseholdContext:
    current = now or demo_now()
    conflicts = detect_conflicts(snapshot, current)
    members = [{"id": item.id, "name": item.name, "role": item.role} for item in snapshot.members]
    events = [{
        "id": item.id, "title": item.title, "startAt": item.startAt, "endAt": item.endAt,
        "memberIds": item.memberIds, "responsibleMemberId": item.responsibleMemberId,
    } for item in snapshot.events]
    chores = [{"id": item.id, "title": item.title, "status": item.status, "assignedToMemberId": item.assignedToMemberId}
              for item in snapshot.chores]
    routines = [{"name": item.name, "period": item.period, "memberId": item.memberId,
                 "completedSteps": sum(step.completed for step in item.steps), "totalSteps": len(item.steps)}
                for item in snapshot.routines]
    compact_conflicts = [{"id": item.id, "type": item.type, "title": item.title, "message": item.message,
                          "suggestedMemberId": item.suggestedMemberId} for item in conflicts]
    return HouseholdContext.model_validate({
        "date": current.date().isoformat(), "timezone": snapshot.family.timezone, "members": members,
        "events": events, "chores": chores, "routines": routines,
        "conflicts": compact_conflicts,
        "weather": {"condition": "Sunny", "temperatureF": 89},
    })
