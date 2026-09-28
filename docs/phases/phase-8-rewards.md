# Phase 8 — Rewards and parent approval

## Outcome

Children earn stars for chores, save toward rewards, and request redemption. A parent
must enter a four-digit access code and explicitly approve each redemption.

## Status — 2026-09-28

Implemented and fixed: reward approval could previously be sent through the generic edit route without the
code; code-protected steps are now reachable only through their own endpoints. Added child goal progress,
request history (pending/approved/not this time/given), hide/offer rewards, "mark as given", code-protected star
corrections, code recovery with the account password (Cognito re-sign-in when hosted), and a TV number pad for
approvals. Balances derive from the transaction history; approval is exactly-once.

Automated checks: backend `python -m pytest` (89 passing), companion `node --test apps/companion/tests/*.test.cjs` (23) and `tsc`, TV `yarn test` (Expo TV 15, Vega 20) and `typecheck:phase2`. Not yet done: Expo Go on a physical iPhone and Vega/Fire TV regression of the changed TV screens (both scheduled with the user).

## Dependencies and scope

- Build on Phase 3 chore completion, Phase 4 action validation, and persistent household
  data. This is the first parent/child approval boundary, expanded in Phase 9.
- The four-digit code authorizes a protected household action. It is not a replacement
  for account authentication or a credential for exposing the backend to the internet.
- See the status above for what is implemented.

## Work packages

- [ ] Define star transactions, balances, reward definitions, redemption requests, and
  approval records. Derive balances from a persistent transaction history.
- [ ] Award stars once per eligible chore occurrence; specify reversals when completion
  is undone and prevent repeat completion or retries from earning duplicate stars.
- [ ] Build a child reward view showing earned stars, saved balance, reward cost, and
  progress toward a chosen reward.
- [ ] Add parent-protected reward creation, editing, availability, and star-cost controls.
- [ ] Let children request a reward and see pending, approved, rejected, or fulfilled
  status. A request alone must not deduct stars or grant the reward.
- [ ] During initial parent-led household setup, create and confirm a four-digit code.
  Require code entry and an explicit confirmation for every redemption approval.
- [ ] Verify the code in the authoritative service, recheck the available balance, and
  atomically deduct stars when approval succeeds. Bind approval to that specific request
  and make retries safe so the same request cannot be approved or charged twice.
- [ ] Mask code entry; store only a securely salted verifier, never the plain code or
  code-bearing logs. Rate-limit failed attempts with a cooldown that cannot be bypassed
  by reopening the dialog. Do not ship a default approval code or client-only check.
- [ ] Support protected code changes and a documented owner recovery procedure. Do not
  offer an unauthenticated reset from child mode; full role-based recovery comes in Phase 9.
- [ ] Return to child mode after approval, cancellation, or timeout, and block protected
  actions when verification is unavailable. Demo approvals stay isolated from real data.
- [ ] Record approval/rejection history and protect manual balance corrections. Provide
  a TV-friendly number pad, clear focus, Back/cancel handling, and pending/error states.

## Verification checkpoints

- Tests cover earning stars, undo/re-complete behavior, insufficient balance, duplicate
  requests, concurrent approvals, reward edits, and persistence after restart.
- Wrong codes, cancelled prompts, expired approval attempts, direct unauthorized requests,
  and retry floods cannot approve a reward or modify the star balance.
- Parent approval changes one request exactly once and returns the interface to child mode.
- Check numeric code entry and reward browsing using only keyboard/remote input; schedule
  Vega regression for the changed TV flows before release.

## Exit criteria

A child can earn stars, save toward a reward, and request it. Only a parent who enters
the four-digit code can approve redemption, and the recorded balance stays correct
through retries, cancellation, and application restarts.
