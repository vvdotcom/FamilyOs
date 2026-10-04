"""Fill a Hometide account with a realistic sample family (for Amazon's reviewer and the demo account).

Run it yourself; the password is read from your terminal and never stored or printed:

    python setup/seed-reviewer-household.py                       # asks for email, password and parent code
    python setup/seed-reviewer-household.py --email demo@x.com    # asks only for the password
    python setup/seed-reviewer-household.py --fresh               # wipe this account's household first, then seed

What it adds (repeating weekly for 12 weeks, so the account still looks lived-in whenever it is opened):
  - Family: the account's own parent (shown as Lindsey; change with --parent-name), Jordan (adult),
    Emma (9) and Leo (6), in "The Rivera Family".
  - School drop-offs and pickups every weekday, piano, soccer practice and Saturday games, Friday movie night,
    Sunday brunch. Every Tuesday and Thursday Jordan's meeting overlaps Emma's pickup: a conflict to fix.
  - Daily chores (one needs a photo), rewards and some stars, a pending reward request to approve on the TV.
  - A week of dinners (repeating), a grocery list and a weekend to-do list.
  - Weather location (Phoenix, AZ) and the four-digit parent code.

Running it again updates the same items instead of duplicating them. Standard library only.

The parent's greeting name and the household name are set only when a household is first created. On an
account that already has a household, the parent is renamed on the family list, but the phone greeting and the
household name stay as they were; use --fresh to start over with every name from this script. --fresh deletes
everything in the account's household (events, photos, paired TVs, calendar links) and keeps the sign-in.
Optional: HOMETIDE_API_URL (default https://hometide.up.railway.app).
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = (os.getenv("HOMETIDE_API_URL") or os.getenv("FAMILYOS_API_URL") or "https://hometide.up.railway.app").rstrip("/")
APP_JSON = Path(__file__).resolve().parents[1] / "apps" / "companion" / "app.json"
ZONE = "America/Phoenix"
TZ = timezone(timedelta(hours=-7))  # Phoenix has no daylight saving; avoids needing tzdata on Windows.


def fail(message: str) -> None:
    sys.exit(f"\n{message}")


def http(method: str, url: str, body: object = None, headers: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=30) as reply:
            return json.loads(reply.read() or b"{}")
    except urllib.error.HTTPError as error:
        detail = json.loads(error.read() or b"{}")
        message = (detail.get("error") or {}).get("message") or detail.get("message") or error.reason
        raise RuntimeError(f"{method} {url.split('?')[0].replace(API, '')} failed ({error.code}): {message}") from None


def cognito_id_token(email: str, password: str) -> str:
    extra = json.loads(APP_JSON.read_text(encoding="utf-8"))["expo"]["extra"]
    region, client = extra["familyosCognitoRegion"], extra["familyosCognitoClientId"]

    def call(operation: str, body: dict) -> dict:
        request = urllib.request.Request(
            f"https://cognito-idp.{region}.amazonaws.com/", method="POST",
            data=json.dumps({"ClientId": client, **body}).encode(),
            headers={"Content-Type": "application/x-amz-json-1.1",
                     "X-Amz-Target": f"AWSCognitoIdentityProviderService.{operation}"})
        try:
            with urllib.request.urlopen(request, timeout=30) as reply:
                return json.loads(reply.read())
        except urllib.error.HTTPError as error:
            kind = json.loads(error.read() or b"{}").get("__type", error.code)
            fail(f"Sign-in failed ({kind}). Check the email and password, and that the account's email is verified.")

    result = call("InitiateAuth", {"AuthFlow": "USER_AUTH",
                                   "AuthParameters": {"USERNAME": email, "PREFERRED_CHALLENGE": "PASSWORD", "PASSWORD": password}})
    if result.get("ChallengeName") == "PASSWORD" and result.get("Session"):
        result = call("RespondToAuthChallenge", {"ChallengeName": "PASSWORD", "Session": result["Session"],
                                                 "ChallengeResponses": {"USERNAME": email, "PASSWORD": password}})
    token = (result.get("AuthenticationResult") or {}).get("IdToken")
    if not token:
        fail("This account needs an extra sign-in step (for example MFA) that this script doesn't support.")
    return token


class Household:
    def __init__(self, session: str) -> None:
        self.auth = {"Authorization": f"Bearer {session}"}
        self.data = http("GET", f"{API}/v1/household", headers=self.auth)["data"]

    def edit(self, kind: str, value: dict) -> None:
        reply = http("POST", f"{API}/v1/companion/edit",
                     {"kind": kind, "value": value, "expectedRevision": self.data.get("revision", 0)}, self.auth)
        self.data = reply["data"]

    def ids(self, collection: str) -> set[str]:
        return {item["id"] for item in self.data.get(collection, [])}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", default=os.getenv("HOMETIDE_SEED_EMAIL"))
    parser.add_argument("--code", default=os.getenv("HOMETIDE_SEED_PARENT_CODE"), help="four-digit parent code")
    parser.add_argument("--parent-name", default="Lindsey")
    parser.add_argument("--household-name", default="The Rivera Family")
    parser.add_argument("--fresh", action="store_true",
                        help="delete this account's household first and start over (asks you to confirm)")
    args = parser.parse_args()

    email = (args.email or input("Hometide account email: ")).strip()
    password = getpass.getpass("Hometide password (not shown): ")
    code = (args.code or input("Four-digit parent code [2468]: ").strip() or "2468")
    if not email or not password or len(code) != 4 or not code.isdigit():
        fail("An email, a password and a four-digit parent code are required.")

    if args.fresh and input(f"\n--fresh deletes everything in {email}'s household (events, photos, paired TVs,\n"
                            "calendar links) before seeding. Type DELETE to continue: ").strip() != "DELETE":
        fail("Nothing was changed.")

    print(f"Signing in to {API} as {email} ...")
    id_token = cognito_id_token(email, password)
    password = ""  # Not needed any more.

    def sign_in() -> str:
        return http("POST", f"{API}/v1/auth/exchange",
                    {"idToken": id_token, "parentName": args.parent_name, "householdName": args.household_name},
                    {"X-FamilyOS-Session-Transport": "bearer"})["data"]["sessionToken"]

    session = sign_in()
    if args.fresh:
        http("POST", f"{API}/v1/account/delete", {"confirm": "DELETE", "idToken": id_token},
             {"Authorization": f"Bearer {session}"})
        print("  old household deleted; creating a new one")
        session = sign_in()
    home = Household(session)

    # The account's own parent member is named at sign-up (for example from the Cognito profile); use the seed name.
    owner = next(member for member in home.data["members"] if member["role"] == "adult" and member["id"] != "seed-jordan")
    if owner["name"] != args.parent_name:
        home.edit("member", {**owner, "name": args.parent_name,
                             "initials": "".join(part[0] for part in args.parent_name.split()[:2]).upper()})
    print(f"  parent: {args.parent_name}")

    # Weather and time zone first, so "today" means today in Phoenix.
    home.edit("householdLocation", {"id": "home", "latitude": 33.45, "longitude": -112.07, "label": "Phoenix, AZ",
                                    "source": "search", "timezone": ZONE})
    print("  weather location: Phoenix, AZ")

    family = home.data["family"]
    members = {member["name"]: member["id"] for member in home.data["members"]}
    parent = next(member["id"] for member in home.data["members"] if member["role"] == "adult")
    for name, member_id, role, color in [("Jordan", "seed-jordan", "adult", "#3E7C6B"),
                                         ("Emma", "seed-emma", "child", "#C2543A"),
                                         ("Leo", "seed-leo", "child", "#5165B8")]:
        if name not in members:
            home.edit("member", {"id": member_id, "familyId": family["id"], "name": name, "initials": name[0],
                                 "role": role, "accentColor": color})
            members[name] = member_id
    jordan, emma, leo = members["Jordan"], members["Emma"], members["Leo"]
    print(f"  family: {args.parent_name}, Jordan, Emma, Leo")

    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    monday = today - timedelta(days=today.weekday())

    def at(weekday: int, hour: int, minute: int = 0) -> datetime:
        return monday + timedelta(days=weekday, hours=hour, minutes=minute)

    existing_events = home.ids("events")
    added = 0

    def owner_for(who: list[str], responsible: str | None) -> str:
        """Show who an event is for: the driver if there is one, the one person it involves, else the parent."""
        return responsible or (who[0] if len(who) == 1 else parent)

    def weekly(event_id: str, title: str, category: str, weekday: int, start: tuple[int, int], minutes: int,
               who: list[str], **extra) -> None:
        nonlocal added
        if event_id in existing_events:
            return  # Already seeded with its 12 weekly copies.
        begin = at(weekday, *start)
        home.edit("event", {"id": event_id, "familyId": family["id"], "title": title, "category": category,
                            "startAt": begin.isoformat(), "endAt": (begin + timedelta(minutes=minutes)).isoformat(),
                            "ownerMemberId": owner_for(who, extra.get("responsibleMemberId")), "memberIds": who,
                            "recurrence": "weekly", **extra})
        added += 1

    for day, name in enumerate(["mon", "tue", "wed", "thu", "fri"]):
        weekly(f"seed-dropoff-{name}", "School drop-off", "dropoff", day, (7, 45), 30, [emma, leo],
               responsibleMemberId=parent, responsibilityType="dropoff", location="Desert Willow Elementary",
               travelMinutes=12)
        weekly(f"seed-school-{name}", "School", "school", day, (8, 15), 420, [emma, leo],
               location="Desert Willow Elementary")
        weekly(f"seed-pickup-{name}", "Emma pickup", "pickup", day, (15, 15), 20, [emma],
               responsibleMemberId=jordan if day in (1, 3) else parent, responsibilityType="pickup",
               location="Desert Willow Elementary", travelMinutes=12)
    # Jordan's meeting overlaps Emma's Tuesday/Thursday pickup: the briefing flags it and suggests the parent.
    weekly("seed-meeting-tue", "Team meeting", "appointment", 1, (14, 45), 75, [jordan], location="Office")
    weekly("seed-meeting-thu", "Team meeting", "appointment", 3, (14, 45), 75, [jordan], location="Office")
    weekly("seed-piano-wed", "Piano lesson", "appointment", 2, (16, 0), 45, [emma], location="Music Studio",
           travelMinutes=10)
    for day, name in [(1, "tue"), (3, "thu")]:
        weekly(f"seed-soccer-{name}", "Soccer practice", "sports", day, (17, 30), 60, [leo], location="Encanto Park",
               travelMinutes=15, preparation=[{"id": "ball", "label": "Soccer ball", "completed": False},
                                              {"id": "water", "label": "Water bottle", "completed": False}])
    weekly("seed-soccer-game", "Soccer game", "sports", 5, (9, 0), 90, [leo, parent, jordan],
           location="Encanto Park", travelMinutes=15,
           preparation=[{"id": "jersey", "label": "Blue jersey", "completed": False},
                        {"id": "snacks", "label": "Team snacks", "completed": False}])
    weekly("seed-movie-night", "Family movie night", "family", 4, (19, 0), 120, [parent, jordan, emma, leo])
    weekly("seed-brunch", "Brunch at Grandma's", "family", 6, (11, 0), 120, [parent, jordan, emma, leo],
           location="Grandma's house", travelMinutes=20)
    weekly("seed-dinner", "Family dinner", "meal", 0, (18, 30), 45, [parent, jordan, emma, leo])
    print(f"  calendar: {added} weekly series added (12 weeks each)" if added else "  calendar: already seeded")
    # Accounts seeded by an older version of this script had every event owned by the parent.
    fixes = [event for event in home.data.get("events", []) if event["id"].startswith("seed-")
             and event.get("ownerMemberId") != owner_for(event.get("memberIds") or [], event.get("responsibleMemberId"))]
    fields = {"id", "familyId", "title", "category", "startAt", "endAt", "ownerMemberId", "memberIds",
              "responsibleMemberId", "responsibilityType", "location", "travelMinutes", "preparation", "allDay",
              "seriesId", "recurrence", "teamId", "sportKind", "arrivalMinutes", "uniform", "moveRoutineId"}
    for event in fixes:
        value = {key: item for key, item in event.items() if key in fields}
        value["ownerMemberId"] = owner_for(event.get("memberIds") or [], event.get("responsibleMemberId"))
        home.edit("event", value)
    if fixes:
        print(f"  calendar: {len(fixes)} events now show who they're for")

    # (id, title, child, points, photo check, photo hint, due time): spread over morning, after school and evening.
    chores = [("seed-chore-bed", "Make your bed", emma, 5, False, None, (7, 15)),
              ("seed-chore-backpack", "Pack your backpack", leo, 5, True, "Backpack zipped and by the door", (7, 30)),
              ("seed-chore-cat", "Feed the cat", leo, 5, False, None, (16, 0)),
              ("seed-chore-reading", "Read for 20 minutes", emma, 5, False, None, (16, 30)),
              ("seed-chore-table", "Set the table", emma, 5, False, None, (18, 15)),
              ("seed-chore-toys", "Put toys away", leo, 3, False, None, (19, 30))]
    for chore_id, title, who, points, photo, hint, (hour, minute) in chores:
        due = today.replace(hour=hour, minute=minute)
        home.edit("chore", {"id": chore_id, "familyId": family["id"], "title": title, "assignedToMemberId": who,
                            "dueAt": due.isoformat(), "status": "pending", "points": points, "recurrence": "daily",
                            "verifyWithPhoto": photo, "photoHint": hint})
    print(f"  chores: {len(chores)} daily")

    for reward_id, title, stars in [("seed-reward-movie", "Pick the movie", 20),
                                    ("seed-reward-screen", "30 minutes extra screen time", 15),
                                    ("seed-reward-icecream", "Ice cream trip", 40)]:
        home.edit("reward", {"id": reward_id, "title": title, "stars": stars, "available": True})
    print("  rewards: 3")

    meals = [("Tacos", ["Tortillas", "Ground turkey", "Cheese", "Salsa"]),
             ("Spaghetti and meatballs", ["Spaghetti", "Meatballs", "Marinara"]),
             ("Sheet-pan chicken and veggies", ["Chicken thighs", "Broccoli", "Potatoes"]),
             ("Homemade pizza", ["Pizza dough", "Mozzarella", "Pepperoni"]),
             ("Burgers on the grill", ["Burger buns", "Ground beef", "Lettuce", "Tomatoes"]),
             ("Pancakes for dinner", ["Pancake mix", "Eggs", "Berries"]),
             ("Roast chicken", ["Whole chicken", "Carrots", "Rice"])]
    planned = {(meal["date"], meal["title"]) for meal in home.data.get("meals", [])}
    for offset, (title, ingredients) in enumerate(meals):
        day = (monday + timedelta(days=offset)).date().isoformat()
        if (day, title) not in planned:
            home.edit("meal", {"id": f"seed-meal-{offset}", "title": title, "date": day, "category": "Dinner",
                               "cookIds": [parent if offset % 2 == 0 else jordan], "servings": 4, "minutes": 35,
                               "ingredients": ingredients, "instructions": ["Prep", "Cook", "Serve"],
                               "recurrence": "weekly"})
    print("  meals: a week of dinners, repeating weekly")

    items = [("Groceries", ["Milk", "Apples", "Bananas", "Bread", "Eggs", "Granola bars", "Spinach"], "Food"),
             ("Weekend to-do", ["Clean out the garage", "Return library books", "Buy a gift for Ava's party"], "Home")]
    for list_name, titles, category in items:
        for number, title in enumerate(titles):
            home.edit("listItem", {"id": f"seed-{list_name[:4].lower()}-{number}", "listName": list_name,
                                   "title": title, "category": category, "addedBy": args.parent_name})
    print("  lists: Groceries and Weekend to-do")

    try:
        http("POST", f"{API}/v1/access-code", {"code": code}, home.auth)
        print(f"  parent code set: {code}")
    except RuntimeError as error:
        if "(409)" not in str(error):
            raise
        print("  parent code: already set (kept)")

    balances = http("GET", f"{API}/v1/rewards", headers=home.auth)["data"]["balances"]
    for who, stars in [(emma, 18), (leo, 12)]:
        if balances.get(who, 0) == 0:
            try:
                http("POST", f"{API}/v1/stars/adjust", {"code": code, "memberId": who, "delta": stars}, home.auth)
            except RuntimeError as error:
                print(f"  stars skipped ({error}); the parent code on this account may differ")
                break
    rewards = http("GET", f"{API}/v1/rewards", headers=home.auth)["data"]
    if not any(item["status"] == "pending" for item in rewards["redemptions"]):
        http("POST", f"{API}/v1/redemptions/request", {"memberId": leo, "rewardId": "seed-reward-screen"}, home.auth)
    print("  stars: Emma 18, Leo 12; Leo is asking for extra screen time (approve it on the TV)")
    print(f"\nDone. Open {API}/app/ or pair a TV to see the Rivera family.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        fail(str(error))
    except KeyboardInterrupt:
        fail("Stopped.")
