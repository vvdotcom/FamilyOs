# Phase 15 — Final Fire TV validation, demo video, and submission

## Outcome

Every feature intended for the submission is verified on real Fire TV hardware, a demo video
under three minutes is published, and all hackathon submission materials are complete before
the deadline (Friday, October 23, 2026, 12:00 pm Pacific Time).

## Dependencies and scope

- Follows Phases 12–14. Earlier device results do not cover code added afterward, so the
  full device regression runs again here.
- Only features verified on the device may appear in the demo as working. Anything else is
  cut from the demo or clearly labeled (for example a simulated Alexa+ experience).
- Phase 11 is optional. The essential parts of it that the submission needs (clean-checkout
  README, accurate status, product feedback) are required here.

## Work packages

### A. Real-device regression

- [ ] Install the release `.vpkg` (or Fire OS build) on the target Fire TV and record the
  device model, OS version, and build commit.
- [ ] Run a full remote-only pass over every screen: focus visible and never trapped, Back
  behavior, 1080p safe zones, text readable from about 3 m, and light and dark themes.
- [ ] Verify pairing, companion sync, voice or simulated voice proposals, chore photo
  verification, rewards approval, Move sessions, sports, and family night end to end.
- [ ] Measure cold start, navigation responsiveness, and memory use; fix stutter and
  slow screens visible in the demo path.
- [ ] Check offline and failure behavior: network loss, Bedrock or MCP unavailable, and
  expired sessions all fall back safely.
- [ ] Record results and remaining device-specific blockers in a test matrix, and log
  friction in `docs/FRICTION_LOG.md`.

### B. Demo video

- [ ] Script one continuous family story under three minutes that shows each feature
  briefly, opening with the problem and ending with the resolved day.
- [ ] Rehearse on the device using deterministic demo data, with a backup path if the
  network or AI provider fails.
- [ ] Record the Fire TV screen and real remote, phone, and voice interaction. Use no
  copyrighted music, third-party trademarks, or real family data without permission.
- [ ] Upload publicly to YouTube or Vimeo and verify the link while signed out.

### C. Submission materials

- [ ] README: accurate current status, clean-checkout setup, run, test, and demo
  instructions, and a short "what was built during the Submission Period" section.
- [ ] Complete `docs/PRODUCT_FEEDBACK.md` for every Amazon and AWS tool used (Vega SDK,
  Fire TV, Alexa+/MCP, Bedrock, Cognito, Kiro if used), answering all five required
  questions, including how AWS services are used for the AWS Builder mini-challenge.
- [ ] Review the friction log for completeness: task, steps, expected vs. actual,
  severity, workaround, and suggestion on every entry. Add optional feature requests with
  priority ratings.
- [ ] Add a GitHub Actions workflow that runs typecheck, JavaScript tests, and backend tests
  on every push.
- [ ] Repository access: either public with a detectable open-source license, or private
  and shared with testing@devpost.com and the Amazon Developer Relations reviewers listed
  in the rules.
- [ ] Fill the Devpost form: description, tracks (Fire TV, and Alexa+ if Phase 12 is
  live), mini-challenges (AWS Builder), video link, repository link, and testing
  instructions or credentials.
- [ ] Tag the submitted commit (for example `v1.0-hackathon`) only after the checks above
  have evidence.

## Verification checkpoints

- A fresh clone follows the README to a running TV app, backend, and companion.
- The published video is public, under three minutes, and matches the tagged build.
- Every feature claimed in the description is shown in the video or backed by recorded
  device evidence.

## Exit criteria

FamilyOS is verified on real Fire TV hardware, the demo video is public, and the Devpost
submission is complete before October 23, 2026, 12:00 pm PT.
