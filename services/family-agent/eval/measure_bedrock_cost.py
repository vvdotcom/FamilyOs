"""Measure real Amazon Bedrock token usage for each FamilyOS AI feature, through the app's own endpoints.

Runs the API in-process (local demo mode) and records the `usage` Bedrock returns for: the TV briefing,
a flyer photo import, two chore-photo checks, and two simulated Alexa+ requests (about eight small Nova
Lite calls, well under one cent). Needs AWS_BEARER_TOKEN_BEDROCK and FAMILYOS_BEDROCK_MODEL_ID in the
repo-root .env; secrets are read, never printed.

    python eval/measure_bedrock_cost.py
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
# Nova Lite on-demand, USD per 1,000 tokens (AWS, "Demystifying Amazon Bedrock pricing", Aug 2025).
PRICE_IN, PRICE_OUT = 0.00006, 0.00024


def load_env() -> None:
    env = ROOT.parents[1] / ".env"
    if not env.exists():
        raise SystemExit("Create the repo-root .env with the Bedrock settings first.")
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            if key.strip() in ("AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION", "FAMILYOS_BEDROCK_MODEL_ID"):
                os.environ[key.strip()] = value.strip().strip('"').strip("'")
    if not os.environ.get("AWS_BEARER_TOKEN_BEDROCK"):
        raise SystemExit("AWS_BEARER_TOKEN_BEDROCK is not set in .env.")
    os.environ.update({
        "FAMILYOS_AUTH_MODE": "local", "FAMILYOS_DEMO_MODE": "true", "FAMILYOS_LOCAL_AUTH_SHOW_CODES": "true",
        "FAMILYOS_AI_PROVIDER": "bedrock", "FAMILYOS_VISION_PROVIDER": "bedrock", "FAMILYOS_CALENDAR_SYNC_MINUTES": "0",
        "FAMILYOS_AUTH_DB_PATH": str(Path(tempfile.mkdtemp()) / "cost.sqlite3"), "FAMILYOS_DEMO_NOW": "2026-09-22T14:30:00-07:00",
    })
    os.environ.pop("RAILWAY_ENVIRONMENT", None)


def flyer_jpeg() -> str:
    from PIL import Image, ImageDraw, ImageFont

    def font(size: int, bold: bool = False):
        for name in (("arialbd.ttf" if bold else "arial.ttf"), "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default(size=size)

    image = Image.new("RGB", (1200, 1600), (255, 250, 238))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, 1200, 260], fill=(214, 90, 40))
    draw.text((60, 70), "FALL FESTIVAL", font=font(96, True), fill=(255, 255, 255))
    for index, text in enumerate(["Lincoln Elementary PTA", "Saturday, October 10, 2026", "10:00 AM - 2:00 PM",
                                  "Lincoln Elementary Field", "Games, pumpkins, and a bake sale!"]):
        draw.text((60, 360 + index * 130), text, font=font(56), fill=(40, 30, 20))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return base64.b64encode(buffer.getvalue()).decode()


def main() -> None:
    load_env()
    import boto3

    records: list[dict] = []
    feature = {"now": ""}
    real_client = boto3.client

    def recording_client(*args, **kwargs):
        client = real_client(*args, **kwargs)
        original = client.converse

        def converse(**params):
            started = time.perf_counter()
            response = original(**params)
            usage = response.get("usage", {})
            records.append({"feature": feature["now"], "input": usage.get("inputTokens", 0),
                            "output": usage.get("outputTokens", 0), "ms": round((time.perf_counter() - started) * 1000)})
            return response

        client.converse = converse
        return client

    boto3.client = recording_client
    from fastapi.testclient import TestClient

    import app.main as main_module
    from app.domain import DemoRepository, snapshot_context

    requests = {"briefing": 1, "flyer import": 1, "chore photo": 2, "voice": 2}
    with TestClient(main_module.app) as client:
        email = f"cost{int(time.time())}@example.test"
        client.post("/v1/auth/sign-up", json={"email": email, "password": "family-secret-123", "parentName": "Alex", "householdName": "Rivera"})
        code = client.get("/v1/auth/dev-email/latest", params={"email": email, "purpose": "verify_email"}).json()["data"]["code"]
        token = client.post("/v1/auth/verify-email", json={"email": email, "code": code},
                            headers={"X-FamilyOS-Session-Transport": "bearer"}).json()["data"]["sessionToken"]
        client.cookies.clear()
        auth = {"Authorization": f"Bearer {token}"}

        feature["now"] = "briefing"
        client.post("/v1/briefing", json=snapshot_context(DemoRepository().snapshot()).model_dump(mode="json"), headers=auth)
        feature["now"] = "flyer import"
        client.post("/v1/imports/drafts", json={"sourceType": "flyer", "sourceName": "festival.jpg", "contentBase64": flyer_jpeg()}, headers=auth)
        feature["now"] = "chore photo"
        household = client.get("/v1/household", headers=auth).json()["data"]
        client.post("/v1/companion/edit", headers=auth, json={"expectedRevision": household["revision"], "kind": "chore", "value": {
            "id": "bed", "familyId": household["family"]["id"], "title": "Make the bed", "assignedToMemberId": "emma",
            "status": "pending", "points": 4, "verifyWithPhoto": True, "photoHint": "blanket pulled flat, pillows at the top"}})
        client.post("/v1/access-code", json={"code": "4826"}, headers=auth)
        for name in ("make-bed-00.jpg", "make-bed-07.jpg"):
            photo = base64.b64encode((ROOT / "eval" / "chore_photos" / name).read_bytes()).decode()
            reply = client.post("/v1/chores/bed/verification", json={"memberId": "emma", "contentBase64": photo}, headers=auth).json()
            verification = reply.get("data", {}).get("verification", {})
            if verification.get("status") == "pending":
                client.post(f"/v1/chores/verifications/{verification['id']}/decision", json={"action": "retake", "code": "4826"}, headers=auth)
        feature["now"] = "voice"
        for utterance in ("What's on today?", "Swap Emma pickup to Alex"):
            client.post("/v1/voice/simulate", json={"utterance": utterance}, headers=auth)

    summary = {}
    for name, count in requests.items():
        rows = [row for row in records if row["feature"] == name]
        tokens_in, tokens_out = sum(row["input"] for row in rows), sum(row["output"] for row in rows)
        summary[name] = {
            "requests": count, "model_calls": len(rows),
            "input_tokens_per_request": round(tokens_in / count), "output_tokens_per_request": round(tokens_out / count),
            "usd_per_request": round((tokens_in * PRICE_IN + tokens_out * PRICE_OUT) / 1000 / count, 6),
            "median_ms_per_call": sorted(row["ms"] for row in rows)[len(rows) // 2] if rows else None,
        }
    result = {"measured": time.strftime("%Y-%m-%d"), "model": os.environ.get("FAMILYOS_BEDROCK_MODEL_ID"),
              "pricing_usd_per_1k_tokens": {"input": PRICE_IN, "output": PRICE_OUT}, "records": records, "summary": summary}
    out = ROOT / "eval" / "results" / "bedrock_cost.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
