# Vega Virtual Device regression — 2026-09-28

This is a remote-only regression of the current FamilyOS TV app on the Vega Virtual Device (VVD).
It does **not** replace the Phase 6 and Phase 15 checks on real Fire TV hardware. Nothing here
claims physical-device validation.

## Environment

| Item | Value |
| --- | --- |
| Host | EC2 `c8i.2xlarge` `FamilyOS-VegaTest-20260923` (account 237320501162, us-west-2), Ubuntu 24.04, nested virtualization |
| Display | Xvfb 1920x1080, Openbox, Mesa llvmpipe (`LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe`) |
| Vega SDK / CLI | 0.24.12112 / 1.4.2, target OS 1.2 |
| Package | `apps/vega/build/x86_64-release/vega_x86_64.vpkg`, app `com.familyos.tv`, component `com.familyos.tv.main` |
| Source | Working tree as of 2026-09-28 (uncommitted changes included), plus the fixes listed below |
| Backend (connected tests) | `services/family-agent` on the EC2 host at `127.0.0.1:8787`, demo mode, local auth, deterministic AI, live NWS weather (Tucson). Reached from the VVD with `vega device start-port-forwarding -p 8787 -f false` |

## Automated checks (on the EC2 host)

| Check | Result |
| --- | --- |
| `yarn install` (adds the Vega AsyncStorage port) | Pass |
| `yarn typecheck` (shared UI, Expo TV, Vega) | Pass |
| `yarn workspace @familyos/vega lint` | Pass: 0 errors (241 existing Prettier warnings) |
| `yarn test` | Pass: Expo TV 15/15, Vega 20/20 |
| `yarn build:vega` (armv7, aarch64, x86_64) | Pass, manifest validation 0 errors |
| Backend `python -m pytest` | Pass |

## Remote-only regression on the VVD

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

## Problems found and fixed

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

## Recommendations (not changed)

- **Confirm before unpairing.** "Unpair this TV" acts on a single OK, and re-pairing needs the phone.
- **Label live weather correctly.** Settings shows "Demo ready" for a live provider; "Live" would be clearer.
- **Map the remote's Menu (≡) button** to the FamilyOS menu. The `menu` event isn't mapped today.
- **Reserve the 1080p safe margin on Movement break.** The routine cards end about 1040 px down.
- **Run this checklist again on real Fire TV hardware in Phase 15**, including overscan, HDMI color,
  and remote latency.

## Reproduce

1. Start the VVD (see `docs/VEGA-AWS-DISPLAY.md`) and install with `vega run-app`.
2. Drive the app with `setup/vvd-remote-shot.sh NAME STEP...`. Steps are `UP|DOWN|LEFT|RIGHT|ENTER|BACK`,
   `wN`, `cap`, `relaunch`, and `burst:KEY:N`. It writes a contact sheet to `/tmp/NAME.jpg`.
