"""Hometide wall-calendar weather scenes: flat, layered landscape illustrations, drawn in code.

Original artwork. render.py turns these into the looping videos the TV plays.

render(name, t, T) draws one frame. Every moving element repeats exactly every T seconds, so frames
0..T render a seamless loop. Static layers are cached per scene.
"""
from __future__ import annotations

import math
import random
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1920, 1080
FONTS = str(Path(__file__).resolve().parents[2] / "packages/shared-ui/src/assets/fonts") + "/"


def hexc(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, k):
    return tuple(int(round(a[i] + (b[i] - a[i]) * k)) for i in range(3))


# ---------------------------------------------------------------- palettes
SCENES = {
    "clear": dict(
        label="Clear", temp="72°", hilo="High 75° · Low 58°",
        sky=["#3b2a5c", "#a8496a", "#f08a4b", "#ffd690"],
        sun=("#fff1c4", 0.56, 0.36, 70), haze="#f7b77a",
        ridges=["#e9a26a", "#cf6f4f", "#a24a45", "#6e2f3e"], forest="#4a1d33", ground="#2d1124",
        window="#ffcf6a",
        summary="Clear and 72° all afternoon. Jordan has the 3:15 pickup, and it's a good evening for Leo's bike ride after dinner.",
        next=("Emma's soccer", "4:00", "Lindsey drives"),
    ),
    "rain": dict(
        label="Heavy rain", temp="58°", hilo="High 61° · Low 52°",
        sky=["#1f2a35", "#33424f", "#4f6170", "#6d7f8c"],
        sun=None, haze="#7d8e9a",
        ridges=["#5d6e7b", "#47586a", "#364656", "#273542"], forest="#1b2631", ground="#121b24",
        window="#ffc965", cloud="#26303a",
        summary="Heavy rain until about 6 pm. Emma's soccer at 4 is still on, so pack rain jackets. Lindsey's driving.",
        next=("Emma's soccer", "4:00", "Lindsey drives"),
    ),
    "heat": dict(
        label="Extreme heat", temp="108°", hilo="High 111° · Low 86°",
        sky=["#e8553a", "#f47b3c", "#ffb05a", "#ffe29a"],
        sun=("#fffbe6", 0.52, 0.24, 96), haze="#ffc27a",
        ridges=["#f7b071", "#e88a50", "#c9653a", "#9a4428"], forest="#6e2e1d", ground="#4c1f14",
        window="#fff1b0",
        summary="108° by 2 pm. Leo's park playdate is at 1; the morning or the splash pad would be cooler. Pack extra water.",
        next=("Leo's playdate", "1:00", "Jordan drives"),
    ),
    "snow": dict(
        label="Light snow", temp="29°", hilo="High 31° · Low 22°",
        sky=["#8a9cb4", "#a9b9cc", "#c9d5e2", "#e4ebf2"],
        sun=None, haze="#dfe7ef",
        ridges=["#c6d1de", "#a5b5c8", "#8597ae", "#64768f"], forest="#465770", ground="#eef3f8",
        window="#ffc865", snowcaps=True,
        summary="Light snow through the evening, about 2 inches. Leave 10 minutes early for piano at 5, and boots by the door.",
        next=("Emma's piano", "5:00", "Jordan drives"),
    ),
    "blizzard": dict(
        label="Blizzard warning", temp="14°", hilo="High 18° · Low 6°",
        sky=["#9aa8b8", "#b4c0cd", "#cbd4de", "#dde4eb"],
        sun=None, haze="#e4e9ef",
        ridges=["#c9d2dc", "#b6c1ce", "#a0aebd", "#8494a7"], forest="#6c7c90", ground="#eef2f6",
        window="#ffc865", snowcaps=True, whiteout=0.38,
        summary="Blizzard warning until noon tomorrow. Soccer at 4 is likely off, so check before anyone leaves. Stay in tonight.",
        next=("Family movie night", "7:00", "Leo picks"),
    ),
    "storm": dict(
        label="Thunderstorms", temp="81°", hilo="High 94° · Low 76°",
        sky=["#1b1630", "#2e2547", "#4a3a5e", "#6b5370"],
        sun=None, haze="#6d5878",
        ridges=["#5a4a66", "#463a56", "#342b45", "#241d34"], forest="#191427", ground="#100c1b",
        window="#ffc865", cloud="#1d1830",
        summary="Thunderstorms from 5 pm with gusts to 45 mph. Leave for piano by 4:30 to beat it, and bring the patio chairs in.",
        next=("Emma's piano", "5:00", "Jordan drives"),
    ),
}


NIGHT_SUMMARY = {
    "clear": "Clear and 54° tonight. Tomorrow starts with school drop-off at 7:45, and Lindsey has Emma's soccer at 4.",
    "rain": "Rain until about midnight, dry by morning. Tomorrow's 7:45 drop-off should be fine. Jackets by the door anyway.",
    "heat": "Still 94° at 9 pm. Tomorrow hits 110° by noon, so Leo's 1:00 playdate is better moved to the morning.",
    "snow": "Snow overnight, 3 to 4 inches by morning. Leave 15 minutes early for drop-off, and Jordan's on shoveling.",
    "blizzard": "Blizzard warning through tomorrow noon. Check for school closings at 6 am before anyone heads out.",
    "storm": "Storms until about 11 pm. Phones charged, flashlight in the kitchen drawer. Tomorrow's soccer is still on.",
}

CLEAR_DAY = dict(
    label="Sunny", temp="76°", hilo="High 79° · Low 58°",
    sky=["#3f78ad", "#6aa2cb", "#a9cfe0", "#f3e2b6"],
    sun=("#fff7da", 0.52, 0.22, 64), haze="#d6e6ea",
    ridges=["#a7c6cc", "#7aa3ae", "#55808c", "#3a626c"], forest="#24464f", ground="#183039",
    window="#ffd47a",
    summary="Sunny and 76°. Jordan has the 3:15 pickup, and Emma's soccer at 4 is a perfect field day. Sunscreen in the bag.",
    next=("Emma's soccer", "4:00", "Lindsey drives"),
)

CLEAR_NIGHT = dict(
    label="Clear night", temp="54°", hilo="Low 51° · High tomorrow 77°",
    sky=["#050816", "#0b1430", "#17254a", "#2b3a63"],
    sun=None, moon=("#f3efe0", 0.645, 0.42, 52), stars=True, haze="#33416a",
    ridges=["#34446b", "#28365a", "#1d2948", "#141d36"], forest="#0e152a", ground="#0a1022",
    window="#ffc65c",
)


def night_of(p: dict) -> dict:
    q = dict(p)
    navy = (11, 16, 40)
    dim = lambda h, k=0.42, n=0.45: "#%02x%02x%02x" % mix(tuple(int(c * k) for c in hexc(h)), navy, n)
    q["sky"] = [dim(c, 0.40, 0.5) for c in p["sky"]]
    q["ridges"] = [dim(c) for c in p["ridges"]]
    q["forest"] = dim(p["forest"], 0.5, 0.4)
    q["ground"] = dim(p["ground"], 0.55 if p["ground"] > "#c" else 0.5, 0.35)
    q["haze"] = dim(p["haze"], 0.45, 0.45)
    if "cloud" in p:
        q["cloud"] = dim(p["cloud"], 0.6, 0.3)
    q["sun"] = None
    q["dimfx"] = 0.7
    return q


def kind(name: str) -> str:
    return name.split("-")[0]


def build_variants():
    base = dict(SCENES)
    out = {"clear-day": CLEAR_DAY, "clear-evening": base["clear"]}
    for n, p in base.items():
        if n != "clear":
            out[f"{n}-day"] = p
            out[f"{n}-night"] = night_of(p)
    for n, txt in NIGHT_SUMMARY.items():
        key = f"{n}-night"
        if key in out:
            out[key] = dict(out[key], summary=txt, clock="9:12", date="Wednesday, October 8")
    out["clear-night"] = dict(CLEAR_NIGHT, summary=NIGHT_SUMMARY["clear"], clock="9:12",
                              next=("School drop-off", "7:45", "Jordan drives · tomorrow"))
    for key in out:
        if key.endswith("-night") and key != "clear-night":
            out[key] = dict(out[key], next=("School drop-off", "7:45", "Jordan drives · tomorrow"))
    out["heat-night"] = dict(out["heat-night"], temp="94°", hilo="Low 86° · High tomorrow 110°")
    return out


# ---------------------------------------------------------------- helpers
def gradient(stops: list[str]) -> np.ndarray:
    cols = np.array([hexc(s) for s in stops], dtype=np.float32)
    ys = np.linspace(0, 1, H)
    pos = np.linspace(0, 1, len(stops))
    out = np.empty((H, 3), np.float32)
    for c in range(3):
        out[:, c] = np.interp(ys, pos, cols[:, c])
    return np.repeat(out[:, None, :], W, axis=1)


def ridge_line(seed: int, base: float, amp: float, peaky: float = 0.5) -> np.ndarray:
    rnd = random.Random(seed)
    xs = np.arange(W, dtype=np.float32)
    y = np.zeros(W, np.float32)
    for freq, a in [(0.0010, 1.0), (0.0024, 0.5), (0.0055, 0.16), (0.012, 0.045)]:
        ph = rnd.uniform(0, 6.28)
        s = np.sin(xs * freq * 6.2832 + ph)
        y += a * ((1 - peaky) * s + peaky * (1 - 2 * np.abs(s)))
    y = y / np.abs(y).max()
    return base - amp * y


def fill_below(img: np.ndarray, line: np.ndarray, color) -> np.ndarray:
    yy = np.arange(H)[:, None]
    mask = yy >= line[None, :]
    img[mask] = color
    return mask


def fog_band(img: np.ndarray, center: float, height: float, color, strength: float):
    yy = np.arange(H, dtype=np.float32)
    k = np.clip(1 - np.abs(yy - center) / height, 0, 1) ** 1.6 * strength
    img[:] = img * (1 - k[:, None, None]) + np.array(color, np.float32) * k[:, None, None]


def pines(draw: ImageDraw.ImageDraw, line: np.ndarray, color, seed: int, scale: float, density: float,
          snow=None, s=2):
    rnd = random.Random(seed)
    x = 0.0
    while x < W:
        x += rnd.uniform(9, 22) / density
        xi = int(min(W - 1, x))
        h = rnd.uniform(40, 110) * scale
        w = h * rnd.uniform(0.26, 0.34)
        base = line[xi] + rnd.uniform(4, 14) * scale
        top = base - h
        pts = [(x * s, top * s)]
        tiers = 4
        for i in range(1, tiers + 1):  # stepped pine silhouette
            yy = top + h * i / tiers
            ww = w * (0.35 + 0.65 * i / tiers)
            pts.append(((x + ww / 2) * s, yy * s))
            if i < tiers:
                pts.append(((x + ww * 0.22) * s, (yy - h * 0.03) * s))
        right = pts[1:]
        left = [(2 * x * s - px, py) for (px, py) in reversed(right)]
        draw.polygon(pts[:1] + right + left, fill=color)
        if snow:
            draw.polygon([(x * s, top * s), ((x + w * 0.16) * s, (top + h * 0.22) * s),
                          ((x - w * 0.16) * s, (top + h * 0.22) * s)], fill=snow)


CONSTELLATIONS = {
    "Orion": ([(0, 0), (1.6, 0.15), (0.55, 1.3), (0.8, 1.36), (1.05, 1.42), (0.3, 2.5), (1.75, 2.35), (0.85, -0.55)],
              [(0, 1), (0, 2), (1, 4), (2, 3), (3, 4), (2, 5), (4, 6), (0, 7), (1, 7)]),
    "Big Dipper": ([(0, 0), (0.9, -0.15), (1.7, -0.1), (2.45, 0.1), (2.55, 0.85), (3.6, 0.95), (3.75, 0.2)],
                   [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 3)]),
    "Cassiopeia": ([(0, 0.1), (0.8, 0.7), (1.5, 0.25), (2.3, 0.8), (3.0, 0.05)], [(0, 1), (1, 2), (2, 3), (3, 4)]),
    "Cygnus": ([(0, 0), (1.0, 0.95), (2.1, 2.05), (1.85, 0.25), (0.25, 1.75), (1.45, 1.5)],
               [(0, 1), (1, 5), (5, 2), (3, 1), (1, 4)]),
}


def constellation_for(night_index: int) -> str:
    names = list(CONSTELLATIONS)
    return names[night_index % len(names)]


@lru_cache(maxsize=None)
def star_field(seed: int = 7):
    rnd = random.Random(seed)
    return [(rnd.uniform(0, W), rnd.uniform(0, 520) ** 1.0, rnd.uniform(0.6, 2.0), rnd.uniform(0, 6.28),
             rnd.choice([1, 2, 3])) for _ in range(260)]


def draw_night_sky(frame: Image.Image, t: float, T: float, constellation: str):
    lay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for x, y, r, ph, cyc in star_field():
        a = int(110 + 120 * (0.5 + 0.5 * math.sin(2 * math.pi * cyc * t / T + ph)))  # twinkle, loop-safe
        d.ellipse([x - r, y - r, x + r, y + r], fill=(235, 240, 255, a))
    pts, edges = CONSTELLATIONS[constellation]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    sc = 230 / max(max(xs) - min(xs), max(ys) - min(ys))
    ox = 1000 - (max(xs) + min(xs)) / 2 * sc
    oy = 160 - (max(ys) + min(ys)) / 2 * sc
    P = [(ox + x * sc, oy + y * sc) for x, y in pts]
    for a_, b_ in edges:
        d.line([P[a_], P[b_]], fill=(190, 205, 255, 70), width=2)
    for i, (x, y) in enumerate(P):
        tw = 0.5 + 0.5 * math.sin(2 * math.pi * 2 * t / T + i)
        r = 4.2 + 1.2 * tw
        d.ellipse([x - r * 2.6, y - r * 2.6, x + r * 2.6, y + r * 2.6], fill=(200, 215, 255, 40))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(250, 252, 255, 255))
    d.text((min(p[0] for p in P), max(p[1] for p in P) + 22), constellation.upper(),
           font=font("Figtree-700.ttf", 20), fill=(200, 212, 255, 150))
    frame.alpha_composite(lay)


# ---------------------------------------------------------------- static background
@lru_cache(maxsize=None)
def background(name: str) -> Image.Image:
    p = SCENES[name]
    img = gradient(p["sky"])

    if p.get("sun"):
        col, fx, fy, r = p["sun"]
        cx, cy = fx * W, fy * H
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        glow = np.clip(1 - d / (r * 7), 0, 1) ** 2.2 * 0.55
        img = img * (1 - glow[..., None]) + np.array(hexc(col), np.float32) * glow[..., None]
        img[d <= r] = hexc(col)

    if p.get("moon"):
        col, fx, fy, r = p["moon"]
        cx, cy = fx * W, fy * H
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        dd = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        glow = np.clip(1 - dd / (r * 6), 0, 1) ** 2.4 * 0.35
        img = img * (1 - glow[..., None]) + np.array(hexc(col), np.float32) * glow[..., None]
        disc = dd <= r
        shadow = np.sqrt((xx - cx - r * 0.42) ** 2 + (yy - cy + r * 0.18) ** 2) <= r * 0.92
        img[disc] = hexc(col)
        img[disc & shadow] = img[disc & shadow] * 0.18 + np.array(hexc(p["sky"][1]), np.float32) * 0.82

    haze = hexc(p["haze"])
    bases = [560, 640, 720, 800]
    amps = [150, 140, 110, 80]
    lines = []
    for i, (c, b, a) in enumerate(zip(p["ridges"], bases, amps)):
        line = ridge_line(seed=11 + i * 7 + len(name), base=b, amp=a, peaky=0.65 - i * 0.12)
        lines.append(line)
        fill_below(img, line, hexc(c))
        if p.get("snowcaps") and i < 2:  # snow on the high peaks
            yy = np.arange(H)[:, None]
            cap = (yy >= line[None, :]) & (yy <= line[None, :] + 26) & (line[None, :] < b - a * 0.35)
            img[cap] = mix(hexc(c), (255, 255, 255), 0.75 if not p.get('dimfx') else 0.32)
        fog_band(img, center=b + 60, height=95, color=haze, strength=0.42 - i * 0.07)

    # supersampled vector layer: treeline, open field, cabin, framing pines
    S = 2
    over = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    snowy = bool(p.get("snowcaps"))
    snowc = (172, 184, 208) if p.get("dimfx") else (248, 250, 253)
    forest = hexc(p["forest"])
    forest_line = ridge_line(seed=91, base=812, amp=26, peaky=0.2)
    pines(d, forest_line, forest, seed=5, scale=0.85, density=1.1,
          snow=mix(forest, snowc, 0.8) if snowy else None, s=S)
    d.polygon([(x * S, (forest_line[min(x, W - 1)] + 8) * S) for x in range(0, W + 8, 8)] +
              [(W * S, H * S), (0, H * S)], fill=forest)

    # the open field in front of the trees
    field = hexc(p["ground"]) if snowy else mix(forest, haze, 0.30)
    fl = [(x, 858 - 14 * math.sin(x / W * math.pi * 2 + 0.8)) for x in range(0, W + 8, 8)]
    d.polygon([(x * S, y * S) for x, y in fl] + [(W * S, H * S), (0, H * S)], fill=field)
    # darker rise in the foreground
    fgc = mix(hexc(p["ground"]), (120, 135, 155), 0.25) if snowy else mix(forest, (0, 0, 0), 0.25)
    hill = [(x, 1010 - 60 * math.exp(-((x - 260) / 520) ** 2) - 10 * math.sin(x / 90)) for x in range(0, W + 8, 8)]
    d.polygon([(x * S, y * S) for x, y in hill] + [(W * S, H * S), (0, H * S)], fill=fgc)
    rnd = random.Random(8)
    for x, y in hill[::2]:  # grass tufts
        for _ in range(2):
            gx = x + rnd.uniform(-6, 6)
            gh = rnd.uniform(10, 26)
            d.polygon([((gx - 3) * S, (y + 4) * S), ((gx + rnd.uniform(-6, 6)) * S, (y - gh) * S), ((gx + 3) * S, (y + 4) * S)], fill=fgc)

    # the cabin, with a warm window
    cab_x, cab_y, k = 1480, 884, 1.15
    dark = mix(forest, (0, 0, 0), 0.15)
    P = lambda pts: [((cab_x + x * k) * S, (cab_y + y * k) * S) for x, y in pts]
    d.polygon(P([(0, 0), (130, 0), (130, -66), (65, -112), (0, -66)]), fill=dark)
    d.polygon(P([(-12, -60), (65, -122), (142, -60), (136, -54), (65, -110), (-6, -54)]), fill=mix(dark, (0, 0, 0), 0.3))
    d.rectangle(P([(94, -128), (110, -82)])[0] + P([(94, -128), (110, -82)])[1], fill=dark)
    win = hexc(p["window"])
    d.rectangle(P([(24, -52), (54, -24)])[0] + P([(24, -52), (54, -24)])[1], fill=win)
    d.rectangle(P([(78, -52), (104, 0)])[0] + P([(78, -52), (104, 0)])[1], fill=mix(dark, win, 0.25))
    if snowy:
        d.polygon(P([(-14, -60), (65, -124), (144, -60), (65, -104)]), fill=snowc)

    # tall pines framing the left edge
    for x0, h in [(70, 600), (190, 430), (276, 320)]:
        w = h * 0.30
        top = 1080 - h
        pts = [(x0, top)]
        for i in range(1, 7):
            yy = top + h * i / 7
            ww = w * (0.3 + 0.7 * i / 7)
            pts.append((x0 + ww / 2, yy))
            if i < 7:
                pts.append((x0 + ww * 0.2, yy - h * 0.022))
        right = pts[1:]
        left = [(2 * x0 - px, py) for (px, py) in reversed(right)]
        d.polygon([(x * S, y * S) for x, y in pts[:1] + right + left], fill=mix(fgc, (0, 0, 0), 0.25) if not snowy else mix(forest, (0, 0, 0), 0.2))
        if snowy:
            for i in range(1, 7, 2):
                yy = top + h * i / 7
                ww = w * (0.3 + 0.7 * i / 7)
                d.polygon([((x0 - ww / 2) * S, yy * S), (x0 * S, (yy - h * 0.09) * S), ((x0 + ww / 2) * S, yy * S),
                           (x0 * S, (yy - h * 0.05) * S)], fill=snowc)
    over = over.resize((W, H), Image.LANCZOS)

    base = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    gx, gy = 1480 + 39 * 1.15, 884 - 38 * 1.15
    ImageDraw.Draw(glow).ellipse([gx - 70, gy - 60, gx + 70, gy + 60], fill=hexc(p["window"]) + (90,))
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(28)))
    base.alpha_composite(over)
    return base.convert("RGB")


# ---------------------------------------------------------------- moving layers
@lru_cache(maxsize=None)
def sky_mask(name: str) -> np.ndarray:
    """1 above the farthest ridge (the open sky), fading to 0 just below it: rays stay in the sky."""
    p = SCENES[name]
    line = ridge_line(seed=11 + len(name), base=560, amp=150, peaky=0.65)
    yy = np.arange(H, dtype=np.float32)[:, None]
    return np.clip((line[None, :] + 30 - yy) / 60, 0, 1).astype(np.float32)


def sun_rays(frame: Image.Image, name: str, t: float, T: float):
    """Beaming sunshine: soft rays that turn one ray-spacing per loop (seamless) and pulse gently."""
    p = SCENES[name]
    if not p.get("sun"):
        return
    col, fx, fy, r = p["sun"]
    cx, cy = fx * W, fy * H
    hot = kind(name) == "heat"
    n = 16
    turn = 2 * math.pi / n * (t / T)
    pulse = 0.82 + 0.18 * math.sin(2 * math.pi * t / T)
    lay = Image.new("L", frame.size, 0)
    d = ImageDraw.Draw(lay)
    reach = 1500
    for i in range(n):
        a = turn + 2 * math.pi * i / n
        width = 0.075 if i % 2 == 0 else 0.045
        strength = (70 if hot else 52) if i % 2 == 0 else (44 if hot else 32)
        pts = [(cx, cy), (cx + reach * math.cos(a - width), cy + reach * math.sin(a - width)),
               (cx + reach * math.cos(a + width), cy + reach * math.sin(a + width))]
        d.polygon(pts, fill=int(strength * pulse))
    lay = lay.filter(ImageFilter.GaussianBlur(14))
    alpha = np.asarray(lay, dtype=np.float32)
    yy, xx = np.ogrid[0:H, 0:W]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    alpha *= np.clip(1 - dist / reach, 0, 1) ** 0.8  # fade with distance from the sun
    alpha *= sky_mask(name)
    # a breathing halo around the disc
    halo = np.clip(1 - dist / (r * (3.2 + 0.5 * pulse)), 0, 1) ** 2 * (110 if hot else 80) * pulse
    alpha = np.clip(alpha + halo * sky_mask(name), 0, 255)
    glow = Image.new("RGBA", frame.size, hexc(col) + (0,))
    glow.putalpha(Image.fromarray(alpha.astype(np.uint8), "L"))
    frame.alpha_composite(glow)


def shooting_star(frame: Image.Image, t: float, T: float):
    """One shooting star per loop, across the upper sky."""
    phase = (t / T - 0.55) % 1.0
    if phase > 0.09:
        return
    k = phase / 0.09
    x0, y0, x1, y1 = 520, 90, 1180, 330
    x, y = x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
    fade = math.sin(math.pi * k)
    lay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for j in range(12):  # tapering tail
        tk = max(0.0, k - j * 0.012)
        tx, ty = x0 + (x1 - x0) * tk, y0 + (y1 - y0) * tk
        d.ellipse([tx - 3 + j * 0.2, ty - 3 + j * 0.2, tx + 3 - j * 0.2, ty + 3 - j * 0.2],
                  fill=(255, 255, 255, int(220 * fade * (1 - j / 12))))
    d.line([(x0 + (x1 - x0) * max(0.0, k - 0.18), y0 + (y1 - y0) * max(0.0, k - 0.18)), (x, y)],
           fill=(220, 230, 255, int(150 * fade)), width=3)
    frame.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.2)))
    frame.alpha_composite(lay)


@lru_cache(maxsize=None)
def cloud_sprite(name: str, seed: int, w: int, h: int, color: str, alpha: int) -> Image.Image:
    rnd = random.Random(seed)
    S = 2
    m = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(m)
    for _ in range(14):
        cw = rnd.uniform(0.18, 0.42) * w
        ch = cw * rnd.uniform(0.45, 0.7)
        cx = rnd.uniform(cw / 2, w - cw / 2)
        cy = h * 0.86 - ch * rnd.uniform(0.05, 0.45)
        d.ellipse([(cx - cw / 2) * S, (cy - ch / 2) * S, (cx + cw / 2) * S, (cy + ch / 2) * S], fill=alpha)
    m = m.resize((w, h), Image.LANCZOS)
    arr = np.asarray(m).copy()
    arr[int(h * 0.86):] = 0  # flat cloud base
    m = Image.fromarray(arr, "L")
    sprite = Image.new("RGBA", (w, h), hexc(color) + (0,))
    sprite.putalpha(m)
    return sprite


def clouds(frame: Image.Image, name: str, t: float, T: float):
    p = SCENES[name]
    heavy = "cloud" in p
    color = p.get("cloud") or mix(hexc(p["sky"][-1]), (255, 255, 255), 0.55)
    color = color if isinstance(color, str) else "#%02x%02x%02x" % color
    specs = ([(0, 1200, 330, -120, 250), (1, 1300, 360, 10, 245), (2, 1000, 300, -60, 240), (3, 1400, 340, 120, 235)]
             if heavy else [(4, 560, 170, 330, 150), (5, 440, 140, 420, 120)])
    for seed, cw, ch, y, a in specs:
        # The clouds hold still: drifting banks pulled the eye away from the calendar.
        span = W + cw
        x = (seed * 397) % span - cw
        spr = cloud_sprite(name, seed, cw, ch, color, a)
        frame.alpha_composite(spr, (int(x), int(y)))
        if x + cw > W:
            frame.alpha_composite(spr, (int(x - span), int(y)))


def precipitation(frame: Image.Image, name: str, t: float, T: float):
    p = SCENES[name]
    name = kind(name)
    lay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    rnd = random.Random(42)
    if name in ("rain", "storm"):
        n = 900 if name == "storm" else 750
        wind = 0.18
        for i in range(n):
            depth = rnd.random()
            L = 18 + 46 * depth
            laps = 3 + int(depth * 3)  # integer number of falls per loop
            span = H + L
            y = (rnd.uniform(0, span) + laps * span * t / T) % span - L
            x0 = rnd.uniform(-200, W)
            x = x0 + y * wind
            a = int(60 + 120 * depth)
            d.line([(x, y), (x + L * wind, y + L)], fill=(205, 220, 232, a), width=1 if depth < 0.5 else 2)
    if name in ("snow", "blizzard"):
        n = 1400 if name == "blizzard" else 420
        wind = 1.1 if name == "blizzard" else 0.12
        for i in range(n):
            depth = rnd.random()
            r = 1.2 + 3.6 * depth
            laps = (2 if name == "blizzard" else 1) + int(depth * 2)
            span = H + 20
            y = (rnd.uniform(0, span) + laps * span * t / T) % span - 10
            sway = 12 * math.sin(2 * math.pi * (t / T) * 2 + i)  # 2 full sways per loop
            x = (rnd.uniform(0, W) + y * wind + sway) % W
            a = int(150 + 100 * depth)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
    if name == "heat":  # slow rising dust motes
        for i in range(60):
            span = H
            y = H - (rnd.uniform(0, span) + span * t / T) % span
            x = rnd.uniform(0, W) + 20 * math.sin(2 * math.pi * t / T + i)
            r = rnd.uniform(1.5, 3.5)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 240, 200, 90))
    frame.alpha_composite(lay)


def heat_shimmer(frame: Image.Image, t: float, T: float):
    a = np.asarray(frame).copy()
    y0, y1 = 480, 790  # the hazy mountains only; shimmering trees look torn
    band = a[y0:y1].copy()
    for row in range(band.shape[0]):
        shift = int(round(3.5 * math.sin(row * 0.07 + 2 * math.pi * 3 * t / T)))
        if shift:
            band[row] = np.roll(band[row], shift, axis=0)
    a[y0:y1] = band
    frame.paste(Image.fromarray(a, "RGBA"))


def lightning(frame: Image.Image, t: float, T: float):
    # two flashes per loop at fixed phases
    for phase in (0.18, 0.66):
        dt = (t / T - phase) % 1.0
        if dt < 0.045:
            k = 1 - dt / 0.045
            flash = Image.new("RGBA", frame.size, (210, 200, 255, int(70 * k)))
            frame.alpha_composite(flash)
            rnd = random.Random(int(phase * 100))
            x, y = rnd.uniform(900, 1300), 300
            pts = [(x, y)]
            while y < 640:
                y += rnd.uniform(25, 55)
                x += rnd.uniform(-38, 38)
                pts.append((x, y))
            bolt = Image.new("RGBA", frame.size, (0, 0, 0, 0))
            bd = ImageDraw.Draw(bolt)
            bd.line(pts, fill=(235, 230, 255, int(255 * k)), width=5, joint="curve")
            glow = bolt.filter(ImageFilter.GaussianBlur(10))
            frame.alpha_composite(glow)
            frame.alpha_composite(bolt)


def whiteout(frame: Image.Image, strength: float, t: float, T: float):
    k = strength * (0.85 + 0.15 * math.sin(2 * math.pi * t / T))
    frame.alpha_composite(Image.new("RGBA", frame.size, (238, 242, 247, int(255 * k))))


def smoke(frame: Image.Image, name: str, t: float, T: float):
    night = name.endswith("night")
    name = kind(name)
    if name == "heat":
        return
    lay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    cx, cy = 1480 + 102 * 1.15, 884 - 130 * 1.15
    wind = 2.2 if name in ("blizzard", "storm") else 0.7
    col = (235, 238, 242) if name in ("snow", "blizzard", "clear") else (150, 160, 170)
    if night:
        col = (120, 130, 155)
    n = 7
    for i in range(n):
        ph = (t / T * 2 + i / n) % 1.0  # 2 cycles per loop
        r = 8 + 34 * ph
        y = cy - 230 * ph
        x = cx + wind * 110 * ph ** 1.4 + 8 * math.sin(ph * 6 + i)
        a = int(110 * (1 - ph) * min(1, ph * 6))
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (a,))
    frame.alpha_composite(lay.filter(ImageFilter.GaussianBlur(4)))


# ---------------------------------------------------------------- wall-screen text
@lru_cache(maxsize=None)
def font(file: str, size: int):
    return ImageFont.truetype(FONTS + file, size)


def wrap(text, f, width, d):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if d.textlength(trial, font=f) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w_
    lines.append(cur)
    return lines


def card(frame, box, alpha=110):
    panel = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle(box, radius=26, fill=(10, 12, 20, alpha))
    frame.alpha_composite(panel)


def overlay(frame: Image.Image, name: str):
    p = SCENES[name]
    yy = np.linspace(0, 1, H, dtype=np.float32)
    alpha = np.clip((0.52 - yy) / 0.52, 0, 1) ** 1.3 * 0.42
    scrim = np.zeros((H, W, 4), np.uint8)
    scrim[..., 3] = (alpha[:, None] * 255).astype(np.uint8)
    frame.alpha_composite(Image.fromarray(scrim, "RGBA"))

    d = ImageDraw.Draw(frame)
    white, soft, accent = (255, 255, 255, 255), (255, 255, 255, 220), (255, 214, 150, 255)
    m = 96  # title-safe margin
    big = font("Bricolage-800-64.ttf", 140)
    clock = p.get("clock", "3:42")
    d.text((m, 56), clock, font=big, fill=white)
    tw = d.textlength(clock, font=big)
    d.text((m + tw + 14, 146), "PM", font=font("Figtree-700.ttf", 38), fill=soft)
    d.text((m + 4, 226), p.get("date", "Wednesday, October 8"), font=font("Figtree-500.ttf", 36), fill=soft)

    tf = font("Bricolage-800-64.ttf", 112)
    tw = d.textlength(p["temp"], font=tf)
    d.text((W - m - tw, 62), p["temp"], font=tf, fill=white)
    for i, (txt, f) in enumerate([(p["label"], font("Figtree-700.ttf", 38)), (p["hilo"], font("Figtree-500.ttf", 30))]):
        w_ = d.textlength(txt, font=f)
        d.text((W - m - w_, 196 + i * 48), txt, font=f, fill=white if i == 0 else soft)

    # Hometide's note: the weather joined with the family's day
    bx, by, bw = m, 316, 960
    sf = font("Figtree-500.ttf", 36)
    lines = wrap(p["summary"], sf, bw - 60, d)
    bh = max(84 + 48 * len(lines), 214)
    card(frame, [bx, by, bx + bw, by + bh])
    d.text((bx + 30, by + 22), "HOMETIDE · TODAY", font=font("Figtree-700.ttf", 24), fill=accent)
    for i, ln in enumerate(lines):
        d.text((bx + 30, by + 60 + i * 48), ln, font=sf, fill=white)

    what, when, who = p["next"]
    nw = 440
    nx = W - m - nw
    card(frame, [nx, by, nx + nw, by + bh])
    d.text((nx + 30, by + 22), "NEXT UP", font=font("Figtree-700.ttf", 24), fill=accent)
    d.text((nx + 30, by + 54), when, font=font("Bricolage-800-64.ttf", 56), fill=white)
    d.text((nx + 30 + d.textlength(when, font=font("Bricolage-800-64.ttf", 56)) + 18, by + 78),
           "AM" if when == "7:45" else "PM",
           font=font("Figtree-700.ttf", 26), fill=soft)
    d.text((nx + 30, by + 124), what, font=font("Figtree-700.ttf", 32), fill=white)
    d.text((nx + 30, by + 164), who, font=font("Figtree-500.ttf", 28), fill=soft)


# ---------------------------------------------------------------- frame
def render(name: str, t: float = 0.0, T: float = 8.0, text: bool = True, night_index: int = 0) -> Image.Image:
    frame = background(name).convert("RGBA")
    if SCENES[name].get("stars"):
        draw_night_sky(frame, t, T, constellation_for(night_index))
        shooting_star(frame, t, T)
    sun_rays(frame, name, t, T)
    if kind(name) == "heat":
        heat_shimmer(frame, t, T)
    clouds(frame, name, t, T)
    smoke(frame, name, t, T)
    if kind(name) == "storm":
        lightning(frame, t, T)
    precipitation(frame, name, t, T)
    if SCENES[name].get("whiteout"):
        whiteout(frame, SCENES[name]["whiteout"], t, T)
    if text:
        overlay(frame, name)
    return frame.convert("RGB")


SCENES = build_variants()
