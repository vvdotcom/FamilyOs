# FamilyOS

FamilyOS turns Fire TV into a shared family command center that understands the household
schedule, identifies conflicts, prepares people for upcoming events, and presents safe
actions that can be confirmed with a TV remote.

The implementation contract is [single.md](./single.md). The fifteen-phase delivery plan starts
at [docs/phases/README.md](./docs/phases/README.md).

## Current status

Phases 1–4 have local implementations. Phase 5 is in progress: the parent-account flow can be
tested with a local-only identity simulator, and the family-agent service has Railway Docker
build preparation. AWS Cognito, Railway/GitHub auto-deploy, PostgreSQL household persistence,
and live companion sign-in are not complete. The repository is based on
Amazon's official React Native multi-TV sample and retains its Expo/web, Fire OS/Android TV,
shared UI, and Vega app targets.
Ubuntu provisioning, Vega SDK installation, and release package builds are verified.
VVD is currently blocked by unavailable nested KVM acceleration; no device run is claimed.
See [the build artifacts](./artifacts/vega/README.md) and [Phase 1 notes](./docs/phases/phase-1-foundation.md).

## Quick checks

The local TV UI now follows the supplied **Family Calendar for Fire TV** design,
including its bundled Figtree and Bricolage Grotesque fonts and light/dark themes.
See [design fidelity and local preview tests](./docs/design-reference.md) for the
implemented screens, preview commands, and remaining device-validation work.

```powershell
.\setup\verify-host.ps1
.\familyos.ps1 status
```

After dependencies are installed:

```powershell
npx -y corepack@0.34.0 yarn install
npx -y corepack@0.34.0 yarn dev:web
npx -y corepack@0.34.0 yarn typecheck
```

Node distributions that still bundle Corepack may use ordinary `yarn` commands after
`corepack enable` instead.

## Local family agent

The TV preview uses a local FastAPI service at `http://127.0.0.1:8787`. Configure the
ignored root `.env` from `.env.example`, then follow the Windows or macOS/Linux setup in
[the service guide](./services/family-agent/README.md). Keep the Bedrock bearer token in
the backend `.env`; set the local Expo API URL in `apps/expo-multi-tv/.env` from its
`.env.example`. The Expo app receives only its API URL. Bedrock failures fall back to
the deterministic briefing, and pickup changes still require an explicit confirmation.

The Phase 5 account companion preview is served by that same local API at
`http://127.0.0.1:8787/companion/`. Its local email outbox displays verification/reset codes
for testing. The Expo phone app can connect over your private Wi-Fi for local pairing and
sync checks; that separate device test needs a LAN-reachable development service. The browser
preview runs against loopback and keeps its test session only in the current tab. This is a
local simulator, not AWS Cognito, and must not be exposed publicly. Railway deployment preparation and the remaining completion gate
are tracked in [the Phase 5 runbook](./docs/RAILWAY_DEPLOYMENT.md) and
[Phase 5](./docs/phases/phase-5-integrations.md).
An initial native SwiftUI account companion is in [apps/ios-companion](./apps/ios-companion/README.md);
it also uses this local API and still needs to be built and exercised on a Mac with Xcode.
For Expo Go testing on an iPhone or Android phone, use the cross-platform companion in
[apps/companion](./apps/companion/README.md). It is separate from the Fire TV Expo app and
does not require a custom native build for its current screens.

On Windows, Vega runs inside the managed Ubuntu guest because Windows is not a native Vega
SDK host:

```powershell
.\familyos.ps1 setup
.\familyos.ps1 simulator
```

Do not treat a successful web run as VVD or Fire TV validation. Those checks are tracked
separately in the phase documents and friction log.

Setup verifies and reuses its cached Ubuntu ISO, preserves the existing VM, and resumes
installation/provisioning when rerun. The initial Ubuntu installation can take several
minutes; progress is reported while waiting for SSH. Local SSH/API forwards are bound to
`127.0.0.1`, not the public network. The VM uses key-only SSH and passwordless sudo for
its dedicated `familyos` development account.

If nested virtualization is unavailable, setup still installs the build SDK but skips
the Vega Virtual Device (VVD). It does not change Hyper-V or Windows security settings.

Bootstrap regression checks (no VM changes):

```powershell
powershell.exe -NoProfile -File .\setup\tests\windows-bootstrap.tests.ps1
```

## License

The imported Amazon starter is provided under MIT-0; see [LICENSE](./LICENSE).
Bundled design fonts retain their SIL Open Font License notices in
`packages/shared-ui/src/assets/fonts` and `apps/vega/assets/fonts`.

