"""Render the README header images: the banner and the mark for light and dark GitHub themes.

    python brand/make-readme-banner.py

Writes docs/images/readme/banner.jpg (2000x1000) and docs/images/readme/mark-light.png / mark-dark.png (240x240).
Uses the repo's own fonts and the same mark as make-brand-assets.py; needs Playwright with Chromium and Pillow.
The TV picture is the real Fire TV Stick photo (docs/images/readme/hero.jpg), cropped to the TV screen.
"""
import io
import os
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(os.environ.get('HOMETIDE_ROOT', Path(__file__).resolve().parents[1]))
FONTS = ROOT / 'packages/shared-ui/src/assets/fonts'
OUT = ROOT / 'docs/images/readme'
NAVY, TEAL, SUN, CREAM = '#1D2B36', '#2F7F7A', '#F2A65A', '#F3EFE6'
ARCH = 'M36 182 V92 a64 64 0 0 1 128 0 V182 Z'


def mark(arch, water, wave, uid):
    return (f'<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'
            f'<defs><clipPath id="{uid}"><path d="{ARCH}"/></clipPath></defs>'
            f'<path d="{ARCH}" fill="{arch}"/><g clip-path="url(#{uid})">'
            f'<circle cx="100" cy="128" r="34" fill="{SUN}"/>'
            f'<path d="M30 138 q17.5 -12 35 0 t35 0 t35 0 t35 0 t35 0 V190 H30 Z" fill="{water}"/>'
            f'<path d="M30 162 q17.5 -10 35 0 t35 0 t35 0 t35 0 t35 0" fill="none" stroke="{wave}" '
            f'stroke-width="7" stroke-linecap="round"/></g></svg>')


LIGHT = mark(NAVY, TEAL, CREAM, 'a')   # for GitHub's light theme
DARK = mark(CREAM, TEAL, NAVY, 'b')    # for GitHub's dark theme


def tv_crop() -> Path:
    """The TV screen from the real photo, without the desktop background around it."""
    im = Image.open(OUT / 'hero.jpg').convert('RGB')
    w, h = im.size
    box = (round(w * 0.024), round(h * 0.133), round(w * 0.724), round(h * 0.888))
    path = Path(tempfile.gettempdir()) / 'hometide-tv-crop.jpg'
    im.crop(box).save(path, quality=95)
    return path


def fontface(name, file):
    return f"@font-face{{font-family:{name};src:url({(FONTS / file).as_uri()})}}"


def banner_html(tv: Path) -> str:
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
{fontface('Brico', 'Bricolage-800-64.ttf')}
{fontface('Fig5', 'Figtree-500.ttf')}{fontface('Fig6', 'Figtree-600.ttf')}{fontface('Fig7', 'Figtree-700.ttf')}
html,body{{margin:0;width:1600px;height:800px;overflow:hidden;background:{NAVY}}}
.stage{{position:relative;width:1600px;height:800px;overflow:hidden;
  background:radial-gradient(1100px 700px at 85% 40%, #2a3d4a 0%, {NAVY} 60%)}}
.tv{{position:absolute;right:-70px;top:96px;width:1010px;border-radius:18px;overflow:hidden;
  box-shadow:0 40px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(243,239,230,.08)}}
.tv img{{display:block;width:100%}}
.fade{{position:absolute;inset:0;background:linear-gradient(90deg,{NAVY} 0%,{NAVY} 38%,rgba(29,43,54,.88) 48%,rgba(29,43,54,.25) 62%,rgba(29,43,54,0) 75%)}}
.waves{{position:absolute;left:0;right:0;bottom:-6px;height:90px;opacity:.9}}
.copy{{position:absolute;left:96px;top:72px;width:640px}}
.brand{{display:flex;align-items:center;gap:22px}}
.brand svg{{width:84px;height:84px}}
.word{{font:800 82px/1 Brico;color:{CREAM};letter-spacing:-2.5px}}
.eyebrow{{margin-top:34px;font:700 19px/1 Fig7;letter-spacing:3px;text-transform:uppercase;color:{SUN}}}
h1{{margin:16px 0 0;max-width:640px;font:700 54px/1.08 Fig7;color:{CREAM};letter-spacing:-1px}}
.sub{{margin-top:18px;font:500 25px/1.4 Fig5;color:rgba(243,239,230,.78);width:620px}}
.card{{position:absolute;left:96px;bottom:112px;width:660px;display:flex;gap:22px;align-items:stretch;
  background:rgba(14,22,28,.82);border-radius:18px;padding:24px 28px;box-shadow:0 20px 50px rgba(0,0,0,.35)}}
.bar{{width:6px;border-radius:3px;background:{TEAL}}}
.card .k{{font:700 17px/1 Fig7;letter-spacing:2.5px;text-transform:uppercase;color:{SUN}}}
.card .q{{margin-top:10px;font:600 25px/1.35 Fig6;color:{CREAM}}}
</style></head><body><div class="stage">
<div class="tv"><img src="{tv.as_uri()}"></div>
<div class="fade"></div>
<svg class="waves" viewBox="0 0 1600 90" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 40 q100 -26 200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 V90 H0 Z" fill="{TEAL}" opacity=".55"/>
  <path d="M0 62 q100 -20 200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0" fill="none" stroke="{CREAM}" stroke-width="4" opacity=".55"/>
</svg>
<div class="copy">
  <div class="brand">{DARK}<div class="word">Hometide</div></div>
  <div class="eyebrow">Fire TV · Vega OS · Amazon Bedrock</div>
  <h1>The family TV that learns your family's rhythm.</h1>
  <div class="sub">It catches the clash nobody spotted, learns from your fixes, and changes nothing until a parent says yes.</div>
</div>
<div class="card"><div class="bar"></div><div>
  <div class="k">Hometide noticed</div>
  <div class="q">Make Lindsey the usual Emma pickup on Tuesdays and Thursdays?</div>
</div></div>
</div></body></html>'''


def mark_html(svg: str) -> str:
    return ('<!doctype html><html><head><style>html,body{margin:0;background:transparent}'
            f'svg{{display:block;width:240px;height:240px}}</style></head><body>{svg}</body></html>')


def main():
    tv = tv_crop()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1600, 'height': 800}, device_scale_factor=2)
        html = tv.with_name('hometide-banner.html')  # a file page may load the local fonts and photo
        html.write_text(banner_html(tv), encoding='utf-8')
        page.goto(html.as_uri())
        page.wait_for_function("document.fonts.check('800 40px Brico') && document.fonts.check('700 40px Fig7')", timeout=10000)
        page.evaluate('document.fonts.ready')
        png = page.screenshot(type='png')
        Image.open(io.BytesIO(png)).convert('RGB').resize((2000, 1000), Image.LANCZOS).save(
            OUT / 'banner.jpg', quality=86, optimize=True, progressive=True)
        for name, svg in (('mark-light.png', LIGHT), ('mark-dark.png', DARK)):
            page = browser.new_page(viewport={'width': 240, 'height': 240}, device_scale_factor=1)
            page.set_content(mark_html(svg))
            page.screenshot(path=str(OUT / name), omit_background=True)
        browser.close()
    print('Wrote', OUT / 'banner.jpg', 'and the two marks')


if __name__ == '__main__':
    main()
