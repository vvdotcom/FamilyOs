"""Renders docs/images/vega-architecture.png (layered Vega OS app diagram). Run: python docs/images/src/vega.py"""
from pathlib import Path
FONTS = Path(__file__).resolve().parents[3] / 'packages/shared-ui/src/assets/fonts'
HERE = Path(__file__).resolve().parent
W, H = 1720, 1030
INK = '#232F3E'
bands = [
  ('Hometide TV app', 'com.hometide.tv', '#2F7F7A', '#E6F2F1', [
      ('Screens', 'Home · Calendar · Chores · Meals · Lists · Photos · Settings'),
      ('Wall calendar', 'Today in large type after 2 idle minutes; night clock'),
      ('Confirm cards', 'Voice requests and “Hometide noticed”, focus on the yes'),
      ('QR pairing', 'Built-in encoder drawn with plain Views, no native module')]),
  ('Shared TV code', 'packages/shared-ui · packages/domain', '#1D2B36', '#E8EBEE', [
      ('D-pad focus', 'react-tv-space-navigation; Back never traps'),
      ('Design system', 'Large type for 3 m viewing, 1080p safe areas'),
      ('Conflict engine', 'Who is busy, who is free, travel time'),
      ('API client', 'HTTPS to the Hometide API, revocable TV session')]),
  ('React Native for Vega', 'Vega SDK 0.24 · React Native 0.72', '#C45500', '#FDF0E4', [
      ('KeplerScript runtime', 'Runs the JavaScript app (manifest runtime module)'),
      ('react-native-kepler', 'TVEventHandler: remote keys, Menu, Back'),
      ('AsyncStorage (Vega port)', 'Pairing and theme survive a reboot'),
      ('Build', '.vpkg for armv7, aarch64 and x86_64 (Virtual Device)')]),
  ('Vega OS 1.2 services', 'declared in manifest.toml', '#6B3FD6', '#F1ECFD', [
      ('Input', 'inputd remote buttons · input method'),
      ('Launcher', 'com.amazon.category.main: opens from Home'),
      ('Network and accessibility', 'Network info · accessibility settings'),
      ('Display', 'Screensaver after timeout (no keep-awake API)')]),
  ('Fire TV device', 'tested on a Vega Fire TV Stick', '#5F6B7A', '#F1F3F5', [
      ('Fire TV Stick', '4K Select or HD, Vega OS'),
      ('Voice remote', 'D-pad, Back, Menu, Alexa button'),
      ('The family TV', 'HDMI, 1920 × 1080 canvas'),
      ('Wi-Fi', 'To the Hometide API over HTTPS')]),
]
def band(i, b):
    title, sub, color, tint, boxes = b
    y = 112 + i * 166
    cells = ''.join(f'<div style="flex:1;background:#fff;border:1.5px solid {color}33;border-radius:10px;padding:14px 16px">'
                    f'<div style="font:800 17px Figtree;color:{INK}">{t}</div><div style="font:500 14.5px/1.35 Figtree;color:#4B5563;margin-top:6px">{d}</div></div>'
                    for t, d in boxes)
    return (f'<div style="position:absolute;left:40px;top:{y}px;width:1150px;height:150px;background:{tint};border-radius:14px;display:flex;overflow:hidden">'
            f'<div style="width:190px;background:{color};color:#fff;padding:18px 16px;display:flex;flex-direction:column;justify-content:center">'
            f'<div style="font:800 18px/1.2 Figtree">{title}</div><div style="font:500 13px/1.35 Figtree;opacity:.85;margin-top:6px">{sub}</div></div>'
            f'<div style="flex:1;display:flex;gap:12px;padding:14px">{cells}</div></div>')
def cloudbox(y, h, color, title, lines, tag=None):
    tg = f'<div style="font:800 11px Figtree;letter-spacing:1.5px;color:{color};margin-bottom:6px">{tag}</div>' if tag else ''
    return (f'<div style="position:absolute;left:1270px;top:{y}px;width:410px;height:{h}px;border:1.6px solid {color};border-radius:12px;background:#fff;padding:14px 18px;box-sizing:border-box">'
            f'{tg}<div style="font:800 17px Figtree;color:{INK}">{title}</div>' + ''.join(f'<div style="font:500 14.5px/1.45 Figtree;color:#4B5563">{l}</div>' for l in lines) + '</div>')
cloud = (cloudbox(112, 165, '#2F7F7A', 'Hometide API', ['FastAPI on Railway · Postgres', 'Strands voice agent · MCP server · /alexa', 'TV sync every 5 s · commands every 1.5 s', 'One write path: permissions, revision check, audit'], 'CLOUD')
       + cloudbox(305, 170, INK, 'AWS (us-west-2)', ['Amazon Cognito: parent accounts, Alexa linking', 'Amazon Bedrock (Nova Lite): voice agent, briefing,', '  flyer import, chore photo checks', 'Bedrock AgentCore Memory: learned routines'], 'AWS CLOUD')
       + cloudbox(528, 150, '#31465F', 'Alexa', ['“Alexa, open home tide… swap Emma’s pickup', 'to Alex” → skill endpoint /alexa on the API → MCP', 'tools → a proposal the TV shows as a confirm card'], 'VOICE')
       + cloudbox(716, 212, '#5F6B7A', 'Fire OS build (next)', ['apps/expo-multi-tv runs the same shared-ui', 'screens on react-native-tvos (Android) for older', 'Fire TVs: configured, not built yet. Same package', 'com.hometide.tv, so one Appstore listing can carry', 'both. The screens also run in a browser for dev.'], 'OTHER TARGETS'))
arrows = f'''<svg width="{W}" height="{H}" style="position:absolute;left:0;top:0">
<defs><marker id="m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#545B64"/></marker>
<marker id="s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M10 0L0 5L10 10z" fill="#545B64"/></marker></defs>
<path d="M1190 353 H1230 V187 H1268" fill="none" stroke="#545B64" stroke-width="2" marker-end="url(#m)" marker-start="url(#s)"/>
<text x="1224" y="290" font-family="Figtree" font-size="13" font-weight="600" fill="#4B5563" transform="rotate(-90 1224 290)">HTTPS</text>
<path d="M1475 277 V303" fill="none" stroke="#545B64" stroke-width="2" marker-end="url(#m)" marker-start="url(#s)"/>
<path d="M1190 850 H1248 V603 H1268" fill="none" stroke="#545B64" stroke-width="2" stroke-dasharray="7 6" marker-end="url(#m)"/>
<text x="1240" y="790" font-family="Figtree" font-size="13" font-weight="600" fill="#4B5563" transform="rotate(-90 1240 790)">Alexa button</text>
<path d="M1680 603 H1702 V200 H1682" fill="none" stroke="#545B64" stroke-width="2" stroke-dasharray="7 6" marker-end="url(#m)"/>
</svg>'''
html = (f'<!doctype html><html><head><style>' + ''.join(f"@font-face{{font-family:Figtree;font-weight:{w};src:url({(FONTS/f'Figtree-{w}.ttf').as_uri()})}}" for w in (500, 600, 700, 800)) +
        f'html,body{{margin:0}}</style></head><body><div style="position:relative;width:{W}px;height:{H}px;background:#fff">'
        f'<div style="position:absolute;left:40px;top:28px;font:800 26px Figtree;color:{INK}">Hometide on Vega OS · app architecture</div>'
        f'<div style="position:absolute;left:40px;top:66px;font:500 15px Figtree;color:#4B5563">Each layer uses only the one below it. The TV app talks to the cloud over HTTPS; voice reaches it through Alexa as a confirm card.</div>'
        + ''.join(band(i, b) for i, b in enumerate(bands)) + cloud + arrows +
        f'<div style="position:absolute;left:40px;top:952px;width:1150px;font:500 14px/1.5 Figtree;color:#4B5563">'
        f'<b style="color:{INK}">Build and install:</b> <code>yarn build:vega</code> → <code>.vpkg</code> → <code>vega device install-app</code> on the Stick (developer mode); Amazon Appstore submission planned. '
        f'<b style="color:{INK}">Tested:</b> a Vega Virtual Device regression on EC2, then installed and run on a physical Fire TV Stick.</div>'
        '</div></body></html>')
(HERE / 'vega.html').write_text(html)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2)
    pg.goto((HERE / 'vega.html').as_uri()); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(HERE.parent / 'vega-architecture.png')); b.close(); (HERE / 'vega.html').unlink()
print('ok')
