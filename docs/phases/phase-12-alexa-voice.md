# Phase 12 — Alexa+ voice and multi-modal control

## Outcome

A family member can ask Alexa+ about the household schedule and propose changes by voice.
Proposals appear on the TV and phone, are confirmed with the remote or companion, and every
surface updates. Voice, D-pad, and phone form one flow rather than three separate features.

## Status — 2026-09-28

Implemented: a Streamable HTTP MCP server at `/mcp` with the official MCP Python SDK (negotiates
2025-11-25), RFC 9728 protected-resource metadata, origin checks, revocable per-household voice tokens (optional
Cognito OAuth access tokens), per-connection rate limits and metadata-only logging, the six read tools and four
proposal tools, idempotent pending proposals, a TV confirmation card (remote; parent-level changes ask for the
code), a phone Approvals inbox, voice status/connect/disconnect in the phone app, child-scoped voice
connections, and a labelled simulated Alexa+ (Bedrock tool use over the same tools). Verified live with the
official MCP client. Not done: live Alexa+ linking (needs a public URL and an OAuth 2.1 authorization server
Alexa+ accepts; see `docs/FRICTION_LOG.md` entry 8).

Automated checks: backend `python -m pytest` (89 passing), companion `node --test apps/companion/tests/*.test.cjs` (23) and `tsc`, TV `yarn test` (Expo TV 15, Vega 20) and `typecheck:phase2`. Not yet done: Expo Go on a physical iPhone and Vega/Fire TV regression of the changed TV screens (both scheduled with the user).

## Dependencies and scope

- Build on Phase 4 proposed actions and validation, Phase 5 authentication, pairing, and
  deployed backend, Phase 8 parent approval, and Phase 9 roles and permissions.
- Implement a self-hosted MCP server on the family-agent service using MCP specification
  2025-11-25 (or a later confirmed version) over Streamable HTTP, as required by the
  Alexa+ track rules. Use the official MCP Python SDK; do not hand-roll the protocol.
- Voice may *read* household data and *propose* actions. It must never apply a mutation
  directly: every change still needs explicit confirmation on the TV or companion, and
  protected actions still need the Phase 8 parent code.
- Alexa+ must reach the server over public HTTPS, so live voice testing depends on the
  Phase 5 Railway deployment. Local development uses an MCP inspector/client against
  loopback.
- Fallback: if a live Alexa+ connection cannot be completed before Phase 15, build the
  rules' permitted "simulated Alexa+ experience" (a web client using Bedrock plus this MCP
  server) and label it as simulated in the UI, README, and demo.
- See the status above for what is implemented.

## Work packages

- [ ] Confirm the current Alexa+ MCP connection requirements (transport, authorization,
  discovery, account linking) from Amazon documentation and record differences from this
  plan in `docs/FRICTION_LOG.md`.
- [ ] Mount a Streamable HTTP MCP endpoint (for example `/mcp`) in the FastAPI service with
  protocol version negotiation, session handling, and origin validation.
- [ ] Authorize MCP clients per household using the Phase 5 identity provider (OAuth 2.1 as
  described by the MCP authorization specification). Reject unauthenticated and
  cross-household requests; never expose Bedrock or AWS credentials to clients.
- [ ] Expose read tools: `get_today`, `get_week`, `list_conflicts`, `get_member_schedule`,
  `get_chores`, and `get_reward_balance`, returning concise, speakable summaries alongside
  structured data.
- [ ] Expose proposal tools: `propose_pickup_swap`, `propose_event`, `propose_reschedule`,
  and `mark_chore_done_request`. Each creates a pending proposal through the Phase 4
  validation path and returns its ID and a spoken confirmation prompt.
- [ ] Show incoming voice proposals on the TV as a focused, dismissible confirmation card
  (source: "Voice"), and on the companion as a pending item. Confirm or reject with the
  remote or phone; apply exactly once and reflect the result on every paired surface.
- [ ] Respect roles: child-initiated voice requests can only create requests that follow
  Phase 8/9 approval rules; parent-only tools require an authorized parent session.
- [ ] Add rate limits, request logging without personal data, and a visible "Voice
  connected / disconnected" status in Settings with a disconnect control.
- [ ] Provide MCP resources or prompts only where they help Alexa+ answer better; keep the
  tool list small and names/descriptions clear.
- [ ] Record MCP and Alexa+ friction as it happens, including setup, spec gaps, and
  workarounds.

## Verification checkpoints

- Automated tests cover protocol negotiation, each tool's schema and output, authorization
  failures, cross-household rejection, and proposal idempotency.
- An MCP inspector session against the local server lists tools and completes a read tool and
  a proposal tool.
- A voice (or clearly labeled simulated) request creates a proposal that appears on the TV
  within a few seconds, is confirmed with the D-pad, and updates the companion.
- Rejecting or ignoring a proposal changes nothing; replaying a proposal ID cannot apply it
  twice.
- Schedule Vega regression for the new TV confirmation card before release.

## Exit criteria

A family member can ask about the schedule and propose a change by voice, confirm it on the
TV with the remote, and see the result on the phone, with no path for voice to mutate
household data without confirmation.
