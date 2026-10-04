# Devpost submission draft

Paste-ready text for the Devpost form. Before submitting, check every claim against what the final video shows and
what was tested on the Fire TV.

**Entry:** Fire TV track, plus the AWS Builder mini-challenge.

## Tagline

The family wall calendar on the Fire TV you already own, and it learns your family's rhythm.

## Inspiration

Busy families live by a shared calendar, and smart wall calendars like Skylight have become popular for it. But a
Skylight screen costs $150–$570, meal planning, rewards, and Magic Import cost another $79.99 a year, and its AI
assistant costs $14.99 a month. Most of those families already have a big screen in the busiest room of the house:
Amazon has sold more than 250 million Fire TV devices. We wanted that screen to do the job, and to do one thing a
paper calendar never could: notice the family's patterns and help with them.

## What it does

Hometide turns Fire TV into the family's shared calendar and command center. It is run with the remote, fed from a
phone app, and reached by voice through Alexa.

- **Your calendars, already there.** Paste the private iCal link from Google Calendar, iCloud, or Outlook. Hometide
  mirrors the next three months, keeps them in sync about every 15 minutes, and never changes them.
- **Set up by scanning the TV.** The TV shows a QR code; scan it with the phone camera, tap Approve TV, done.
- **A wall calendar when nobody's using the TV.** After two idle minutes the TV shows today in large type: the time,
  weather, what's next and when to leave, dinner, chores left, and a family photo.
- **It catches conflicts.** Double-booked drivers and tight travel times are flagged with who is free.
- **It learns the family's rhythm.** When the family fixes a clash by hand and the same clash keeps coming back,
  the TV says *Hometide noticed: make Alex the usual Emma pickup on Tuesdays and Thursdays?* One press of the remote
  updates every later week. Hometide also notices who usually drives to an activity, and events added by hand every
  week. Answers are remembered in Amazon Bedrock AgentCore Memory, so "what has Hometide learned about us?" works
  in any later session.
- **Voice, remote, and phone in one flow.** "Alexa, open home tide… swap Emma's pickup to Alex": the TV shows a
  confirm card with focus already on Confirm, the remote confirms, and the phone shows the change. Echo Show gets a
  Hometide card (APL); MCP hosts that support MCP Apps get a day card.
- **Snap a flyer, get an event.** Photograph a school flyer or pick a PDF. Amazon Bedrock drafts the event, and a
  parent reviews it before it's saved.
- **Kids can join in.** Chores with photo check-ins, stars and rewards, family night voting, and movement breaks.
  Anything that matters needs a four-digit parent code.

## How we built it

The diagram is in `docs/ARCHITECTURE.md`.

- **TV:** React Native on Vega OS, plus Fire OS (Expo with react-native-tvos) from the same screens.
  `react-tv-space-navigation` for D-pad focus, designed at 1920×1080 within title-safe margins. The pairing QR code
  is drawn by a small built-in encoder with plain Views, so it works on Vega without a native module.
- **Phone:** Expo (iOS, Android, and web at `/app`), secure session storage, and on-device photo downscaling that
  strips location data.
- **Service:** FastAPI on Railway with Postgres. One write path authorizes every change against a permission matrix
  (parent, child, shared TV, TV in parent mode, voice), applies it under a revision check, and audits it.
- **Voice agent:** the Strands Agents SDK runs the model-tool loop on Amazon Bedrock (Nova Lite), with exactly the
  tools our MCP server exposes. Plain questions never get the change tools, and every change is only a proposal.
- **Alexa:** a custom skill ("home tide") with account linking through Amazon Cognito. Its endpoint reaches the
  household through our MCP server (Streamable HTTP, protocol 2025-11-25) with the user's linked token, and adds an
  APL card on screens.
- **Rhythm:** deterministic pattern detection over the calendar (`app/rhythm.py`), turned into routine proposals
  and remembered in Amazon Bedrock AgentCore Memory, one namespace per household under a hashed id.
- **AWS as code:** an AWS CDK app (`infra/`) with assertion tests creates the AgentCore Memory and a least-privilege
  IAM identity for the API (key in Secrets Manager), and describes the Cognito pool and clients.

## AWS services used (AWS Builder)

| Service | How Hometide uses it |
|---|---|
| Amazon Bedrock (Nova Lite, Converse) | Voice agent tool use, family briefing, flyer and PDF import, chore photo checks |
| Strands Agents SDK | The voice agent's model-tool loop, over the Hometide MCP tools |
| Amazon Bedrock AgentCore Memory | Learned routines and the family's decisions, recalled across sessions |
| Amazon Cognito | Parent accounts, Alexa account linking, OAuth bearer tokens for the MCP server |
| AWS IAM, Secrets Manager, CloudFormation (CDK) | Least-privilege API identity, its key, and all of the above as tested code |
| Amazon EC2 | Vega Virtual Device test host |

## Challenges we ran into

- **Vega OS doesn't let non-media apps keep the screen on.** Amazon staff confirmed this in the developer forum. We
  show the wall calendar before the screensaver starts, point families to the setting that lengthens it, and
  filed a feature request.
- The Vega Virtual Device needs KVM, which our Windows laptop couldn't provide. We ran it on an EC2 instance with
  nested virtualization and scripted remote input and screenshots.
- Nova sometimes answered a tool call with only `<thinking>` notes, which Alexa then read as nothing. The agent now
  falls back to the tools' own spoken answer, and to deterministic rules if needed.
- Given every tool, the model sometimes proposed a fix when the family had only asked a question. Questions now get
  the read tools only.
- With Alexa+, "Alexa, ask home tide what's on today" was sometimes answered by Alexa's own calendar ("Nothing's on
  the calendar"), and the request never reached us. Opening Hometide first ("Alexa, open home tide") hands the
  conversation over, and Hometide now keeps it open so follow-up questions stay with it.

## Accomplishments that we're proud of

- A remote-only TV experience that passed a full Vega Virtual Device regression.
- An assistant that learns from what the family does, says why, and never changes anything without a yes.
- AI that costs about $0.13–$0.51 per household per month (measured), so it can be included rather than sold.
- 200+ backend tests, MCP conformance checks that also run against the live service, and CDK assertion tests.

## What we learned

A family display is judged from across the room: large type, one glance, no surprises. The hard parts were trust
and timing: who may change what, what happens when a TV, a child, and a voice assistant edit the same household,
and how quickly a phone edit reaches the TV (1.9 s median).

## What's next

- A wider family beta on physical Fire TV hardware.
- Keeping the screen awake on Fire OS devices, which allow it.
- Two-way calendar sync, and more patterns (carpools, school holidays).

## Built with

react-native, vega-sdk, fire-tv, expo, typescript, python, fastapi, postgresql, railway, amazon-bedrock,
amazon-nova, strands-agents, amazon-bedrock-agentcore, amazon-cognito, aws-cdk, aws-secrets-manager, amazon-ec2,
model-context-protocol, mcp-apps, alexa-skills-kit, apl, icalendar

## Testing instructions for judges

**Hosted demo family:** sign in to the Hometide web app at `https://hometide.up.railway.app/app/` with the judge
account below. It holds a ready-made family week: school, pickups, soccer, dinners, chores and rewards. Every
Tuesday and Thursday, Jordan's meeting clashes with Emma's pickup. The parent code for approvals is **2468**.
- Email: `<judge email>` · Password: `<judge password>` (fill these in on the Devpost form, never in the repo)

Try this, in order:
1. **Pair a TV by QR:** open the TV app (Vega, Fire OS, or `yarn dev:web`), go to Settings, choose **Show pairing
   code**, and scan the QR code with a phone signed in to the judge account. Tap **Approve TV**.
2. **Fix one clash by voice:** in the phone app, Family → Voice, say or type "Swap Tuesday's Emma pickup to Alex",
   then confirm it on the TV (code 2468).
3. **Watch Hometide learn:** the TV then shows *Hometide noticed*, with the reason. Confirm it, and every later
   Tuesday and Thursday pickup moves to Alex.
4. **Ask what it learned:** "What has Hometide learned about us?" in the same voice panel.

**Run it yourself:** `yarn install`, then `yarn dev:web` (the TV in a browser; arrow keys and Enter are the
remote). A new TV starts empty and asks to be paired; it shows a family only after a parent approves it. The API in `services/family-agent` runs in local demo mode (see its `README.md`), with Bedrock optional.
On Vega, build with `yarn build:vega` and install with `vega run-app` (see `docs/VEGA_VVD_TEST_REPORT.md`).

## Video plan

The shot list and narration are in the "Hometide 3-minute demo video script" document.
