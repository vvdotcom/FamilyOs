"""Fill a FamilyOS household with a realistic family week, for judges and demos.

Hosted server (Amazon Cognito accounts):
    1. Add FAMILYOS_DEMO_EMAIL and FAMILYOS_DEMO_PASSWORD to the repo-root .env. Use an email you can read.
    2. python scripts/seed_demo_household.py signup           # Cognito emails a 6-digit code
    3. python scripts/seed_demo_household.py confirm 123456
    4. python scripts/seed_demo_household.py seed             # add --reset to clear an earlier demo first

Local API (demo mode, http://127.0.0.1:8787):
    python scripts/seed_demo_household.py seed --local

Everything goes through the public API as a signed-in parent, so the data is exactly what a family would create.
Weekly items repeat for 12 weeks, so the calendar stays full through judging. Re-running skips what exists.
The password is read from .env and never printed.
"""
from __future__ import annotations

import argparse
import base64
import io
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

ROOT = Path(__file__).resolve().parents[1]
HOSTED_API = "https://hometide.up.railway.app"
LOCAL_API = "http://127.0.0.1:8787"
COGNITO_REGION = "us-west-2"
COGNITO_CLIENT_ID = "2imsmu2e7rdnfo79jd38mj08m"  # The public phone-app client (no secret).
ZONE = ZoneInfo("America/Phoenix")
PARENT_CODE = "2468"  # Shared with judges in the testing instructions.
HOLIDAYS = "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    env = ROOT.parents[1] / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return {**values, **{key: value for key, value in os.environ.items() if key.startswith("FAMILYOS_")}}


# Signing in ----------------------------------------------------------------------------------------

def cognito(operation: str, body: dict, client_id: str) -> dict:
    reply = httpx.post(f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/", timeout=30,
                       headers={"Content-Type": "application/x-amz-json-1.1",
                                "X-Amz-Target": f"AWSCognitoIdentityProviderService.{operation}"},
                       json={"ClientId": client_id, **body})
    data = reply.json() if reply.content else {}
    if reply.status_code != 200:
        raise SystemExit(f"Cognito {operation} failed: {data.get('__type', reply.status_code)}: {data.get('message', '')}")
    return data


def cognito_session(api: str, email: str, password: str, client_id: str) -> str:
    result = cognito("InitiateAuth", {"AuthFlow": "USER_AUTH",
                                      "AuthParameters": {"USERNAME": email, "PREFERRED_CHALLENGE": "PASSWORD", "PASSWORD": password}},
                     client_id)
    if result.get("ChallengeName") == "PASSWORD" and result.get("Session"):
        result = cognito("RespondToAuthChallenge", {"ChallengeName": "PASSWORD", "Session": result["Session"],
                                                    "ChallengeResponses": {"USERNAME": email, "PASSWORD": password}}, client_id)
    id_token = (result.get("AuthenticationResult") or {}).get("IdToken")
    if not id_token:
        raise SystemExit(f"Cognito sign-in needs another step ({result.get('ChallengeName')}); this script can't complete it.")
    reply = httpx.post(f"{api}/v1/auth/exchange", timeout=30, headers={"X-FamilyOS-Session-Transport": "bearer"},
                       json={"idToken": id_token, "parentName": "Alex", "householdName": "The Rivera Family"})
    if reply.status_code != 200:
        raise SystemExit(f"FamilyOS sign-in failed: {reply.status_code} {reply.text[:300]}")
    return reply.json()["data"]["sessionToken"]


def local_session(api: str, email: str, password: str) -> str:
    client = httpx.Client(base_url=api, timeout=30, headers={"X-FamilyOS-Session-Transport": "bearer"})
    reply = client.post("/v1/auth/sign-in", json={"email": email, "password": password})
    if reply.status_code == 200:
        return reply.json()["data"]["sessionToken"]
    client.post("/v1/auth/sign-up", json={"email": email, "password": password, "parentName": "Alex",
                                          "householdName": "The Rivera Family"})
    code = client.get("/v1/auth/dev-email/latest", params={"email": email, "purpose": "verify_email"}).json()["data"]["code"]
    reply = client.post("/v1/auth/verify-email", json={"email": email, "code": code})
    if reply.status_code != 200:
        raise SystemExit(f"Local sign-up failed: {reply.text[:300]}")
    return reply.json()["data"]["sessionToken"]


# API client ----------------------------------------------------------------------------------------

class Family:
    def __init__(self, api: str, token: str) -> None:
        self.http = httpx.Client(base_url=api, timeout=90, headers={"Authorization": f"Bearer {token}"})
        self.revision: int | None = None

    def call(self, method: str, path: str, body: dict | None = None, allow: tuple[str, ...] = ()):
        reply = self.http.request(method, path, json=body)
        if reply.status_code == 200:
            self.revision = None  # Most calls change the household.
            return reply.json().get("data")
        error = (reply.json() if reply.content else {}).get("error", {})
        if error.get("code") in allow:
            return None
        raise SystemExit(f"{method} {path} failed: {reply.status_code} {error.get('code')}: {error.get('message')}")

    def household(self) -> dict:
        data = self.http.get("/v1/household").json()["data"]
        self.revision = data["revision"]
        return data

    def edit(self, kind: str, value: dict) -> dict:
        for _ in range(4):
            if self.revision is None:
                self.household()
            reply = self.http.post("/v1/companion/edit", json={"expectedRevision": self.revision, "kind": kind, "value": value})
            if reply.status_code == 200:
                data = reply.json()["data"]
                self.revision = data["revision"]
                return data
            error = reply.json().get("error", {})
            if error.get("code") != "STALE_REVISION":
                raise SystemExit(f"{kind} {value.get('id')} failed: {reply.status_code} {error.get('code')}: {error.get('message')}")
            self.revision = None  # Someone (or calendar sync) changed the household; retry on the latest.
        raise SystemExit(f"{kind} {value.get('id')} kept conflicting with other changes; try again.")


# Demo content --------------------------------------------------------------------------------------

def at(day: date, hhmm: str) -> str:
    hour, minute = (int(part) for part in hhmm.split(":"))
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=ZONE).isoformat()


def jpeg(scene: str) -> str:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (1600, 900))
    draw = ImageDraw.Draw(image)
    if scene == "beach":
        for y in range(520):
            t = y / 520
            draw.line([(0, y), (1600, y)], fill=(int(250 - 70 * t), int(170 + 40 * t), int(120 + 90 * t)))
        draw.ellipse([1080, 250, 1300, 470], fill=(255, 236, 170))
        draw.rectangle([0, 520, 1600, 900], fill=(60, 120, 170))
        for i in range(12):
            draw.line([(0, 560 + i * 28), (1600, 548 + i * 28)], fill=(90, 150, 195), width=3)
    elif scene == "canyon":
        for y in range(900):
            t = y / 900
            draw.line([(0, y), (1600, y)], fill=(int(120 + 110 * t), int(170 + 40 * t), int(220 - 40 * t)))
        draw.polygon([(0, 900), (0, 520), (300, 330), (560, 520), (820, 280), (1150, 560), (1400, 420), (1600, 520), (1600, 900)],
                     fill=(170, 96, 60))
        draw.polygon([(0, 900), (0, 700), (400, 600), (900, 720), (1300, 620), (1600, 700), (1600, 900)], fill=(120, 70, 45))
        for x in (250, 520, 1180, 1420):
            draw.rectangle([x, 640, x + 18, 780], fill=(46, 110, 60))
            draw.rectangle([x - 40, 680, x - 22, 720], fill=(46, 110, 60))
    else:  # A kid's drawing: house, sun, family.
        draw.rectangle([0, 0, 1600, 900], fill=(250, 248, 240))
        draw.ellipse([1250, 80, 1450, 280], fill=(255, 205, 60))
        draw.rectangle([380, 420, 820, 760], fill=(230, 120, 90))
        draw.polygon([(340, 430), (600, 220), (860, 430)], fill=(150, 90, 170))
        draw.rectangle([560, 600, 650, 760], fill=(110, 70, 40))
        draw.rectangle([0, 760, 1600, 900], fill=(110, 185, 90))
        for index, x in enumerate((980, 1080, 1180, 1260)):
            height = 200 if index < 2 else 130
            draw.ellipse([x, 760 - height - 40, x + 50, 760 - height + 10], fill=(90, 70, 60))
            draw.line([(x + 25, 760 - height + 10), (x + 25, 760 - 40)], fill=(90, 70, 60), width=8)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return base64.b64encode(buffer.getvalue()).decode()


def reset(family: Family) -> None:
    household = family.household()
    for photo in household.get("photos") or []:
        family.call("POST", f"/v1/photos/{photo['id']}/delete", {}, allow=("PHOTO_NOT_FOUND", "NOT_FOUND"))
    for calendar in household.get("calendars") or []:
        family.call("POST", f"/v1/calendars/{calendar['id']}/delete", {}, allow=("CALENDAR_NOT_FOUND",))
    household = family.household()
    removals = [("deleteEvent", item["id"]) for item in household["events"] if not item.get("calendarId")]
    removals += [("deleteChore", item["id"]) for item in household["chores"]]
    removals += [("deleteMeal", item["id"]) for item in household.get("meals") or []]
    removals += [("deleteListItem", item["id"]) for item in household.get("listItems") or []]
    removals += [("deleteTeam", item["id"]) for item in household.get("teams") or []]
    for index, (kind, item_id) in enumerate(removals, 1):
        family.edit(kind, {"id": item_id})
        if index % 50 == 0:
            print(f"  removed {index} of {len(removals)}")
    print(f"Reset: removed {len(removals)} items, photos, and connected calendars.")


def seed(family: Family, local: bool) -> None:
    household = family.household()
    fid = household["family"]["id"]
    parent = household["members"][0]["id"]  # The account's own profile.
    jordan, emma, leo = "jordan", "emma", "leo"  # IDs that match the TV design's own palette.
    today = datetime.now(ZONE).date()
    monday = today - timedelta(days=today.weekday())

    family.edit("householdLocation", {"id": "location", "latitude": 32.2217, "longitude": -110.9265, "label": "Tucson, AZ",
                                      "source": "search", "timezone": "America/Phoenix"})
    for member_id, name, role, color in ((parent, "Alex", "adult", "#2F5FA8"), (jordan, "Jordan", "adult", "#B4541B"),
                                         (emma, "Emma", "child", "#6B45A8"), (leo, "Leo", "child", "#2E7A3A")):
        family.edit("member", {"id": member_id, "familyId": fid, "name": name, "initials": name[0], "role": role, "accentColor": color})
    family.edit("team", {"id": "demo-tigers", "name": "Tigers U10", "activity": "Soccer", "memberIds": [emma],
                         "uniform": "Orange jersey", "gear": ["Cleats", "Shin guards", "Water bottle"],
                         "driverIds": [parent, jordan], "rotationIndex": 0, "location": "Reid Park Field 3", "travelMinutes": 20})

    events = []
    for offset, name in enumerate(("mon", "tue", "wed", "thu", "fri")):
        events.append(dict(id=f"demo-school-{name}", title="School", category="school", day=offset, start="07:45", end="14:45",
                           members=[emma, leo], location="Lincoln Elementary"))
    for offset, name in ((0, "mon"), (2, "wed"), (4, "fri")):
        events.append(dict(id=f"demo-leo-pickup-{name}", title="Leo pickup", category="pickup", day=offset, start="14:45",
                           end="15:00", members=[leo], responsible=parent, location="Lincoln Elementary"))
    for offset, name in ((1, "tue"), (3, "thu")):
        events.append(dict(id=f"demo-emma-pickup-{name}", title="Emma pickup", category="pickup", day=offset, start="15:15",
                           end="15:30", members=[emma], responsible=jordan, location="Lincoln Elementary"))
    events += [
        # Jordan's Tuesday meeting overlaps Emma's pickup: the TV flags it and suggests Alex.
        dict(id="demo-jordan-meeting", title="Team meeting", category="appointment", day=1, start="15:00", end="16:00", members=[jordan]),
        dict(id="demo-soccer-practice", title="Soccer practice", category="sports", day=2, start="17:00", end="18:15",
             members=[emma], team="demo-tigers", sport="practice"),
        dict(id="demo-soccer-game", title="Soccer game", category="sports", day=5, start="09:00", end="10:00",
             members=[emma], team="demo-tigers", sport="game", arrival=20),
        dict(id="demo-piano", title="Leo piano lesson", category="family", day=3, start="16:30", end="17:00",
             members=[leo], responsible=parent, location="Music Box Studio", travel=10),
        dict(id="demo-move-mon", title="Movement break", category="move", day=0, start="16:00", end="16:10", members=[emma, leo], move="wiggle-warmup"),
        dict(id="demo-move-thu", title="Movement break", category="move", day=3, start="18:00", end="18:10", members=[emma, leo], move="wiggle-warmup"),
        dict(id="demo-dentist", title="Dentist", category="appointment", day=7, start="10:30", end="11:15", members=[parent],
             location="Sunrise Dental", once=True),
        dict(id="demo-picture-day", title="Picture day", category="school", day=4, members=[emma, leo], all_day=True, once=True),
        dict(id="demo-no-school", title="No school: teacher workday", category="school", day=14, members=[emma, leo], all_day=True, once=True),
    ]
    existing = {item["id"] for item in household["events"]}
    added = 0
    for spec in events:
        if spec["id"] in existing:
            continue
        day = monday + timedelta(days=spec["day"])
        value = {"id": spec["id"], "familyId": fid, "title": spec["title"], "category": spec["category"],
                 "ownerMemberId": spec["members"][0], "memberIds": spec["members"], "preparation": [], "source": "manual"}
        if spec.get("all_day"):
            value.update(startAt=at(day, "00:00"), endAt=at(day + timedelta(days=1), "00:00"), allDay=True)
        else:
            value.update(startAt=at(day, spec["start"]), endAt=at(day, spec["end"]))
        if not spec.get("once"):
            value["recurrence"] = "weekly"
        if spec.get("responsible"):
            value.update(responsibleMemberId=spec["responsible"], responsibilityType="pickup" if spec["category"] == "pickup" else "drive")
        if spec.get("location"):
            value["location"] = spec["location"]
        if spec.get("travel"):
            value["travelMinutes"] = spec["travel"]
        if spec.get("team"):
            value.update(teamId=spec["team"], sportKind=spec["sport"])
            if spec.get("arrival"):
                value["arrivalMinutes"] = spec["arrival"]
        if spec.get("move"):
            value["moveRoutineId"] = spec["move"]
        family.edit("event", value)
        added += 1
    print(f"Events: {added} added (weekly ones repeat for 12 weeks).")

    chores = [("demo-bed", "Make the bed", emma, "08:00", 4, "blanket pulled flat, pillows at the top"),
              ("demo-backpack", "Pack your backpack", emma, "07:30", 3, None),
              ("demo-cat", "Feed the cat", leo, "17:00", 2, None),
              ("demo-toys", "Put toys away", leo, "19:30", 3, "toys in the bin, floor clear"),
              ("demo-dishwasher", "Unload the dishwasher", jordan, "20:00", None, None)]
    have = {item["id"] for item in family.household()["chores"]}
    for chore_id, title, who, due, points, hint in chores:
        if chore_id not in have:
            family.edit("chore", {"id": chore_id, "familyId": fid, "title": title, "assignedToMemberId": who,
                                  "dueAt": at(today, due), "status": "pending", "points": points, "recurrence": "daily",
                                  "verifyWithPhoto": bool(hint), "photoHint": hint})
    for reward_id, title, stars in (("demo-reward-movie", "Pick the family movie", 10),
                                    ("demo-reward-screen", "20 extra minutes of screen time", 15),
                                    ("demo-reward-icecream", "Ice cream trip", 25)):
        family.edit("reward", {"id": reward_id, "title": title, "stars": stars, "available": True})

    family.call("POST", "/v1/access-code", {"code": PARENT_CODE}, allow=("ACCESS_CODE_ALREADY_SET",))
    household = family.household()
    for child, target in ((emma, 18), (leo, 12)):
        balance = sum(item["delta"] for item in household.get("starTransactions") or [] if item["memberId"] == child)
        if balance < target:
            if family.call("POST", "/v1/stars/adjust", {"memberId": child, "delta": target - balance, "code": PARENT_CODE},
                           allow=("ACCESS_CODE_INCORRECT", "ACCESS_CODE_COOLDOWN")) is None:
                print("Stars skipped: this account's parent code isn't 2468.")
                break
    if not any(item["status"] == "pending" for item in household.get("redemptions") or []):
        family.call("POST", "/v1/redemptions/request", {"memberId": leo, "rewardId": "demo-reward-movie"}, allow=("NOT_ENOUGH_STARS",))

    dinners = [("Tacos al pastor", 35, jordan), ("Sheet-pan chicken and veggies", 40, parent), ("Pasta primavera", 20, parent),
               ("Chicken stir-fry", 25, jordan), ("Homemade pizza night", 45, parent), ("Burgers on the grill", 30, jordan),
               ("Slow-cooker chili", 20, parent)]
    have = {item["id"] for item in household.get("meals") or []}
    for offset, (title, minutes, cook) in enumerate(dinners):
        meal_id = f"demo-dinner-{offset}"
        if meal_id not in have:
            family.edit("meal", {"id": meal_id, "title": title, "date": (monday + timedelta(days=offset)).isoformat(),
                                 "category": "Dinner", "cookIds": [cook], "servings": 4, "minutes": minutes,
                                 "ingredients": [], "instructions": [], "recurrence": "weekly"})
    items = [("Groceries", "Milk", "Dairy"), ("Groceries", "Eggs", "Dairy"), ("Groceries", "Bananas", "Produce"),
             ("Groceries", "Tortillas", "Bakery"), ("Groceries", "Shredded cheese", "Dairy"), ("Groceries", "Apples", "Produce"),
             ("Groceries", "Coffee", "Pantry"), ("School supplies", "Glue sticks", "Other"),
             ("School supplies", "Poster board", "Other"), ("School supplies", "Colored pencils", "Other")]
    have = {item["id"] for item in household.get("listItems") or []}
    for index, (list_name, title, category) in enumerate(items):
        if f"demo-item-{index}" not in have:
            family.edit("listItem", {"id": f"demo-item-{index}", "listName": list_name, "title": title, "category": category,
                                     "completed": False, "addedBy": "Alex"})

    # Always re-apply: it recreates the coming Friday nights, which a --reset removed with the other events.
    family.edit("familyNightSettings", {"id": "settings", "weekday": 4, "time": "19:00", "activityType": "movie",
                                        "pickerOrder": [emma, leo, parent, jordan]})
    friday = monday + timedelta(days=4 if today.weekday() <= 4 else 11)
    polls = {item["id"]: item for item in family.household().get("familyNightPolls") or []}
    if not (polls.get(friday.isoformat()) or {}).get("suggestions"):
        for suggestion_id, title, who in (("demo-fn-1", "Paddington 2", emma), ("demo-fn-2", "The Incredibles", leo),
                                          ("demo-fn-3", "Moana", jordan)):
            family.edit("familyNightSuggest", {"id": suggestion_id, "date": friday.isoformat(), "title": title, "byMemberId": who})
        for voter, choice in ((emma, "demo-fn-1"), (parent, "demo-fn-1"), (leo, "demo-fn-2")):
            family.edit("familyNightVote", {"id": friday.isoformat(), "memberId": voter, "suggestionId": choice})

    household = family.household()
    photos = len(household.get("photos") or [])
    for scene, caption in (("beach", "Sunset at Rocky Point"), ("canyon", "Hike at Sabino Canyon"), ("drawing", "Leo's drawing of our house"))[photos:]:
        family.call("POST", "/v1/photos", {"contentBase64": jpeg(scene), "caption": caption})
    if not household.get("calendars"):
        family.call("POST", "/v1/calendars", {"label": "US holidays", "url": HOLIDAYS, "memberIds": [parent, jordan, emma, leo]},
                    allow=("CALENDAR_ALREADY_CONNECTED", "CALENDAR_UNREACHABLE"))
    if not any(item["status"] == "pending" for item in household.get("choreVerifications") or []):
        photo = base64.b64encode((ROOT / "eval" / "chore_photos" / "make-bed-00.jpg").read_bytes()).decode()
        family.call("POST", "/v1/chores/demo-bed/verification", {"memberId": emma, "contentBase64": photo},
                    allow=("PHOTO_CHECK_LIMIT", "AI_DAILY_LIMIT"))

    household = family.household()
    conflicts = family.call("GET", "/v1/conflicts") or []
    print("\nDemo household ready:")
    print(f"  {len(household['members'])} people, {len(household['events'])} calendar items "
          f"({sum(1 for item in household['events'] if item.get('calendarId'))} from Google), {len(household['chores'])} chores, "
          f"{len(household.get('meals') or [])} dinners, {len(household.get('listItems') or [])} list items, "
          f"{len(household.get('photos') or [])} photos")
    print(f"  Waiting for a parent: {sum(1 for item in household.get('redemptions') or [] if item['status'] == 'pending')} reward request, "
          f"{sum(1 for item in household.get('choreVerifications') or [] if item['status'] == 'pending')} chore photo")
    print(f"  Conflicts flagged over the next 12 weeks: {len(conflicts)} "
          f"({', '.join(sorted({item['title'] for item in conflicts})) or 'none'}; Jordan's Tuesday meeting vs. Emma's pickup)")
    print(f"  Parent code for approvals: {PARENT_CODE}")
    print(f"  Signed in {'locally' if local else 'on the hosted server'}; the password was read from .env and not shown.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=("signup", "confirm", "seed"))
    parser.add_argument("code", nargs="?", help="the 6-digit code from the confirmation email (confirm only)")
    parser.add_argument("--local", action="store_true", help=f"use the local demo API at {LOCAL_API}")
    parser.add_argument("--api", help="override the API address")
    parser.add_argument("--reset", action="store_true", help="remove the earlier demo items first")
    args = parser.parse_args()
    env = load_env()
    api = (args.api or (LOCAL_API if args.local else HOSTED_API)).rstrip("/")
    email = env.get("FAMILYOS_DEMO_EMAIL") or ("judge-demo@example.test" if args.local else "")
    password = env.get("FAMILYOS_DEMO_PASSWORD") or ("family-demo-2468" if args.local else "")
    if not email or not password:
        raise SystemExit("Add FAMILYOS_DEMO_EMAIL and FAMILYOS_DEMO_PASSWORD to the repo-root .env first.")
    client_id = env.get("FAMILYOS_COGNITO_CLIENT_ID") or COGNITO_CLIENT_ID
    if args.command == "signup":
        cognito("SignUp", {"Username": email, "Password": password, "UserAttributes": [{"Name": "email", "Value": email}]}, client_id)
        print("Sign-up started. Cognito emailed a 6-digit code to the demo address; run: confirm <code>")
        return
    if args.command == "confirm":
        if not args.code:
            raise SystemExit("Give the 6-digit code: confirm 123456")
        cognito("ConfirmSignUp", {"Username": email, "ConfirmationCode": args.code.strip()}, client_id)
        print("Confirmed. Now run: seed")
        return
    started = time.perf_counter()
    token = local_session(api, email, password) if args.local else cognito_session(api, email, password, client_id)
    family = Family(api, token)
    if args.reset:
        reset(family)
    seed(family, args.local)
    print(f"  Took {time.perf_counter() - started:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
