"""Phase 12 voice access: a Streamable HTTP MCP server for Alexa+ and a simulated Alexa+ client.

Voice can read household data and *propose* changes. It never applies a change: proposals wait for
confirmation on the TV (remote) or phone, and parent-level proposals need a parent there.
"""
from __future__ import annotations

import asyncio
import contextvars
import hashlib
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, AsyncIterator, Awaitable, Callable
from uuid import uuid4

from mcp.server.auth.middleware.auth_context import AuthContextMiddleware, get_access_token
from mcp.server.auth.middleware.bearer_auth import BearerAuthBackend, RequireAuthMiddleware
from mcp.server.auth.provider import AccessToken
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.responses import JSONResponse

from .demo import demo_now
from .tv_commands import TV_SCREENS, TVCommandBus, resolve_screen
from .domain import DomainError, detect_conflicts, member_name, parse, sports_reminders
from .household_ops import current_picker, household_zone, local_iso, tally
from .imports import TIME_PATTERN, _clock
from .models import HouseholdSnapshot
from .permissions import Actor
from .service import HouseholdService

logger = logging.getLogger("familyos.agent.voice")
SCOPE = "household"
RATE_PER_MINUTE = 60


_REASONING = re.compile(r"<thinking>.*?(</thinking>|$)", re.DOTALL | re.IGNORECASE)


# Tools that ask for a change. The rules handle clear requests for these before any model is involved.
COMMAND_TOOLS = frozenset({"propose_pickup_swap", "propose_reschedule", "propose_event", "mark_chore_done_request",
                           "show_on_tv"})


def bedrock_credentials() -> bool:
    """A Bedrock API key, or IAM credentials (for example the CDK-created Hometide IAM user)."""
    return any(os.getenv(name) for name in ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID",
                                            "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_PROFILE"))


def bedrock_enabled() -> bool:
    return os.getenv("FAMILYOS_AI_PROVIDER", "").lower() == "bedrock" and bedrock_credentials()


def strip_model_reasoning(text: str) -> str:
    """Nova models can prefix tool-use replies with <thinking> notes; never speak those aloud."""
    return " ".join(_REASONING.sub(" ", text).split())


@dataclass(frozen=True)
class VoiceIdentity:
    owner: str
    member_id: str | None  # Set when the connection belongs to a child profile.
    label: str
    connection_id: str

    @property
    def is_child(self) -> bool:
        return self.member_id is not None


_in_process_identity: contextvars.ContextVar[VoiceIdentity | None] = contextvars.ContextVar("familyos_voice", default=None)


class VoiceGateway:
    """Resolves voice credentials and applies per-connection rate limits."""

    def __init__(self, service: HouseholdService, cognito_access=None) -> None:
        self.service = service
        self.cognito_access = cognito_access
        self._calls: dict[str, deque[float]] = defaultdict(deque)

    def identity(self, token: str | None) -> VoiceIdentity | None:
        record = self.service.accounts.voice_token(token)
        if record:
            return VoiceIdentity(owner=str(record["owner"]), member_id=record.get("memberId"),
                                 label=str(record.get("label") or "voice"), connection_id=str(record["id"]))
        claims = self.cognito_access.verify(token or "") if self.cognito_access else None
        if claims:
            return VoiceIdentity(owner=str(claims["sub"]), member_id=None, label="Alexa+ (linked account)",
                                 connection_id=f"cognito:{str(claims['sub'])[:12]}")
        return None

    def allow(self, identity: VoiceIdentity) -> bool:
        now = time.monotonic()
        window = self._calls[identity.connection_id]
        while window and window[0] < now - 60:
            window.popleft()
        if len(window) >= RATE_PER_MINUTE:
            return False
        window.append(now)
        return True


class FamilyTokenVerifier:
    def __init__(self, gateway: VoiceGateway) -> None:
        self.gateway = gateway

    async def verify_token(self, token: str) -> AccessToken | None:
        identity = await asyncio.to_thread(self.gateway.identity, token)
        if identity is None:
            return None
        return AccessToken(token=token, client_id=identity.connection_id, scopes=[SCOPE])


# Speech helpers -----------------------------------------------------------------------------------

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def spoken_date(text: str | None, today: date) -> date:
    value = (text or "today").strip().lower()
    if value in ("today", "tonight", ""):
        return today
    if value == "tomorrow":
        return today + timedelta(days=1)
    for index, name in enumerate(WEEKDAYS):
        if name in value:
            ahead = (index - today.weekday()) % 7
            return today + timedelta(days=ahead or (7 if "next" in value else 0))
    try:
        return date.fromisoformat(value[:10])
    except ValueError as error:
        raise ToolError("I didn't catch the date. Try 'today', 'tomorrow', a weekday, or a date like 2026-10-03.") from error


def spoken_time(text: str | None) -> str | None:
    if not text:
        return None
    match = TIME_PATTERN.search(text.replace(" o'clock", ":00"))
    if match:
        return _clock(match)
    bare = re.fullmatch(r"\s*(\d{1,2})\s*", text)
    if bare and 1 <= int(bare.group(1)) <= 11:
        return f"{int(bare.group(1)) + 12:02d}:00"  # Family plans without am/pm are usually afternoon/evening.
    return None


def clock_text(value: str, snapshot: HouseholdSnapshot) -> str:
    local = parse(value).astimezone(household_zone(snapshot))
    return local.strftime("%-I:%M %p") if os.name != "nt" else local.strftime("%#I:%M %p")


def _match(items: list, name: str | None, key) -> Any:
    if not name:
        return None
    wanted = name.strip().casefold()
    exact = [item for item in items if key(item).casefold() == wanted or getattr(item, "id", None) == name]
    if exact:
        return exact[0]
    partial = [item for item in items if wanted in key(item).casefold() or key(item).casefold() in wanted]
    return partial[0] if len(partial) == 1 else None


def household_today(snapshot: HouseholdSnapshot) -> date:
    return demo_now().astimezone(household_zone(snapshot)).date()


def events_on(snapshot: HouseholdSnapshot, day: date) -> list:
    zone = household_zone(snapshot)
    return sorted((event for event in snapshot.events if parse(event.startAt).astimezone(zone).date() == day),
                  key=lambda event: parse(event.startAt))


def describe_event(snapshot: HouseholdSnapshot, event) -> dict[str, Any]:
    return {
        "id": event.id, "title": event.title, "startAt": event.startAt, "endAt": event.endAt,
        "time": "all day" if event.allDay else clock_text(event.startAt, snapshot),
        "who": [member_name(snapshot, item) for item in event.memberIds],
        "responsible": member_name(snapshot, event.responsibleMemberId) if event.responsibleMemberId else None,
        # What the responsible person does, so a drop-off is never read out as "picking up".
        "responsibleFor": RESPONSIBILITY_VERB.get(event.responsibilityType or "pickup") if event.responsibleMemberId else None,
        "location": event.location,
    }


RESPONSIBILITY_VERB = {"pickup": "picking up", "dropoff": "dropping off", "drive": "driving"}


def event_sentence(snapshot: HouseholdSnapshot, event) -> str:
    who = ", ".join(member_name(snapshot, item) for item in event.memberIds[:3])
    extra = (f", {member_name(snapshot, event.responsibleMemberId)} "
             f"{RESPONSIBILITY_VERB.get(event.responsibilityType or 'pickup')}") if event.responsibleMemberId else ""
    time_text = "all day" if event.allDay else f"at {clock_text(event.startAt, snapshot)}"
    return f"{event.title} {time_text} for {who}{extra}"


# MCP Apps: hosts that support the UI extension show get_today / get_week results as a Hometide card.
TODAY_CARD_URI = "ui://hometide/today.html"
MCP_APP_MIME = "text/html;profile=mcp-app"
CARD_META = {"ui": {"resourceUri": TODAY_CARD_URI}, "ui/resourceUri": TODAY_CARD_URI}


def today_card_html() -> str:
    from pathlib import Path

    return (Path(__file__).parent / "mcp_apps" / "today.html").read_text(encoding="utf-8")


# MCP server ---------------------------------------------------------------------------------------

class VoiceServer:
    def __init__(self, service: HouseholdService, gateway: VoiceGateway, *, public_url: str,
                 authorization_server: str, allowed_origins: list[str], tv_commands: TVCommandBus | None = None,
                 weather: Callable[[float, float, str], Awaitable[dict[str, Any]]] | None = None,
                 rhythm: Any = None) -> None:
        self.service = service
        self.rhythm = rhythm
        self.tv_commands = tv_commands or TVCommandBus()
        self.weather = weather
        self.gateway = gateway
        self.public_url = public_url.rstrip("/")
        self.authorization_server = authorization_server
        self.allowed_origins = set(allowed_origins)
        self.manager: StreamableHTTPSessionManager | None = None
        self.mcp = FastMCP(
            name="Hometide",
            instructions=(
                "Hometide is a family's shared calendar, chores, and rewards on their TV. Use the read tools to "
                "answer schedule questions briefly. Use show_on_tv when someone asks to open or show something on "
                "the TV, get_weather for the weather at home, and get_learned_routines for the family's usual routines "
                "that Hometide has learned. To change anything, use a propose_ tool: it "
                "creates a request that a family member confirms on the TV or phone. Nothing changes until they "
                "confirm. Say that."
            ),
            stateless_http=True, json_response=True,
        )
        self._register_tools()
        verifier = FamilyTokenVerifier(gateway)
        protected = RequireAuthMiddleware(self._handle, [SCOPE], self.metadata_url)
        self._app = AuthenticationMiddleware(AuthContextMiddleware(protected), backend=BearerAuthBackend(verifier))

    @property
    def metadata_url(self):
        from pydantic import AnyHttpUrl

        return AnyHttpUrl(f"{self.public_url}/.well-known/oauth-protected-resource/mcp")

    def protected_resource_metadata(self) -> dict[str, Any]:
        return {"resource": f"{self.public_url}/mcp", "authorization_servers": [self.authorization_server],
                "scopes_supported": [SCOPE], "bearer_methods_supported": ["header"],
                "resource_name": "Hometide household"}

    @asynccontextmanager
    async def lifespan(self) -> AsyncIterator[None]:
        self.manager = StreamableHTTPSessionManager(app=self.mcp._mcp_server, json_response=True, stateless=True)
        async with self.manager.run():
            yield
        self.manager = None

    async def _handle(self, scope, receive, send) -> None:
        if self.manager is None:
            await JSONResponse({"error": "MCP server is starting"}, status_code=503)(scope, receive, send)
            return
        await self.manager.handle_request(scope, receive, send)

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            headers = {key.decode("latin-1").lower(): value.decode("latin-1") for key, value in scope.get("headers", [])}
            origin = headers.get("origin")
            # Browsers send Origin; reject cross-site pages (DNS rebinding). Server-to-server clients omit it.
            if origin and origin not in self.allowed_origins:
                await JSONResponse({"error": "Origin not allowed"}, status_code=403)(scope, receive, send)
                return
        await self._app(scope, receive, send)

    # Identity and household access -----------------------------------------------------------
    def current(self) -> VoiceIdentity:
        identity = _in_process_identity.get()
        if identity is None:
            token = get_access_token()
            identity = self.gateway.identity(token.token) if token else None
        if identity is None:
            raise ToolError("This voice connection is no longer authorized. Reconnect it in Hometide Settings.")
        if not self.gateway.allow(identity):
            raise ToolError("That's a lot of requests at once. Please wait a minute and try again.")
        return identity

    def snapshot(self, identity: VoiceIdentity) -> HouseholdSnapshot:
        return self.service.snapshot(identity.owner)

    def log(self, identity: VoiceIdentity, tool: str, outcome: str) -> None:
        household = hashlib.sha256(identity.owner.encode()).hexdigest()[:10]
        logger.info("voice tool=%s household=%s outcome=%s", tool, household, outcome)

    def propose(self, identity: VoiceIdentity, kind: str, payload: dict, summary: str) -> dict[str, Any]:
        actor = Actor("voice", identity.owner, member_id=identity.member_id)
        proposal_id = uuid4().hex
        try:
            snapshot = self.service.edit(actor, "proposalCreate", {
                "id": proposal_id, "kind": kind, "payload": payload, "summary": summary[:240], "source": "voice",
                "requestedBy": f"voice:{identity.member_id}" if identity.member_id else "voice:parent",
            }, server=True)
        except DomainError as error:
            if error.code == "PROPOSAL_EXISTS":
                proposal_id, snapshot = error.message, self.snapshot(identity)
            else:
                self.log(identity, kind, error.code)
                raise ToolError(error.message) from error
        proposal = next(item for item in snapshot.proposals if item.id == proposal_id)
        self.log(identity, kind, "proposed")
        return {
            "speech": f"Okay. I've asked the family to confirm: {proposal.summary} Confirm it on the TV or the Hometide app.",
            "proposalId": proposal.id, "status": proposal.status, "summary": proposal.summary,
            "expiresAt": proposal.expiresAt,
        }

    def _register_tools(self) -> None:
        mcp = self.mcp

        @mcp.tool(description="Show a screen on the family's TV: home, calendar, chores, meals, lists, photos, family night, "
                               "a movement break, approvals, settings, or the wall calendar. For the calendar, `day` can "
                               "be today, tomorrow, or a weekday. This only changes what the TV shows.")
        def show_on_tv(screen: str, day: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            key = resolve_screen(screen)
            if key is None:
                raise ToolError("I can show the calendar, chores, meals, lists, photos, family night, a movement break, "
                                "or the wall calendar.")
            route, spoken = TV_SCREENS[key]
            target = spoken_date(day, household_today(snapshot)).isoformat() if day and route == "Calendar" else None
            self.tv_commands.push(identity.owner, {"screen": route, "day": target, "label": spoken})
            self.log(identity, "show_on_tv", "ok")
            spoken_day = (day or "").strip().lower()
            when = f" for {spoken_day.capitalize() if spoken_day in WEEKDAYS else spoken_day}" if target else ""
            return {"speech": f"Showing {spoken}{when} on the TV.", "screen": route, "day": target}

        @mcp.tool(description="Today's weather where the family lives: right now, the high and low, and the forecast.")
        async def get_weather() -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            place = snapshot.location
            if place is None or self.weather is None:
                raise ToolError("Set your home location in the Hometide app first, under Settings, Weather on the TV.")
            try:
                forecast = await self.weather(place.latitude, place.longitude, place.label)
            except Exception as error:  # Unsupported places and outages get the same short answer.
                raise ToolError("I couldn't get the weather right now. The forecast covers US addresses only.") from error
            self.log(identity, "get_weather", "ok")
            condition = str(forecast.get("condition") or "").strip().lower()
            speech = (f"Right now in {forecast.get('location') or place.label} it's {forecast.get('temperatureF')} degrees"
                      f"{' and ' + condition if condition else ''}. Today's high is {forecast.get('highF')} and the low is "
                      f"{forecast.get('lowF')}.")
            return {"speech": speech, **{key: forecast.get(key) for key in ("location", "temperatureF", "highF", "lowF", "condition", "summary")}}

        @mcp.resource(TODAY_CARD_URI, name="hometide-today", title="Hometide today", mime_type=MCP_APP_MIME,
                      description="A card that shows the day's (or week's) events from get_today and get_week.")
        def today_card() -> str:
            return today_card_html()

        @mcp.tool(description="What's happening today (or on a given day): events, conflicts, sports reminders, and family night.",
                  meta=CARD_META)
        def get_today(day: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            target = spoken_date(day, household_today(snapshot))
            events = events_on(snapshot, target)
            conflicts = [item for item in detect_conflicts(snapshot, demo_now()) if any(e.id in item.eventIds for e in events)]
            reminders = sports_reminders(snapshot, demo_now()) if target == household_today(snapshot) else []
            night = next((poll for poll in snapshot.familyNightPolls if poll.id == target.isoformat()), None)
            when = "today" if target == household_today(snapshot) else f"on {target.strftime('%A')}"
            parts = [f"Nothing on the calendar {when}" if not events
                     else f"{len(events)} {'thing' if len(events) == 1 else 'things'} on the calendar {when}"]
            if events:
                parts.append("; ".join(event_sentence(snapshot, event) for event in events[:5]))
            if conflicts:
                parts.append(f"Heads up: {conflicts[0].message}")
            if reminders:
                parts.append(reminders[0]["text"])
            if night and night.winnerSuggestionId:
                winner = next(item.title for item in night.suggestions if item.id == night.winnerSuggestionId)
                parts.append(f"Family night is {winner}")
            self.log(identity, "get_today", "ok")
            return {"speech": ". ".join(parts) + ".", "date": target.isoformat(),
                    "events": [describe_event(snapshot, event) for event in events],
                    "conflicts": [item.message for item in conflicts], "reminders": reminders}

        @mcp.tool(description="The family's week: events per day for seven days starting today or a given day.",
                  meta=CARD_META)
        def get_week(start: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            first = spoken_date(start, household_today(snapshot))
            days = []
            for offset in range(7):
                day = first + timedelta(days=offset)
                events = events_on(snapshot, day)
                days.append({"date": day.isoformat(), "weekday": WEEKDAYS[day.weekday()].title(),
                             "events": [describe_event(snapshot, event) for event in events]})
            busy = [f"{item['weekday']}: {len(item['events'])}" for item in days if item["events"]]
            self.log(identity, "get_week", "ok")
            return {"speech": ("This week: " + ", ".join(busy) + ".") if busy else "Nothing is scheduled this week.",
                    "days": days}

        @mcp.tool(description="Schedule conflicts the family should resolve, like double-booked drivers or tight travel time.")
        def list_conflicts() -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            conflicts = detect_conflicts(snapshot, demo_now())
            self.log(identity, "list_conflicts", "ok")
            return {"speech": " ".join(item.message for item in conflicts[:3]) or "No conflicts. Everything lines up.",
                    "conflicts": [{"id": item.id, "type": item.type, "title": item.title, "message": item.message,
                                   "eventIds": item.eventIds,
                                   "suggestedMember": member_name(snapshot, item.suggestedMemberId) if item.suggestedMemberId else None}
                                  for item in conflicts]}

        @mcp.tool(description="Routines Hometide has learned about this family and the family confirmed, like who usually "
                               "does a pickup, plus what it remembers from earlier sessions (Amazon Bedrock AgentCore "
                               "Memory). `question` narrows the recall, for example 'who picks up Emma on Tuesdays'.")
        def get_learned_routines(question: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            if self.rhythm is None:
                from .rhythm import learned_routines

                found = {"routines": [item["routine"] for item in learned_routines(snapshot)], "remembered": [], "memory": "local"}
            else:
                found = self.rhythm.recall(identity.owner, snapshot, question or "")
            self.log(identity, "get_learned_routines", "ok")
            facts = found["routines"] + found["remembered"]
            speech = ("Here's what Hometide has learned: " + " ".join(facts[:3])) if facts else \
                "Hometide hasn't learned any routines yet. When the same fix keeps coming up, it will suggest one on the TV."
            return {"speech": speech, **found}

        @mcp.tool(description="One family member's schedule for a day.")
        def get_member_schedule(member: str, day: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            person = _match(snapshot.members, member, lambda item: item.name)
            if person is None:
                raise ToolError(f"I couldn't find {member} in this family.")
            target = spoken_date(day, household_today(snapshot))
            events = [event for event in events_on(snapshot, target)
                      if person.id in event.memberIds or event.responsibleMemberId == person.id]
            self.log(identity, "get_member_schedule", "ok")
            return {"speech": f"{person.name} has " + ("; ".join(event_sentence(snapshot, e) for e in events) if events else "nothing scheduled") + ".",
                    "member": person.name, "date": target.isoformat(), "events": [describe_event(snapshot, e) for e in events]}

        @mcp.tool(description="Chores that are still to do, optionally for one family member.")
        def get_chores(member: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            person = _match(snapshot.members, member, lambda item: item.name) if member else None
            if identity.is_child:
                person = next((item for item in snapshot.members if item.id == identity.member_id), None)
            chores = [chore for chore in snapshot.chores if chore.status == "pending"
                      and (person is None or chore.assignedToMemberId == person.id)]
            self.log(identity, "get_chores", "ok")
            names = ", ".join(chore.title for chore in chores[:6])
            return {"speech": f"{len(chores)} chores to do" + (f": {names}." if names else "."),
                    "chores": [{"id": c.id, "title": c.title, "assignedTo": member_name(snapshot, c.assignedToMemberId) if c.assignedToMemberId else None,
                                "stars": c.points or 1, "needsPhoto": c.verifyWithPhoto} for c in chores]}

        @mcp.tool(description="Star balance for a child, or for every child.")
        def get_reward_balance(member: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            children = [item for item in snapshot.members if item.role == "child"]
            if identity.is_child:
                children = [item for item in children if item.id == identity.member_id]
            elif member:
                person = _match(children, member, lambda item: item.name)
                if person is None:
                    raise ToolError(f"I couldn't find a child named {member}.")
                children = [person]
            balances = {child.name: sum(t.delta for t in snapshot.starTransactions if t.memberId == child.id) for child in children}
            self.log(identity, "get_reward_balance", "ok")
            return {"speech": "; ".join(f"{name} has {stars} stars" for name, stars in balances.items()) + "." if balances else "No child profiles yet.",
                    "balances": balances}

        def parent_only(identity: VoiceIdentity) -> None:
            if identity.is_child:
                raise ToolError("Only a parent's voice connection can ask for that. You can mark your own chores done.")

        @mcp.tool(description="Propose a different adult for a pickup or drive. `event` can be the user's words, like 'Emma pickup' "
                               "or 'soccer drive'; the tool finds today's (or the given day's) matching event. Creates a request to "
                               "confirm on the TV or phone; changes nothing yet.")
        def propose_pickup_swap(event: str, to_member: str, day: str | None = None) -> dict[str, Any]:
            identity = self.current()
            parent_only(identity)
            snapshot = self.snapshot(identity)

            def find(on: date):
                candidates = [item for item in events_on(snapshot, on) if item.responsibleMemberId] \
                    or [item for item in snapshot.events if item.responsibleMemberId]
                return _match(candidates, event, lambda item: item.title)

            when = spoken_date(day, household_today(snapshot))
            target = find(when)
            if target is not None and day and parse(target.endAt) <= demo_now():
                # "Tuesday's pickup" said on Tuesday evening means next Tuesday's, not the one that already happened.
                target = find(when + timedelta(days=7)) or target
            if target is None:
                raise ToolError(f"I couldn't find a pickup or drive called {event}.")
            person = _match(snapshot.members, to_member, lambda item: item.name)
            if person is None:
                raise ToolError(f"I couldn't find {to_member} in this family.")
            summary = f"{person.name} takes {target.title} instead of {member_name(snapshot, target.responsibleMemberId)}."
            return self.propose(identity, "pickup_swap", {"eventId": target.id, "fromMemberId": target.responsibleMemberId,
                                                           "toMemberId": person.id}, summary)

        @mcp.tool(description="Propose a new calendar event. Creates a request to confirm on the TV or phone; nothing is added yet.")
        def propose_event(title: str, day: str, start_time: str, end_time: str | None = None,
                          members: list[str] | None = None, location: str | None = None) -> dict[str, Any]:
            identity = self.current()
            parent_only(identity)
            snapshot = self.snapshot(identity)
            target = spoken_date(day, household_today(snapshot))
            start = spoken_time(start_time)
            if start is None:
                raise ToolError("What time does it start?")
            start_at = local_iso(snapshot, target.isoformat(), start)
            end = spoken_time(end_time) if end_time else None
            end_at = local_iso(snapshot, target.isoformat(), end) if end else (parse(start_at) + timedelta(hours=1)).isoformat()
            people = [person for name in (members or []) if (person := _match(snapshot.members, name, lambda item: item.name))]
            summary = f"Add {title.strip()[:80]} on {WEEKDAYS[target.weekday()].title()} at {clock_text(start_at, snapshot)}" + \
                (f" for {', '.join(p.name for p in people)}." if people else ".")
            return self.propose(identity, "event", {"title": title.strip()[:120], "startAt": start_at, "endAt": end_at,
                                                    "memberIds": [p.id for p in people], "location": location}, summary)

        @mcp.tool(description="Propose moving an existing event to a new time. Creates a request to confirm on the TV or phone.")
        def propose_reschedule(event: str, start_time: str, day: str | None = None) -> dict[str, Any]:
            identity = self.current()
            parent_only(identity)
            snapshot = self.snapshot(identity)
            target = _match(snapshot.events, event, lambda item: item.title)
            if target is None:
                raise ToolError(f"I couldn't find an event called {event}.")
            start = spoken_time(start_time)
            if start is None:
                raise ToolError("What time should it move to?")
            current_day = parse(target.startAt).astimezone(household_zone(snapshot)).date()
            new_day = spoken_date(day, household_today(snapshot)) if day else current_day
            start_at = local_iso(snapshot, new_day.isoformat(), start)
            duration = parse(target.endAt) - parse(target.startAt)
            end_at = (parse(start_at) + duration).isoformat()
            summary = f"Move {target.title} to {WEEKDAYS[new_day.weekday()].title()} at {clock_text(start_at, snapshot)}."
            return self.propose(identity, "reschedule", {"eventId": target.id, "fromStartAt": target.startAt,
                                                         "startAt": start_at, "endAt": end_at}, summary)

        @mcp.tool(description="Tell the family a chore is finished. Creates a request a family member confirms; stars follow the family's approval rules.")
        def mark_chore_done_request(chore: str, member: str | None = None) -> dict[str, Any]:
            identity = self.current()
            snapshot = self.snapshot(identity)
            pending = [item for item in snapshot.chores if item.status == "pending"]
            if identity.is_child:
                pending = [item for item in pending if item.assignedToMemberId == identity.member_id]
            elif member:
                person = _match(snapshot.members, member, lambda item: item.name)
                pending = [item for item in pending if person and item.assignedToMemberId == person.id] or pending
            target = _match(pending, chore, lambda item: item.title)
            if target is None:
                raise ToolError(f"I couldn't find an unfinished chore called {chore}.")
            if target.verifyWithPhoto:
                raise ToolError(f"{target.title} needs a photo. Take one in the Hometide app so a parent can approve it.")
            who = member_name(snapshot, target.assignedToMemberId) if target.assignedToMemberId else "Someone"
            return self.propose(identity, "chore_done", {"choreId": target.id, "memberId": target.assignedToMemberId},
                                f"{who} finished {target.title}.")

        @mcp.resource("familyos://family-night", description="This week's family night vote and the rotating picker.")
        def family_night() -> str:
            identity = self.current()
            snapshot = self.snapshot(identity)
            polls = sorted(snapshot.familyNightPolls, key=lambda item: item.id)[-1:]
            data = {"picker": member_name(snapshot, current_picker(snapshot)) if current_picker(snapshot) else None,
                    "polls": [{"date": p.id, "status": p.status, "votes": tally(p),
                               "suggestions": {s.id: s.title for s in p.suggestions}} for p in polls]}
            return json.dumps(data)

    # Simulated Alexa+ ------------------------------------------------------------------------------
    async def simulate(self, identity: VoiceIdentity, utterance: str,
                       may_use_ai: Callable[[], bool] | None = None) -> dict[str, Any]:
        """The rules-permitted simulated Alexa+ experience: Bedrock (or rules) driving this MCP server's tools.

        Clear change commands ("swap Emma pickup to Alex") run through the rules first, so the demo is predictable
        and free. Questions, and commands the rules couldn't resolve, go to Bedrock when it's on and in budget.
        ``may_use_ai`` is asked only right before a Bedrock call.
        """
        token = _in_process_identity.set(identity)
        try:
            return await self.converse(utterance, LocalTools(self), may_use_ai)
        finally:
            _in_process_identity.reset(token)

    async def converse(self, utterance: str, tools: "ToolAccess", may_use_ai: Callable[[], bool] | None = None,
                       ai_timeout: float = 40) -> dict[str, Any]:
        """One spoken request, the way an Alexa+ orchestrator would handle it, with ``tools`` as the MCP client."""
        plan = self._rules_plan(utterance)
        ruled = None
        if plan[0][0] in COMMAND_TOOLS:
            ruled = await self._run_rules(plan, tools)
            if not ruled.get("unresolved"):
                return ruled
        if bedrock_enabled() and (may_use_ai is None or may_use_ai()):
            try:
                answered = await asyncio.wait_for(self._simulate_bedrock(utterance, tools=tools), timeout=ai_timeout)
                if answered.get("reply"):
                    return answered
                logger.warning("Voice: Bedrock gave no spoken answer, using rules")
            except (ToolError, DomainError):
                raise
            except Exception:
                logger.warning("Voice: Bedrock unavailable, using rules")
        return ruled or await self._run_rules(plan, tools)

    async def _call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = await self.mcp.call_tool(name, arguments)
        if isinstance(result, tuple):  # (content blocks, structured output)
            return result[1] if isinstance(result[1], dict) else {"speech": str(result[0])}
        if isinstance(result, dict):
            return result
        text = next((getattr(block, "text", "") for block in result), "")
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return {"speech": text}

    async def _simulate_rules(self, utterance: str) -> dict[str, Any]:
        return await self._run_rules(self._rules_plan(utterance), LocalTools(self))

    def _rules_plan(self, utterance: str) -> list[tuple[str, dict]]:
        text = utterance.strip()
        low = text.lower()
        calls: list[tuple[str, dict]] = []
        shown = re.search(r"\b(?:open|show|go to|switch to|bring up|pull up|display|put)\s+(?:me\s+)?(.+?)(?:\s+on the tv)?[.!?]*$", low)
        if any(word in low for word in ("weather", "temperature", "forecast", "rain")):
            calls.append(("get_weather", {}))
        elif shown and (screen := resolve_screen(shown.group(1))):
            day = next((word for word in ["today", "tomorrow", *WEEKDAYS] if re.search(rf"\b{word}\b", shown.group(1))), None)
            calls.append(("show_on_tv", {"screen": screen, **({"day": day} if day and screen == "calendar" else {})}))
        elif m := re.search(r"(?:swap|switch|change|have|let)\s+(?:the\s+)?(.+?)\s+(?:pickup|pick up|drive|driving)?\s*(?:to|so)\s+(\w+)", low):
            event = m.group(1).replace("pickup", "").strip()
            day = next((word for word in ["today", "tomorrow", *WEEKDAYS] if re.search(rf"\b{word}(?:'s)?\b", event)), None)
            if day:  # "Swap Tuesday's Emma pickup to Alex"
                event = re.sub(rf"\b(?:on\s+)?(?:next\s+)?{day}(?:'s)?\b", " ", event).strip() or event
            calls.append(("propose_pickup_swap", {"event": " ".join(event.split()), "to_member": m.group(2),
                                                  **({"day": day} if day else {})}))
        elif m := re.search(r"(?:move|reschedule)\s+(.+?)\s+to\s+(.+)", low):
            day = next((word for word in ["today", "tomorrow", *WEEKDAYS] if word in m.group(2)), None)
            calls.append(("propose_reschedule", {"event": m.group(1), "start_time": m.group(2), **({"day": day} if day else {})}))
        elif m := re.search(r"(?:add|schedule|put)\s+(.+?)\s+(?:on\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(.+)", low):
            calls.append(("propose_event", {"title": m.group(1).title(), "day": m.group(2), "start_time": m.group(3)}))
        elif m := re.search(r"(?:i|we|(\w+))\s+(?:finished|did|completed|done with)\s+(?:the\s+|my\s+)?(.+)", low):
            member = m.group(1) if m.group(1) not in (None, "i", "we") else None
            calls.append(("mark_chore_done_request", {"chore": m.group(2).rstrip(".!"), **({"member": member} if member else {})}))
        elif any(word in low for word in ("learned", "learnt", "usually", "routine", "remember")):
            calls.append(("get_learned_routines", {"question": text}))
        elif "star" in low or "reward" in low:
            name = re.search(r"(?:does|has)\s+(\w+)", low)
            calls.append(("get_reward_balance", {"member": name.group(1)} if name and name.group(1) not in ("everyone",) else {}))
        elif "chore" in low:
            calls.append(("get_chores", {}))
        elif "conflict" in low or "problem" in low:
            calls.append(("list_conflicts", {}))
        elif "week" in low:
            calls.append(("get_week", {}))
        elif m := re.search(r"what(?:'s| is| does)\s+(\w+)(?:'s)?\s+(?:doing|schedule|have)", low):
            calls.append(("get_member_schedule", {"member": m.group(1), "day": "tomorrow" if "tomorrow" in low else "today"}))
        else:
            calls.append(("get_today", {"day": "tomorrow" if "tomorrow" in low else "today"}))
        return calls

    async def _run_rules(self, calls: list[tuple[str, dict]], tools: "ToolAccess") -> dict[str, Any]:
        outputs = []
        unresolved = False
        for name, arguments in calls:
            try:
                outputs.append((name, await tools.call(name, arguments)))
            except ToolError as error:
                unresolved = True
                outputs.append((name, {"speech": re.sub(r"^Error executing tool \w+: ", "", str(error))}))
        reply = " ".join(str(output.get("speech", "")) for _, output in outputs)
        return {"mode": "rules", "reply": reply, "toolCalls": [name for name, _ in outputs],
                "proposalIds": [o["proposalId"] for _, o in outputs if "proposalId" in o], "unresolved": unresolved}

    async def _simulate_bedrock(self, utterance: str, tools: "ToolAccess | None" = None) -> dict[str, Any]:
        """Answer with a Strands agent on Amazon Bedrock, using this MCP server's tools (see ``agent.py``)."""
        from . import agent

        tools = tools or LocalTools(self)
        identity = _in_process_identity.get()

        async def call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
            # Strands may run tools in its own task; keep the caller's household identity attached.
            token = _in_process_identity.set(identity) if identity is not None else None
            try:
                return await tools.call(name, arguments)
            finally:
                if token is not None:
                    _in_process_identity.reset(token)

        return await agent.answer(utterance, await tools.list_tools(), call)


class ToolAccess:
    """How a voice turn reaches the Hometide tools: in-process (the simulator) or over MCP (the Alexa skill)."""

    async def list_tools(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """The tool's structured result. Raises ToolError with a speakable message when the tool refuses."""
        raise NotImplementedError


class LocalTools(ToolAccess):
    def __init__(self, server: VoiceServer) -> None:
        self.server = server

    async def list_tools(self) -> list[dict[str, Any]]:
        return [{"name": tool.name, "description": tool.description or tool.name, "inputSchema": tool.inputSchema}
                for tool in await self.server.mcp.list_tools()]

    async def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return await self.server._call(name, arguments)

