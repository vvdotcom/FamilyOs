from __future__ import annotations

import base64
import importlib
import io
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

PASSWORD = "family-secret-123"


@pytest.fixture
def api(tmp_path, monkeypatch):
    """A local FamilyOS API (demo household) with its MCP lifespan running."""
    monkeypatch.setenv("FAMILYOS_AUTH_MODE", "local")
    monkeypatch.setenv("FAMILYOS_AUTH_DB_PATH", str(tmp_path / "familyos-auth.sqlite3"))
    monkeypatch.setenv("FAMILYOS_LOCAL_AUTH_SHOW_CODES", "true")
    monkeypatch.setenv("FAMILYOS_DEMO_NOW", "2026-09-22T14:30:00-07:00")
    monkeypatch.setenv("FAMILYOS_AI_PROVIDER", "deterministic")
    monkeypatch.setenv("FAMILYOS_VISION_PROVIDER", "demo")
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    main = importlib.reload(importlib.import_module("app.main"))
    with TestClient(main.app) as client:
        yield SimpleNamespace(client=client, main=main)


def parent_token(api, email: str = "parent@example.test") -> str:
    client = api.client
    assert client.post("/v1/auth/sign-up", json={"email": email, "password": PASSWORD, "parentName": "Alex Rivera",
                                                 "householdName": "Rivera Family"}).status_code == 200
    code = client.get("/v1/auth/dev-email/latest", params={"email": email, "purpose": "verify_email"}).json()["data"]["code"]
    reply = client.post("/v1/auth/verify-email", json={"email": email, "code": code},
                        headers={"X-FamilyOS-Session-Transport": "bearer"})
    client.cookies.clear()  # Use explicit bearer tokens so each role is unambiguous.
    return reply.json()["data"]["sessionToken"]


def child_session(api, member: str, email: str = "parent@example.test") -> str:
    """Start child mode from a separate parent sign-in (starting child mode ends that parent session)."""
    other = api.client.post("/v1/auth/sign-in", json={"email": email, "password": PASSWORD},
                            headers={"X-FamilyOS-Session-Transport": "bearer"}).json()["data"]["sessionToken"]
    api.client.cookies.clear()
    reply = api.client.post("/v1/access/child-session", json={"memberId": member}, headers=bearer(other))
    assert reply.status_code == 200, reply.text
    return reply.json()["data"]["sessionToken"]


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def pair_tv(api, parent: str) -> str:
    client = api.client
    challenge = client.post("/v1/pairing/challenges", json={"deviceName": "Living room"}).json()["data"]
    assert client.post("/v1/pairing/approve", json={"code": challenge["code"]}, headers=bearer(parent)).status_code == 200
    claimed = client.post(f"/v1/pairing/challenges/{challenge['challengeId']}/claim",
                          json={"pollingToken": challenge["pollingToken"]}).json()["data"]
    return claimed["deviceToken"]


def household(api, token: str) -> dict:
    return api.client.get("/v1/household", headers=bearer(token)).json()["data"]


def edit(api, token: str, kind: str, value: dict, revision: int | None = None):
    if revision is None:
        revision = household(api, token)["revision"]
    return api.client.post("/v1/companion/edit", headers=bearer(token),
                           json={"expectedRevision": revision, "kind": kind, "value": value})


def image_bytes(color=(240, 240, 235), clutter: int = 0, fmt: str = "JPEG", exif_gps: bool = False, size=(640, 480)) -> bytes:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    palette = [(220, 30, 30), (30, 120, 220), (240, 200, 20), (40, 170, 60), (200, 60, 200)]
    for index in range(clutter):
        x, y = (index * 97) % (size[0] - 60), (index * 53) % (size[1] - 60)
        draw.rectangle([x, y, x + 50, y + 40], fill=palette[index % len(palette)])
    buffer = io.BytesIO()
    if exif_gps:
        exif = Image.Exif()
        exif[0x010F] = "PhoneMaker"
        exif[0x8825] = {1: "N", 2: (32.0, 13.0, 0.0), 3: "W", 4: (110.0, 58.0, 0.0)}
        image.save(buffer, format=fmt, exif=exif)
    else:
        image.save(buffer, format=fmt)
    return buffer.getvalue()


def b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")
