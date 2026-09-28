# FamilyOS permission matrix (Phase 9)

Generated from `services/family-agent/app/permissions.py`, which the server enforces on every write.
Roles: **parent** (signed-in account, or a phone unlocked with the four-digit code, which locks after 15 idle
minutes); **child** (a child profile session started by a parent); **tv** (a paired TV); **tv+code** (a paired TV
unlocked with the parent code, which locks after 5 idle minutes); **voice** (Alexa+/MCP, which can only propose).
Selecting a profile never grants parent access. Reward approvals, star corrections, and chore-photo approvals need
the code for every decision, even when a session is already unlocked.

| Area | parent | child | tv | tv+code | voice |
|---|---|---|---|---|---|
| events, meals, recipes, lists (create/edit/delete) | yes | no | lists: check off only | lists and meals | propose only |
| chores (create/edit/undo) | yes | no | no | yes | no |
| complete a chore | yes | own chores (item) | assigned children (item) | yes | propose only |
| photo-verified chore approval | code each time | submit photo (own) | code each time | code each time | no |
| rewards and reward settings | yes | request (own) | no | mark fulfilled | balance only |
| reward approval / star correction | code each time | no | code each time | code each time | no |
| household members and roles | yes | no | no | no | no |
| imports | yes | no | no | no | no |
| photos | yes | no | view | view | no |
| teams, carpools, family night settings | yes | no | no | no | no |
| family night suggest/vote | any member | self (item) | view | close/pick | no |
| voice proposals (confirm/reject) | yes | no | chore-done only | yes | no |
| parent code, pairing, voice connections, sessions | yes (reset needs password) | no | no | no | no |

Every change is recorded in the household audit log with the actor type (`parent`, `parent:code`,
`child:<member>`, `tv:<device>`, `tv-parent:<device>`, `voice`), the change kind, and the item ID. Codes, tokens,
and photo content are never logged.
