# Phase 5 — Ambient mode and production integrations

**Status: IN PROGRESS.** Do not mark this phase complete when only the local simulator or
Docker build works. The required completion gate is live AWS Cognito, a Railway deployment
that receives updates from connected GitHub pushes, and the companion account creation,
sign-in, and sign-out flows tested against that deployed service. See
[Railway deployment preparation](../RAILWAY_DEPLOYMENT.md).

## Outcome

Turn the local MVP into a cloud-backed household product with parent sign-in, secure TV
pairing, local caching, synchronization, ambient behavior, and optional calendar, weather,
voice, and AWS adapters. Keep an isolated, deterministic offline demo available.

## Specification coverage

- `single.md` sections 2.7, 13, 15–18, 20 / EPIC 9–10 and 12–13, 21, and 30–31.
- Approved scope addition: introduce basic account ownership and access in Phase 5 before
  storing real household data in the cloud, rather than waiting until Phase 9.

## Access and storage architecture

- The cloud backend is the authoritative household store. Every record and protected
  request is scoped to an authenticated household; the client cannot choose another
  household simply by supplying its ID.
- Fire TV and phone/browser clients cache permitted data for fast loading and offline
  viewing. Neither device is the sole source of truth. Store device sessions securely,
  separately from ordinary caches; never embed backend or cloud-service credentials.
- A parent signs in through a phone/computer browser, creates the household, and explicitly
  approves TV pairing. No account password entry is required on the TV remote.
- A paired TV normally exposes a restricted shared-household view. Profile selection is
  not authentication and does not grant administrative access. Parent-only operations
  require server-verified authorization from this phase onward.
- Phase 8 introduces the four-digit parent approval PIN. It must not serve as an internet
  login password or TV pairing secret. Phase 9 expands role permissions and temporary
  parent mode; Phase 10 expands the minimal pairing page into the full phone companion.

## Dependencies and boundaries

- Build on Phase 4's typed backend and action validation, adding or completing household
  IDs, ownership, and authentication boundaries before accepting real cloud data.
- Select and document the identity provider, authoritative database, secure session
  storage, and hosting approach before deployment. Confirm costs and deployment scope
  separately; this plan does not authorize provisioning paid resources.
- Persist the implemented household models (members, events, chores, routines, and
  preferences). Later-phase lists, recipes, rewards, permissions, and private photos
  extend this same household model when implemented; this does not pull all those
  features into Phase 5.

## Work packages

### Local checkpoint (verified separately; not production completion)

- [x] Provide a phone-sized local companion page for parent account creation, email-code
  verification, sign-in, sign-out, password reset, and household ownership preview.
- [x] Use a local SQLite store with scrypt password hashes, one-use expiring codes, an
  HttpOnly session cookie, and a development-only email outbox for test codes.
- [x] Add a Railway Docker build and health check entry point. Production startup is blocked
  until the protected cloud identity/data path is implemented, preventing accidental exposure
  of the demo API.
- [x] Test the local flows and API security checks; record the test result below.

Local checkpoint result (2026-09-24): `python -m pytest` — 5 passed. This verifies the
local API/auth simulator only. The new SwiftUI client still needs an Xcode build and
iPhone/simulator walkthrough on a Mac; neither result counts toward the Phase 5 production
completion gate.

- [ ] Add parent account creation, sign-in, sign-out, and account recovery through a
  browser-based identity flow; establish authenticated household ownership.
- [ ] Configure and verify the real AWS Cognito user pool, email delivery/verification,
  password reset, OIDC token checks, session revocation, and the production companion flow.
- [ ] Connect the GitHub repository/branch to Railway with auto-deploy on push, configure
  PostgreSQL and production secrets, and verify a successful deployment. A Dockerfile alone
  does not connect Railway to a GitHub repository.
- [ ] Enforce household isolation, basic owner permissions, session expiry, token
  refresh/revocation, and protected API access on the backend—not only in the UI.
- [ ] Build a minimal phone-friendly sign-in/pairing page. Show a QR code or short code
  on TV backed by an expiring, single-use, rate-limited challenge. Require an authenticated
  owner to explicitly approve the named TV before issuing a scoped device session.
- [ ] Add TV sign-out/unpair and parent-managed device revocation. Remove device sessions
  and private cached household data/photos on local unpair. Remote revocation must reject
  subsequent server requests and clear the device cache on reconnect; document that a
  disconnected device cannot be remotely wiped immediately.
- [ ] Implement authoritative cloud household persistence, validation, migrations, and
  documented retention/deletion behavior. Keep real and demo households isolated.
- [ ] Add versioned local TV/browser caches, last-sync indicators, offline/error states,
  and secure device-session storage. Signing out on a phone ends that phone session;
  revoking a paired TV is a separate, explicit action.
- [ ] Synchronize household changes between TV, the minimal browser client, and backend.
  Queue only explicitly permitted offline edits, with idempotent retries, version checks,
  and visible conflict resolution; never silently overwrite a newer household change.
- [ ] Require online server verification for protected account/permission operations.
  Define the same fail-closed contract for future parent approvals and reward redemption;
  they must not be approved from an offline cache or replayed without revalidation.
- [ ] Add idle detection, low-motion ambient layout, bundled family-photo assets, and wake
  on any remote key.
- [ ] Complete Vega manifest, package, VVD automation, virtual-remote smoke coverage, and
  performance observations.
- [ ] Add Google Calendar OAuth and mapping behind the provider abstraction, including
  disconnect and demo-safety behavior.
- [ ] Add production weather provider behavior without making the demo network-dependent.
- [ ] Complete Bedrock mode and optionally add Strands/AgentCore adapters. Choose the
  household database independently; DynamoDB is an option, not a second source of truth.
- [ ] Add a developer/demo command palette and evaluate the compatible voice stretch path.

## Verification checkpoints

- Account creation, recovery, sign-in/out, session expiry, refresh, and revocation work
  without leaking credentials in logs, URLs, or ordinary local storage.
- Unauthorized requests and cross-household reads/writes are rejected by backend tests,
  including attempts made outside the visible interface.
- Pairing tests cover expired/reused codes, guessing limits, unapproved devices, and
  owner confirmation. A profile selection or four-digit PIN cannot pair a TV.
- Data survives backend/device restarts and synchronizes between authorized clients.
  Offline retries, duplicate submissions, conflicting edits, and reconnects are tested.
- Local unpair clears private caches and credentials without deleting the cloud household.
  Revoked devices cannot synchronize; disconnected-device limitations are documented.
- Complete a local end-to-end account/pairing/sync walkthrough before the end-of-phase
  Vega integration pass. Phase 6 repeats these flows on physical Fire TV hardware.
- Ambient mode never traps focus and always wakes from remote input.
- Provider failures fall back without exposing secrets or raw exceptions.
- VVD package/install/launch and remote checklist pass on the actual simulator.

## Exit criteria

The phase remains open until the user's explicit external completion gate above is met, in
addition to the technical exit criteria below. Local-only authentication and local API tests
are preparation, not proof of live identity, cloud persistence, or a Railway release.

A parent can sign in, create a household, securely pair/unpair a TV, and see authorized
household changes persist in the cloud and synchronize across clients. Local caches keep
ordinary viewing usable offline without bypassing protected actions. The app runs reliably
in VVD, retains deterministic offline judging, and enables real providers without rewriting
UI or domain logic. Full role management, PIN approvals, and the full companion remain in
Phases 8–10.

