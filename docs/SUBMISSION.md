# Devpost submission draft

Paste-ready text for the Devpost form, checked against the Official Rules ("Build, Ship, Shape: Amazon Developer
Hackathon", updated September 16, 2026). Before submitting, check every claim against what the final video shows and
what was tested on the Fire TV. Image links render on GitHub; on Devpost, upload the images to the gallery and
delete the two image lines under "How we built it".

**Entry:** Fire TV track, plus the AWS Builder mini-challenge.

## Rules checklist (for you; don't paste into Devpost)

| Rule | Where Hometide meets it |
|---|---|
| Fire TV track: a demo-ready app that works on Fire OS or Vega OS | The Vega OS app (`apps/vega`) is installed and running on a physical Fire TV Stick (Vega OS) |
| Primary track(s) and mini challenge(s) named | Fire TV track · AWS Builder. Optional: Hometide's self-hosted MCP server (Streamable HTTP, protocol 2025-11-25) also meets the Alexa+ track requirement, if you want to enter both. A project can win only one track prize |
| Text description of features and functionality | This document, from "Tagline" to "Built with" |
| GitHub repository with all source, assets and instructions | https://github.com/vvdotcom/FamilyOs, with setup, run and test steps in `README.md` ("Run it locally"). Push all local changes before submitting |
| Public repo with a detectable open-source license, or private and shared | MIT `LICENSE`; files from Amazon's MIT-0 sample keep their headers. If public, check that GitHub's About box shows "MIT license". If private, add testing@devpost.com and chris-trag, knmeiss, giolaq, anishamalde, mosesroth, emersonsklar as collaborators |
| Demo video under 3 minutes, public on YouTube or Vimeo, showing the app on an actual Fire TV | To do: film on the Fire TV Stick and upload (see "Video") |
| No third-party trademarks or copyrighted music in the video | Royalty-free music only; no other companies' names or logos on screen (the video says "smart wall calendars", not a brand) |
| New, or significantly updated during the Submission Period | Created during the Submission Period, starting 22 September 2026 from Amazon's MIT-0 multi-TV sample (see "Built during the hackathon") |
| Third-party integrations authorized | Calendar data comes from the family's own private iCal links; weather from the US National Weather Service public API; fonts under the SIL Open Font License; libraries under their open-source licenses |
| Product Feedback for each tool, with the five questions | `docs/PRODUCT_FEEDBACK.md` (10 tools), pasted into the Product Feedback field. Swap its relative links for full GitHub links when pasting |
| AWS Builder: AWS services and how they are used, in the Product Feedback | "How AWS services are used" at the end of `docs/PRODUCT_FEEDBACK.md`, and "AWS services used" below |
| Optional friction log and feature requests (up to a 10% bonus) | `docs/FRICTION_LOG.md`: 21 entries plus 2 feature requests with priority. Entries 4–7 and 9 use an older, shorter format; add their missing steps, expected result and suggestion for the full bonus |
| Judges can test it free, without restriction, until judging ends (20 November 2026) | Hosted demo family and judge login on the Devpost form; keep the Railway service and the judge account live until 20 November |
| English | All materials are in English |

## Tagline

The family wall calendar on the Fire TV you already own, and it learns your family's rhythm.

## Inspiration

I'm a mom of a 5-year-old and a 7-year-old, and keeping our family on track is a daily juggling act: school
drop-offs and pickups, activities, chores, and who is driving where. I wanted one place the whole family could see,
kids included, without another device to buy.

Smart wall calendars like Skylight do that, but a Skylight screen costs $150–$570, and meal planning, rewards, and
Magic Import cost another $79.99 a year, or $14.99 a month with its AI assistant included. Our living room already
has a big screen, like most homes: Amazon has sold more than 250 million Fire TV devices.

Families keep asking for exactly that. On [r/fireTV](https://www.reddit.com/r/fireTV/comments/1vtyv56/using_firetv_to_show_family_calendar_as_a/),
a parent wrote: "I have a spare 32” TV and old fire tv stick instead of spending $300 on a skylight." On
[r/amazonecho](https://www.reddit.com/r/amazonecho/comments/1n4ggrq/skylight_app_on_echo_show_w_fire_tv/), another
asked whether an Echo Show with Fire TV could run the Skylight app, to "use it like you would any echo but have the
functionality of a skylight." And a
[r/homeautomation](https://www.reddit.com/r/homeautomation/comments/1vtxexp/i_turned_a_smart_tv_into_an_economic_skylight/)
post about turning a smart TV into a cheaper Skylight alternative drew 547 upvotes. Its author's wife "wanted us to
get a big skylight calendar, which costs $600." One reply: "80/year for a $600 calendar is diabolical." Another:
"this is exactly what I’m looking for too."

So I built Hometide to make that screen do the job, and to do one thing a paper calendar never could: notice our
family's patterns and help with them.

## What it does

Hometide turns Fire TV into the family's shared calendar and command center. It is run with the remote, fed from a
phone app, and reached by voice through Alexa.

- **Your calendars, already there.** Paste the private iCal link from Google Calendar, iCloud, or Outlook. Hometide
  mirrors the next three months, keeps them in sync about every 15 minutes, and never changes them.
- **Set up by scanning the TV.** The TV shows a QR code; scan it with the phone camera, tap Approve TV, done.
- **A wall calendar when nobody's using the TV.** After five idle minutes the TV shows today in large type: the time,
  weather, what's next and when to leave, dinner, chores left, and a family photo.
- **It catches conflicts.** Double-booked drivers and tight travel times are flagged with who is free.
- **It learns the family's rhythm.** When the family fixes a clash by hand and the same clash keeps coming back,
  the TV says *Hometide noticed: make Lindsey the usual Emma pickup on Tuesdays and Thursdays?* One press of the remote
  updates every later week. Hometide also notices who usually drives to an activity, and events added by hand every
  week. Answers are remembered in Amazon Bedrock AgentCore Memory, so "what has Hometide learned about us?" works
  in any later session.
- **Voice, remote, and phone in one flow.** "Alexa, open home tide… swap Emma's pickup to Lindsey": the TV shows a
  confirm card with focus already on Confirm, the remote confirms, and the phone shows the change. Echo Show gets a
  Hometide card (APL); MCP hosts that support MCP Apps get a day card.
- **Snap a flyer, get an event.** Photograph a school flyer or pick a PDF. Amazon Bedrock drafts the event, and a
  parent reviews it before it's saved.
- **Describe dinner, get a recipe.** Type "quick chicken dinner the kids will eat, 30 minutes" on the phone or the
  TV. Amazon Bedrock writes the recipe with amounts and steps, it lands on that night's meal plan, and its
  ingredients go to the grocery list.
- **Kids can join in.** Chores with photo check-ins, stars and rewards, family night voting, and movement breaks.
  Anything that matters needs a four-digit parent code.

## How it meets the Fire TV priorities

Hometide is built around the two Fire TV priorities the rules call creative: AI that adapts to household patterns,
and voice, D-pad and visuals in a single flow. It also touches the other four.

| Priority | What Hometide does on the TV | Code |
|---|---|---|
| AI-enhanced viewing | The TV adapts to the household. "Hometide noticed" turns the family's own repeated fixes into routines, and a morning briefing flags today's conflicts and who can help | `app/rhythm.py`, `app/briefing.py` |
| Multi-modal UX | Alexa takes the request, the TV shows a confirm card with focus on Confirm, the remote approves, and the phone updates, all in one flow | `app/alexa.py`, `FamilyTVFeatures.tsx` |
| Family entertainment | Family night: everyone suggests ideas and votes from their phone, the TV shows the vote live, and a picker who rotates each week breaks ties. Stars and rewards for chores | `app/household_ops.py`, `FamilyTVFeatures.tsx` |
| Fitness | Movement breaks: original guided routines for kids, timed on screen, that earn stars | `app/move.py`, `FamilyTVFeatures.tsx` |
| Sports | Practices and games are tracked with who drives, and get "leave in 25 minutes; shin guards not packed" reminders | `app/domain.py` |
| Computer vision | Chore photo checks and flyer or PDF import with Amazon Bedrock vision. Photos come from the phone (Fire TV has no camera), and a parent always decides | `app/vision.py`, `app/imports.py` |

## Hometide vs. smart wall calendars

Hometide gives a family the same shared calendar, chores and meals as a dedicated wall screen, on the TV they already
have, with no subscription planned and AI and voice included.

| | **Hometide** | Skylight Calendar | Hearth Display |
|---|---|---|---|
| Screen | The Fire TV the family already owns: a Vega OS model today, with the Fire OS build for older models next | 10" $149.99 · 15" $299.99 · 27" $569.99 | 27", $699 list price |
| Subscription | None planned | Calendar Plus $79.99/year for meal planning, photo screensaver, import and rewards | Family Membership required to set up: $9/month or $86.40/year |
| AI assistant | Included (Amazon Bedrock); measured cost to us of about $0.13–$0.51 per household per month | $14.99/month or $119.99/year, including Calendar Plus | Hearth Helper, included in the membership |
| Voice | Alexa: "Alexa, open home tide…", confirmed on the TV | — | — |
| Turns a repeated fix into a routine | Yes: "Hometide noticed" offers it, says why, and remembers the answer | — | — |
| First-year cost | **$0** in new hardware or fees, with a Vega OS Fire TV | $379.98 (15" screen and Calendar Plus) | $785.40 (screen and annual membership) |

Prices as of 3 October 2026 from each company's own pages: [Skylight models](https://myskylight.com/compare-calendars),
[Skylight subscriptions](https://skylight.zendesk.com/hc/en-us/articles/51833126965019-Subscription) (checked
29 September), [Hearth Display](https://www.hearthdisplay.com/products/hearth-display) and
[Hearth Family Membership](https://hearthdisplay.com/products/family-membership). A dash means the feature isn't
listed on those pages. Where dedicated screens still win: they stay on all day and have touch screens, while on Vega
OS the system screensaver takes over after its timeout (families can lengthen it; see the friction log).

## How Hometide differs from other calendar apps

My family, and the parents in those Reddit threads, need six things from a family calendar. Every option we checked
covers one or two of them; none covers them all.

| What a busy family needs | **Hometide** | Skylight and Hearth (dedicated screens) | TV calendar apps (Dashie, DAKboard, Mango Display) |
|---|---|---|---|
| Use a screen we already own | Yes: the Fire TV | No: a new screen, $149.99–$699 | Yes |
| No subscription | None planned | Skylight Calendar Plus $79.99/year; Hearth membership required, $86.40/year | Paid plans: DAKboard $5–$10/month; Mango Display and Dashie also have paid plans |
| Ask by voice, with a confirm step | Yes: Alexa, then confirm on the TV | — | Dashie needs a separately connected microphone; the others don't list it |
| Catch a busy driver and suggest who is free | Yes | — | — |
| Learn the family's routines from its own fixes | Yes: "Hometide noticed" | — | — |
| Let kids take part safely | Chores with photo checks, stars, parent approvals on the TV, no kid accounts | Chore charts and rewards, with Calendar Plus or the membership | Mango Display can show chores; the others don't list it |

A dash means the feature isn't listed on that company's own pages (checked 3 October 2026):
[Skylight](https://myskylight.com/compare-calendars),
[Skylight subscriptions](https://skylight.zendesk.com/hc/en-us/articles/51833126965019-Subscription),
[Hearth Display](https://www.hearthdisplay.com/products/hearth-display),
[Hearth membership](https://hearthdisplay.com/products/family-membership),
[DAKboard pricing](https://dakboard.com/pricing) and
[Mango Display for Fire TV](https://mangodisplay.com/blog/the-best-fire-tv-echo-show-15-calendar-app/). Dashie's
details come from its maker and users in the
[r/homeautomation thread](https://www.reddit.com/r/homeautomation/comments/1vtxexp/i_turned_a_smart_tv_into_an_economic_skylight/)
("voice (with an OTG connected mic)"; "wish it weren't a subscription").

The gap is the same in each case: these products show the family's schedule, and leave the family to run it.
Hometide helps run it. It notices the clash that comes back every Tuesday, offers the fix, takes the request by voice,
and still waits for a parent's yes.

## Designed for families with young kids

**What kids can do, and what they can't**
- Kids never need an account, email or password. A parent adds them as profiles.
- Kids can complete their own chores. The shared TV can tick off lists and the chores assigned to the children, and
  needs the four-digit parent code for anything bigger. A child's voice connection can only ask about the schedule
  and report their own finished chores, and the TV labels requests that come from a child.
- Chores can ask for a photo. The AI only gives advice; a parent approves before stars are added, and the photo is
  deleted once the parent decides.
- Motivation that feels fair: stars toward rewards the kids pick, a short star celebration on the TV, and a weekly
  family night where everyone suggests ideas, the majority wins, and a rotating picker breaks ties.
- Movement breaks: short, original guided routines for kids (general activity, not fitness advice), with stars once
  per session. Morning and evening routines work as simple checklists.

**How it looks and feels**
- Made for the couch: designed at 1920×1080 for viewing from about 3 m, with large type, title-safe margins, and light
  and dark themes.
- Every family member has their own color and initial, so young kids can find their own events and chores without
  reading much.
- Remote only: visible focus everywhere, Back never traps, and focus starts on the most likely action (Confirm, Pair
  this TV).
- Calm by default: after two quiet minutes the TV becomes a wall calendar, at night (10 pm to 6 am) it dims to a clock,
  and the layout shifts a few pixels each minute to protect the screen.
- Celebrations and movement breaks respect the reduced-motion setting.
- Privacy built in: no ads, analytics or tracking, location data stripped from photos, calendar links encrypted, and
  no names in the AI's memory.

## How we built it

![Hometide architecture: Fire TV, phone and Alexa talk to the Hometide API on Railway, which uses Amazon Bedrock, AgentCore Memory and Cognito in AWS](images/architecture.png)

![Hometide on Vega OS: the TV app, the shared TV code, React Native for Vega, Vega OS services and the Fire TV device](images/vega-architecture.png)

- **TV:** React Native on Vega OS, installed and running on a Fire TV Stick. The same screens are set up for Fire OS
  (Expo with react-native-tvos) in `apps/expo-multi-tv`, not yet built. `react-tv-space-navigation` for D-pad focus, designed at 1920×1080 within title-safe margins. The pairing QR code
  is drawn by a small built-in encoder with plain Views, so it works on Vega without a native module.
- **Phone:** Expo (iOS first, plus the web app at `/app`), secure session storage, and on-device photo downscaling that
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
| Amazon Bedrock (Nova Lite, Converse) | Voice agent tool use, family briefing, flyer and PDF import, AI recipes, chore photo checks |
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
- On the physical Fire TV Stick, enabling Developer Mode from our Linux build VM failed after a successful sign-in:
  the Vega CLI couldn't save its token without a desktop keyring. Our setup script now starts one.
- Nova sometimes answered a tool call with only `<thinking>` notes, which Alexa then read as nothing. The agent now
  falls back to the tools' own spoken answer, and to deterministic rules if needed.
- Given every tool, the model sometimes proposed a fix when the family had only asked a question. Questions now get
  the read tools only.
- With Alexa+, "Alexa, ask home tide what's on today" was sometimes answered by Alexa's own calendar ("Nothing's on
  the calendar"), and the request never reached us. Opening Hometide first ("Alexa, open home tide") hands the
  conversation over, and Hometide now keeps it open so follow-up questions stay with it.

## Accomplishments that we're proud of

- Running on a physical Fire TV Stick (Vega OS), after a full remote-only regression on the Vega Virtual Device.
- An assistant that learns from what the family does, says why, and never changes anything without a yes.
- AI that costs about $0.13–$0.51 per household per month (estimated from measured per-request costs), so it can be
  included rather than sold.
- 200+ backend tests, MCP conformance checks that also run against the live service, and CDK assertion tests.

## What we learned

A family display is judged from across the room: large type, one glance, no surprises. The hard parts were trust
and timing: who may change what, what happens when a TV, a child, and a voice assistant edit the same household,
and how quickly a phone edit reaches the TV (1.9 s median in a browser test).

## What's next

- A wider family beta, and the Amazon Appstore listing.
- The Fire OS build for older Fire TVs, where the screen can also stay awake.
- Two-way calendar sync, and more patterns (carpools, school holidays).

## Built with

react-native, vega-sdk, fire-tv, expo, typescript, python, fastapi, postgresql, railway, amazon-bedrock,
amazon-nova, strands-agents, amazon-bedrock-agentcore, amazon-cognito, aws-cdk, aws-secrets-manager, amazon-ec2,
model-context-protocol, mcp-apps, alexa-skills-kit, apl, icalendar

## Built during the hackathon

Hometide was created during the Submission Period. Work started on 22 September 2026 from Amazon's open-source
[React Native multi-TV sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample) (MIT-0), which
provided the app scaffolding, the remote-control plumbing and the build configuration. Everything else was built
for this project: the TV screens and design system, the shared domain and conflict engine, the family agent API
(accounts, permissions, audit, calendar sync, the MCP voice server, the Strands voice agent, the rhythm engine with
AgentCore Memory, and the Bedrock features), the Alexa skill, the CDK infrastructure, the QR pairing encoder, the
phone app, the Windows and EC2 Vega setup automation, and the tests. Files from the sample keep Amazon's MIT-0
header.

## Testing instructions for judges

**Hosted demo family:** sign in to the Hometide web app at `https://hometide.up.railway.app/app/` with the judge
account below. It holds a ready-made family week: school, pickups, soccer, dinners, chores and rewards. Every
Tuesday and Thursday, Jordan's meeting clashes with Emma's pickup. The parent code for approvals is **2468**.
- Email: `<judge email>` · Password: `<judge password>` (fill these in on the Devpost form, never in the repo)
- If you can, give each judge their own seeded account: confirming the routine in step 3 moves that family's later
  pickups for good, so the next judge would find no clash.

Try this, in order:
1. **Pair a TV by QR:** open the TV app (on a Vega Fire TV, or in a browser with
   `EXPO_PUBLIC_FAMILYOS_API_URL=https://hometide.up.railway.app yarn dev:web`), go to Settings, choose
   **Show pairing code**, and scan the QR code with a phone signed in to the judge account. Tap **Approve TV**.
   If Hometide is live on the Amazon Appstore by then, install it on a Vega Fire TV by searching "Hometide".
2. **Fix one clash by voice:** in the phone app, Family → Voice, say or type "Swap Tuesday's Emma pickup to Lindsey",
   then confirm it on the TV (code 2468).
3. **Watch Hometide learn:** the TV then shows *Hometide noticed*, with the reason. Confirm it, and every later
   Tuesday and Thursday pickup moves to Lindsey.
4. **Ask what it learned:** "What has Hometide learned about us?" in the same voice panel.
5. **Create a recipe:** in the phone app, Lists → Meals, pick a day, type a short description such as "easy
   salmon dinner, 25 minutes" under **Create a recipe with AI**, and tap **Create recipe**. The recipe (ingredients
   and steps) appears on that day and on the TV's Meals screen, and the ingredients are on Groceries.

**Run it yourself:** `yarn install`, then `yarn dev:web` (the TV in a browser; arrow keys and Enter are the
remote). A new TV starts empty and asks to be paired; it shows a family only after a parent approves it. The API in
`services/family-agent` runs in local demo mode at `http://127.0.0.1:8787` (see its `README.md`), with Bedrock
optional. On Vega, build with `yarn build:vega` and install with `vega device install-app` (Windows: `.\familyos.ps1 tv`).

## Product feedback

Paste `docs/PRODUCT_FEEDBACK.md` into the Product Feedback field. For every tool (Vega SDK and Fire TV, Alexa+ and
MCP, Amazon Bedrock, Strands Agents, AgentCore Memory, AWS CDK, Amazon Cognito, Amazon EC2) it answers the five
required questions (Alexa Skills Kit and Amazon Devices Builder Tools too): what we used and for what, what worked well, what needs work, how onboarding went, and whether
we would build with it again. It ends with how AWS services are used, for the AWS Builder mini-challenge. Optional
feature requests and the friction log are in `docs/FRICTION_LOG.md`.

## Images for the Devpost gallery

Upload these to the project gallery (JPG, PNG or GIF, under 5 MB each), in this order:

| # | Image | File |
|---|---|---|
| 1 | Hometide on the real Fire TV: Home with the family briefing *(photo to take)* | `docs/images/tv-home.jpg` |
| 2 | The "Hometide noticed" card on the TV *(photo to take)* | `docs/images/tv-noticed.jpg` |
| 3 | The wall calendar on the TV *(photo to take)* | `docs/images/tv-wall.jpg` |
| 4 | QR pairing: the TV code and the phone's Approve TV *(photo to take)* | `docs/images/tv-pairing.jpg` |
| 5 | Overall architecture | `docs/images/architecture.png` |
| 6 | Hometide on Vega OS | `docs/images/vega-architecture.png` |
| 7 | Appstore background art (the wall-calendar layout, rendered for the store listing) | `store-listing/fire-tv/background-1920x1080.jpg` |

Take photos 1–4 of the real TV with the seeded demo family, from slightly off-center to avoid glare, so judges see
the app on actual hardware. Use the same family names as the video.

## Video

- Under 3:00 (judges don't have to watch past 3 minutes); public on YouTube or Vimeo, and the link checked while
  signed out.
- Shows Hometide running on the Fire TV Stick, with the real remote, phone and Alexa.
- Royalty-free music (keep proof of the license); no other companies' names, logos or copyrighted material.
- Start inside Hometide, not on the Fire TV home screen, where other apps' tiles and artwork show.
- Keep calendar-provider names and phone-maker branding off screen, use your own family photo, and use made-up
  place names in the demo data.
- Captions on, since many judges watch without sound.
- The shot list and narration are in the "Hometide 3-minute demo video script" document.
