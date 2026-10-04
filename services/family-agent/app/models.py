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
    category: Literal["school", "appointment", "pickup", "dropoff", "drive", "sports", "meal", "family", "move"]
    startAt: str
    endAt: str
    ownerMemberId: str
    memberIds: list[str]
    responsibleMemberId: str | None = None
    responsibilityType: Literal["pickup", "dropoff", "drive"] | None = None
    location: str | None = None
    travelMinutes: int | None = None
    preparation: list[PreparationItem] = Field(default_factory=list)
    source: Literal["demo", "manual", "google", "outlook", "icloud", "ics", "import", "voice"] = "demo"
    allDay: bool = False
    calendarId: str | None = Field(default=None, max_length=80)
    seriesId: str | None = Field(default=None, max_length=80)
    recurrence: Literal["weekly"] | None = None
    teamId: str | None = Field(default=None, max_length=80)
    sportKind: Literal["practice", "game"] | None = None
    arrivalMinutes: int | None = Field(default=None, ge=0, le=180)
    uniform: str | None = Field(default=None, max_length=80)
    moveRoutineId: str | None = Field(default=None, max_length=80)


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
    verifyWithPhoto: bool = False
    photoHint: str | None = Field(default=None, max_length=160)


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
    ingredientName: str | None = Field(default=None, max_length=120)
    quantity: float | None = Field(default=None, gt=0, le=100_000)
    unit: str | None = Field(default=None, max_length=24)


class HouseholdList(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["grocery", "household", "custom"] = "custom"


class RecipeIngredient(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    quantity: float | None = Field(default=None, gt=0, le=100_000)
    unit: str | None = Field(default=None, max_length=24)


class Recipe(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    ingredients: list[RecipeIngredient] = Field(default_factory=list, max_length=100)
    instructions: list[str] = Field(default_factory=list, max_length=100)
    servings: int = Field(default=4, ge=1, le=100)
    source: str = Field(default="family", max_length=240)


class ImportProposal(StrictModel):
    kind: Literal["event", "task", "recipe"]
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    startAt: str | None = Field(default=None, max_length=40)
    endAt: str | None = Field(default=None, max_length=40)
    startTime: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    endTime: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    location: str | None = Field(default=None, max_length=240)
    ingredients: list[str] = Field(default_factory=list, max_length=100)
    instructions: list[str] = Field(default_factory=list, max_length=100)
    fieldsNeedingReview: list[str] = Field(default_factory=list, max_length=20)
    confidence: float = Field(default=0.5, ge=0, le=1)
    duplicateOf: str | None = Field(default=None, max_length=160)
    provider: Literal["rules", "bedrock", "ics"] = "rules"


class ImportDraft(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    sourceType: Literal["photo", "flyer", "email", "text", "ics"]
    sourceName: str = Field(default="", max_length=120)
    contentDigest: str = Field(min_length=32, max_length=64)
    status: Literal["review", "confirmed", "cancelled"] = "review"
    createdAt: str = Field(max_length=40)
    proposal: ImportProposal


class Reward(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=120)
    stars: int = Field(ge=1, le=100_000)
    available: bool = True


class StarTransaction(StrictModel):
    id: str = Field(min_length=1, max_length=160)
    memberId: str = Field(min_length=1, max_length=80)
    delta: int = Field(ge=-100_000, le=100_000)
    reason: Literal["chore_earned", "chore_reversed", "reward_redeemed", "adjustment", "move_completed"]
    sourceId: str = Field(min_length=1, max_length=160)
    createdAt: str = Field(max_length=40)


class RedemptionRequest(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    memberId: str = Field(min_length=1, max_length=80)
    rewardId: str = Field(min_length=1, max_length=80)
    stars: int = Field(ge=1, le=100_000)
    status: Literal["pending", "approved", "rejected", "fulfilled"] = "pending"
    requestedAt: str = Field(max_length=40)
    approvedAt: str | None = Field(default=None, max_length=40)
    approvedBy: str | None = Field(default=None, max_length=80)


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
    recipeId: str | None = Field(default=None, max_length=80)
    seriesId: str | None = Field(default=None, max_length=80)
    recurrence: Literal["weekly", "biweekly", "monthly"] | None = None


class Team(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=60)
    activity: str = Field(default="Sports", min_length=1, max_length=40)
    memberIds: list[str] = Field(default_factory=list, max_length=10)
    uniform: str | None = Field(default=None, max_length=80)
    gear: list[str] = Field(default_factory=list, max_length=20)
    driverIds: list[str] = Field(default_factory=list, max_length=10)
    rotationIndex: int = Field(default=0, ge=0, le=100_000)
    location: str | None = Field(default=None, max_length=240)
    travelMinutes: int | None = Field(default=None, ge=0, le=240)


class FamilyNightSettings(StrictModel):
    weekday: int = Field(ge=0, le=6)  # Monday = 0, matching Python's date.weekday().
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    activityType: Literal["movie", "game", "other"] = "movie"
    pickerOrder: list[str] = Field(default_factory=list, max_length=30)
    pickerIndex: int = Field(default=0, ge=0, le=100_000)


class FamilyNightSuggestion(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=80)
    byMemberId: str = Field(min_length=1, max_length=80)


class FamilyNightPoll(StrictModel):
    id: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    activityType: Literal["movie", "game", "other"] = "movie"
    suggestions: list[FamilyNightSuggestion] = Field(default_factory=list, max_length=20)
    votes: dict[str, str] = Field(default_factory=dict)
    status: Literal["open", "tie", "decided"] = "open"
    tiedSuggestionIds: list[str] = Field(default_factory=list, max_length=20)
    winnerSuggestionId: str | None = Field(default=None, max_length=80)
    decidedBy: Literal["majority", "picker"] | None = None
    pickerMemberId: str | None = Field(default=None, max_length=80)
    decidedAt: str | None = Field(default=None, max_length=40)


class Proposal(StrictModel):
    """A pending change from voice or another indirect source. It changes nothing until decided."""

    id: str = Field(min_length=1, max_length=80)
    source: Literal["voice", "companion", "tv", "hometide"] = "voice"
    kind: Literal["pickup_swap", "event", "reschedule", "chore_done", "routine"]
    status: Literal["pending", "confirmed", "rejected", "expired"] = "pending"
    summary: str = Field(min_length=1, max_length=240)
    payload: dict[str, object] = Field(default_factory=dict)
    requestedBy: str = Field(default="parent", max_length=80)
    createdAt: str = Field(max_length=40)
    expiresAt: str = Field(max_length=40)
    decidedAt: str | None = Field(default=None, max_length=40)
    decidedBy: str | None = Field(default=None, max_length=80)
    resultMessage: str | None = Field(default=None, max_length=240)


class ChoreVerification(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    choreId: str = Field(min_length=1, max_length=80)
    memberId: str = Field(min_length=1, max_length=80)
    occurrence: str = Field(min_length=1, max_length=160)
    photoId: str | None = Field(default=None, max_length=80)
    verdict: Literal["looks_done", "unclear", "not_done"]
    reason: str = Field(max_length=160)
    confidence: float = Field(ge=0, le=1)
    provider: Literal["demo", "bedrock", "fallback"]
    status: Literal["pending", "approved", "rejected", "retake"] = "pending"
    submittedAt: str = Field(max_length=40)
    decidedAt: str | None = Field(default=None, max_length=40)
    decidedBy: str | None = Field(default=None, max_length=80)


class PhotoMeta(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    caption: str = Field(default="", max_length=120)
    width: int = Field(ge=1, le=20_000)
    height: int = Field(ge=1, le=20_000)
    bytes: int = Field(ge=1, le=50_000_000)
    order: int = Field(default=0, ge=0, le=100_000)
    selected: bool = True
    rotation: Literal[0, 90, 180, 270] = 0
    uploadedBy: str = Field(default="", max_length=80)
    createdAt: str = Field(max_length=40)


class AuditEntry(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    at: str = Field(max_length=40)
    actor: str = Field(max_length=80)
    action: str = Field(max_length=40)
    itemId: str = Field(default="", max_length=160)


class HouseholdLocation(StrictModel):
    """Where the household is, for weather. Stored rounded to about 1 km; never a street address."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str = Field(min_length=1, max_length=80)
    source: Literal["device", "search"] = "device"
    updatedAt: str = Field(max_length=40)


class CalendarSubscriptionMeta(StrictModel):
    """A connected, read-only calendar. The private iCal link is stored separately and never sent to clients."""

    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=60)
    provider: Literal["google", "icloud", "outlook", "ics"] = "ics"
    host: str = Field(default="", max_length=120)
    memberIds: list[str] = Field(default_factory=list, max_length=30)
    status: Literal["pending", "ok", "error"] = "pending"
    message: str = Field(default="", max_length=160)
    lastSyncedAt: str | None = Field(default=None, max_length=40)
    eventCount: int = Field(default=0, ge=0, le=100_000)


class HouseholdSnapshot(StrictModel):
    family: Family
    members: list[FamilyMember]
    events: list[CalendarEvent]
    chores: list[Chore]
    routines: list[Routine]
    revision: int = 0
    listItems: list[ListItem] = Field(default_factory=list)
    meals: list[Meal] = Field(default_factory=list)
    lists: list[HouseholdList] = Field(default_factory=list, max_length=100)
    recipes: list[Recipe] = Field(default_factory=list, max_length=500)
    importDrafts: list[ImportDraft] = Field(default_factory=list, max_length=100)
    rewards: list[Reward] = Field(default_factory=list, max_length=100)
    redemptions: list[RedemptionRequest] = Field(default_factory=list, max_length=500)
    starTransactions: list[StarTransaction] = Field(default_factory=list, max_length=10_000)
    teams: list[Team] = Field(default_factory=list, max_length=30)
    familyNight: FamilyNightSettings | None = None
    familyNightPolls: list[FamilyNightPoll] = Field(default_factory=list, max_length=120)
    proposals: list[Proposal] = Field(default_factory=list, max_length=300)
    choreVerifications: list[ChoreVerification] = Field(default_factory=list, max_length=600)
    photos: list[PhotoMeta] = Field(default_factory=list, max_length=300)
    auditLog: list[AuditEntry] = Field(default_factory=list, max_length=600)
    location: HouseholdLocation | None = None
    calendars: list[CalendarSubscriptionMeta] = Field(default_factory=list, max_length=10)


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
    deviceName: str = Field(default="Hometide TV", min_length=1, max_length=60)


class PairingApproveBody(StrictModel):
    code: str = Field(pattern=r"^\d{6}$")


class PairingClaimBody(StrictModel):
    pollingToken: str = Field(min_length=32, max_length=128)


class ParentAccessCodeBody(StrictModel):
    code: str = Field(pattern=r"^\d{4}$")


class ChangeParentAccessCodeBody(StrictModel):
    oldCode: str = Field(pattern=r"^\d{4}$")
    newCode: str = Field(pattern=r"^\d{4}$")


class RedemptionRequestBody(StrictModel):
    memberId: str = Field(min_length=1, max_length=80)
    rewardId: str = Field(min_length=1, max_length=80)


class RedemptionDecisionBody(ParentAccessCodeBody):
    action: Literal["approve", "reject"]


class DeleteAccountBody(StrictModel):
    confirm: Literal["DELETE"]
    password: str | None = Field(default=None, min_length=1, max_length=128)
    idToken: str | None = Field(default=None, min_length=20, max_length=16_384)


class ResetAccessCodeBody(StrictModel):
    newCode: str = Field(pattern=r"^\d{4}$")
    password: str | None = Field(default=None, min_length=1, max_length=128)
    idToken: str | None = Field(default=None, min_length=20, max_length=16_384)


class StarAdjustmentBody(ParentAccessCodeBody):
    memberId: str = Field(min_length=1, max_length=80)
    delta: int = Field(ge=-1000, le=1000)


class DecisionWithCodeBody(ParentAccessCodeBody):
    action: Literal["approve", "reject", "retake"]


class ProposalDecisionBody(StrictModel):
    action: Literal["confirm", "reject"]
    code: str | None = Field(default=None, pattern=r"^\d{4}$")


class PhotoUploadBody(StrictModel):
    contentBase64: str = Field(min_length=16, max_length=14_000_000)
    caption: str = Field(default="", max_length=120)


class ChoreVerificationBody(StrictModel):
    memberId: str = Field(min_length=1, max_length=80)
    contentBase64: str = Field(min_length=16, max_length=14_000_000)


class VoiceTokenBody(StrictModel):
    label: str = Field(default="Alexa+", min_length=1, max_length=60)
    memberId: str | None = Field(default=None, max_length=80)


class VoiceUtteranceBody(StrictModel):
    utterance: str = Field(min_length=1, max_length=400)


class MoveCompleteBody(StrictModel):
    routineId: str = Field(min_length=1, max_length=80)
    memberIds: list[str] = Field(min_length=1, max_length=30)
    eventId: str | None = Field(default=None, max_length=120)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class CalendarAddBody(StrictModel):
    label: str = Field(min_length=1, max_length=60)
    url: str = Field(min_length=10, max_length=2048)
    memberIds: list[str] = Field(default_factory=list, max_length=30)


class ChildAccessBody(StrictModel):
    memberId: str = Field(min_length=1, max_length=80)


class EmptyBody(StrictModel):
    pass


class APIEnvelope(StrictModel):
    data: object
    meta: dict[str, object]


class APIErrorEnvelope(StrictModel):
    error: dict[str, str]
    meta: dict[str, object]
