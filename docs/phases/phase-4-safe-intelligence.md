# Phase 4 — Safe intelligence and family agent

## Outcome

Add the signature workflow: detect a real household problem, explain it, propose a safe
action, require confirmation, update state, and recompute conflicts.

## Specification coverage

- `docs/process/build-spec.md` sections 2.4–2.6, 12–14, 18.1, 19, 20 / EPIC 6–8, and 23.3–23.5.

## Work packages

- [x] Build conflict review and confirmation modal flows.
- [x] Implement action validation, mutation, audit-friendly result envelopes, and conflict
  recomputation.
- [x] Create the FastAPI service and typed client for health, household, events, chores,
  conflicts, briefing, action proposal/confirmation, and reset endpoints.
- [x] Implement the deterministic briefing provider and structured provider contract.
- [x] Implement Bedrock behind backend-only credentials with deterministic fallback.
- [ ] Add offline client fallback and the six-step demo smoke test.

## Verification checkpoints

- Domain and backend tests cover valid, invalid, stale, and duplicate confirmations.
- Contract fixtures validate server responses against client schemas.
- The demo pickup conflict disappears only after explicit confirmation.

## Exit criteria

The complete understand → detect → explain → propose → confirm → update loop works offline
and degrades safely when AI or the backend is unavailable.

## Local implementation notes

- The API implementation is in `services/family-agent`; run it using the local service guide.
- The TV app posts a minimized, typed family context to the backend. Bedrock only returns a
  validated briefing; the deterministic service owns availability and action validation.
- The local bearer token belongs in the ignored root `.env` and is never passed to Expo.
- Automated domain/backend/contract coverage and the six-step demo smoke run remain to be
  completed before marking the phase complete.

