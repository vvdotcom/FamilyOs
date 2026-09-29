from __future__ import annotations

import asyncio
import json
import math
import os
import time
from datetime import datetime, timezone
from threading import RLock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class WeatherNotConfigured(Exception):
    pass


class WeatherUnavailable(Exception):
    pass


class WeatherUnsupportedLocation(WeatherUnavailable):
    """The National Weather Service does not forecast this place (it covers the US)."""


class NWSWeatherProvider:
    """Small server-side National Weather Service forecast adapter."""

    def __init__(
        self,
        latitude: float | None,
        longitude: float | None,
        location: str,
        user_agent: str = "FamilyOS/0.1",
        timeout_seconds: float = 5,
        cache_seconds: int = 900,
    ) -> None:
        self.latitude = latitude
        self.longitude = longitude
        self.location = location.strip()[:100]
        self.user_agent = user_agent.strip()[:200] or "FamilyOS/0.1"
        self.timeout_seconds = timeout_seconds
        self.cache_seconds = cache_seconds
        self._cache: dict[str, tuple[float, dict[str, object]]] = {}
        self._grid_cache: dict[str, tuple[float, str, str]] = {}
        self._lock = RLock()

    @classmethod
    def from_environment(cls) -> NWSWeatherProvider:
        latitude = _optional_float(os.getenv("FAMILYOS_WEATHER_LATITUDE"))
        longitude = _optional_float(os.getenv("FAMILYOS_WEATHER_LONGITUDE"))
        return cls(
            latitude,
            longitude,
            os.getenv("FAMILYOS_WEATHER_LOCATION", ""),
            os.getenv("FAMILYOS_WEATHER_USER_AGENT", "FamilyOS/0.1"),
        )

    @property
    def configured(self) -> bool:
        return (
            self.latitude is not None
            and self.longitude is not None
            and math.isfinite(self.latitude)
            and math.isfinite(self.longitude)
            and -90 <= self.latitude <= 90
            and -180 <= self.longitude <= 180
            and bool(self.location)
        )

    async def get_forecast(self) -> dict[str, object]:
        """Forecast for the service-wide fallback location (demo and single-household setups)."""
        if not self.configured:
            raise WeatherNotConfigured
        return await self.forecast_for(self.latitude, self.longitude, self.location)

    async def forecast_for(self, latitude: float, longitude: float, location: str) -> dict[str, object]:
        """Forecast for one household's saved location."""
        if not (math.isfinite(latitude) and math.isfinite(longitude) and -90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise WeatherNotConfigured
        location = location.strip()[:100] or "Home"
        cache_key = f"{latitude:.4f},{longitude:.4f}"
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached and now - cached[0] < self.cache_seconds:
                return dict(cached[1])

        try:
            hourly_url, daily_url = await self._forecast_urls(cache_key, latitude, longitude)
            hourly_payload, daily_payload = await asyncio.gather(
                asyncio.to_thread(self._get_json, hourly_url),
                asyncio.to_thread(self._get_json, daily_url),
            )
            result = _build_forecast(location, hourly_payload, daily_payload)
        except WeatherUnavailable:
            raise
        except Exception as error:
            raise WeatherUnavailable from error

        with self._lock:
            self._cache[cache_key] = (time.monotonic(), result)
        return dict(result)

    async def _forecast_urls(self, cache_key: str, latitude: float, longitude: float) -> tuple[str, str]:
        now = time.monotonic()
        with self._lock:
            cached = self._grid_cache.get(cache_key)
            if cached and now - cached[0] < 86_400:
                return cached[1], cached[2]

        point_url = (
            "https://api.weather.gov/points/"
            f"{latitude:.4f},{longitude:.4f}"
        )
        point_payload = await asyncio.to_thread(self._get_json, point_url, True)
        properties = point_payload.get("properties") if isinstance(point_payload, dict) else None
        if not isinstance(properties, dict):
            raise WeatherUnavailable
        hourly_url = properties.get("forecastHourly")
        daily_url = properties.get("forecast")
        if not isinstance(hourly_url, str) or not isinstance(daily_url, str):
            raise WeatherUnavailable
        _validate_nws_url(hourly_url)
        _validate_nws_url(daily_url)
        with self._lock:
            self._grid_cache[cache_key] = (time.monotonic(), hourly_url, daily_url)
        return hourly_url, daily_url

    def _get_json(self, url: str, point_lookup: bool = False) -> dict[str, Any]:
        _validate_nws_url(url)
        request = Request(
            url,
            headers={
                "Accept": "application/geo+json",
                "User-Agent": self.user_agent,
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = response.read(2_000_001)
            if len(payload) > 2_000_000:
                raise WeatherUnavailable
            data = json.loads(payload)
        except HTTPError as error:
            # weather.gov answers 404 for places outside its US coverage.
            if point_lookup and error.code == 404:
                raise WeatherUnsupportedLocation from error
            raise WeatherUnavailable from error
        except (URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
            raise WeatherUnavailable from error
        if not isinstance(data, dict):
            raise WeatherUnavailable
        return data


def _optional_float(value: str | None) -> float | None:
    try:
        return float(value) if value and value.strip() else None
    except ValueError:
        return None


def _validate_nws_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "api.weather.gov" or parsed.port:
        raise WeatherUnavailable


def _build_forecast(
    location: str,
    hourly_payload: dict[str, Any],
    daily_payload: dict[str, Any],
    now: datetime | None = None,
) -> dict[str, object]:
    hourly = _periods(hourly_payload)
    daily = _periods(daily_payload)
    if not hourly:
        raise WeatherUnavailable

    current_time = now or datetime.now(timezone.utc)
    current = _current_period(hourly, current_time)
    current_start = _period_time(current, "startTime")
    current_day = current_start.date()

    daytime = next(
        (
            period
            for period in daily
            if period.get("isDaytime") is True and _same_local_day(period, current_day)
        ),
        None,
    )
    nighttime = next(
        (
            period
            for period in daily
            if period.get("isDaytime") is False and _same_local_day(period, current_day)
        ),
        None,
    )
    same_day_hours = [period for period in hourly if _same_local_day(period, current_day)]
    temperatures = [_fahrenheit(item) for item in same_day_hours]
    temperature = _fahrenheit(current)
    high = _fahrenheit(daytime) if daytime else max(temperatures, default=temperature)
    low = _fahrenheit(nighttime) if nighttime else min(temperatures, default=temperature)

    condition = current.get("shortForecast")
    summary = (daytime or current).get("detailedForecast") or condition
    if not isinstance(condition, str) or not condition.strip():
        condition = "Forecast available"
    if not isinstance(summary, str):
        summary = ""
    return {
        "location": location,
        "condition": condition.strip()[:80],
        "temperatureF": temperature,
        "highF": high,
        "lowF": low,
        "summary": summary.strip()[:320],
    }


def _periods(payload: dict[str, Any]) -> list[dict[str, Any]]:
    properties = payload.get("properties")
    periods = properties.get("periods") if isinstance(properties, dict) else None
    if not isinstance(periods, list):
        return []
    return [period for period in periods if isinstance(period, dict)]


def _current_period(periods: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    for period in periods:
        start = _period_time(period, "startTime")
        end = _period_time(period, "endTime")
        if start <= now < end:
            return period
    return min(periods, key=lambda period: abs((_period_time(period, "startTime") - now).total_seconds()))


def _period_time(period: dict[str, Any], name: str) -> datetime:
    value = period.get(name)
    if not isinstance(value, str):
        raise WeatherUnavailable
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise WeatherUnavailable from error
    if result.tzinfo is None:
        raise WeatherUnavailable
    return result


def _same_local_day(period: dict[str, Any], day) -> bool:
    try:
        return _period_time(period, "startTime").date() == day
    except WeatherUnavailable:
        return False


def _fahrenheit(period: dict[str, Any]) -> int:
    value = period.get("temperature")
    unit = period.get("temperatureUnit")
    if not isinstance(value, (float, int)) or isinstance(value, bool):
        raise WeatherUnavailable
    result = value if unit == "F" else value * 9 / 5 + 32 if unit == "C" else None
    if result is None:
        raise WeatherUnavailable
    return round(result)
