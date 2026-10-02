# Hometide web app (iPhone, Android, desktop browsers)

The phone companion in `apps/companion` also runs in a browser. Families can try Hometide without
installing anything: open the link on any phone, sign in, and optionally add it to the home screen.
It is the same React Native code as the iOS app (via `react-native-web`), so screens and features
match the phone app.

**Link once deployed:** `https://hometide.up.railway.app/app/`
(`/` redirects there when the web app is present).

## How it is built and served

- `yarn build:web-app` (repository root) runs `expo export --platform web` for `apps/companion` and
  writes the static site to `services/family-agent/app/webapp/`.
- The FastAPI service serves that folder at **`/app`**, on the API's own origin. The web app always
  talks to the origin it was opened from, so no CORS settings are needed and sessions never leave
  that origin. The server field in Settings is hidden on the web.
- `app/webapp/` is generated output. Rebuild it before each deploy; the Dockerfile already copies
  everything under `app/`, so `railway up` from `services/family-agent` ships it.
- `apps/companion/public/` holds the HTML template, the web app manifest, icons, and a small CSS
  file. On wide screens the app is shown at phone width.

### Deploy

```powershell
npx.cmd -y corepack@0.34.0 yarn build:web-app
cd services\family-agent
railway up
```

Then open `/app/` on the deployed service. No new Railway variables are required.

## Sign-in and sessions on the web

- Hosted accounts work as on the phone: passwords go straight to Amazon Cognito
  (`cognito-idp.<region>.amazonaws.com`), and the Cognito ID token is exchanged for an opaque
  Hometide session.
- By default the session lives in the tab's `sessionStorage` and is gone when the tab or home-screen
  app closes. **Keep me signed in on this device** (sign-in screen) moves it to `localStorage` on that
  browser until the parent signs out. Settings states which one is active.
- Browser storage can be read by scripts on the page, so `/app` responses carry a strict
  Content-Security-Policy (`script-src 'self'`, no inline or third-party scripts, `connect-src` limited
  to this API and Cognito, `frame-ancestors 'none'`), plus `nosniff`, `no-referrer`, a
  `Permissions-Policy` allowing camera and location for this site only, and HSTS in production.
  Bundles are cached for a year (their names contain content hashes); `index.html` is `no-cache`.

## Phone features in the browser

| Feature | Web behaviour |
| --- | --- |
| Date and time fields | Native browser pickers (`<input type="date">` / `type="time"`), which open the phone's own wheels |
| Chore photos and photo imports | Browser camera or photo library (`expo-image-picker` web), downscaled and re-encoded to JPEG before upload |
| PDF, `.eml`, `.ics` imports | Browser file picker, read with `FileReader` |
| Weather location | "Use my location" with the browser's location prompt. City search is phone-only for now |
| Child mode, approvals, TV pairing, lists, meals, calendar | Same as the phone app |
| Push notifications, offline cache | Not available (also not in the phone app yet) |

## Add to home screen

- **iPhone (Safari):** Share → Add to Home Screen. It opens full screen with the Hometide icon.
- **Android (Chrome):** menu → Install app (or Add to Home screen).

There is no service worker yet, so the app needs a connection to open.

## Local preview

`yarn dev:companion`, then press `w`. The development preview still uses a local API by default
(`http://127.0.0.1:8787`) and keeps the server field in Settings. Because `app.json` sets
`experiments.baseUrl` to `/app`, the preview is served under `/app` as well.
To test the production web build locally, run `yarn build:web-app`, start the API in local auth mode,
and open `http://127.0.0.1:8787/app/`.
