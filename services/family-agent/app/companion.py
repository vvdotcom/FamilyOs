"""Explicit owner edits. No AI-proposed action or offline write is applied here."""
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import Field, ValidationError

from .domain import DomainError
from .models import CalendarEvent, Chore, FamilyMember, HouseholdSnapshot, ListItem, Meal, StrictModel


class CompanionMutation(StrictModel):
    expectedRevision: int = Field(ge=0)
    kind: Literal["event", "member", "chore", "listItem", "meal", "mealGroceries", "deleteEvent", "deleteMeal"]
    value: dict = Field(max_length=30)


def apply_edit(snapshot: HouseholdSnapshot, edit: CompanionMutation) -> HouseholdSnapshot:
    if edit.expectedRevision != snapshot.revision:
        raise DomainError(409, "STALE_REVISION", "Your household changed on another device. Refresh, review your edit, and save again.")
    updated = snapshot.model_copy(deep=True)
    member_ids = {item.id for item in updated.members}
    value = dict(edit.value)
    item_id = value.get("id")
    if not isinstance(item_id, str) or not 1 <= len(item_id) <= 80:
        raise DomainError(422, "INVALID_EDIT", "This item needs a valid identifier.")
    collections = {"event": "events", "member": "members", "chore": "chores", "listItem": "listItems", "meal": "meals"}
    if edit.kind == "mealGroceries":
        from uuid import uuid4
        meal = next((meal for meal in updated.meals if meal.id == item_id), None)
        if meal is None:
            raise DomainError(404, "NOT_FOUND", "That meal no longer exists.")
        existing = {item.title.strip().casefold() for item in updated.listItems if item.listName == "Groceries" and not item.completed}
        missing = list(dict.fromkeys(line.strip() for line in meal.ingredients if line.strip().casefold() not in existing))
        if len(updated.listItems) + len(missing) > 1000:
            raise DomainError(422, "HOUSEHOLD_LIMIT", "Your household list limit has been reached.")
        if any(len(line) > 160 for line in missing):
            raise DomainError(422, "INVALID_EDIT", "Shorten ingredient names to 160 characters before adding them to groceries.")
        for line in missing:
            updated.listItems.append(ListItem(id=uuid4().hex, listName="Groceries", title=line, addedBy=meal.title[:80]))
    elif edit.kind in ("deleteEvent", "deleteMeal"):
        if set(value) != {"id"}:
            raise DomainError(422, "INVALID_EDIT", "Unexpected deletion fields.")
        name = "events" if edit.kind == "deleteEvent" else "meals"
        items = getattr(updated, name)
        if not any(item.id == item_id for item in items):
            raise DomainError(404, "NOT_FOUND", "That item no longer exists.")
        setattr(updated, name, [item for item in items if item.id != item_id])
    else:
        # Family ownership always comes from the authenticated snapshot, never a body ID.
        if "familyId" in value and value["familyId"] != updated.family.id:
            raise DomainError(403, "WRONG_HOUSEHOLD", "That item belongs to another household.")
        if edit.kind in ("event", "member", "chore"):
            value["familyId"] = updated.family.id
        title = value.get("name" if edit.kind == "member" else "title", "")
        if not isinstance(title, str) or not title.strip() or len(title) > 160:
            raise DomainError(422, "INVALID_EDIT", "Enter a name or title of at most 160 characters.")
        value["name" if edit.kind == "member" else "title"] = title.strip()
        try:
            model = {"event": CalendarEvent, "member": FamilyMember, "chore": Chore, "listItem": ListItem, "meal": Meal}[edit.kind]
            item = model.model_validate(value)
            refs = []
            if edit.kind == "event":
                refs = [item.ownerMemberId, *item.memberIds]
                if item.responsibleMemberId:
                    refs.append(item.responsibleMemberId)
                start, end = [datetime.fromisoformat(v.replace("Z", "+00:00")) for v in (item.startAt, item.endAt)]
                if start.tzinfo is None or end.tzinfo is None or end <= start:
                    raise ValueError("Invalid dates")
                if len(item.memberIds) > 30 or len(item.location or "") > 240:
                    raise ValueError("Invalid event")
                item.source = "manual"
            elif edit.kind == "member":
                import re
                if not re.fullmatch(r"#[0-9A-Fa-f]{6}", item.accentColor) or len(item.initials) > 4:
                    raise ValueError("Invalid member")
            elif edit.kind == "chore":
                refs = [item.assignedToMemberId] if item.assignedToMemberId else []
                if item.dueAt:
                    due = datetime.fromisoformat(item.dueAt.replace("Z", "+00:00"))
                    if due.tzinfo is None:
                        raise ValueError("Invalid due date")
                item.completedAt = datetime.now(timezone.utc).isoformat() if item.status == "completed" else None
            elif edit.kind == "meal":
                date.fromisoformat(item.date)
                refs = item.cookIds
                if any(not part.strip() or len(part) > 1000 for part in [*item.ingredients, *item.instructions]):
                    raise ValueError("Invalid recipe")
            elif edit.kind == "listItem":
                if not item.listName.strip():
                    raise ValueError("Invalid list")
            if any(ref not in member_ids for ref in refs):
                raise DomainError(422, "UNKNOWN_MEMBER", "Choose members from your own household.")
        except (ValidationError, ValueError, TypeError) as error:
            raise DomainError(422, "INVALID_EDIT", "Check the dates, members, and required fields before saving.") from error
        name = collections[edit.kind]
        items = getattr(updated, name)
        existing = next((index for index, old in enumerate(items) if old.id == item_id), None)
        if existing is None:
            limit = 30 if edit.kind == "member" else 1000
            if len(items) >= limit:
                raise DomainError(422, "HOUSEHOLD_LIMIT", "This household has reached the limit for these items.")
            items.append(item)
        else:
            items[existing] = item
        if edit.kind == "member":
            updated.family.memberIds = [member.id for member in updated.members]
    updated.revision += 1
    return updated
