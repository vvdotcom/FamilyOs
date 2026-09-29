"""Per-household weather location: set from the phone, used for the TV forecast."""
from __future__ import annotations

from urllib.error import HTTPError

import pytest

from conftest import bearer, edit, household, pair_tv, parent_token
from app.weather import NWSWeatherProvider, WeatherUnsupportedLocation

TUCSON = {"id": "location", "latitude": 32.22174, "longitude": -110.92648, "label": "Tucson, AZ",
          "source": "device", "timezone": "America/Phoenix"}


def test_parent_sets_a_rounded_location_and_timezone(api):
    parent = parent_token(api)
    saved = edit(api, parent, "householdLocation", {**TUCSON, "timezone": "America/Denver"}).json()["data"]
    assert saved["location"]["latitude"] == 32.22 and saved["location"]["longitude"] == -110.93
    assert saved["location"]["label"] == "Tucson, AZ" and saved["location"]["source"] == "device"
    assert saved["family"]["timezone"] == "America/Denver"
    assert any(entry["action"] == "householdLocation" for entry in saved["auditLog"])
    cleared = edit(api, parent, "householdLocation", {"id": "location", "clear": True}).json()["data"]
    assert cleared["location"] is None


@pytest.mark.parametrize("bad", [{"latitude": 95}, {"longitude": "east"}, {"timezone": "Mars/Base"}, {"street": "1 Main St"}])
def test_invalid_locations_are_rejected(api, bad):
    parent = parent_token(api)
    assert edit(api, parent, "householdLocation", {**TUCSON, **bad}).status_code == 422
    assert household(api, parent)["location"] is None


def test_only_parents_can_set_the_location(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    assert edit(api, tv, "householdLocation", TUCSON).status_code == 403


def test_weather_uses_the_household_location(api, monkeypatch):
    parent = parent_token(api)
    seen = {}

    async def fake_forecast(latitude, longitude, label):
        seen.update(latitude=latitude, longitude=longitude, label=label)
        return {"location": label, "condition": "Sunny", "temperatureF": 88, "highF": 95, "lowF": 70, "summary": "Hot."}

    monkeypatch.setattr(api.main.weather_provider, "forecast_for", fake_forecast)
    monkeypatch.setattr(api.main.weather_provider, "latitude", None)
    missing = api.client.get("/v1/weather", headers=bearer(parent))
    assert missing.status_code == 503 and missing.json()["error"]["code"] == "WEATHER_NOT_CONFIGURED"
    edit(api, parent, "householdLocation", TUCSON)
    reply = api.client.get("/v1/weather", headers=bearer(parent))
    assert reply.status_code == 200 and reply.json()["meta"]["source"] == "household"
    assert seen == {"latitude": 32.22, "longitude": -110.93, "label": "Tucson, AZ"}
    tv = pair_tv(api, parent)
    assert api.client.get("/v1/weather", headers=bearer(tv)).json()["data"]["location"] == "Tucson, AZ"


def test_locations_outside_nws_coverage_get_a_clear_error(api, monkeypatch):
    parent = parent_token(api)

    async def unsupported(*_args):
        raise WeatherUnsupportedLocation

    monkeypatch.setattr(api.main.weather_provider, "forecast_for", unsupported)
    edit(api, parent, "householdLocation", {**TUCSON, "latitude": 51.5, "longitude": -0.12, "label": "London"})
    reply = api.client.get("/v1/weather", headers=bearer(parent))
    assert reply.status_code == 503 and reply.json()["error"]["code"] == "WEATHER_UNSUPPORTED_LOCATION"


def test_weather_gov_404_on_point_lookup_means_unsupported(monkeypatch):
    provider = NWSWeatherProvider(None, None, "")

    def not_found(*_args, **_kwargs):
        raise HTTPError("https://api.weather.gov/points/51.5,-0.12", 404, "Not Found", {}, None)

    monkeypatch.setattr("app.weather.urlopen", not_found)
    with pytest.raises(WeatherUnsupportedLocation):
        provider._get_json("https://api.weather.gov/points/51.5000,-0.1200", True)
