# Phase 7 — Improvements

## Outcome

Extend the household experience with shared lists, meals, recipes, a monthly calendar,
and reviewed imports from photos, emails, and flyers.

## Status — 2026-09-28

Implemented: shared lists (add, edit, check off, reopen, remove), quantities on list items, recipes with
parsed quantities/units, weekly meal plan and dinner summary, recurring meals with this-date/future edits, a
review sheet before adding recipe ingredients to Groceries (combines compatible quantities, keeps other units,
never duplicates), month view with member and source filters (counted by local day), and imports from pasted
text, `.eml`, text PDFs, `.ics`, and (with Bedrock) photographed flyers. Drafts are editable, flag uncertain
dates/times/time zones/participants/quantities and duplicates, save times in the household time zone, and change
nothing until confirmed. Sources are not retained (digest only). On a paired TV, list check-offs and (with the
parent code) meal and list edits now persist on the server.

Automated checks: backend `python -m pytest` (89 passing), companion `node --test apps/companion/tests/*.test.cjs` (23) and `tsc`, TV `yarn test` (Expo TV 15, Vega 20) and `typecheck:phase2`. Not yet done: Expo Go on a physical iPhone and Vega/Fire TV regression of the changed TV screens (both scheduled with the user).

## Dependencies and scope

- Build on the household screens and providers from Phase 3 and the confirmed-action
  workflow from Phase 4, after the original Phase 6 MVP release.
- Extend `docs/process/build-spec.md` through section 39. All work below is planned and not yet implemented.
- Import user-selected files and email content. Continuous inbox access is outside this
  phase; an email service connection would need its own explicit scope and authorization.

## Work packages

- [ ] Define and persist household lists, list items, recipes, ingredients, meal slots,
  recurrence rules, and import drafts using shared TypeScript and backend contracts.
- [ ] Build shared grocery, household to-do, and custom lists with add, edit, complete,
  reopen, and remove flows; distinguish general list items from assigned chores.
- [ ] Build a simple weekly meal planner and a “What's for dinner?” dashboard summary.
  Support selecting a saved recipe or entering a simple meal without a recipe.
- [ ] Add a recipe library with ingredients, quantities, units, servings, instructions,
  and source attribution where available.
- [ ] Schedule recurring meals, allowing changes to one occurrence or future occurrences
  without duplicating past meals; define dates in the household timezone.
- [ ] Add recipe ingredients to a shopping list after a review step. Combine compatible
  quantities, preserve incompatible units, and prevent accidental duplicate additions.
- [ ] Add a monthly overview alongside day/week views, with member and source-calendar
  filters, event detail access, and readable handling of busy days.
- [ ] Accept selected photos, flyer images/PDFs, and pasted or uploaded email content.
  Extract proposed calendar events, tasks, or recipes through a provider interface.
- [ ] Show import previews with their source and editable fields. Flag uncertain dates,
  times, timezones, participants, quantities, and duplicates for correction.
- [ ] Save imported items only after explicit confirmation through the existing action
  pipeline; cancellation must leave household data unchanged. Treat document content as
  data, never as instructions that can bypass confirmation or access other information.
- [ ] Add file type/size limits, safe content handling, and a clear retention/removal
  policy for source documents. Provide labeled demo fixtures and useful provider errors.
- [ ] Keep TV browsing, filtering, meal selection, and list completion remote-accessible.
  Use the local web target for upload/typing until the Phase 10 companion is available.

## Verification checkpoints

- Tests cover list persistence, ingredient quantities and duplicate prevention, meal
  recurrence exceptions, month boundaries, timezones, and combined calendar filters.
- Import tests cover photos, email content, and PDFs producing each supported draft type,
  malformed files, uncertain fields, repeated imports, confirmation, and cancellation.
- Demonstrate actual extraction using representative synthetic documents before claiming
  real import support; fixed fixtures alone only validate demo mode.
- Review the TV layout at 1080p and navigate lists, meals, month view, and confirmation
  dialogs with keyboard arrows/remote input; record platform checks before release.

## Exit criteria

The household can manage a shared list, plan a week of meals, reuse recipes, add their
ingredients to a shopping list, and filter a month of events. Photos, emails, and flyers
can become reviewed drafts and cannot silently change the household schedule.

## Product references

- [Skylight feature overview](https://skylight.zendesk.com/hc/en-us/articles/48778850390171-Calendar-Features)
- [Skylight meal planning details](https://skylight.zendesk.com/hc/en-us/articles/41418036777371-The-Meals-Tab)

These are capability references; FamilyOS uses its own interface, wording, and assets.
