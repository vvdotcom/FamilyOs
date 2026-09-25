# FamilyOS iPhone companion (initial native slice)

This is a native SwiftUI iPhone app for the Phase 5 parent-account flows: create an
account, verify the email code, sign in, recover a password, and sign out. It uses the
FamilyOS warm cream/navy/amber palette and the same Figtree and Bricolage fonts as the
phone-sized web companion. Light, dark, and system appearance are available in Settings.

The initial version talks to the existing **local development API only**. It is not
connected to AWS Cognito, production email delivery, cloud household storage, or Railway.
The repository deliberately blocks public Railway startup until those production pieces
are implemented and secured.

## Open and run

Open `FamilyOSCompanion.xcodeproj` on a Mac with Xcode 15 or later, choose an iPhone
simulator, then Run. The simulator's default API address is `http://127.0.0.1:8787`.
Start the local API on that Mac first. In the app's Settings, enter the Mac's private
Wi-Fi address (for example `http://192.168.1.20:8787`) to use a development server that
is reachable from a physical iPhone. For a temporary local test, start Uvicorn with
`--host 0.0.0.0 --port 8787` and allow the connection through the computer firewall.
Use only a trusted home Wi-Fi network for that cleartext local test, and stop the server
when finished. Use HTTPS for any hosted server.

Email is not sent in local mode. The app displays the one-time test code only when it can
reach the API's loopback-only development outbox; a physical phone using a LAN address
cannot read that outbox. Live email verification requires the later Cognito/email setup.

Xcode, the iOS simulator, signing, and a Mac are required to compile/install this app.
They are not available in the current Windows workspace, so the project must still be
built and visually checked on a Mac before calling the iOS slice verified.

The app stores its opaque session cookie in iOS Keychain, restricts cleartext HTTP to
private/local development hosts, and uses HTTPS for other server addresses. It does not
store passwords.
