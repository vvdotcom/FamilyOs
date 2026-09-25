# Phase 10 — Mobile control and family photos

## Outcome

Provide phone-friendly companion access for household setup and event entry, and allow
the family to upload and manage photos shown by the TV's ambient mode.

## Dependencies and scope

- Reuse Phase 5 authentication/pairing, Phase 9 permissions, Phase 3 event data, Phase 5 ambient mode,
  and the Phase 7 import contracts where they are exposed on the companion.
- The original scope is a responsive web companion. A native iOS client is also now in scope;
  its first implementation slice is account access and settings, while event entry, pairing,
  document capture, and photo management remain planned. Remote TV power control is out of scope.
- All work below is planned and not yet implemented; see `single.md` section 39.

## Work packages

- [ ] Build and validate the initial native SwiftUI iPhone app for parent account creation,
  email verification, sign-in, password recovery, sign-out, and local server/theme settings.
  The initial source project is in `apps/ios-companion`; it is not complete until built and
  exercised in Xcode on a Mac. Live email, Cognito, Railway, and household sync depend on
  Phase 5 production work.
- [ ] Build a responsive companion page for phone browsers with clear sign-in, household
  selection, and parent/child permissions inherited from Phase 9.
- [ ] Integrate and extend Phase 5's TV-to-phone pairing flow using a short-lived, single-use pairing challenge.
  Require an authenticated authorized user; the four-digit parent approval code must not
  serve as a public login credential or reusable pairing secret.
- [ ] Support household setup and browser-based connection flows for the calendar
  integrations already implemented, including connection status and disconnect controls.
- [ ] Add event creation/editing with family members, timezones, dates, responsibility,
  and preparation items. Confirm changes and show sync/pending/error status on phone and TV.
- [ ] Expose Phase 7 document capture/import on the companion where appropriate, preserving
  the same draft review and explicit confirmation before saving.
- [ ] Let authorized family members upload, preview, organize, choose, and remove photos
  for ambient display. Include sensible ordering and orientation/cropping controls.
- [ ] Validate file content, size, and format, limit storage usage, strip unnecessary
  location metadata, and store photos privately with household-scoped access.
- [ ] Generate TV-sized image variants, cache selected photos for offline use, and handle
  empty, loading, failed, and removed-photo states. Keep bundled photos as labeled demo data.
- [ ] Ensure removed photos leave active playlists and cached copies on reconnect, with
  documented retention behavior. Never send private family photos to AI without a specific
  user-initiated import action that requires it.
- [ ] Synchronize companion changes to the household backend and connected TV, with safe
  retries and explicit handling of conflicting edits or lost connections.
- [ ] Provide sign-out, device/session revocation, phone accessibility, and documented
  pairing recovery; verify the TV remains usable with its own remote.

## Verification checkpoints

- Check phone layouts, keyboard accessibility, setup, event entry, pairing expiry/reuse,
  sign-out, permissions, and cross-household access rejection.
- Build and run the native iOS target on a supported simulator and a personal iPhone; verify
  email-code, session-cookie/Keychain, sign-out, server settings, and light/dark appearance.
- Test event synchronization, duplicate submissions, concurrent edits, offline recovery,
  and credential-safe integration callbacks.
- Test photo validation, orientation, storage limits, private access, deletion, offline
  caching, and ambient fallback using synthetic test photos.
- Run a phone-to-TV walkthrough: pair, enter an event, see it on the dashboard, upload a
  photo, see it in ambient mode, and remove it. Record fresh Vega/device evidence before release.

## Exit criteria

An authorized parent can set up the household and enter events from a phone browser.
Authorized family members can manage private photos for ambient display, changes reach
the TV reliably, and child access remains limited by the Phase 9 permissions.
