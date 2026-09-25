# Phase 6 — Device validation and hackathon release

## Outcome

Validate FamilyOS on real Fire TV hardware, harden the three-minute story, and produce a
reproducible, reviewable hackathon release.

## Specification coverage

- `single.md` sections 20 / EPIC 11, 21–27, 30–35, and 38.

## Work packages

- [ ] Identify the test device OS and use the correct Vega or Fire OS deployment path.
- [ ] Run real-device focus, networking, performance, clipping, overscan, and Back QA.
- [ ] Complete accessibility labels, contrast, member identity, reduced motion, and rapid
  D-pad responsiveness checks.
- [ ] Rehearse and capture the exact three-minute demo path.
- [ ] Finish architecture, privacy, testing, feedback, friction, screenshots, troubleshooting,
  and clean-checkout README documentation.
- [ ] Recheck current hackathon rules and authorized third-party assets/APIs.
- [ ] Gate `v0.1-demo`, `v0.2-vega`, `v0.3-firetv`, and `v1.0-hackathon` tags against the
  definitions in `single.md`.

## Verification checkpoints

- A clean checkout follows README commands successfully.
- All unit, component, backend, contract, smoke, VVD, and real-device checks are recorded.
- The final demo completes under three minutes without live OAuth or perfect Wi-Fi.

## Exit criteria

FamilyOS is demonstrably running on its intended Fire TV target, the repository is
reproducible for judges, and every release claim has evidence.

