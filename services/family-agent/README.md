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
briefing instead. The TV app reads only `EXPO_PUBLIC_FAMILYOS_API_URL`. Keep local
development on a trusted private Wi-Fi network; production household access uses the
protected Cognito/PostgreSQL mode described below.

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
Routes include `/health`, household/events/chores/routines/conflicts, GET and POST
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
routes are unavailable in production. See
[`docs/RAILWAY_DEPLOYMENT.md`](../../docs/RAILWAY_DEPLOYMENT.md) for the AWS identifiers,
Railway variables, callback URL, deployment process, and remaining end-to-end checks.
