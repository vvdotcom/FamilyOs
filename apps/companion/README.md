# FamilyOS Companion (iOS / Expo)

This is the phone companion app, built with standard React Native and Expo SDK 57. It is
separate from `apps/expo-multi-tv`, which uses a TV-specific React Native runtime. The
current companion includes parent account creation, email-code verification, sign-in,
password reset, sign-out, saved server settings, and light/dark/system appearance. The
hosted account flow uses Cognito's email/password APIs directly, including in Expo Go.

## Start it

After sign-in, the companion opens **Today**, the hub: a "Needs you" card when voice requests,
chore photos, or reward requests are waiting, the day's agenda, dinner and groceries, and contextual
"Coming up at home" items (family night, the next game with unpacked gear, a movement break).
The five tabs are Today, Calendar, Chores (Chores | Rewards, with Rewards split into For kids |
Parent settings), Lists (Lists | Meals | Recipes), and Family (Family time, Your household, Account).
The + button offers a new event, an import from a flyer/email/file, or a new chore. Dates and times use
the native iOS pickers. Approving a chore, or a child finishing one, shows a short star celebration.
Dates are displayed/entered in the phone's timezone and stored as offset-aware timestamps.
Household data refreshes every 20 seconds while the app is active, on foreground, or with
pull-to-refresh. Stale writes are rejected; reload and reopen the latest item before editing.

More also holds Approvals (voice requests and chore photos), imports (camera, photo, PDF, `.eml`,
`.ics`, or pasted text, with editable review), Rewards, Photos (TV slideshow), Sports & carpools,
Family night, Move breaks, and Voice (Alexa+ connections and a labelled simulated Alexa+). TV pairing
works; remote-control buttons stay disabled (remote TV control is out of scope). Push notifications
and persistent offline caches are not implemented. Production households are not seeded with the
reference's fictional sample family.

New native modules (`expo-image-picker`, `expo-image-manipulator`, `expo-document-picker`,
`expo-file-system`) are pinned to SDK 57 versions that Expo Go includes, so no development build is
needed. Photos are downscaled and re-encoded on the phone, which drops EXIF/location data before upload.

### iOS test checklist (Phases 7-14)

0. Today → "Set up FamilyOS in 5 minutes": each step opens the right screen and is checked off when done. Family →
   Connected calendars: follow the Google steps to paste your "Secret address in iCal format" (or an iCloud public
   link or Outlook ICS link). The events appear in Calendar and on the TV. Tap one: it opens read-only. Try "Whose
   calendar", "Sync now", and "Disconnect".
1. Today: the "Needs you" card, agenda, dinner/groceries, and Coming up at home cards open the right screens.
2. Calendar: Day/Week/Month switch, the Filters button, and + → New event with a driver, a checklist, and "Repeat weekly".
3. + → From a flyer, email, or file: photograph a flyer (needs Bedrock on the server) or choose an `.ics`; edit and confirm.
4. Chores → Rewards → Parent settings: set the code and add a reward. Family → Hand this phone to a child; ask for the
   reward; unlock parent mode (banner shows "Parent unlocked"); approve in Today → Needs you; mark it given.
5. Chores: turn on "Verify with photo"; in child mode take the photo; approve it and see the star celebration.
6. Lists: add, check off; Edit to remove; Meals → "Review ingredients for Groceries".
7. Family → Photos: add, rotate, hide from TV, reorder, remove; watch the TV slideshow.
8. Family → Sports & carpools: a team with two drivers, then a weekly game; drivers rotate and gear appears on Today.
9. Family → Family night: start it, add ideas, vote as different members, close the vote, resolve a tie.
10. Family → Voice: connect, try the simulated Alexa+ ("Swap Emma pickup to Alex"), confirm on the TV.
11. Family → Settings: "Sign out everywhere".

Install the repository dependencies from the repository root, then run:

```powershell
npx.cmd -y corepack@0.34.0 yarn dev:companion
```

On a physical iPhone, sign in to the same Expo account in Expo Go and the terminal CLI
(`npx.cmd expo login`), then scan the QR code using the iPhone Camera app. SDK 57 is
supported by the current App Store Expo Go. If the phone cannot reach the development
server, stop it with Ctrl+C and run `npx.cmd -y corepack@0.34.0 yarn dev:companion:tunnel`.

## Local API setup

The app defaults to `https://familyos-api-production.up.railway.app`. Previously saved
server settings are preserved. For Expo Go local testing, open Settings and enter
`http://127.0.0.1:8787` only when the app and API share a device/network namespace
(for example, an iOS simulator). On a physical phone, enter the computer's private Wi-Fi address, such
as `http://192.168.1.20:8787`. For that local test only, start the API from
`services/family-agent` bound to the LAN:

```powershell
$env:FAMILYOS_AUTH_MODE = 'local'
$env:FAMILYOS_AUTH_DB_PATH = '.familyos/familyos-auth.sqlite3'
$env:FAMILYOS_LOCAL_AUTH_SHOW_CODES = 'true'
python -m uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload --env-file ..\..\.env
```

Use this only on a trusted home network, allow the port through the computer firewall only
for that private network, and stop the API when finished. This app permits HTTP only for
localhost/private-network development URLs; hosted addresses must use HTTPS.

The local API does not send email. Its development verification-code outbox is restricted
to loopback, so a physical phone cannot retrieve a code from the computer over Wi-Fi.
On the local API, Expo Go can exercise the account screens and local development auth.
Completing email verification on a physical phone still requires email delivery.

## Hosted iOS sign-in

When the saved API address is HTTPS, the companion sends sign-up, email verification,
sign-in, and password-reset requests directly to AWS Cognito over HTTPS. It uses the
public app client's enabled `USER_AUTH` flow with the `PASSWORD` preferred challenge.
No client secret or AWS credentials are included in the app. Passwords are not stored or
sent to the FamilyOS API. The verified Cognito ID token is exchanged for a revocable
FamilyOS session, which is saved in iOS SecureStore and sent as a bearer token.

This works in SDK 57 Expo Go without a custom callback, development build, or App Store
release. Cognito self-registration is enabled in AWS account `237320501162`, pool
`us-west-2_8isgUyBvQ`. Cognito delivers the verification email.
After verifying, sign in with the same email and password. Pending household names are
saved locally across the email-verification step; passwords are not.

Additional MFA challenges currently fail closed with an explanatory error; an MFA entry
screen is not implemented. Password reset changes Cognito credentials but does not yet
revoke existing FamilyOS sessions on other devices. Those security workflows remain
Phase 5 follow-up work.

## Installable iPhone preview

Run these commands from `apps/companion`, not the repository root (which has separate TV
build configuration):

```powershell
npx.cmd eas-cli login
npx.cmd eas-cli device:create
npx.cmd eas-cli build --platform ios --profile preview
```

This build is optional; Expo Go can also exercise the hosted account flow. The `preview`
profile produces an internal-distribution iPhone app with bundled JavaScript. It is not
an Expo Go session and does not submit to the
App Store. An Expo account, Apple Developer signing access, and device registration are
required. These cloud signing/build steps have not been completed. The separate
`preview-simulator` profile is for an iOS simulator on a Mac, not a physical iPhone.
See [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

Run auth regression tests from the repository root:

```powershell
node --test apps/companion/tests/*.test.cjs
```

## Compatibility

The app targets iOS (`com.familyos.companion`) and Android. SDK 57-compatible Expo modules
support both local preview and hosted Cognito email/password authentication in Expo Go.
No App Store release or custom development build is needed for this account flow.

## Design-only browser testing

From `apps/companion`, in a separate terminal:

```powershell
$env:EXPO_PUBLIC_FAMILYOS_DESIGN_PREVIEW = '1'
npx.cmd expo start --web --localhost --port 8132
```

This explicit development-only **web** switch renders the same native components with
labeled, in-memory sample data and no cloud writes. It is ignored on iOS and in production
builds. It is not an authentication bypass. Restarting/reloading resets the sample data.
The preview is phone-width on desktop. Do not put this switch in Railway variables.
