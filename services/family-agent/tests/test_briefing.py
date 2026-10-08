from __future__ import annotations

import asyncio
import json

from app.briefing import SafeBriefingService
from app.demo import demo_now
from app.domain import DemoRepository, snapshot_context


def test_bedrock_configuration_is_server_side_and_requires_token_and_model(monkeypatch):
    monkeypatch.setenv("FAMILYOS_AI_PROVIDER", "bedrock")
    monkeypatch.setenv("AWS_REGION", "us-west-2")
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "test-only-placeholder")
    monkeypatch.setenv("FAMILYOS_BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")
    configured = SafeBriefingService()
    assert configured.provider_name == "bedrock"
    assert configured.bedrock_configured is True

    monkeypatch.delenv("AWS_BEARER_TOKEN_BEDROCK")
    assert SafeBriefingService().bedrock_configured is False


def test_bedrock_failure_uses_deterministic_fallback_without_logging_error_details(monkeypatch, caplog):
    import app.briefing as briefing

    class FailingProvider:
        def __init__(self, _region, _model):
            pass

        async def generate_briefing(self, _context):
            raise RuntimeError("sensitive-provider-detail")

    monkeypatch.setenv("FAMILYOS_AI_PROVIDER", "bedrock")
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "test-only-placeholder")
    monkeypatch.setenv("FAMILYOS_BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")
    monkeypatch.setattr(briefing, "BedrockBriefingProvider", FailingProvider)
    context = snapshot_context(DemoRepository().snapshot(), demo_now())

    result, fallback = asyncio.run(SafeBriefingService().generate(context))

    assert fallback is True
    assert result.provider == "deterministic"
    assert "sensitive-provider-detail" not in caplog.text


def test_bedrock_converse_uses_configured_region_and_model_without_a_live_aws_call(monkeypatch):
    import app.briefing as briefing

    context = snapshot_context(DemoRepository().snapshot(), demo_now())
    captured = {}

    class FakeBedrockRuntime:
        def converse(self, *, modelId, **request):
            captured["modelId"] = modelId
            captured["request"] = request
            return {
                "output": {
                    "message": {
                        "content": [{
                            "text": json.dumps({
                                "date": context.date,
                                "headline": "Family plans today",
                                "summary": "A clear look at today's plans.",
                                "highlights": [],
                                "conflictIds": [item.id for item in context.conflicts],
                                "provider": "ai",
                            })
                        }]
                    }
                }
            }

    def fake_client(*, service_name, region_name, config):
        captured["service_name"] = service_name
        captured["region_name"] = region_name
        captured["config"] = config
        return FakeBedrockRuntime()

    monkeypatch.setattr(briefing.boto3, "client", fake_client)
    provider = briefing.BedrockBriefingProvider("us-west-2", "us.amazon.nova-lite-v1:0")

    result = asyncio.run(provider.generate_briefing(context))

    assert result.provider == "ai"
    assert captured["service_name"] == "bedrock-runtime"
    assert captured["region_name"] == "us-west-2"
    assert captured["modelId"] == "us.amazon.nova-lite-v1:0"
    assert captured["request"]["inferenceConfig"]["maxTokens"] == 360


# The glanceable banner (6 Oct) ------------------------------------------------------------------------

from app.briefing import BedrockBriefingProvider, DeterministicBriefingProvider, briefing_facts  # noqa: E402
from app.models import HouseholdContext  # noqa: E402


def glance_context(**extra) -> HouseholdContext:
    """Tuesday in Phoenix, 2 PM: drop-off is over, Emma's pickup, soccer and dinner are still to come."""
    day = "2026-10-06"
    event = lambda i, title, start, end, **more: {"id": i, "title": title, "startAt": f"{day}T{start}:00-07:00",
                                                    "endAt": f"{day}T{end}:00-07:00", "memberIds": ["emma"], **more}
    return HouseholdContext.model_validate({
        "date": day, "timezone": "America/Phoenix", "now": f"{day}T14:00:00-07:00",
        "members": [{"id": "lindsey", "name": "Lindsey", "role": "adult"}, {"id": "emma", "name": "Emma", "role": "child"},
                    {"id": "leo", "name": "Leo", "role": "child"}],
        "events": [event("drop", "School drop-off", "07:45", "08:15", responsibleMemberId="lindsey", category="dropoff"),
                   event("school", "School", "08:15", "15:15", category="school"),
                   event("pick", "Emma pickup", "15:15", "15:35", responsibleMemberId="lindsey", category="pickup"),
                   event("soccer", "Soccer practice", "17:30", "18:30", category="sports"),
                   event("dinner", "Family dinner", "18:30", "19:15", category="meal")],
        "chores": [], "routines": [], "conflicts": [], **extra,
    })


def test_facts_keep_only_what_is_left_today_in_local_time():
    facts = briefing_facts(glance_context())
    assert [item["title"] for item in facts["events"]] == ["School", "Emma pickup", "Soccer practice", "Family dinner"]
    pickup = facts["events"][1]
    assert pickup["time"] == "3:15 PM" and pickup["responsible"] == "Lindsey" and pickup["who"] == ["Emma"]
    assert facts["now"] == "2:00 PM" and facts["weekday"] == "Tuesday"


def test_a_calm_day_is_three_glanceable_lines_and_school_is_not_news():
    briefing = asyncio.run(DeterministicBriefingProvider().generate_briefing(glance_context()))
    assert briefing.headline == "All set for Tuesday" and briefing.conflictIds == []
    assert briefing.highlights == ["3:15 PM · Emma pickup · Lindsey", "5:30 PM · Soccer practice", "6:30 PM · Family dinner"]


def test_a_fresh_decision_leads_the_banner():
    context = glance_context(recentChanges=["Lindsey is the usual Emma pickup on Tuesdays and Thursdays."])
    briefing = asyncio.run(DeterministicBriefingProvider().generate_briefing(context))
    assert briefing.headline == "Sorted. You’re all set"
    assert briefing.summary.startswith("Lindsey is the usual Emma pickup")


def test_after_the_last_plan_it_looks_at_tomorrow():
    context = glance_context(now="2026-10-06T20:00:00-07:00", events=[
        {"id": "dinner", "title": "Family dinner", "startAt": "2026-10-06T18:30:00-07:00",
         "endAt": "2026-10-06T19:15:00-07:00", "memberIds": ["emma"]},
        {"id": "drop", "title": "School drop-off", "startAt": "2026-10-07T07:45:00-07:00",
         "endAt": "2026-10-07T08:15:00-07:00", "memberIds": ["emma"], "responsibleMemberId": "lindsey",
         "category": "dropoff"}])
    briefing = asyncio.run(DeterministicBriefingProvider().generate_briefing(context))
    assert briefing.headline == "Tomorrow at a glance"
    assert briefing.highlights == ["7:45 AM · Tomorrow: School drop-off · Lindsey"]


def test_ai_lines_with_made_up_times_are_dropped():
    context = glance_context()
    facts = briefing_facts(context)
    result = BedrockBriefingProvider._checked({
        "date": context.date, "headline": "All set for Tuesday", "summary": "A calm afternoon.",
        "highlights": ["3:15PM · Lindsey picks up Emma", "4:00 PM · Dentist for Leo", "6:30 PM · Family dinner",
                       "Soccer later"],
        "conflictIds": [], "provider": "ai"}, context, facts)
    assert result["highlights"] == ["3:15PM · Lindsey picks up Emma", "6:30 PM · Family dinner"]


def test_the_cache_ignores_the_minute_but_not_the_plans():
    from app.briefing import SafeBriefingService

    a = SafeBriefingService.cache_key(glance_context())
    assert a == SafeBriefingService.cache_key(glance_context(now="2026-10-06T14:20:00-07:00"))
    assert a != SafeBriefingService.cache_key(glance_context(now="2026-10-06T15:40:00-07:00"))  # Pickup ended.
    assert a != SafeBriefingService.cache_key(glance_context(recentChanges=["Lindsey takes Emma pickup instead of Jordan."]))


def test_server_context_is_today_and_tomorrow_with_only_open_problems():
    snapshot = DemoRepository().snapshot()
    context = snapshot_context(snapshot, demo_now())
    assert len(context.events) <= 60 and context.now
    days = {item.startAt[:10] for item in context.events}
    assert len(days) <= 3
