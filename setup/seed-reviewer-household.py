"""Fill an Amazon Appstore reviewer's Hometide account with a small sample household.

Run this yourself after creating the reviewer account in the web app (/app/) and verifying its email.
It signs in to Cognito with the reviewer's credentials (taken from environment variables, never from
this file), then adds two adults, two children, today's events, chores (one needs a photo), a grocery
list, tonight's dinner, and the parent code. Running it twice does not add duplicates.

    $env:FAMILYOS_REVIEWER_EMAIL = "reviewer@your-domain.example"
    $env:FAMILYOS_REVIEWER_PASSWORD = "<the password you set>"
    $env:FAMILYOS_REVIEWER_PARENT_CODE = "2468"
    python setup/seed-reviewer-household.py

Only the Python standard library is needed. Optional: FAMILYOS_API_URL (defaults to the Railway service).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

API = os.getenv("FAMILYOS_API_URL", "https://hometide.up.railway.app").rstrip("/")
APP_JSON = Path(__file__).resolve().parents[1] / "apps" / "companion" / "app.json"
MARKER = "Reviewer sample household"


def post_json(url: str, body: object, headers: dict[str, str] | None = None, method: str = "POST") -> dict:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=30) as reply:
            return json.loads(reply.read() or b"{}")
    except urllib.error.HTTPError as error:
        detail = json.loads(error.read() or b"{}")
        message = (detail.get("error") or {}).get("message") or detail.get("message") or error.reason
        sys.exit(f"{method} {url.split('?')[0]} failed ({error.code}): {message}")


def cognito_id_token(email: str, password: str) -> str:
    extra = json.loads(APP_JSON.read_text(encoding="utf-8"))["expo"]["extra"]
    region, client = extra["familyosCognitoRegion"], extra["familyosCognitoClientId"]

    def call(operation: str, body: dict) -> dict:
        request = urllib.request.Request(
            f"https://cognito-idp.{region}.amazonaws.com/", method="POST", data=json.dumps({"ClientId": client, **body}).encode(),
            headers={"Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": f"AWSCognitoIdentityProviderService.{operation}"})
        try:
            with urllib.request.urlopen(request, timeout=30) as reply:
                return json.loads(reply.read())
        except urllib.error.HTTPError as error:
            sys.exit(f"Cognito sign-in failed: {json.loads(error.read() or b'{}').get('__type', error.code)}. "
                     "Create the account in /app/ and verify its email first.")

    result = call("InitiateAuth", {"AuthFlow": "USER_AUTH",
                                   "AuthParameters": {"USERNAME": email, "PREFERRED_CHALLENGE": "PASSWORD", "PASSWORD": password}})
    if result.get("ChallengeName") == "PASSWORD" and result.get("Session"):
        result = call("RespondToAuthChallenge", {"ChallengeName": "PASSWORD", "Session": result["Session"],
                                                 "ChallengeResponses": {"USERNAME": email, "PASSWORD": password}})
    token = (result.get("AuthenticationResult") or {}).get("IdToken")
    if not token:
        sys.exit("Cognito asked for an extra sign-in step this script doesn't support (for example MFA).")
    return token


def main() -> None:
    email = os.getenv("FAMILYOS_REVIEWER_EMAIL", "").strip()
    password = os.getenv("FAMILYOS_REVIEWER_PASSWORD", "")
    code = os.getenv("FAMILYOS_REVIEWER_PARENT_CODE", "").strip()
    if not email or not password or len(code) != 4 or not code.isdigit():
        sys.exit("Set FAMILYOS_REVIEWER_EMAIL, FAMILYOS_REVIEWER_PASSWORD and a four-digit FAMILYOS_REVIEWER_PARENT_CODE.")

    session = post_json(f"{API}/v1/auth/exchange",
                        {"idToken": cognito_id_token(email, password), "parentName": "Alex", "householdName": "The Rivera Family"},
                        {"X-FamilyOS-Session-Transport": "bearer"})["data"]["sessionToken"]
    auth = {"Authorization": f"Bearer {session}"}
    household = post_json(f"{API}/v1/household", None, auth, method="GET")["data"]
    if any(event.get("title") == MARKER for event in household["events"]):
        print("Sample household already present; nothing to do.")
        return

    def edit(kind: str, value: dict) -> None:
        nonlocal household
        household = post_json(f"{API}/v1/companion/edit",
                              {"kind": kind, "value": value, "expectedRevision": household.get("revision")}, auth)["data"]

    family = household["family"]
    zone = ZoneInfo(family.get("timezone") or "America/Phoenix")
    today = datetime.now(zone).replace(hour=0, minute=0, second=0, microsecond=0)
    names = {member["name"]: member["id"] for member in household["members"]}
    parent_id = next(member["id"] for member in household["members"] if member["role"] == "adult")
    people = [("Jordan", "adult", "#3E7C6B"), ("Emma", "child", "#C2543A"), ("Leo", "child", "#5165B8")]
    for name, role, color in people:
        if name not in names:
            member_id = uuid.uuid4().hex
            edit("member", {"id": member_id, "familyId": family["id"], "name": name, "initials": name[0],
                            "role": role, "accentColor": color})
            names[name] = member_id

    def at(day: int, hour: int, minute: int = 0) -> str:
        return (today + timedelta(days=day, hours=hour, minutes=minute)).isoformat()

    events = [
        (MARKER, "family", 0, 7, 0, 7, 15, [parent_id]),
        ("School drop-off", "dropoff", 0, 7, 45, 8, 15, [names["Emma"], names["Leo"]]),
        ("Dentist: Emma", "appointment", 0, 15, 30, 16, 30, [names["Emma"], names["Jordan"]]),
        ("Soccer practice", "sports", 0, 17, 0, 18, 0, [names["Leo"]]),
        ("Family dinner", "family", 0, 18, 30, 19, 30, [parent_id, names["Jordan"], names["Emma"], names["Leo"]]),
        ("Library visit", "family", 1, 10, 0, 11, 0, [names["Emma"], names["Leo"], parent_id]),
    ]
    for title, category, day, sh, sm, eh, em, members in events:
        edit("event", {"id": uuid.uuid4().hex, "familyId": family["id"], "title": title, "category": category,
                       "startAt": at(day, sh, sm), "endAt": at(day, eh, em), "ownerMemberId": parent_id, "memberIds": members})
    chores = [
        ("Make your bed", "Emma", False, None), ("Pack your backpack", "Leo", True, "Backpack zipped and by the door"),
        ("Feed the cat", "Leo", False, None), ("Set the table", "Emma", False, None),
    ]
    for title, who, photo, hint in chores:
        edit("chore", {"id": uuid.uuid4().hex, "familyId": family["id"], "title": title, "assignedToMemberId": names[who],
                       "dueAt": at(0, 19), "status": "pending", "points": 5, "verifyWithPhoto": photo, "photoHint": hint})
    for item in ("Milk", "Apples", "Pasta", "Granola bars"):
        edit("listItem", {"id": uuid.uuid4().hex, "listName": "Groceries", "title": item, "category": "Food", "addedBy": "Alex"})
    edit("meal", {"id": uuid.uuid4().hex, "title": "Tacos", "date": today.date().isoformat(), "category": "Dinner",
                  "cookIds": [parent_id], "servings": 4, "minutes": 30,
                  "ingredients": ["Tortillas", "Beans", "Cheese", "Salsa"], "instructions": ["Warm the tortillas", "Fill and serve"]})
    reply = urllib.request.Request(f"{API}/v1/access-code", method="POST", data=json.dumps({"code": code}).encode(),
                                   headers={"Content-Type": "application/json", **auth})
    try:
        urllib.request.urlopen(reply, timeout=30).read()
    except urllib.error.HTTPError as error:
        if error.code != 409:  # 409: a code is already set; keep it.
            sys.exit(f"Setting the parent code failed ({error.code}).")
    print(f"Sample household ready for {email}: 4 people, {len(events)} events, {len(chores)} chores, groceries and dinner.")


if __name__ == "__main__":
    main()
