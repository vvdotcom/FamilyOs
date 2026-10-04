"""Render every Hometide logo asset with headless Chromium.

    pip install playwright && python -m playwright install chromium
    python brand/make-brand-assets.py      # writes brand/out/*.png

Copy the results to the paths listed in brand/README.md.
"""
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = str(ROOT / 'brand' / 'out')
os.makedirs(OUT, exist_ok=True)
FONT = (ROOT / 'packages/shared-ui/src/assets/fonts/Bricolage-800-68.ttf').as_uri()
NAVY, TEAL, SUN, CREAM = '#1D2B36', '#2F7F7A', '#F2A65A', '#F3EFE6'
ARCH = 'M36 182 V92 a64 64 0 0 1 128 0 V182 Z'


def mark(arch, water, wave, uid, wave_on=True):
    w = (f'<path d="M30 162 q17.5 -10 35 0 t35 0 t35 0 t35 0 t35 0" fill="none" stroke="{wave}" '
         f'stroke-width="7" stroke-linecap="round"/>') if wave_on else ''
    return (f'<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'
            f'<defs><clipPath id="{uid}"><path d="{ARCH}"/></clipPath></defs>'
            f'<path d="{ARCH}" fill="{arch}"/><g clip-path="url(#{uid})">'
            f'<circle cx="100" cy="128" r="34" fill="{SUN}"/>'
            f'<path d="M30 138 q17.5 -12 35 0 t35 0 t35 0 t35 0 t35 0 V190 H30 Z" fill="{water}"/>{w}</g></svg>')


LIGHT = mark(NAVY, TEAL, CREAM, 'a')          # on light grounds
DARK = mark(CREAM, TEAL, NAVY, 'b')           # on navy grounds
TILE = mark(CREAM, NAVY, TEAL, 'c', False)    # on the teal app-icon tile

HEAD = (f'<!doctype html><html><head><style>@font-face{{font-family:Brico;src:url({FONT})}}'
        '.pre{font:800 10px Brico;position:absolute;opacity:0}html,body{margin:0;overflow:hidden;background:transparent}svg{display:block;width:100%;height:100%}</style></head><body><span class="pre">h</span>')


def square(size, ground, svg, mark_pct):
    m = size * mark_pct
    bg = f'background:{ground};' if ground else ''
    return (HEAD + f'<div style="width:{size}px;height:{size}px;{bg}display:flex;align-items:center;justify-content:center">'
            f'<div style="width:{m}px;height:{m}px">{svg}</div></div></body></html>'), size, size


def banner(w, h):
    """Navy TV icon: mark plus the lowercase wordmark, centred."""
    m = min(h * 0.5, w * 0.22)
    fs = min(h * 0.25, (w * 0.8 - m - h * 0.08) / 4.5)
    return (HEAD + f'<div style="width:{w}px;height:{h}px;background:{NAVY};display:flex;align-items:center;justify-content:center;gap:{h*0.08}px">'
            f'<div style="width:{m}px;height:{m}px;margin-top:-{h*0.03}px">{DARK}</div>'
            f'<div style="font:800 {fs}px/1 Brico;color:{CREAM};letter-spacing:-{fs*0.025}px">Hometide</div></div></body></html>'), w, h


def tv_icon(size):
    """Vega launcher card: the mark beside the wordmark, the pair centred (exactly 512x512 on Vega).

    Kept to the middle band so the name still reads if the launcher crops the square to 16:9.
    """
    k = size / 512
    mh, text_w, gap = 96 * k, 318 * k, 22 * k
    mw = mh * 128 / 154
    # The mark drawn from the arch's own ink box (x 36..164, y 28..182), so spacing is measured from what shows.
    ink = DARK.replace('viewBox="0 0 200 200"', 'viewBox="36 28 128 154"')
    return (HEAD + f'<div style="position:relative;width:{size}px;height:{size}px;background:{NAVY};overflow:hidden">'
            f'<div id="row" style="position:absolute;display:flex;align-items:center;gap:{gap}px">'
            f'<div style="width:{mw}px;height:{mh}px;flex-shrink:0">{ink}</div>'
            f'<div id="w" style="font:800 100px/1 Brico;color:{CREAM};letter-spacing:-0.025em;white-space:nowrap">Hometide</div></div></div>'
            '<script>document.fonts.ready.then(()=>{const w=document.getElementById("w"),row=document.getElementById("row");'
            f'w.style.fontSize=(100*{text_w}/w.getBoundingClientRect().width)+"px";const r=row.getBoundingClientRect();'
            f'row.style.left=(({size}-r.width)/2)+"px";row.style.top=(({size}-r.height)/2)+"px"}})</script></body></html>'), size, size


def background(w, h):
    big = mark(TEAL, '#26404F', NAVY, 'd')
    return (HEAD + f'<div style="width:{w}px;height:{h}px;background:{NAVY};position:relative;overflow:hidden">'
            f'<div style="position:absolute;width:{h*1.15}px;height:{h*1.15}px;right:-{h*0.12}px;bottom:-{h*0.2}px;opacity:.55">{big}</div>'
            f'</div></body></html>'), w, h


JOBS = {
    # Phone / iOS / web
    'icon-1024.png': square(1024, TEAL, TILE, 0.66),
    'adaptive-icon.png': square(1024, None, TILE, 0.5),
    'icon-512.png': square(512, TEAL, TILE, 0.66),
    'icon-192.png': square(192, TEAL, TILE, 0.66),
    'maskable-512.png': square(512, TEAL, TILE, 0.5),
    'apple-touch-icon.png': square(180, TEAL, TILE, 0.66),
    'favicon-48.png': square(48, TEAL, TILE, 0.74),
    # In-app marks (transparent)
    'mark-light-256.png': square(256, None, LIGHT, 1),
    'mark-dark-256.png': square(256, None, DARK, 1),
    # TV launcher icons and banners
    'tv-app-icon-512.png': tv_icon(512),  # Vega: apps/vega/assets/image/hometide_icon.png
    'tv-1280x768.png': banner(1280, 768),
    'tv-400x240.png': banner(400, 240),
    'tv-800x480.png': banner(800, 480),
    'tv-1920x720.png': banner(1920, 720),
    # Amazon Appstore listing
    'store-icon-1280x720.png': banner(1280, 720),
    'store-background-1920x1080.png': background(1920, 1080),
}

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, (html, w, h) in JOBS.items():
        path = f'{OUT}/{name}.html'
        open(path, 'w').write(html)
        page = browser.new_page(viewport={'width': w, 'height': h})
        page.goto(Path(path).as_uri())
        page.wait_for_function("document.fonts.check('800 40px Brico')", timeout=10000)
        page.evaluate('document.fonts.ready')
        time.sleep(0.8)
        page.screenshot(path=f'{OUT}/{name}', omit_background=True)
        page.close()
        os.remove(path)
    browser.close()
print('done')
