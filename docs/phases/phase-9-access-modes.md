# Phase 9 — Parent/admin and child access

## Outcome

Expand Phase 8's parent approval code into household access modes with named users,
persistent roles, and permissions enforced by the backend.

## Status — 2026-09-28

Implemented: an enforced permission matrix (`docs/PERMISSIONS.md`) for parent, child, paired TV, TV unlocked
with the code, and voice; audit entries on every change (no secrets); a visible mode banner on the phone; a
parent unlock from child mode that locks after 15 idle minutes (the phone falls back to the child view) plus a
Lock button; TV parent mode that locks after 5 idle minutes; sign-out-everywhere; code recovery that a child
cannot perform. The code is still required for each reward approval.

Automated checks: backend `python -m pytest` (89 passing), companion `node --test apps/companion/tests/*.test.cjs` (23) and `tsc`, TV `yarn test` (Expo TV 15, Vega 20) and `typecheck:phase2`. Not yet done: Expo Go on a physical iPhone and Vega/Fire TV regression of the changed TV screens (both scheduled with the user).

## Dependencies and scope

- Reuse Phase 8's code verification, approval records, and reward lifecycle.
- Extend the parent accounts, household ownership, paired-device sessions, and basic
  backend authorization introduced in Phase 5; do not create a separate identity system.
- Keep household account authentication separate from choosing a family profile on a
  shared TV. Selecting a parent profile must not itself grant administrative access.
- See the status above for what is implemented.

## Work packages

- [ ] Define the parent/admin and child roles and a permission matrix covering events,
  lists, chores, meals, rewards, imports, integrations, photos, and household settings.
- [ ] Allow parents to manage household members, role assignments, integrations, rewards,
  and other settings. Prevent a child from changing roles or escalating access.
- [ ] Give children access to the permitted household views, their assigned chores, and
  reward requests. Resolve item-level permissions explicitly for shared editing.
- [ ] Extend Phase 5 household ownership, parent membership, session handling, and
  household isolation with the full role matrix; enforce permissions on every protected operation.
- [ ] Add profile selection and a clear parent/child mode indicator. Reuse the Phase 8
  four-digit code for temporary parent access on an already paired household TV.
- [ ] Expire elevated access after inactivity and return to child mode when the parent
  locks or leaves it. Continue requiring the Phase 8 code for each reward approval.
- [ ] Implement authenticated parent code recovery, session revocation, and appropriate
  limits on failed code attempts. Keep credential material out of logs and client storage.
- [ ] Migrate existing Phase 8 code and approval records without resetting balances or
  exposing parent permissions. Require trusted setup if ownership has not been established.
- [ ] Show clear permission-denied and expired-session behavior, preserving unsaved drafts
  where safe. Record who performed protected household changes without logging secrets.

## Verification checkpoints

- Test the permission matrix through backend requests as well as the visible interface.
- Check profile switching, attempts to access another household, revoked sessions,
  expired elevation, code recovery, and administrative role changes.
- Confirm child mode cannot approve rewards, reset the parent code, or alter permissions.
- Verify migration preserves rewards and audit history, and remote focus remains usable
  when a protected action is denied or a parent session expires.

## Exit criteria

Parent/admin and child modes work consistently on the TV and backend. Child users cannot
bypass a restriction by changing screens, selecting a parent profile, or calling an API.
The Phase 8 reward approval workflow continues to require parent authorization.
