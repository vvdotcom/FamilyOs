# Hometide: every feature in detail

The short version is in the README's [What it does](../README.md#what-it-does).

## Features

**On the TV** (Vega OS on a Fire TV Stick, remote only; the same screens also build for Fire OS)
- **Catches clashes and says who's free:** double-booked drivers and tight travel times are flagged on Home and in
  the calendar, with who can help.
- **Learns the family's rhythm:** when a clash keeps coming back after the family fixed one by hand, the TV says
  *Hometide noticed* and offers to make the fix the routine for every later week. It also spots the usual driver for
  an activity and events added by hand every week. Answers are remembered in Amazon Bedrock AgentCore Memory.
- **Approvals:** voice requests, photo-checked chores and reward requests wait on the TV for a parent, confirmed
  with a four-digit parent code on the remote.
- **Home:** a family briefing, today's timeline, who's free, and what's next, including when to leave.
- **Wall calendar:** after 5 idle minutes (a parent can change this in the phone app) the TV shows the day in large type (clock, next up, dinner, chores
  left, a family photo) on glass over a looping landscape that follows the live U.S. National Weather Service
  forecast and the time of day: rain, storms, snow, blizzards, heat or clear skies, by day and by night, with a
  different constellation on each clear night. A Hometide note joins the forecast with the family's day ("Rain from
  about 3 PM. Emma's soccer is at 4:00 PM, so pack rain jackets."). After 10 pm it dims to a quiet clock over the
  night scene, and it shifts a few pixels each minute to protect the screen.
- **Reminders:** a card 15 minutes before each event while Hometide is on screen (the lead time is set in the phone app).
- **Calendar:** day, week, and month views, with all-day items in their own row and conflicts flagged.
- Chores with a star celebration, rewards, meals, lists, a photo slideshow, movement breaks, family night voting.
- **Pair by QR code:** the TV shows a QR code; scan it with the phone and tap Approve TV.

**On the phone** (web app served at `/app`, and an iOS app from the same Expo code)
- **Set up in 5 minutes:** connect calendars, add kids, set a parent code, pair the TV, set the weather location.
- **Connected calendars:** paste the private iCal link from Google Calendar, iCloud, or Outlook (or a school or
  league `.ics` link). Hometide re-reads it about every 15 minutes and never writes back.
- **Import:** photograph a flyer or pick a PDF, email, or `.ics` file. Amazon Bedrock drafts the event, and you
  review it before saving.
- **AI recipes:** describe a meal ("quick chicken dinner the kids will eat, 30 minutes") and Amazon Bedrock writes
  the recipe with ingredients and steps. It is saved to Recipes, put on that day's meal plan, and its ingredients can
  go straight to Groceries. Also on the TV (Meals → Create with AI).
- Chores with photo verification, rewards, lists, meals and recipes, groceries, sports teams and carpool
  rotation, family night, photos for the TV, and a child mode kids can use on their own.

**By voice**
- In the phone or web app, tap the mic (or type) and ask: the same agent answers, and any change waits for a parent
  to confirm on the TV or phone. The demo video plays a real request spoken into the phone app.
- An Alexa skill ("home tide") reaches the same agent through our MCP server: "Alexa, open home tide", then what's
  on today, open the calendar on the TV, swap a pickup, what Hometide has learned. It works in the Alexa developer
  console's simulator with a linked account. On our Fire TV Stick, the remote's Alexa button didn't reach the
  in-development skill, so the demo video uses the phone app's mic. The skill includes an APL card for Echo Show.
- The voice agent is built with the Strands Agents SDK on Amazon Bedrock and uses the tools of our MCP server
  (Streamable HTTP, protocol 2025-11-25), which other MCP hosts can also use (Alexa+ access for MCP servers wasn't
  open to us yet); hosts with MCP Apps get a day card. Voice can only *suggest* changes: nothing changes until a
  person confirms on the TV or phone.

## Fixes from family feedback, in detail

**1. Choose when the wall calendar starts** (the Tammy family). A parent picks it in the phone app under Family → TV:
after 1, 5, 10 or 30 minutes without the remote, or off (it then opens only when someone chooses it). Every TV in the
household picks up the change on its next sync, within a few seconds, and the TV's Settings screen says where to change it.

<!-- Screenshot: the phone app's Family → TV screen with the two new settings -->
![The phone app's Family → TV screen: "Wall calendar after" 1, 5, 10 or 30 minutes or Off, and "Reminder on the TV" 10, 15 or 30 minutes or Off](./images/readme/feedback-phone-tv-settings.jpg)

**2. A reminder before each event** (the Johnny family). While Hometide is on the TV, including the wall calendar, a
card appears 15 minutes before each timed event (10 or 30 minutes, or off, in the same phone setting), once per event:
what it is, when, who's on it and where.

<!-- Screenshot: the reminder card on the TV (sample mode: Jordan's 2:45 PM dentist appointment at 2:30 PM) -->
![A reminder on the TV: "In 15 minutes · Dentist · 2:45 PM · Jordan · Desert Dental"](./images/readme/feedback-tv-reminder.jpg)

Vega OS has no supported way for a household app to show a notice while another app is playing, so the reminder
can't appear over a show ([FR-1](./FRICTION_LOG.md#fr-1--timed-household-notifications-during-other-apps-playback));
it appears whenever Hometide is open, which on a family's living-room TV is most of the day thanks to the wall calendar.

How it's built: the setting is one more household change (`tvSettings`) through the same write path, parent-only in the
[permission matrix](./SAFETY.md#permission-matrix), with tests in
[`test_tv_settings.py`](../services/family-agent/tests/test_tv_settings.py); the TV picks the next due event in
[`ReminderToast.tsx`](../packages/shared-ui/src/components/ReminderToast.tsx), tested in
[`family-feedback.test.ts`](../apps/expo-multi-tv/__tests__/family-feedback.test.ts).
