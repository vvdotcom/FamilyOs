from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.weather import NWSWeatherProvider, WeatherNotConfigured, WeatherUnavailable, _build_forecast, _validate_nws_url


def _period(start: str, end: str, temperature: int, condition: str, *, daytime: bool | None = None):
    value = {
        "startTime": start,
        "endTime": end,
        "temperature": temperature,
        "temperatureUnit": "F",
        "shortForecast": condition,
        "detailedForecast": f"A local NWS summary for {condition.lower()}.",
    }
    if daytime is not None:
        value["isDaytime"] = daytime
    return value


def test_forecast_uses_current_conditions_and_daily_high_low():
    hourly = {
        "properties": {
            "periods": [
                _period("2026-06-10T13:00:00-07:00", "2026-06-10T14:00:00-07:00", 88, "Sunny"),
                _period("2026-06-10T14:00:00-07:00", "2026-06-10T15:00:00-07:00", 90, "Mostly Sunny"),
            ]
        }
    }
    daily = {
        "properties": {
            "periods": [
                _period("2026-06-10T06:00:00-07:00", "2026-06-10T18:00:00-07:00", 96, "Sunny", daytime=True),
                _period("2026-06-10T18:00:00-07:00", "2026-06-11T06:00:00-07:00", 67, "Clear", daytime=False),
            ]
        }
    }

    result = _build_forecast(
        "Tucson, AZ",
        hourly,
        daily,
        datetime.fromisoformat("2026-06-10T13:30:00-07:00"),
    )

    assert result == {
        "location": "Tucson, AZ",
        "condition": "Sunny",
        "temperatureF": 88,
        "highF": 96,
        "lowF": 67,
        "summary": "A local NWS summary for sunny.",
        "hourly": [
            {"startTime": "2026-06-10T13:00:00-07:00", "condition": "Sunny", "temperatureF": 88, "precipChance": None},
            {"startTime": "2026-06-10T14:00:00-07:00", "condition": "Mostly Sunny", "temperatureF": 90, "precipChance": None},
        ],
    }


def test_forecast_lists_the_next_hours_with_rain_chances_and_daylight():
    def hour(start: str, end: str, temperature: int, condition: str, chance: int | None):
        value = _period(start, end, temperature, condition, daytime=True)
        value["probabilityOfPrecipitation"] = {"unitCode": "wmoUnit:percent", "value": chance}
        return value

    hourly = {"properties": {"periods": [
        hour("2026-10-08T13:00:00-07:00", "2026-10-08T14:00:00-07:00", 64, "Cloudy", 10),
        hour("2026-10-08T14:00:00-07:00", "2026-10-08T15:00:00-07:00", 63, "Mostly Cloudy", 30),
        hour("2026-10-08T15:00:00-07:00", "2026-10-08T16:00:00-07:00", 60, "Rain Showers Likely", 70),
    ]}}
    result = _build_forecast("Tucson, AZ", hourly, {"properties": {"periods": []}},
                             datetime.fromisoformat("2026-10-08T14:20:00-07:00"))

    assert result["isDaytime"] is True
    assert [item["precipChance"] for item in result["hourly"]] == [30, 70]
    assert result["hourly"][1] == {"startTime": "2026-10-08T15:00:00-07:00", "condition": "Rain Showers Likely",
                                   "temperatureF": 60, "precipChance": 70}


def test_weather_requires_a_valid_configured_location():
    provider = NWSWeatherProvider(None, None, "")
    assert provider.configured is False
    with pytest.raises(WeatherNotConfigured):
        asyncio.run(provider.get_forecast())


def test_only_nws_forecast_urls_are_accepted():
    _validate_nws_url("https://api.weather.gov/gridpoints/TOP/31,80/forecast/hourly")
    with pytest.raises(WeatherUnavailable):
        _validate_nws_url("https://attacker.example/forecast")
    with pytest.raises(WeatherUnavailable):
        _validate_nws_url("http://api.weather.gov/forecast")


def test_provider_fetches_and_caches_real_nws_payload(monkeypatch):
    import app.weather as weather

    now = datetime.now(timezone.utc)
    start = now.replace(minute=0, second=0, microsecond=0)
    if start > now:
        start -= timedelta(hours=1)
    end = start + timedelta(hours=1)
    date_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    date_midpoint = date_start + timedelta(hours=18)
    date_end = date_start + timedelta(days=1)
    hourly_payload = {
        "properties": {
            "periods": [
                _period(start.isoformat(), end.isoformat(), 84, "Partly Sunny"),
                _period(end.isoformat(), (end + timedelta(hours=1)).isoformat(), 85, "Sunny"),
            ]
        }
    }
    daily_payload = {
        "properties": {
            "periods": [
                _period(date_start.isoformat(), date_midpoint.isoformat(), 90, "Sunny", daytime=True),
                _period(date_midpoint.isoformat(), date_end.isoformat(), 65, "Clear", daytime=False),
            ]
        }
    }
    payloads = {
        "https://api.weather.gov/points/32.2226,-110.9747": {
            "properties": {
                "forecastHourly": "https://api.weather.gov/gridpoints/TWC/1,2/forecast/hourly",
                "forecast": "https://api.weather.gov/gridpoints/TWC/1,2/forecast",
            }
        },
        "https://api.weather.gov/gridpoints/TWC/1,2/forecast/hourly": hourly_payload,
        "https://api.weather.gov/gridpoints/TWC/1,2/forecast": daily_payload,
    }
    calls: list[str] = []

    class FakeResponse:
        def __init__(self, payload):
            self.payload = json.dumps(payload).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, _limit):
            return self.payload

    def fake_urlopen(request, timeout):
        assert timeout == 5
        calls.append(request.full_url)
        assert request.get_header("User-agent") == "FamilyOS-Test/1.0"
        return FakeResponse(payloads[request.full_url])

    monkeypatch.setattr(weather, "urlopen", fake_urlopen)
    provider = NWSWeatherProvider(32.2226, -110.9747, "Tucson, AZ", "FamilyOS-Test/1.0")

    first = asyncio.run(provider.get_forecast())
    second = asyncio.run(provider.get_forecast())

    assert first["condition"] == "Partly Sunny"
    assert first["temperatureF"] == 84
    assert first["highF"] == 90
    assert first["lowF"] == 65
    assert second == first
    assert sorted(calls) == sorted(payloads)


def test_authenticated_api_returns_weather_and_health_never_exposes_coordinates(monkeypatch):
    import app.main as main

    class FakeWeatherProvider:
        configured = True

        async def get_forecast(self):
            return {
                "location": "Tucson, AZ",
                "condition": "Sunny",
                "temperatureF": 88,
                "highF": 96,
                "lowF": 67,
                "summary": "Clear skies.",
            }

    monkeypatch.setattr(main, "IS_PRODUCTION", False)
    monkeypatch.setattr(main, "weather_provider", FakeWeatherProvider())
    client = TestClient(main.app)

    weather = client.get("/v1/weather")
    assert weather.status_code == 200
    assert weather.json()["data"]["temperatureF"] == 88
    assert weather.json()["meta"]["provider"] == "nws"

    health = client.get("/health").json()["data"]
    assert health["weather_configured"] is True
    assert health["weather_provider"] == "nws"
    assert "latitude" not in str(health).lower()
    assert "longitude" not in str(health).lower()
