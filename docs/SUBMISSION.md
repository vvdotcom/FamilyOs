# Devpost submission draft

Paste-ready text for the Devpost form. Before submitting, check every claim against what the final video shows and
what was tested on the Fire TV.

**Suggested entry:** Fire TV track, plus the AWS Builder mini-challenge.

## Tagline

The family wall calendar, on the Fire TV you already own.

## Inspiration

Busy families live by a shared calendar, and smart wall calendars like Skylight have become popular for it. But a
Skylight screen costs $150–$570, meal planning, rewards, and Magic Import cost another $79.99 a year, and its AI
assistant costs $14.99 a month. Most of those families already have a big screen in the busiest room of the house:
Amazon has sold more than 250 million Fire TV devices. We wanted that screen to do the job.

## What it does

FamilyOS turns Fire TV into the family's shared calendar and command center. It is run with the remote, fed from
a phone app, and can be reached by voice.

- **Your calendars, already there.** Paste the private iCal link from Google Calendar, iCloud, or Outlook. FamilyOS
  mirrors the next three months, keeps them in sync about every 15 minutes, and never changes them.
- **A wall calendar when nobody's using the TV.** After two idle minutes the TV shows today in large type: the time,
  weather, what's next and when to leave, dinner, chores left, and a family photo. At night it dims to a quiet clock.
- **It catches conflicts.** Double-booked drivers and tight travel times are flagged, and FamilyOS suggests who is
  free. A parent confirms with the remote.
- **Snap a flyer, get an event.** Photograph a school flyer or pick a PDF or email. Amazon Bedrock drafts the event,
  and a parent reviews it before it's saved.
- **Kids can join in.** Chores with photo check-ins, stars and rewards, family night voting, and short movement
  breaks on the TV. Anything that matters, like approving a reward, needs a four-digit parent code.
- **Voice through Alexa+.** An MCP server lets Alexa+ answer "what's on today?" and suggest changes. Nothing changes
  until someone confirms on the TV or phone.

## How we built it

- **TV:** React Native on Vega OS, plus Fire OS / Android TV and the web from the same screens. We used
  `react-tv-space-navigation` for D-pad focus and designed at 1920×1080 within title-safe margins.
- **Phone:** Expo (iOS first) with secure session storage, native pickers, and on-device photo downscaling, which
  strips location data before upload.
- **Service:** FastAPI on Railway with Postgres and Amazon Cognito accounts. One write path authorizes every change
  against a permission matrix (parent, child, shared TV, TV in parent mode, voice) and writes an audit entry.
- **Calendar sync:** iCal parsing expands repeating events and exceptions. Links are encrypted at rest and fetched
  only from checked, pinned public addresses, which blocks server-side request forgery.
- **AI:** Amazon Bedrock (Nova Lite) through the Converse API for the family briefing, flyer and PDF import, chore
  photo checks, and tool use behind the simulated Alexa+. Every AI result is a suggestion, and each feature has a
  deterministic fallback.
- **Voice:** an MCP server (Streamable HTTP, protocol 2025-11-25) built with the official Python SDK. Voice can
  only *propose* changes, and each proposal is applied exactly once after confirmation.

## Challenges we ran into

- **Vega OS doesn't let non-media apps keep the screen on.** Amazon staff confirmed this in the developer forum. We
  show the wall calendar before the screensaver starts, point families to the setting that lengthens it, and
  filed a feature request.
- The Vega Virtual Device needs KVM, which our Windows laptop couldn't provide. We ran it on an EC2 instance with
  nested virtualization and scripted remote input and screenshots.
- On the Vega JS engine, weekday-only date labels came out padded with extra date fields, and D-pad focus didn't
  move into dialogs without a focus lock. Both are fixed and written up.
- Live Alexa+ account linking needs a public OAuth 2.1 authorization server whose metadata format isn't documented.
  The MCP server is complete and tested with the official client, and the demo uses a clearly labelled simulated
  Alexa+.

## Accomplishments that we're proud of

- A remote-only TV experience that passed a full Vega Virtual Device regression.
- Calendar sync that works with the calendars families already use, with security built in.
- AI that costs about $0.13–$0.51 per household per month (measured), so it can be included rather than sold as an
  add-on.
- A safety model in which neither AI nor voice can change anything on its own.

## What we learned

A family display is judged from across the room: large type, one glance, no surprises. The hard parts were trust
and timing. Who is allowed to change what? What happens when a TV, a child, and a voice assistant all edit the same
household? And how quickly does a phone edit reach the TV? The answer measured 1.9 s median.

## What's next

- A validation pass on physical Fire TV hardware and a wider family beta. So far FamilyOS has been used informally
  by our own family and friends.
- Live Alexa+ linking once the authorization-server requirements are clear.
- Keeping the screen awake on Fire OS devices, which allow it.
- Two-way calendar sync.

## Built with

react-native, vega-sdk, fire-tv, expo, typescript, python, fastapi, postgresql, railway, amazon-bedrock,
amazon-nova, amazon-cognito, amazon-ec2, model-context-protocol, alexa, icalendar

## Testing instructions for judges

**Hosted demo family:** once the phone app is running (step 3 below), sign in with the judge account below. It
holds a ready-made family week: school, pickups, soccer with carpool drivers, dinners, chores and rewards, photos, and a
connected Google holidays calendar. Every Tuesday there's a pickup conflict to fix. The parent code for approvals is
**2468**.
- Email: `<judge email>` · Password: `<judge password>` (fill these in when submitting)
- Try: Today → Needs you (approve a chore photo and a reward request) · Family → Voice → "Swap Emma pickup to Alex" ·
  pair a TV and press **Fix pickup** on Tuesday.

1. **TV without an account:** `yarn install`, then `yarn dev:web`, and use the arrow keys and Enter as the remote.
   The unpaired TV shows a seeded demo day. On Vega, build with `yarn build:vega` and install the
   package with `vega run-app` (see `docs/VEGA_VVD_TEST_REPORT.md`, "Reproduce").
2. **Family agent API:** follow `services/family-agent/README.md`. It runs in local demo mode, and Bedrock is optional.
3. **Phone:** `yarn dev:companion` and open it in Expo Go. Pair the TV with the code shown in the TV's Settings.
4. **Connect a calendar:** on the phone, go to Family → Connected calendars and paste any public iCal link, for
   example Google's US holidays calendar.

## Video plan (under 3 minutes, filmed on the Fire TV)

| Time | Shot |
|---|---|
| 0:00–0:15 | The living-room TV showing the wall calendar. Voice-over on Skylight's price versus "your family already has a Fire TV." |
| 0:15–0:45 | Phone: "Set up in 5 minutes," then connect a Google Calendar. Cut to the TV as the events appear. |
| 0:45–1:15 | Remote only: Home briefing, then the week view, then a flagged pickup conflict: Suggest, Confirm. |
| 1:15–1:40 | Photograph a school flyer, review the draft, save it, and see it on the TV. |
| 1:40–2:10 | A child submits a chore photo, a parent approves on the TV with the code, and the star celebration plays. |
| 2:10–2:35 | Simulated Alexa+ (labelled on screen): "Swap Emma pickup to Alex" appears as a request card on the TV and is confirmed. |
| 2:35–2:55 | Leave the remote: the wall calendar returns. Show night mode. |
| 2:55–3:00 | End card: "FamilyOS: the family calendar on the TV you already own." |
