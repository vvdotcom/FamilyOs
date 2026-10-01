"""Short-lived commands from voice to a household's paired TVs, like "open the calendar".

Commands only change what the TV shows, never household data, so any linked voice (a child's too) may send
them. They live in memory for 30 seconds: a TV that was off doesn't replay stale requests when it wakes.
"""
from __future__ import annotations

import re
import time
from collections import deque
from threading import Lock

# Spoken names, mapped to the TV app's routes. "Wall" is the wall calendar, not a route.
TV_SCREENS = {
    "home": ("Home", "the home screen"),
    "calendar": ("Calendar", "the calendar"),
    "chores": ("Chores", "chores"),
    "meals": ("Meals", "meals"),
    "lists": ("Lists", "your lists"),
    "photos": ("Photos", "family photos"),
    "family": ("Family", "the family page"),
    "approvals": ("Approvals", "approvals"),
    "settings": ("Settings", "settings"),
    "movement break": ("Move", "a movement break"),
    "family night": ("FamilyNight", "family night"),
    "wall calendar": ("Wall", "the wall calendar"),
}
SYNONYMS = {
    "home page": "home", "main screen": "home", "dashboard": "home",
    "schedule": "calendar", "agenda": "calendar", "events": "calendar", "week": "calendar", "planner": "calendar",
    "chore chart": "chores", "chore": "chores", "tasks": "chores", "jobs": "chores",
    "meal plan": "meals", "meal": "meals", "dinner": "meals", "dinners": "meals", "menu": "meals", "recipes": "meals",
    "list": "lists", "groceries": "lists", "grocery list": "lists", "shopping list": "lists", "to do list": "lists",
    "photo": "photos", "pictures": "photos", "slideshow": "photos", "photo slideshow": "photos",
    "members": "family", "people": "family",
    "requests": "approvals", "approval": "approvals",
    "move": "movement break", "exercise": "movement break", "wiggle": "movement break", "workout": "movement break",
    "movie night": "family night", "vote": "family night", "voting": "family night",
    "wall": "wall calendar", "screensaver": "wall calendar", "clock": "wall calendar", "ambient": "wall calendar",
}
FILLER = re.compile(r"\b(the|my|our|a|an|me|please|screen|page|tab|view|app|on the tv|on tv|up)\b")
TTL_SECONDS = 30
MAX_PER_HOUSEHOLD = 20


def resolve_screen(spoken: str | None) -> str | None:
    """'the shopping list page' -> 'lists'. Unknown phrases return None rather than guessing."""
    words = FILLER.sub(" ", (spoken or "").lower().replace("-", " "))
    phrase = " ".join(re.sub(r"[^a-z ]", " ", words).split())
    if phrase in TV_SCREENS:
        return phrase
    if phrase in SYNONYMS:
        return SYNONYMS[phrase]
    for name in sorted([*TV_SCREENS, *SYNONYMS], key=len, reverse=True):  # "family night" before "family".
        if phrase.startswith(name + " ") or phrase.endswith(" " + name):
            return SYNONYMS.get(name, name)
    return None


class TVCommandBus:
    def __init__(self) -> None:
        self._lock = Lock()
        self._seq = 0
        self._items: dict[str, deque[dict]] = {}

    def push(self, owner: str | None, command: dict) -> dict:
        with self._lock:
            self._seq += 1
            item = {**command, "seq": self._seq, "createdAt": time.time()}
            queue = self._items.setdefault(str(owner), deque(maxlen=MAX_PER_HOUSEHOLD))
            queue.append(item)
            return dict(item)

    def since(self, owner: str | None, after: int) -> tuple[list[dict], int]:
        """Commands newer than ``after`` (and not expired), plus the latest sequence number.

        ``after < 0`` means a TV that just started: it learns the latest number but replays nothing.
        """
        cutoff = time.time() - TTL_SECONDS
        with self._lock:
            queue = self._items.get(str(owner)) or deque()
            latest = max((item["seq"] for item in queue), default=self._seq)
            if after < 0:
                return [], latest
            fresh = [dict(item) for item in queue if item["seq"] > after and item["createdAt"] >= cutoff]
            return fresh, latest
