# Publishing Hometide on the Amazon Appstore (Fire TV, Vega OS)

The ready-to-paste submission kit is in [APPSTORE_SUBMISSION.md](APPSTORE_SUBMISSION.md); the Fire OS build is in
[FIRE_OS_BUILD.md](FIRE_OS_BUILD.md).

Research as of October 2026, from Amazon's developer documentation (sources at the end). Items Amazon
does not document are marked **unverified**.

## Where Hometide stands

| Requirement | Status |
| --- | --- |
| `.vpkg` release build | Ready: `yarn build:vega` produces `apps/vega/build/armv7-release/…_armv7.vpkg` (Fire TV Sticks are ARM; the x86_64 build is only for the Virtual Device) |
| Manifest registers `com.amazon.category.main` (otherwise it cannot launch from Home and fails submission) | Done (`apps/vega/manifest.toml`) |
| Increasing build number for every upload | Done: version 1.0.0; run `yarn version:tv` before each upload (see APPSTORE_SUBMISSION.md) |
| Backend URL baked into the build | Fixed: `EXPO_PUBLIC_FAMILYOS_API_URL=https://… yarn build:vega` (see `docs/VEGA_VVD_TEST_REPORT.md`, fix 8) |
| Tested on a real Fire TV Stick before submitting (Amazon requires this) | **Not done.** Only the Vega Virtual Device so far |
| Required scenarios on hardware: Back/Home exit and relaunch, app switching, HDMI hot-plug, TV power, reboot keeps the user signed in, screensaver, Alexa interruptions, Bluetooth audio | **Not done.** Pairing already survives an app restart on the VVD; reboot must be checked on hardware |
| Performance targets (Vega App KPI Visualizer, release build): memory under 400 MiB foreground; cold launch to first frame under 1.5 s and fully drawn under 8 s; key latency under 100 ms | Likely fine for memory (levels off around 165 MB on the VVD). Launch and latency must be measured on a Stick |
| D-pad: visible focus everywhere, Back never traps the user | Covered on the VVD (see test report) |
| Store listing assets | Done: `store-listing/fire-tv/` and the copy in APPSTORE_SUBMISSION.md |
| Privacy policy URL and privacy-label questionnaire | Page done (`/privacy`); questionnaire answers follow it |
| Web link for account and data deletion (required for new apps since June 2025; must work without the app) | Done: `/delete-account`, plus self-service deletion in the app and web app |
| Content-rating questionnaire and audience declaration (0–12, 13–15, 16+) | Recommended answers in APPSTORE_SUBMISSION.md |
| Test credentials for Amazon's reviewers | Kit ready: create the account, run `setup/seed-reviewer-household.py`, paste the Testing Instructions |

## Decisions to make before submitting

1. **Children's data.** Hometide stores children's names, chores, events and chore photos. If you pick a
   child audience, Amazon treats the app as child-directed: verifiable parental consent before collecting
   children's data (under 13; under 16 in the EU, Australia and Japan), no Amazon ads in child sections, and
   COPPA-compliant SDKs only. Positioning it as a parent-run household app (16+) still needs an accurate
   privacy policy that explains how parents add and remove children's profiles and photos.
2. **How reviewers sign in.** The TV pairs with a signed-in phone, and Amazon's rule is that every sign-in
   path must work for the tester. Options:
   - give reviewers a test parent account and point them to the **web app** (`/app/`) to approve the
     6-digit TV code. No app install is needed, which is the strongest reason to ship the web app first;
   - or a pre-paired demo household for review.
   Put the account and step-by-step pairing instructions in the Testing Instructions field.
3. **Developer account.** An Amazon Developer account (no annual fee, according to Amazon staff) with tax
   information. Amazon describes Vega tools as open to all developers, but I could not find an official
   statement that Vega **submission** is generally available to everyone (**unverified**).

## Steps

1. Buy a Vega Fire TV device: Fire TV Stick HD, Fire TV Stick 4K Select, or Fire TV Streaming Media Player.
2. Build the ARM release `.vpkg` with the production API URL, install it, and run the required
   scenarios above.
3. Measure launch, memory and key latency with the Vega App KPI Visualizer on that device.
4. Publish a privacy policy page and an account/data deletion page.
5. Create the listing assets and fill in the content rating, audience and privacy questionnaires.
6. In the Developer Console, create the app, choose Fire TV → Amazon Vega TV as target devices, choose
   countries (not every Vega device is sold everywhere), upload the `.vpkg`, add reviewer credentials and
   pairing steps, and submit.
7. Review typically takes a few days (Amazon staff quote 3–5). The app goes live a few hours after
   approval and your chosen publish time.

## Older Fire TVs (Fire OS, Android-based)

Most Fire TVs in homes today run Fire OS (Android), not Vega. Reaching them needs a separate Android
build (APK/AAB) — the React Native for Vega app does not build for Android. `apps/expo-multi-tv` is a
React Native TV app that could be the starting point. Requirements there: touchscreen declared
not required, no Google Play Services (so no Firebase), Android 9 (API 28) or later. A Fire OS build
can share one store listing with the Vega build if both use the same package name.

## Sources

- Vega app submission: https://developer.amazon.com/docs/vega/0.24/app-submission.html
- Test before submission: https://developer.amazon.com/docs/vega/0.24/test-before-submission
- App KPIs: https://developer.amazon.com/docs/vega/0.24/measure-app-kpis
- Build and run on devices: https://developer.amazon.com/docs/vega/0.24/build-an-app and https://developer.amazon.com/docs/vega/0.24/run-apps
- Test criteria: https://developer.amazon.com/docs/app-testing/test-criteria.html
- Store listing details: https://developer.amazon.com/docs/app-submission/appstore-details.html
- Targeting, content rating, privacy: https://developer.amazon.com/docs/app-submission/target-app.html
- Children's privacy: https://developer.amazon.com/docs/policy-center/privacy-children.html
- Account and data deletion: https://developer.amazon.com/docs/app-submission/user-account-and-data-deletion.html
- Review and submit: https://developer.amazon.com/docs/app-submission/review-submit.html
- Vega announcement: https://developer.amazon.com/apps-and-games/blogs/2025/09/announcing-vega-os
- Fire OS differences: https://developer.amazon.com/docs/fire-tv/differences-from-android-tv-development.html
- Developer account fees (Amazon community staff): https://community.amazondeveloper.com/t/amazon-developer-console-account-and-publishing-requirements/11698
- Review time (Amazon community): https://community.amazondeveloper.com/t/how-long-should-it-take-for-amazon-to-review-my-app/2238
