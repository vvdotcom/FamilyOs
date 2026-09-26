from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Family(StrictModel):
    id: str
    name: str
    timezone: str
    memberIds: list[str]


class FamilyMember(StrictModel):
    id: str
    familyId: str
    name: str
    initials: str
    role: Literal["adult", "child"]
    accentColor: str


class PreparationItem(StrictModel):
    id: str
    label: str
    completed: bool


class CalendarEvent(StrictModel):
    id: str
    familyId: str
    title: str
    category: Literal["school", "appointment", "pickup", "dropoff", "drive", "sports", "meal", "family"]
    startAt: str
    endAt: str
    ownerMemberId: str
    memberIds: list[str]
    responsibleMemberId: str | None = None
    responsibilityType: Literal["pickup", "dropoff", "drive"] | None = None
    location: str | None = None
    travelMinutes: int | None = None
    preparation: list[PreparationItem] = Field(default_factory=list)
    source: Literal["demo", "manual", "google", "outlook"] = "demo"
    allDay: bool = False


class Chore(StrictModel):
    id: str
    familyId: str
    title: str
    assignedToMemberId: str | None = None
    dueAt: str | None = None
    status: Literal["pending", "completed"]
    points: int | None = None
    recurrence: Literal["daily", "weekly"] | None = None
    completedAt: str | None = None


class RoutineStep(StrictModel):
    id: str
    title: str
    completed: bool


class Routine(StrictModel):
    id: str
    familyId: str
    name: str
    period: Literal["morning", "evening"]
    memberId: str
    steps: list[RoutineStep]


class Conflict(StrictModel):
    id: str
    type: Literal["event_overlap", "responsibility_overlap", "travel_buffer", "preparation"]
    severity: Literal["info", "warning", "critical"]
    title: str
    message: str
    eventIds: list[str]
    memberIds: list[str]
    startsAt: str
    endsAt: str
    suggestedMemberId: str | None = None


class ProposedAction(StrictModel):
    id: str
    type: Literal["reassign_responsibility"]
    status: Literal["proposed", "confirmed", "cancelled"]
    eventId: str
    conflictId: str
    fromMemberId: str
    toMemberId: str
    createdAt: str
    confirmedAt: str | None = None


class ListItem(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    listName: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=160)
    category: str = Field(default="Other", max_length=60)
    completed: bool = False
    addedBy: str = Field(default="", max_length=80)


class Meal(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=120)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: Literal["Breakfast", "Lunch", "Dinner"] = "Dinner"
    cookIds: list[str] = Field(default_factory=list, max_length=30)
    servings: int = Field(default=4, ge=1, le=100)
    minutes: int = Field(default=30, ge=1, le=1440)
    ingredients: list[str] = Field(default_factory=list, max_length=100)
    instructions: list[str] = Field(default_factory=list, max_length=100)


class HouseholdSnapshot(StrictModel):
    family: Family
    members: list[FamilyMember]
    events: list[CalendarEvent]
    chores: list[Chore]
    routines: list[Routine]
    revision: int = 0
    listItems: list[ListItem] = Field(default_factory=list)
    meals: list[Meal] = Field(default_factory=list)


class BriefingMember(StrictModel):
    id: str = Field(max_length=80)
    name: str = Field(max_length=80)
    role: Literal["adult", "child"]


class BriefingEvent(StrictModel):
    id: str = Field(max_length=120)
    title: str = Field(max_length=120)
    startAt: str
    endAt: str
    memberIds: list[str] = Field(max_length=20)
    responsibleMemberId: str | None = None


class BriefingChore(StrictModel):
    id: str = Field(max_length=120)
    title: str = Field(max_length=120)
    status: Literal["pending", "completed"]
    assignedToMemberId: str | None = None


class BriefingRoutine(StrictModel):
    name: str = Field(max_length=120)
    period: Literal["morning", "evening"]
    memberId: str
    completedSteps: int = Field(ge=0, le=100)
    totalSteps: int = Field(ge=0, le=100)


class BriefingConflict(StrictModel):
    id: str = Field(max_length=240)
    type: Literal["event_overlap", "responsibility_overlap", "travel_buffer", "preparation"]
    title: str = Field(max_length=120)
    message: str = Field(max_length=240)
    suggestedMemberId: str | None = None


class BriefingWeather(StrictModel):
    condition: str = Field(max_length=60)
    temperatureF: int = Field(ge=-100, le=160)


class HouseholdContext(StrictModel):
    date: str = Field(max_length=32)
    timezone: str = Field(default="UTC", max_length=80)
    members: list[BriefingMember] = Field(max_length=30)
    events: list[BriefingEvent] = Field(max_length=250)
    chores: list[BriefingChore] = Field(max_length=250)
    routines: list[BriefingRoutine] = Field(max_length=100)
    conflicts: list[BriefingConflict] = Field(max_length=100)
    weather: BriefingWeather | None = None


class FamilyBriefing(StrictModel):
    date: str = Field(max_length=32)
    headline: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=280)
    highlights: list[str] = Field(max_length=5)
    conflictIds: list[str] = Field(max_length=100)
    provider: Literal["deterministic", "ai"]

    @field_validator("highlights")
    @classmethod
    def validate_highlights(cls, values: list[str]) -> list[str]:
        if any(not value.strip() or len(value.split()) > 18 or len(value) > 140 for value in values):
            raise ValueError("Highlights must be concise and non-empty")
        return values

    @field_validator("headline")
    @classmethod
    def validate_headline(cls, value: str) -> str:
        if len(value.split()) > 7:
            raise ValueError("Headline must contain no more than seven words")
        return value.strip()

    @field_validator("summary")
    @classmethod
    def validate_summary(cls, value: str) -> str:
        if len(value.split()) > 35:
            raise ValueError("Summary must contain no more than 35 words")
        return value.strip()


class ActionProposalRequest(StrictModel):
    conflictId: str = Field(min_length=1, max_length=240)
    eventId: str = Field(min_length=1, max_length=120)
    targetMemberId: str = Field(min_length=1, max_length=80)


class CognitoExchangeBody(StrictModel):
    idToken: str = Field(min_length=20, max_length=16_384)
    parentName: str | None = Field(default=None, max_length=80)
    householdName: str | None = Field(default=None, max_length=80)


class PairingChallengeBody(StrictModel):
    deviceName: str = Field(default="FamilyOS TV", min_length=1, max_length=60)


class PairingApproveBody(StrictModel):
    code: str = Field(pattern=r"^\d{6}$")


class PairingClaimBody(StrictModel):
    pollingToken: str = Field(min_length=32, max_length=128)


class EmptyBody(StrictModel):
    pass


class APIEnvelope(StrictModel):
    data: object
    meta: dict[str, object]


class APIErrorEnvelope(StrictModel):
    error: dict[str, str]
    meta: dict[str, object]
