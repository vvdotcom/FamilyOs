# Developing Hometide

To run Hometide on your own computer, start with [Run it locally](../README.md#run-it-locally) in the README.

## Repository map

| Path | What it is |
|---|---|
| [`apps/vega`](../apps/vega) | Vega OS TV app (Fire TV) |
| [`apps/expo-multi-tv`](../apps/expo-multi-tv) | Fire OS / Android TV / web build of the same TV screens |
| [`packages/shared-ui`](../packages/shared-ui) | The TV screens, remote-control focus handling, and design system |
| [`packages/domain`](../packages/domain) | Shared types, conflict detection, and demo data |
| [`apps/companion`](../apps/companion) | The phone app (Expo; iOS first) and the web app built from it |
| [`services/family-agent`](../services/family-agent) | FastAPI service: household API, calendar sync, MCP voice server, Strands voice agent, rhythm engine, Bedrock features, evals |
| [`infra`](../infra) | AWS CDK: AgentCore Memory, IAM for the API, Cognito |
| [`alexa-skill`](../alexa-skill) | The "home tide" Alexa skill package |
| [`brand`](../brand) | The logo, app icons and the wall's weather scenes (rendered by script) |

Built on Amazon's React Native multi-TV sample.

## Developing on Windows (Vega SDK)

Windows isn't a native Vega SDK host, so Vega builds run in a managed Ubuntu VM:

```powershell
.\setup\verify-host.ps1
.\familyos.ps1 setup       # creates or resumes the Ubuntu VM and installs the Vega SDK
.\familyos.ps1 simulator   # Vega Virtual Device, when nested virtualization is available
.\familyos.ps1 status
.\familyos.ps1 tv                  # build and install on a Fire TV Stick (wall calendar after 5 idle minutes)
.\familyos.ps1 tv -IdleSeconds 30  # demo build for filming: the wall calendar after 30 seconds
.\familyos.ps1 tv -NoWallVideo     # still posters on the wall instead of the weather loops
.\familyos.ps1 tv-logs             # save the TV's newest crash report and Hometide's log lines to logs\
```

Setup reuses its cached Ubuntu ISO, keeps an existing VM, and resumes after interruptions. Local SSH and API
forwards bind to `127.0.0.1`. Without nested virtualization it installs the build SDK and skips the VVD, and it never
changes Hyper-V or Windows security settings. Regression checks for the bootstrap scripts:
`powershell.exe -NoProfile -File .\setup\tests\windows-bootstrap.tests.ps1`.

## References

Amazon documentation used for the Vega build (checked 2026-09-22):

- [React Native multi-TV sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample)
- [React Native multi-TV hello world](https://github.com/AmazonAppDev/react-native-multi-tv-helloworld)
- [Vega TV interfaces sample](https://github.com/AmazonAppDev/vega-tv-interfaces-sample)
- [Vega video sample](https://github.com/AmazonAppDev/vega-video-sample)
- [Vega sports sample](https://github.com/AmazonAppDev/vega-sports-app)
- [Vega audio sample](https://github.com/AmazonAppDev/vega-audio-sample)
- [Amazon Devices Builder Tools](https://developer.amazon.com/docs/vega/0.24/mcp-server)
- [Run apps on VVD or Fire TV](https://developer.amazon.com/docs/vega/0.24/run-apps)
- [Vega target OS versions](https://developer.amazon.com/docs/vega/0.24/target-os-version)
- [Vega manifest OS version](https://developer.amazon.com/docs/vega/0.24/manifest-os-version)
- [Fire TV React Native](https://developer.amazon.com/docs/fire-tv/get-started-with-react-native.html)
- [Vega SDK installation](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk)
- [Unattended Vega SDK installation](https://developer.amazon.com/docs/vega/0.24/continuous-integration)
- [Ubuntu autoinstall configuration](https://canonical-subiquity.readthedocs-hosted.com/en/latest/reference/autoinstall-reference.html)
- [VirtualBox Windows installation](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html)

## Running it on a Fire TV

### Install the release build

The [v1.0.1 release](https://github.com/vvdotcom/Hometide/releases/tag/v1.0.1) has `hometide_v1.0.1_armv7.vpkg`, a release build for a Fire TV Stick on Vega OS that talks
to the hosted demo service (`https://hometide.up.railway.app`). It isn't on the Appstore yet, so it is sideloaded:

1. Turn on Developer Mode on the Fire TV Stick (what we ran into is in [friction log](./FRICTION_LOG.md) entries 20
   and 21).
2. On a computer on the same Wi-Fi, install the [Vega SDK](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk)
   and download [`hometide_v1.0.1_armv7.vpkg`](https://github.com/vvdotcom/Hometide/releases/download/v1.0.1/hometide_v1.0.1_armv7.vpkg).
3. Install and launch it:

   ```bash
   vega exec vda connect <tv-ip>:5555
   vega device install-app --packagePath hometide_v1.0.1_armv7.vpkg
   vega device launch-app --appName com.hometide.tv.main
   ```

4. Pair it with the demo family: on the TV, Settings → **Show pairing code**; in the web app (judge login), Family →
   TV → **Pair a TV**, type the code and tap **Approve TV**.

### Build it yourself

Build the Vega app with `npx -y corepack@0.34.0 yarn build:vega` on a Vega SDK host and
install it with `vega device install-app`; on Windows, `.\familyos.ps1 tv` does both through the managed Ubuntu VM
(see [Developing on Windows](#developing-on-windows-vega-sdk)). Point the TV at your computer with
`EXPO_PUBLIC_FAMILYOS_API_URL` set to an address the TV can reach. The Fire OS build is in
[`apps/expo-multi-tv`](../apps/expo-multi-tv) (`yarn build:firetv`, through EAS).

A browser run is not Fire TV or VVD validation; those results are in [Status and device testing](./DEVICE_TESTING.md#status-and-device-testing).

## AI features with or without AWS

with no Bedrock settings, Hometide uses deterministic stand-ins, so every flow still
works: briefings are written by a deterministic provider, flyer import reads text, PDF and `.ics` files, chore checks are a demo verdict,
and AI recipes come from a small built-in cookbook. To use Amazon Bedrock, set `FAMILYOS_AI_PROVIDER=bedrock`,
`AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK` and `FAMILYOS_BEDROCK_MODEL_ID` in the root `.env` (never in an Expo
`.env`). See [the service guide](../services/family-agent/README.md).

## Windows PowerShell commands for the API

   ```powershell
   cd services\family-agent
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -e ".[dev]"
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --env-file ..\..\.env
   ```

