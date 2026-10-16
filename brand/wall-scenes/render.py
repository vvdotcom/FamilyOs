"""Render the wall calendar's looping weather scenes and their posters.

    python brand/wall-scenes/render.py            # needs numpy, Pillow and ffmpeg; about 10 minutes

Writes 8-second, 1080p H.264 loops to services/family-agent/app/scenes (served at /scenes/<name>.mp4)
and 1280x720 first-frame posters to packages/shared-ui/src/assets/scenes (bundled with the TV app).
Every moving element repeats exactly every 8 seconds, so each video loops without a visible jump.
Busy scenes (rain, storms, blizzards) are capped at about 2.2 Mbit/s for the Fire TV Stick.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import scenes  # noqa: E402

ROOT = HERE.parents[1]
VIDEOS = ROOT / "services/family-agent/app/scenes"
POSTERS = ROOT / "packages/shared-ui/src/assets/scenes"
T, FPS = 8.0, 30
CONSTELLATIONS = ["orion", "big-dipper", "cassiopeia", "cygnus"]  # same order as weatherScene.ts

JOBS = [("clear-day", "clear-day", 0), ("clear-evening", "clear-evening", 0)]
JOBS += [(f"clear-night-{name}", "clear-night", index) for index, name in enumerate(CONSTELLATIONS)]
for kind in ["rain", "heat", "snow", "blizzard", "storm"]:
    JOBS += [(f"{kind}-day", f"{kind}-day", 0), (f"{kind}-night", f"{kind}-night", 0)]


def frames(job: tuple[str, str, int], folder: str, part: int, parts: int) -> None:
    _, scene, night_index = job
    for i in range(part, int(T * FPS), parts):
        scenes.render(scene, i / FPS, T, text=False, night_index=night_index).save(f"{folder}/{i:04d}.png", compress_level=1)


def encode(name: str, folder: str) -> None:
    busy = name.split("-")[0] in ("rain", "storm", "blizzard")
    rate = ["-crf", "28", "-maxrate", "2200k", "-bufsize", "4400k"] if busy else ["-crf", "27"]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", f"{folder}/%04d.png", "-c:v", "libx264",
                    "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p", *rate, "-preset", "slow", "-g", "60",
                    "-movflags", "+faststart", "-an", str(VIDEOS / f"{name}.mp4")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{folder}/0000.png", "-vf", "scale=1280:720", "-q:v", "4",
                    str(POSTERS / f"{name}.jpg")], check=True)


def main() -> None:
    VIDEOS.mkdir(parents=True, exist_ok=True)
    POSTERS.mkdir(parents=True, exist_ok=True)
    workers = max(1, os.cpu_count() or 1)
    for job in JOBS:
        folder = tempfile.mkdtemp(prefix=f"scene-{job[0]}-")
        try:
            with ProcessPoolExecutor(workers) as pool:
                list(pool.map(frames, [job] * workers, [folder] * workers, range(workers), [workers] * workers))
            encode(job[0], folder)
            print(f"{job[0]}: {(VIDEOS / f'{job[0]}.mp4').stat().st_size // 1024} KB", flush=True)
        finally:
            shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
