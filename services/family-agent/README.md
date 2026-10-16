# FamilyOS local family agent

This FastAPI service supplies the seeded household, deterministic conflict engine,
briefing providers, and confirmed action workflow used by the TV app. Its local
repository is held in memory and resets when the service restarts.

## Phase 5 local account preview

The service also hosts a phone-sized account flow at `http://127.0.0.1:8787/companion/`.
It can create a local parent account and household, verify a development email code, sign in
and out, and reset a password. Development codes are captured by a loopback-only outbox and
shown on the page; no email is sent. Passwords are stored as scrypt hashes and browser
sessions use HttpOnly cookies. The local database and its generated pepper file live under
`.familyos/` and are ignored by Git.

This is deliberately a local simulator, not Cognito and not cloud authentication. The
existing family-agent household API still serves seeded demo data and isn't authorized by
these sample accounts. Do not expose the local service to the Internet or use real family
credentials/data with this preview.

Start the API with local auth enabled. The default loopback server is sufficient for browser
preview tests on this computer. To test Expo Go on a phone over the same trusted Wi-Fi, a
LAN-reachable development service is required; enable the development email-code endpoint and
bind to your computer's network interfaces only for that test. Never use the LAN setting on a
public network or production deployment.

```powershell
$env:FAMILYOS_AUTH_MODE = 'local'
$env:FAMILYOS_AUTH_DB_PATH = '.familyos/familyos-auth.sqlite3'
$env:FAMILYOS_LOCAL_AUTH_SHOW_CODES = 'true'
$env:FAMILYOS_LOCAL_AUTH_LAN_TESTING = 'true'
python -m uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload --env-file ..\..\.env
```

The local account tests run with:

```powershell
python -m pytest
```

## Start on Windows

From this directory:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload --env-file ..\..\.env
```

The workspace `.env` is local and ignored by Git. Set `AWS_BEARER_TOKEN_BEDROCK`
there to use Bedrock; never place it in an Expo environment file or client code.
Without the token, model ID, or service access, the API returns a deterministic
briefing instead. A configured Bedrock key is not proof that the model can be called;
verify it with a live request after every key rotation.

Weather is fetched server-side from the National Weather Service (no API key). Set
`FAMILYOS_WEATHER_LATITUDE`, `FAMILYOS_WEATHER_LONGITUDE`, and
`FAMILYOS_WEATHER_LOCATION` to the household's city-center coordinates and display
label. The checked-in `.env.example` leaves these blank. The ignored local `.env` uses
Tucson as a demo fixture, matching the current TV preview; replace it for a different
test location. The first version uses one location per service deployment, so configure
the appropriate location before serving a real household. Keep all location values and
Bedrock credentials on the backend, never in Expo variables. In Railway, set these as
service variables separately from the repository; the ignored local `.env` is never
uploaded as part of a code deployment.

The TV app reads only `EXPO_PUBLIC_FAMILYOS_API_URL`. Keep local development on a
trusted private Wi-Fi network; production household access uses the protected
Cognito/PostgreSQL mode described below.

Expo reads its public API URL from `apps/expo-multi-tv/.env` (see that directory's
`.env.example`). This file contains no Bedrock credentials.

## Start on macOS/Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload --env-file ../../.env
```

## API

The API is available at `http://127.0.0.1:8787`. Success responses use `data` and
`meta.request_id`; errors return a stable code and safe message without a stack trace.
Routes include `/health`, household/events/chores/routines/conflicts, `/v1/weather`, GET and POST
briefing, propose/confirm/cancel action, and demo reset. The TV app uses the POST
briefing route to send a minimized summary context. It omits locations, notes, photos,
and credentials. Bedrock receives only that context and can only return text; all
availability and conflict checks remain deterministic Python code.

## Railway production mode

The production service uses a public Cognito app client with the native iOS
authorization-code + PKCE flow, validates Cognito ID tokens, and stores household
snapshots and hashed FamilyOS sessions in Railway PostgreSQL. Production fails closed
unless `FAMILYOS_AUTH_MODE=cognito`, `FAMILYOS_DEMO_MODE=false`, secure cookies, Cognito
issuer/client ID, and `DATABASE_URL` are configured. Local demo auth, reset, and email-code
routes are unavailable in production. The AWS identifiers and Railway variables are kept with the
maintainers' deployment notes, outside this repository.

## Phases 7-14 additions

Every household write goes through one path (`app/service.py`): the actor (parent, child profile, paired TV,
TV unlocked with the parent code, or voice) is authorized against the Phase 9 matrix
([permission matrix](../../README.md#permission-matrix)), the change is applied with the revision check, and an audit
entry records who made it. Code-protected steps (reward approval, star corrections, chore-photo approval) are only
reachable through their own endpoints; the generic `/v1/companion/edit` route rejects them.

| Area | Routes |
|---|---|
| Access | `POST /v1/tv/parent-mode`, `POST /v1/tv/lock`, `GET /v1/tv/session`, `POST /v1/access-code/reset` (needs the account password or a fresh Cognito ID token), `POST /v1/auth/sessions/revoke-all`, `GET /v1/permissions` |
| Rewards | `POST /v1/redemptions/{id}/decision` (code), `POST /v1/stars/adjust` (code) |
| Imports | `POST /v1/imports/drafts` accepts pasted text, `.eml`, text PDFs, `.ics` team calendars, and (with Bedrock) photos/scanned PDFs. Drafts are editable at confirmation; sources are not kept (only a SHA-256 digest for duplicate detection). |
| Photos | `POST /v1/photos`, `GET /v1/photos/{id}/{tv|thumb}`, `POST /v1/photos/{id}/update`, `POST /v1/photos/{id}/delete`. Uploads are validated by content, re-encoded (EXIF/GPS removed), stored privately per household (150 MB quota). Photos are never sent to AI. |
| Chore photos | `POST /v1/chores/{id}/verification`, `POST /v1/chores/verifications/{id}/decision` (code), `GET /v1/chores/verifications/{id}/photo`. The verdict is advice; stars are added only on approval, and the photo is deleted when a parent decides. |
| Voice | `/mcp` (Streamable HTTP, MCP 2025-11-25), `/.well-known/oauth-protected-resource/mcp`, `GET/POST /v1/voice/connections`, `POST /v1/voice/connections/{id}/revoke`, `GET /v1/proposals`, `POST /v1/proposals/{id}/decision`, `POST /v1/voice/simulate` (labelled simulated Alexa+) |
| Move, sports, family night | `GET /v1/move/routines`, `POST /v1/move/complete`, `GET /v1/reminders`, `GET /v1/family-night` |
| Connected calendars | `POST /v1/calendars` (parent; checks the link before saving it), `POST /v1/calendars/{id}/sync` (once a minute), `POST /v1/calendars/{id}/delete`. Rename or change whose calendar it is with the `calendarMeta` edit. |

### Connected calendars

A parent pastes a calendar's private iCal link (Google "Secret address in iCal format", an iCloud public calendar
link, an Outlook "Publish a calendar" ICS link, or any school or league `.ics` link). The service mirrors the past 7
days and the next 90, expanding repeating events and exceptions, and never writes back. Mirrored events are
read-only (`409 SYNCED_EVENT_READ_ONLY`), all-day items never create conflicts, and a failed download keeps the last
good copy on screen with a message on the phone.

- **Link secrecy:** the link is stored outside the household snapshot, encrypted with AES-GCM and bound to the
  household (`calendar_links` locally, `familyos_calendar_links` in Postgres, migration 006). It is never returned to
  clients or logged.
- **SSRF protection:** HTTPS only (webcal is rewritten to https), no credentials or other ports in the link, and the
  host must resolve to a public address. That address is pinned for the connection and TLS is still verified
  against the host name. Every redirect (at most 3) is checked again. Downloads are capped at 3 MB and 10 s.
- **Background sync:** every `FAMILYOS_CALENDAR_SYNC_MINUTES` (default 15; `0` turns it off, as the tests do). A sync
  with no changes doesn't bump the household revision, so it never makes someone's edit look stale.

### AI spending cap

Bedrock requests are capped per UTC day: `FAMILYOS_AI_CALLS_PER_DAY` per household (default 200) and
`FAMILYOS_AI_CALLS_PER_DAY_TOTAL` across the service (default 5,000). Chore photo checks also keep their own
limit (`FAMILYOS_VISION_CHECKS_PER_DAY`, default 30). Over the cap:
- briefings use the built-in summary
- the simulated Alexa+ uses rules
- chore photos go to a parent as "unclear"
- photo imports return `429 AI_DAILY_LIMIT` with a "paste the text instead" message

The counters live in memory, so they reset if the service restarts.

### Demo household for judges

`scripts/seed_demo_household.py` fills an account with a realistic family: four people, school, pickups, soccer
with a carpool rotation, dinners, chores and rewards, and photos. It also connects Google's public US-holidays calendar
and sets up a pickup conflict every Tuesday. Weekly items repeat for 12 weeks. It goes through the public API as a
parent, skips anything that already exists, and `--reset` clears an earlier demo first.

```powershell
python scripts/seed_demo_household.py seed --local            # local demo API
python scripts/seed_demo_household.py signup                  # hosted: needs FAMILYOS_DEMO_EMAIL / _PASSWORD in .env
python scripts/seed_demo_household.py confirm 123456          # the code Cognito emails
python scripts/seed_demo_household.py seed                    # fill the hosted demo account
```

The demo's parent code is `2468`.

### Measurements

```powershell
python eval/measure_bedrock_cost.py      # real Bedrock token usage per feature (needs Bedrock in .env)
python eval/measure_sync_latency.py      # phone-to-TV latency (needs this API and `yarn dev:web` running, plus Playwright)
```

Results and the per-household cost estimate are in the [root README](../../README.md#measurements).

### Voice (MCP) quick test

Create a connection in the phone app (More → Voice) or with `POST /v1/voice/connections`, then point any MCP
client at `http://127.0.0.1:8787/mcp` with `Authorization: Bearer <token>`. Tools: `get_today`, `get_week`,
`list_conflicts`, `get_member_schedule`, `get_chores`, `get_reward_balance`, `propose_pickup_swap`,
`propose_event`, `propose_reschedule`, `mark_chore_done_request`. Proposal tools only create a pending request;
it is applied once, after someone confirms on the TV or phone. Live Alexa+ linking needs a public HTTPS URL and
an OAuth 2.1 authorization server; see [friction log entry 8](../../docs/FRICTION_LOG.md#entry-8--alexa-mcp-account-linking-needs-a-full-oauth-21-authorization-server).

### Chore photo evaluation (Phase 13)

```powershell
python eval/generate_chore_photos.py        # 60 labelled synthetic photos, deterministic
python eval/run_chore_eval.py --provider demo
python eval/run_chore_eval.py --provider bedrock   # needs AWS_BEARER_TOKEN_BEDROCK
```

Measured on 2026-09-28 (60 synthetic, non-identifying photos; 3 chores; 12 deliberately hard cases):

| Provider | Accuracy | False "looks done" | Unclear |
|---|---|---|---|
| Demo heuristic (colour-clutter measure, not AI; thresholds set on a separate calibration seed) | 66.7% | 0% | 26.7% |
| Amazon Bedrock `us.amazon.nova-lite-v1:0` | 45.0% | 0% | 55.0% |

`unclear` counts as incorrect but is always safe, because a parent still decides. These are drawings, not real
photos; do not read them as real-world accuracy. Per-photo results are in `eval/results/`.

AWS services used: Amazon Bedrock (Converse API: briefings, Nova Lite image input for chore checks and flyer
imports, tool use for the simulated Alexa+), Amazon Cognito (parent accounts; optional OAuth for voice).
