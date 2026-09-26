# FamilyOS Companion (iOS / Expo)

This is the phone companion app, built with standard React Native and Expo SDK 57. It is
separate from `apps/expo-multi-tv`, which uses a TV-specific React Native runtime. The
current companion includes parent account creation, email-code verification, sign-in,
password reset, sign-out, saved server settings, and light/dark/system appearance. The
hosted account flow uses Cognito's email/password APIs directly, including in Expo Go.

## Start it

After sign-in, the companion now opens the Today screen, not the account-only placeholder.
The four bottom tabs follow the user's Claude phone design. Calendar events, family
profiles, chores, shared lists, and simple meals can be edited against the hosted API.
Dates are displayed/entered in the phone's timezone and stored as offset-aware timestamps.
Household data refreshes every 20 seconds while the app is active, on foreground, or with
pull-to-refresh. Stale writes are rejected; reload and reopen the latest item before editing.

TV pairing/control, TV pop-ups, push notifications, event recurrence, photo uploads,
and persistent offline caches are **not** implemented by this UI slice. The Remote screen
matches the reference layout but honestly shows no connected TV and disables commands.
Production households are not seeded with the reference's fictional sample family.

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
