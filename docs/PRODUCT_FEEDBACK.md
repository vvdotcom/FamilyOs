# Product feedback

Feedback on each Amazon and AWS tool used to build FamilyOS. Details and evidence for each issue are in the
[friction log](./FRICTION_LOG.md) (entry numbers in brackets). Measurements are in [MEASUREMENTS.md](./MEASUREMENTS.md).

## Vega SDK, Vega OS, and the Vega Virtual Device

**What was used and why?** The Vega SDK 0.24.12112 and CLI 1.4.2 (OS 1.2 target) to build the FamilyOS TV app in
React Native for Fire TV. We used `react-native-kepler` (`TVEventHandler` for remote keys), the Vega AsyncStorage
port, and `react-tv-space-navigation` for D-pad focus. The Vega Virtual Device (VVD) was used for remote-only
regression runs on an EC2 host.

**What worked well?**
- One set of React Native TV screens runs on Vega OS, on Fire OS / Android TV (Expo), and on the web for fast
  iteration.
- Builds for armv7, aarch64, and x86_64 passed manifest validation.
- `vega run-app` and `launch-app` were reliable, and cold start to a rendered Home took about 2–3 s even with
  software GL on the VVD.
- On the VVD, every screen was reachable with the remote alone after the fixes in the
  [VVD report](./VEGA_VVD_TEST_REPORT.md).
- The AsyncStorage port made it straightforward to keep pairing and state across restarts, which Amazon recommends
  now that apps can be closed when the display sleeps.

**What needs work?**
- **No way to keep the display on for a non-media app [14].** This is the biggest gap for a Skylight-style family
  display, and FR-2 proposes a user-granted permission.
- **No way to show a timed reminder during another app's playback [FR-1].**
- The sample and docs lagged the SDK: `build-kepler` naming, a missing `[os.version]` block, an unavailable
  documented SDK version, and a required generated OS module [1, 6, 7].
- The JS engine pads weekday-only `Intl` date labels with date fields [10].
- Remote input configured after the first render left the D-pad dead [11].
- Focus did not move into overlays without a manual lock-and-root pattern [13].
- The VVD needs KVM, so a Windows laptop with virtualization-based security can't run it [5]. We used an EC2
  `c8i.2xlarge` with nested virtualization.

**How was onboarding?** The CLI installed cleanly, but Windows is not a native SDK host, so we automated an Ubuntu VM
and later moved VVD runs to EC2. Pinning the SDK version from `vega sdk list-remote` was necessary. Device
automation needed `inputd-cli` for input and host-side screenshots [12].

**Would we use it again, and why?** Yes. Sharing React Native code across Vega, Fire OS, and the web let one small
team build the TV app for all three from one codebase. For always-on dashboards, a keep-awake option (FR-2) is the one change that
would matter most.

## Alexa+ and the Model Context Protocol

**What was used and why?** A FamilyOS MCP server using Streamable HTTP and protocol 2025-11-25. It is built with the
official Python SDK, publishes RFC 9728 protected-resource metadata, and exposes 10 tools. Alexa+ can read the
family schedule and chores and *propose* changes; a person confirms each one on the TV or phone.

**What worked well?** MCP maps cleanly onto a safe "propose, then confirm" design. The official MCP client negotiated
`2025-11-25`, listed all tools, and ran read and propose calls end to end. The same tools also drive a labelled
"Simulated Alexa+" through Bedrock tool use.

**What needs work?** Live Alexa+ account linking needs a public HTTPS endpoint and an OAuth 2.1 authorization
server whose metadata Alexa accepts. It isn't documented whether Cognito's OIDC discovery document is enough, or
whether RFC 8414 metadata is required. There is also no static-token option for development. The SDK's Streamable
HTTP app mounts at the root and its session manager can't restart, which needed a small wrapper [8].

**How was onboarding?** The Alexa+ MCP QuickStart was clear about the protocol, but less clear about which
authorization-server setups are accepted.

**Would we use it again, and why?** Yes. One MCP server serves Alexa+ and any other assistant, and the
permission model stays on our server.

## Amazon Bedrock (Nova Lite)

**What was used and why?** The Converse API with `us.amazon.nova-lite-v1:0` powers four features: the TV family
briefing, flyer/PDF photo imports (image and document input), chore photo checks (image input), and the simulated
Alexa+ (tool use).

**What worked well?**
- One API covered text, images, PDFs, and tool use.
- Bedrock API keys made setup a single environment variable.
- Measured cost is about $0.0001–$0.0002 per request, or $0.13–$0.51 per household per month, with 1.2–2.0 s median
  model latency.
- The model ignored an instruction planted in a test flyer during import.

**What needs work?** On simple drawn test photos, the model was cautious: 45% exact accuracy, 55% "unclear", and
0% false "done" [9]. Schema-constrained (JSON schema) output for image inputs would remove our parsing fallbacks.

**How was onboarding?** Quick: one API key and one model ID (`us.amazon.nova-lite-v1:0`, a cross-region inference
profile).

**Would we use it again, and why?** Yes. The cost is low enough to include AI in a free family product, and the
Converse API kept all four features on one code path with deterministic fallbacks.

## Amazon Cognito

**What was used and why?** A user pool (us-west-2) holds parent accounts for the hosted service. The Expo phone app
signs up and signs in directly with Cognito (`USER_AUTH` with the `PASSWORD` challenge), then exchanges the ID token
for a revocable FamilyOS session. The API verifies tokens against the pool's JWKS. The MCP server can also accept
Cognito access tokens.

**What worked well?** Standard JWTs verified with PyJWT, email verification without our own mail service, and
choice-based sign-in that works in Expo Go without a custom native build or OAuth callback.

**What needs work?** A Cognito password reset doesn't give us a hook to revoke FamilyOS sessions on other devices,
so we track that as our own follow-up. Alexa+ compatibility of Cognito's metadata is unverified (see above).

**How was onboarding?** A user pool and one public client (no secret) covered both the Expo app, which uses direct
`USER_AUTH`, and the SwiftUI prototype, which uses the hosted UI with PKCE.

**Would we use it again, and why?** Yes, for managed, verified accounts without storing passwords.

## Amazon EC2 (test host)

**What was used and why?** A `c8i.2xlarge` instance with nested virtualization, Xvfb, and software GL ran the Vega
Virtual Device, because the development laptop couldn't expose KVM.

**What worked well?** Nested virtualization on c8i ran the VVD reliably for a full remote-only regression.

**What needs work?** Software rendering is slow, and screen capture and input needed custom scripts [12].

**Would we use it again, and why?** Yes, as a shared VVD host until physical-device testing.

## How AWS services are used (AWS Builder mini-challenge)

- **Amazon Bedrock:** family briefing, flyer and PDF import, chore photo checks, and simulated Alexa+ tool use.
  Every AI result is a suggestion that a person confirms, and each feature has a deterministic fallback.
- **Amazon Cognito:** parent accounts, email verification, and token verification for the hosted API. It can
  also authorize voice connections.
- **Amazon EC2:** the Vega Virtual Device test host.

The API itself is hosted on Railway (Docker and Postgres).
