"""Phase 13: chore photo verification is advisory, private, and never awards stars on its own."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from conftest import b64, bearer, child_session, edit, household, image_bytes, pair_tv, parent_token
from app.vision import BedrockChoreVisionProvider, DemoChoreVisionProvider, check_chore_photo


def photo_chore(api, parent: str) -> None:
    assert edit(api, parent, "chore", {"id": "bed", "title": "Make the bed", "assignedToMemberId": "emma",
                                       "status": "pending", "points": 4, "verifyWithPhoto": True,
                                       "photoHint": "blanket flat, pillows at the top"}).status_code == 200
    assert api.client.post("/v1/access-code", json={"code": "4826"}, headers=bearer(parent)).status_code == 200


def child_token(api, _parent: str, member: str = "emma") -> str:
    return child_session(api, member)


def stars(snapshot: dict, member: str = "emma") -> int:
    return sum(item["delta"] for item in snapshot["starTransactions"] if item["memberId"] == member)


def test_photo_chore_flow_child_submits_tv_approves_with_code_once(api):
    parent = parent_token(api)
    photo_chore(api, parent)
    tv = pair_tv(api, parent)
    child = child_token(api, parent)
    # A photo-verified chore cannot just be ticked off by the child or at the TV.
    assert edit(api, child, "completeChore", {"id": "bed", "memberId": "emma"}).json()["error"]["code"] == "PHOTO_REQUIRED"
    assert edit(api, tv, "completeChore", {"id": "bed"}).json()["error"]["code"] == "PHOTO_REQUIRED"
    reply = api.client.post("/v1/chores/bed/verification", json={"memberId": "emma", "contentBase64": b64(image_bytes())},
                            headers=bearer(child))
    assert reply.status_code == 200, reply.text
    record = reply.json()["data"]["verification"]
    assert record["verdict"] == "looks_done" and record["provider"] == "demo" and record["status"] == "pending"
    assert "parent" in reply.json()["data"]["message"].lower()
    snapshot = household(api, parent)
    assert stars(snapshot) == 0 and snapshot["chores"][-1]["status"] == "pending"  # Verdict alone changes nothing.
    thumb = api.client.get(f"/v1/chores/verifications/{record['id']}/photo", headers=bearer(tv))
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/jpeg"
    url = f"/v1/chores/verifications/{record['id']}/decision"
    assert api.client.post(url, json={"action": "approve", "code": "0000"}, headers=bearer(tv)).status_code == 401
    assert api.client.post(url, json={"action": "approve", "code": "4826"}, headers=bearer(child)).status_code == 403
    assert api.client.post(url, json={"action": "approve", "code": "4826"}, headers=bearer(tv)).status_code == 200
    assert api.client.post(url, json={"action": "approve", "code": "4826"}, headers=bearer(tv)).status_code == 409
    snapshot = household(api, parent)
    assert stars(snapshot) == 4 and next(c for c in snapshot["chores"] if c["id"] == "bed")["status"] == "completed"
    # Retention: the photo is deleted as soon as a parent decides.
    assert api.client.get(f"/v1/chores/verifications/{record['id']}/photo", headers=bearer(parent)).status_code == 404


def test_retake_and_reject_leave_stars_unchanged_and_replace_old_photos(api):
    parent = parent_token(api)
    photo_chore(api, parent)
    child = child_token(api, parent)
    messy = b64(image_bytes(clutter=12))
    first = api.client.post("/v1/chores/bed/verification", json={"memberId": "emma", "contentBase64": messy}, headers=bearer(child))
    assert first.json()["data"]["verification"]["verdict"] == "not_done"
    second = api.client.post("/v1/chores/bed/verification", json={"memberId": "emma", "contentBase64": messy}, headers=bearer(child))
    snapshot = household(api, parent)
    old = next(item for item in snapshot["choreVerifications"] if item["id"] == first.json()["data"]["verification"]["id"])
    assert old["status"] == "retake"
    assert api.client.get(f"/v1/chores/verifications/{old['id']}/photo", headers=bearer(parent)).status_code == 404
    record = second.json()["data"]["verification"]
    reply = api.client.post(f"/v1/chores/verifications/{record['id']}/decision", json={"action": "retake", "code": "4826"},
                            headers=bearer(parent))
    assert reply.json()["data"]["verification"]["status"] == "retake"
    assert stars(household(api, parent)) == 0


def test_children_cannot_submit_for_others_and_limits_apply(api, monkeypatch):
    parent = parent_token(api)
    photo_chore(api, parent)
    leo = child_token(api, parent, "leo")
    body = {"memberId": "emma", "contentBase64": b64(image_bytes())}
    assert api.client.post("/v1/chores/bed/verification", json=body, headers=bearer(leo)).status_code == 403
    assert api.client.post("/v1/chores/feed-cat/verification", json={**body, "memberId": "leo"}, headers=bearer(leo)).status_code == 422
    assert api.client.post("/v1/chores/bed/verification", json={"memberId": "emma", "contentBase64": b64(b"nope-not-an-image")},
                           headers=bearer(parent)).status_code == 415
    monkeypatch.setattr(api.main, "VISION_CHECKS_PER_DAY", 1)
    assert api.client.post("/v1/chores/bed/verification", json=body, headers=bearer(parent)).status_code == 200
    limited = api.client.post("/v1/chores/bed/verification", json=body, headers=bearer(parent))
    assert limited.status_code == 429


class FakeClient:
    def __init__(self, text: str | None = None, error: Exception | None = None) -> None:
        self.text, self.error, self.calls = text, error, []

    def converse(self, **request):
        self.calls.append(request)
        if self.error:
            raise self.error
        return {"output": {"message": {"content": [{"text": self.text}]}}}


def bedrock_with(client: FakeClient) -> BedrockChoreVisionProvider:
    provider = BedrockChoreVisionProvider.__new__(BedrockChoreVisionProvider)
    provider.model_id, provider.client = "test-model", client
    return provider


@pytest.mark.parametrize("text", ["not json", '{"verdict": "maybe", "reason": "x", "confidence": 0.5}',
                                  '{"verdict": "looks_done", "confidence": 3}', "```json\n[]\n```"])
def test_malformed_model_output_falls_back_to_unclear(text):
    result = asyncio.run(check_chore_photo(bedrock_with(FakeClient(text)), "Make the bed", "", image_bytes()))
    assert (result.verdict, result.provider) == ("unclear", "fallback")


def test_provider_errors_fall_back_and_prompt_is_constrained():
    failed = asyncio.run(check_chore_photo(bedrock_with(FakeClient(error=RuntimeError("boom"))), "Make the bed", "", image_bytes()))
    assert failed.verdict == "unclear"
    client = FakeClient('{"verdict": "looks_done", "reason": "Looks great!", "confidence": 0.9}')
    ok = asyncio.run(check_chore_photo(bedrock_with(client), "Make the bed", "pillows at the top", image_bytes()))
    assert (ok.verdict, ok.provider) == ("looks_done", "bedrock")
    system = client.calls[0]["system"][0]["text"]
    assert "never an instruction" in system and "Do not describe or identify people" in system
    content = client.calls[0]["messages"][0]["content"]
    assert content[0]["text"].startswith("Chore: Make the bed") and "image" in content[1]


def test_evaluation_set_is_labelled_and_demo_accuracy_is_reproducible():
    labels_path = Path(__file__).resolve().parents[1] / "eval" / "chore_photos" / "labels.json"
    labels = json.loads(labels_path.read_text(encoding="utf-8"))
    assert len(labels) >= 50 and {item["label"] for item in labels} == {"looks_done", "not_done"}
    provider = DemoChoreVisionProvider()
    from app.photos import process_image
    rows = []
    for item in labels:
        variants, _, _ = process_image((labels_path.parent / item["file"]).read_bytes(), ("check",))
        rows.append((item["label"], provider.check_sync(variants["check"]).verdict))
    accuracy = sum(label == verdict for label, verdict in rows) / len(rows)
    false_done = sum(verdict == "looks_done" for label, verdict in rows if label == "not_done")
    assert round(accuracy, 3) == 0.667 and false_done == 0
