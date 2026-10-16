"""The wall calendar's note and scene loops, through the API."""
from __future__ import annotations

from conftest import bearer, edit, pair_tv, parent_token
from app.weather import WeatherUnavailable

TUCSON = {"id": "location", "latitude": 32.22174, "longitude": -110.92648, "label": "Tucson, AZ",
          "source": "device", "timezone": "America/Phoenix"}


def test_paired_tv_gets_a_note_that_uses_the_household_forecast(api, monkeypatch):
    parent = parent_token(api)
    edit(api, parent, "householdLocation", TUCSON)
    seen = {}

    async def fake_forecast(latitude, longitude, label):
        seen["label"] = label
        return {"location": label, "condition": "Rain Showers Likely", "temperatureF": 58, "highF": 61, "lowF": 52,
                "summary": "", "isDaytime": True,
                "hourly": [{"startTime": "2026-10-08T15:00:00-07:00", "condition": "Rain Showers Likely",
                            "temperatureF": 58, "precipChance": 80}]}

    monkeypatch.setattr(api.main.weather_provider, "forecast_for", fake_forecast)
    tv = pair_tv(api, parent)
    reply = api.client.get("/v1/wall-note", headers=bearer(tv))
    assert reply.status_code == 200
    assert reply.headers["cache-control"] == "no-store"
    body = reply.json()
    assert body["data"]["provider"] == "deterministic" and body["meta"]["fallback"] is True
    assert body["data"]["note"].startswith("Rain")
    assert seen == {"label": "Tucson, AZ"}


def test_note_still_works_when_the_weather_service_is_down(api, monkeypatch):
    parent = parent_token(api)
    edit(api, parent, "householdLocation", TUCSON)

    async def down(*_args):
        raise WeatherUnavailable

    monkeypatch.setattr(api.main.weather_provider, "forecast_for", down)
    reply = api.client.get("/v1/wall-note", headers=bearer(parent))
    assert reply.status_code == 200
    assert reply.json()["data"]["note"]


def test_scene_loops_are_served_as_cacheable_video(api):
    reply = api.client.get("/scenes/rain-day.mp4")
    assert reply.status_code == 200
    assert reply.headers["content-type"] == "video/mp4"
    assert "max-age" in reply.headers["cache-control"]
    assert api.client.get("/scenes/not-a-scene.mp4").status_code == 404
