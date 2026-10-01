"""Simulated Alexa+: clear change commands use the rules; questions and unresolved commands use Bedrock."""
from __future__ import annotations

import pytest

from conftest import bearer, parent_token


@pytest.fixture
def bedrock(api, monkeypatch):
    """Pretend Bedrock is on; record each utterance it receives."""
    heard: list[str] = []
    monkeypatch.setenv("FAMILYOS_AI_PROVIDER", "bedrock")
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "test-only")

    async def fake_bedrock(self, utterance, tools=None):
        heard.append(utterance)
        return {"mode": "bedrock", "reply": "From Bedrock.", "toolCalls": [], "proposalIds": []}

    monkeypatch.setattr(api.main.VoiceServer, "_simulate_bedrock", fake_bedrock)
    api.main._ai_usage.clear()
    return heard


def ask(api, token: str, utterance: str) -> dict:
    reply = api.client.post("/v1/voice/simulate", json={"utterance": utterance}, headers=bearer(token))
    assert reply.status_code == 200, reply.text
    return reply.json()["data"]


def test_a_clear_pickup_swap_uses_the_rules_and_no_ai_budget(api, bedrock):
    parent = parent_token(api)
    data = ask(api, parent, "Swap Emma pickup to Alex")
    assert data["mode"] == "rules" and data["proposalIds"], data
    assert "unresolved" not in data
    assert bedrock == [] and not api.main._ai_usage
    household = api.client.get("/v1/household", headers=bearer(parent)).json()["data"]
    assert any(item["status"] == "pending" and item["kind"] == "pickup_swap" for item in household["proposals"])


def test_questions_go_to_bedrock(api, bedrock):
    parent = parent_token(api)
    assert ask(api, parent, "What's on today?")["mode"] == "bedrock"
    assert bedrock == ["What's on today?"]


def test_a_command_the_rules_cannot_resolve_falls_back_to_bedrock(api, bedrock):
    parent = parent_token(api)
    data = ask(api, parent, "Swap the zumba class to Alex")
    assert data["mode"] == "bedrock" and bedrock == ["Swap the zumba class to Alex"]


def test_without_bedrock_the_rules_explain_what_went_wrong(api, monkeypatch):
    monkeypatch.delenv("FAMILYOS_AI_PROVIDER", raising=False)
    parent = parent_token(api)
    data = ask(api, parent, "Swap the zumba class to Alex")
    assert data["mode"] == "rules" and "couldn't find" in data["reply"]
