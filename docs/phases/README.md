# FamilyOS implementation phases

`single.md` remains the product and engineering source of truth. These phase files turn
that contract into ten sequential delivery checkpoints. Phases 1–6 deliver the original
MVP; Phases 7–10 extend it with the features approved on 2026-09-23. A phase is complete only when
its exit criteria pass or a platform-specific blocker is recorded in
`docs/FRICTION_LOG.md`.

1. [Phase 1 — Foundation and automated development environment](./phase-1-foundation.md)
2. [Phase 2 — Domain core and TV shell](./phase-2-domain-tv-shell.md)
3. [Phase 3 — Household experience](./phase-3-household-experience.md)
4. [Phase 4 — Safe intelligence and family agent](./phase-4-safe-intelligence.md)
5. [Phase 5 — Ambient mode and production integrations](./phase-5-integrations.md)
6. [Phase 6 — Device validation and hackathon release](./phase-6-release.md)
7. [Phase 7 — Improvements](./phase-7-improvements.md)
8. [Phase 8 — Rewards and parent approval](./phase-8-rewards.md)
9. [Phase 9 — Parent/admin and child access](./phase-9-access-modes.md)
10. [Phase 10 — Mobile control and family photos](./phase-10-mobile-control.md)

## Development and testing schedule

- Use the local web app, keyboard navigation, and automated checks for iteration through
  Phases 1–4. Keep platform compatibility checks distinct from web verification.
- Perform Vega Virtual Device integration testing at the end of Phase 5 and final Vega
  regression plus physical Fire TV validation in Phase 6.
- Phases 7–10 continue with local development. Their TV changes need subsequent Vega/device
  regression before release; the Phase 6 results cannot validate code added afterward.
- Phase 8 introduces a limited parent approval code. Phase 9 extends that foundation into
  account roles and permissions; Phase 10 reuses them for the companion page.
- Phase 5 establishes parent sign-in, cloud household ownership/storage, secure TV pairing,
  local caches, and synchronization. Its minimal phone pairing page grows into the full
  Phase 10 companion; real cloud data must not precede basic backend authorization.
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

