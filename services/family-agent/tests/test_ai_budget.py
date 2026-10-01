"""Bedrock spending guard: per-household and service-wide daily caps, with safe fallbacks."""
from __future__ import annotations

import base64

from conftest import bearer, edit, household, image_bytes, parent_token
from app.imports import rules_proposals
from app.vision import VisionResult


def test_caps_apply_per_household_and_across_the_service(api, monkeypatch):
    main = api.main
    monkeypatch.setattr(main, "AI_CALLS_PER_DAY", 2)
    monkeypatch.setattr(main, "AI_CALLS_PER_DAY_TOTAL", 3)
    main._ai_usage.clear()
    assert main.take_ai_call("a") and main.take_ai_call("a")
    assert not main.take_ai_call("a")  # This household is done for today.
    assert main.take_ai_call("b")
    assert not main.take_ai_call("c")  # The whole service is done for today.


def test_photo_imports_stop_at_the_cap(api, monkeypatch):
    calls = []

    class Reader:
        name = "bedrock"

        async def from_image(self, raw, media, context):
            calls.append(media)
            return rules_proposals("Fall Festival\nOctober 10 at 10:00 AM", context)

    monkeypatch.setattr(api.main, "configured_import_provider", lambda: Reader())
    monkeypatch.setattr(api.main, "AI_CALLS_PER_DAY", 1)
    api.main._ai_usage.clear()
    parent = parent_token(api)
    for index, expected in enumerate((200, 429)):
        photo = base64.b64encode(image_bytes(color=(240, 240 - index * 40, 235))).decode()
        reply = api.client.post("/v1/imports/drafts", headers=bearer(parent),
                                json={"sourceType": "photo", "sourceName": "flyer.jpg", "contentBase64": photo})
        assert reply.status_code == expected, reply.text
    assert reply.json()["error"]["code"] == "AI_DAILY_LIMIT"
    assert len(calls) == 1
    # Text imports don't use Bedrock, so they still work.
    text = api.client.post("/v1/imports/drafts", headers=bearer(parent),
                           json={"sourceType": "text", "contentText": "Bake sale\nOctober 12 at 9:00 AM"})
    assert text.status_code == 200, text.text


def test_simulated_voice_falls_back_to_rules_after_the_cap(api, monkeypatch):
    monkeypatch.setenv("FAMILYOS_AI_PROVIDER", "bedrock")
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "test-only")

    async def fake_bedrock(self, utterance, tools=None):
        return {"mode": "bedrock", "reply": "From Bedrock.", "toolCalls": [], "proposalIds": []}

    monkeypatch.setattr(api.main.VoiceServer, "_simulate_bedrock", fake_bedrock)
    monkeypatch.setattr(api.main, "AI_CALLS_PER_DAY", 1)
    api.main._ai_usage.clear()
    parent = parent_token(api)
    modes = [api.client.post("/v1/voice/simulate", json={"utterance": "What's on today?"}, headers=bearer(parent)).json()["data"]["mode"]
             for _ in range(2)]
    assert modes == ["bedrock", "rules"]


def test_chore_checks_become_parent_review_after_the_cap(api, monkeypatch):
    class Vision:
        name = "bedrock"

        async def check(self, chore_title, done_hint, jpeg):
            return VisionResult(verdict="looks_done", reason="Nice work!", confidence=0.9, provider="bedrock")

    monkeypatch.setattr(api.main, "configured_provider", lambda: Vision())
    monkeypatch.setattr(api.main, "AI_CALLS_PER_DAY", 1)
    api.main._ai_usage.clear()
    parent = parent_token(api)
    snapshot = household(api, parent)
    assert edit(api, parent, "chore", {"id": "bed", "familyId": snapshot["family"]["id"], "title": "Make the bed",
                                       "assignedToMemberId": "emma", "status": "pending", "points": 4,
                                       "verifyWithPhoto": True}).status_code == 200
    providers = []
    for index in range(2):
        photo = base64.b64encode(image_bytes(color=(230, 230 - index * 30, 220))).decode()
        reply = api.client.post("/v1/chores/bed/verification", json={"memberId": "emma", "contentBase64": photo},
                                headers=bearer(parent))
        assert reply.status_code == 200, reply.text
        providers.append(reply.json()["data"]["verification"]["provider"])
    assert providers == ["bedrock", "fallback"]


def test_briefing_uses_the_built_in_summary_after_the_cap(api, monkeypatch):
    from app import briefing as briefing_module

    class FakeBedrock:
        def __init__(self, region, model_id):
            pass

        async def generate_briefing(self, context):
            result = await briefing_module.DeterministicBriefingProvider().generate_briefing(context)
            return result.model_copy(update={"headline": "From Bedrock"})

    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "test-only")
    monkeypatch.setenv("FAMILYOS_BEDROCK_MODEL_ID", "test-model")
    monkeypatch.setattr(briefing_module, "BedrockBriefingProvider", FakeBedrock)
    monkeypatch.setattr(api.main.briefings, "provider_name", "bedrock")
    monkeypatch.setattr(api.main, "AI_CALLS_PER_DAY", 1)
    api.main._ai_usage.clear()
    parent = parent_token(api)
    first = api.client.get("/v1/briefing", headers=bearer(parent)).json()
    assert first["data"]["provider"] == "ai"
    api.main.briefings.cache.clear()
    second = api.client.get("/v1/briefing", headers=bearer(parent)).json()
    assert second["data"]["provider"] == "deterministic" and second["meta"]["fallback"] is True
