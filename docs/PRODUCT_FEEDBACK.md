# Product feedback

Feedback on each Amazon and AWS tool used to build Hometide (the same text goes in the Devpost Product Feedback
field). Numbers in brackets are [friction log](./FRICTION_LOG.md) entries; FR-1 and FR-2 are its
[feature requests](./FRICTION_LOG.md#feature-requests). Back to the [README](../README.md).

## Vega SDK, Vega OS, and the Vega Virtual Device

**What was used and why?** The Vega SDK 0.24.12112 and CLI 1.4.2 (OS 1.2 target) to build the Hometide TV app in
React Native for Fire TV. We used `react-native-kepler` (`TVEventHandler` for remote keys), the Vega AsyncStorage
port, and `react-tv-space-navigation` for D-pad focus. The Vega Virtual Device (VVD) was used for remote-only
regression runs on an EC2 host.

**What worked well?**
- One set of React Native TV screens runs on Vega OS and on the web for fast iteration. The same screens build
  for Fire OS / Android TV (Expo), which we have run on an emulator.
- Builds for armv7, aarch64, and x86_64 passed manifest validation.
- `vega run-app` and `launch-app` were reliable, and cold start to a rendered Home took about 2–3 s even with
  software GL on the VVD.
- On the VVD, every screen was reachable with the remote alone after the fixes in the
  [VVD report](../README.md#vega-virtual-device-regression-2026-09-28).
- The AsyncStorage port made it straightforward to keep pairing and state across restarts, which Amazon recommends
  now that apps can be closed when the display sleeps.
- On a physical Fire TV Stick (Vega OS, 3 October 2026), the same release `.vpkg` installed and launched from our
  Linux build VM, and the app ran with the real remote. Alexa from the remote didn't reach our in-development skill
  there; the skill works in the Alexa developer console's simulator.

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
- Enabling Developer Mode on hardware: the docs call it a "6-digit code", but the TV showed letters and numbers
  [20], and `vega devmode login` couldn't save its token on a headless Linux host without a desktop keyring [21].

**How was onboarding?** The CLI installed cleanly, but Windows is not a native SDK host, so we automated an Ubuntu VM
and later moved VVD runs to EC2. Pinning the SDK version from `vega sdk list-remote` was necessary. Device
automation needed `inputd-cli` for input and host-side screenshots [12].

**Would we use it again, and why?** Yes. Sharing React Native code across Vega and the web, with Fire OS next, let
one small team build the TV app from one codebase. For always-on dashboards, a keep-awake option (FR-2) is the one change that
would matter most.

## Alexa+ and the Model Context Protocol

**What was used and why?** A Hometide MCP server using Streamable HTTP and protocol 2025-11-25. It is built with the
official Python SDK, publishes RFC 9728 protected-resource metadata, and exposes 13 tools plus an MCP Apps card
(`ui://hometide/today.html`). A custom Alexa skill ("home tide") with account linking through Cognito reaches the
same tools as an MCP client, and adds an APL card on Echo Show. Through that skill (tested in the developer console's
simulator), Alexa+ can read the family schedule and chores and *propose* changes; a person confirms each one on the TV or phone.

**What worked well?** MCP maps cleanly onto a safe "propose, then confirm" design. The official MCP client negotiated
`2025-11-25`, listed all tools, and ran read and propose calls end to end. The same tools also drive a labelled
"Simulated Alexa+" through Bedrock tool use.

**What needs work?** Alexa+ add-on access for MCP servers isn't open to us yet, so a custom skill stands in for it.
For that skill, account linking works with a Cognito confidential client, the authorization-code grant, and the
three regional redirect URLs the console lists. For MCP, it isn't documented whether Cognito's OIDC discovery document is enough or RFC 8414 metadata is required, and
there is no static-token option for development. The SDK's Streamable
HTTP app mounts at the root and its session manager can't restart, which needed a small wrapper [8].

**How was onboarding?** The Alexa+ MCP QuickStart was clear about the protocol, but less clear about which
authorization-server setups are accepted.

**Would we use it again, and why?** Yes. One MCP server can serve Alexa+ once access opens, and any other
assistant today, and the permission model stays on our server.

## Alexa Skills Kit (custom skill "home tide")

**What was used and why?** A custom skill with the invocation name "home tide", account linking through Amazon
Cognito (authorization-code grant), and APL for a Hometide card on Echo Show. Its endpoint (`/alexa` on our API)
verifies Alexa's signed requests and reaches the household through our MCP server with the parent's linked token.
It works in the Alexa developer console's simulator. From our Fire TV remote it didn't reach the in-development
skill, so the Hometide phone app is how a family talks to Hometide today.

**What worked well?** Account linking worked with a Cognito confidential client and the three regional redirect URLs
the console lists. The developer console's simulator made it quick to test utterances, and APL gave Echo Show a
visual card from the same response.

**What needs work?** The build waits on an easy-to-miss confirmation, and the simulator silently keeps the old model
if it's missed [18]. With Alexa+, a one-shot "ask home tide…" was sometimes answered by Alexa's own calendar and
never reached the skill [19]; opening the skill first works.

**How was onboarding?** Clear for a basic custom skill. Account linking took longer: the redirect URLs and the
authorization-code settings had to match the Cognito client exactly.

**Would we use it again, and why?** Yes. Once published, it would put Hometide on every Echo and Fire TV remote in the house,
and it is the bridge until Alexa+ add-ons for MCP servers open up.

## Amazon Devices Builder Tools

**What was used and why?** `init-context`, to give our coding agent current Amazon device and Vega context at the
start of the project.

**What worked well?** It installed the Amazon device skills in one command.

**What needs work?** In Other/Custom mode it printed the context instead of saving it to the path we gave, and it
installed skills at the user level without asking [2].

**How was onboarding?** One command to start, but the Other/Custom mode didn't behave as documented, so we kept
current Amazon docs in [References](../README.md#references) instead.

**Would we use it again, and why?** Yes, once Other/Custom mode honors the output path, because current Vega context
saves a lot of searching.

## Amazon Bedrock (Nova Lite)

**What was used and why?** The Converse API with `us.amazon.nova-lite-v1:0` powers four features: the TV family
briefing, flyer/PDF photo imports (image and document input), chore photo checks (image input), and the voice
agent (tool use, through the Strands Agents SDK).

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

## Strands Agents SDK

**What was used and why?** The voice agent (`services/family-agent/app/agent.py`) is a Strands `Agent` with a
`BedrockModel`. Its tools are wrapped from our MCP server's tool list, so the agent, the Alexa skill and any Alexa+
client use the same tools and permission checks.

**What worked well?** Replacing our hand-written Converse loop took one small module. `PythonAgentTool` let us
wrap tools discovered at runtime (over MCP or in-process) instead of decorating Python functions, and Bedrock API
keys (`AWS_BEARER_TOKEN_BEDROCK`) worked without extra configuration.

**What needs work?** Given every tool, Nova Lite sometimes proposed a change when the user had only asked a
question, despite the system prompt. We now pass only read tools for questions. A per-call option to restrict the
tool set, and a documented maximum number of model-tool cycles, would help.

**How was onboarding?** Straightforward: install `strands-agents`, create a `BedrockModel` with the model ID we
already used, and hand it our MCP tool list wrapped as tools. Most of the work was choosing which tools each request
may see [16].

**Would we use it again, and why?** Yes. It removed our own loop code and keeps the agent provider-neutral.

## Amazon Bedrock AgentCore Memory

**What was used and why?** One memory (`hometide_family_memory`) with a semantic strategy and the namespace
`/households/{actorId}/routines`. When Hometide notices a routine, and when the family says yes or no, an event is
written under a hashed household id. The voice tool `get_learned_routines` recalls from it with a search query.

**What worked well?** The data-plane API (`CreateEvent`, `RetrieveMemoryRecords`) maps directly onto "remember what
we noticed" and "what has Hometide learned?", and namespaces per actor keep each family separate.

**What needs work?** Long-term records are extracted asynchronously, so a routine confirmed a moment ago is not
searchable yet; we read recent events as a fallback and keep a local copy of confirmed routines. A synchronous
"write a record" call for facts the app already knows would avoid that.

**How was onboarding?** The memory itself is one CDK resource (`AWS::BedrockAgentCore::Memory`), and the app talks
to it through boto3's `bedrock-agentcore` client. The part that took time was learning that long-term records appear
asynchronously [17].

**Would we use it again, and why?** Yes, as long-term memory that outlives a single voice session.

## AWS CDK (CloudFormation)

**What was used and why?** `infra/` defines the AgentCore Memory, the API's IAM user (Nova models and one memory
only) with its key in Secrets Manager, and the Cognito user pool, domain and app clients, with Jest assertion tests.

**What worked well?** The L1 `AWS::BedrockAgentCore::Memory` resource was available in aws-cdk-lib, and assertion
tests caught a wrong auth-flow order before anything was deployed.

**What needs work?** Adopting an existing Cognito pool needs `cdk import` with each physical id typed in by hand.

**How was onboarding?** Quick for new resources: `npx cdk deploy` from AWS CloudShell, with no local AWS setup.
Importing the Cognito pool we had created by hand earlier was the slow part.

**Would we use it again, and why?** Yes. The AWS pieces are reviewable, tested code instead of console clicks.

## Amazon Cognito

**What was used and why?** A user pool (us-west-2) holds parent accounts for the hosted service. The Expo phone app
signs up and signs in directly with Cognito (`USER_AUTH` with the `PASSWORD` challenge), then exchanges the ID token
for a revocable Hometide session. The API verifies tokens against the pool's JWKS. The MCP server can also accept
Cognito access tokens.

**What worked well?** Standard JWTs verified with PyJWT, email verification without our own mail service, and
choice-based sign-in that works in Expo Go without a custom native build or OAuth callback.

**What needs work?** A Cognito password reset doesn't give us a hook to revoke Hometide sessions on other devices,
so we track that as our own follow-up. Alexa+ compatibility of Cognito's metadata is unverified (see above).

**How was onboarding?** A user pool and one public client (no secret) covered the Expo app, which uses direct
`USER_AUTH`. A second, confidential client handles Alexa account linking.

**Would we use it again, and why?** Yes, for managed, verified accounts without storing passwords.

## Amazon EC2 (test host)

**What was used and why?** A `c8i.2xlarge` instance with nested virtualization, Xvfb, and software GL ran the Vega
Virtual Device, because the development laptop couldn't expose KVM.

**What worked well?** Nested virtualization on c8i ran the VVD reliably for a full remote-only regression.

**What needs work?** Software rendering is slow, and screen capture and input needed custom scripts [12].

**How was onboarding?** One user-data script installs the Vega SDK, a virtual display and a browser-based desktop
unattended, and the instance shuts itself down after 8 hours to cap the cost. Finding that the VVD needs OpenGL
through Mesa's software renderer (not `--no-gl-accel`) took some trial and error.

**Would we use it again, and why?** Yes, as a shared VVD host until physical-device testing.

## How AWS services are used (AWS Builder mini-challenge)

- **Amazon Bedrock (Nova Lite):** the voice agent's tool use, the family briefing, flyer and PDF import, and chore
  photo checks. Every AI result is a suggestion that a person confirms, and each feature has a deterministic
  fallback.
- **Strands Agents SDK:** the voice agent's model-tool loop, over the same tools the MCP server exposes.
- **Amazon Bedrock AgentCore Memory:** the routines Hometide notices and the family's decisions, recalled in later
  sessions ("What has Hometide learned?").
- **Amazon Cognito:** parent accounts, email verification, Alexa account linking, and bearer tokens for MCP.
- **AWS IAM, Secrets Manager and CloudFormation (CDK):** a least-privilege identity for the API and all of the above
  as tested code in `infra/`.
- **Amazon EC2:** the Vega Virtual Device test host.

The API itself is hosted on Railway (Docker and Postgres). The architecture is described in [Architecture](../README.md#architecture).
