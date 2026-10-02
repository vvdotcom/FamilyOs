# Railway deployment

## Current status

The FastAPI service now has a production mode using Amazon Cognito ID-token verification,
PostgreSQL-backed household data and revocable sessions, protected household routes, and
HTTPS-only session cookies for browser clients and explicit bearer sessions for native
clients. Railway startup deliberately fails closed unless those
production settings are enabled. The local SQLite/development-email account flow and demo
API are not mounted in production.

The `FamilyOS` project now exists in the `Husky's Projects` workspace with a dedicated
`Postgres` service and `familyos-api` service. The API was deployed from
`/services/family-agent` using its Dockerfile and production Cognito/Postgres variables.
Both services report `RUNNING`, and the API startup log reports application startup
complete. The API is live at `https://hometide.up.railway.app`.
The `/health` endpoint reports production Cognito mode and database readiness. Anonymous
household, event, chore, and routine requests return 401; development-email tools return
404. Cognito self-registration is enabled, with email verification required. The Expo Go account
flow does not require OAuth callback configuration. The separate SwiftUI browser sign-in
flow still needs its callback URLs saved.

## AWS Cognito (us-west-2)

- Account: `237320501162`
- User pool: `us-west-2_8isgUyBvQ`
- Issuer: `https://cognito-idp.us-west-2.amazonaws.com/us-west-2_8isgUyBvQ`
- iOS public app client: `2imsmu2e7rdnfo79jd38mj08m` (no client secret)
- iOS callback and logout URL: `com.familyos.companion:/oauth2redirect`
- Expo companion: direct Cognito SignUp/ConfirmSignUp and `USER_AUTH` with the `PASSWORD`
  preferred challenge. The public client already enables choice-based sign-in.
- SwiftUI companion: authorization code, `openid`, `email`, PKCE with S256 through
  `ASWebAuthenticationSession`; callback configuration is still pending.

The Expo companion is under `/apps/companion`, targets iOS bundle ID
`com.familyos.companion`, and supports hosted email/password accounts in SDK 57 Expo Go.
Passwords go directly to Cognito; only its ID token is exchanged with the backend for an
opaque FamilyOS session stored in SecureStore. No custom callback is needed. Set the deployed HTTPS API address in the app's
Settings if an older saved address overrides the new Railway default.

The SwiftUI callback/logout URLs and OAuth scopes must be set before that separate
browser-based flow can work. Public self-registration remains a deliberate account-pool
setting; only enable it after the public backend is deployed and ready to accept accounts.

## Intended service layout

- Repository: `vvdotcom/FamilyOs`, branch `main` (not yet connected to Railway).
- Railway service root directory: `/services/family-agent`.
- Builder: Dockerfile detected in that directory.
- Health check: `/health`.
- Start command: supplied by `Dockerfile`; it binds to Railway's injected `PORT`.
- Auto-deploy: connect the GitHub repository and select the branch to deploy. Enable
  deployment on pushes to that branch. Keep service variables in Railway, not in Git.

The service and database are provisioned through the Railway CLI. GitHub source connection
and branch-based autodeploy are not configured; deployments are manual CLI uploads until a
repository and branch are connected.

## Railway service variables

- `FAMILYOS_AUTH_MODE=cognito`
- `FAMILYOS_DEMO_MODE=false`
- `FAMILYOS_COOKIE_SECURE=true`
- `FAMILYOS_COGNITO_ISSUER=https://cognito-idp.us-west-2.amazonaws.com/us-west-2_8isgUyBvQ`
- `FAMILYOS_COGNITO_CLIENT_ID=2imsmu2e7rdnfo79jd38mj08m`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (reference a PostgreSQL service in the same
  dedicated FamilyOS Railway project)
- `FAMILYOS_CORS_ORIGINS=` (leave empty for the native iOS companion unless a trusted web
  origin is added later; never use `*` in production)

Do not add the previously shared Bedrock key or any AWS credential to Git or the iOS app.
The service can use its deterministic briefing fallback until a properly managed server-side
AI credential is configured.

## Deployment and remaining checks

The Dockerfile is under `/services/family-agent`, exposes `/health`, and binds to Railway's
injected `PORT`. The dedicated FamilyOS Postgres service is referenced through Railway
variables; do not use the unrelated project/database in the workspace. The backend applies
versioned SQL migrations on startup. Deployment `ec7dcffd-dc8e-4086-9cdc-034724ccfa3c`
reports SUCCESS. The service includes `railway.toml` with `/health` deployment checks.
Railway currently warns that this config format must migrate to Infrastructure as Code
before December 1, 2026; do that before the cutoff.

Local verification: 25 backend tests, 17 companion regression tests, companion
TypeScript checking, and iOS JavaScript/Hermes export pass. These do not constitute a
signed native build or on-device testing. The session-envelope/account mismatch in the
Expo companion is fixed. Both companion implementations default to the deployed API.

The Expo phone UI now reads `/v1/household` and uses owner-authenticated
`POST /v1/companion/edit` for events, profiles, chores, lists, and simple meals. The
backend takes household ownership from the verified session, not the request body.
Snapshot revisions and a Postgres row lock reject concurrent stale writes. New snapshot
fields have defaults, so existing households require no destructive migration.
Actual phone persistence and cross-device edit tests remain to be performed by the user;
browser design tests use an explicitly labeled in-memory fixture.

A live Expo Go test still requires exercising real account creation, email verification,
sign-in, and sign-out on the phone. Public self-sign-up is enabled. A custom iOS build is not required for this flow.
Additional MFA challenges fail closed; their entry screen remains unimplemented.
Cognito password reset does not yet revoke existing FamilyOS sessions on other devices;
cross-device revocation remains security follow-up work. Phase 5 is not complete
until the AWS setup, Railway deployment, and iOS account creation/sign-in/sign-out flow have
been exercised end-to-end.

Once a connected GitHub branch has autodeploy enabled, pushes to that branch can trigger
deployments automatically. Until then, deployment is a manual Railway CLI upload. Confirm
each deployment's health and logs in Railway; repository files alone cannot connect an
account, provision services, or guarantee a successful release.
