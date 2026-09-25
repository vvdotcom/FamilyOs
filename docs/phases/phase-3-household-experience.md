# Phase 3 — Household experience

## Outcome

Deliver the visible MVP household surface: dashboard, calendar, chores, routines, family
status, and event detail flows.

## Specification coverage

- `single.md` sections 2.1–2.3, 10–11, 15–16, and 20 / EPIC 3–5.

## Work packages

- [x] Build the Home dashboard header, next-event state, family rail, briefing slot,
      timeline, chores/routines column, and conflict banner.
- [x] Build accessible day and week calendar views with member identity beyond color.
- [x] Build event details with owner, participants, location, responsibility, travel time,
      weather context, and preparation checklist.
- [x] Build chore and routine boards, completion interaction, points metadata, and resets.
- [x] Add calendar and weather provider interfaces with deterministic demo providers.
- [x] Add loading, unavailable, cached, and empty states with visible default focus.

## Verification checkpoints

- Vega component tests cover Home rendering, event details and checklist interaction, chore
  completion, and calendar-provider recovery; domain tests cover cached, empty, and unavailable
  calendar/weather responses.
- Local Playwright checks cover Home, day/week, event detail, preparation toggling, chore
  completion across reload, light/dark theme persistence, D-pad route selection, and Enter to
  complete the focused chore. Reviews at 1920×1080 and 1280×720 show readable safe zones and
  unclipped chore actions; no browser runtime errors were reported.

## Verification results

- Shared UI, Expo, and Vega TypeScript checks pass using the installed TypeScript binaries.
- Expo domain suite: 15 tests pass. Vega Jest suite: 5 tests pass across 2 suites.
- Static Expo web export was exercised locally with Playwright Chromium; no Vega device,
  emulator, AWS, cloud provider, or external calendar/weather account was used.

## Implementation notes

- The TV screens now follow the supplied HTML design, including its bundled Figtree
  and Bricolage Grotesque fonts, measured type sizes, header, timed calendar grid, and
  three-column boards. Home's original chores column is replaced by the reference's
  Today/Family panels; chores remain available from the main navigation.
- A monthly calendar and local Meals/Lists/Photos design previews were added to match
  the reference. This is not completion of the later integration or mobile phases.
  See [design fidelity and testing notes](../design-reference.md).

- Calendar and weather integrations are provider interfaces backed by deterministic local demo
  providers; connecting real accounts remains Phase 5 work.
- The browser preview persists household changes and theme selection in local storage. Native
  TV demo state is in-memory and resets to seeded demo data when the app restarts.

## Exit criteria

Met for the local demo: the family can understand today's schedule and responsibilities and
complete a chore using the remote-style D-pad/Enter interaction or keyboard. Real calendar
accounts and durable native storage remain outside this phase.
