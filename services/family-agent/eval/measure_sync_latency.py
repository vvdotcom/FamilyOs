"""Measure phone-to-TV latency: the time from a phone edit (an API call) until the TV shows it.

Needs the local API (http://127.0.0.1:8787, demo mode) and the TV web build (`yarn dev:web`, port 8082)
running, plus Playwright (`pip install playwright && python -m playwright install chromium`). Each trial
waits a random 0-5 s first, so edits land at random points in the TV's 5-second refresh cycle.

    python eval/measure_sync_latency.py [--trials 12]
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8787")
    parser.add_argument("--tv", default="http://localhost:8082")
    parser.add_argument("--trials", type=int, default=12)
    args = parser.parse_args()
    from playwright.sync_api import sync_playwright

    client = httpx.Client(base_url=args.api, timeout=30)
    client.post("/v1/demo/reset")
    email = f"sync{int(time.time())}@example.test"
    client.post("/v1/auth/sign-up", json={"email": email, "password": "family-secret-123", "parentName": "Alex", "householdName": "Rivera"})
    code = client.get("/v1/auth/dev-email/latest", params={"email": email, "purpose": "verify_email"}).json()["data"]["code"]
    token = client.post("/v1/auth/verify-email", json={"email": email, "code": code},
                        headers={"X-FamilyOS-Session-Transport": "bearer"}).json()["data"]["sessionToken"]
    client.cookies.clear()
    auth = {"Authorization": f"Bearer {token}"}

    def edit(kind: str, value: dict) -> None:
        revision = client.get("/v1/household", headers=auth).json()["data"]["revision"]
        reply = client.post("/v1/companion/edit", headers=auth, json={"expectedRevision": revision, "kind": kind, "value": value})
        reply.raise_for_status()

    household = client.get("/v1/household", headers=auth).json()["data"]
    for event in household["events"]:
        edit("deleteEvent", {"id": event["id"]})
    edit("householdLocation", {"id": "location", "latitude": 32.22, "longitude": -110.93, "label": "Tucson, AZ",
                               "source": "search", "timezone": "America/Phoenix"})
    challenge = client.post("/v1/pairing/challenges", json={"deviceName": "Latency"}).json()["data"]
    client.post("/v1/pairing/approve", json={"code": challenge["code"]}, headers=auth)
    tv_token = client.post(f"/v1/pairing/challenges/{challenge['challengeId']}/claim",
                           json={"pollingToken": challenge["pollingToken"]}).json()["data"]["deviceToken"]
    start = datetime.now(ZoneInfo("America/Phoenix")).replace(hour=23, minute=0, second=0, microsecond=0)

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.goto(args.tv, wait_until="networkidle", timeout=180_000)
        page.evaluate("t => sessionStorage.setItem('familyos.tv-device-session.v1', t)", tv_token)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(8000)
        for trial in range(args.trials):
            title = f"Latency check {trial + 1}"
            time.sleep(random.uniform(0, 5))
            revision = client.get("/v1/household", headers=auth).json()["data"]["revision"]
            began = time.perf_counter()
            reply = client.post("/v1/companion/edit", headers=auth, json={"expectedRevision": revision, "kind": "event", "value": {
                "id": f"latency-{trial}", "familyId": household["family"]["id"], "title": title, "category": "family",
                "startAt": start.isoformat(), "endAt": (start + timedelta(minutes=30)).isoformat(), "ownerMemberId": "alex",
                "memberIds": ["alex"], "preparation": [], "source": "manual"}})
            saved = time.perf_counter()
            reply.raise_for_status()
            while page.get_by_text(title, exact=True).count() == 0:
                if time.perf_counter() - began > 20:
                    raise SystemExit(f"{title} never appeared on the TV")
                page.wait_for_timeout(25)
            results.append({"save_ms": round((saved - began) * 1000), "visible_ms": round((time.perf_counter() - began) * 1000)})
            print(results[-1])
            edit("deleteEvent", {"id": f"latency-{trial}"})
            while page.get_by_text(title, exact=True).count():
                page.wait_for_timeout(50)
        browser.close()

    visible = sorted(item["visible_ms"] for item in results)
    summary = {
        "trials": len(results), "save_ms_median": statistics.median(item["save_ms"] for item in results),
        "visible_ms_min": visible[0], "visible_ms_median": statistics.median(visible),
        "visible_ms_p90": visible[max(0, int(len(visible) * 0.9) - 1)], "visible_ms_max": visible[-1],
        "setup": "local API + TV web build (Chromium) on one PC; the TV refreshes every 5 s",
    }
    out = Path(__file__).resolve().parent / "results" / "sync_latency.json"
    out.write_text(json.dumps({"measured": time.strftime("%Y-%m-%d"), "results": results, "summary": summary}, indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
