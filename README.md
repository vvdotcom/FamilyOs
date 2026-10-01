# FamilyOS

**The family wall calendar, on the Fire TV you already own.**

[![CI](https://github.com/vvdotcom/FamilyOs/actions/workflows/ci.yml/badge.svg)](https://github.com/vvdotcom/FamilyOs/actions/workflows/ci.yml)

Smart family calendars like Skylight cost $150–$570 for the screen, plus $79.99 a year for meal planning,
rewards, and Magic Import, and $14.99 a month for the AI assistant. Most families already have a large screen
in the living room: Amazon has sold [more than 250 million Fire TV devices](https://www.tvtechnology.com/news/amazon-passes-250-million-fire-devices-sold-expands-fire-tv-lineup). FamilyOS turns that screen into the
family's shared calendar and command center, with a phone app for parents and kids and Alexa+ for voice.

| | Skylight Calendar | FamilyOS |
|---|---|---|
| Screen | 10" $149.99 · 15" $299.99 · 27" $569.99 | The Fire TV you already own |
| Import, meals, rewards, photo screensaver | Calendar Plus, $79.99/year | Included |
| AI assistant | $14.99/month or $119.99/year | Alexa+ (MCP) · Bedrock AI measured at about $0.13–$0.51 per household per month |

Skylight prices as of 2026-09-29 ([models](https://myskylight.com/compare-calendars),
[subscriptions](https://skylight.zendesk.com/hc/en-us/articles/51833126965019-Subscription)). How the AI cost was
measured: [docs/MEASUREMENTS.md](./docs/MEASUREMENTS.md).

## What it does

**On the TV** (Vega OS and Fire OS, remote only)
- **Home:** a family briefing, today's timeline, who's free, and what's next, including when to leave.
- **Wall calendar:** after 2 idle minutes the TV shows the day in large type: clock, weather, next up, dinner,
  chores left, and a family photo. After 10 pm it dims to a quiet clock, and it shifts a few pixels each minute
  to protect the screen.
- **Calendar:** day, week, and month views, with all-day items in their own row and conflicts flagged
  (double-booked drivers, tight travel time).
- Chores with a star celebration, rewards, meals, lists, a photo slideshow, movement breaks, family night voting.
- **Approvals:** photo-checked chores, reward requests, and voice requests, confirmed with a four-digit parent
  code on the remote.

**On the phone** (iOS through Expo)
- **Set up in 5 minutes:** connect calendars, add kids, set a parent code, pair the TV, set the weather location.
- **Connected calendars:** paste the private iCal link from Google Calendar, iCloud, or Outlook (or a school or
  league `.ics` link). FamilyOS re-reads it about every 15 minutes and never writes back.
- **Import:** photograph a flyer or pick a PDF, email, or `.ics` file. Amazon Bedrock drafts the event, and you
  review it before saving.
- Chores with photo verification, rewards, lists, meals and recipes, groceries, sports teams and carpool
  rotation, family night, photos for the TV, and a child mode kids can use on their own.

**By voice**
- An MCP server (protocol 2025-11-25) lets Alexa+ answer "what's on today?" and *suggest* changes.
  Nothing changes until a parent confirms on the TV or phone.

## Safety and privacy

- A permission matrix covers parents, children, the shared TV, parent mode on the TV, and voice
  ([docs/PERMISSIONS.md](./docs/PERMISSIONS.md)). Every change goes through one server path that writes an
  audit entry.
- AI suggests; people decide. Imports are drafts, chore-photo verdicts are advisory and never award stars on their
  own, and voice can only propose changes. If Bedrock is unavailable, deterministic fallbacks take over.
- **Calendar links:** encrypted at rest and never sent to any client. They're fetched only over HTTPS from a public
  address that is checked and pinned for the connection, which blocks server-side request forgery (SSRF).
- **Photos:** re-encoded to strip location and camera data, private to the household, and never sent to AI.
  The weather location is rounded to about 1 km.

## Status

| Area | State |
|---|---|
| Family agent API (FastAPI, MCP, Bedrock) | 137 automated tests. Deployed on Railway in production mode (Cognito and Postgres) |
| TV app on the Vega Virtual Device | Full remote-only regression on 2026-09-28 ([report](./docs/VEGA_VVD_TEST_REPORT.md)). Calendar sync, the wall calendar, and that report's four recommendations were added afterward and are not yet re-run on the VVD |
| TV app on a physical Fire TV | Not yet validated (Phase 15) |
| Phone app (Expo, iOS) | Typecheck and browser previews pass; the iPhone checklist is in [apps/companion](./apps/companion/README.md) |
| Real-world use | Used informally by the developer's family and friends. No public release yet |

**Known platform limit:** Vega OS doesn't let non-media apps keep the display awake, so the system screensaver
still starts after its timeout (about 5 minutes by default). Families can lengthen it in Fire TV Settings →
Display & Sounds → Ambient Experience. See the [friction log](./docs/FRICTION_LOG.md).

## Repository map

| Path | What it is |
|---|---|
| [`apps/vega`](./apps/vega) | Vega OS TV app (Fire TV) |
| [`apps/expo-multi-tv`](./apps/expo-multi-tv) | Fire OS / Android TV / web build of the same TV screens |
| [`packages/shared-ui`](./packages/shared-ui) | The TV screens, remote-control focus handling, and design system |
| [`packages/domain`](./packages/domain) | Shared types, conflict detection, and demo data |
| [`apps/companion`](./apps/companion) | The phone app (Expo; iOS first) |
| [`services/family-agent`](./services/family-agent) | FastAPI service: household API, calendar sync, MCP voice server, Bedrock features |
| [`apps/ios-companion`](./apps/ios-companion) | An early native SwiftUI companion; not yet built or tested on a Mac |

Built on Amazon's React Native multi-TV sample.

## Run it locally

```powershell
npx -y corepack@0.34.0 yarn install
npx -y corepack@0.34.0 yarn dev:web          # TV screens in the browser (arrow keys and Enter act as the remote)
npx -y corepack@0.34.0 yarn dev:companion    # phone app in Expo Go
npx -y corepack@0.34.0 yarn test             # TV tests (Expo TV and Vega)
```

The family agent API runs at `http://127.0.0.1:8787`. Set up the ignored root `.env` from `.env.example`, then follow
[the service guide](./services/family-agent/README.md). Bedrock is optional: without it, briefings, imports,
and chore checks use deterministic providers.

A browser run is not Fire TV or VVD validation. Those are tracked in the phase documents.

## Built during the hackathon

Work started on 2026-09-22 from Amazon's React Native multi-TV sample, which provided the app scaffolding, the
remote-control plumbing, and the build configuration (see [friction log](./docs/FRICTION_LOG.md) entry 1).
Everything else was built for this project:
- the TV screens and design system
- the shared domain and conflict engine
- the family agent API: accounts, permissions, audit, calendar sync, the MCP voice server, and the Bedrock features
- the phone app
- the Windows and EC2 Vega setup automation
- the tests and measurement scripts

## Docs

- [Measurements](./docs/MEASUREMENTS.md): sync latency, Bedrock cost, and the Skylight comparison
- [Permissions](./docs/PERMISSIONS.md) · [Friction log](./docs/FRICTION_LOG.md) · [Product feedback](./docs/PRODUCT_FEEDBACK.md)
- [Railway deployment](./docs/RAILWAY_DEPLOYMENT.md) · [Vega VVD report](./docs/VEGA_VVD_TEST_REPORT.md)
- [Implementation phases](./docs/phases/README.md) · product contract: [single.md](./single.md)

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

The imported Amazon starter is provided under MIT-0; see [LICENSE](./LICENSE). Bundled design fonts keep their SIL Open
Font License notices in `packages/shared-ui/src/assets/fonts` and `apps/vega/assets/fonts`.
