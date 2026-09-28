# Phase 11 (optional) — Documentation, demo, and optional calendar integration

> **Status: optional for now.** Phases 12–15 take priority. The demo video, real-device
> regression, and required submission materials (accurate README, product feedback,
> friction log) are owned by [Phase 15](./phase-15-final-device-demo.md). Work here only
> when it does not delay Phases 12–15.

## Outcome

Turn the completed and verified FamilyOS product into a reproducible, clearly documented,
evidence-backed release with a concise demo that works without live third-party services.
This phase also provides an optional work package for connecting an external calendar; that
integration is not a prerequisite for Phase 11 completion or the FamilyOS household calendar.

This phase owns final documentation consolidation and demo preparation. Keep directly
affected implementation instructions accurate during earlier phases; Phase 11 is not a
reason to leave setup, security, or API instructions knowingly stale.

## Dependencies and scope

- Covers `single.md`'s calendar provider abstraction and EPIC 12; implementation is optional.
- Follows product implementation through Phase 10 and the corresponding device/platform
  verification. Re-run any checks invalidated by changes made after their earlier phase.
- Use the current `single.md` release definitions and phase checklists as the source of truth.
- Do not claim a platform, provider, security control, or production flow is complete without
  verifiable evidence. Distinguish local/demo behavior from deployed behavior.

## Work packages

- [ ] Verify a clean checkout can follow the README to install dependencies, run local
  services, launch the TV and phone apps, and execute the relevant test suites.
- [ ] Consolidate the architecture, data-flow, privacy, security, deployment, recovery,
  troubleshooting, and known-limitations documentation.
- [ ] Record a final test matrix and evidence for domain, UI, API/authentication, pairing,
  sync, provider, Vega virtual-device, and real-device checks that were actually run.
- [ ] Capture current screenshots and update the friction/feedback notes without presenting
  sample data or previews as production behavior.
- [ ] Recheck current hackathon rules, permitted third-party assets, and provider terms used
  in the release; record applicable attributions and limitations.
- [ ] Optional: implement Google Calendar OAuth and selected-calendar mapping, incremental
  synchronization, explicit disconnect/token invalidation, and a deterministic demo fallback.
  Keep tokens backend-only and define conflict behavior before allowing writes back to Google.
- [ ] Write and rehearse a deterministic three-minute demo path, including a backup path for
  offline mode or provider failure; do not depend on live OAuth or perfect Wi-Fi.
- [ ] Capture the final demo and prepare release notes and evidence links.
- [ ] Gate `v0.1-demo`, `v0.2-vega`, `v0.3-firetv`, and `v1.0-hackathon` tags against the
  release definitions in `single.md`; create a tag only for a commit whose required checks
  have evidence.

## Verification checkpoints

- Follow the documented clean-checkout path from a fresh clone without relying on hidden
  local files, unrecorded credentials, or undocumented manual steps.
- The demo finishes within three minutes on the validated target and has a deterministic
  fallback for network or provider failures.
- External Google Calendar connection is not required to pass this phase; if implemented,
  verify consent, sync, disconnect, and safe fallback without making it a demo dependency.
- Captions, screenshots, recordings, and release notes accurately describe the tested build;
  secrets, personal household data, and unapproved family photos are not exposed.
- Every release tag maps to a verified commit and its evidence identifies the actual test
  environment.

## Exit criteria

The repository can be reproduced by a new developer, the final documentation matches the
shipped behavior, and an evidence-backed three-minute demo and release package are ready.
