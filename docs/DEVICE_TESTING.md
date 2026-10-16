# Hometide: device testing

The status of every part of Hometide, the test record on a physical Fire TV Stick, and the remote-only regression on the Vega Virtual Device. Back to the [README](../README.md).

## Status and device testing

| Area | State |
|---|---|
| Family agent API (FastAPI, MCP, Strands, Bedrock, AgentCore Memory) | 200+ automated tests, plus MCP conformance checks that can run against the live service. Deployed on Railway in production mode (Cognito and Postgres). CI on every push ([`ci.yml`](../.github/workflows/ci.yml)) |
| AWS pieces as code ([`infra`](../infra)) | CDK stacks with assertion tests: AgentCore Memory, the API's IAM identity, Cognito |
| TV app on the Vega Virtual Device | Full remote-only regression on 2026-09-28 ([report below](#vega-virtual-device-regression-2026-09-28)). Calendar sync, the wall calendar, and that report's four recommendations were added afterward and are not yet re-run on the VVD |
| TV app on a physical Fire TV | Installed on a Fire TV Stick 4K Select (Vega OS) on 2026-10-03, and the demo path filmed on it with the real remote on 2026-10-07. Amazon's device scenarios and performance checks are still to do ([device test record](#fire-tv-device-test-record)) |
| TV app on Fire OS | The Fire OS build of the same screens ([`apps/expo-multi-tv`](../apps/expo-multi-tv)) installed and ran on an emulator |
| Companion web app | Built from the phone app's code and served by the API at `/app`; live at [hometide.up.railway.app/app](https://hometide.up.railway.app/app/) |
| Phone app (Expo, iOS) | Typecheck and browser previews pass; the iPhone checklist is in [apps/companion](../apps/companion/README.md) |
| Real-world use | Tried by three households of family and friends (8 people) on 2026-10-15; [both of their requests are built](../README.md#fixes-from-family-feedback). No public release yet |

### Fire TV device test record

Results on physical Fire TV hardware. Every row says how it was checked. Rows marked **Not yet checked** have no
device evidence yet and are not claimed.

#### Device and build

| Item | Value |
| --- | --- |
| Device | Fire TV Stick 4K Select (Vega OS) |
| Vega OS version | 2.0 |
| Remote | The remote that came with the Stick |
| Package | Release `armv7` `.vpkg` from `yarn build:vega` (`apps/vega/build/armv7-release`), app `com.hometide.tv`, component `com.hometide.tv.main`, version 1.0.0 |
| Vega SDK / CLI | 0.24.12112 (pinned in `apps/vega/vega-sdk-requirements.json`) / 1.4.2, target OS 1.2 |
| Built from | Commit `eab78c2` (2026-10-07) |
| API the build points to | `https://hometide.up.railway.app` (the hosted Hometide API on Railway) |
| Install | Sideloaded over Wi-Fi with `.\familyos.ps1 tv`: Developer Mode on the Stick ([friction log](./FRICTION_LOG.md) entries 20 and 21), then `vega exec vda connect <tv-ip>:5555`, `vega device install-app` and `vega device launch-app --appName com.hometide.tv.main` |
| Dates | First install 2026-10-03. Demo footage filmed on the Stick 2026-10-07 |

#### The demo path on the device

Checked by filming the TV screen with a camera while using the real remote, with the phone app alongside
(2026-10-07). The photos in [`docs/images/readme`](./images/readme) and the demo video come from this footage.

| Flow | Result | Evidence |
| --- | --- | --- |
| Install and launch | Pass (2026-10-03) | `familyos.ps1 tv` output |
| Pair by QR code: the TV shows a code, the phone scans it and taps Approve TV, the household appears | Pass | Demo video, "Set up by scanning the TV"; `images/readme/tv-settings-pairing.jpg` |
| A connected calendar's events appear on the TV | Pass | Demo video, "Set up by scanning the TV" |
| Home briefing and week calendar; the Tuesday pickup clash is flagged | Pass | `images/readme/tv-home.jpg`, `tv-week.jpg`; demo video, "It spots the snags" |
| A voice request (spoken into the phone app) becomes a proposal that is confirmed on the TV | Pass | Demo video, "Just ask" |
| *Hometide noticed*: the routine is offered, accepted with one press, and later weeks change | Pass | `images/readme/tv-hometide-noticed.jpg`; demo video, "Hometide noticed" |
| Flyer photo on the phone → reviewed draft → event on the TV calendar | Pass | Demo video, "Snap a flyer" |
| AI recipe → tonight's dinner on the TV's Meals screen | Pass | `docs/images/readme/web-recipe.jpg`; filmed 2026-10-07, not in the final cut |
| Chore photo → approval on the TV with the parent code → stars and rewards | Pass | `images/readme/tv-chore-approval.jpg`; demo video, "Chores and rewards" |
| Alexa ("Alexa, open home tide") changing what the TV shows | Didn't work: the remote's Alexa button didn't reach the in-development "home tide" skill. The skill works in the Alexa developer console's simulator | — |
| Wall calendar after the idle time (30-second demo build), with the weather scene and the Hometide note | Pass (2026-10-09) | Demo video, "A living wall" |
| Night clock (10 pm to 6 am) | Not yet checked | — |
| Wall weather scene plays through Vega's media player | Pass (2026-10-08 heat scene; 2026-10-09 clear night) | Photo of the TV; demo video, "A living wall" |
| Wall weather scene: the system screensaver stays away while the loop plays | Pass (2026-10-08) | [Friction log entry 14](./FRICTION_LOG.md#entry-14--vega-os-cannot-keep-the-display-on-for-a-non-media-app) |
| Remote-only pass over every screen: focus always visible, Back never traps | Demo path only; full pass not yet done | — |

#### Amazon's required device scenarios

From Amazon's Appstore checklist for Fire TV apps.

| Scenario | Result |
| --- | --- |
| Back and Home exit, then relaunch | Not yet checked |
| Switching to another app and back | Not yet checked |
| Reboot: the TV stays paired | Not yet checked (passes after an app restart on the VVD) |
| TV power off and on; HDMI unplugged and replugged | Not yet checked |
| Screensaver starts, then the app resumes | Not yet checked (while the wall's weather loop plays, the screensaver stays away; [entry 14](./FRICTION_LOG.md#entry-14--vega-os-cannot-keep-the-display-on-for-a-non-media-app)) |
| An Alexa request interrupts the app | Not yet checked |
| Bluetooth audio connected | Not yet checked |

#### Performance and display

| Check | Target | Result |
| --- | --- | --- |
| Memory in the foreground (Vega App KPI Visualizer, release build) | Under 400 MiB | Not yet measured on the Stick (levels off around 165 MB on the VVD) |
| Cold launch | First frame under 1.5 s, fully drawn under 8 s | Not yet measured |
| Key latency | Under 100 ms | Not yet measured |
| Overscan and title-safe margins, text readable from about 3 m, light and dark themes | — | Not yet checked |

### Vega Virtual Device regression (2026-09-28)

A remote-only regression on the Vega Virtual Device, run on an EC2 host before the physical Stick arrived. Hometide
was still called FamilyOS then, hence the package names.

This is a remote-only regression of the current FamilyOS TV app on the Vega Virtual Device (VVD).
Nothing here
claims physical-device validation; results on the real Fire TV Stick are in
[FIRE_TV_DEVICE_TEST.md](#fire-tv-device-test-record).

#### Environment

| Item | Value |
| --- | --- |
| Host | EC2 `c8i.2xlarge` `FamilyOS-VegaTest-20260923` (us-west-2), Ubuntu 24.04, nested virtualization |
| Display | Xvfb 1920x1080, Openbox, Mesa llvmpipe (`LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe`) |
| Vega SDK / CLI | 0.24.12112 / 1.4.2, target OS 1.2 |
| Package | `apps/vega/build/x86_64-release/vega_x86_64.vpkg`, app `com.familyos.tv`, component `com.familyos.tv.main` |
| Source | Working tree as of 2026-09-28 (uncommitted changes included), plus the fixes listed below |
| Backend (connected tests) | `services/family-agent` on the EC2 host at `127.0.0.1:8787`, demo mode, local auth, deterministic AI, live NWS weather (Tucson). Reached from the VVD with `vega device start-port-forwarding -p 8787 -f false` |

#### Automated checks (on the EC2 host)

| Check | Result |
| --- | --- |
| `yarn install` (adds the Vega AsyncStorage port) | Pass |
| `yarn typecheck` (shared UI, Expo TV, Vega) | Pass |
| `yarn workspace @familyos/vega lint` | Pass: 0 errors (241 existing Prettier warnings) |
| `yarn test` | Pass: Expo TV 15/15, Vega 20/20 |
| `yarn build:vega` (armv7, aarch64, x86_64) | Pass, manifest validation 0 errors |
| Backend `python -m pytest` | Pass |

#### Remote-only regression on the VVD

Keys were injected on the device with `inputd-cli button_press KEY_*`. Screens were captured from the
VVD window at 960x540, which is half of the 1920x1080 canvas.

| Area | Result |
| --- | --- |
| Install and launch (`vega run-app`, `vega device launch-app`) | Pass |
| Cold start to a fully rendered Home | About 2–3 s after `launch-app` returns (software GL) |
| Top navigation: Home, Calendar, Chores, Meals, Lists, Photos, Settings | Pass (D-pad and OK) |
| FamilyOS menu (the "f" button): Family, Approvals, Movement break, Family night | Pass |
| Back from any section returns to Home | Pass. Back on Home keeps the app open |
| Calendar week header and loading state | Fixed (see 1 and 2) |
| Meals week header | Fixed (see 1) |
| Settings at 1080p (unpaired and paired) | Fixed (see 3). Nothing clipped |
| Dark mode | Pass. Persists across app restarts after fix 4 |
| Chore check-off persists across app restarts | Pass after fix 4 |
| Pickup conflict: Fix pickup → Suggest → Confirm → Done, remote only | Pass after fix 6 (previously blocked) |
| Rapid D-pad (bursts of 6–8 presses at about 3/s) | Pass: focus tracks, stops at edges, no crash |
| Offline behavior (no backend) | Pass: "Weather unavailable", "Forecast unavailable", "Offline · local demo", deterministic briefing, "Pair this TV" prompts |
| Connected: live weather, family agent "Connected" | Pass |
| TV pairing: code shown, phone approval, household sync, paired Settings and Photos copy | Pass |
| Pairing survives an app restart | Pass after fix 4 |
| Unpair this TV | Works, but with a single OK and no confirmation (see recommendations) |

Not covered on the VVD: Alexa+ voice, companion-phone UI (the phone was simulated with API calls),
chore-photo verification with real images, Bedrock briefings, memory measurement (the app sandbox
hides process RSS), and real-hardware performance, overscan, and HDMI output.

#### Problems found and fixed

1. **Weekday labels (Vega-only).** With only `weekday` requested, `toLocaleDateString` returns
   `SUN, 9/20/2026` on Vega, so the Calendar and Meals headers overlapped. `calendarDays` now uses a
   fixed `SUN`–`SAT` table. (`FamilyCalendarScreen.tsx`)
2. **Calendar stuck on "Loading calendar…" (all platforms).** The calendar and briefing effects shared
   one request counter, so the briefing effect always invalidated the calendar result. The calendar now
   has its own counter. (`FamilyOsShell.tsx`)
3. **Settings overflowed the 1080p canvas.** "Reset demo household" was clipped below the screen.
   Settings now uses three panels (Household and TV connection, Appearance, About) and each panel is a
   vertical navigation group. (`FamilySettingsScreen.tsx`)
4. **Nothing persisted on Vega.** Pairing token, theme, and the local household were memory-only on
   native, so every app restart unpaired the TV and reset chores. Added a small native store backed by
   `@amazon-devices/react-native-async-storage__async-storage` on Vega (in-memory elsewhere).
   (`storage/nativeStore*.ts`, `tvDeviceSession.ts`, `householdStorage.ts`, `FamilyTheme.tsx`,
   `FamilyOsShell.tsx`)
5. **D-pad dead for a whole session on some launches (Vega).** The remote was configured in a
   `useEffect`, after the navigation roots had mounted. It is now configured at module load.
   (`apps/vega/src/navigation/VegaAppNavigator.tsx`, plus a `mitt` path in `apps/vega/tsconfig.json`)
6. **Overlays did not receive remote focus.** The pickup review dialog left focus on "Fix pickup"
   behind it, so the pickup could not be confirmed with the remote. The parent-code pads in Settings and
   Approvals had two active navigation roots. Added `ModalFocusRoot`, which locks the page and gives the
   overlay its own root. (`components/ModalFocusRoot.tsx`, `FamilyHomeScreen.tsx`,
   `FamilySettingsScreen.tsx`, `FamilyTVFeatures.tsx`)
7. **Honest storage copy.** Lists said "Saved on this browser" on the TV. Lists now says "Demo lists"
   or "Synced with your family", and Settings states what is saved on the TV.

The Vega Jest mocks gained `useLockSpatialNavigation`, and `yarn.lock` includes the new dependency.

#### Recommendations (not changed)

- **Confirm before unpairing.** "Unpair this TV" acts on a single OK, and re-pairing needs the phone.
- **Label live weather correctly.** Settings shows "Demo ready" for a live provider; "Live" would be clearer.
- **Map the remote's Menu (≡) button** to the FamilyOS menu. The `menu` event isn't mapped today.
- **Reserve the 1080p safe margin on Movement break.** The routine cards end about 1040 px down.
- **Run this checklist again on real Fire TV hardware in Phase 15**, including overscan, HDMI color,
  and remote latency.

##### Follow-up, 2026-09-29 (code changes; not yet re-run on the VVD)

- Unpair now asks first: **Keep this TV paired** is the default, and **Unpair** is a separate choice.
- Settings shows **Live · Tucson, AZ** for the National Weather Service forecast and **Live** for a paired
  household calendar (**Demo** otherwise).
- The Vega `menu` event (and Android key code 82) opens and closes the FamilyOS menu.
- The Movement break routine picker keeps a 20 px bottom margin like the other screens, ending about 1020 px down.

Jest covers the unpair confirmation and the live label (`apps/vega/test/family-experience.test.tsx`).
The Menu button needs a VVD or hardware run to confirm the `menu` event name.

##### Hosted backend run, 2026-09-29 (Railway, VVD)

Source synced from the working tree at 21:17 MST. The TV app was built with
`EXPO_PUBLIC_FAMILYOS_API_URL=https://familyos-api-production.up.railway.app` and installed on the VVD.

| Check | Result |
| --- | --- |
| `yarn typecheck`, Vega lint, `yarn test`, backend `pytest` | Pass: lint 0 errors (266 warnings), Expo TV 15/15, Vega 27/27 |
| Backend URL baked into the Vega bundle | Pass after fix 8: bundle contains the Railway URL, no `127.0.0.1:8787`, no `process.env` reference |
| VVD reaches Railway over the internet | Pass: `/health` from the device, and TV pairing codes come from Railway |
| Railway `/health` | `ai_provider: bedrock`, `bedrock_configured: true`, `weather_configured: false` |
| Menu (≡) button | Pass: `inputd-cli button_press KEY_MENU` arrives as the `menu` event and toggles the FamilyOS menu. When the Wall calendar is showing, the first press only closes the Wall |
| Wall calendar | Pass: appears after 2 idle minutes, any button returns to the previous screen |
| Movement break bottom margin | Pass: routine cards end about 1020 px down |
| Unpaired Settings | Fixed (see 11): shows "Reachable · not paired" when Railway answers but the TV is unpaired; "Offline · local demo" only when the service cannot be reached |
| Memory (device `MemAvailable`, app stopped vs running) | Home after launch about 93–102 MB. Rises with page changes and levels off at about 165 MB (see "Memory follow-up" below). Idle stays flat, and closing the app returns it to baseline |
| Pairing with a real phone, paired household, Bedrock briefing on the TV, chore approval | Not run yet: needs the owner's signed-in phone (Cognito) |

8. **Every Vega build called `127.0.0.1:8787`.** Vega's Metro preset does not inline `EXPO_PUBLIC_*`
   variables, so `process.env.EXPO_PUBLIC_FAMILYOS_API_URL` was undefined at runtime on the TV. A small Babel
   plugin in `apps/vega/babel.config.js` now inlines it at build time (clear Metro's cache after changing it).
9. **The Wall calendar covered the pairing code.** After 2 idle minutes the Wall replaced Settings while
   the 10-minute code was still needed. The Wall now waits while a code is being created or shown.
   (`FamilyOsShell.tsx`)
10. **Voice replies spoke the model's reasoning.** Nova can prefix tool-use answers with `<thinking>` notes,
    and `/v1/voice/simulate` returned them. They are stripped before the reply is returned.
    (`services/family-agent/app/voice.py`, test in `tests/test_voice_mcp.py`)
11. **"Offline" when the TV was only unpaired.** The shell now checks `/health` separately. If the service
    answers but refuses the unpaired TV (401/403), Settings says **Reachable · not paired**, and pickup
    proposals stay local until the TV is paired. (`FamilyOsShell.tsx`, `FamilySettingsScreen.tsx`,
    `familyTypes.ts`; Jest test in `apps/vega/test/family-experience.test.tsx`)
12. **Back listeners re-registered on every render.** `useBackToHome` removed and re-added its
    `BackHandler` and remote listeners on each key press. It now registers once and reads the latest
    page through a ref (Jest test added). Per-key `console.log` calls in the Kepler remote manager now run
    only in development builds.

Recommendations from this run:

- **Confirm the memory ceiling on Fire TV hardware** with the Vega memory tools. On the VVD it levels off
  at about 165 MB (see below); a real device may size its JavaScript heap differently.
- **Railway weather is off.** Set `FAMILYOS_WEATHER_*`; the forecast is one location for the whole server.

###### Memory follow-up, 2026-09-30

Measured on the VVD as device `MemAvailable` below the app-stopped baseline, Railway build:

| Test | Result |
| --- | --- |
| Moving focus along the top bar only (104 key presses, no page change) | +3 MB: key presses alone do not add memory |
| 8 round trips Home → page → Home | Calendar +30 MB, Lists +16, Chores +14, Settings +12, Meals +10, Photos +4 |
| 30 round trips Home → Calendar | 95, 122, 138, 155, 165, 166 MB after 0, 6, 12, 18, 24, 30 trips: levels off |
| Same, with the top-bar pages kept mounted instead of rebuilt (experiment) | 94, 135, 153, 164, 165 MB: same ceiling, so rebuilding views is not the cause |

Growth tracks how much rendering a page does and stops at about 165 MB, which matches the JavaScript
runtime growing its heap to a working size rather than an unbounded leak. The keep-mounted experiment
was reverted because it changed page behaviour without lowering the ceiling. Fix 12 removes listener
churn but does not change the ceiling.

#### Reproduce

1. Start the VVD and install with `vega run-app`.
2. Drive the app with `setup/vvd-remote-shot.sh NAME STEP...`. Steps are `UP|DOWN|LEFT|RIGHT|ENTER|BACK`,
   `wN`, `cap`, `relaunch`, and `burst:KEY:N`. It writes a contact sheet to `/tmp/NAME.jpg`.

