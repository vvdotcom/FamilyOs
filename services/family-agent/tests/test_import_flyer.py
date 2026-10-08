"""Flyer photos read by Bedrock: the main event comes first, side notes never replace it."""
import json

from app.imports import BedrockImportProvider, ImportContext, bedrock_proposals


def test_main_event_first_with_deadline_after():
    reply = json.dumps({"items": [
        {"kind": "task", "title": "Volunteer sign-up for Fall Family Festival", "date": "2026-10-07"},
        {"kind": "event", "title": "Fall Family Festival", "description": "Bring a canned food item for the pantry.",
         "date": "2026-10-10", "startTime": "14:00", "endTime": "17:00",
         "location": "Saguaro Sky Elementary · back field and cafeteria"},
    ]})
    first, second = bedrock_proposals(reply)
    assert (first.kind, first.title, first.date, first.startTime, first.endTime) == (
        "event", "Fall Family Festival", "2026-10-10", "14:00", "17:00")
    assert "canned food" in first.description
    assert first.location.startswith("Saguaro Sky")
    assert (second.kind, second.date) == ("task", "2026-10-07")


def test_timed_task_becomes_an_event_and_single_objects_still_work():
    (only,) = bedrock_proposals('Here you go: {"kind": "task", "title": "Fall Family Festival", '
                                '"date": "2026-10-10", "startTime": "14:00", "endTime": "17:00"}')
    assert only.kind == "event"
    (fenced,) = bedrock_proposals('```json\n{"kind": "event", "title": "Book fair", "date": null}\n```')
    assert fenced.kind == "event" and "date" in fenced.fieldsNeedingReview


def test_bad_values_are_dropped_not_trusted():
    (item,) = bedrock_proposals(json.dumps({"items": [{"kind": "party", "title": "x" * 300, "date": "Oct 10",
                                                       "startTime": "2pm", "endTime": "25:00"}]}))
    assert item.kind == "event" and len(item.title) == 120
    assert item.date is None and item.startTime is None and item.endTime is None


def test_provider_asks_for_the_main_event():
    seen = {}

    class Client:
        def converse(self, **kwargs):
            seen.update(kwargs)
            return {"output": {"message": {"content": [{"text": json.dumps({"items": [
                {"kind": "event", "title": "Fall Family Festival", "date": "2026-10-10",
                 "startTime": "14:00", "endTime": "17:00"}]})}]}}}

    provider = BedrockImportProvider.__new__(BedrockImportProvider)
    provider.model_id, provider.client = "test-model", Client()
    (draft,) = provider._extract(b"\xff\xd8", "jpeg", ImportContext(today="2026-10-06"))
    assert draft.title == "Fall Family Festival"
    prompt = seen["system"][0]["text"]
    assert "main thing the flyer is about" in prompt and "canned food" in prompt and "2026-10-06" in prompt
