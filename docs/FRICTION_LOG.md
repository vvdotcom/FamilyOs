# Hometide on Vega OS, Alexa and AWS: development friction log

| Reviewer | Status |
| :--- | :--- |
| **Hometide developer** | Complete (entries 22 Sep to 8 Oct 2026) |
| **Amazon Vega, Alexa and AWS product teams** | Under review |

Written in the format of [Trag's friction log guide](https://github.com/chris-trag/friction-log-guide) and its
[full template](https://github.com/chris-trag/friction-log-guide/blob/main/templates/friction-log-template.md).
Every entry also has the fields the hackathon rules ask for: task attempted, steps, expected vs. actual, severity,
workaround and an actionable suggestion. Hometide was called FamilyOS during early development, so older entries use
that name. Per-tool feedback is in [Product feedback](./PRODUCT_FEEDBACK.md). Back to the [README](../README.md).

## BLUF (bottom line up front)

We got from an empty repo to a release build running on a physical Fire TV Stick 4K Select (Vega OS 2.0), with
Alexa, Bedrock, Strands and AgentCore behind it, and the platform pieces we relied on daily (React Native for Vega,
`vega run-app`, the Converse API, the MCP SDK) worked well. The cost was in the edges: Windows isn't a Vega SDK host
and the Vega Virtual Device needs KVM, the sample and docs lagged SDK 0.24, Vega OS has no supported way to keep a
dashboard on screen, and Alexa+ sometimes answered "ask home tide…" itself, confidently and wrongly. Each one had
a workaround in the end, but 9 of the 21 entries are rated High.

**Grade:** B−

**Size:** Large (about three weeks of development, 21 entries)

## Persona

- **Role:** Developer building Hometide, a family calendar, chores and meals app for the living-room TV, with a
  phone companion and a voice agent.
- **Experience with this product:** First time with the Vega SDK, Alexa+ MCP, Strands Agents and AgentCore Memory.
  Working in React Native/TypeScript and Python.
- **Goal:** Build, run and ship a Vega OS app on a real Fire TV, voice-controlled through Alexa, with Bedrock agents
  behind it.
- **Technical context:** A Windows laptop with Hyper-V and virtualization-based security on, the Amazon React Native
  multi-TV sample as the starting point, and an API hosted on Railway.

## Scope

- [x] Set up the Vega SDK and CLI on a Windows laptop (through an Ubuntu VM) and build a `.vpkg`
- [x] Run the app on the Vega Virtual Device and drive every screen with the remote only
- [x] Install and run the release build on a physical Fire TV Stick in Developer Mode
- [x] Keep an always-on family wall calendar on screen
- [x] Connect an MCP server to Alexa+ and a custom Alexa skill with account linking
- [x] Run a Strands voice agent with Bedrock Nova Lite tool use
- [x] Remember household routines in AgentCore Memory

## Pros

- **React Native for Vega shares code well.** One set of TV screens ran on Vega OS, on the web for fast iteration,
  and on Fire OS / Android TV through Expo. Builds for armv7, aarch64 and x86_64 passed manifest validation.
- **The run loop is fast and reliable.** `vega run-app` and `launch-app` worked every time; cold start to a rendered
  Home took about 2–3 s, even with software GL on the Vega Virtual Device.
- **The same release `.vpkg` installed and ran on a physical Fire TV Stick** (3 Oct) with the real remote, from our
  Linux build VM.
- **Vega's media player solved our hardest problem.** A muted weather loop through the W3C Media `VideoPlayer` keeps
  the screensaver away while the wall calendar shows (Entry 14 update).
- **Bedrock is cheap and simple to start with.** One API key and one model ID covered text, images, PDFs and tool
  use, at about $0.13–$0.51 per household per month. Nova Lite ignored an instruction planted in a test flyer.
- **MCP fits a "propose, then confirm" design.** The official MCP client negotiated `2025-11-25`, listed every tool
  and ran read and propose calls end to end.
- **Strands replaced our hand-written Converse loop in one small module**, and AgentCore Memory was one CDK resource.

## Cons

- Windows isn't a Vega SDK host, and the Vega Virtual Device needs KVM, which a Windows laptop with
  virtualization-based security can't pass to a VM (Entries 4, 5).
- The multi-TV sample and the getting-started docs lag SDK 0.24 (Entries 1, 3, 6, 7).
- Vega OS has no supported way for a non-media app to keep the display on, and no way to show a timed reminder over
  another app's playback (Entry 14).
- Remote focus needed patterns that aren't documented: configure the remote before the first render, and lock the
  page under an overlay (Entries 11, 13).
- Device automation has no screenshot or key-injection command (Entry 12), and `vega devmode login` fails on a
  headless Linux host (Entry 21).
- Alexa+ sometimes answers "ask home tide…" from its own empty calendar, and doesn't document which OAuth metadata
  it accepts for MCP linking (Entries 8, 19).
- Nova Lite can return only hidden reasoning after a tool call, and a Strands agent given every tool proposes changes
  nobody asked for (Entries 15, 16).

## Friction

The 21 entries at a glance (severity: 🔥 Critical, ⚠️ High, ⚡ Medium, ℹ️ Low):

| # | Friction | Tool or API | Severity |
|---|---|---|---|
| 1 | [The multi-TV sample lags the current Vega SDK](#entry-1--the-multi-tv-sample-lags-the-current-vega-sdk) | Amazon React Native multi-TV sample | ⚡ Medium |
| 2 | [Builder Tools `init-context` ignores the output path in Other/Custom mode](#entry-2--builder-tools-init-context-ignores-the-output-path-in-othercustom-mode) | Amazon Devices Builder Tools `init-context` | ⚡ Medium |
| 3 | [The multi-TV sample's own checks don't pass](#entry-3--the-multi-tv-samples-own-checks-dont-pass) | Official multi-TV starter dependency/tooling baseline | ⚡ Medium |
| 4 | [Windows bootstrap recovery](#entry-4--windows-bootstrap-recovery) | Vega SDK host setup on Windows: Windows PowerShell 5.1, OpenSSH, VirtualBox 7.2.20, an Ubuntu VM | ⚠️ High |
| 5 | [Nested virtualization unavailable](#entry-5--nested-virtualization-unavailable) | Vega Virtual Device (VVD) host requirements; VirtualBox NEM, Windows hypervisor, Ubuntu KVM | ⚠️ High |
| 6 | [Documentation SDK version unavailable](#entry-6--documentation-sdk-version-unavailable) | Vega CLI 1.4.2, the official SDK installer, and the getting-started docs | ⚡ Medium |
| 7 | [SDK-generated OS module required](#entry-7--sdk-generated-os-module-required) | Vega SDK 0.24.12112 manifest validation and packaging | ⚡ Medium |
| 8 | [Alexa+ MCP account linking needs a full OAuth 2.1 authorization server](#entry-8--alexa-mcp-account-linking-needs-a-full-oauth-21-authorization-server) | Alexa+ MCP Toolkit, MCP Python SDK 1.27.1 (FastMCP), Amazon Cognito | ⚠️ High |
| 9 | [Bedrock vision on synthetic chore photos is cautious](#entry-9--bedrock-vision-on-synthetic-chore-photos-is-cautious) | Amazon Bedrock Converse | ℹ️ Low |
| 10 | [Vega JS engine pads weekday-only date labels](#entry-10--vega-js-engine-pads-weekday-only-date-labels) | Vega OS 1.2 JavaScript engine (`Date.prototype.toLocaleDateString`) on the Vega Virtual Device | ⚡ Medium |
| 11 | [Remote configured after the first render left the D-pad dead](#entry-11--remote-configured-after-the-first-render-left-the-d-pad-dead) | `react-tv-space-navigation` 5.2.0 with the Vega `TVEventHandler` remote bridge | ⚠️ High |
| 12 | [VVD automation needs device-side input and host-side screenshots](#entry-12--vvd-automation-needs-device-side-input-and-host-side-screenshots) | Vega CLI 1.4.2, SDK 0.24.12112, Vega Virtual Device on EC2 | ⚡ Medium |
| 13 | [Overlays inside a screen did not receive remote focus](#entry-13--overlays-inside-a-screen-did-not-receive-remote-focus) | `react-tv-space-navigation` `DefaultFocus` inside an already-focused root | ⚠️ High |
| 14 | [Vega OS cannot keep the display on for a non-media app](#entry-14--vega-os-cannot-keep-the-display-on-for-a-non-media-app) | Vega OS display power and screensaver | ⚠️ High |
| 15 | [Nova Lite can answer a tool call with only hidden reasoning](#entry-15--nova-lite-can-answer-a-tool-call-with-only-hidden-reasoning) | Amazon Bedrock Converse API, `us.amazon.nova-lite-v1:0`, tool use | ⚠️ High |
| 16 | [Given every tool, the agent proposes changes nobody asked for](#entry-16--given-every-tool-the-agent-proposes-changes-nobody-asked-for) | Strands Agents SDK 1.57 with `BedrockModel` | ⚡ Medium |
| 17 | [AgentCore Memory records are not searchable right after they are written](#entry-17--agentcore-memory-records-are-not-searchable-right-after-they-are-written) | Amazon Bedrock AgentCore Memory, `CreateEvent` and `RetrieveMemoryRecords` | ℹ️ Low |
| 18 | [The skill build waits on an easy-to-miss confirmation](#entry-18--the-skill-build-waits-on-an-easy-to-miss-confirmation) | Alexa Skills Kit developer console | ℹ️ Low |
| 19 | [Alexa+ answers "ask home tide what's on today" from its own empty calendar](#entry-19--alexa-answers-ask-home-tide-whats-on-today-from-its-own-empty-calendar) | Alexa+ (developer console simulator), Alexa Skills Kit custom skill invocation | ⚠️ High |
| 20 | [The Developer Mode code is letters and numbers, but the docs say "6-digit code"](#entry-20--the-developer-mode-code-is-letters-and-numbers-but-the-docs-say-6-digit-code) | Vega Developer Mode on a physical Fire TV Stick (Vega OS), Vega CLI documentation | ℹ️ Low |
| 21 | [`vega devmode login` can't save its token on a headless Linux host](#entry-21--vega-devmode-login-cant-save-its-token-on-a-headless-linux-host) | Vega CLI (`vega devmode login`, `vega devmode enable-device`) on Ubuntu over SSH | ⚠️ High |

### Entry 1 — The multi-TV sample lags the current Vega SDK

**Severity:** ⚡ Medium

**Date:** 2026-09-22 · **Tool or API:** Amazon React Native multi-TV sample

**Task attempted:** Establish the official FamilyOS starter baseline.

**Steps:** Compared our build specification against the current default branch and current Vega 0.24 docs.

**Expected:** Starter commands and manifest would already align with current Vega naming and requirements.

**Actual:** The starter still uses `build-kepler` naming and did not declare the SDK 0.24 `[os.version]` block required by current documentation.

**Workaround:** Preserve starter build commands, add OS 1.2 manifest targeting, and use current `vega` commands only in orchestration scripts.

**Recommendation:** Update the sample manifest and README when the supported SDK changes.

**Evidence:** `apps/vega/package.json`, `apps/vega/manifest.toml`, and [the README's references](../README.md#references).

### Entry 2 — Builder Tools `init-context` ignores the output path in Other/Custom mode

**Severity:** ⚡ Medium

**Date:** 2026-09-22 · **Tool or API:** Amazon Devices Builder Tools `init-context`

**Task attempted:** Initialize project context in Other/Custom mode without rewriting the Codex MCP configuration.

**Steps:** Ran `init-context --agent other --force --skip-mcp-config` with an explicit context document path, then ran `check-status`.

**Expected:** A project-local context document and no global agent mutation.

**Actual:** Other/Custom mode printed the context instead of saving it, installed Amazon device skills under the user-level `.agents/skills` directory, and reported Codex context and MCP as unconfigured.

**Workaround:** Keep current Amazon docs in [the README's references](../README.md#references); rerun configuration in the supported Ubuntu environment when Vega installation proceeds.

**Recommendation:** Honor the context output path in Other/Custom mode and make global skill installation separately opt-in.

**Evidence:** `check-status` summary reported zero configured agents.

### Entry 3 — The multi-TV sample's own checks don't pass

**Severity:** ⚡ Medium

**Date:** 2026-09-22 · **Tool or API:** Official multi-TV starter dependency/tooling baseline

**Task attempted:** Run immutable install, strict TypeScript, lint, tests, and web bundle.

**Steps:** Installed with Yarn 4.5.0, repaired workspace command flags and explicit type boundaries, and replaced obsolete sample snapshots with a FamilyOS shell test.

**Expected:** Starter verification commands would pass as documented.

**Actual:** The starter had Yarn workspace command incompatibilities, a missing shared type entrypoint, strict TypeScript failures, obsolete snapshots, hundreds of formatting warnings, and Expo reported version-alignment recommendations.

**Workaround:** Added a platform-neutral shared declaration boundary and normalized root verification scripts without upgrading the platform runtime dependencies.

**Recommendation:** Publish the sample with CI-tested `yarn typecheck`, non-watch tests, and a current Expo dependency set.

**Evidence:** `package.json`, `packages/shared-ui/src/index.d.ts`, and `apps/vega/test/App.spec.tsx`.

### Entry 4 — Windows bootstrap recovery

**Severity:** ⚠️ High

**Date:** 2026-09-22 · **Tool or API:** Vega SDK host setup on Windows: Windows PowerShell 5.1, OpenSSH, VirtualBox 7.2.20, an Ubuntu VM

**Task attempted:** Resume the partially created `FamilyOS-Vega` Ubuntu VM that hosts the Vega SDK on our Windows laptop (Windows isn't a Vega SDK host, so the SDK runs in a Linux VM).

**Steps:** Re-ran our Windows bootstrap after an interrupted first run. It creates an SSH key with an empty passphrase, attaches the cached Ubuntu ISO, and resumes the existing VM so Ubuntu's unattended installer can continue.

**Expected:** The bootstrap picks up where it stopped and the Ubuntu installer starts.

**Actual:** PowerShell dropped the empty SSH-key passphrase argument; VirtualBox could not open the ISO through its original user-profile path; unchecked native failures let setup continue. After resolving those errors, the existing VirtualBox installation at the root of `D:\` failed to load `VMMR0.r0` with `VERR_SUPLIB_PATH_NOT_CLEAN`.

**Workaround:** Preserve native empty arguments when generating keys, check every bootstrap VirtualBox operation, verify the ISO checksum before use, and use a same-volume hard link in the shared cache when necessary. Track installation stages so retries cannot silently overwrite a populated VM disk. Reinstalled the verified, Oracle-signed VirtualBox package in its standard `C:\Program Files\Oracle\VirtualBox` directory after backing up VM configuration. The VM UUID and disk were preserved. Ubuntu then booted its unattended installer successfully. Windows PowerShell 5.1 tests now cover key generation with a spaced path, key-pair round-trip, key reuse, and native failure propagation.

**Recommendation:** Most of this cost came from Windows not being a Vega SDK host, which leaves each Windows developer to build and maintain their own Linux VM. Publish a supported Windows path (for example a WSL2 guide or a ready-made VM image with the SDK installed), and put the host requirements (Linux or macOS, and KVM for the Vega Virtual Device) on the first page of the getting-started guide.

**Evidence:** `setup/tests/windows-bootstrap.tests.ps1`; recovery logs and configuration backups in `C:\ProgramData\FamilyOS\repair`; installer screenshot in `logs/ubuntu-install.png`. The recovery script is specific to the detected broken installation, not a routine setup prerequisite.

### Entry 5 — Nested virtualization unavailable

**Severity:** ⚠️ High for VVD; not a build-host blocker.

**Date:** 2026-09-22 · **Tool or API:** Vega Virtual Device (VVD) host requirements; VirtualBox NEM, Windows hypervisor, Ubuntu KVM

**Task attempted:** Run the Vega Virtual Device inside the Ubuntu build VM on our Windows laptop.

**Steps:** Turned on nested virtualization for the VM (`NestedHWVirt=1`), booted Ubuntu, and checked for KVM with `setup/verify-kvm.sh` before starting the VVD.

**Expected:** KVM available inside the VM, so the VVD can start.

**Actual:** VirtualBox enables `NestedHWVirt=1` but reports `AMD-V is not available` and `WHvCapabilityCodeHypervisorPresent is TRUE`. Windows reports a present hypervisor and active virtualization-based security. Inside Ubuntu, the virtualization flag count is zero, `/dev/kvm` is missing, `kvm-ok` reports unavailable extensions, and loading `kvm_amd` returns `Operation not supported`.

**Workaround:** Keep the VVD off on this host and continue SDK-only installation and builds. Do not disable Hyper-V, VBS, Memory Integrity, WSL, or other host features without separate permission. We later ran the VVD on an EC2 instance with nested virtualization (Entry 12) and tested on a physical Fire TV Stick.

**Recommendation:** State at the top of the VVD docs that it needs KVM, and that a Windows machine with Hyper-V or virtualization-based security on can't provide it to a guest VM. Offer an official cloud recipe (for example an EC2 instance type and AMI known to run the VVD) or a hosted VVD for developers without a Linux machine.

**Evidence:** VM `Logs/VBox.log`, guest `setup/verify-kvm.sh`, Windows DeviceGuard CIM status.

### Entry 6 — Documentation SDK version unavailable

**Severity:** ⚡ Medium

**Date:** 2026-09-22 · **Tool or API:** Vega CLI 1.4.2, the official SDK installer, and the getting-started docs

**Task attempted:** Install the Vega SDK version used in the getting-started docs.

**Steps:** Installed Vega CLI 1.4.2, then asked the official installer for the docs' example SDK `0.24.9311`. When that failed, listed the available versions with `vega sdk list-remote`.

**Expected:** The documented version installs, or the error says which versions are available.

**Actual:** The documentation's example SDK `0.24.9311` returned `Version not found`. The live `vega sdk list-remote` registry lists `0.24.12112` as the latest 0.24 release (released September 21). The CLI had installed successfully, but no SDK was installed.

**Workaround:** Pin the available `0.24.12112` release. Check the installed SDK inventory, not just whether the CLI executable exists, so partial installations are retryable. Use a quote-preserving transport for guest scripts under Windows PowerShell 5.1.

**Recommendation:** Keep the version in documentation examples available in the registry (or show "latest"), and have `Version not found` list the nearest available versions.

**Evidence:** `setup/install-vega.sh`, `setup/windows-common.ps1` and guest installer logs under `~/vega/vvm/`.

### Entry 7 — SDK-generated OS module required

**Severity:** ⚡ Medium

**Date:** 2026-09-22 · **Tool or API:** Vega SDK 0.24.12112 manifest validation and packaging

**Task attempted:** Package the first Vega build (`.vpkg`) of the TV app.

**Steps:** Built the JavaScript and Hermes bundles with SDK 0.24.12112 from a manifest whose `[os.version]` was set to `1.2`, then ran packaging.

**Expected:** Packaging accepts a manifest that targets OS 1.2, or the error says how to fix it.

**Actual:** The JavaScript and Hermes bundles built, but packaging rejected a manifest with `[os.version]` set to `1.2` and no matching generated OS module.

**Workaround:** Ran `vega project update-manifest --os-min 1.2 --os-version 1.2` in the Ubuntu workspace, inspected its diff, and mirrored its generated `/com.amazon.vega.os@IVega_1_2` required-module entry into the Windows source manifest. The SDK version is also pinned in `apps/vega/vega-sdk-requirements.json`.

**Recommendation:** Name the fix in the packaging error (`vega project update-manifest --os-min <version> --os-version <version>`), and keep the multi-TV sample's manifest in step with the current SDK (see Entry 1).

**Evidence:** `apps/vega/manifest.toml` and the SDK packaging output.

### Entry 8 — Alexa+ MCP account linking needs a full OAuth 2.1 authorization server

**Severity:** ⚠️ High (blocks live Alexa+ testing only)

**Date:** 2026-09-28 · **Tool or API:** Alexa+ MCP Toolkit, MCP Python SDK 1.27.1 (FastMCP), Amazon Cognito

**Task attempted:** Connect the FamilyOS MCP server (`/mcp`, Streamable HTTP, protocol 2025-11-25) to Alexa+.

**Steps:** Read the Alexa+ MCP QuickStart and account-linking pages; built the server with the official SDK; served RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` pointing at the Cognito issuer.

**Expected:** A resource server with bearer-token validation is enough to link.

**Actual:** Alexa+ reads the authorization server's well-known metadata, requires OAuth 2.1 with PKCE S256, and makes a live call during configuration, so the server must be public and the authorization server must publish metadata Alexa accepts. Cognito publishes OIDC discovery; whether Alexa+ accepts it (versus RFC 8414 `oauth-authorization-server`) is not yet verified. The SDK's `streamable_http_app()` mounts its routes at the app root and its session manager can run only once per instance, which does not fit a FastAPI app that already owns `/` and restarts per test.

**Workaround:** Voice connections use revocable FamilyOS bearer tokens (hashed at rest); the server also accepts Cognito access tokens from app clients listed in `FAMILYOS_MCP_COGNITO_CLIENT_IDS`. A small ASGI wrapper mounts the SDK session manager at exactly `/mcp` with a fresh manager per app lifespan. A labelled "Simulated Alexa+" (Bedrock tool-use driving the same MCP tools) is available at `POST /v1/voice/simulate` and in the phone app.

**Recommendation:** Document which authorization-server metadata formats Alexa+ accepts (OIDC discovery vs RFC 8414) and whether static-token linking is allowed for development; let FastMCP expose a mountable ASGI app whose session manager can be restarted.

**Evidence:** `services/family-agent/tests/test_voice_mcp.py`; live run with `mcp.client.streamable_http` negotiated `2025-11-25`, listed 10 tools, completed `get_today` and `propose_pickup_swap`.

### Entry 9 — Bedrock vision on synthetic chore photos is cautious

**Severity:** ℹ️ Low (the verdict is advisory; a parent always decides)

**Date:** 2026-09-28 · **Tool or API:** Amazon Bedrock Converse (`us.amazon.nova-lite-v1:0`, image input)

**Task attempted:** Measure chore-photo verdicts on 60 labelled synthetic (drawn, non-identifying) photos.

**Steps:** Generated the labelled set with `eval/generate_chore_photos.py`, then ran `eval/run_chore_eval.py --provider bedrock`, which sends each photo through the same processing as a real upload.

**Expected:** Clear finished/unfinished scenes classified reliably.

**Actual:** 45% accuracy, 0% false "looks done", 55% "unclear". The model rarely commits on simple drawings. It correctly ignored a prompt-injection line printed on a test flyer during photo import.

**Workaround:** Treat `unclear` as safe; keep parent approval with the four-digit code. Re-measure with real, consented household photos before claiming real-world accuracy.

**Recommendation:** A small documented vision benchmark for household scenes, and structured-output (JSON schema) support for image inputs on Nova.

**Evidence:** `services/family-agent/eval/results/bedrock.json`, `eval/results/demo.json`.

### Entry 10 — Vega JS engine pads weekday-only date labels

**Severity:** ⚡ Medium

**Date:** 2026-09-28 · **Tool or API:** Vega OS 1.2 JavaScript engine (`Date.prototype.toLocaleDateString`) on the Vega Virtual Device

**Task attempted:** Show short weekday labels in the Calendar and Meals week headers.

**Steps:** Called `toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })`, built the x86_64 package, and viewed the Calendar and Meals screens on the VVD.

**Expected:** `SUN`, `MON`, and so on, as in the browser preview.

**Actual:** `SUN, 9/20/2026`. The engine adds the default numeric date fields when only `weekday` is requested, and the long labels collided with the day numbers (`SUN, 9/20/2026 20MON, ...`). `month: 'long'` and `Intl.DateTimeFormat` with several fields rendered correctly.

**Workaround:** Derive the label from `getUTCDay()` with a fixed `SUN`–`SAT` table (`calendarDays` in `FamilyCalendarScreen.tsx`).

**Recommendation:** Follow ECMA-402 `ToDateTimeOptions` (a `weekday` option alone must not add year, month, and day), or document the difference.

**Evidence:** VVD screenshots from the 2026-09-28 regression; [the VVD regression in the README](../README.md#vega-virtual-device-regression-2026-09-28).

### Entry 11 — Remote configured after the first render left the D-pad dead

**Severity:** ⚠️ High (the app was unusable with a remote for that session)

**Date:** 2026-09-28 · **Tool or API:** `react-tv-space-navigation` 5.2.0 with the Vega `TVEventHandler` remote bridge

**Task attempted:** Drive every FamilyOS screen with the remote on the Vega Virtual Device.

**Steps:** Launched builds with `vega run-app` and `vega device launch-app`, then injected keys with `inputd-cli button_press`.

**Expected:** D-pad moves focus on every launch.

**Actual:** On some launches no key moved focus, even though the app log showed `[Kepler] Key pressed: Right`. `VegaAppNavigator` configured the remote inside `useEffect`, which runs after the child `SpatialNavigationRoot` mount effects. A root that mounts before configuration only logs a console warning and does not subscribe until its `isActive` value changes.

**Workaround:** Import `configureRemoteControl` at module load in `VegaAppNavigator.tsx`, before any root mounts.

**Recommendation:** Have the library subscribe late roots when the remote is configured, or throw instead of warning when a root mounts without a remote configuration.

**Evidence:** VVD log stream (`vega device start-log-stream`) and the before/after screenshots.

### Entry 12 — VVD automation needs device-side input and host-side screenshots

**Severity:** ⚡ Medium

**Date:** 2026-09-28 · **Tool or API:** Vega CLI 1.4.2, SDK 0.24.12112, Vega Virtual Device on EC2 (Xvfb, llvmpipe)

**Task attempted:** Script a remote-only regression pass with screenshots.

**Steps:** Tried X keyboard events (`xdotool key`) on the VVD window, the on-screen remote, and on-device `screenshooter`.

**Expected:** A documented CLI command for key injection and screenshots.

**Actual:** X keyboard events and clicks on the on-screen remote did not reach the app, and `screenshooter /tmp/x.png` hung until the command was cancelled. The Vega CLI has no screenshot or key-injection command. On-device `inputd-cli button_press KEY_UP|KEY_ENTER|KEY_BACK` works through `vega device run-cmd`, and X-level window capture (`import -window`) works for screenshots.

**Workaround:** `vega device run-cmd -c "inputd-cli button_press KEY_<NAME>"` for keys and ImageMagick `import` of the VVD window for 960x540 captures.

**Recommendation:** Add `vega device send-key` and `vega device screenshot` commands and document them.

**Evidence:** [the VVD regression in the README](../README.md#vega-virtual-device-regression-2026-09-28).

### Entry 13 — Overlays inside a screen did not receive remote focus

**Severity:** ⚠️ High

**Date:** 2026-09-28 · **Tool or API:** `react-tv-space-navigation` `DefaultFocus` inside an already-focused root

**Task attempted:** Resolve the Home pickup conflict with the remote only.

**Steps:** Home, then OK on **Fix pickup**, then OK on **Suggest Alex**.

**Expected:** Focus moves to **Suggest Alex** in the review dialog.

**Actual:** The dialog opened, but focus stayed on **Fix pickup** behind it, so OK did nothing useful and the pickup could not be confirmed with the remote. The parent-code pads in Settings and Approvals nested a second active root without locking the page, so both roots received keys.

**Workaround:** `ModalFocusRoot` locks the page's navigation with `useLockSpatialNavigation` and gives the overlay its own root (the same pattern as the Lists and Meals editor).

**Recommendation:** A documented modal or focus-trap primitive in the library.

**Evidence:** [the VVD regression in the README](../README.md#vega-virtual-device-regression-2026-09-28).

### Entry 14 — Vega OS cannot keep the display on for a non-media app

**Severity:** ⚠️ High (for this product category)

**Date:** 2026-09-29 · **Tool or API:** Vega OS display power and screensaver (Fire TV Stick 4K Select class devices)

**Task attempted:** An always-on family wall calendar, the core of a Skylight-style display on the TV.

**Steps:** Leave FamilyOS in the foreground with no remote input.

**Expected:** An opt-in way for a dashboard app to keep the screen on, or a user setting to never start the screensaver.

**Actual:** No keep-awake API exists for non-media apps, and the W3C Screen Wake Lock is not honored. The screensaver starts after the idle timeout (about 5 minutes by default), and Settings offers longer timeouts but no "never". Amazon staff confirmed this in the developer forum (June 24, July 7, and July 21, 2026) and said it is not on the near-term roadmap. Fire OS (Android-based) devices still allow `FLAG_KEEP_SCREEN_ON`.

**Workaround:** FamilyOS shows its wall calendar after 5 idle minutes. That matches the system screensaver's default wait, so families should lengthen the screensaver wait for the wall calendar to stay up. The TV's Settings screen tells families where to lengthen the wait (Settings → Display & Sounds → Ambient Experience). Pairing and household state survive the app being closed, as Amazon recommends. Update: while the wall calendar plays its muted weather loop through Vega's media player (W3C Media `VideoPlayer`), the system screensaver does not start (Fire TV Stick 4K Select, Vega OS 2.0, 2026-10-08). The wall now stays up as long as it's showing, with no change to the family's settings.

**Recommendation:** Media playback being the only way to keep a dashboard visible should be documented, or replaced by an explicit, user-granted "keep screen on" for dashboard apps.

**Evidence:** [Vega OS: no API or device setting to keep the display awake](https://community.amazondeveloper.com/t/vega-os-no-api-or-device-setting-to-keep-the-display-awake-for-non-media-signage-kiosk-apps-screensaver-engages-despite-foreground-app/28610), [Vega ambient mode / idle behavior](https://community.amazondeveloper.com/t/vega-ambient-mode-idle-behavior/28788).

### Entry 15 — Nova Lite can answer a tool call with only hidden reasoning

**Severity:** ⚠️ High (silent failure in a voice product)

**Date:** 2026-10-01 · **Tool or API:** Amazon Bedrock Converse API, `us.amazon.nova-lite-v1:0`, tool use

**Task attempted:** Answer "what's on today?" through Alexa with a tool call, then a spoken reply.

**Steps:** Sent the utterance with the tool list; the model called `get_today`; we returned the tool result.

**Expected:** A short text reply after the tool result.

**Actual:** Some final messages contained only a `<thinking>…</thinking>` block. With it stripped, Alexa had nothing to say, and the skill answered "Hometide couldn't find an answer".

**Workaround:** Strip reasoning; if nothing is left, speak the tool's own `speech` field, and fall back to the deterministic rules if that is empty too (`app/agent.py`, `tests/test_voice_routing.py`).

**Recommendation:** A request flag that guarantees a user-facing text block after tool use, or documentation of when Nova emits reasoning-only messages.

**Evidence:** the API logs "Bedrock gave no spoken answer, using rules" when this happens.

### Entry 16 — Given every tool, the agent proposes changes nobody asked for

**Severity:** ⚡ Medium

**Date:** 2026-10-02 · **Tool or API:** Strands Agents SDK 1.57 with `BedrockModel` (Nova Lite)

**Task attempted:** "Is anyone double booked this afternoon?" through the voice agent.

**Steps:** Gave the agent all 13 Hometide tools and a system prompt that says to propose changes only when asked.

**Expected:** The agent lists the conflict and offers to fix it.

**Actual:** It called `list_conflicts`, then `propose_pickup_swap` on its own. Proposals still need a person's yes, so nothing changed, but the family got a request it didn't ask for.

**Workaround:** Questions (no change verb) get only the read tools; `asks_for_change` in `app/agent.py`, tested in `tests/test_rhythm.py`.

**Recommendation:** A per-invocation allow-list of tools in `Agent.invoke_async`, and guidance on tool gating for agents that can change user data.

**Evidence:** `scripts/live_agent_check.py` output, tools `['list_conflicts', 'propose_pickup_swap']`.

### Entry 17 — AgentCore Memory records are not searchable right after they are written

**Severity:** ℹ️ Low

**Date:** 2026-10-02 · **Tool or API:** Amazon Bedrock AgentCore Memory, `CreateEvent` and `RetrieveMemoryRecords`

**Task attempted:** Confirm a routine, then immediately ask "what has Hometide learned?".

**Steps:** Wrote the decision as an event in the household's session; searched the routines namespace.

**Expected:** The new routine is found.

**Actual:** Long-term extraction runs asynchronously, so the search returns nothing for a while.

**Workaround:** Read recent events as a fallback, and answer from the household's own confirmed routines first (`app/rhythm.py`).

**Recommendation:** An API to write a long-term record directly when the application already knows the fact, or a documented extraction delay.

**Evidence:** `RhythmMemory.recall` fallback path, `tests/test_rhythm.py::test_voice_recalls_what_hometide_learned`.

### Entry 18 — The skill build waits on an easy-to-miss confirmation

**Severity:** ℹ️ Low

**Date:** 2026-09-30 · **Tool or API:** Alexa Skills Kit developer console (Build tab, interaction model)

**Task attempted:** Change the invocation name to "home tide" and rebuild the skill.

**Steps:** Saved the interaction model, clicked Build skill, then tested in the simulator.

**Expected:** The build starts from the Build action.

**Actual:** The build only starts after a confirmation dialog; when it was missed, the simulator kept the old model and "home tide" wasn't recognized, with no error shown.

**Workaround:** Confirm the dialog and wait for the "Build successful" status before testing.

**Recommendation:** Start the build from the first click, or show "model not built" in the simulator.

**Evidence:** the skill package in [`alexa-skill`](../alexa-skill).

### Entry 19 — Alexa+ answers "ask home tide what's on today" from its own empty calendar

**Severity:** ⚠️ High (the voice demo silently answered from the wrong source)

**Date:** 2026-10-02 · **Tool or API:** Alexa+ (developer console simulator), Alexa Skills Kit custom skill invocation

**Task attempted:** Seed a household with a full week, then ask "Alexa, ask home tide what's on today".

**Steps:** Linked the account, seeded events for today, asked the same one-shot question that had reached the skill nine times earlier the same day.

**Expected:** The request goes to the Hometide skill, which reads today's four events.

**Actual:** Alexa+ said "Checking that. Nothing's on the calendar for the rest of today." Alexa history filed the request under **Calendar**, not **Conversation**, and Railway logged no `POST /alexa`: Alexa answered from its own calendar, which has nothing linked. The family heard a confident, wrong answer that sounded like Hometide's. Follow-up questions after an answer that ended the session went back to Alexa+ the same way ("Hometide doesn't share that info through Alexa yet").

**Workaround:** Say "Alexa, open home tide" first. Alexa+ hands over ("Here's Hometide. Say 'Alexa exit'…"), and "what's on today" then reached Hometide and read the seeded day. Hometide now keeps the session open after answers inside that conversation, so follow-ups stay with Hometide (`app/alexa.py`, `tests/test_alexa.py`).

**Recommendation:** Honor an explicit "ask {invocation name}" before routing to a built-in domain, or say which service is answering ("From your Alexa calendar…") when Alexa+ answers instead of the named skill.

**Evidence:** Alexa history entries at 6:47 PM (Calendar) versus earlier Conversation entries; Railway logs with `POST /alexa` at 08:57–09:36 and 18:20–18:25 only, then 19:09–19:10 after "open home tide".

### Entry 20 — The Developer Mode code is letters and numbers, but the docs say "6-digit code"

**Severity:** ℹ️ Low

**Date:** 2026-10-03 · **Tool or API:** Vega Developer Mode on a physical Fire TV Stick (Vega OS), Vega CLI documentation

**Task attempted:** Enable Developer Mode on the Stick so the release `.vpkg` can be installed for testing.

**Steps:** Settings → My Fire TV → About (select the device name until Developer Options appears) → Developer Options → Developer Mode → Continue. Typed the code the TV showed into our setup script, which follows the docs.

**Expected:** A six-digit numeric code, as the docs say ("Enable the device using the 6-digit code displayed on your Fire TV screen").

**Actual:** The TV showed six letters and numbers (for example `1NJMC2`). Our script, written from the docs, rejected it as "not 6 digits".

**Workaround:** Accept six letters or digits (`familyos.ps1`).

**Recommendation:** Say "6-character code" in the Developer Mode docs and CLI help, and show the format in the error message when a code is rejected.

**Evidence:** PowerShell error at `familyos.ps1:142`; the regex is now `^[A-Za-z0-9]{6}$`.

### Entry 21 — `vega devmode login` can't save its token on a headless Linux host

**Severity:** ⚠️ High (blocks enabling Developer Mode from a server, VM or CI host)

**Date:** 2026-10-03 · **Tool or API:** Vega CLI (`vega devmode login`, `vega devmode enable-device`) on Ubuntu over SSH

**Task attempted:** Sign in with the Amazon Developer account from our headless Ubuntu build VM, then enable Developer Mode on the Stick.

**Steps:** Ran `vega devmode login` in an SSH session, completed the browser sign-in, then waited for the CLI.

**Expected:** The CLI stores the token and `enable-device` runs.

**Actual:** "Failed to save authentication token: failed to save access token data: The name org.freedesktop.secrets was not provided by any .service files: failed to store token in OS password management system". The sign-in had worked; only saving the token failed, so the whole flow stopped.

**Workaround:** Install `gnome-keyring` and `dbus`, then run the CLI inside `dbus-run-session` with an unlocked keyring (`familyos.ps1` does this automatically).

**Recommendation:** Fall back to an encrypted token file when no Secret Service is available (or offer a `--token-store file` option), and document the keyring requirement for Linux hosts.

**Evidence:** Terminal output from `familyos.ps1 tv` on 2026-10-03.

## Questions

Things the documentation didn't answer for us:

- Is media playback the supported way for a dashboard app to keep the display on, and will it keep working (Entry 14)?
- Can `useToastKepler` be triggered from a background component while another app is playing?
- Does Alexa+ accept Cognito's OIDC discovery document for MCP account linking, or is RFC 8414
  `oauth-authorization-server` metadata required? Is static-token linking allowed during development (Entry 8)?
- Should Alexa on a Fire TV remote reach a custom skill that is still in development? It reached ours in the
  developer console's simulator, but not from the remote on the Stick.
- How long does AgentCore Memory long-term extraction usually take after `CreateEvent` (Entry 17)?
- Is there a supported path for building Vega apps on Windows, such as WSL2 (Entries 4, 5)?
- Are `vega device screenshot` and `vega device send-key` commands planned (Entry 12)?

## Recommendations

Ranked by severity and by how many developers each would help:

1. **Give dashboard apps a user-granted "keep screen on"** (Entry 14). Until then, document media playback as
   the way a dashboard stays visible.
2. **Put the host requirements on the first page of the getting-started guide and publish a Windows path**
   (Entries 4, 5): Linux or macOS, KVM for the Vega Virtual Device, and a WSL2 guide, a ready-made VM image or an
   official EC2 recipe.
3. **Let Alexa+ honor an explicit "ask {invocation name}"**, or say which service is answering (Entry 19).
4. **Let `vega devmode login` store its token in a file when no Secret Service is available** (Entry 21).
5. **Guarantee a user-facing text block from Nova after tool use**, or document when it returns reasoning only
   (Entry 15).
6. **Document the authorization-server metadata Alexa+ accepts for MCP**, and let FastMCP expose a mountable,
   restartable ASGI app (Entry 8).
7. **In `react-tv-space-navigation`, subscribe roots that mount before the remote is configured, and ship a modal
   focus-trap primitive** (Entries 11, 13).
8. **Keep the multi-TV sample and the docs in step with each SDK release**, with CI on the sample's own checks and a
   packaging error that names `vega project update-manifest` (Entries 1, 3, 6, 7).
9. **Add `vega device send-key` and `vega device screenshot`** (Entry 12).
10. **Add a per-call tool allow-list to Strands `Agent.invoke_async`** (Entry 16).
11. Smaller fixes: weekday-only `toLocaleDateString` per ECMA-402 (Entry 10), "6-character code" in the Developer
    Mode docs (Entry 20), start the skill build from the first click (Entry 18), a synchronous AgentCore Memory write
    (Entry 17), honor the `init-context` output path (Entry 2), and JSON-schema output for Nova image inputs (Entry 9).

## Video timestamps

These development sessions weren't screen-recorded, so the entries cite logs, tests, commands and screenshots
instead. The demo video shows the result of the Entry 14 workaround in its "A living wall" chapter.

| Time | Event |
| :--- | :--- |
| — | Not recorded |

## Screen recording

- Full session: not recorded.
- Demo video, filmed on the physical Fire TV Stick: [Hometide demo (2:59)](https://www.youtube.com/watch?v=qVUTSU2Ip6w)

## Test environment

- **OS:** Windows laptop (Windows PowerShell 5.1, VirtualBox 7.2.20) with an Ubuntu VM as the Vega SDK host;
  Ubuntu over SSH for the Vega CLI
- **Device/Emulator:** Fire TV Stick 4K Select (Vega OS 2.0); Vega Virtual Device (OS 1.2) on an EC2 `c8i.2xlarge`
  with nested virtualization, Xvfb and software GL; Fire OS / Android TV emulator for the Expo build
- **SDK/API versions tested:** Vega SDK 0.24.12112, Vega CLI 1.4.2, `react-tv-space-navigation` 5.2.0, Amazon
  Bedrock Converse with `us.amazon.nova-lite-v1:0`, Strands Agents SDK 1.57, MCP Python SDK 1.27.1 (protocol
  2025-11-25), Amazon Bedrock AgentCore Memory, Alexa Skills Kit developer console
- **Runtime versions:** Yarn 4.5.0 for the TV workspace, Python 3 (FastAPI) for the API and voice agent

## What succeeded

- ✅ Vega `.vpkg` builds for armv7, aarch64 and x86_64, after the manifest fix (Entry 7)
- ✅ Every screen reachable with the remote alone on the Vega Virtual Device (Entries 11, 13)
- ✅ The release build installed and ran on a physical Fire TV Stick, after the Developer Mode fixes (Entries 20, 21)
- ✅ The wall calendar stays on screen while its weather loop plays (Entry 14 update)
- ✅ The MCP server negotiated `2025-11-25` and ran read and propose calls end to end (Entry 8)
- ✅ The custom Alexa skill with account linking, in the developer console's simulator (Entries 18, 19)
- ✅ The Strands voice agent on Nova Lite, with read-only tools for questions (Entries 15, 16)
- ✅ Routines remembered and recalled through AgentCore Memory, with a fallback for new records (Entry 17)

## What failed

- ❌ The Vega Virtual Device on the Windows laptop: no KVM inside the VM (Entry 5)
- ❌ The documented example SDK version, `0.24.9311`: "Version not found" (Entry 6)
- ❌ The multi-TV sample's own checks (Entry 3)
- ❌ Keeping a non-media app on screen without media playback (Entry 14)
- ❌ A one-shot "Alexa, ask home tide what's on today" sometimes never reached the skill (Entry 19)
- ❌ Alexa from the Fire TV remote didn't reach the in-development skill
- ❌ Live Alexa+ MCP linking: add-on access for MCP servers isn't open to us yet ([Product feedback](./PRODUCT_FEEDBACK.md#alexa-and-the-model-context-protocol))

## Appendix

### Entry template

New entries use this shape, so they keep both the guide's structure and the fields the hackathon rules ask for.

```markdown
### Entry N — Short description of the issue

**Severity:** 🔥 Critical | ⚠️ High | ⚡ Medium | ℹ️ Low

**Date:** YYYY-MM-DD · **Tool or API:**

**Task attempted:**

**Steps:**

**Expected:**

**Actual:**

**Workaround:**

**Recommendation:**

**Evidence:**
```
