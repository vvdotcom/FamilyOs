"""Live check: the Strands agent on Amazon Bedrock answers through Hometide's tools (and AgentCore Memory, if set).

Run with AWS credentials that can call Bedrock (and AgentCore Memory when HOMETIDE_AGENTCORE_MEMORY_ID is set):

    FAMILYOS_AI_PROVIDER=bedrock python scripts/live_agent_check.py

It uses the local demo household and the local auth store, so it never touches a real family's data.
"""
from __future__ import annotations

import importlib
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("FAMILYOS_AUTH_MODE", "local")
os.environ.setdefault("FAMILYOS_LOCAL_AUTH_SHOW_CODES", "true")
os.environ.setdefault("FAMILYOS_DEMO_NOW", "2026-09-22T14:30:00-07:00")
os.environ.setdefault("FAMILYOS_CALENDAR_SYNC_MINUTES", "0")
os.environ.setdefault("FAMILYOS_AUTH_DB_PATH", os.path.join(tempfile.mkdtemp(), "auth.sqlite3"))
os.environ["FAMILYOS_AI_PROVIDER"] = "bedrock"

from fastapi.testclient import TestClient  # noqa: E402

main = importlib.import_module("app.main")
EMAIL, PASSWORD = "live-check@example.test", "family-secret-123"

with TestClient(main.app) as client:
    client.post("/v1/auth/sign-up", json={"email": EMAIL, "password": PASSWORD, "parentName": "Alex", "householdName": "Live check"})
    code = client.get("/v1/auth/dev-email/latest", params={"email": EMAIL, "purpose": "verify_email"}).json()["data"]["code"]
    token = client.post("/v1/auth/verify-email", json={"email": EMAIL, "code": code},
                        headers={"X-FamilyOS-Session-Transport": "bearer"}).json()["data"]["sessionToken"]
    client.cookies.clear()
    headers = {"Authorization": f"Bearer {token}"}
    print("memory provider:", main.rhythm.memory.provider)
    for utterance in ["What's on today?", "Is anyone double booked this afternoon?", "What has Hometide learned about us?"]:
        started = time.monotonic()
        reply = client.post("/v1/voice/simulate", json={"utterance": utterance}, headers=headers).json()["data"]
        print(f"\n> {utterance}\n  mode={reply.get('mode')} engine={reply.get('engine', '-')} "
              f"tools={reply.get('toolCalls')} {time.monotonic() - started:.1f}s\n  {reply.get('reply')}")
