# Amazon Appstore submission kit (Hometide for Fire TV)

Everything for the Developer Console in one place. Requirements and sources are in
[FIRE_TV_APPSTORE.md](FIRE_TV_APPSTORE.md). This is not legal advice; have the privacy wording and the
children's-data choice reviewed before launch.

## 1. Policy pages (live once the API is deployed)

| Console field | URL |
| --- | --- |
| Privacy policy URL | `https://hometide.up.railway.app/privacy` |
| Account and data deletion URL | `https://hometide.up.railway.app/delete-account` |

Set two Railway variables so the pages name you and give a contact address (Amazon and privacy laws expect
one). Until they are set, the pages still work and point people to self-service deletion.

| Variable | Example |
| --- | --- |
| `FAMILYOS_OPERATOR_NAME` | Your name or company |
| `FAMILYOS_PRIVACY_EMAIL` | An inbox you read, for privacy and deletion requests |

Self-service deletion: parents sign in at `/app/` (or the phone app) → Family → Settings → **Delete account**,
re-enter the password, confirm. The server deletes the household and everything in it
(`POST /v1/account/delete`, which needs a fresh password sign-in), then the app deletes the Cognito sign-in.
Paired TVs return to the pairing screen. The sign-in and sign-up screens link both pages.

## 2. Children's data: the choice made

**Hometide is presented as a parent-directed household app, not a child-directed app.**

- Only adults create accounts. Sign-up now requires: "I'm 18 or older and the parent or legal guardian of any
  children I add. I agree to the privacy policy."
- Children have no accounts, emails or passwords. A parent adds them as profiles, and the parent's own signed-in
  phone or browser opens the limited child view.
- Everything about a child is entered or approved by the parent, can be edited or deleted by the parent, and is
  deleted with the account. Chore photos are deleted once a parent decides. No ads, analytics or tracking SDKs.
- The privacy policy has a children's section describing exactly this.

**In the Console:** choose the **16+ / adults** audience, answer "no" to ads, and describe user-generated
content as family content visible only within the household. If Amazon or your lawyer considers the TV screen or
child view to be directed at children, switch the audience to include children: you would then need verifiable
parental consent before a child's information is collected (Amazon's children's policy, COPPA). The parent-only
account plus the guardian confirmation is the starting point for that, but a stricter consent method (for example a
small card check) may be required.

## 3. Reviewer access

Amazon's testers must be able to complete every sign-in path, including pairing with a phone.

1. Create a reviewer account yourself: open `https://hometide.up.railway.app/app/`, choose **Create
   account**, use an address you control (for example `appstore-review@your-domain`), and verify it.
2. Fill it with the sample family (run it yourself; it asks for the password and never stores it):

   ```powershell
   python setup/seed-reviewer-household.py --email review@your-domain.example --code 2468
   ```

   It adds the Rivera family (Lindsey, Jordan, Emma, Leo) with weekly school runs, pickups, piano, soccer, movie
   night and brunch for the next 12 weeks, so the account looks lived-in whenever Amazon opens it. Every Tuesday
   and Thursday has a pickup conflict to fix. It also adds daily chores (one with a photo check), rewards, stars,
   a reward request waiting for approval, a week of dinners, grocery and to-do lists, Phoenix weather and the
   parent code. Run it again any time (for example after a reviewer deletes things); it updates instead of
   duplicating. Use the same command for the demo account.
   If the account already had a household from an earlier sign-in, add `--fresh` so the parent name (Lindsey)
   and the household name are set from scratch. It asks you to type DELETE, wipes that account's old
   household (including paired TVs), and keeps the sign-in.
3. Paste this into **Testing Instructions** (fill in the account):

   > Hometide shows a family's calendar, chores, meals and lists on the TV. A new TV starts empty and is linked to a
   > family by a parent; you don't need to install anything for that.
   >
   > 1. Open Hometide on the Fire TV. Home says "Link this TV to your family". Use the remote: Up to reach the top
   >    bar, Left/Right to move, OK to select.
   > 2. Select **Pair this TV**. The TV shows a QR code and a pairing code.
   > 3. On a phone, scan the QR code with the camera. Or, on any phone or computer, open
   >    https://hometide.up.railway.app/app/ and choose Family → Pair a TV, then type the code.
   >    Sign in with Email: <reviewer email>  Password: <reviewer password>, and tap **Approve TV**.
   >    Within a few seconds the TV shows the reviewer household (the Rivera family).
   > 4. Parent code for approvals on the TV (menu → Approvals) and for parent mode: 2468.
   > 5. The Menu (≡) button opens the Hometide menu. After 2 idle minutes the TV shows a large wall calendar; any
   >    button returns.
   > 6. Settings → Unpair this TV returns the TV to the empty, unpaired start.
   > 7. Account deletion: web app → Family → Settings → Delete account (please don't delete the reviewer account),
   >    or https://hometide.up.railway.app/delete-account.

## 4. Store listing

Assets are in `store-listing/fire-tv/`:

| Asset | File | Spec |
| --- | --- | --- |
| App icon | `icon-1280x720.png` | 1280×720 PNG, no transparency |
| Background | `background-1920x1080.png` | 1920×1080 |
| Screenshots | `screenshots/01-home.png` … | 1920×1080, 3–10 |

The screenshots are rendered from the TV app's shared UI (the same screens the Fire TV build runs) with the
fictional sample family, so they contain no real people's data.

**Title:** Hometide

**Short description:**
Your family's day on the big screen. See today's schedule, who's driving, chores and stars, dinner and the grocery
list at a glance, with a calm wall calendar when nobody's using the TV. Parents manage everything from their phone
or any browser, and approve changes and chore photos right from the TV.

**Long description:**
Hometide turns your Fire TV into the family command center.

Today at a glance: a morning briefing that spots conflicts ("Jordan is busy during Emma's pickup") and suggests who
can help, the day's events with who's involved, the weather, and what's next.

Calendar: day, week and month views for the whole family. Connect Google, iCloud or Outlook calendars from the
phone or web app.

Chores and rewards: kids see their chores and stars on the TV. Chores can ask for a photo, and a parent approves it
with a four-digit code.

Meals and lists: this week's dinners, recipes and a shared grocery list.

Wall calendar: after a couple of quiet minutes the TV shows a large, easy-to-read view of today.

Made for families: parents create the account and decide what's shown. Children don't need accounts or emails.
No ads and no tracking. Pair the TV in seconds: scan the QR code on the TV with your phone and tap Approve.

**Feature bullets:**
- Today's family schedule, conflicts and weather at a glance
- Chores, stars and rewards kids can see, with parent approvals on the TV
- Shared calendar with Google, iCloud and Outlook calendars
- Weekly meals and a shared grocery list
- Wall calendar mode when the TV is idle; no ads, no tracking

**Category:** Lifestyle (or Productivity). **Keywords:** family calendar, chores, chore chart, meal planner,
grocery list, family organizer, wall calendar.

## 5. Build number

Every upload must have a higher version. Before each build:

```powershell
npx.cmd -y corepack@0.34.0 yarn version:tv          # 1.0.0 -> 1.0.1 (or: yarn version:tv minor)
```

It updates `apps/vega/manifest.toml` and `apps/vega/package.json` (Vega) and `apps/expo-multi-tv/app.json`
(`version` and Android `versionCode`) together. The first store version is **1.0.0**.

Vega release package for the store (ARM sticks), built in the build VM and copied to `dist\` on this PC:

```powershell
.\familyos.ps1 package          # prints the path of the .vpkg to upload
```

It builds against `https://hometide.up.railway.app` (change it with `-ApiUrl`). The equivalent manual build inside
the VM is `EXPO_PUBLIC_FAMILYOS_API_URL=https://hometide.up.railway.app yarn build:vega`.

## 6. Older Fire TVs (Fire OS)

See [FIRE_OS_BUILD.md](FIRE_OS_BUILD.md).
