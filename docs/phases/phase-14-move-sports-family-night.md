# Phase 14 — Movement breaks, kids' sports, and family night

## Outcome

Three household features that use the TV as a shared screen: guided family movement breaks,
kids' sports scheduling with gear and carpool planning, and a weekly family night chosen by
phone voting. Each builds on the existing calendar, routines, chores, and rewards rather than
standing alone.

## Status — 2026-09-28

Implemented: A — three original movement routines, a full-screen TV session (countdown, current and next
move, avatars, pause/skip/exit, safety note, reduced motion), scheduling from the phone as a calendar event with
a Home "Start now" shortcut, and stars once per child per session. B — teams with players, uniform, gear, and a carpool rotation that assigns
drivers to new events; gear checklists on the TV and phone; `.ics` team schedule import with confirmation;
conflict rules for a driver needed in two places and venue travel time (server and TV); "leave for … in N
minutes; … not packed" reminders via MCP and `/v1/reminders`; carpool swaps through voice/proposal
confirmation. C — a weekly Family Night slot, phone suggestions and votes, majority with a rotating picker on
ties (recorded), a live TV vote screen, and the chosen activity on the calendar and dashboard. The optional
quiz was not started.

Automated checks: backend `python -m pytest` (89 passing), companion `node --test apps/companion/tests/*.test.cjs` (23) and `tsc`, TV `yarn test` (Expo TV 15, Vega 20) and `typecheck:phase2`. Not yet done: Expo Go on a physical iPhone and Vega/Fire TV regression of the changed TV screens (both scheduled with the user).

## Dependencies and scope

- Build on Phase 3 calendar and routines, Phase 4 conflict detection and briefings, Phase 7
  imports, Phase 8 stars, Phase 9 roles, and the Phase 5/10 companion.
- Build in the order below. If time runs short, finish and verify earlier work packages
  before starting later ones; Family Night is the first to cut.
- Movement breaks are general activity, not medical or fitness advice. Show a short safety
  note and keep content suitable for mixed ages.
- Use only original or properly licensed media, images, and exercise content.
- See the status above for what is implemented.

## Work packages

### A. Family movement breaks

- [ ] Add a "Move" routine type: an ordered list of timed moves with names, short
  instructions, and rest intervals. Ship a few original, bundled routines.
- [ ] Build a full-screen TV session view: large countdown, current and next move, member
  avatars, and pause, skip, and exit with the remote. Respect reduced-motion settings.
- [ ] Allow scheduling a Move break as a calendar event or routine step; show it in the
  daily briefing.
- [ ] Award stars for completed sessions through the Phase 8 transaction history, once per
  member per scheduled session.

### B. Kids' sports

- [ ] Add a sports event type with team, activity, practice or game, location, arrival time,
  and uniform or color.
- [ ] Add per-team gear checklists that appear in the briefing and on the TV before each
  event, with completion by remote or phone.
- [ ] Add a carpool rotation per team: drivers, rotation order, swaps through the Phase 4
  proposal flow, and the assigned driver shown on each event.
- [ ] Import team schedules from an iCal/ICS link or file through the Phase 7 import
  contract, with the same draft review and confirmation before saving.
- [ ] Extend conflict detection for overlapping games, travel time between venues, and a
  driver needed in two places, with suggested resolutions as proposals.
- [ ] Include sports prep in briefings and viewing reminders ("Leave for soccer in 20
  minutes; shin guards not packed").

### C. Family night

- [ ] Add a recurring "Family Night" calendar slot with a chosen activity type (movie,
  game, or other).
- [ ] Let members add suggestions and vote from the companion; show the vote live on the TV.
- [ ] Choose the winner fairly: majority with a documented tie-break and a rotating "picker"
  who decides ties, recorded so the rotation is visible.
- [ ] Show the chosen activity on the TV dashboard and in the briefing for that day. Use
  text titles only unless artwork is properly licensed.
- [ ] Optional: a short TV quiz generated from the household's own week (chores done,
  events attended), answered by D-pad or phone.

## Verification checkpoints

- Automated tests cover Move session timing, star awards without duplicates, sports
  import drafts, carpool swaps, new conflict rules, vote counting, ties, and picker rotation.
- Every new TV screen is fully usable with the remote only: focus is visible, Back behaves
  predictably, and nothing is clipped at 1080p safe zones.
- A phone vote appears on the TV within a few seconds; an imported sports schedule appears
  only after confirmation.
- Schedule Vega regression for all new TV screens before release.

## Exit criteria

A family can run a movement break on the TV and earn stars, manage kids' sports with gear,
carpools, and conflict warnings, and pick a family night by phone vote, all with the remote
as a complete control path.
