# Development friction log

Record tool, SDK, API, simulator, and device friction while it happens.

## Entry 1

Date: 2026-09-22  
Tool/API: Amazon React Native multi-TV sample  
Task attempted: Establish the official FamilyOS starter baseline.  
Steps: Compared `single.md` against the current default branch and current Vega 0.24 docs.  
Expected: Starter commands and manifest would already align with current Vega naming and
requirements.  
Actual: The starter still uses `build-kepler` naming and did not declare the SDK 0.24
`[os.version]` block required by current documentation.  
Severity: Medium  
Workaround: Preserve starter build commands, add OS 1.2 manifest targeting, and use current
`vega` commands only in orchestration scripts.  
Suggested improvement: Update the sample manifest and README when the supported SDK changes.  
Evidence/log: `apps/vega/package.json`, `apps/vega/manifest.toml`, and
`docs/REFERENCES.md`.

## Entry 2

Date: 2026-09-22  
Tool/API: Amazon Devices Builder Tools `init-context`  
Task attempted: Initialize project context in Other/Custom mode without rewriting the
Codex MCP configuration.  
Steps: Ran `init-context --agent other --force --skip-mcp-config` with an explicit context
document path, then ran `check-status`.  
Expected: A project-local context document and no global agent mutation.  
Actual: Other/Custom mode printed the context instead of saving it, installed Amazon
device skills under the user-level `.agents/skills` directory, and reported Codex context
and MCP as unconfigured.  
Severity: Medium  
Workaround: Keep current Amazon docs in `docs/REFERENCES.md`; rerun configuration in the
supported Ubuntu environment when Vega installation proceeds.  
Suggested improvement: Honor the context output path in Other/Custom mode and make global
skill installation separately opt-in.  
Evidence/log: `check-status` summary reported zero configured agents.

## Entry 3

Date: 2026-09-22  
Tool/API: Official multi-TV starter dependency/tooling baseline  
Task attempted: Run immutable install, strict TypeScript, lint, tests, and web bundle.  
Steps: Installed with Yarn 4.5.0, repaired workspace command flags and explicit type
boundaries, and replaced obsolete sample snapshots with a FamilyOS shell test.  
Expected: Starter verification commands would pass as documented.  
Actual: The starter had Yarn workspace command incompatibilities, a missing shared type
entrypoint, strict TypeScript failures, obsolete snapshots, hundreds of formatting
warnings, and Expo reported version-alignment recommendations.  
Severity: Medium  
Workaround: Added a platform-neutral shared declaration boundary and normalized root
verification scripts without upgrading the platform runtime dependencies.  
Suggested improvement: Publish the sample with CI-tested `yarn typecheck`, non-watch tests,
and a current Expo dependency set.  
Evidence/log: `package.json`, `packages/shared-ui/src/index.d.ts`, and
`apps/vega/test/App.spec.tsx`.

## Entry 4 — Windows bootstrap recovery

Date: 2026-09-22  
Tool/API: Windows PowerShell 5.1, OpenSSH, VirtualBox 7.2.20  
Task attempted: Resume the partially created `FamilyOS-Vega` Ubuntu VM.  
Actual: PowerShell dropped the empty SSH-key passphrase argument; VirtualBox could not
open the ISO through its original user-profile path; unchecked native failures let setup
continue. After resolving those errors, the existing VirtualBox installation at the
root of `D:\` failed to load `VMMR0.r0` with `VERR_SUPLIB_PATH_NOT_CLEAN`.  
Severity: High  
Resolution: Preserve native empty arguments when generating keys, check every bootstrap
VirtualBox operation, verify the ISO checksum before use, and use a same-volume hard link
in the shared cache when necessary. Track installation stages so retries cannot silently
overwrite a populated VM disk. Reinstalled the verified, Oracle-signed VirtualBox package
in its standard `C:\Program Files\Oracle\VirtualBox` directory after backing up VM
configuration. The VM UUID and disk were preserved. Ubuntu then booted its unattended
installer successfully.  
Verification: Windows PowerShell 5.1 tests pass for key generation with a spaced path,
key-pair round-trip, key reuse, and native failure propagation.  
Evidence: `setup/tests/windows-bootstrap.tests.ps1`; recovery logs and configuration
backups in `C:\ProgramData\FamilyOS\repair`; installer screenshot in
`logs/ubuntu-install.png`. The recovery script is specific to the detected broken
installation, not a routine setup prerequisite.

## Entry 5 — Nested virtualization unavailable

Date: 2026-09-22  
Tool/API: VirtualBox NEM, Windows hypervisor, Ubuntu KVM  
Actual: VirtualBox enables `NestedHWVirt=1` but reports `AMD-V is not available` and
`WHvCapabilityCodeHypervisorPresent is TRUE`. Windows reports a present hypervisor and
active virtualization-based security. Inside Ubuntu, the virtualization flag count is
zero, `/dev/kvm` is missing, `kvm-ok` reports unavailable extensions, and loading
`kvm_amd` returns `Operation not supported`.  
Severity: High for VVD; not a build-host blocker.  
Resolution: Keep VVD gated. Continue SDK-only installation and builds. Do not disable
Hyper-V, VBS, Memory Integrity, WSL, or other host features without separate permission.
A physical Vega device or a Linux host with accessible KVM avoids this nested setup.  
Evidence: VM `Logs/VBox.log`, guest `setup/verify-kvm.sh`, Windows DeviceGuard CIM status.

## Entry 6 — Documentation SDK version unavailable

Date: 2026-09-22  
Tool/API: Vega CLI 1.4.2 and the official SDK installer  
Actual: The documentation's example SDK `0.24.9311` returned `Version not found`.
The live `vega sdk list-remote` registry lists `0.24.12112` as the latest 0.24 release
(released September 21). The CLI had installed successfully, but no SDK was installed.  
Severity: Medium  
Resolution: Pin the available `0.24.12112` release. Check the installed SDK inventory,
not just whether the CLI executable exists, so partial installations are retryable.
Use a quote-preserving transport for guest scripts under Windows PowerShell 5.1.  
Evidence: `setup/install-vega.sh`, `setup/windows-common.ps1` and guest installer logs
under `~/vega/vvm/`.

## Entry 7 — SDK-generated OS module required

Date: 2026-09-22  
Tool/API: Vega SDK 0.24.12112 manifest validation  
Actual: The JavaScript and Hermes bundles built, but packaging rejected a manifest with
`[os.version]` set to `1.2` and no matching generated OS module.  
Severity: Medium  
Resolution: Ran `vega project update-manifest --os-min 1.2 --os-version 1.2` in the
Ubuntu workspace, inspected its diff, and mirrored its generated
`/com.amazon.vega.os@IVega_1_2` required-module entry into the Windows source manifest.
The SDK version is also pinned in `apps/vega/vega-sdk-requirements.json`.  
Evidence: `apps/vega/manifest.toml` and the SDK packaging output.

## Entry 8 — Alexa+ MCP account linking needs a full OAuth 2.1 authorization server

Date: 2026-09-28  
Tool/API: Alexa+ MCP Toolkit, MCP Python SDK 1.27.1 (FastMCP), Amazon Cognito  
Task attempted: Connect the FamilyOS MCP server (`/mcp`, Streamable HTTP, protocol 2025-11-25) to Alexa+.  
Steps: Read the Alexa+ MCP QuickStart and account-linking pages; built the server with the official SDK; served
RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` pointing at the Cognito issuer.  
Expected: A resource server with bearer-token validation is enough to link.  
Actual: Alexa+ reads the authorization server's well-known metadata, requires OAuth 2.1 with PKCE S256, and makes
a live call during configuration, so the server must be public and the authorization server must publish
metadata Alexa accepts. Cognito publishes OIDC discovery; whether Alexa+ accepts it (versus RFC 8414
`oauth-authorization-server`) is not yet verified. The SDK's `streamable_http_app()` mounts its routes at the app
root and its session manager can run only once per instance, which does not fit a FastAPI app that already owns
`/` and restarts per test.  
Severity: High (blocks live Alexa+ testing only)  
Workaround: Voice connections use revocable FamilyOS bearer tokens (hashed at rest); the server also accepts Cognito
access tokens from app clients listed in `FAMILYOS_MCP_COGNITO_CLIENT_IDS`. A small ASGI wrapper mounts the SDK
session manager at exactly `/mcp` with a fresh manager per app lifespan. A labelled "Simulated Alexa+" (Bedrock
tool-use driving the same MCP tools) is available at `POST /v1/voice/simulate` and in the phone app.  
Suggested improvement: Document which authorization-server metadata formats Alexa+ accepts (OIDC discovery vs RFC
8414) and whether static-token linking is allowed for development; let FastMCP expose a mountable ASGI app whose
session manager can be restarted.  
Evidence/log: `services/family-agent/tests/test_voice_mcp.py`; live run with `mcp.client.streamable_http`
negotiated `2025-11-25`, listed 10 tools, completed `get_today` and `propose_pickup_swap`.

## Entry 9 — Bedrock vision on synthetic chore photos is cautious

Date: 2026-09-28  
Tool/API: Amazon Bedrock Converse (`us.amazon.nova-lite-v1:0`, image input)  
Task attempted: Measure chore-photo verdicts on 60 labelled synthetic (drawn, non-identifying) photos.  
Expected: Clear finished/unfinished scenes classified reliably.  
Actual: 45% accuracy, 0% false "looks done", 55% "unclear". The model rarely commits on simple drawings. It
correctly ignored a prompt-injection line printed on a test flyer during photo import.  
Severity: Low (the verdict is advisory; a parent always decides)  
Workaround: Treat `unclear` as safe; keep parent approval with the four-digit code. Re-measure with real,
consented household photos before claiming real-world accuracy.  
Suggested improvement: A small documented vision benchmark for household scenes, and structured-output
(JSON schema) support for image inputs on Nova.  
Evidence/log: `services/family-agent/eval/results/bedrock.json`, `eval/results/demo.json`.

## Entry 10 — Vega JS engine pads weekday-only date labels

Date: 2026-09-28  
Tool/API: Vega OS 1.2 JavaScript engine (`Date.prototype.toLocaleDateString`) on the Vega Virtual Device  
Task attempted: Show short weekday labels in the Calendar and Meals week headers.  
Steps: Called `toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })`, built the x86_64 package,
and viewed the Calendar and Meals screens on the VVD.  
Expected: `SUN`, `MON`, and so on, as in the browser preview.  
Actual: `SUN, 9/20/2026`. The engine adds the default numeric date fields when only `weekday` is
requested, and the long labels collided with the day numbers (`SUN, 9/20/2026 20MON, ...`).
`month: 'long'` and `Intl.DateTimeFormat` with several fields rendered correctly.  
Severity: Medium  
Workaround: Derive the label from `getUTCDay()` with a fixed `SUN`–`SAT` table (`calendarDays` in
`FamilyCalendarScreen.tsx`).  
Suggested improvement: Follow ECMA-402 `ToDateTimeOptions` (a `weekday` option alone must not add
year, month, and day), or document the difference.  
Evidence/log: VVD screenshots from the 2026-09-28 regression; `docs/VEGA_VVD_TEST_REPORT.md`.

## Entry 11 — Remote configured after the first render left the D-pad dead

Date: 2026-09-28  
Tool/API: `react-tv-space-navigation` 5.2.0 with the Vega `TVEventHandler` remote bridge  
Task attempted: Drive every FamilyOS screen with the remote on the Vega Virtual Device.  
Steps: Launched builds with `vega run-app` and `vega device launch-app`, then injected keys with
`inputd-cli button_press`.  
Expected: D-pad moves focus on every launch.  
Actual: On some launches no key moved focus, even though the app log showed
`[Kepler] Key pressed: Right`. `VegaAppNavigator` configured the remote inside `useEffect`, which runs
after the child `SpatialNavigationRoot` mount effects. A root that mounts before configuration only logs
a console warning and does not subscribe until its `isActive` value changes.  
Severity: High (the app was unusable with a remote for that session)  
Workaround: Import `configureRemoteControl` at module load in `VegaAppNavigator.tsx`, before any root mounts.  
Suggested improvement: Have the library subscribe late roots when the remote is configured, or throw
instead of warning when a root mounts without a remote configuration.  
Evidence/log: VVD log stream (`vega device start-log-stream`) and the before/after screenshots.

## Entry 12 — VVD automation needs device-side input and host-side screenshots

Date: 2026-09-28  
Tool/API: Vega CLI 1.4.2, SDK 0.24.12112, Vega Virtual Device on EC2 (Xvfb, llvmpipe)  
Task attempted: Script a remote-only regression pass with screenshots.  
Steps: Tried X keyboard events (`xdotool key`) on the VVD window, the on-screen remote, and on-device
`screenshooter`.  
Expected: A documented CLI command for key injection and screenshots.  
Actual: X keyboard events and clicks on the on-screen remote did not reach the app, and
`screenshooter /tmp/x.png` hung until the command was cancelled. The Vega CLI has no screenshot or
key-injection command. On-device `inputd-cli button_press KEY_UP|KEY_ENTER|KEY_BACK` works through
`vega device run-cmd`, and X-level window capture (`import -window`) works for screenshots.  
Severity: Medium  
Workaround: `vega device run-cmd -c "inputd-cli button_press KEY_<NAME>"` for keys and ImageMagick
`import` of the VVD window for 960x540 captures.  
Suggested improvement: Add `vega device send-key` and `vega device screenshot` commands and document them.  
Evidence/log: `docs/VEGA_VVD_TEST_REPORT.md`.

## Entry 13 — Overlays inside a screen did not receive remote focus

Date: 2026-09-28  
Tool/API: `react-tv-space-navigation` `DefaultFocus` inside an already-focused root  
Task attempted: Resolve the Home pickup conflict with the remote only.  
Steps: Home, then OK on **Fix pickup**, then OK on **Suggest Alex**.  
Expected: Focus moves to **Suggest Alex** in the review dialog.  
Actual: The dialog opened, but focus stayed on **Fix pickup** behind it, so OK did nothing useful and
the pickup could not be confirmed with the remote. The parent-code pads in Settings and Approvals
nested a second active root without locking the page, so both roots received keys.  
Severity: High  
Workaround: `ModalFocusRoot` locks the page's navigation with `useLockSpatialNavigation` and gives the
overlay its own root (the same pattern as the Lists and Meals editor).  
Suggested improvement: A documented modal or focus-trap primitive in the library.  
Evidence/log: `docs/VEGA_VVD_TEST_REPORT.md`.

## Feature requests

### FR-1 — Timed household notifications during other apps' playback

Date: 2026-09-27  
Tool/API: Vega OS app platform (`useToastKepler` in `@amazon-devices/react-native-kepler`)  
Description: Let a user-approved household app post a short, timed notification while another
app is playing video, for example "Leave for soccer in 15 minutes" during a Netflix or
YouTube episode. Include an optional action that opens the app, a per-app user opt-in, a
per-hour limit, and quiet hours. A related request: a read-only signal that tells an approved
app whether something is currently playing, so it can choose a less intrusive delivery.  
Why it matters: FamilyOS helps a household leave on time and prepare for events. Families
spend much of that time watching other apps, which is exactly when a reminder is most useful.
Vega provides no API for drawing over other apps, and the installed SDK types do not say
whether `useToastKepler` can be triggered from a background component. That leaves no
supported way to deliver a timely schedule reminder while the family is watching TV. As a
result, the planned "reminders while you watch" feature was dropped from scope.  
Priority: Important  
Status: Not yet tested on hardware. Record the result here if the background toast behavior
is tested on a Fire TV device.

## Entry template

Date:  
Tool/API:  
Task attempted:  
Steps:  
Expected:  
Actual:  
Severity: Critical | High | Medium | Low  
Workaround:  
Suggested improvement:  
Evidence/log:

