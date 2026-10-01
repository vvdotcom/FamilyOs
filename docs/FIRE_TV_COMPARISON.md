# FamilyOS and other Fire TV calendar options

This compares FamilyOS with the other ways to get a family calendar on a Fire TV, then lists the steps to make
connecting calendars and importing events easier. Research date: 2026-09-29. Sources are at the end.

## The other options

| | Runs on | Price | Calendars | Beyond the calendar | With the remote |
|---|---|---|---|---|---|
| **Amazon: Ambient Experience + Alexa+** | Fire TVs with Ambient Experience (e.g. Omni QLED, Stick 4K Max) | Free (Alexa+ is included on Fire TV) | Calendars linked to Alexa | Alexa+ adds events from emails, flyers, and photos | Glanceable widgets only |
| **Mango Display** | Fire TV, Fire tablets, Echo Show 15; Vega not mentioned | Free tier; Pro $5.99/month or $59.99/year | Google, Outlook, iCloud, Cozi | Chores and rewards, meal plans, photos (in the free tier) | Not confirmed |
| **DAKboard** | Fire OS 7+ only; not the Vega-based Fire TV Stick 4K Select | Free (1 screen, 2 calendars, hourly refresh); $5–$10/month | Google, iCloud, Outlook | Photos, weather, news | Display only; set up on DAKboard's website |
| **Small Appstore apps** (e.g. Family Calendar for Fire TV) | Varies | $1.99 or free | Mostly typed in on the device, offline | Basic | Basic |
| **FamilyOS** | Vega OS and Fire OS from one codebase | Not released; AI measured at $0.13–$0.51 per household per month | Google, iCloud, Outlook, any `.ics` link (read-only, about every 15 minutes) | Conflict detection, photo-checked chores, stars and rewards, meals, lists, family night, Alexa+ through MCP | Full: approve with the parent code, fix pickups, check off chores, confirm voice requests |

### Where FamilyOS is different

- **It runs on Vega OS.** The newest Fire TV Stick (4K Select) only runs Appstore apps rebuilt for Vega. DAKboard
  says its app can't run there, and Mango doesn't say. FamilyOS runs on Vega and on Fire OS from the same code.
- **The family runs the household from the couch.** Approving a chore photo, fixing a pickup conflict, or
  confirming a voice request all happen with the remote. The other TV apps are mostly for looking at.
- **It catches scheduling conflicts** and suggests who is free to drive. None of the others mention this.
- **Kids and safety are built in.** Chores are photo-checked and earn stars, the phone has a child mode, anything
  important needs the parent code, and voice can only suggest changes.
- **It works with Alexa+** through MCP instead of competing with it.

### Where FamilyOS is behind

- **It isn't on the Appstore yet.** Mango's free tier already covers calendars, chores, and meal planning.
- **Connecting a calendar is harder than it should be** (see below), and sync is one-way.
- **Amazon gives part of the pitch away.** Alexa+ already turns flyers and emails into events, so import alone
  isn't a selling point. Amazon's Ambient Experience is part of the system itself, which is likely why it can stay
  on screen when FamilyOS can't on Vega.
- **It isn't tested on a real Fire TV yet**, and it has no Google Photos or to-do app integrations.

**For the pitch:** "Use your Fire TV instead of a Skylight" isn't new. Mango markets exactly that. Lead with
*a family hub you run from the couch, built for Fire TV's new Vega OS, working alongside Alexa+*, and keep the
Skylight prices as supporting context.

---

## Making calendar connections easier

### Where it stands today

- A parent pastes a calendar's private iCal link on the phone (Family → Connected calendars). There are
  step-by-step instructions for Google, iCloud, and Outlook.
- **Google:** the "Secret address in iCal format" exists only on calendar.google.com in a browser, not in the
  phone app. Work and school Google accounts often hide it, because Workspace admins keep it off by default.
- **iCloud:** the calendar has to be made public, and anyone with the link can see it.
- **Outlook:** the parent has to publish the calendar and copy the ICS link, not the HTML one.
- The server checks the link before saving it. Events then refresh about every 15 minutes, can't be edited in
  FamilyOS, and each calendar is assigned to whole family members.
- If a link stops working, the phone shows it in Family → Connected calendars, not on Today.

### Steps, easiest wins first

| # | Step | Why it helps | Effort | Needs |
|---|---|---|---|---|
| 1 | **Fix common link mistakes automatically.** Turn Outlook `calendar.html` links into `calendar.ics`, and turn Google embed and share links (`embed?src=…`, `?cid=…`) for public calendars into their `basic.ics` address. When a link can't be fixed, say exactly what was pasted ("That's the web page link; you need the ICS link") | Most failed connections are the wrong link, not a broken one | Small | Nothing new |
| 2 | **Show a preview before connecting.** For example: "Found 42 events. Next: Soccer practice, Tue 5:00 PM." Also suggest whose calendar it is from its name, such as "Emma's school" for Emma | Parents see it worked before committing, and assigning members becomes one tap | Small | A preview endpoint that doesn't save anything |
| 3 | **Paste with one tap.** Use the iOS paste button (`ClipboardPasteButton`), which doesn't trigger the "Allow Paste" prompt | Removes fiddly long-press pasting | Small | iOS 16+ (works in Expo Go) |
| 4 | **Connect from the computer.** Google's link can only be copied on a computer, so let the parent paste it there: the phone shows a one-time code, and a small FamilyOS web page accepts the code and the link | Removes the hardest step of moving a long secret link from the computer to the phone | Medium | A public web page on the API |
| 5 | **Put broken calendars on Today.** Show "Emma's school calendar needs a new link" under *Needs you*, with the fix steps | Families notice right away instead of seeing stale events | Small | Nothing new |
| 6 | **Faster updates when it matters.** Add pull-to-refresh on the phone calendar, and check more often during the day and for calendars that changed recently | Changes show up in minutes instead of up to 15 | Small | Nothing new |
| 7 | **Sign in with Google.** Read-only access to picked calendars. Google push notifications plus incremental sync make updates arrive within seconds | No link hunting; works for most families, including many work and school accounts | Large | Google OAuth verification (calendar scopes are "sensitive"). Unverified apps show a warning, are limited to 100 users, and testing tokens expire after 7 days. **Start verification now** |
| 8 | **Sign in with Microsoft.** Microsoft Graph `Calendars.Read` for personal and work accounts, with delta queries and change notifications | Same benefit for Outlook families | Medium | An Azure app registration |
| 9 | **Private iCloud calendars.** Use CalDAV with an app-specific password from the Apple Account website | No need to make a family calendar public | Medium | Clear, careful instructions |
| 10 | **Merge duplicates across calendars.** When the same event is on Mom's and Dad's calendars, show it once with both people | A cleaner TV and fewer false conflicts | Medium | Nothing new |
| 11 | **Two-way sync.** Save events made in FamilyOS to a chosen Google or Outlook calendar | Families keep one calendar of record | Large | Write scopes (more verification) |
| 12 | **Rules for who an event is for.** For example, send events with "Emma" in the title to Emma, or use event colors | One shared school or family calendar can still show the right person | Medium | Nothing new |

---

## Making import easier

### Where it stands today

- **Photos and scanned PDFs** are read by Amazon Bedrock. Bedrock is **off on the hosted Railway server**, so
  photo import there currently stops with "Reading photos and scanned PDFs needs the AI provider on this server."
- **Emails, pasted text, and text PDFs** use simple rules that produce **one** item: the first line becomes the
  title, and the first date and time found are used.
- **Each photo becomes at most one item.** `.ics` files import every event.
- Every import is a draft that a parent reviews and confirms. The source isn't kept, only a fingerprint for spotting
  duplicates.

### Steps, easiest wins first

| # | Step | Why it helps | Effort | Needs |
|---|---|---|---|---|
| 1 | **Turn on Bedrock on the hosted server** | Without it, snapping a flyer doesn't work for real users. It costs about $0.0001 per import (measured) | Tiny | Your decision on putting the Bedrock key in Railway |
| 2 | **Use Bedrock for emails and pasted text too**, keeping the rules as a fallback | School emails mix several dates, times, and places, and simple rules pick the wrong one | Small | Step 1 |
| 3 | **Get several items from one source.** A newsletter, schedule, or season flyer becomes a list the parent ticks ("Add 6 of 7") | This is the real "magic import" moment | Medium | Step 1 |
| 4 | **Improve the review screen.** Show the photo beside the fields, highlight what the AI was unsure about, guess who it's for from names in the text, and offer "Add all" | Reviewing takes seconds instead of editing every field | Medium | Nothing new |
| 5 | **Understand repeats and reminders.** Turn "Every Tuesday until Nov 15" into a weekly series, and "Bring $5" or "Wear orange" into the event's checklist | Checklists already appear on the TV before an event | Small | Step 2 |
| 6 | **Catch duplicates against connected calendars.** For example: "This is already on Emma's school calendar" | Stops double entries once calendars are connected | Small | Nothing new |
| 7 | **Share into FamilyOS** from Photos, Mail, Files, and Messages with the iOS share sheet | Import starts from wherever the flyer or email already is | Medium | A development build; Expo Go can't add share extensions |
| 8 | **Forward emails to a household address**, such as `plans-<secret>@…`. Drafts land in *Needs you*. Only parents' addresses are accepted, and messages are deleted after reading | This matches Skylight's email import and Alexa+ | Medium | A domain, plus Amazon SES email receiving (available in us-west-2, where Bedrock and Cognito already run) |
| 9 | **Start an import from the TV.** The TV shows a QR code that opens an upload page for this household on the phone | Fits the couch: see a flyer, scan, done | Medium | A QR code drawn in plain JavaScript (Vega can't use the usual native QR libraries) and a small upload page |
| 10 | **Hand off from Alexa+.** "Alexa, add this to FamilyOS" becomes a proposed event (the MCP tool already exists) that a parent confirms | Works alongside Amazon's own flyer-to-calendar feature | Small once Alexa+ linking works | Live Alexa+ account linking |

---

## How to know it's working

- **Time to the first synced calendar**, from opening Connected calendars to events showing on the TV. Target:
  under 2 minutes.
- **First-try connection success rate**, and failures by reason (wrong link, not shared, unreachable). The
  server's error codes already separate these.
- **Import drafts confirmed without edits** versus edited or discarded.
- **A hands-off test:** ask 3–5 parents from the family pilot to connect their real calendar and import a real
  flyer without help, and note where they get stuck.

Keep these as simple server-side counts with no event content.

## Suggested order

**Before the October 23 deadline:**
- Import steps 1–3 and 6
- Calendar steps 1–3 and 5
- Import step 9 (TV QR code)

**After the deadline:**
- Sign in with Google (start verification now) and Microsoft
- Email forwarding
- The share extension
- Private iCloud calendars
- Two-way sync

## Sources

- Competitors: [Mango Display pricing](https://mangodisplay.com/pricing) ·
  [Mango Display on Fire TV](https://mangodisplay.com/2024/05/01/the-best-fire-tv-echo-show-15-calendar-app/) ·
  [DAKboard Fire TV app](https://dakboard.freshdesk.com/support/solutions/articles/35000317105-the-new-dakboard-fire-tv-app) ·
  [DAKboard pricing](https://dakboard.com/pricing) ·
  [Family Calendar for Fire TV (Appstore)](https://www.amazon.com/Family-Calendar-Schedule-Birthdays-Planner/dp/B0HFD4L7VN)
- Amazon: [What Alexa+ can do](https://www.aboutamazon.com/news/devices/new-alexa-top-features) ·
  [Fire TV Ambient Experience](https://www.aboutamazon.com/news/devices/4-ways-the-fire-tv-ambient-experience-makes-your-smart-tv-even-smarter) ·
  [Fire TV Stick 4K Select runs Vega OS](https://www.aftvnews.com/amazon-announces-fire-tv-stick-4k-select-the-first-non-android-based-fire-tv-running-vega-os/)
- Google: [Secret iCal address (Google Calendar Help)](https://support.google.com/calendar/answer/37648?hl=en) ·
  [Enabling private iCal addresses in Google Workspace](https://bookem.com/help/enable-private-ical-addresses-for-google-workspace-calendars) ·
  [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) ·
  [Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- Microsoft: [Delta query for events](https://learn.microsoft.com/en-us/graph/delta-query-events) ·
  [Outlook change notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview)
- iOS and AWS: [Expo Clipboard (`ClipboardPasteButton`)](https://docs.expo.dev/versions/latest/sdk/clipboard/) ·
  [Amazon SES regions (email receiving)](https://docs.aws.amazon.com/ses/latest/dg/regions.html)
