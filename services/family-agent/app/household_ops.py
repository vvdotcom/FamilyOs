"""Household operations added in Phases 7-14. Each mutates a deep-copied snapshot in place.

Every function here runs after ``permissions.authorize`` and inside the caller's revision check, so a
failure leaves the stored household unchanged.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import ValidationError

from .demo import demo_now
from .domain import DomainError, is_available, parse
from .models import (
    CalendarEvent, CalendarSubscriptionMeta, ChoreVerification, HouseholdLocation, FamilyNightPoll, FamilyNightSettings, FamilyNightSuggestion,
    HouseholdSnapshot, PhotoMeta, Proposal, StarTransaction, Team,
)
from .move import MOVE_ROUTINES

PROPOSAL_HOURS = 24
FAMILY_NIGHT_SERIES = "family-night"
FAMILY_NIGHT_RULE = (
    "Majority wins. On a tie, this week's picker chooses among the tied options. "
    "The picker rotates to the next person each week a vote is decided."
)

OPERATION_KINDS = frozenset({
    "deleteListItem", "deleteChore", "deleteRecipe", "listItemToggle", "prepToggle", "redemptionFulfill",
    "starAdjustment", "team", "deleteTeam", "familyNightSettings", "familyNightSuggest", "familyNightVote",
    "familyNightClose", "familyNightPick", "proposalCreate", "proposalDecide", "choreVerificationCreate",
    "choreVerificationDecide", "moveComplete", "photoCreate", "photoMeta", "photoDelete", "householdLocation",
    "calendarAdd", "calendarMeta", "calendarRemove",
})

MAX_CALENDARS = 10
SYNCED_READ_ONLY = ("This event comes from a connected calendar. Change it there and Hometide "
                    "shows the update within 15 minutes.")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def household_zone(snapshot: HouseholdSnapshot) -> ZoneInfo:
    try:
        return ZoneInfo(snapshot.family.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def local_iso(snapshot: HouseholdSnapshot, day: str, hhmm: str) -> str:
    """Interpret a date and wall-clock time in the household timezone."""
    try:
        value = datetime.fromisoformat(f"{day}T{hhmm}")
    except ValueError as error:
        raise DomainError(422, "INVALID_EDIT", "Check the date and time.") from error
    return value.replace(tzinfo=household_zone(snapshot)).isoformat(timespec="seconds")


def household_today(snapshot: HouseholdSnapshot) -> date:
    return demo_now().astimezone(household_zone(snapshot)).date()


def balance(snapshot: HouseholdSnapshot, member_id: str) -> int:
    return sum(item.delta for item in snapshot.starTransactions if item.memberId == member_id)


def _require_id(value: dict) -> str:
    item_id = value.get("id")
    if not isinstance(item_id, str) or not 1 <= len(item_id) <= 80:
        raise DomainError(422, "INVALID_EDIT", "This item needs a valid identifier.")
    return item_id


def _exact_fields(value: dict, allowed: set[str]) -> None:
    if set(value) - allowed:
        raise DomainError(422, "INVALID_EDIT", "Unexpected fields in this change.")


def _member(snapshot: HouseholdSnapshot, member_id: object):
    member = next((item for item in snapshot.members if item.id == member_id), None)
    if member is None:
        raise DomainError(422, "UNKNOWN_MEMBER", "Choose members from your own household.")
    return member


def apply_household_op(snapshot: HouseholdSnapshot, kind: str, value: dict, actor_label: str) -> None:
    handler = globals()[f"_op_{kind}"]
    handler(snapshot, dict(value), actor_label)


# Lists, chores, recipes -----------------------------------------------------------------------

def _delete(snapshot: HouseholdSnapshot, collection: str, value: dict, message: str) -> None:
    _exact_fields(value, {"id"})
    item_id = _require_id(value)
    items = getattr(snapshot, collection)
    if not any(item.id == item_id for item in items):
        raise DomainError(404, "NOT_FOUND", message)
    setattr(snapshot, collection, [item for item in items if item.id != item_id])


def _op_deleteListItem(snapshot, value, _actor):
    _delete(snapshot, "listItems", value, "That list item no longer exists.")


def _op_deleteChore(snapshot, value, _actor):
    _delete(snapshot, "chores", value, "That chore no longer exists.")


def _op_deleteRecipe(snapshot, value, _actor):
    _delete(snapshot, "recipes", value, "That recipe no longer exists.")
    for meal in snapshot.meals:
        if meal.recipeId == value["id"]:
            meal.recipeId = None


def _op_listItemToggle(snapshot, value, _actor):
    _exact_fields(value, {"id"})
    item = next((item for item in snapshot.listItems if item.id == _require_id(value)), None)
    if item is None:
        raise DomainError(404, "NOT_FOUND", "That list item no longer exists.")
    item.completed = not item.completed


def _op_prepToggle(snapshot, value, _actor):
    _exact_fields(value, {"id", "itemId"})
    event = next((item for item in snapshot.events if item.id == _require_id(value)), None)
    prep = next((item for item in (event.preparation if event else []) if item.id == value.get("itemId")), None)
    if prep is None:
        raise DomainError(404, "NOT_FOUND", "That checklist item no longer exists.")
    prep.completed = not prep.completed


# Rewards ----------------------------------------------------------------------------------------

def _op_redemptionFulfill(snapshot, value, _actor):
    _exact_fields(value, {"id"})
    request = next((item for item in snapshot.redemptions if item.id == _require_id(value)), None)
    if request is None:
        raise DomainError(404, "REDEMPTION_NOT_FOUND", "That reward request could not be found.")
    if request.status != "approved":
        raise DomainError(409, "REDEMPTION_NOT_APPROVED", "Only approved rewards can be marked as given.")
    request.status = "fulfilled"


def _op_starAdjustment(snapshot, value, actor):
    _exact_fields(value, {"id", "memberId", "delta"})
    item_id = _require_id(value)
    member = _member(snapshot, value.get("memberId"))
    delta = value.get("delta")
    if not isinstance(delta, int) or isinstance(delta, bool) or delta == 0 or abs(delta) > 1000:
        raise DomainError(422, "INVALID_ADJUSTMENT", "Enter a star correction between -1000 and 1000.")
    if any(item.id == f"adjust:{item_id}" for item in snapshot.starTransactions):
        raise DomainError(409, "ADJUSTMENT_ALREADY_APPLIED", "That correction was already applied.")
    if balance(snapshot, member.id) + delta < 0:
        raise DomainError(409, "NOT_ENOUGH_STARS", "A correction cannot make the balance negative.")
    snapshot.starTransactions.append(StarTransaction(
        id=f"adjust:{item_id}", memberId=member.id, delta=delta, reason="adjustment",
        sourceId=f"parent:{actor}"[:160], createdAt=now_iso(),
    ))


# Sports teams and carpools ---------------------------------------------------------------------

def _op_team(snapshot, value, _actor):
    try:
        team = Team.model_validate(value)
    except ValidationError as error:
        raise DomainError(422, "INVALID_TEAM", "Check the team name, players, gear, and drivers.") from error
    for member_id in team.memberIds:
        _member(snapshot, member_id)
    for driver_id in team.driverIds:
        if _member(snapshot, driver_id).role != "adult":
            raise DomainError(422, "INVALID_DRIVER", "Carpool drivers must be adults in your household.")
    team.gear = [item.strip()[:60] for item in team.gear if item.strip()]
    index = next((i for i, old in enumerate(snapshot.teams) if old.id == team.id), None)
    if index is None:
        if len(snapshot.teams) >= 30:
            raise DomainError(422, "HOUSEHOLD_LIMIT", "Your household team limit has been reached.")
        snapshot.teams.append(team)
    else:
        snapshot.teams[index] = team


def _op_deleteTeam(snapshot, value, _actor):
    _delete(snapshot, "teams", value, "That team no longer exists.")


def next_driver(team: Team) -> str | None:
    if not team.driverIds:
        return None
    driver = team.driverIds[team.rotationIndex % len(team.driverIds)]
    team.rotationIndex += 1
    return driver


# Family night ----------------------------------------------------------------------------------

def _poll(snapshot: HouseholdSnapshot, day: object, create: bool = False) -> FamilyNightPoll:
    if not isinstance(day, str):
        raise DomainError(422, "INVALID_EDIT", "Choose a family night date.")
    poll = next((item for item in snapshot.familyNightPolls if item.id == day), None)
    if poll is None and create:
        try:
            date.fromisoformat(day)
            poll = FamilyNightPoll(id=day, activityType=snapshot.familyNight.activityType if snapshot.familyNight else "movie")
        except (ValueError, ValidationError) as error:
            raise DomainError(422, "INVALID_EDIT", "Choose a valid family night date.") from error
        snapshot.familyNightPolls.append(poll)
        snapshot.familyNightPolls = snapshot.familyNightPolls[-120:]
    if poll is None:
        raise DomainError(404, "POLL_NOT_FOUND", "No family night vote exists for that date.")
    return poll


def _op_familyNightSettings(snapshot, value, _actor):
    value.pop("id", None)
    value.setdefault("pickerOrder", [member.id for member in snapshot.members])
    try:
        settings = FamilyNightSettings.model_validate({**value, "pickerIndex": snapshot.familyNight.pickerIndex if snapshot.familyNight else 0})
    except ValidationError as error:
        raise DomainError(422, "INVALID_FAMILY_NIGHT", "Choose a weekday, time, and activity type.") from error
    for member_id in settings.pickerOrder:
        _member(snapshot, member_id)
    snapshot.familyNight = settings
    today = household_today(snapshot)
    # Replace only future Family Night slots; past nights stay as history.
    snapshot.events = [event for event in snapshot.events
                       if not (event.seriesId == FAMILY_NIGHT_SERIES and event.startAt[:10] >= today.isoformat())]
    first = today + timedelta(days=(settings.weekday - today.weekday()) % 7)
    hour, minute = (int(part) for part in settings.time.split(":"))
    for week in range(8):
        day = first + timedelta(days=7 * week)
        start = datetime(day.year, day.month, day.day, hour, minute, tzinfo=household_zone(snapshot))
        snapshot.events.append(CalendarEvent(
            id=f"family-night-{day.isoformat()}", familyId=snapshot.family.id, title="Family night",
            category="family", startAt=start.isoformat(), endAt=(start + timedelta(hours=2)).isoformat(),
            ownerMemberId=snapshot.members[0].id if snapshot.members else "family",
            memberIds=[member.id for member in snapshot.members], source="manual",
            seriesId=FAMILY_NIGHT_SERIES, recurrence="weekly",
        ))


def _op_familyNightSuggest(snapshot, value, _actor):
    _exact_fields(value, {"id", "date", "title", "byMemberId"})
    poll = _poll(snapshot, value.get("date"), create=True)
    if poll.status != "open":
        raise DomainError(409, "POLL_CLOSED", "Voting for that family night has closed.")
    _member(snapshot, value.get("byMemberId"))
    title = str(value.get("title", "")).strip()
    if not title or len(title) > 80:
        raise DomainError(422, "INVALID_EDIT", "Suggest a title of up to 80 characters.")
    if any(item.title.casefold() == title.casefold() for item in poll.suggestions):
        raise DomainError(409, "DUPLICATE_SUGGESTION", "That idea is already on the list.")
    if len(poll.suggestions) >= 20:
        raise DomainError(422, "HOUSEHOLD_LIMIT", "That vote already has 20 ideas.")
    poll.suggestions.append(FamilyNightSuggestion(id=_require_id(value), title=title, byMemberId=value["byMemberId"]))


def _op_familyNightVote(snapshot, value, _actor):
    _exact_fields(value, {"id", "memberId", "suggestionId"})
    poll = _poll(snapshot, value.get("id"))
    if poll.status != "open":
        raise DomainError(409, "POLL_CLOSED", "Voting for that family night has closed.")
    member = _member(snapshot, value.get("memberId"))
    if not any(item.id == value.get("suggestionId") for item in poll.suggestions):
        raise DomainError(404, "SUGGESTION_NOT_FOUND", "That idea is no longer on the list.")
    poll.votes[member.id] = str(value["suggestionId"])


def tally(poll: FamilyNightPoll) -> dict[str, int]:
    counts = {item.id: 0 for item in poll.suggestions}
    for suggestion_id in poll.votes.values():
        if suggestion_id in counts:
            counts[suggestion_id] += 1
    return counts


def current_picker(snapshot: HouseholdSnapshot) -> str | None:
    settings = snapshot.familyNight
    order = settings.pickerOrder if settings and settings.pickerOrder else [member.id for member in snapshot.members]
    if not order:
        return None
    return order[(settings.pickerIndex if settings else 0) % len(order)]


def _finish_poll(snapshot: HouseholdSnapshot, poll: FamilyNightPoll, winner_id: str, decided_by: str) -> None:
    poll.status = "decided"
    poll.winnerSuggestionId = winner_id
    poll.decidedBy = decided_by  # type: ignore[assignment]
    poll.pickerMemberId = current_picker(snapshot)
    poll.decidedAt = now_iso()
    if snapshot.familyNight:
        snapshot.familyNight.pickerIndex += 1
    winner = next(item for item in poll.suggestions if item.id == winner_id)
    for event in snapshot.events:
        if event.seriesId == FAMILY_NIGHT_SERIES and event.startAt[:10] == poll.id:
            event.title = f"Family night: {winner.title}"[:120]


def _op_familyNightClose(snapshot, value, _actor):
    _exact_fields(value, {"id"})
    poll = _poll(snapshot, value.get("id"))
    if poll.status != "open":
        raise DomainError(409, "POLL_CLOSED", "That vote has already closed.")
    if not poll.suggestions:
        raise DomainError(409, "NO_SUGGESTIONS", "Add at least one idea before closing the vote.")
    counts = tally(poll)
    top = max(counts.values())
    leaders = [item.id for item in poll.suggestions if counts[item.id] == top]
    if len(leaders) == 1:
        _finish_poll(snapshot, poll, leaders[0], "majority")
    else:
        poll.status = "tie"
        poll.tiedSuggestionIds = leaders
        poll.pickerMemberId = current_picker(snapshot)


def _op_familyNightPick(snapshot, value, _actor):
    _exact_fields(value, {"id", "suggestionId"})
    poll = _poll(snapshot, value.get("id"))
    if poll.status != "tie":
        raise DomainError(409, "NO_TIE", "The picker chooses only when the vote is tied.")
    if value.get("suggestionId") not in poll.tiedSuggestionIds:
        raise DomainError(422, "INVALID_PICK", "Choose one of the tied ideas.")
    _finish_poll(snapshot, poll, str(value["suggestionId"]), "picker")


# Proposals (voice and other indirect sources) ----------------------------------------------------

def _validate_proposal_payload(snapshot: HouseholdSnapshot, kind: str, payload: dict) -> None:
    if kind == "pickup_swap":
        event = next((item for item in snapshot.events if item.id == payload.get("eventId")), None)
        if event is None or not event.responsibleMemberId:
            raise DomainError(422, "INVALID_PROPOSAL", "That event has no pickup or driver to change.")
        target = _member(snapshot, payload.get("toMemberId"))
        if target.role != "adult":
            raise DomainError(422, "INVALID_PROPOSAL", "Choose an adult for pickups and driving.")
        # Say so now, instead of creating a request that can only fail when someone confirms it.
        if event.responsibleMemberId == target.id:
            raise DomainError(409, "ALREADY_RESPONSIBLE",
                              f"{target.name} already has {event.title} then, so there's nothing to change.")
        if not is_available(snapshot, event, target.id):
            raise DomainError(409, "MEMBER_BUSY", f"{target.name} is busy during {event.title}, so they can't take it.")
    elif kind == "event":
        start, end = parse(str(payload.get("startAt"))), parse(str(payload.get("endAt")))
        if start.tzinfo is None or end <= start:
            raise DomainError(422, "INVALID_PROPOSAL", "The event needs a start and a later end.")
        title = str(payload.get("title", "")).strip()
        if not title or len(title) > 120:
            raise DomainError(422, "INVALID_PROPOSAL", "The event needs a short title.")
        for member_id in payload.get("memberIds") or []:
            _member(snapshot, member_id)
    elif kind == "reschedule":
        event = next((item for item in snapshot.events if item.id == payload.get("eventId")), None)
        if event is None:
            raise DomainError(404, "NOT_FOUND", "That event could not be found.")
        if event.calendarId:
            raise DomainError(409, "SYNCED_EVENT_READ_ONLY", SYNCED_READ_ONLY)
        start, end = parse(str(payload.get("startAt"))), parse(str(payload.get("endAt")))
        if start.tzinfo is None or end <= start:
            raise DomainError(422, "INVALID_PROPOSAL", "The new time needs a start and a later end.")
    elif kind == "chore_done":
        chore = next((item for item in snapshot.chores if item.id == payload.get("choreId")), None)
        if chore is None:
            raise DomainError(404, "CHORE_NOT_FOUND", "That chore could not be found.")
        if chore.status == "completed":
            raise DomainError(409, "CHORE_ALREADY_COMPLETED", "That chore is already done.")
    elif kind == "routine":
        from .rhythm import validate_routine_payload

        validate_routine_payload(snapshot, payload)


def _op_proposalCreate(snapshot, value, _actor):
    try:
        proposal = Proposal.model_validate({
            "createdAt": now_iso(),
            "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=PROPOSAL_HOURS)).isoformat(timespec="seconds"),
            **value,
        })
    except ValidationError as error:
        raise DomainError(422, "INVALID_PROPOSAL", "That request could not be prepared.") from error
    try:
        _validate_proposal_payload(snapshot, proposal.kind, proposal.payload)
    except (ValueError, TypeError) as error:
        raise DomainError(422, "INVALID_PROPOSAL", "That request is missing a date, time, or item.") from error
    duplicate = next((item for item in snapshot.proposals if item.status == "pending" and item.kind == proposal.kind
                      and item.payload == proposal.payload), None)
    if duplicate:
        raise DomainError(409, "PROPOSAL_EXISTS", duplicate.id)
    pending = [item for item in snapshot.proposals if item.status == "pending"]
    if len(pending) >= 20:
        raise DomainError(429, "TOO_MANY_PROPOSALS", "Review the waiting requests on the TV or phone first.")
    snapshot.proposals.append(proposal)
    snapshot.proposals = snapshot.proposals[-300:]


def _close_stale(proposal, reason: str) -> None:
    proposal.status = "expired"
    proposal.resultMessage = f"Nothing was changed: {reason} Ask again if you still need it."[:240]


def _op_proposalDecide(snapshot, value, actor):
    _exact_fields(value, {"id", "action"})
    proposal = next((item for item in snapshot.proposals if item.id == _require_id(value)), None)
    if proposal is None:
        raise DomainError(404, "PROPOSAL_NOT_FOUND", "That request could not be found.")
    if proposal.status != "pending":
        raise DomainError(409, "PROPOSAL_ALREADY_DECIDED", "That request was already handled.")
    action = value.get("action")
    if action not in ("confirm", "reject"):
        raise DomainError(422, "INVALID_EDIT", "Choose confirm or reject.")
    proposal.decidedAt = now_iso()
    proposal.decidedBy = actor[:80]
    if parse(proposal.expiresAt) <= datetime.now(timezone.utc):
        proposal.status = "expired"
        proposal.resultMessage = "This request expired. Ask again to make a new one."
        return
    if action == "reject":
        proposal.status = "rejected"
        proposal.resultMessage = "Nothing was changed."
        return
    payload = proposal.payload
    # A request the schedule has overtaken closes with a message, rather than failing and staying on every
    # screen (the TV would keep showing it, and asking again would only find the same stuck request).
    try:
        _validate_proposal_payload(snapshot, proposal.kind, payload)
    except DomainError as error:
        _close_stale(proposal, error.message)
        return
    if proposal.kind == "pickup_swap":
        event = next(item for item in snapshot.events if item.id == payload["eventId"])
        if event.responsibleMemberId != payload.get("fromMemberId"):
            _close_stale(proposal, f"{event.title} already changed hands.")
            return
        event.responsibleMemberId = str(payload["toMemberId"])
    elif proposal.kind == "event":
        member_ids = [str(item) for item in payload.get("memberIds") or []] or [snapshot.members[0].id]
        snapshot.events.append(CalendarEvent(
            id=f"voice-{proposal.id}", familyId=snapshot.family.id, title=str(payload["title"]).strip()[:120],
            category=payload.get("category") if payload.get("category") in ("school", "appointment", "sports", "meal", "family") else "family",
            startAt=str(payload["startAt"]), endAt=str(payload["endAt"]), ownerMemberId=member_ids[0],
            memberIds=member_ids, location=(str(payload.get("location") or "")[:240] or None), source="voice",
        ))
    elif proposal.kind == "reschedule":
        event = next(item for item in snapshot.events if item.id == payload["eventId"])
        if event.startAt != payload.get("fromStartAt"):
            raise DomainError(409, "STALE_PROPOSAL", "That event already moved. Ask again for a fresh suggestion.")
        event.startAt, event.endAt = str(payload["startAt"]), str(payload["endAt"])
    elif proposal.kind == "chore_done":
        from .companion import complete_chore
        complete_chore(snapshot, str(payload["choreId"]))
    elif proposal.kind == "routine":
        from .rhythm import apply_routine
        changed = apply_routine(snapshot, payload)
        proposal.status = "confirmed"
        proposal.resultMessage = (f"Done. Hometide will remember this routine. {changed} "
                                  f"{'event' if changed == 1 else 'events'} updated.")
        return
    proposal.status = "confirmed"
    proposal.resultMessage = "Done. Every screen will show the change."


# Chore photo verification -------------------------------------------------------------------------

def _op_choreVerificationCreate(snapshot, value, _actor):
    try:
        record = ChoreVerification.model_validate(value)
    except ValidationError as error:
        raise DomainError(422, "INVALID_VERIFICATION", "The photo check could not be saved.") from error
    chore = next((item for item in snapshot.chores if item.id == record.choreId), None)
    if chore is None or not chore.verifyWithPhoto:
        raise DomainError(422, "PHOTO_NOT_REQUIRED", "That chore does not use photo checks.")
    if chore.assignedToMemberId != record.memberId:
        raise DomainError(403, "CHORE_NOT_ASSIGNED", "Children can submit photos only for their own chores.")
    if chore.status == "completed":
        raise DomainError(409, "CHORE_ALREADY_COMPLETED", "That chore has already been approved.")
    for old in snapshot.choreVerifications:
        if old.choreId == record.choreId and old.occurrence == record.occurrence and old.status == "pending":
            old.status = "retake"
            old.decidedAt = now_iso()
            old.decidedBy = "replaced"
    snapshot.choreVerifications.append(record)
    snapshot.choreVerifications = snapshot.choreVerifications[-600:]


def _op_choreVerificationDecide(snapshot, value, actor):
    _exact_fields(value, {"id", "action"})
    record = next((item for item in snapshot.choreVerifications if item.id == _require_id(value)), None)
    if record is None:
        raise DomainError(404, "VERIFICATION_NOT_FOUND", "That chore photo could not be found.")
    if record.status != "pending":
        raise DomainError(409, "VERIFICATION_ALREADY_REVIEWED", "That chore photo was already reviewed.")
    action = value.get("action")
    if action not in ("approve", "reject", "retake"):
        raise DomainError(422, "INVALID_EDIT", "Choose approve, reject, or ask for a retake.")
    record.status = {"approve": "approved", "reject": "rejected", "retake": "retake"}[action]
    record.decidedAt = now_iso()
    record.decidedBy = actor[:80]
    record.photoId = None  # Retention: the photo is deleted once a parent decides.
    if action == "approve":
        from .companion import complete_chore
        complete_chore(snapshot, record.choreId)


# Movement breaks --------------------------------------------------------------------------------

def _op_moveComplete(snapshot, value, _actor):
    _exact_fields(value, {"id", "routineId", "memberIds", "eventId", "date"})
    session_key = _require_id(value)
    routine = MOVE_ROUTINES.get(str(value.get("routineId")))
    if routine is None:
        raise DomainError(404, "ROUTINE_NOT_FOUND", "That movement break is not available.")
    member_ids = value.get("memberIds")
    if not isinstance(member_ids, list) or not member_ids:
        raise DomainError(422, "INVALID_EDIT", "Choose who joined the movement break.")
    awarded = 0
    for member_id in dict.fromkeys(member_ids):
        member = _member(snapshot, member_id)
        if member.role != "child":
            continue
        transaction_id = f"move:{session_key}:{member.id}"
        if any(item.id == transaction_id for item in snapshot.starTransactions):
            continue
        snapshot.starTransactions.append(StarTransaction(
            id=transaction_id[:160], memberId=member.id, delta=routine["stars"], reason="move_completed",
            sourceId=f"move:{session_key}"[:160], createdAt=now_iso(),
        ))
        awarded += 1
    if not awarded and not any(item.id.startswith(f"move:{session_key}:") for item in snapshot.starTransactions):
        raise DomainError(422, "NO_CHILDREN", "Stars for movement breaks go to child profiles.")


# Photos -------------------------------------------------------------------------------------------

def _op_photoCreate(snapshot, value, _actor):
    try:
        photo = PhotoMeta.model_validate(value)
    except ValidationError as error:
        raise DomainError(422, "INVALID_PHOTO", "The photo details could not be saved.") from error
    if len(snapshot.photos) >= 200:
        raise DomainError(422, "PHOTO_LIMIT", "Your household has 200 photos. Remove some before adding more.")
    photo.order = max((item.order for item in snapshot.photos), default=-1) + 1
    snapshot.photos.append(photo)


def _op_photoMeta(snapshot, value, _actor):
    _exact_fields(value, {"id", "caption", "selected", "rotation", "order"})
    photo = next((item for item in snapshot.photos if item.id == _require_id(value)), None)
    if photo is None:
        raise DomainError(404, "PHOTO_NOT_FOUND", "That photo was removed.")
    try:
        updated = PhotoMeta.model_validate({**photo.model_dump(), **value})
    except ValidationError as error:
        raise DomainError(422, "INVALID_PHOTO", "Check the caption and rotation.") from error
    index = snapshot.photos.index(photo)
    snapshot.photos[index] = updated
    snapshot.photos.sort(key=lambda item: (item.order, item.createdAt))


def _op_photoDelete(snapshot, value, _actor):
    _delete(snapshot, "photos", value, "That photo was already removed.")


# Household location (weather) ------------------------------------------------------------------------

def _op_householdLocation(snapshot, value, _actor):
    """Set or clear the household's weather location, and optionally its time zone."""
    _exact_fields(value, {"id", "latitude", "longitude", "label", "source", "timezone", "clear"})
    if value.get("clear"):
        snapshot.location = None
        return
    try:
        latitude, longitude = float(value["latitude"]), float(value["longitude"])
        location = HouseholdLocation(
            # Two decimals is about 1 km: enough for a forecast, not enough to find a home.
            latitude=round(latitude, 2), longitude=round(longitude, 2),
            label=str(value.get("label") or "").strip()[:80] or "Home",
            source=value.get("source") if value.get("source") in ("device", "search") else "device",
            updatedAt=now_iso(),
        )
    except (KeyError, TypeError, ValueError, ValidationError) as error:
        raise DomainError(422, "INVALID_LOCATION", "Choose a valid place for the weather.") from error
    zone = value.get("timezone")
    if zone is not None:
        try:
            ZoneInfo(str(zone))
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise DomainError(422, "INVALID_TIMEZONE", "That time zone is not recognised.") from error
        snapshot.family.timezone = str(zone)[:80]
    snapshot.location = location


# Connected calendars (read-only subscriptions) ---------------------------------------------------

def calendar_members(snapshot: HouseholdSnapshot, requested: list[str]) -> list[str]:
    """Whose calendar this is: the chosen members, or the first adult when none were chosen."""
    known = {member.id for member in snapshot.members}
    chosen = [member_id for member_id in dict.fromkeys(requested) if member_id in known]
    if chosen:
        return chosen
    adult = next((member.id for member in snapshot.members if member.role == "adult"), None)
    return [adult or snapshot.members[0].id] if snapshot.members else []


def ensure_editable_event(snapshot: HouseholdSnapshot, event_id: object) -> None:
    event = next((item for item in snapshot.events if item.id == event_id), None)
    if event is not None and event.calendarId:
        raise DomainError(409, "SYNCED_EVENT_READ_ONLY", SYNCED_READ_ONLY)


def _calendar_member_ids(snapshot: HouseholdSnapshot, value: object) -> list[str]:
    if not isinstance(value, list) or len(value) > 30:
        raise DomainError(422, "INVALID_EDIT", "Choose who this calendar belongs to.")
    for member_id in value:
        _member(snapshot, member_id)
    return list(dict.fromkeys(str(item) for item in value))


def _op_calendarAdd(snapshot, value, _actor):
    """Record a newly connected calendar. Its private link is stored separately by the endpoint."""
    _exact_fields(value, {"id", "label", "provider", "host", "memberIds"})
    calendar_id = _require_id(value)
    if len(snapshot.calendars) >= MAX_CALENDARS:
        raise DomainError(422, "CALENDAR_LIMIT", f"You can connect up to {MAX_CALENDARS} calendars.")
    if any(item.id == calendar_id for item in snapshot.calendars):
        raise DomainError(409, "CALENDAR_ALREADY_CONNECTED", "That calendar is already connected.")
    members = _calendar_member_ids(snapshot, value.get("memberIds", []))
    try:
        meta = CalendarSubscriptionMeta(
            id=calendar_id, label=str(value.get("label") or "").strip()[:60] or "Calendar",
            provider=value.get("provider") or "ics", host=str(value.get("host") or "")[:120], memberIds=members,
        )
    except ValidationError as error:
        raise DomainError(422, "INVALID_CALENDAR", "Check the calendar's name.") from error
    snapshot.calendars.append(meta)


def _op_calendarMeta(snapshot, value, _actor):
    """Rename a connected calendar or change whose it is. Its events move to those members at once."""
    _exact_fields(value, {"id", "label", "memberIds"})
    meta = next((item for item in snapshot.calendars if item.id == _require_id(value)), None)
    if meta is None:
        raise DomainError(404, "CALENDAR_NOT_FOUND", "That calendar was disconnected.")
    if "label" in value:
        label = str(value.get("label") or "").strip()[:60]
        if not label:
            raise DomainError(422, "INVALID_CALENDAR", "Give the calendar a name.")
        meta.label = label
    if "memberIds" in value:
        meta.memberIds = _calendar_member_ids(snapshot, value.get("memberIds"))
        members = calendar_members(snapshot, meta.memberIds)
        for event in snapshot.events:
            if event.calendarId == meta.id:
                event.memberIds, event.ownerMemberId = list(members), members[0]


def _op_calendarRemove(snapshot, value, _actor):
    """Disconnect a calendar and remove the events that came from it. Nothing is deleted at the source."""
    _exact_fields(value, {"id"})
    calendar_id = _require_id(value)
    if not any(item.id == calendar_id for item in snapshot.calendars):
        raise DomainError(404, "CALENDAR_NOT_FOUND", "That calendar was already disconnected.")
    snapshot.calendars = [item for item in snapshot.calendars if item.id != calendar_id]
    snapshot.events = [item for item in snapshot.events if item.calendarId != calendar_id]
