"""Renders docs/images/architecture.png (AWS-style overall architecture). Run: python docs/images/src/architecture.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from icons import g, dev
from pathlib import Path
FONTS = Path(__file__).resolve().parents[3] / 'packages/shared-ui/src/assets/fonts'
HERE = Path(__file__).resolve().parent
W, H = 1830, 1000
INK, GREY, LINE = '#232F3E', '#7D8998', '#545B64'
AI, SEC, MGMT, COMP, HT, DB, ALX = '#01A88D', '#DD344C', '#E7157B', '#ED7100', '#2F7F7A', '#3B5B8C', '#31465F'
out = []
def text(x, y, s, size=15, weight=600, fill=INK, anchor='middle'):
    out.append(f'<text x="{x}" y="{y}" font-family="Figtree" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{s}</text>')
def group(x, y, w, h, label, color=GREY, dash=None, tag=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{color}" stroke-width="1.6"{d}/>')
    if tag:
        out.append(f'<rect x="{x}" y="{y}" width="30" height="30" fill="{tag}"/>')
        out.append(f'<g transform="translate({x+5},{y+5}) scale(0.31)">' + g('api' if tag == HT else 'cfn').replace('stroke-width="3"', 'stroke-width="5"') + '</g>' if tag != INK else
                   f'<path d="M{x+8} {y+20} q2-8 9-8 q2-5 7-3 q6 0 6 7 q4 1 3 4z" fill="#fff"/>')
        text(x + 38, y + 20, label, 14, 700, color if color != GREY else INK, 'start')
    else:
        text(x + 12, y + 22, label, 14, 700, color if color not in (GREY,) else INK, 'start')
def tile(cx, cy, color, glyph, lines):
    out.append(f'<rect x="{cx-32}" y="{cy-32}" width="64" height="64" rx="5" fill="{color}"/>')
    out.append(f'<g transform="translate({cx-32},{cy-32})">{g(glyph)}</g>')
    for i, s in enumerate(lines):
        text(cx, cy + 54 + i * 19, s, 14.5, 700 if i == 0 else 500, INK if i == 0 else '#4B5563')
def device(cx, cy, kind, lines):
    out.append(f'<g transform="translate({cx-36},{cy-36})">{dev(kind)}</g>')
    for i, s in enumerate(lines):
        text(cx, cy + 54 + i * 19, s, 14.5, 700 if i == 0 else 500, INK if i == 0 else '#4B5563')
def path(d, dashed=False, both=False):
    da = ' stroke-dasharray="7 6"' if dashed else ''
    ms = ' marker-start="url(#a0)"' if both else ''
    out.append(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="2"{da} marker-end="url(#a1)"{ms}/>')
def num(cx, cy, n):
    out.append(f'<circle cx="{cx}" cy="{cy}" r="13" fill="{INK}"/>')
    text(cx, cy + 5, str(n), 14, 800, '#fff')

# Title
text(40, 52, 'Hometide on Fire TV · architecture', 26, 800, INK, 'start')
text(40, 76, 'One household service, three screens, and voice through Alexa. AI only proposes; a person confirms on the TV.', 15, 500, '#4B5563', 'start')

# Groups
group(30, 100, 240, 620, 'Home')
group(30, 760, 240, 200, 'Calendar providers (iCal)', dash='6 5')
group(300, 100, 130, 200, 'Amazon Alexa')
group(460, 100, 560, 860, 'Hometide API · FastAPI on Railway (Docker)', tag=HT)
group(1050, 100, 480, 875, 'AWS Cloud', color=INK, tag=INK)
group(1070, 145, 440, 815, 'Region: us-west-2', color='#00A4A6', dash='7 5')
group(1090, 785, 405, 160, 'Build and test', dash='3 4')

# Arrow markers
out.insert(0, f'<defs><marker id="a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="{LINE}"/></marker>'
              f'<marker id="a0" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M10 0L0 5L10 10z" fill="{LINE}"/></marker></defs>')

# Paths first (under tiles)
path('M186 190 H331')                                    # Echo -> Alexa
path('M397 190 H521')                                    # Alexa -> /alexa
path('M587 190 H706')                                    # /alexa -> MCP
path('M772 190 H891')                                    # MCP -> Strands
path('M957 190 H1206', dashed=True, both=True)                        # Strands <-> Bedrock
path('M740 272 V330 H575 V366')                          # MCP -> write path (proposal)
path('M190 400 H521', both=True)                         # Fire TV <-> API
path('M186 588 L523 418')                                # Phone -> API (pairing, edits)
path('M587 392 H706')                                    # API -> Rhythm
path('M772 400 H1206')                                   # Rhythm -> AgentCore Memory
path('M587 424 H632 V600 H706', both=True)               # API <-> Postgres
path('M190 610 H300 V680 H1206')                         # Phone -> Cognito (sign in)
path('M186 845 H706')                                    # Calendars -> sync
path('M740 813 V634')                                    # sync -> Postgres
path('M587 408 H665 V505 H1350 V190 H1274', dashed=True) # API -> Bedrock (briefing, imports, photos)

# Devices and tiles
device(150, 190, 'echo', ['Voice', 'Echo · Fire TV remote'])
device(150, 400, 'tv', ['Fire TV app', 'Vega OS · Fire OS next'])
device(150, 600, 'phone', ['Phone & web app', 'Expo · /app'])
device(150, 845, 'calendar', ['Google · iCloud', 'Outlook'])
tile(365, 190, ALX, 'alexa', ['Alexa', 'custom skill'])
tile(555, 190, HT, 'skill', ['Skill endpoint', '/alexa · APL card'])
tile(740, 190, HT, 'mcp', ['MCP server /mcp', 'Streamable HTTP · 2025-11-25'])
tile(925, 190, HT, 'agent', ['Voice agent', 'Strands Agents SDK'])
tile(555, 400, HT, 'api', ['Household API', 'write path · audit'])
tile(740, 400, HT, 'rhythm', ['Rhythm engine', 'patterns → routines'])
tile(740, 600, DB, 'db', [])
text(782, 605, 'Postgres', 14.5, 700, INK, 'start')
tile(740, 845, HT, 'sync', ['Calendar sync', 'about every 15 min'])
tile(1240, 190, AI, 'bedrock', ['Amazon Bedrock', 'Nova Lite · Converse'])
tile(1240, 400, AI, 'memory', ['Amazon Bedrock', 'AgentCore Memory'])
tile(1240, 680, SEC, 'cognito', ['Amazon Cognito', 'accounts · OAuth'])
tile(1440, 400, SEC, 'iam', ['AWS IAM', 'least privilege'])
tile(1440, 680, SEC, 'secrets', ['AWS Secrets', 'Manager'])
tile(1240, 860, MGMT, 'cfn', ['AWS CloudFormation', 'CDK, with tests'])
tile(1440, 860, COMP, 'ec2', ['Amazon EC2', 'VVD test host'])
text(600, 324, 'propose', 13, 600, '#4B5563', 'start')
text(880, 528, 'briefing · flyer import · photo checks', 13, 600, '#4B5563')

# Step markers
for cx, cy, n in [(300, 645, 1), (355, 845, 2), (258, 190, 3), (1035, 190, 4), (355, 400, 5), (980, 400, 6), (900, 505, 7), (1222, 802, 8)]:
    num(cx, cy, n)

# Legend
steps = [
    'Parents sign in with <b>Amazon Cognito</b> on the phone or web app, then pair the TV by scanning its QR code and tapping Approve TV.',
    'Calendar sync mirrors Google, iCloud and Outlook iCal links into Postgres, read-only.',
    '“Alexa, open home tide… swap Emma’s pickup to Alex.” Alexa sends a signed request with the parent’s linked Cognito token.',
    'The skill calls the <b>MCP server</b>. A <b>Strands</b> agent on <b>Amazon Bedrock</b> picks the tools. A change is only ever a proposal.',
    'The <b>Fire TV</b> shows a confirm card with focus on Confirm. The remote (and parent code) approves; one write path applies and audits it.',
    'The rhythm engine spots the repeating clash and offers “Hometide noticed”. The answer is kept in <b>AgentCore Memory</b>.',
    'Flyers, PDFs and chore photos go to <b>Amazon Bedrock</b> for a draft or an advisory check. A parent always reviews.',
    '<b>AWS CDK</b> creates AgentCore Memory and a least-privilege IAM identity (key in Secrets Manager) and describes Cognito, as tested code. <b>EC2</b> hosts the Vega Virtual Device.',
]
legend = ''.join(f'<div style="display:flex;gap:10px;margin-bottom:12px"><div style="flex:0 0 26px;height:26px;border-radius:13px;background:{INK};color:#fff;font:800 14px/26px Figtree;text-align:center">{i+1}</div><div style="font:500 13.5px/1.36 Figtree;color:#232F3E">{s}</div></div>' for i, s in enumerate(steps))
key = ('<div style="margin-top:8px;padding-top:12px;border-top:1px solid #D5DBDB;font:500 12.5px/1.6 Figtree;color:#4B5563">'
       '<div><span style="display:inline-block;width:34px;border-top:2px solid #545B64;vertical-align:middle;margin-right:8px"></span>request or data</div>'
       '<div><span style="display:inline-block;width:34px;border-top:2px dashed #545B64;vertical-align:middle;margin-right:8px"></span>AI call</div>'
       f'<div style="margin-top:6px"><span style="display:inline-block;width:12px;height:12px;background:{HT};vertical-align:middle;margin-right:6px"></span>Hometide · '
       f'<span style="display:inline-block;width:12px;height:12px;background:{AI};vertical-align:middle;margin:0 6px 0 4px"></span>AI · '
       f'<span style="display:inline-block;width:12px;height:12px;background:{SEC};vertical-align:middle;margin:0 6px 0 4px"></span>Security</div></div>')
out.append(f'<foreignObject x="1562" y="100" width="250" height="870"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Figtree">'
           f'<div style="font:800 15px Figtree;color:#232F3E;margin:4px 0 14px">How a request flows</div>{legend}{key}</div></foreignObject>')

svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="#fff"/>' + ''.join(out) + '</svg>'
faces = ''.join(f"@font-face{{font-family:Figtree;font-weight:{w};src:url({(FONTS/f'Figtree-{w}.ttf').as_uri()})}}" for w in (500, 600, 700, 800))
html = f'<!doctype html><html><head><style>{faces}html,body{{margin:0}}</style></head><body>{svg}</body></html>'
(HERE / 'overall.html').write_text(html)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=2)
    pg.goto((HERE / 'overall.html').as_uri()); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(HERE.parent / 'architecture.png')); b.close(); (HERE / 'overall.html').unlink()
print('ok')
