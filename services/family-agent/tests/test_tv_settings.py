"""TV settings from the phone: when the wall calendar starts, and how early reminders appear (family feedback)."""
from __future__ import annotations

import pytest

from conftest import edit, household, pair_tv, parent_token


def test_parent_sets_the_wall_wait_and_reminders(api):
    parent = parent_token(api)
    assert household(api, parent).get("tvSettings") is None  # TVs use their defaults: 5 minutes, reminders 15 minutes before
    saved = edit(api, parent, "tvSettings", {"id": "tv", "wallIdleMinutes": 1, "reminderMinutes": 30}).json()["data"]
    assert saved["tvSettings"] == {"wallIdleMinutes": 1, "reminderMinutes": 30}
    assert any(entry["action"] == "tvSettings" for entry in saved["auditLog"])
    # One setting at a time keeps the other.
    saved = edit(api, parent, "tvSettings", {"id": "tv", "reminderMinutes": 0}).json()["data"]
    assert saved["tvSettings"] == {"wallIdleMinutes": 1, "reminderMinutes": 0}


def test_the_paired_tv_reads_the_settings(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    edit(api, parent, "tvSettings", {"id": "tv", "wallIdleMinutes": 0, "reminderMinutes": 10})
    assert household(api, tv)["tvSettings"] == {"wallIdleMinutes": 0, "reminderMinutes": 10}


@pytest.mark.parametrize("bad", [{"wallIdleMinutes": 3}, {"wallIdleMinutes": "5"}, {"wallIdleMinutes": True},
                                 {"reminderMinutes": 60}, {"reminderMinutes": -5}, {"volume": 11}])
def test_invalid_settings_are_rejected(api, bad):
    parent = parent_token(api)
    assert edit(api, parent, "tvSettings", {"id": "tv", **bad}).status_code == 422
    assert household(api, parent).get("tvSettings") is None


def test_only_parents_change_tv_settings(api):
    parent = parent_token(api)
    tv = pair_tv(api, parent)
    assert edit(api, tv, "tvSettings", {"id": "tv", "wallIdleMinutes": 1}).status_code == 403
