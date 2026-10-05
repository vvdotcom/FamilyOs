# Hometide for older Fire TVs (Fire OS, Android-based)

Most Fire TV devices in homes run Fire OS, which is Android-based. The Vega build (`apps/vega`) only runs on Vega OS
devices. Fire OS needs an Android APK, built from `apps/expo-multi-tv`: the same shared TV screens
(`packages/shared-ui`) on React Native for TV.

**Status:** **built and tested on the Android TV emulator** (4 Oct 2026). Release APKs were built on the EC2 build
host (AWS account 237320501162) and run on an Android 11 TV emulator (1920×1080). Remote keys only: Menu opens the
menu, D-pad and Select reach Home, Calendar, Chores, Meals, Lists and the wall calendar. A new install starts empty
and asks to be paired; Pair this TV shows the QR code and pairing code. Screenshots are in
`store-listing/fire-tv/screenshots/fireos/`. **Not yet tested on a physical Fire OS device.**

## What is set up

| Item | Where |
| --- | --- |
| Package name `com.hometide.tv` (the same as the Vega app, so both binaries can share one store listing) | `apps/expo-multi-tv/app.json` |
| Version `1.0.0`, Android `versionCode` 1, bumped with `yarn version:tv` | `app.json`, `setup/bump-tv-version.cjs` |
| TV launcher entry and banner (`@react-native-tvos/config-tv`), touchscreen and leanback declared as not required (`plugins/withFireTV.js`) | `app.json` plugins |
| Only the `INTERNET` permission | `app.json` |
| Pairing, theme and household kept across reboots (AsyncStorage; Amazon checks that a reboot keeps the user signed in) | `packages/shared-ui/src/storage/nativeStore.android.ts` |
| Backend address baked in at build time | `eas.json` profile `firetv` (`EXPO_PUBLIC_FAMILYOS_API_URL`) |
| No Google Play Services (not available on Fire TV) | Nothing in the app uses them |

## Build

1. Install dependencies (adds `@react-native-async-storage/async-storage` to the lockfile):
   `npx.cmd -y corepack@0.34.0 yarn install`
2. Sign in to Expo once: `npx.cmd eas-cli login` (free account).
3. Build the APK in Expo's cloud: `npx.cmd -y corepack@0.34.0 yarn build:firetv`
   (runs `eas build --platform android --profile firetv` in `apps/expo-multi-tv`; first run creates the Android
   signing key and stores it with Expo; keep that account, because every update must be signed with the same key).
4. Install on a Fire TV: Settings → My Fire TV → Developer options → ADB debugging on, then
   `adb connect <tv-ip>` and `adb install familyos.apk`.

### Build without EAS (what the emulator test used)

With JDK 17, Node 20 and the Android SDK (platform 36, build-tools 36.0.0), from `apps/expo-multi-tv`:

```bash
export EXPO_TV=1 EXPO_PUBLIC_FAMILYOS_API_URL=https://hometide.up.railway.app
npx expo prebuild --platform android --clean --no-install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a)
```

The APK is `android/app/build/outputs/apk/release/app-release.apk`. This local build is signed with the debug key,
so it is for testing only; the store APK should come from `yarn build:firetv` (EAS keeps the upload key). Add
`EXPO_PUBLIC_HOMETIDE_SAMPLE=1` only for screenshot builds that should show the sample family.

If the build reports version mismatches, run `npx.cmd expo install --fix` in `apps/expo-multi-tv`: its
`package.json` mixes Expo SDK 54 with some SDK 52 packages (`@expo/metro-runtime`, `expo-font`, …).

## Test on the device

The same list as the Vega checks: D-pad focus everywhere, Back never traps, Menu opens the menu, pairing with
the web app, reboot keeps the pairing, HDMI and power changes, screensaver, Alexa interruptions. Also check text
size and overscan on a 1080p TV.

## Submit

In the Developer Console, open the same Hometide app, add the APK on the **Binary files** page, and target the
Fire TV (Fire OS) devices. The Vega `.vpkg` and the APK can share the listing because both use `com.hometide.tv`.
