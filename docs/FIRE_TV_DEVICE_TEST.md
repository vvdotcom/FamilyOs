# Fire TV device test record

Results on physical Fire TV hardware. The [Vega Virtual Device report](./VEGA_VVD_TEST_REPORT.md) covers the
emulator; this record covers the real Stick and remote. Every row says how it was checked. Rows marked
**Not yet checked** have no device evidence yet and are not claimed.

## Device and build

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

## The demo path on the device

Checked by filming the TV screen with a camera while using the real remote, with the phone app alongside
(2026-10-07). The photos in [`images/readme`](./images/readme) and the demo video come from this footage.

| Flow | Result | Evidence |
| --- | --- | --- |
| Install and launch | Pass (2026-10-03) | `familyos.ps1 tv` output |
| Pair by QR code: the TV shows a code, the phone scans it and taps Approve TV, the household appears | Pass | Demo video, "Set up by scanning the TV"; `images/readme/tv-settings-pairing.jpg` |
| A connected calendar's events appear on the TV | Pass | Demo video, "Set up by scanning the TV" |
| Home briefing and week calendar; the Tuesday pickup clash is flagged | Pass | `images/readme/tv-home.jpg`, `tv-week.jpg`; demo video, "It spots the snags" |
| A voice request (spoken into the phone app) becomes a proposal that is confirmed on the TV | Pass | Demo video, "Just ask" |
| *Hometide noticed*: the routine is offered, accepted with one press, and later weeks change | Pass | `images/readme/tv-hometide-noticed.jpg`; demo video, "Hometide noticed" |
| Flyer photo on the phone → reviewed draft → event on the TV calendar | Pass | Demo video, "Snap a flyer" |
| AI recipe → tonight's dinner on the TV's Meals screen | Pass | Demo video, "Dinner, sorted" |
| Chore photo → approval on the TV with the parent code → stars and rewards | Pass | `images/readme/tv-chore-approval.jpg`; demo video, "Chores and rewards" |
| Alexa ("Alexa, open home tide") changing what the TV shows | Didn't work: the remote's Alexa button didn't reach the in-development "home tide" skill. The skill works in the Alexa developer console's simulator | — |
| Wall calendar after the idle time (30-second demo build), with the weather scene and the Hometide note | Pass (2026-10-09) | `Video/IdleMode.MOV`; demo video V6, "A living wall" |
| Night clock (10 pm to 6 am) | Not yet checked | — |
| Wall weather scene plays through Vega's media player | Pass (2026-10-08 heat scene; 2026-10-09 clear night) | Photo of the TV; `Video/IdleMode.MOV` |
| Wall weather scene: the system screensaver stays away while the loop plays | Pass (2026-10-08) | [Friction log entry 14](./FRICTION_LOG.md#entry-14--vega-os-cannot-keep-the-display-on-for-a-non-media-app) |
| Remote-only pass over every screen: focus always visible, Back never traps | Demo path only; full pass not yet done | — |

## Amazon's required device scenarios

From the Appstore checklist in [FIRE_TV_APPSTORE.md](./FIRE_TV_APPSTORE.md).

| Scenario | Result |
| --- | --- |
| Back and Home exit, then relaunch | Not yet checked |
| Switching to another app and back | Not yet checked |
| Reboot: the TV stays paired | Not yet checked (passes after an app restart on the VVD) |
| TV power off and on; HDMI unplugged and replugged | Not yet checked |
| Screensaver starts, then the app resumes | Not yet checked (the screensaver can't be prevented; [entry 14](./FRICTION_LOG.md#entry-14--vega-os-cannot-keep-the-display-on-for-a-non-media-app)) |
| An Alexa request interrupts the app | Not yet checked |
| Bluetooth audio connected | Not yet checked |

## Performance and display

| Check | Target | Result |
| --- | --- | --- |
| Memory in the foreground (Vega App KPI Visualizer, release build) | Under 400 MiB | Not yet measured on the Stick (levels off around 165 MB on the VVD) |
| Cold launch | First frame under 1.5 s, fully drawn under 8 s | Not yet measured |
| Key latency | Under 100 ms | Not yet measured |
| Overscan and title-safe margins, text readable from about 3 m, light and dark themes | — | Not yet checked |

## How to fill in the rest

1. Read the OS version in Settings → My Fire TV → About, and the commit on the build VM.
2. Work down the scenario table with the remote, and write Pass or the problem in each row.
3. Measure the three performance numbers with the Vega App KPI Visualizer on a release build.
4. Log anything Vega-specific in the [friction log](./FRICTION_LOG.md).
