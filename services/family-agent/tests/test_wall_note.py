"""The wall calendar's note joins the weather with the family's day, and never invents a time."""
from __future__ import annotations

import asyncio

import pytest

from app.models import HouseholdContext
from app.wall_note import (
    DeterministicWallNoteProvider,
    SafeWallNoteService,
    checked_note,
    note_facts,
    weather_kind,
)

TZ = "America/Phoenix"


def context(events=(), now="2026-10-08T13:20:00-07:00") -> HouseholdContext:
    return HouseholdContext.model_validate({
        "date": "2026-10-08",
        "timezone": TZ,
        "members": [
            {"id": "lindsey", "name": "Lindsey", "role": "adult"},
            {"id": "emma", "name": "Emma", "role": "child"},
        ],
        "events": list(events),
        "chores": [],
        "routines": [],
        "conflicts": [],
        "now": now,
    })


def soccer(start="2026-10-08T16:00:00-07:00", end="2026-10-08T17:00:00-07:00", driver="lindsey"):
    return {"id": "soccer", "title": "Emma's soccer", "startAt": start, "endAt": end, "memberIds": ["emma"],
            "responsibleMemberId": driver, "category": "activity", "allDay": False}


def forecast(hours, condition="Cloudy", temperature=64, daytime=True):
    return {
        "location": "Tucson, AZ", "condition": condition, "temperatureF": temperature, "highF": 68, "lowF": 55,
        "summary": "", "isDaytime": daytime,
        "hourly": [{"startTime": f"2026-10-08T{13 + index:02d}:00:00-07:00", "condition": cond,
                    "temperatureF": temp, "precipChance": chance} for index, (cond, temp, chance) in enumerate(hours)],
    }


@pytest.mark.parametrize("condition,temperature,kind", [
    ("Sunny", 75, "clear"), ("Chance Light Rain", 58, "rain"), ("Showers And Thunderstorms", 80, "storm"),
    ("Light Snow", 29, "snow"), ("Blowing Snow", 15, "blizzard"), ("Sunny", 104, "heat"),
])
def test_weather_kind_matches_the_tv_scene_rules(condition, temperature, kind):
    assert weather_kind(condition, temperature) == kind


def test_rain_later_names_the_plan_it_affects_and_who_drives():
    rain = forecast([("Cloudy", 64, 10), ("Cloudy", 63, 20), ("Rain Showers Likely", 60, 70), ("Rain", 59, 80),
                     ("Rain", 58, 70), ("Mostly Cloudy", 57, 20)])
    note = DeterministicWallNoteProvider().note(context([soccer()]), rain)
    assert note == "Rain from about 3 PM. Emma's soccer is at 4:00 PM, so pack rain jackets. Lindsey is driving."


def test_rain_now_says_when_it_stops():
    rain = forecast([("Rain", 58, 90), ("Rain", 58, 80), ("Cloudy", 57, 20)], condition="Rain")
    note = DeterministicWallNoteProvider().note(context([soccer()]), rain)
    assert note.startswith("Rain until about 3 PM.")


def test_heat_names_the_peak():
    hot = forecast([("Sunny", 104, 0), ("Sunny", 108, 0), ("Sunny", 107, 0)], condition="Sunny", temperature=104)
    note = DeterministicWallNoteProvider().note(context([soccer()]), hot)
    assert note.startswith("108° by 2 PM. Emma's soccer is at 4:00 PM, so pack extra water.")


def test_calm_weather_and_an_empty_afternoon():
    calm = forecast([("Sunny", 75, 0), ("Sunny", 76, 0)], condition="Sunny", temperature=75)
    note = DeterministicWallNoteProvider().note(context([]), calm)
    assert note == "Sunny and 75°. Nothing else on the calendar today."


def test_no_forecast_still_gives_the_next_plan():
    note = DeterministicWallNoteProvider().note(context([soccer(driver=None)]), None)
    assert note == "Emma's soccer is at 4:00 PM."


def test_after_the_last_plan_it_looks_at_tomorrow():
    tomorrow = soccer(start="2026-10-09T07:45:00-07:00", end="2026-10-09T08:15:00-07:00")
    tomorrow["title"] = "School drop-off"
    note = DeterministicWallNoteProvider().note(context([tomorrow], now="2026-10-08T21:10:00-07:00"), None)
    assert note == "Tomorrow starts with School drop-off at 7:45 AM."


def test_model_notes_with_made_up_times_or_too_many_words_are_rejected():
    facts = note_facts(context([soccer()]), forecast([("Cloudy", 64, 10), ("Rain", 60, 70)]))
    assert checked_note("Rain from 2 PM; Emma's soccer at 4:00 PM, pack jackets.", facts)
    with pytest.raises(ValueError):
        checked_note("Rain from 5 PM, so soccer at 6:30 PM may move.", facts)
    with pytest.raises(ValueError):
        checked_note("word " * 40, facts)


@pytest.mark.parametrize("written", ["16:00", "4 o'clock", "half past four", "quarter to five", "noon"])
def test_a_time_written_in_a_form_that_cant_be_checked_is_rejected(written):
    facts = note_facts(context([soccer()]), None)
    with pytest.raises(ValueError):
        checked_note(f"Emma's soccer is at {written}, so leave a few minutes early.", facts)
    assert checked_note("Emma's soccer is at 4:00 p.m. this afternoon.", facts)


def test_service_falls_back_to_the_deterministic_note(monkeypatch):
    monkeypatch.setenv("FAMILYOS_AI_PROVIDER", "deterministic")
    service = SafeWallNoteService()
    note, provider, fallback = asyncio.run(service.generate(context([soccer()]), None))
    assert (provider, fallback) == ("deterministic", True)
    assert note == "Emma's soccer is at 4:00 PM. Lindsey is driving."
