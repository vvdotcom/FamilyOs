# Phase 13 — Chore photo verification

## Outcome

A child photographs a finished chore in the companion app. An AI vision check reports
whether the photo appears to match the chore, and the result is attached to the chore's
completion so a parent can approve stars faster from the TV or phone.

## Status — 2026-09-28

Implemented: "Verify with photo" on chores with a done-looks-like hint; phone capture (camera or library,
preview, retake, clear waiting/retake/failed states, denied-permission message); server validation, EXIF
stripping, private storage, deletion when a parent decides; a `ChoreVisionProvider` with Bedrock (Nova Lite)
and deterministic demo implementations and an `unclear` fallback for errors and malformed output; verdict and
thumbnail in the TV and phone approval queues (approve/decline/retake with the code); a per-household daily
limit. Results on 60 labelled synthetic photos: demo 66.7% accuracy, Bedrock 45.0%, both 0% false "looks
done" (details in `services/family-agent/README.md`). Verdicts never change stars.

Automated checks: backend `python -m pytest` (89 passing), companion `node --test apps/companion/tests/*.test.cjs` (23) and `tsc`, TV `yarn test` (Expo TV 15, Vega 20) and `typecheck:phase2`. Not yet done: Expo Go on a physical iPhone and Vega/Fire TV regression of the changed TV screens (both scheduled with the user).

## Dependencies and scope

- Build on Phase 3 chores, Phase 5 companion and backend, Phase 8 stars and parent approval,
  Phase 9 roles, and Phase 10 photo validation and private storage rules.
- Fire TV devices have no camera; the companion phone is the capture device.
- Use Amazon Bedrock (Converse API with image input, for example an Amazon Nova multimodal
  model) through the backend only. The phone never receives AWS credentials.
- The vision result is advisory. It must never award stars or complete a chore by itself;
  the Phase 8 approval rules still apply.
- Photos of children are sensitive. Send a photo to AI only after the user explicitly
  submits it for verification, and do not use photos for any other purpose.
- See the status above for what is implemented.

## Work packages

- [ ] Add optional "Verify with photo" to chore definitions, with a short description of what
  a completed result looks like (for example "bed made, pillows on top").
- [ ] Add a companion capture flow: camera or library, preview, retake, submit, and clear
  pending, verified, unclear, and failed states. Handle denied camera permission.
- [ ] Validate content type, size, and dimensions; strip EXIF/location metadata; downscale
  before upload; store privately with household-scoped access and a documented retention
  period (default: delete after the parent decision).
- [ ] Implement a `ChoreVisionProvider` interface with a Bedrock implementation and a
  deterministic demo provider. Return a structured verdict (`looks_done`, `unclear`,
  `not_done`), a short child-friendly reason, and a confidence value.
- [ ] Constrain the prompt to the chore and its description, request structured output,
  validate the response, and fall back to `unclear` on errors, timeouts, or malformed
  output. Ignore instructions written inside images.
- [ ] Show the verdict and thumbnail in the TV and companion parent approval queue. Parents
  can approve, reject, or ask for a retake; children see encouraging feedback.
- [ ] Build an evaluation set of at least 50 labeled, non-identifying test photos across
  several chores. Report accuracy and the false "looks done" rate in the README.
- [ ] Add cost and rate limits per household, and log only metadata (never image content).
- [ ] Record Bedrock vision and companion camera friction in `docs/FRICTION_LOG.md`, and
  document the AWS services used for the AWS Builder product-feedback answer.

## Verification checkpoints

- Automated tests cover upload validation, metadata stripping, household isolation, provider
  fallback, malformed model output, and that no verdict changes a star balance.
- The evaluation script runs from a clean checkout and reproduces the reported accuracy with
  the demo and Bedrock providers.
- A child submits a photo on a phone; the verdict appears in the TV approval queue; a parent
  approves with the remote and code; stars update exactly once.
- Deleted or expired photos are no longer retrievable.

## Exit criteria

Children can submit chore photos, parents see an AI verdict with the photo when approving,
measured accuracy is documented, and photos are handled privately with no automatic rewards.
