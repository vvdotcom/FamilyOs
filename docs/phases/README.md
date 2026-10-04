# FamilyOS implementation phases

`docs/process/build-spec.md` remains the product and engineering source of truth. These phase files turn
that contract into fifteen sequential delivery checkpoints. Phases 1–6 deliver the original
MVP; Phases 7–10 extend it with the features approved on 2026-09-23; Phase 11 consolidates
documentation and is optional for now; Phases 12–14 add the Fire TV priority-category
features approved on 2026-09-27; Phase 15 is the final real-device validation, demo video,
and hackathon submission. A phase is complete only when
its exit criteria pass or a platform-specific blocker is recorded in
`docs/FRICTION_LOG.md`.

1. [Phase 1 — Foundation and automated development environment](./phase-1-foundation.md)
2. [Phase 2 — Domain core and TV shell](./phase-2-domain-tv-shell.md)
3. [Phase 3 — Household experience](./phase-3-household-experience.md)
4. [Phase 4 — Safe intelligence and family agent](./phase-4-safe-intelligence.md)
5. [Phase 5 — Ambient mode and production integrations](./phase-5-integrations.md)
6. [Phase 6 — Device validation](./phase-6-release.md)
7. [Phase 7 — Improvements](./phase-7-improvements.md)
8. [Phase 8 — Rewards and parent approval](./phase-8-rewards.md)
9. [Phase 9 — Parent/admin and child access](./phase-9-access-modes.md)
10. [Phase 10 — Mobile control and family photos](./phase-10-mobile-control.md)
11. [Phase 11 (optional) — Documentation, demo, and optional calendar integration](./phase-11-documentation-demo.md)
12. [Phase 12 — Alexa+ voice and multi-modal control](./phase-12-alexa-voice.md)
13. [Phase 13 — Chore photo verification](./phase-13-chore-vision.md)
14. [Phase 14 — Movement breaks, kids' sports, and family night](./phase-14-move-sports-family-night.md)
15. [Phase 15 — Final Fire TV validation, demo video, and submission](./phase-15-final-device-demo.md)

## Development and testing schedule

- Use the local web app, keyboard navigation, and automated checks for iteration through
  Phases 1–4. Keep platform compatibility checks distinct from web verification.
- Perform Vega Virtual Device integration testing at the end of Phase 5 and final Vega
  regression plus planned device validation in Phase 6. Physical Vega verification remains
  scheduled for Phase 10 as previously requested.
- Phases 7–10 continue with local development. Their TV changes need subsequent Vega/device
  regression before release; earlier device results cannot validate code added afterward.
- Phase 11 follows product implementation and device verification. Keep implementation docs
  accurate as code changes, then consolidate the clean-checkout guide, evidence, screenshots,
  demo script/capture, and release tags in that phase.
- Phases 12–15 target the hackathon deadline (2026-10-23, 12:00 pm PT). Suggested windows:
  Phase 12 by 2026-10-03, Phase 13 by 2026-10-07, Phase 14 by 2026-10-14, and Phase 15
  from 2026-10-15, leaving about a week for device regression, the demo video, and
  submission materials. Phase 11 work happens only if it does not delay these.
- Phase 8 introduces a limited parent approval code. Phase 9 extends that foundation into
  account roles and permissions; Phase 10 reuses them for the companion page.
- Phase 5 establishes parent sign-in, cloud household ownership/storage, secure TV pairing,
  local caches, and synchronization. At the user's request, the core Expo Go companion
  screens (Today, event editing, profiles, chores, lists, meals, and Settings) have moved
  here from Phase 10. Phase 10 now expands photo management, imports, and advanced mobile
  controls; real cloud data must not precede basic backend authorization.
- Phase 5 remains explicitly **in progress** until the user completes live AWS Cognito,
  Railway deployment/auto-deploy from GitHub pushes, and companion account creation,
  sign-in, and sign-out against the deployed service. Local simulation does not satisfy this gate.

## Shared rules

- Preserve a runnable web target after every phase.
- Keep facts, deterministic conflicts, generated summaries, and proposed actions distinct.
- Require explicit confirmation before every state mutation proposed by the system.
- Treat D-pad navigation, visible focus, Back behavior, and 1080p safe zones as acceptance
  criteria rather than polish.
- Never claim VVD or physical-device validation unless it was actually performed.

