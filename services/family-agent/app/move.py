"""Original, bundled movement-break routines. General activity only, not medical or fitness advice.

Keep in sync with ``packages/domain/src/move.ts``; ``tests/test_move_sports.py`` checks the IDs match.
"""
from __future__ import annotations

SAFETY_NOTE = (
    "Move at your own pace, give everyone space, and skip anything that doesn't feel right. "
    "This is general activity, not medical or fitness advice."
)

MOVE_ROUTINES: dict[str, dict] = {
    "wiggle-warmup": {
        "id": "wiggle-warmup",
        "name": "Wiggle warm-up",
        "stars": 2,
        "restSeconds": 10,
        "moves": [
            {"name": "Reach for the sky", "seconds": 30, "instruction": "Stretch both arms up tall, then float them down."},
            {"name": "Shake it out", "seconds": 30, "instruction": "Wiggle your hands, arms, and shoulders loose."},
            {"name": "March in place", "seconds": 40, "instruction": "Lift your knees and swing your arms."},
            {"name": "Side reaches", "seconds": 30, "instruction": "Reach one arm over your head to the side, then switch."},
        ],
    },
    "jungle-journey": {
        "id": "jungle-journey",
        "name": "Jungle journey",
        "stars": 3,
        "restSeconds": 12,
        "moves": [
            {"name": "Tiptoe past the tiger", "seconds": 30, "instruction": "Walk in place quietly on your tiptoes."},
            {"name": "Frog hops", "seconds": 30, "instruction": "Crouch low and do small hops in place."},
            {"name": "Tall tree balance", "seconds": 30, "instruction": "Stand on one foot and sway like a tree. Switch halfway."},
            {"name": "Swing through the vines", "seconds": 40, "instruction": "Reach and pull like you're climbing, arm over arm."},
            {"name": "Sleepy sloth stretch", "seconds": 30, "instruction": "Slowly roll down toward your toes, then roll back up."},
        ],
    },
    "dance-party": {
        "id": "dance-party",
        "name": "Living room dance party",
        "stars": 3,
        "restSeconds": 10,
        "moves": [
            {"name": "Freestyle", "seconds": 45, "instruction": "Dance any way you like."},
            {"name": "Freeze pose", "seconds": 20, "instruction": "Strike a pose and hold it still."},
            {"name": "Copy the leader", "seconds": 45, "instruction": "Take turns leading a move for everyone to copy."},
            {"name": "Cool-down sway", "seconds": 30, "instruction": "Sway side to side and take slow breaths."},
        ],
    },
}


def routine_summary(routine: dict) -> dict:
    seconds = sum(move["seconds"] for move in routine["moves"]) + routine["restSeconds"] * (len(routine["moves"]) - 1)
    return {"id": routine["id"], "name": routine["name"], "stars": routine["stars"],
            "moves": len(routine["moves"]), "minutes": round(seconds / 60)}
