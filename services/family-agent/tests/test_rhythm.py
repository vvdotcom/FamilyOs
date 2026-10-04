"""Hometide's rhythm: routines learned from the family's own fixes, offered once, remembered across sessions."""
from __future__ import annotations

import asyncio
from datetime import datetime

import pytest

from conftest import bearer, edit, household, pair_tv, parent_token

TUESDAY = "2026-09-22"  # FAMILYOS_DEMO_NOW in conftest is Tuesday 2026-09-22, 2:30 pm in Phoenix.


class FakeAgentCore:
    """Records AgentCore Memory calls; answers recall like the service would after extraction."""

    def __init__(self) -> None:
        self.events: list[dict] = []
        self.searches: list[dict] = []

    def create_event(self, **request):
        self.events.append(request)
        return {"event": {"eventId": str(len(self.events))}}

    def retrieve_memory_records(self, **request):
        self.searches.append(request)
        return {"memoryRecordSummaries": [{"content": {"text": "Alex picks up Emma on Tuesdays and Thursdays."}}]}

    def list_events(self, **request):
        return {"events": []}


@pytest.fixture
def memory(api):
    from app.rhythm import AgentCoreMemory

    fake = FakeAgentCore()
    api.main.rhythm.memory = AgentCoreMemory("mem-test", "us-west-2", client=fake, background=False)
    return fake


def weekly(api, token, event_id, title, category, start, end, members, **extra):
    reply = edit(api, token, "event", {"id": event_id, "familyId": household(api, token)["family"]["id"], "title": title,
                                       "category": category, "startAt": f"{TUESDAY}T{start}:00-07:00",
                                       "endAt": f"{TUESDAY}T{end}:00-07:00", "ownerMemberId": "alex",
                                       "memberIds": members, "recurrence": "weekly", **extra})
    assert reply.status_code == 200, reply.text


def repeating_clash(api, token):
    """Jordan's weekly team meeting overlaps Jordan's weekly gym pickup, every Tuesday for 12 weeks."""
    weekly(api, token, "gym-pickup", "Gym pickup", "pickup", "15:15", "15:35", ["emma"],
           responsibleMemberId="jordan", responsibilityType="pickup")
    weekly(api, token, "standup", "Team meeting", "appointment", "14:45", "16:00", ["jordan"])


def swap_by_voice(api, token):
    reply = api.client.post("/v1/voice/simulate", json={"utterance": "Swap gym pickup to Alex"}, headers=bearer(token))
    assert reply.status_code == 200, reply.text
    proposal_id = reply.json()["data"]["proposalIds"][0]
    decided = api.client.post(f"/v1/proposals/{proposal_id}/decision", json={"action": "confirm"}, headers=bearer(token))
    assert decided.status_code == 200, decided.text
    return decided.json()["data"]["household"]


def routines(snapshot, status="pending"):
    return [item for item in snapshot["proposals"] if item["kind"] == "routine" and item["status"] == status]


def test_a_repeating_clash_is_not_raised_until_the_family_fixes_one_by_hand(api):
    parent = parent_token(api)
    repeating_clash(api, parent)
    assert routines(household(api, parent)) == []
    patterns = api.client.get("/v1/rhythm", headers=bearer(parent)).json()["data"]["patterns"]
    assert patterns == [] or all(item["kind"] != "recurring_conflict" for item in patterns)


def test_fixing_one_by_hand_makes_hometide_offer_the_routine(api, memory):
    parent = parent_token(api)
    repeating_clash(api, parent)
    after = swap_by_voice(api, parent)
    [offer] = routines(after)
    assert offer["source"] == "hometide" and offer["requestedBy"] == "hometide"
    assert offer["summary"] == "Make Alex the usual Gym pickup on Tuesdays?"
    assert "Jordan's Team meeting overlaps it every week" in offer["payload"]["detail"]
    assert offer["payload"]["pattern"] == "recurring_conflict" and offer["payload"]["toMemberId"] == "alex"
    assert len(offer["payload"]["eventIds"]) == 11  # The 11 later Tuesdays; today's was already swapped.
    # What it noticed went to AgentCore Memory under a hashed household id, never the account id.
    noticed = memory.events[-1]
    assert noticed["memoryId"] == "mem-test" and noticed["actorId"].startswith("household-")
    assert "Hometide noticed" in noticed["payload"][0]["conversational"]["content"]["text"]


def test_confirming_the_routine_updates_every_later_occurrence_and_is_remembered(api, memory):
    parent = parent_token(api)
    repeating_clash(api, parent)
    [offer] = routines(swap_by_voice(api, parent))
    reply = api.client.post(f"/v1/proposals/{offer['id']}/decision", json={"action": "confirm"}, headers=bearer(parent))
    assert reply.status_code == 200, reply.text
    data = reply.json()["data"]
    assert data["proposal"]["status"] == "confirmed" and "11 events updated" in data["proposal"]["resultMessage"]
    pickups = [item for item in data["household"]["events"] if item["title"] == "Gym pickup"]
    assert len(pickups) == 12 and all(item["responsibleMemberId"] == "alex" for item in pickups)
    assert memory.events[-1]["payload"][0]["conversational"]["role"] == "USER"
    assert "The family decided" in memory.events[-1]["payload"][0]["conversational"]["content"]["text"]
    learned = api.client.get("/v1/rhythm", headers=bearer(parent)).json()["data"]["learned"]
    assert learned and "usual Gym pickup pickup" not in learned[0]["routine"] and "Alex" in learned[0]["routine"]


def test_no_is_final_for_that_pattern(api, memory):
    parent = parent_token(api)
    repeating_clash(api, parent)
    [offer] = routines(swap_by_voice(api, parent))
    assert api.client.post(f"/v1/proposals/{offer['id']}/decision", json={"action": "reject"},
                           headers=bearer(parent)).status_code == 200
    assert "said no" in memory.events[-1]["payload"][0]["conversational"]["content"]["text"]
    # Later reads (and later fixes) never raise the same routine again.
    api.main.rhythm._checked.clear()
    assert routines(household(api, parent)) == []


def test_the_tv_needs_the_parent_code_to_accept_a_routine(api):
    parent = parent_token(api)
    repeating_clash(api, parent)
    [offer] = routines(swap_by_voice(api, parent))
    tv = pair_tv(api, parent)
    blocked = api.client.post(f"/v1/proposals/{offer['id']}/decision", json={"action": "confirm"}, headers=bearer(tv))
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "PARENT_CODE_REQUIRED"


def test_voice_recalls_what_hometide_learned(api, memory):
    parent = parent_token(api)
    repeating_clash(api, parent)
    [offer] = routines(swap_by_voice(api, parent))
    api.client.post(f"/v1/proposals/{offer['id']}/decision", json={"action": "confirm"}, headers=bearer(parent))
    reply = api.client.post("/v1/voice/simulate", json={"utterance": "What has Hometide learned about us?"},
                            headers=bearer(parent)).json()["data"]
    assert reply["toolCalls"] == ["get_learned_routines"]
    assert "Alex" in reply["reply"] and "Tuesdays" in reply["reply"]
    assert memory.searches and memory.searches[-1]["namespace"].startswith("/households/household-")


def test_manual_repeats_suggest_a_weekly_event():
    from app.domain import DemoRepository
    from app.models import CalendarEvent
    from app.rhythm import find_patterns

    snapshot = DemoRepository().snapshot()
    for week in range(3):
        day = 8 + 7 * week  # Tuesdays 8, 15, 22 September.
        snapshot.events.append(CalendarEvent(
            id=f"swim-{week}", familyId=snapshot.family.id, title="Swim lesson", category="sports",
            startAt=f"2026-09-{day:02d}T16:00:00-07:00", endAt=f"2026-09-{day:02d}T16:45:00-07:00",
            ownerMemberId="alex", memberIds=["leo"], source="manual"))
    found = [item for item in find_patterns(snapshot, datetime.fromisoformat("2026-09-22T14:30:00-07:00"))
             if item.kind == "make_weekly"]
    assert found and found[0].summary == "Make Swim lesson a weekly event?"
    assert found[0].payload["eventIds"] == ["swim-0", "swim-1", "swim-2"]


def test_memory_failures_never_break_the_family(api):
    from app.rhythm import AgentCoreMemory

    class Broken:
        def create_event(self, **_):
            raise RuntimeError("AgentCore is down")

        def retrieve_memory_records(self, **_):
            raise RuntimeError("AgentCore is down")

    api.main.rhythm.memory = AgentCoreMemory("mem-test", "us-west-2", client=Broken(), background=False)
    parent = parent_token(api)
    repeating_clash(api, parent)
    [offer] = routines(swap_by_voice(api, parent))
    assert api.client.post(f"/v1/proposals/{offer['id']}/decision", json={"action": "confirm"},
                           headers=bearer(parent)).status_code == 200
    assert api.main.rhythm.memory.recall("someone", "anything") == []


def test_the_strands_agent_runs_hometide_tools_and_keeps_the_household(api, monkeypatch):
    """The Strands agent gets the MCP tool list, and its tool calls run against the caller's household."""
    pytest.importorskip("strands")
    from app import agent as hometide_agent
    from app.voice import LocalTools, VoiceIdentity, _in_process_identity

    seen = {}

    class FakeAgent:
        def __init__(self, tools):
            self.tools = tools

        async def invoke_async(self, prompt):
            tool = next(item for item in self.tools if item.tool_name == "get_today")
            seen["specs"] = sorted(item.tool_name for item in self.tools)
            result = None
            async for event in tool.stream({"toolUseId": "t1", "name": "get_today", "input": {}}, {}):
                result = event
            seen["result"] = result

            class Result:
                message = {"content": [{"text": "<thinking>check</thinking>You have a busy day."}]}
            return Result()

    monkeypatch.setattr(hometide_agent, "build_agent", lambda tools: FakeAgent(tools))
    parent = parent_token(api)
    owner = api.main.auth_store.session(parent)["accountId"]
    server = api.main.voice_server
    token = _in_process_identity.set(VoiceIdentity(owner=owner, member_id=None, label="test", connection_id="t"))
    try:
        reply = asyncio.run(server._simulate_bedrock("What's on today?", LocalTools(server)))
    finally:
        _in_process_identity.reset(token)
    assert reply["engine"] == "strands" and reply["reply"] == "You have a busy day."
    assert reply["toolCalls"] == ["get_today"] and "get_learned_routines" in seen["specs"]


def test_questions_never_get_the_change_tools():
    from app.agent import asks_for_change

    assert not asks_for_change("Is anyone double booked this afternoon?")
    assert not asks_for_change("What's on today?")
    assert asks_for_change("Swap Emma's pickup to Alex")
    assert asks_for_change("Move soccer to 5")


def test_a_swap_can_name_the_day(api):
    parent = parent_token(api)
    repeating_clash(api, parent)
    reply = api.client.post("/v1/voice/simulate", json={"utterance": "Swap Tuesday's gym pickup to Alex"},
                            headers=bearer(parent)).json()["data"]
    assert reply["mode"] == "rules" and reply["proposalIds"], reply
    [proposal] = [item for item in household(api, parent)["proposals"] if item["id"] == reply["proposalIds"][0]]
    assert proposal["payload"]["eventId"] == "gym-pickup"  # Today is Tuesday 22 September: today's occurrence.
