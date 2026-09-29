# Phase 6 — Device validation

## Outcome

Validate the app against its intended device target and close platform-specific behavior
gaps before the final documentation and demo phase.

## Specification coverage

- `single.md` sections 20 / EPIC 11, 21–27, 30–35, and 38.

## Status

2026-09-28: A remote-only regression of the current build ran on the Vega Virtual Device (EC2), with
and without the local backend. It found and fixed seven problems, including a D-pad startup race,
unreachable overlay buttons, a 1080p Settings overflow, and missing persistence on Vega. See
[`VEGA_VVD_TEST_REPORT.md`](../VEGA_VVD_TEST_REPORT.md). Real-device focus, overscan, HDMI, and
performance checks on Fire TV hardware are still open.

## Work packages

- [ ] Identify the test device OS and use the correct Vega or Fire OS deployment path.
- [ ] Run real-device focus, networking, performance, clipping, overscan, and Back QA.
- [ ] Complete accessibility labels, contrast, member identity, reduced motion, and rapid
  D-pad responsiveness checks.
- [ ] Record platform validation results and unresolved device-specific blockers for Phase 11.

## Verification checkpoints

- Platform-specific focus, networking, performance, clipping, overscan, accessibility, and
  Back checks pass on the selected target or have a concrete blocker recorded for Phase 11.
- The device build installs and launches through the documented platform path.

## Exit criteria

FamilyOS is demonstrably running on the selected device target and platform-specific behavior
is validated. Reproducible documentation, demo capture, and release packaging are Phase 11.

