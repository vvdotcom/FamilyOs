# Hometide

**The family TV that learns your family's rhythm.**

[![CI](https://github.com/vvdotcom/FamilyOs/actions/workflows/ci.yml/badge.svg)](https://github.com/vvdotcom/FamilyOs/actions/workflows/ci.yml)

![Hometide running on a real Fire TV, with the companion web app on a phone](./docs/images/readme/hero.jpg)

- **Demo video (2:48):** <!-- TODO: paste the YouTube or Vimeo link before submitting --> _link added at submission_
- **Try it now:** the hosted web app at [hometide.up.railway.app/app](https://hometide.up.railway.app/app/) (judge login on the Devpost form). See [Testing it as a judge](#testing-it-as-a-judge).
- **Run it on your own computer:** [Run it locally](#run-it-locally), about 10 minutes, no AWS account needed.

Hometide turns the Fire TV in the living room into the household's command center. It catches the clash nobody
spotted (Jordan's meeting runs into Emma's pickup) and says who is free. The fix can come by voice, remote or
phone, and nothing changes until a parent confirms it on the shared screen. When the same clash keeps coming back,
the TV says *Hometide noticed* and offers to make the family's fix the routine for every later week, and it
remembers the answer.

Fire TV's Ambient Experience and Alexa+ can already show a linked calendar and add events from emails or photos.
Hometide doesn't stop at showing the schedule: it resolves clashes, learns from the family's own fixes, and keeps
a parent in control of every change.

**Why the TV:** smart family calendars like Skylight cost $150–$570 for the screen, plus $79.99 a year for meal
planning, rewards, and Magic Import, and $14.99 a month for the AI assistant. Most families already have a large
screen in the living room: Amazon has sold [more than 250 million Fire TV devices](https://www.tvtechnology.com/news/amazon-passes-250-million-fire-devices-sold-expands-fire-tv-lineup).
Hometide uses that screen instead, with a phone app for parents and kids and Alexa for voice.

| | Skylight Calendar | Hometide |
|---|---|---|
| Screen | 10" $149.99 · 15" $299.99 · 27" $569.99 | The Fire TV you already own |
| Import, meals, rewards, photo screensaver | Calendar Plus, $79.99/year | Included |
| AI assistant | $14.99/month or $119.99/year | Alexa+ (MCP) · Bedrock AI measured at about $0.13–$0.51 per household per month |

Skylight prices as of 2026-09-29 ([models](https://myskylight.com/compare-calendars),
[subscriptions](https://skylight.zendesk.com/hc/en-us/articles/51833126965019-Subscription)). How the AI cost was
measured: [docs/MEASUREMENTS.md](./docs/MEASUREMENTS.md).

## Screenshots

### The TV app on a real Fire TV

Filmed with a camera on a Fire TV Stick running Vega OS, with the real remote (not a screen capture or emulator).

| | |
|---|---|
| ![TV home screen: an AI family briefing flags a pickup conflict, with today's timeline and who is free](./docs/images/readme/tv-home.jpg) | ![TV week calendar: every family member's events for the week, color-coded by person](./docs/images/readme/tv-week.jpg) |
| **Home:** the family briefing (Amazon Bedrock) spots the pickup conflict, with today's timeline, who's free and when to leave | **Calendar:** the whole week from every connected calendar, color-coded by person |
| ![Hometide noticed: the TV offers to make Lindsey the usual Emma pickup on Tuesdays and Thursdays](./docs/images/readme/tv-hometide-noticed.jpg) | ![Chore photo approval on the TV: a child's photo of a backpack with an advisory AI check and Approve button](./docs/images/readme/tv-chore-approval.jpg) |
| **Hometide noticed:** a clash the family keeps fixing by hand becomes a one-press routine | **Chore approval:** a child's proof photo pops up on the TV; the AI check is advice, a parent decides |

### The companion app (web app shown; the same code builds the iOS app)

| | | | | | |
|---|---|---|---|---|---|
| ![Today: the day's events and what needs a parent](./docs/images/readme/web-today.jpg) | ![Voice: ask Hometide to swap a pickup; it waits for a parent to confirm](./docs/images/readme/web-voice.jpg) | ![Flyer import: Bedrock drafts the event from a photo for review](./docs/images/readme/web-flyer-draft.jpg) | ![AI recipe: macaroni and cheese written by Bedrock and put on tonight's dinner](./docs/images/readme/web-recipe.jpg) | ![Chore photo: a child snaps proof and sends it to a parent](./docs/images/readme/web-chore-photo.jpg) | ![Child mode rewards: stars saved and rewards to ask for](./docs/images/readme/web-rewards.jpg) |
| Today | Voice | Flyer import | AI recipe | Chore photo | Rewards (child mode) |

## What it does

**On the TV** (Vega OS on a Fire TV Stick, remote only; the same screens also build for Fire OS)
- **Catches clashes and says who's free:** double-booked drivers and tight travel times are flagged on Home and in
  the calendar, with who can help.
- **Learns the family's rhythm:** when a clash keeps coming back after the family fixed one by hand, the TV says
  *Hometide noticed* and offers to make the fix the routine for every later week. It also spots the usual driver for
  an activity and events added by hand every week. Answers are remembered in Amazon Bedrock AgentCore Memory.
- **Approvals:** voice requests, photo-checked chores and reward requests wait on the TV for a parent, confirmed
  with a four-digit parent code on the remote.
- **Home:** a family briefing, today's timeline, who's free, and what's next, including when to leave.
- **Wall calendar:** after 5 idle minutes the TV shows the day in large type: clock, weather, next up, dinner,
  chores left, and a family photo. After 10 pm it dims to a quiet clock, and it shifts a few pixels each minute
  to protect the screen.
- **Calendar:** day, week, and month views, with all-day items in their own row and conflicts flagged.
- Chores with a star celebration, rewards, meals, lists, a photo slideshow, movement breaks, family night voting.
- **Pair by QR code:** the TV shows a QR code; scan it with the phone and tap Approve TV.

**On the phone** (web app served at `/app`, and an iOS app from the same Expo code)
- **Set up in 5 minutes:** connect calendars, add kids, set a parent code, pair the TV, set the weather location.
- **Connected calendars:** paste the private iCal link from Google Calendar, iCloud, or Outlook (or a school or
  league `.ics` link). Hometide re-reads it about every 15 minutes and never writes back.
- **Import:** photograph a flyer or pick a PDF, email, or `.ics` file. Amazon Bedrock drafts the event, and you
  review it before saving.
- **AI recipes:** describe a meal ("quick chicken dinner the kids will eat, 30 minutes") and Amazon Bedrock writes
  the recipe with ingredients and steps. It is saved to Recipes, put on that day's meal plan, and its ingredients can
  go straight to Groceries. Also on the TV (Meals → Create with AI).
- Chores with photo verification, rewards, lists, meals and recipes, groceries, sports teams and carpool
  rotation, family night, photos for the TV, and a child mode kids can use on their own.

**By voice**
- In the phone or web app, tap the mic (or type) and ask: the same agent answers, and any change waits for a parent
  to confirm on the TV or phone.
- "Alexa, open home tide", then just ask, from the Fire TV remote or any Echo: what's on today, open the calendar on
  the TV, swap a pickup, what Hometide has learned. Echo Show gets a Hometide card (APL).
- The voice agent is built with the Strands Agents SDK on Amazon Bedrock and uses the tools of our MCP server
  (Streamable HTTP, protocol 2025-11-25), which Alexa+ and other MCP hosts can also use; hosts with MCP Apps get a
  day card. Voice can only *suggest* changes: nothing changes until a person confirms on the TV or phone.

## Fire TV integration

Hometide is a native Vega OS app, not a web page on the TV. It is built with React Native for Vega and runs on a
physical Fire TV Stick 4K Select ([device test record](./docs/FIRE_TV_DEVICE_TEST.md)).

**What it uses**

| Vega / Fire TV feature | How Hometide uses it | Where |
|---|---|---|
| React Native for Vega (`@amazon-devices/react-native-kepler`) and `react-native build-kepler` | A release `.vpkg` for the Stick (armv7) and for the Vega Virtual Device (x86_64) | [`apps/vega`](./apps/vega) |
| Home screen launcher | Registered as the main interactive component (`com.amazon.category.main`) with its own icon, so it opens from the Fire TV Home screen | [`manifest.toml`](./apps/vega/manifest.toml) |
| Remote input (`com.amazon.inputd.service`, `TVEventHandler`) | D-pad, Select, Back, Play/Pause, Rewind, Fast-forward and Menu drive Hometide's focus system. Focus starts on the likely action (Confirm, Pair this TV), and Back never traps | [`RemoteControlManager.kepler.ts`](./packages/shared-ui/src/app/remote-control/RemoteControlManager.kepler.ts) |
| Accessibility settings (`com.amazon.devconf.privilege.accessibility`) | Reads the system reduce-motion setting for celebrations, focus animation and movement breaks. Buttons, the pairing QR code and the wall calendar have screen-reader labels | [`useReducedMotion.ts`](./packages/shared-ui/src/hooks/useReducedMotion.ts) |
| Vega ports of React Navigation, AsyncStorage, Gesture Handler and Reanimated | Screen navigation, and a TV that keeps its pairing, theme and offline household across restarts | [`apps/vega/src`](./apps/vega/src), [`nativeStore.vega.ts`](./packages/shared-ui/src/storage/nativeStore.vega.ts) |
| Alexa on the Fire TV remote | "Alexa, open home tide" reaches Hometide's custom skill, which calls Hometide's MCP server. The TV then picks up the result from the Hometide service, for example opening the calendar or showing a change to confirm | [`alexa-skill`](./alexa-skill), [`services/family-agent`](./services/family-agent) |

**What doesn't apply to a non-media app**

Hometide plays no video or audio, so it doesn't use the Vega features made for media apps: media playback and
media controls (W3C Media, Vega Media Controls), Content Launcher (catalog search and playback by voice), and DRM.
The sample's media, DRM and Content Launcher declarations were removed from the manifest, and the unused media
packages from the dependencies, so the app asks only for what it uses.

**Platform gaps we hit, and what we asked Amazon for**

- **The screen can't stay on.** Vega OS has no keep-awake API for non-media apps, so after its timeout (about
  5 minutes by default) the system screensaver replaces the wall calendar. Families can lengthen the wait in
  Settings → Display & Sounds → Ambient Experience. See
  [friction log entry 14](./docs/FRICTION_LOG.md#entry-14--vega-os-cannot-keep-the-display-on-for-a-non-media-app)
  and [FR-2: let a user keep a dashboard app on screen](./docs/FRICTION_LOG.md#fr-2--let-a-user-keep-a-dashboard-app-on-screen).
- **No reminders during other apps.** Vega has no supported way for a household app to show a short, timed notice
  while another app is playing, so "leave for soccer in 15 minutes" can't appear over a show. See
  [FR-1: timed household notifications during other apps' playback](./docs/FRICTION_LOG.md#fr-1--timed-household-notifications-during-other-apps-playback).
- **Vega-specific bugs found and fixed:** weekday labels from the Vega JavaScript engine
  ([entry 10](./docs/FRICTION_LOG.md#entry-10--vega-js-engine-pads-weekday-only-date-labels)), a dead D-pad when the
  remote was set up after the first render ([entry 11](./docs/FRICTION_LOG.md#entry-11--remote-configured-after-the-first-render-left-the-d-pad-dead)),
  and overlays that didn't get remote focus ([entry 13](./docs/FRICTION_LOG.md#entry-13--overlays-inside-a-screen-did-not-receive-remote-focus)).

## Safety and privacy

- A permission matrix covers parents, children, the shared TV, parent mode on the TV, and voice
  ([docs/PERMISSIONS.md](./docs/PERMISSIONS.md)). Every change goes through one server path that writes an
  audit entry.
- AI suggests; people decide. Imports are drafts, chore-photo verdicts are advisory and never award stars on their
  own, and voice can only propose changes. If Bedrock is unavailable, deterministic fallbacks take over.
- **Calendar links:** encrypted at rest and never sent to any client. They're fetched only over HTTPS from a public
  address that is checked and pinned for the connection, which blocks server-side request forgery (SSRF).
- **Family photos** (the wall-calendar slideshow): re-encoded to strip location and camera data, private to the
  household, and never sent to AI. Chore and flyer photos go to Amazon Bedrock only for a suggestion a parent reviews.
  The weather location is rounded to about 1 km.

## Status

| Area | State |
|---|---|
| Family agent API (FastAPI, MCP, Strands, Bedrock, AgentCore Memory) | 200+ automated tests, plus MCP conformance checks that can run against the live service. Deployed on Railway in production mode (Cognito and Postgres) |
| AWS pieces as code ([`infra`](./infra)) | CDK stacks with assertion tests: AgentCore Memory, the API's IAM identity, Cognito |
| TV app on the Vega Virtual Device | Full remote-only regression on 2026-09-28 ([report](./docs/VEGA_VVD_TEST_REPORT.md)). Calendar sync, the wall calendar, and that report's four recommendations were added afterward and are not yet re-run on the VVD |
| TV app on a physical Fire TV | Installed on a Fire TV Stick 4K Select (Vega OS) on 2026-10-03, and the demo path filmed on it with the real remote on 2026-10-07. Amazon's device scenarios and performance checks are still to do ([device test record](./docs/FIRE_TV_DEVICE_TEST.md)) |
| TV app on Fire OS | The Fire OS build of the same screens ([`apps/expo-multi-tv`](./apps/expo-multi-tv)) installed and ran on an emulator |
| Companion web app | Built from the phone app's code and served by the API at `/app`; live at [hometide.up.railway.app/app](https://hometide.up.railway.app/app/) |
| Phone app (Expo, iOS) | Typecheck and browser previews pass; the iPhone checklist is in [apps/companion](./apps/companion/README.md) |
| Real-world use | Used informally by the developer's family and friends. No public release yet |

**Known platform limit:** Vega OS doesn't let non-media apps keep the display awake, so the system screensaver
still starts after its timeout (about 5 minutes by default). Families can lengthen it in Fire TV Settings →
Display & Sounds → Ambient Experience. See the [friction log](./docs/FRICTION_LOG.md).

## Architecture

![Hometide architecture: the Fire TV app, the phone and web app, and voice talk to one Hometide service (FastAPI on Railway with Postgres and an MCP server), which calls Amazon Bedrock (Nova), AgentCore Memory and Cognito in AWS, set up with the AWS CDK](./docs/images/architecture-overview.png)

- **Clients:** the Fire TV app (Vega OS, React Native), the companion app (Expo: web and iOS) and voice (the app's mic,
  or Alexa through the MCP server). Clients never talk to AWS directly and hold no AWS credentials.
- **Hometide service:** FastAPI on Railway with Postgres. Every change goes through one write path (permissions,
  revision check, audit). The TV syncs by revision, so an unchanged household costs one tiny request.
- **AWS:** Amazon Bedrock (Nova, through the Converse API) for voice, briefings, flyer import, recipes and chore-photo
  checks; a Strands agent with the MCP tools for voice; AgentCore Memory for what the family confirmed; Cognito for
  parent sign-in. The AWS pieces are defined in [`infra`](./infra) with the AWS CDK, including the service's own IAM
  identity, scoped to Bedrock and that one memory, whose keys are kept in Secrets Manager.

A more detailed diagram is in [docs/images/architecture.png](./docs/images/architecture.png).

The TV app's layers on Vega OS are in [docs/images/vega-architecture.png](./docs/images/vega-architecture.png); the learning loop and trust rules are in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Repository map

| Path | What it is |
|---|---|
| [`apps/vega`](./apps/vega) | Vega OS TV app (Fire TV) |
| [`apps/expo-multi-tv`](./apps/expo-multi-tv) | Fire OS / Android TV / web build of the same TV screens |
| [`packages/shared-ui`](./packages/shared-ui) | The TV screens, remote-control focus handling, and design system |
| [`packages/domain`](./packages/domain) | Shared types, conflict detection, and demo data |
| [`apps/companion`](./apps/companion) | The phone app (Expo; iOS first) |
| [`services/family-agent`](./services/family-agent) | FastAPI service: household API, calendar sync, MCP voice server, Strands voice agent, rhythm engine, Bedrock features |
| [`infra`](./infra) | AWS CDK: AgentCore Memory, IAM for the API, Cognito |
| [`alexa-skill`](./alexa-skill) | The "home tide" Alexa skill package |

Built on Amazon's React Native multi-TV sample.

## Testing it as a judge

The quickest way is the hosted demo family; nothing to install.

1. Open the web app at [hometide.up.railway.app/app](https://hometide.up.railway.app/app/) (a phone or a desktop
   browser) and sign in with the judge login from the Devpost form. The parent code for approvals is **2468**.
   The family's week is ready: every Tuesday and Thursday, Jordan's meeting clashes with Emma's pickup.
2. **Open the TV app:** on a Fire TV (Vega OS), or in a browser on your computer (step 4 of
   [Run it locally](#run-it-locally), with `EXPO_PUBLIC_FAMILYOS_API_URL=https://hometide.up.railway.app` in
   `apps/expo-multi-tv/.env`). Arrow keys and Enter act as the remote.
3. **Pair it:** on the TV, Settings → **Show pairing code**. Scan the QR code with the phone, or in the web app go to
   Family → TV → **Pair a TV**, type the code and tap **Approve TV**.
4. **Fix a clash by voice:** in the web app, tap the mic (or Family → Voice) and say or type "Swap Tuesday's Emma
   pickup to Lindsey". Confirm it on the TV with code 2468.
5. **Watch it learn:** the TV shows *Hometide noticed* with the reason. Confirm it, and every later Tuesday and
   Thursday pickup moves to Lindsey. Then ask "What has Hometide learned about us?".
6. **Create a recipe:** open Meals (Lists → Meals; on a phone, Chores → Lists & meals), pick a day, describe a meal ("easy salmon dinner, 25 minutes")
   and tap **Create recipe**. It appears on that day, on the TV's Meals screen, and its ingredients go to Groceries.

## Run it locally

Everything runs on your own computer in local demo mode: no AWS account, no cloud sign-in, no keys. The API keeps
the demo family in memory and resets it on restart.

**You need:** Git, Node.js 20 or newer (Yarn 4 comes through corepack), and Python 3.11 or newer.

1. **Get the code and install the JavaScript packages**

   ```bash
   git clone https://github.com/vvdotcom/FamilyOs.git
   cd FamilyOs
   npx -y corepack@0.34.0 yarn install
   ```

2. **Create the two local settings files** from the examples (they hold no secrets and default to local demo mode)

   ```bash
   cp .env.example .env
   cp apps/expo-multi-tv/.env.example apps/expo-multi-tv/.env
   ```

   On Windows PowerShell use `Copy-Item` instead of `cp`.

3. **Start the Hometide API** (leave this terminal open)

   macOS / Linux:

   ```bash
   cd services/family-agent
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install -e ".[dev]"
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --env-file ../../.env
   ```

   Windows PowerShell:

   ```powershell
   cd services\family-agent
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -e ".[dev]"
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --env-file ..\..\.env
   ```

   Check it at http://127.0.0.1:8787/health.

4. **Open the TV app in a browser** (a second terminal, from the repository root)

   ```bash
   npx -y corepack@0.34.0 yarn dev:web
   ```

   Open http://localhost:8082 (the address Expo prints). Use the arrow keys and Enter as the remote.
   A new TV starts empty until a parent pairs it.

5. **Open the companion web app** at http://127.0.0.1:8787/app/. It's already built and served by the API.
   Choose to create an account: in local mode the email code is shown on the page and no email is sent. Your
   household is the seeded demo family. Set a four-digit parent code when the Today checklist asks.

6. **Pair the TV:** on the TV, Settings → **Show pairing code**; in the web app, Family → TV → **Pair a TV**, type
   the code and tap **Approve TV**. The TV now shows the demo family's week, and you can follow steps 4–6 of
   [Testing it as a judge](#testing-it-as-a-judge).

**AI features without AWS:** with no Bedrock settings, Hometide uses deterministic stand-ins, so every flow still
works: briefings are written by a deterministic provider, flyer import reads text, PDF and `.ics` files, chore checks are a demo verdict,
and AI recipes come from a small built-in cookbook. To use Amazon Bedrock, set `FAMILYOS_AI_PROVIDER=bedrock`,
`AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK` and `FAMILYOS_BEDROCK_MODEL_ID` in the root `.env` (never in an Expo
`.env`). See [the service guide](./services/family-agent/README.md).

**Run the tests**

```bash
npx -y corepack@0.34.0 yarn test                 # TV app tests (Fire OS / web build and Vega)
cd services/family-agent && python -m pytest     # API tests (with the virtual environment active)
```

**On a Fire TV (optional):** build the Vega app with `npx -y corepack@0.34.0 yarn build:vega` on a Vega SDK host and
install it with `vega device install-app`; on Windows, `.\familyos.ps1 tv` does both through the managed Ubuntu VM
(see [Developing on Windows](#developing-on-windows-vega-sdk)). Point the TV at your computer with
`EXPO_PUBLIC_FAMILYOS_API_URL` set to an address the TV can reach. The Fire OS build is in
[`apps/expo-multi-tv`](./apps/expo-multi-tv) (`yarn build:firetv`, through EAS).

A browser run is not Fire TV or VVD validation. Those are tracked in the phase documents.

## Built during the hackathon

Work started on 2026-09-22 from Amazon's React Native multi-TV sample, which provided the app scaffolding, the
remote-control plumbing, and the build configuration (see [friction log](./docs/FRICTION_LOG.md) entry 1).
Everything else was built for this project:
- the TV screens and design system
- the shared domain and conflict engine
- the family agent API: accounts, permissions, audit, calendar sync, the MCP voice server, the Strands voice agent,
  the rhythm engine with AgentCore Memory, and the Bedrock features
- the Alexa skill, the CDK infrastructure, and the QR pairing encoder
- the phone app
- the Windows and EC2 Vega setup automation
- the tests and measurement scripts

## Docs

- [Architecture](./docs/ARCHITECTURE.md): the diagram, the learning loop, and the AWS services used
- [Measurements](./docs/MEASUREMENTS.md): sync latency, Bedrock cost, and the Skylight comparison
- [Permissions](./docs/PERMISSIONS.md) · [Friction log](./docs/FRICTION_LOG.md) · [Product feedback](./docs/PRODUCT_FEEDBACK.md)
- [Railway deployment](./docs/RAILWAY_DEPLOYMENT.md) · [Vega VVD report](./docs/VEGA_VVD_TEST_REPORT.md) · [Fire TV device test record](./docs/FIRE_TV_DEVICE_TEST.md)
- [Implementation phases](./docs/phases/README.md) · build specification: [docs/process/build-spec.md](./docs/process/build-spec.md)

## Developing on Windows (Vega SDK)

Windows isn't a native Vega SDK host, so Vega builds run in a managed Ubuntu VM:

```powershell
.\setup\verify-host.ps1
.\familyos.ps1 setup       # creates or resumes the Ubuntu VM and installs the Vega SDK
.\familyos.ps1 simulator   # Vega Virtual Device, when nested virtualization is available
.\familyos.ps1 status
```

Setup reuses its cached Ubuntu ISO, keeps an existing VM, and resumes after interruptions. Local SSH and API
forwards bind to `127.0.0.1`. Without nested virtualization it installs the build SDK and skips the VVD, and it never
changes Hyper-V or Windows security settings. Regression checks for the bootstrap scripts:
`powershell.exe -NoProfile -File .\setup\tests\windows-bootstrap.tests.ps1`.

## License

Hometide is released under the MIT License, Copyright (c) 2026 Hometide; see [LICENSE](./LICENSE). The project
started from Amazon's Fire TV / Vega sample app (MIT-0); files from it keep Amazon's copyright header.
Bundled design fonts keep their SIL Open Font License notices in `packages/shared-ui/src/assets/fonts` and
`apps/vega/assets/fonts`.
