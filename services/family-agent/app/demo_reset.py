"""Resetting the hosted demo family, for the shared judge account only.

Every judge signs in to the same demo account, so the first judge who fixes Tuesday's clash would otherwise leave
the next one a week with nothing to fix. The owner saves the demo household once as a baseline (the seed script's
``baseline`` command), and the demo account's phone app gets a "Reset the demo family" button that puts it back.

* Which accounts are demo accounts: ``FAMILYOS_DEMO_ACCOUNTS``, a comma-separated list of emails. Unset: none,
  so no real family ever sees the button or can reset anything.
* Saving the baseline also needs ``FAMILYOS_DEMO_ADMIN_TOKEN`` (sent as ``X-Hometide-Demo-Admin``), so a judge
  can reset the demo but can't change what it resets to.

A reset restores the household record (calendar, chores, rewards, proposals, routines and what was decided) and
leaves the account itself alone: the parent code, paired TVs, sessions and voice links stay as they are.
"""
from __future__ import annotations

import hmac
import os
from typing import Any

from .models import HouseholdSnapshot

DEMO_ADMIN_HEADER = "X-Hometide-Demo-Admin"


def demo_emails() -> set[str]:
    return {item.strip().lower() for item in os.getenv("FAMILYOS_DEMO_ACCOUNTS", "").split(",") if item.strip()}


def is_demo_email(email: object) -> bool:
    value = str(email or "").strip().lower()
    return bool(value) and value in demo_emails()


def with_demo_flag(account: dict[str, Any] | None) -> dict[str, Any] | None:
    """The account as the apps see it, with ``demo`` set for the shared demo account."""
    if account is None:
        return None
    return {**account, "demo": is_demo_email(account.get("email"))}


def admin_token_ok(sent: str | None) -> bool:
    expected = os.getenv("FAMILYOS_DEMO_ADMIN_TOKEN", "")
    return bool(expected) and hmac.compare_digest(str(sent or ""), expected)


def restored_snapshot(baseline: dict[str, Any], current_revision: int, photo_ids: set[str],
                      calendar_ids: set[str]) -> HouseholdSnapshot:
    """The baseline household, ready to save over the current one.

    The revision moves past the current one so paired TVs and phones pick the reset up. Photos and connected
    calendars whose stored files or links were deleted since the baseline was saved are left out (with the
    calendar's events), so nothing points at data that's gone.
    """
    snapshot = HouseholdSnapshot.model_validate(baseline)
    snapshot.photos = [item for item in snapshot.photos if item.id in photo_ids]
    gone = {item.id for item in snapshot.calendars if item.id not in calendar_ids}
    if gone:
        snapshot.calendars = [item for item in snapshot.calendars if item.id not in gone]
        snapshot.events = [item for item in snapshot.events if item.calendarId not in gone]
    snapshot.revision = max(current_revision, snapshot.revision) + 1
    return snapshot
