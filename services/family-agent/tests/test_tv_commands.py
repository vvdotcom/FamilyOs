"""Voice can drive the TV ("open the calendar") and read the home weather."""
from __future__ import annotations

import pytest

from conftest import bearer, edit, pair_tv, parent_token
from app.tv_commands import TVCommandBus, resolve_screen


@pytest.mark.parametrize(("spoken", "screen"), [
    ("the calendar", "calendar"), ("the shopping list", "lists"), ("dinner menu", "meals"), ("family night", "family night"),
    ("photos", "photos"), ("the wall calendar", "wall calendar"), ("screensaver", "wall calendar"),
    ("the chore chart", "chores"), ("a movement break", "movement break"), ("the home screen", "home"),
])
def test_spoken_screen_names(spoken, screen):
    assert resolve_screen(spoken) == screen


@pytest.mark.parametrize("spoken", ["what's on today", "the weather", "my bank account", ""])
def test_unknown_phrases_are_not_guessed(spoken):
    assert resolve_screen(spoken) is None


def ask(api, token, utterance):
    reply = api.client.post("/v1/voice/simulate", json={"utterance": utterance}, headers=bearer(token))
    assert reply.status_code == 200, reply.text
    return reply.json()["data"]


def poll(api, tv, after):
    reply = api.client.get("/v1/tv/commands", params={"after": after}, headers=bearer(tv))
    assert reply.status_code == 200, reply.text
    return reply.json()["data"]


def test_voice_opens_a_screen_on_the_paired_tv(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    start = poll(api, tv, -1)  # A TV that just started learns where the queue is, without replaying.
    assert start["commands"] == []
    data = ask(api, parent, "Open the calendar for tomorrow")
    assert data["toolCalls"] == ["show_on_tv"] and "calendar" in data["reply"].lower()
    new = poll(api, tv, start["latest"])
    assert [item["screen"] for item in new["commands"]] == ["Calendar"]
    assert new["commands"][0]["day"]  # The calendar opens on tomorrow's date.
    assert poll(api, tv, new["latest"])["commands"] == []  # Delivered once.
    ask(api, parent, "Show the wall calendar on the TV")
    assert [item["screen"] for item in poll(api, tv, new["latest"])["commands"]] == ["Wall"]


def test_only_the_households_own_tv_sees_its_commands(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    other = parent_token(api, email="neighbor@example.test")
    other_tv = pair_tv(api, other)
    mine, theirs = poll(api, tv, -1)["latest"], poll(api, other_tv, -1)["latest"]
    ask(api, parent, "Open chores")
    assert len(poll(api, tv, mine)["commands"]) == 1
    assert poll(api, other_tv, theirs)["commands"] == []


def test_commands_need_a_paired_tv(api):
    parent = parent_token(api)
    assert api.client.get("/v1/tv/commands", headers=bearer(parent)).status_code == 403
    assert api.client.get("/v1/tv/commands").status_code == 401


def test_stale_commands_are_not_replayed(monkeypatch):
    import app.tv_commands as module

    bus = TVCommandBus()
    clock = [1000.0]
    monkeypatch.setattr(module.time, "time", lambda: clock[0])
    bus.push("home", {"screen": "Calendar"})
    clock[0] += module.TTL_SECONDS + 1
    assert bus.since("home", 0)[0] == []


def test_voice_reads_the_home_weather(api, monkeypatch):
    parent = parent_token(api)
    assert ask(api, parent, "What's the weather today?")["reply"].startswith("Set your home location")
    edit(api, parent, "householdLocation", {"id": "location", "latitude": 32.22, "longitude": -110.93,
                                            "label": "Tucson, AZ", "source": "search", "timezone": "America/Phoenix"})

    async def forecast(latitude, longitude, location):
        assert (latitude, longitude) == (32.22, -110.93)
        return {"location": location, "temperatureF": 71, "highF": 76, "lowF": 60, "condition": "Partly Cloudy", "summary": "Nice."}

    monkeypatch.setattr(api.main.voice_server, "weather", forecast)
    reply = ask(api, parent, "What's the weather today?")["reply"]
    assert reply == "Right now in Tucson, AZ it's 71 degrees and partly cloudy. Today's high is 76 and the low is 60."
