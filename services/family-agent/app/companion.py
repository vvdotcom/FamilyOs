"""Explicit owner edits. No AI-proposed action or offline write is applied here."""
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from pydantic import Field, ValidationError

from .domain import DomainError
from .household_ops import OPERATION_KINDS, apply_household_op, ensure_editable_event, local_iso, next_driver
from .models import (
    AuditEntry, CalendarEvent, Chore, FamilyMember, HouseholdList, HouseholdSnapshot, ImportDraft,
    ListItem, Meal, PreparationItem, Recipe, RedemptionRequest, Reward, StarTransaction, StrictModel,
)


class CompanionMutation(StrictModel):
    expectedRevision: int = Field(ge=0)
    kind: Literal[
        "event", "member", "chore", "listItem", "meal", "mealGroceries", "recipeGenerated", "deleteEvent", "deleteMeal",
        "list", "recipe", "mealSeries", "importDraft", "importConfirm", "importCancel",
        "reward", "redemptionRequest", "redemptionDecision", "completeChore",
        "deleteListItem", "deleteChore", "deleteRecipe", "listItemToggle", "prepToggle", "redemptionFulfill",
        "starAdjustment", "team", "deleteTeam", "familyNightSettings", "familyNightSuggest", "familyNightVote",
        "familyNightClose", "familyNightPick", "proposalCreate", "proposalDecide", "choreVerificationCreate",
        "choreVerificationDecide", "moveComplete", "photoCreate", "photoMeta", "photoDelete", "householdLocation",
        "calendarAdd", "calendarMeta", "calendarRemove",
    ]
    value: dict = Field(max_length=30)


AUDIT_LIMIT = 500


def apply_edit(snapshot: HouseholdSnapshot, edit: CompanionMutation, actor: str = "parent") -> HouseholdSnapshot:
    """Apply one confirmed household change and record who made it (never what secret was used)."""
    updated = _apply_edit(snapshot, edit, actor)
    item_id = edit.value.get("id")
    updated.auditLog.append(AuditEntry(
        id=uuid4().hex, at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        actor=actor[:80], action=edit.kind, itemId=str(item_id)[:160] if isinstance(item_id, str) else "",
    ))
    updated.auditLog = updated.auditLog[-AUDIT_LIMIT:]
    return updated


def _add_meal_groceries(updated: HouseholdSnapshot, meal: Meal) -> int:
    """Add a meal's missing ingredients to Groceries, merging amounts already on the list. Returns how many were new."""
    recipe = next((recipe for recipe in updated.recipes if recipe.id == meal.recipeId), None)
    ingredients = (
        [(part.name, part.quantity, part.unit) for part in recipe.ingredients]
        if recipe else [(line.strip(), None, None) for line in meal.ingredients if line.strip()]
    )
    grocery = next((item for item in updated.lists if item.name.casefold() == "groceries"), None)
    list_id = grocery.id if grocery else "groceries"
    missing: list[tuple[str, float | None, str | None]] = []
    for name, quantity, unit in ingredients:
        key = (name.strip().casefold(), (unit or "").strip().casefold())
        existing = next((item for item in updated.listItems if item.listName.casefold() == "groceries"
                         and not item.completed and ((item.ingredientName or item.title).strip().casefold(),
                         (item.unit or "").strip().casefold()) == key), None)
        if existing:
            if quantity is not None:
                existing.quantity = round((existing.quantity or 0) + quantity, 3)
            continue
        pending = next((item for item in missing if (item[0].strip().casefold(), (item[2] or "").strip().casefold()) == key), None)
        if pending:
            at = missing.index(pending)
            missing[at] = (pending[0], (pending[1] or 0) + (quantity or 0) if pending[1] is not None or quantity is not None else None, pending[2])
        else:
            missing.append((name.strip(), quantity, unit))
    if len(updated.listItems) + len(missing) > 1000:
        raise DomainError(422, "HOUSEHOLD_LIMIT", "Your household list limit has been reached.")
    if any(len(name) > 160 for name, _, _ in missing):
        raise DomainError(422, "INVALID_EDIT", "Shorten ingredient names to 160 characters before adding them to groceries.")
    if not grocery:
        updated.lists.append(HouseholdList(id=list_id, name="Groceries", kind="grocery"))
    for name, quantity, unit in missing:
        updated.listItems.append(ListItem(id=uuid4().hex, listName="Groceries", title=name, ingredientName=name,
                                          quantity=quantity, unit=unit, addedBy=meal.title[:80]))
    return len(missing)


def _apply_generated_recipe(updated: HouseholdSnapshot, value: dict) -> None:
    """Save an AI-written recipe and, when a meal is included, put it on that day (replacing that slot's meal)."""
    if set(value) - {"id", "recipe", "meal", "groceries"}:
        raise DomainError(422, "INVALID_EDIT", "Unexpected recipe fields.")
    try:
        recipe = Recipe.model_validate(value.get("recipe"))
        meal = Meal.model_validate(value["meal"]) if value.get("meal") else None
    except ValidationError as error:
        raise DomainError(422, "INVALID_EDIT", "The recipe could not be saved.") from error
    if recipe.id != value.get("id") or (meal is not None and meal.recipeId != recipe.id):
        raise DomainError(422, "INVALID_EDIT", "The recipe could not be saved.")
    if any(old.id == recipe.id for old in updated.recipes):
        raise DomainError(409, "RECIPE_EXISTS", "That recipe was already saved.")
    if len(updated.recipes) >= 500:
        raise DomainError(422, "HOUSEHOLD_LIMIT", "Your recipe limit has been reached.")
    updated.recipes.append(recipe)
    if meal is None:
        return
    slot = next((index for index, old in enumerate(updated.meals)
                 if old.date == meal.date and old.category == meal.category), None)
    if slot is None:
        updated.meals.append(meal)
    else:
        # Keep the slot's id and cooks so the TV, phone and any repeating series stay in step.
        old = updated.meals[slot]
        meal = meal.model_copy(update={"id": old.id, "cookIds": old.cookIds or meal.cookIds,
                                       "seriesId": None, "recurrence": None})
        updated.meals[slot] = meal
    if value.get("groceries"):
        _add_meal_groceries(updated, meal)


def complete_chore(snapshot: HouseholdSnapshot, chore_id: str) -> Chore:
    """Mark a chore done and award its stars once for this occurrence."""
    chore = next((item for item in snapshot.chores if item.id == chore_id), None)
    if chore is None:
        raise DomainError(404, "CHORE_NOT_FOUND", "That chore could not be found.")
    if chore.status == "completed":
        raise DomainError(409, "CHORE_ALREADY_COMPLETED", "That chore has already been completed.")
    previous = chore.model_copy(deep=True)
    chore.status = "completed"
    chore.completedAt = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _update_chore_stars(snapshot, previous, chore)
    return chore


def _duplicate_import(snapshot: HouseholdSnapshot, draft: ImportDraft) -> str | None:
    earlier = next((old for old in snapshot.importDrafts
                    if old.contentDigest == draft.contentDigest and old.status != "cancelled"), None)
    if earlier:
        return f"draft:{earlier.id}"
    proposal = draft.proposal
    day = proposal.date or (proposal.startAt or "")[:10]
    if proposal.kind == "event" and day:
        same = next((event for event in snapshot.events if event.title.casefold() == proposal.title.casefold()
                     and event.startAt[:10] == day), None)
        if same:
            return f"event:{same.id}"
    if proposal.kind == "recipe" and any(recipe.name.casefold() == proposal.title.casefold() for recipe in snapshot.recipes):
        return "recipe"
    return None


IMPORT_OVERRIDES = {"id", "title", "date", "startTime", "endTime", "location", "memberIds", "teamId"}


def _confirm_import(updated: HouseholdSnapshot, draft: ImportDraft, overrides: dict) -> None:
    if set(overrides) - IMPORT_OVERRIDES:
        raise DomainError(422, "INVALID_EDIT", "Unexpected import fields.")
    proposal = draft.proposal
    title = str(overrides.get("title") or proposal.title).strip()
    if not title or len(title) > 120:
        raise DomainError(422, "INVALID_EDIT", "Give the imported item a title of up to 120 characters.")
    if proposal.kind == "event":
        if not updated.members:
            raise DomainError(422, "HOUSEHOLD_NOT_READY", "Add a family member before confirming a calendar item.")
        member_ids = overrides.get("memberIds") or [updated.members[0].id]
        if not isinstance(member_ids, list) or any(m not in {x.id for x in updated.members} for m in member_ids):
            raise DomainError(422, "UNKNOWN_MEMBER", "Choose members from your own household.")
        selected_date = overrides.get("date") or proposal.date or (proposal.startAt or "")[:10]
        if not selected_date:
            raise DomainError(422, "IMPORT_NEEDS_DATE", "Add the date before saving this event.")
        try:
            date.fromisoformat(selected_date)
        except (TypeError, ValueError) as error:
            raise DomainError(422, "IMPORT_NEEDS_DATE", "Use a valid date (YYYY-MM-DD).") from error
        start_time = overrides.get("startTime") or proposal.startTime
        end_time = overrides.get("endTime") or proposal.endTime
        if proposal.startAt and not any(overrides.get(key) for key in ("date", "startTime", "endTime")):
            # Calendar files carry absolute times; keep them exactly.
            start_at = proposal.startAt
            end_at = proposal.endAt or (datetime.fromisoformat(start_at.replace("Z", "+00:00")) + timedelta(hours=1)).isoformat()
            all_day = False
        elif start_time:
            start_at = local_iso(updated, selected_date, str(start_time))
            end_at = local_iso(updated, selected_date, str(end_time)) if end_time else \
                (datetime.fromisoformat(start_at) + timedelta(hours=1)).isoformat(timespec="seconds")
            all_day = False
        else:
            start_at = local_iso(updated, selected_date, "00:00")
            end_at = local_iso(updated, (date.fromisoformat(selected_date) + timedelta(days=1)).isoformat(), "00:00")
            all_day = True
        if datetime.fromisoformat(end_at.replace("Z", "+00:00")) <= datetime.fromisoformat(start_at.replace("Z", "+00:00")):
            raise DomainError(422, "INVALID_EDIT", "The end time must follow the start time.")
        team = next((item for item in updated.teams if item.id == overrides.get("teamId")), None)
        location = str(overrides.get("location") or proposal.location or "")[:240] or None
        event = CalendarEvent(
            id=f"import-{draft.id}", familyId=updated.family.id, title=title,
            category="sports" if team else "family", startAt=start_at, endAt=end_at,
            ownerMemberId=member_ids[0], memberIds=list(member_ids), location=location or (team.location if team else None),
            source="import", allDay=all_day, teamId=team.id if team else None,
            sportKind=("game" if "game" in title.casefold() or "match" in title.casefold() else "practice") if team else None,
        )
        if team:
            _apply_team_defaults(updated, event, new=True)
        updated.events.append(event)
    elif proposal.kind == "task":
        updated.chores.append(Chore(id=f"import-{draft.id}", familyId=updated.family.id, title=title, status="pending"))
    else:
        updated.recipes.append(Recipe(id=f"import-{draft.id}", name=title,
                                      ingredients=[_parse_ingredient(line) for line in proposal.ingredients],
                                      instructions=proposal.instructions, source=draft.sourceName or "import"))


def _parse_ingredient(line: str) -> dict:
    """Split "2 cups flour" into quantity/unit/name. Anything unclear stays in the name."""
    import re
    match = re.match(r"^\s*(\d+(?:\.\d+)?|\d+/\d+)\s+([A-Za-z]+\.?)?\s*(.+)$", line)
    units = {"cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "lb", "lbs", "oz",
             "g", "kg", "ml", "l", "can", "cans", "clove", "cloves", "pinch", "slice", "slices", "pound", "pounds"}
    if not match:
        return {"name": line.strip()[:120]}
    raw, unit, name = match.groups()
    quantity = (int(raw.split("/")[0]) / int(raw.split("/")[1])) if "/" in raw and raw.split("/")[1] != "0" else float(raw) if "/" not in raw else None
    if unit and unit.rstrip(".").lower() not in units:
        name, unit = f"{unit} {name}", None
    if quantity is None or quantity <= 0:
        return {"name": line.strip()[:120]}
    return {"name": name.strip()[:120], "quantity": round(quantity, 3), "unit": unit.rstrip(".").lower() if unit else None}


def _apply_team_defaults(snapshot: HouseholdSnapshot, event: CalendarEvent, new: bool) -> None:
    team = next((item for item in snapshot.teams if item.id == event.teamId), None)
    if team is None:
        raise DomainError(422, "UNKNOWN_TEAM", "Choose one of your household's teams.")
    event.category = "sports"
    event.sportKind = event.sportKind or "practice"
    event.uniform = event.uniform or team.uniform
    event.location = event.location or team.location
    if event.travelMinutes is None:
        event.travelMinutes = team.travelMinutes
    if not event.memberIds:
        event.memberIds = list(team.memberIds)
    if new and not event.responsibleMemberId:
        driver = next_driver(team)
        if driver:
            event.responsibleMemberId = driver
            event.responsibilityType = "drive"
    if new and not event.preparation:
        event.preparation = [PreparationItem(id=f"gear-{index}", label=label, completed=False)
                             for index, label in enumerate(team.gear)]


def _apply_edit(snapshot: HouseholdSnapshot, edit: CompanionMutation, actor: str) -> HouseholdSnapshot:
    if edit.expectedRevision != snapshot.revision:
        raise DomainError(409, "STALE_REVISION", "Your household changed on another device. Refresh, review your edit, and save again.")
    updated = snapshot.model_copy(deep=True)
    member_ids = {item.id for item in updated.members}
    value = dict(edit.value)
    item_id = value.get("id")
    if not isinstance(item_id, str) or not 1 <= len(item_id) <= 80:
        raise DomainError(422, "INVALID_EDIT", "This item needs a valid identifier.")
    collections = {"event": "events", "member": "members", "chore": "chores", "listItem": "listItems", "meal": "meals"}
    if edit.kind in OPERATION_KINDS:
        apply_household_op(updated, edit.kind, value, actor)
    elif edit.kind == "mealGroceries":
        meal = next((meal for meal in updated.meals if meal.id == item_id), None)
        if meal is None:
            raise DomainError(404, "NOT_FOUND", "That meal no longer exists.")
        _add_meal_groceries(updated, meal)
    elif edit.kind == "recipeGenerated":
        _apply_generated_recipe(updated, value)
    elif edit.kind == "list":
        try:
            item = HouseholdList.model_validate(value)
            if any(old.id != item.id and old.name.casefold() == item.name.casefold() for old in updated.lists):
                raise ValueError("Duplicate list name")
        except (ValidationError, ValueError) as error:
            raise DomainError(422, "INVALID_EDIT", "Choose a unique list name.") from error
        existing = next((index for index, old in enumerate(updated.lists) if old.id == item.id), None)
        if existing is None:
            if len(updated.lists) >= 100:
                raise DomainError(422, "HOUSEHOLD_LIMIT", "Your household list limit has been reached.")
            updated.lists.append(item)
        else:
            updated.lists[existing] = item
    elif edit.kind == "recipe":
        try:
            item = Recipe.model_validate(value)
            if any(not instruction.strip() for instruction in item.instructions):
                raise ValueError("Empty instruction")
        except (ValidationError, ValueError) as error:
            raise DomainError(422, "INVALID_EDIT", "Check the recipe name, ingredients, and instructions.") from error
        existing = next((index for index, old in enumerate(updated.recipes) if old.id == item.id), None)
        if existing is None:
            if len(updated.recipes) >= 500:
                raise DomainError(422, "HOUSEHOLD_LIMIT", "Your recipe limit has been reached.")
            updated.recipes.append(item)
        else:
            updated.recipes[existing] = item
    elif edit.kind == "mealSeries":
        target = next((old for old in updated.meals if old.id == item_id), None)
        if target is None or not target.seriesId:
            raise DomainError(404, "NOT_FOUND", "That recurring meal could not be found.")
        apply_to_future = value.get("applyToFuture", False)
        replacement = {key: val for key, val in value.items() if key != "applyToFuture"}
        if set(replacement) - {"id", "title", "date", "category", "cookIds", "servings", "minutes", "ingredients", "instructions", "recipeId", "seriesId", "recurrence"}:
            raise DomainError(422, "INVALID_EDIT", "Check the meal details and try again.")
        try:
            item = Meal.model_validate({**target.model_dump(), **replacement, "seriesId": target.seriesId})
        except ValidationError as error:
            raise DomainError(422, "INVALID_EDIT", "Check the meal details and try again.") from error
        for index, old in enumerate(updated.meals):
            if old.id == item.id or (apply_to_future and old.seriesId == target.seriesId and old.date > target.date):
                updated.meals[index] = item.model_copy(update={"id": old.id, "date": old.date})
    elif edit.kind == "importDraft":
        try:
            item = ImportDraft.model_validate(value)
        except ValidationError as error:
            raise DomainError(422, "INVALID_IMPORT", "The import could not be prepared for review.") from error
        if len(updated.importDrafts) >= 100:
            raise DomainError(422, "HOUSEHOLD_LIMIT", "Please review or remove older import drafts first.")
        if any(old.id == item.id for old in updated.importDrafts):
            raise DomainError(409, "DUPLICATE_IMPORT", "This import has already been added for review.")
        duplicate = _duplicate_import(updated, item)
        if duplicate:
            item.proposal.duplicateOf = duplicate
            if "duplicate" not in item.proposal.fieldsNeedingReview:
                item.proposal.fieldsNeedingReview.append("duplicate")
        updated.importDrafts.append(item)
    elif edit.kind in ("importConfirm", "importCancel"):
        draft = next((old for old in updated.importDrafts if old.id == item_id), None)
        if draft is None:
            raise DomainError(404, "NOT_FOUND", "That review draft could not be found.")
        if draft.status != "review":
            raise DomainError(409, "IMPORT_ALREADY_REVIEWED", "That import draft has already been reviewed.")
        if edit.kind == "importCancel":
            draft.status = "cancelled"
        else:
            _confirm_import(updated, draft, value)
            draft.status = "confirmed"
    elif edit.kind in ("reward", "redemptionRequest", "redemptionDecision", "completeChore"):
        return apply_reward_edit(updated, edit)
    elif edit.kind in ("deleteEvent", "deleteMeal"):
        if set(value) != {"id"}:
            raise DomainError(422, "INVALID_EDIT", "Unexpected deletion fields.")
        if edit.kind == "deleteEvent":
            ensure_editable_event(updated, item_id)
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
        if edit.kind == "event":
            ensure_editable_event(updated, item_id)
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
                item.calendarId = None  # Only calendar sync creates read-only mirrored events.
                if item.teamId:
                    _apply_team_defaults(updated, item, new=not any(old.id == item.id for old in updated.events))
                    refs.extend(item.memberIds)
                    if item.responsibleMemberId:
                        refs.append(item.responsibleMemberId)
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
                if item.recipeId and not any(recipe.id == item.recipeId for recipe in updated.recipes):
                    raise ValueError("Missing recipe")
                if item.recipeId:
                    recipe = next(recipe for recipe in updated.recipes if recipe.id == item.recipeId)
                    item.title = item.title.strip() or recipe.name
                    item.ingredients = [
                        f"{part.quantity:g} {part.unit + ' ' if part.unit else ''}{part.name}" if part.quantity is not None else part.name
                        for part in recipe.ingredients
                    ]
                    item.instructions = list(recipe.instructions)
                if any(not part.strip() or len(part) > 1000 for part in [*item.ingredients, *item.instructions]):
                    raise ValueError("Invalid recipe")
                if item.recurrence and not item.seriesId:
                    item.seriesId = uuid4().hex
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
            previous = items[existing] if edit.kind == "chore" else None
            items[existing] = item
        if edit.kind == "chore":
            _update_chore_stars(updated, previous if existing is not None else None, item)
        if edit.kind == "event" and item.recurrence == "weekly" and existing is None:
            item.seriesId = item.seriesId or uuid4().hex
            start, end = (datetime.fromisoformat(v.replace("Z", "+00:00")) for v in (item.startAt, item.endAt))
            for number in range(1, 12):
                occurrence = item.model_copy(deep=True, update={
                    "id": f"{item.id}-w{number}"[:120],
                    "startAt": (start + timedelta(days=7 * number)).isoformat(),
                    "endAt": (end + timedelta(days=7 * number)).isoformat(),
                    "responsibleMemberId": item.responsibleMemberId,
                })
                if item.teamId:
                    occurrence.responsibleMemberId = None
                    occurrence.preparation = [prep.model_copy(update={"completed": False}) for prep in item.preparation]
                    _apply_team_defaults(updated, occurrence, new=True)
                updated.events.append(occurrence)
        if edit.kind == "meal" and item.recurrence and existing is None:
            count = 12
            interval = {"weekly": 7, "biweekly": 14}.get(item.recurrence)
            for number in range(1, count):
                next_day = date.fromisoformat(item.date)
                if interval:
                    next_day = date.fromordinal(next_day.toordinal() + interval * number)
                else:
                    month_index = next_day.year * 12 + (next_day.month - 1) + number
                    year, month0 = divmod(month_index, 12)
                    month = month0 + 1
                    day = min(next_day.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                                             31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
                    next_day = date(year, month, day)
                updated.meals.append(item.model_copy(update={"id": uuid4().hex, "date": next_day.isoformat()}))
        if edit.kind == "member":
            updated.family.memberIds = [member.id for member in updated.members]
    updated.revision += 1
    return updated


def _occurrence_source(chore: Chore) -> str:
    occurrence = chore.dueAt[:10] if chore.recurrence and chore.dueAt else "once"
    return f"chore:{chore.id}:{occurrence}"


def _update_chore_stars(snapshot: HouseholdSnapshot, previous: Chore | None, current: Chore) -> None:
    if current.assignedToMemberId is None:
        return
    source_id = _occurrence_source(current)
    existing = {item.id for item in snapshot.starTransactions}
    earned_id = f"earned:{source_id}"
    reversed_id = f"reversed:{source_id}"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if current.status == "completed" and (previous is None or previous.status != "completed"):
        if earned_id not in existing:
            snapshot.starTransactions.append(StarTransaction(
                id=earned_id, memberId=current.assignedToMemberId,
                delta=current.points or 1, reason="chore_earned", sourceId=source_id, createdAt=now,
            ))
    elif current.status == "pending" and previous and previous.status == "completed":
        previous_source = _occurrence_source(previous)
        previous_earned = f"earned:{previous_source}"
        previous_reversed = f"reversed:{previous_source}"
        if previous_earned in existing and previous_reversed not in existing:
            award = next(item for item in snapshot.starTransactions if item.id == previous_earned)
            snapshot.starTransactions.append(StarTransaction(
                id=previous_reversed, memberId=award.memberId, delta=-award.delta,
                reason="chore_reversed", sourceId=previous_source, createdAt=now,
            ))


def apply_reward_edit(snapshot: HouseholdSnapshot, edit: CompanionMutation) -> HouseholdSnapshot:
    value = dict(edit.value)
    updated = snapshot
    try:
        item_id = value.get("id")
        if not isinstance(item_id, str) or not item_id:
            raise ValueError("Missing id")
        if edit.kind == "reward":
            reward = Reward.model_validate(value)
            index = next((i for i, item in enumerate(updated.rewards) if item.id == reward.id), None)
            if index is None:
                if len(updated.rewards) >= 100:
                    raise DomainError(422, "HOUSEHOLD_LIMIT", "Your household reward limit has been reached.")
                updated.rewards.append(reward)
            else:
                updated.rewards[index] = reward
        elif edit.kind == "redemptionRequest":
            request = RedemptionRequest.model_validate(value)
            if request.status != "pending":
                raise ValueError("Requests must begin pending")
            member = next((member for member in updated.members if member.id == request.memberId), None)
            reward = next((reward for reward in updated.rewards if reward.id == request.rewardId and reward.available), None)
            if member is None or member.role != "child" or reward is None or reward.stars != request.stars:
                raise DomainError(422, "INVALID_REDEMPTION", "Choose a child profile and an available reward.")
            if any(old.status == "pending" and old.memberId == request.memberId and old.rewardId == request.rewardId
                   for old in updated.redemptions):
                raise DomainError(409, "REDEMPTION_PENDING", "That reward is already waiting for approval.")
            if len(updated.redemptions) >= 500:
                raise DomainError(422, "HOUSEHOLD_LIMIT", "Your household has too many reward requests. Review older requests first.")
            updated.redemptions.append(request)
        elif edit.kind == "redemptionDecision":
            if set(value) - {"id", "action", "approvedBy", "approvedAt"}:
                raise ValueError("Unexpected approval fields")
            request = next((item for item in updated.redemptions if item.id == item_id), None)
            if request is None:
                raise DomainError(404, "REDEMPTION_NOT_FOUND", "That reward request could not be found.")
            if request.status != "pending":
                raise DomainError(409, "REDEMPTION_ALREADY_REVIEWED", "That reward request has already been reviewed.")
            action = value.get("action")
            if action not in ("approve", "reject"):
                raise ValueError("Invalid decision")
            if action == "approve":
                reward = next((reward for reward in updated.rewards if reward.id == request.rewardId and reward.available), None)
                if reward is None:
                    raise DomainError(409, "REWARD_UNAVAILABLE", "That reward is no longer available.")
                balance = sum(item.delta for item in updated.starTransactions if item.memberId == request.memberId)
                if balance < request.stars:
                    raise DomainError(409, "NOT_ENOUGH_STARS", "This child has not earned enough stars yet.")
                transaction_id = f"redeemed:{request.id}"
                if any(item.id == transaction_id for item in updated.starTransactions):
                    raise DomainError(409, "REDEMPTION_ALREADY_APPROVED", "Stars were already deducted for this request.")
                updated.starTransactions.append(StarTransaction(
                    id=transaction_id, memberId=request.memberId, delta=-request.stars,
                    reason="reward_redeemed", sourceId=request.id,
                    createdAt=str(value.get("approvedAt") or datetime.now(timezone.utc).isoformat(timespec="seconds")),
                ))
                request.status = "approved"
                request.approvedAt = str(value.get("approvedAt") or datetime.now(timezone.utc).isoformat(timespec="seconds"))
                request.approvedBy = str(value.get("approvedBy") or "parent")[:80]
            else:
                request.status = "rejected"
                request.approvedAt = str(value.get("approvedAt") or datetime.now(timezone.utc).isoformat(timespec="seconds"))
                request.approvedBy = str(value.get("approvedBy") or "parent")[:80]
        elif edit.kind == "completeChore":
            if set(value) - {"id", "memberId"}:
                raise ValueError("Unexpected fields")
            chore = next((item for item in updated.chores if item.id == item_id), None)
            if chore is None:
                raise DomainError(404, "CHORE_NOT_FOUND", "That chore could not be found.")
            if "memberId" in value and chore.assignedToMemberId != value.get("memberId"):
                raise DomainError(403, "CHORE_NOT_ASSIGNED", "Children can complete only chores assigned to their own profile.")
            complete_chore(updated, chore.id)
        else:
            raise ValueError("Unsupported mutation")
    except ValidationError as error:
        raise DomainError(422, "INVALID_REWARD", "Check the reward details and try again.") from error
    except (ValueError, TypeError) as error:
        raise DomainError(422, "INVALID_REWARD", "Check the reward details and try again.") from error
    updated.revision += 1
    return updated
