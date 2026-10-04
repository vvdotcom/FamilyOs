"""Amazon Appstore background (1920x1080): the Hometide wall calendar on a lit screen, right of centre.

    pip install playwright && python -m playwright install chromium
    python brand/make-store-background.py      # writes brand/out/background-1920x1080.png and .jpg

The screen is FamilyWallScreen (light theme) rebuilt in HTML with the seeded demo family, placed inside Amazon's
1214 x 830 right-side safe area. No logo or app name, as the Appstore background rules ask; Fire TV draws the
title and buttons over the dark left side. Copy the results to store-listing/fire-tv/.
"""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
F = ROOT / 'packages/shared-ui/src/assets/fonts'
OUT = ROOT / 'brand' / 'out'
faces = ''.join(f"@font-face{{font-family:'{n}';src:url({(F/(n+'.ttf')).as_uri()})}}" for n in
                ['Bricolage-700-96','Bricolage-700-44','Bricolage-800-56','Figtree-400','Figtree-600','Figtree-700','Figtree-800'])
P = dict(bg='#F7F5F0', card='#FFFFFF', ink='#14203A', muted='#5B6478', border='#E9EBF0', sel='#14203A', onsel='#FFFFFF',
         next='#EEF2F8', nextb='#E0E6F0')
M = {'alex': ('#2F5FA8', '#DCE7F7', '#1B3F78'), 'jordan': ('#B45118', '#FBE1CB', '#8B350C'),
     'emma': ('#6E46AE', '#E8DDF7', '#522B93'), 'leo': ('#2C7B3B', '#D9EEDA', '#1F5A2A'), 'family': ('#8B6A0B', '#F6E7B0', '#5C4500')}
AVATAR = {'alex': '#9DC3F7', 'jordan': '#F6B18A', 'emma': '#C5ADF3', 'leo': '#9EDAA5'}
INIT = {'alex': 'A', 'jordan': 'J', 'emma': 'E', 'leo': 'L'}
def t(s, size, w=600, color=None, head=False, extra=''):
    fam = (f"Bricolage-800-56" if w == 800 else ('Bricolage-700-96' if size > 60 else 'Bricolage-700-44')) if head else f'Figtree-{w}'
    return f"<div style=\"font-family:'{fam}';font-size:{size}px;line-height:1.18;color:{color or P['ink']};{extra}\">{s}</div>"
def av(m, size=32):
    return (f"<div style=\"width:{size}px;height:{size}px;border-radius:50%;background:{AVATAR[m]};display:flex;align-items:center;justify-content:center;flex-shrink:0\">"
            f"<span style=\"font-family:'Figtree-800';font-size:{size*.46}px;color:#14203A\">{INIT[m]}</span></div>")
# Today: Tuesday. (start, end, title, owner, members, location)
NOW = 14 + 50/60
EVENTS = [(7.5, 8.0, 'School drop-off', 'alex', ['emma', 'leo'], 'Lincoln Elementary'),
          (8.25, 15.0, 'School', 'emma', ['emma', 'leo'], 'Lincoln Elementary'),
          (14.75, 16.0, 'Team meeting', 'jordan', ['jordan'], 'Office'),
          (15.25, 15.6, 'Emma pickup', 'alex', ['emma'], ''),
          (16.5, 17.5, 'Soccer practice', 'leo', ['leo'], 'Riverside Park'),
          (17.0, 17.75, 'Piano', 'emma', ['emma'], ''),
          (18.5, 19.25, 'Family dinner', 'family', ['alex', 'jordan', 'emma', 'leo'], '')]
def clock(h):
    hh, mm = int(h), round((h % 1) * 60)
    return f"{hh % 12 or 12}:{mm:02d} {'AM' if hh < 12 else 'PM'}"
GRID_H, FIRST, LAST, GUTTER = 0, 7, 21, 84
def wall(grid_h=640):
    hour = grid_h / (LAST - FIRST)
    blocks = []
    for e in EVENTS:
        top = (e[0] - FIRST) * hour; height = max(46, (e[1] - e[0]) * hour - 4)
        blocks.append(dict(e=e, top=top, height=height, lane=0, lanes=1))
    blocks.sort(key=lambda b: b['top'])
    cluster, end = [], -1
    def close():
        lanes = max([1] + [b['lane'] + 1 for b in cluster])
        for b in cluster: b['lanes'] = lanes
    for b in blocks:
        if b['top'] >= end: close(); cluster = []
        taken = [o['lane'] for o in cluster if o['top'] + o['height'] > b['top']]
        while b['lane'] in taken: b['lane'] += 1
        cluster.append(b); end = max(end, b['top'] + b['height'])
    close()
    rows = ''.join(f"<div style='position:absolute;top:{i*hour}px;left:0;right:0;height:1px;background:{P['border']}'></div>" for i in range(LAST - FIRST + 1))
    labels = ''.join(f"<div style='position:absolute;top:{i*hour-10}px;right:14px'>{t(f'{(FIRST+i)%12 or 12} {chr(65) if FIRST+i<12 else chr(80)}M',17,600,P['muted'])}</div>" for i in range(LAST - FIRST + 1))
    bl = ''
    for b in blocks:
        s, e2, title, owner, mem, loc = b['e']
        acc, surf, ink = M[owner]
        past = e2 <= NOW; tall = b['height'] >= 76; everyone = len(mem) == 4
        avs = '' if b['lanes'] >= 3 else ("<div style='display:flex;gap:4px'>" + (t('Everyone', 18, 800, ink) if everyone else ''.join(av(m) for m in mem[:3])) + "</div>")
        sub = t(f"{clock(s)} – {clock(e2)}" + (f" · {loc}" if loc else ''), 19, 400, ink, extra='white-space:nowrap;overflow:hidden;text-overflow:ellipsis') if tall else ''
        head = title if tall else f"{clock(s).split(' ')[0]}&nbsp;&nbsp;{title}"
        bl += (f"<div style='position:absolute;top:{b['top']+2}px;height:{b['height']}px;left:{b['lane']/b['lanes']*100}%;width:{100/b['lanes']}%;padding-right:8px;box-sizing:border-box'>"
               f"<div style='height:100%;box-sizing:border-box;display:flex;align-items:{'flex-start' if tall else 'center'};gap:12px;padding:{10 if tall else 2}px 14px;border-radius:14px;border-left:6px solid {acc};background:{surf};opacity:{.5 if past else 1};overflow:hidden'>"
               f"<div style='flex:1;min-width:0'>{t(head,24,800,ink,extra='white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}{sub}</div>{avs}</div></div>")
    now_top = (NOW - FIRST) * hour
    nowline = (f"<div style='position:absolute;top:{now_top-1}px;left:-8px;right:0;height:3px;background:#C2410C;border-radius:2px'>"
               f"<div style='position:absolute;left:-6px;top:-6px;width:15px;height:15px;border-radius:8px;background:#C2410C'></div></div>")
    week = [('SUN', 4, ['family']), ('MON', 5, ['alex', 'emma', 'leo']), ('TUE', 6, ['alex', 'jordan', 'emma', 'leo']),
            ('WED', 7, ['emma', 'leo', 'jordan']), ('THU', 8, ['alex', 'jordan', 'emma']), ('FRI', 9, ['family', 'leo']), ('SAT', 10, ['leo', 'family'])]
    days = ''
    for i, (lab, d, ms) in enumerate(week):
        today, past = i == 2, i < 2
        dots = ''.join(f"<div style='width:9px;height:9px;border-radius:5px;background:{M[m][0]}'></div>" for m in ms)
        days += (f"<div style='flex:1;height:96px;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:{P['sel'] if today else P['bg']};opacity:{.55 if past else 1}'>"
                 f"{t(lab,17,800,P['onsel'] if today else P['muted'],extra='letter-spacing:1.6px')}{t(str(d),32,800,P['onsel'] if today else P['ink'])}<div style='display:flex;gap:5px;height:9px'>{dots}</div></div>")
    sun = ("<svg width='40' height='40' viewBox='0 0 40 40'><circle cx='20' cy='20' r='8' fill='none' stroke='#14203A' stroke-width='3'/>"
           + ''.join(f"<line x1='20' y1='3' x2='20' y2='8' stroke='#14203A' stroke-width='3' stroke-linecap='round' transform='rotate({a} 20 20)'/>" for a in range(0, 360, 45)) + "</svg>")
    tomorrow = [('7:30 AM', 'School drop-off', 'Jordan'), ('8:15 AM', 'School', 'Emma, Leo'), ('3:15 PM', 'Emma pickup', 'Alex'), ('4:00 PM', 'Library story time', 'Leo'), ('6:00 PM', 'Book club', 'Jordan')]
    trow = ''.join(f"<div style='display:flex;align-items:center;gap:14px'>{t(a,22,700,P['muted'],extra='width:118px;white-space:nowrap')}{t(b,24,600,extra='flex:1;white-space:nowrap;overflow:hidden')}{t(c,20,600,P['muted'],extra='white-space:nowrap')}</div>" for a, b, c in tomorrow)
    left = (f"<div style='width:560px;display:flex;flex-direction:column;gap:20px'>"
            f"<div style='display:flex;align-items:flex-end;gap:14px;margin-top:-12px'>{t('2:50',164,700,head=True,extra='letter-spacing:-4px;line-height:170px')}{t('PM',40,700,P['muted'],extra='margin-bottom:28px')}</div>"
            f"<div>{t('Tuesday',40,800)}{t('October 6',30,400,P['muted'])}</div>"
            f"<div style='display:flex;align-items:center;gap:14px'>{sun}{t('72°',32,800)}{t('H 78° L 61° · Sunny',26,400,P['muted'])}</div>"
            f"<div style='padding:26px;border-radius:28px;background:{P['next']};border:2px solid {P['nextb']};display:flex;flex-direction:column;gap:6px'>"
            f"{t('NEXT UP · 3:15 PM · IN 25 MIN',20,800,P['muted'],extra='letter-spacing:3px')}{t('Emma pickup',42,700,head=True)}{t('Emma · leave by 2:55 PM',24,400,P['muted'])}</div>"
            f"<div style='display:flex;gap:16px'><div style='flex:1;padding:18px;border-radius:22px;background:{P['card']}'>{t('DINNER',18,800,P['muted'],extra='letter-spacing:2.5px')}{t('Tacos and corn salad',24,700)}</div>"
            f"<div style='flex:1;padding:18px;border-radius:22px;background:{P['card']};display:flex;flex-direction:column;gap:8px'>{t('CHORES LEFT',18,800,P['muted'],extra='letter-spacing:2.5px')}"
            f"<div style='display:flex;gap:16px'><div style='display:flex;align-items:center;gap:6px'>{av('emma')}{t('2',24,700)}</div><div style='display:flex;align-items:center;gap:6px'>{av('leo')}{t('✓',24,700,P['muted'])}</div></div></div></div>"
            f"<div style='flex:1;min-height:0;padding:22px;border-radius:28px;border:2px solid {P['border']};display:flex;flex-direction:column;gap:10px'>{t('TOMORROW',18,800,P['muted'],extra='letter-spacing:2.5px')}{trow}</div></div>")
    right = (f"<div style='flex:1;min-width:0;padding:28px 28px 24px;border-radius:32px;background:{P['card']};display:flex;flex-direction:column;gap:18px'>"
             f"<div style='display:flex;gap:10px'>{days}</div>"
             f"<div style='display:flex;align-items:flex-end;justify-content:space-between;padding-left:{GUTTER}px'>{t('TODAY',22,800,P['muted'],extra='letter-spacing:3.5px')}{t('7 events',22,400,P['muted'])}</div>"
             f"<div style='flex:1;min-height:0;display:flex'><div style='width:{GUTTER}px;position:relative'>{labels}</div>"
             f"<div style='flex:1;min-width:0;position:relative'>{rows}{bl}{nowline}</div></div></div>")
    return (f"<!doctype html><html><head><style>{faces}html,body{{margin:0}}*{{box-sizing:border-box}}</style></head><body>"
            f"<div style='width:1920px;height:1080px;background:{P['bg']};display:flex;gap:48px;padding:64px 96px 56px'>{left}{right}</div></body></html>")


def compose(shot_uri):
    SHOT = shot_uri
    NAVY = '#1D2B36'
    W, X, BEZEL = 1170, 692, 12          # screen + bezel inside Amazon's 1214 x 830 right-side safe area
    H = round(W * 1080 / 1920); Y = round((1080 - H) / 2) - 10
    waves = ''.join(f"<path d='M-40 {y} q120 -{a} 240 0 t240 0 t240 0 t240 0 t240 0 t240 0 t240 0 t240 0 t240 0' fill='none' stroke='#2F7F7A' stroke-width='{sw}' stroke-linecap='round' opacity='{op}'/>"
                    for y, a, sw, op in [(1008, 20, 5, .60), (1052, 16, 4, .38), (962, 24, 3, .24)])
    html = f"""<!doctype html><html><head><style>html,body{{margin:0}}</style></head><body>
    <div style='position:relative;width:1920px;height:1080px;overflow:hidden;background:
      radial-gradient(1000px 520px at 1400px 150px, rgba(242,166,90,.50), rgba(242,166,90,.12) 48%, rgba(242,166,90,0) 74%),
      radial-gradient(1100px 700px at 1250px 1000px, rgba(47,127,122,.35), rgba(47,127,122,0) 70%),
      linear-gradient(180deg, #22374A 0%, {NAVY} 50%, #152029 100%)'>
      <svg width='1920' height='1080' style='position:absolute;left:0;top:0'>{waves}</svg>
      <div style='position:absolute;left:{X-BEZEL}px;top:{Y-BEZEL}px;width:{W}px;height:{H}px;padding:{BEZEL}px;border-radius:30px;background:#0C1216;
           box-shadow:0 0 0 1px rgba(255,255,255,.08), 0 50px 120px rgba(0,0,0,.55), 0 0 160px rgba(242,166,90,.22)'>
        <img src='{SHOT}' style='width:100%;height:100%;display:block;border-radius:19px'>
      </div>
      <div style='position:absolute;inset:0;background:linear-gradient(90deg, {NAVY} 0%, {NAVY} 26%, rgba(29,43,54,.5) 30%, rgba(29,43,54,0) 34.5%)'></div>
    </div></body></html>"""
    return html


if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    wall_html, wall_png, bg_html = OUT / 'wall.html', OUT / 'wall-light.png', OUT / 'background.html'
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1920, 'height': 1080})
        wall_html.write_text(wall(640)); pg.goto(wall_html.as_uri()); pg.evaluate('document.fonts.ready')
        grid = pg.evaluate("[...document.querySelectorAll('div')].find(d=>d.style.minHeight==='0px' && d.children[0] && d.children[0].style.width==='84px').getBoundingClientRect().height")
        wall_html.write_text(wall(grid)); pg.goto(wall_html.as_uri()); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(300)
        pg.screenshot(path=str(wall_png))
        bg_html.write_text(compose(wall_png.as_uri())); pg.goto(bg_html.as_uri()); pg.wait_for_timeout(400)
        pg.screenshot(path=str(OUT / 'background-1920x1080.png')); b.close()
    Image.open(OUT / 'background-1920x1080.png').convert('RGB').save(OUT / 'background-1920x1080.jpg', quality=92, optimize=True)
    for f in (wall_html, bg_html): f.unlink()
    print('done')
