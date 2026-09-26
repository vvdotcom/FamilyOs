# Companion phone UI checkpoint — 2026-09-25

Reference: [Claude Family Calendar phone artboards](https://claude.ai/artifact/Cr9rUV1PnWRjeGd7a6B9NR).
Inspected all seven phone artboards and their rendered markup. This checkpoint targets
the Expo SDK 57 companion, not the separate SwiftUI starter or TV UI.

## Design mapping

- Today: date heading, add button, TV status card, seven-day selector, color-coded agenda,
  groceries/meal shortcuts. Week navigation, chores, and profiles extend the reference.
- Event editor: member chips, all-day switch, date/time pickers, location, explicit save.
- Lists/groceries: segmented list selector, item entry, checkboxes, item counts, categories,
  native share sheet. Clear-checked and per-item rename are not yet included.
- Meal details: date selection, cooks, servings/time, ingredients, instructions, edit/delete,
  and atomic add-to-groceries. Pantry tracking, recipe imports, and recurring meals remain later work.
- Remote: matching layout and D-pad, but no fake connection or actionable remote controls.
- Settings: light/dark/automatic appearance, account, household, server settings, sign-out.

Fonts: bundled Figtree 400/500/600/700/800 and Bricolage Grotesque 700/800. Main titles
are 36px; detail titles 32px; event titles 17px; body 15–16px; labels 12–13px. The existing
Bricolage static assets use optical size 34. Native font rendering can differ slightly
from the browser reference; no pixel-perfect iPhone claim is made.

## Verified

- 25 backend tests: auth regression, household ownership checks, validation, revision
  conflicts, event CRUD, profiles, chores, lists, and meal ingredient deduplication.
- 17 companion tests: auth regression, bearer transport, revision submission, week/date
  boundaries, overnight events, and event validation.
- TypeScript check and final iOS Metro/Hermes export pass (744 modules, ~1.8 MB bundle).
- Browser UI: add event, blank-title validation, agenda result, event deletion confirmation,
  list addition/completion, add family profile, complete chore, meal ingredients to groceries,
  theme selection, and disabled remote behavior.
- Visually inspected Today at phone width. Browser inspection verified the dark Remote
  heading is Bricolage-800-34, 36px, #F4EEE4. Additional screenshot attempts intermittently
  timed out in the browser tool; interaction and rendered-DOM checks continued.
- Fixed a web SVG accessibility-attribute warning; no new error was observed after reload.
- Railway deployment `ec7dcffd-dc8e-4086-9cdc-034724ccfa3c` succeeded. Production health
  reports database ready and Cognito auth; an unsigned-in edit returned 401.

## Not yet verified / not completed

- Browser interactions used a labeled, in-memory development fixture, not production
  account data. Real iPhone save/restart, password recovery, and multi-device walkthrough
  remain necessary. No real household data was created during UI testing.
- Secure TV pairing, receiver/control, realtime TV sync, TV pop-ups, notification delivery,
  persistent offline caches, and GitHub-to-Railway automatic deployment remain open.
- Phone data refresh currently polls every 20 seconds while active, on foreground, or by
  manual refresh. Writes require connectivity and explicit save; no offline queue.
- The cloud edit transaction uses a per-household row lock and expected revision. A
  conflict cannot silently overwrite another edit; the user must reload the latest item.

Phase 5 remains **in progress**.
