"""Phase 12: Streamable HTTP MCP server, voice proposals, and the simulated Alexa+ client."""
from __future__ import annotations

import asyncio
import json

import pytest

from conftest import bearer, edit, household, pair_tv, parent_token

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def voice_token(api, parent: str, member_id: str | None = None) -> str:
    body = {"label": "Kitchen Alexa", **({"memberId": member_id} if member_id else {})}
    reply = api.client.post("/v1/voice/connections", json=body, headers=bearer(parent))
    assert reply.status_code == 200, reply.text
    assert reply.json()["data"]["mcpUrl"].endswith("/mcp")
    return reply.json()["data"]["token"]


def rpc(api, token: str | None, method: str, params: dict | None = None, request_id: int = 1, **extra_headers):
    headers = {**MCP_HEADERS, **({"Authorization": f"Bearer {token}"} if token else {}), **extra_headers}
    return api.client.post("/mcp", headers=headers, json={"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})


def call(api, token: str, tool: str, arguments: dict | None = None) -> dict:
    reply = rpc(api, token, "tools/call", {"name": tool, "arguments": arguments or {}},
                **{"MCP-Protocol-Version": "2025-11-25"})
    assert reply.status_code == 200, reply.text
    result = reply.json()["result"]
    if result.get("isError"):
        return {"error": result["content"][0]["text"]}
    return result.get("structuredContent") or json.loads(result["content"][0]["text"])


def test_mcp_negotiates_protocol_and_requires_authorization(api):
    parent = parent_token(api)
    token = voice_token(api, parent)
    unauthorized = rpc(api, None, "initialize")
    assert unauthorized.status_code == 401
    assert "resource_metadata" in unauthorized.headers.get("www-authenticate", "")
    assert rpc(api, "fos_voice_not-a-real-token", "tools/list").status_code == 401
    metadata = api.client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert metadata["resource"].endswith("/mcp") and metadata["scopes_supported"] == ["household"]
    init = rpc(api, token, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                                          "clientInfo": {"name": "test", "version": "1"}})
    assert init.status_code == 200, init.text
    assert init.json()["result"]["protocolVersion"] == "2025-11-25"
    assert init.json()["result"]["serverInfo"]["name"] == "FamilyOS"
    tools = {tool["name"] for tool in rpc(api, token, "tools/list", **{"MCP-Protocol-Version": "2025-11-25"}).json()["result"]["tools"]}
    assert tools == {"get_today", "get_week", "list_conflicts", "get_member_schedule", "get_chores", "get_reward_balance",
                     "propose_pickup_swap", "propose_event", "propose_reschedule", "mark_chore_done_request"}


def test_mcp_rejects_cross_site_browser_origins(api):
    token = voice_token(api, parent_token(api))
    assert rpc(api, token, "tools/list", Origin="https://evil.example").status_code == 403


def test_read_tools_return_speech_and_structured_data(api):
    token = voice_token(api, parent_token(api))
    today = call(api, token, "get_today")
    assert today["date"] == "2026-09-22" and len(today["events"]) == 6 and today["speech"]
    assert any("busy during Emma pickup" in item for item in today["conflicts"])
    assert "Soccer practice" in json.dumps(today["reminders"])
    assert "Jordan is busy" in call(api, token, "list_conflicts")["speech"]
    assert "Soccer practice" in call(api, token, "get_member_schedule", {"member": "emma"})["speech"]
    assert call(api, token, "get_chores", {"member": "Emma"})["chores"][0]["title"] == "Pack backpack"
    assert call(api, token, "get_reward_balance")["balances"] == {"Emma": 0, "Leo": 0}
    assert len(call(api, token, "get_week")["days"]) == 7
    assert "couldn't find" in call(api, token, "get_member_schedule", {"member": "Zed"})["error"]


def test_voice_proposal_changes_nothing_until_confirmed_and_applies_once(api):
    parent = parent_token(api)
    assert api.client.post("/v1/access-code", json={"code": "4826"}, headers=bearer(parent)).status_code == 200
    token = voice_token(api, parent)
    tv = pair_tv(api, parent)
    before = household(api, parent)
    proposal = call(api, token, "propose_pickup_swap", {"event": "Emma pickup", "to_member": "Alex"})
    assert proposal["status"] == "pending" and "confirm" in proposal["speech"].lower()
    again = call(api, token, "propose_pickup_swap", {"event": "Emma pickup", "to_member": "Alex"})
    assert again["proposalId"] == proposal["proposalId"]  # Idempotent while pending.
    after = household(api, parent)
    assert [e["responsibleMemberId"] for e in after["events"]] == [e["responsibleMemberId"] for e in before["events"]]
    pending = api.client.get("/v1/proposals", headers=bearer(tv)).json()["data"]
    assert [item["id"] for item in pending] == [proposal["proposalId"]]
    url = f"/v1/proposals/{proposal['proposalId']}/decision"
    denied = api.client.post(url, json={"action": "confirm"}, headers=bearer(tv))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "PARENT_CODE_REQUIRED"
    assert api.client.post(url, json={"action": "confirm", "code": "0000"}, headers=bearer(tv)).status_code == 401
    confirmed = api.client.post(url, json={"action": "confirm", "code": "4826"}, headers=bearer(tv))
    assert confirmed.status_code == 200 and confirmed.json()["data"]["proposal"]["status"] == "confirmed"
    pickup = next(e for e in household(api, parent)["events"] if e["id"] == "emma-pickup")
    assert pickup["responsibleMemberId"] == "alex"
    replay = api.client.post(url, json={"action": "confirm", "code": "4826"}, headers=bearer(tv))
    assert replay.status_code == 409 and replay.json()["error"]["code"] == "PROPOSAL_ALREADY_DECIDED"


def test_rejected_event_proposal_and_reschedule(api):
    parent = parent_token(api)
    token = voice_token(api, parent)
    event = call(api, token, "propose_event", {"title": "Dentist", "day": "tomorrow", "start_time": "4pm", "members": ["Leo"]})
    assert "Wednesday at 4:00 PM" in event["summary"]
    reject = api.client.post(f"/v1/proposals/{event['proposalId']}/decision", json={"action": "reject"}, headers=bearer(parent))
    assert reject.json()["data"]["proposal"]["status"] == "rejected"
    assert not any(e["title"] == "Dentist" and e["source"] == "voice" for e in household(api, parent)["events"])
    move = call(api, token, "propose_reschedule", {"event": "Family dinner", "start_time": "7pm"})
    assert api.client.post(f"/v1/proposals/{move['proposalId']}/decision", json={"action": "confirm"}, headers=bearer(parent)).status_code == 200
    dinner = next(e for e in household(api, parent)["events"] if e["id"] == "family-dinner")
    assert dinner["startAt"] == "2026-09-22T19:00:00-07:00" and dinner["endAt"] == "2026-09-22T19:45:00-07:00"


def test_child_voice_connection_can_only_report_its_own_chores(api):
    parent = parent_token(api)
    token = voice_token(api, parent, member_id="emma")
    tv = pair_tv(api, parent)
    assert "Only a parent" in call(api, token, "propose_event", {"title": "Party", "day": "today", "start_time": "5pm"})["error"]
    assert "couldn't find" in call(api, token, "mark_chore_done_request", {"chore": "Feed the cat"})["error"]
    assert call(api, token, "get_reward_balance")["balances"] == {"Emma": 0}
    done = call(api, token, "mark_chore_done_request", {"chore": "pack backpack"})
    assert done["status"] == "pending"
    # A chore-done request can be confirmed at the TV without the parent code.
    reply = api.client.post(f"/v1/proposals/{done['proposalId']}/decision", json={"action": "confirm"}, headers=bearer(tv))
    assert reply.status_code == 200
    snapshot = household(api, parent)
    assert next(c for c in snapshot["chores"] if c["id"] == "pack-backpack")["status"] == "completed"
    assert sum(t["delta"] for t in snapshot["starTransactions"] if t["memberId"] == "emma") == 5


def test_voice_tokens_are_revocable_and_rate_limited(api):
    parent = parent_token(api)
    token = voice_token(api, parent)
    connections = api.client.get("/v1/voice/connections", headers=bearer(parent)).json()["data"]["connections"]
    assert len(connections) == 1 and "token" not in connections[0]
    gateway = api.main.voice_gateway
    identity = gateway.identity(token)
    assert all(gateway.allow(identity) for _ in range(60)) and not gateway.allow(identity)
    api.client.post(f"/v1/voice/connections/{connections[0]['id']}/revoke", headers=bearer(parent))
    assert rpc(api, token, "tools/list").status_code == 401


def test_voice_cannot_edit_directly(api):
    from app.permissions import Actor
    from app.domain import DomainError

    parent = parent_token(api)
    owner = api.client.get("/v1/auth/session", headers=bearer(parent)).json()["data"]["account"]["accountId"]
    with pytest.raises(DomainError) as error:
        api.main.service().edit(Actor("voice", owner), "event", {"id": "x", "title": "x"})
    assert error.value.code == "VOICE_PROPOSAL_ONLY"


def test_simulated_alexa_uses_the_mcp_tools(api):
    parent = parent_token(api)
    token = voice_token(api, parent)
    reply = api.client.post("/v1/voice/simulate", json={"utterance": "Swap Emma pickup to Alex"}, headers=bearer(token))
    data = reply.json()["data"]
    assert data["simulated"] is True and data["mode"] == "rules" and data["toolCalls"] == ["propose_pickup_swap"]
    assert len(data["proposalIds"]) == 1 and "confirm" in data["reply"].lower()
    stars = api.client.post("/v1/voice/simulate", json={"utterance": "How many stars does Leo have?"}, headers=bearer(parent))
    assert "Leo has 0 stars" in stars.json()["data"]["reply"]
    assert api.client.post("/v1/voice/simulate", json={"utterance": "hi"}).status_code == 401


def test_voice_server_isolates_households():
    """Two households behind one MCP server: a connection only ever sees and changes its own."""
    from app.demo import create_demo_household
    from app.service import HouseholdService
    from app.voice import VoiceGateway, VoiceIdentity, VoiceServer

    homes = {"owner-a": create_demo_household(), "owner-b": create_demo_household()}
    homes["owner-b"].events = []

    class Store:
        def household(self, owner):
            return homes[owner].model_copy(deep=True)

        def transform(self, owner, change):
            homes[owner] = change(homes[owner])
            return homes[owner].model_copy(deep=True)

        def voice_token(self, _token):
            return None

    service = HouseholdService(production=True, repository=None, pg_store=Store())
    server = VoiceServer(service, VoiceGateway(service), public_url="https://familyos.test",
                         authorization_server="https://auth.test", allowed_origins=[])
    identity_b = VoiceIdentity(owner="owner-b", member_id=None, label="b", connection_id="b")
    today_b = asyncio.run(server.simulate(identity_b, "What's on today?"))
    assert today_b["toolCalls"] == ["get_today"] and "0 things" in today_b["reply"]
    identity_a = VoiceIdentity(owner="owner-a", member_id=None, label="a", connection_id="a")
    asyncio.run(server.simulate(identity_a, "Swap Emma pickup to Alex"))
    assert len(homes["owner-a"].proposals) == 1 and homes["owner-b"].proposals == []
