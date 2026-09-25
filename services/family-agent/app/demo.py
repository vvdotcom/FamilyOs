from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from .models import HouseholdSnapshot

DEMO_NOW = datetime.fromisoformat("2026-09-22T14:30:00-07:00")


def create_demo_household() -> HouseholdSnapshot:
    family_id = "family-home"
    members = [
        {"id": "alex", "familyId": family_id, "name": "Alex", "initials": "A", "role": "adult", "accentColor": "#65C7F7"},
        {"id": "jordan", "familyId": family_id, "name": "Jordan", "initials": "J", "role": "adult", "accentColor": "#FF7A7A"},
        {"id": "emma", "familyId": family_id, "name": "Emma", "initials": "E", "role": "child", "accentColor": "#A98BF3"},
        {"id": "leo", "familyId": family_id, "name": "Leo", "initials": "L", "role": "child", "accentColor": "#FFD166"},
    ]

    def event(event_id: str, title: str, category: str, start: str, end: str, member_ids: list[str], **extra: object) -> dict[str, object]:
        return {
            "id": event_id,
            "familyId": family_id,
            "title": title,
            "category": category,
            "startAt": f"2026-09-22T{start}:00-07:00",
            "endAt": f"2026-09-22T{end}:00-07:00",
            "ownerMemberId": member_ids[0] if member_ids else "alex",
            "memberIds": member_ids,
            "preparation": [],
            "source": "demo",
            **extra,
        }

    events = [
        event("school-emma", "School", "school", "07:45", "08:15", ["emma"]),
        event("school-leo", "School", "school", "07:45", "08:15", ["leo"]),
        event("dentist-jordan", "Dentist", "appointment", "14:45", "15:30", ["jordan"], location="Desert Dental"),
        event(
            "emma-pickup", "Emma pickup", "pickup", "15:15", "15:30", ["emma"],
            responsibleMemberId="jordan", responsibilityType="pickup", location="Riverside School", travelMinutes=15,
        ),
        event(
            "soccer-emma", "Soccer practice", "sports", "17:00", "18:00", ["emma"],
            location="Kino Sports Complex", travelMinutes=20,
            preparation=[
                {"id": "soccer-ball", "label": "Soccer ball", "completed": True},
                {"id": "water-bottle", "label": "Water bottle", "completed": False},
            ],
        ),
        event("family-dinner", "Family dinner", "meal", "18:30", "19:15", ["alex", "jordan", "emma", "leo"]),
    ]
    chores = [
        {"id": "pack-backpack", "familyId": family_id, "title": "Pack backpack", "assignedToMemberId": "emma", "dueAt": "2026-09-23T07:30:00-07:00", "status": "pending", "points": 5, "recurrence": "daily"},
        {"id": "feed-cat", "familyId": family_id, "title": "Feed the cat", "assignedToMemberId": "leo", "dueAt": "2026-09-22T17:00:00-07:00", "status": "completed", "completedAt": "2026-09-22T07:30:00-07:00", "points": 5, "recurrence": "daily"},
        {"id": "shoes-door", "familyId": family_id, "title": "Put shoes by the door", "dueAt": "2026-09-22T20:00:00-07:00", "status": "pending", "points": 2, "recurrence": "daily"},
    ]
    routines = [
        {"id": "emma-morning", "familyId": family_id, "name": "Emma’s morning routine", "period": "morning", "memberId": "emma", "steps": [
            {"id": "brush-teeth", "title": "Brush teeth", "completed": True},
            {"id": "get-dressed", "title": "Get dressed", "completed": True},
            {"id": "eat-breakfast", "title": "Eat breakfast", "completed": True},
            {"id": "pack-backpack-step", "title": "Pack backpack", "completed": False},
            {"id": "shoes-on", "title": "Shoes on", "completed": False},
        ]},
        {"id": "leo-evening", "familyId": family_id, "name": "Leo’s evening routine", "period": "evening", "memberId": "leo", "steps": [
            {"id": "feed-cat-step", "title": "Feed the cat", "completed": True},
            {"id": "put-toys-away", "title": "Put toys away", "completed": False},
            {"id": "brush-teeth-evening", "title": "Brush teeth", "completed": False},
        ]},
    ]
    return HouseholdSnapshot.model_validate({
        "family": {"id": family_id, "name": "The Rivera Family", "timezone": "America/Phoenix", "memberIds": [m["id"] for m in members]},
        "members": members,
        "events": events,
        "chores": chores,
        "routines": routines,
    })


def demo_now() -> datetime:
    import os

    raw = os.getenv("FAMILYOS_DEMO_NOW")
    if raw:
        try:
            value = datetime.fromisoformat(raw)
            if value.tzinfo:
                return value
        except ValueError:
            pass
    return datetime.now(ZoneInfo("America/Phoenix"))
