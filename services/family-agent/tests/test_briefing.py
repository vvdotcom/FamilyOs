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
