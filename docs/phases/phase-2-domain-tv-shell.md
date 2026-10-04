# Phase 2 — Domain core and TV shell

## Outcome

Replace entertainment-sample behavior with FamilyOS domain primitives, deterministic demo
data, and a TV-native navigation/focus shell shared by Expo and Vega.

## Specification coverage

- `docs/process/build-spec.md` sections 8–10, 19, 20 / EPIC 1–2, 21–22, and 24.

## Work packages

- [x] Add strict Family, FamilyMember, CalendarEvent, Chore, Routine, Conflict,
  ProposedAction, and FamilyBriefing types.
- [x] Add the controlled demo clock and synthetic household repositories.
- [x] Implement deterministic overlap, responsibility, travel-buffer, preparation, and
  reassignment logic with boundary tests.
- [x] Build the FamilyOS theme, 1080p safe-zone layout, type scale, member identity system,
  buttons, cards, focus states, and reduced-motion behavior.
- [x] Add Skylight-inspired light and warm-midnight dark themes with a TV-focusable Settings
  switch, preserving household member colors between modes.
- [x] Replace sample navigation with Home, Calendar, Chores, Family, and Settings.
- [x] Verify directional D-pad traversal, Back semantics, default focus, and focus restore.

## Verification checkpoints

- Domain Jest suite passes: 10 tests, including overlap/reassignment boundaries and remote
  navigation transitions.
- Strict TypeScript checks pass for the domain package, shared UI, Expo app, and Vega app.
- A local Expo web export passes Playwright Chromium checks at 1920×1080 and 1280×720:
  all routes, D-pad/Enter, left/right focus transfer, Back/focus restoration, reduced motion,
  and scroll-into-view for the focused item. Both themes render without browser errors or
  horizontal overflow; Settings changes theme through remote-style keyboard input, browser
  selection survives reload, and focus scrolling brings lower Settings actions into view at
  1280×720.

## Environment note

The repository pins Yarn 4.5, while this Windows environment exposes Yarn 1.22 without
Corepack. Verification therefore ran the installed TypeScript and Jest binaries directly.
The Playwright run used the existing local browser cache and temporary offline package files;
no project dependency manifest was changed for the test.

## Exit criteria

Both app targets share the same FamilyOS shell, seeded household, domain contracts, and
deterministic conflict results. All Phase 2 work packages and local verification checks are
complete. No Vega device, emulator, AWS, or cloud service was used.

