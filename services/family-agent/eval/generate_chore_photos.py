"""Generate the labelled, synthetic chore-photo evaluation set (no people, no real homes).

Three chores x 20 scenes: 10 finished and 10 unfinished. Each chore includes deliberately hard cases:
finished scenes with a bright decoration, and unfinished scenes with only a little mess.
Deterministic: the same seed always produces the same images.

    python eval/generate_chore_photos.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).with_name("chore_photos")
SIZE = (800, 600)
BRIGHT = [(214, 40, 40), (30, 110, 230), (245, 190, 20), (40, 160, 70), (190, 50, 190), (250, 120, 20)]
CHORES = {
    "make-bed": ("Make the bed", "blanket pulled flat, pillows at the top, nothing on the floor"),
    "toys-away": ("Put toys away", "floor is clear and toys are in the bin"),
    "clear-table": ("Clear the table", "table is empty and wiped"),
}


def muted(rng: random.Random, base: tuple[int, int, int], spread: int = 12) -> tuple[int, int, int]:
    return tuple(max(0, min(255, value + rng.randint(-spread, spread))) for value in base)


def scatter(draw: ImageDraw.ImageDraw, rng: random.Random, count: int, area: tuple[int, int, int, int], size=(30, 70)) -> None:
    x0, y0, x1, y1 = area
    for _ in range(count):
        w, h = rng.randint(*size), rng.randint(*size)
        x, y = rng.randint(x0, x1 - w), rng.randint(y0, y1 - h)
        shape = rng.choice(["rect", "ellipse"])
        fill = rng.choice(BRIGHT)
        (draw.rectangle if shape == "rect" else draw.ellipse)([x, y, x + w, y + h], fill=fill)


def bed(rng: random.Random, done: bool, hard: bool) -> Image.Image:
    image = Image.new("RGB", SIZE, muted(rng, (222, 214, 198)))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 420, 800, 600], fill=muted(rng, (176, 150, 120)))  # floor
    draw.rectangle([140, 180, 660, 470], fill=muted(rng, (120, 92, 70)))  # frame
    blanket = muted(rng, (150, 160, 175), 8)
    if done:
        draw.rectangle([150, 250, 650, 450], fill=blanket)
        draw.rounded_rectangle([170, 195, 390, 250], 18, fill=(236, 234, 228))
        draw.rounded_rectangle([410, 195, 630, 250], 18, fill=(236, 234, 228))
        if hard:  # A bright decorative cushion on an otherwise made bed.
            draw.rounded_rectangle([340, 260, 470, 320], 14, fill=rng.choice(BRIGHT))
    else:
        for _ in range(9):
            points = [(rng.randint(150, 650), rng.randint(200, 460)) for _ in range(4)]
            draw.polygon(points, fill=muted(rng, (150, 160, 175), 25))
        draw.rounded_rectangle([200, 300, 330, 360], 18, fill=(236, 234, 228))
        scatter(draw, rng, 2 if hard else rng.randint(6, 10), (40, 440, 760, 590))
    return image.filter(ImageFilter.GaussianBlur(1.2))


def toys(rng: random.Random, done: bool, hard: bool) -> Image.Image:
    image = Image.new("RGB", SIZE, muted(rng, (228, 222, 210)))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 300, 800, 600], fill=muted(rng, (190, 160, 125)))  # wooden floor
    for x in range(0, 800, 90):
        draw.line([x, 300, x + 40, 600], fill=muted(rng, (170, 140, 108)), width=3)
    draw.rectangle([560, 200, 740, 330], fill=muted(rng, (120, 125, 130)))  # toy bin
    if done:
        if hard:  # A bright rug is part of a tidy room.
            draw.ellipse([180, 390, 470, 520], fill=rng.choice(BRIGHT))
    else:
        scatter(draw, rng, 2 if hard else rng.randint(8, 14), (30, 320, 770, 590), (25, 60))
    return image.filter(ImageFilter.GaussianBlur(1.2))


def table(rng: random.Random, done: bool, hard: bool) -> Image.Image:
    image = Image.new("RGB", SIZE, muted(rng, (218, 216, 208)))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 470, 800, 600], fill=muted(rng, (160, 140, 118)))
    draw.ellipse([100, 170, 700, 470], fill=muted(rng, (150, 118, 86)))  # table top
    if done:
        if hard:  # A bright vase of flowers left as a centrepiece.
            draw.rectangle([380, 240, 420, 320], fill=(90, 110, 140))
            for index in range(5):
                draw.ellipse([355 + index * 12, 205, 385 + index * 12, 235], fill=BRIGHT[index % len(BRIGHT)])
    else:
        for _ in range(2 if hard else rng.randint(5, 8)):
            x, y = rng.randint(150, 600), rng.randint(200, 400)
            draw.ellipse([x, y, x + 70, y + 45], fill=(240, 240, 236))
            draw.ellipse([x + 15, y + 10, x + 55, y + 35], fill=rng.choice(BRIGHT))
        if not hard:
            scatter(draw, rng, 3, (150, 200, 650, 430), (15, 30))
    return image.filter(ImageFilter.GaussianBlur(1.2))


SCENES = {"make-bed": bed, "toys-away": toys, "clear-table": table}


def main() -> None:
    OUT.mkdir(exist_ok=True)
    rng = random.Random(20261007)
    labels = []
    for chore_id, painter in SCENES.items():
        title, hint = CHORES[chore_id]
        for index in range(20):
            done = index < 10
            hard = index in (8, 9, 18, 19)
            name = f"{chore_id}-{index:02d}.jpg"
            painter(rng, done, hard).save(OUT / name, format="JPEG", quality=88)
            labels.append({"file": name, "chore": title, "hint": hint,
                           "label": "looks_done" if done else "not_done", "hard": hard})
    (OUT / "labels.json").write_text(json.dumps(labels, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(labels)} labelled synthetic photos to {OUT}")


if __name__ == "__main__":
    main()
