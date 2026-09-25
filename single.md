# FamilyOS — Codex Build Specification
## AI-Powered Family Command Center for Amazon Fire TV / Vega OS

> **Purpose of this file:** This is the single source of truth for an AI coding agent (Codex) to build the project locally from an empty working directory through a demo-ready Fire TV application. Follow the phases in order. Do not skip acceptance tests. Keep the application runnable after every phase.
>
> **Working product name:** `FamilyOS`
>
> **Primary hackathon track:** Fire TV  
> **Optional mini challenge:** AWS Builder  
> **Primary target:** Vega OS on Fire TV  
> **Secondary target:** Fire OS through the shared React Native TV codebase  
> **Initial execution target:** Vega Virtual Device (VVD) when the development host supports it  
> **Final execution target:** Actual Fire TV hardware

---

# 0. Codex Operating Contract

Codex must treat this document as an implementation contract.

## 0.1 Required behavior

1. Read this complete file before creating or modifying code.
2. Work feature-by-feature in the order defined here.
3. Keep the app buildable and runnable after each story.
4. Add automated tests alongside production code.
5. Never silently replace a required feature with a static screenshot.
6. Never create fake integrations that are presented as real.
7. It is acceptable to use deterministic local/mock providers during early phases, but:
   - they must implement the same interface as the real provider;
   - the UI must clearly indicate demo/mock state in developer mode;
   - production adapters must be wired before the final hackathon demo where required.
8. Prefer small modules over giant screen components.
9. Do not hard-code secrets, tokens, API keys, OAuth credentials, or personal calendar data.
10. Do not put “Codex”, “AI-generated code”, hackathon-development notes, internal prompts, or implementation-agent branding in the customer-facing UI.
11. Use TypeScript strict mode for all React Native code.
12. All interactive controls must be usable using a TV remote. Mouse/touch must never be the only interaction path.
13. A feature is not complete until its acceptance criteria pass.
14. If Amazon APIs or SDK behavior differs from this document, current Amazon documentation is the source of truth. Record the difference in `docs/FRICTION_LOG.md`.
15. Do not guess Vega-specific APIs. Use Amazon Devices Builder Tools or current Amazon documentation before implementing platform-specific behavior.

## 0.2 Definition of “done”

The project is done when all of the following are true:

- The application builds from a clean checkout.
- On Windows, the automated `familyos.ps1 setup` path can provision the Ubuntu/Vega development environment without requiring manual VM construction.
- On Windows, `familyos.ps1 simulator` is the normal one-command simulator workflow after initial provisioning.
- The core app runs on the Vega Virtual Device on a supported host or supported Ubuntu guest.
- The same shared UI works in the web development target for quick iteration.
- The project can produce a Vega `.vpkg`.
- The application is run and tested on actual Fire TV hardware before final submission.
- Remote D-pad navigation works throughout.
- Focus never becomes invisible or trapped.
- Core calendar, chores, routines, AI briefing, conflict detection, and proposed-action flows work.
- Demo seed data can reproduce the complete three-minute judging demo without depending on live third-party services.
- When AWS integration is enabled, the app can produce AI briefings through the backend without putting AWS credentials on the TV.
- Unit tests, component tests, and core backend tests pass.
- README contains setup, simulator, hardware, testing, and demo instructions.
- Repository contains the hackathon feedback/friction-log material described later in this spec.

---

# 1. Product Definition

## 1.1 One-sentence pitch

**FamilyOS turns a Fire TV into an AI-powered family command center that understands the household schedule, identifies conflicts, prepares the family for upcoming events, and lets people act using a TV remote or compatible voice workflow.**

## 1.2 Mental model

The product can initially be understood as:

**“Skylight-style family organization for the Fire TV, upgraded from a passive calendar into a proactive household coordinator.”**

Do not copy Skylight branding, visual design, content, language, proprietary behavior, or assets. Build an original Fire TV-native product.

## 1.3 Customer problem

Families often have:

- multiple calendars;
- school and activity schedules;
- chores and routines;
- appointments;
- pickup/drop-off responsibilities;
- meal planning;
- reminders scattered across phones.

A phone is private and requires someone to open an app.

A TV is:

- shared;
- large;
- visible;
- already in many homes;
- naturally suited to ambient household information.

FamilyOS makes an existing Fire TV useful as a shared family coordination surface instead of requiring dedicated calendar hardware.

## 1.4 Product differentiation

Do **not** stop at “calendar on a TV.”

The differentiating behavior is:

### Passive display

> Soccer — 5:00 PM

### FamilyOS

> Soccer starts at 5:00 PM. Leave by 4:25 PM. Rain is expected. Emma still needs her water bottle. Dad is assigned to drive.

And:

> Mom’s dentist appointment overlaps Emma’s 3:15 PM pickup. Dad is free. Assign pickup to Dad?

The system must distinguish:

- **facts** from household data;
- **deterministic conflicts** detected by code;
- **AI-generated summaries**;
- **proposed actions** that require confirmation.

The LLM must not be the source of truth for schedule conflicts or destructive actions.

---

# 2. MVP Scope

The MVP must contain these seven capabilities.

## 2.1 Family Dashboard

A 10-foot TV UI showing:

- current date/time;
- greeting;
- weather summary;
- today’s events;
- next household event;
- family member availability;
- active chores;
- AI family briefing;
- detected conflicts;
- contextual actions.

## 2.2 Shared Family Calendar

Support:

- day view;
- week view;
- family-member color/identity indicators;
- event details;
- owner/participants;
- location;
- start/end time;
- responsibility;
- optional preparation checklist.

MVP may use seeded data first.

Provider architecture must support adding Google Calendar later without rewriting the screens.

## 2.3 Chores and Routines

Support:

- assigned family member;
- due date/time;
- recurring state;
- completion;
- points/reward metadata;
- morning/evening routine grouping.

## 2.4 Deterministic Conflict Detection

Examples:

- overlapping appointments;
- pickup responsibility during another event;
- two events assigned to the same adult with overlapping travel windows;
- event preparation item incomplete near departure time.

Conflict detection must be code-based, testable, and deterministic.

## 2.5 AI Family Briefing

AI receives normalized household context and returns a concise structured briefing.

Example:

- “Busy afternoon today.”
- “Emma has soccer at 5:00 PM.”
- “A pickup conflict needs attention.”
- “Rain is likely around practice.”
- “Two chores remain before dinner.”

AI must never mutate household state directly.

## 2.6 Action Proposal + Confirmation

The system can propose actions such as:

- reassign pickup;
- complete a chore;
- add a reminder;
- acknowledge a conflict;
- snooze a suggestion.

Every state-changing proposal must be shown visually and require explicit user confirmation.

## 2.7 Ambient TV Mode

After inactivity, dashboard enters an ambient mode with:

- calendar;
- next event;
- family photos using bundled demo assets;
- current family status;
- low-motion transitions.

A remote key returns to interactive mode.

---

# 3. Non-Goals for MVP

Do not spend MVP time building:

- a social network;
- full chat history;
- a general-purpose AI chatbot;
- a video streaming feature;
- real-time GPS family tracking;
- home surveillance;
- automatic purchases;
- unsupervised calendar modifications;
- a full mobile app;
- proprietary voice transcription;
- complex parental-control systems;
- smart-home device control.

Those are post-MVP possibilities.

---

# 4. Platform Strategy

## 4.1 Base project

Use Amazon’s official multi-TV sample as the starting architecture:

`https://github.com/AmazonAppDev/react-native-multi-tv-app-sample`

Reason:

- shared React Native TV UI;
- dedicated Vega OS application;
- Expo TV target;
- Fire OS / Android TV support;
- TV focus management patterns;
- remote-control handling;
- platform-specific files;
- web target for fast development.

Do **not** build from a generic phone-oriented React Native template unless the Amazon sample becomes unusable.

## 4.2 Reference repositories

Keep these references in `docs/REFERENCES.md`:

- https://github.com/AmazonAppDev/react-native-multi-tv-app-sample
- https://github.com/AmazonAppDev/react-native-multi-tv-helloworld
- https://github.com/AmazonAppDev/vega-tv-interfaces-sample
- https://github.com/AmazonAppDev/vega-video-sample
- https://github.com/AmazonAppDev/vega-sports-app
- https://github.com/AmazonAppDev/vega-audio-sample
- https://developer.amazon.com/docs/vega/0.24/mcp-server
- https://developer.amazon.com/docs/vega/0.24/run-apps
- https://developer.amazon.com/docs/vega/0.24/target-os-version
- https://developer.amazon.com/docs/fire-tv/get-started-with-react-native.html

## 4.3 Host Support and Automatic Windows Vega Environment

Codex must identify the host OS and architecture before doing platform-specific work.

Create:

```text
setup/windows-bootstrap.ps1
setup/ubuntu-provision.sh
setup/verify-host.ps1
setup/verify-kvm.sh
setup/install-vega.sh
setup/build-vega.sh
setup/launch-vvd.sh
setup/sync-repo.ps1
familyos.ps1
```

The Windows experience must be **automation-first**. A Windows developer should not be required to manually install Ubuntu, configure KVM, copy the repository, install Vega, or repeatedly type VirtualBox commands.

### Official host reality

The Vega SDK itself must run on a currently supported host such as:

- supported macOS host; or
- supported Ubuntu x86_64 host.

Windows is not treated as a native Vega SDK host.

Therefore, on Windows the project must automatically create a supported Ubuntu development guest and run Vega inside that guest.

### Preferred Windows topology

```text
Windows host
    |
    +-- Codex / PowerShell orchestrator
    |
    +-- VirtualBox
          |
          +-- Ubuntu 24.04 LTS x86_64
                |
                +-- Git / Node / Yarn / Python
                +-- KVM
                +-- Amazon Devices Builder Tools
                +-- Vega SDK
                +-- Vega Virtual Device
                +-- FamilyOS source/build
```

The user should continue using Windows as the main desktop OS.

### 4.3.1 Windows host preflight

`setup/verify-host.ps1` must report:

- Windows version;
- CPU architecture;
- total RAM;
- free disk;
- hardware virtualization status when detectable;
- VirtualBox installation/status;
- Git availability;
- PowerShell version;
- whether the FamilyOS Vega VM already exists;
- whether nested virtualization is configured.

The script must distinguish:

```text
READY
NEEDS_ADMIN_APPROVAL
NEEDS_BIOS_VIRTUALIZATION
NEEDS_VM_CREATION
VM_READY
```

It must not silently alter BIOS/UEFI settings.

### 4.3.2 Human actions that may still be required

Codex may require the user to perform only actions that automation cannot legitimately bypass, especially:

1. approve a Windows UAC/admin prompt;
2. enable Intel VT-x / AMD-V / SVM in BIOS/UEFI if disabled;
3. reboot Windows if an installer or virtualization change explicitly requires it;
4. approve a first-party installer/license screen if unattended installation is unavailable.

Do not describe ordinary script output as requiring manual work.

### 4.3.3 Do not weaken Windows security automatically

Codex must **not** silently disable or alter:

- Microsoft Defender;
- Memory Integrity;
- Device Guard;
- Credential Guard;
- Hyper-V;
- WSL;
- Docker Desktop virtualization;
- firewall protections;
- Secure Boot.

If any of these conflicts with nested virtualization, Codex must:

1. detect the problem;
2. gather enough evidence to identify the likely conflict;
3. explain the minimal change;
4. stop before making a system-wide security change unless the user explicitly authorizes it.

### 4.3.4 Automatic VirtualBox installation

`setup/windows-bootstrap.ps1` must:

1. check whether a compatible VirtualBox version is installed;
2. if absent, download/install it using an available trusted Windows package method or the official installer;
3. verify `VBoxManage` works;
4. avoid reinstalling if already present.

Installation must be idempotent.

If package-manager installation is available, prefer it over browser/manual steps.

### 4.3.5 Automatic Ubuntu image acquisition

Use Ubuntu 24.04 LTS x86_64 unless current Amazon Vega documentation requires another supported Ubuntu release.

The bootstrap script must:

1. download the official Ubuntu image when not cached;
2. store it under a predictable cache directory;
3. verify file integrity using an official checksum when practical;
4. reuse the image on subsequent runs.

Suggested Windows cache:

```text
%LOCALAPPDATA%\FamilyOS\cache\
```

Do not commit the ISO into Git.

### 4.3.6 Automatic VM creation

Default VM name:

```text
FamilyOS-Vega
```

Recommended defaults when hardware permits:

```text
vCPU:             6
RAM:              12288 MB
Disk:             80 GB dynamic
Network:          NAT
EFI:              enabled where appropriate
Nested VT-x/AMD-V enabled
```

If host resources are lower, calculate safer values.

Rules:

- leave enough memory/CPU for Windows;
- never allocate all host CPUs;
- never allocate more than approximately half to two-thirds of host RAM without a clear reason;
- minimum recommended guest RAM for this stack: 8 GB;
- warn if host resources are likely inadequate.

Use `VBoxManage` rather than requiring the user to click through the VirtualBox GUI.

Enable nested virtualization using the supported VirtualBox CLI equivalent, such as:

```powershell
VBoxManage modifyvm "FamilyOS-Vega" --nested-hw-virt on
```

Verify the setting afterward.

### 4.3.7 Unattended Ubuntu installation

Prefer VirtualBox unattended installation or an equivalent reproducible automated method.

The bootstrap must:

1. create VM;
2. attach Ubuntu image;
3. configure unattended user;
4. install Ubuntu;
5. boot guest;
6. wait for guest readiness;
7. establish SSH connectivity;
8. continue provisioning automatically.

Do not print guest passwords into logs.

Credentials used solely for the local dev VM must be generated or requested securely and stored outside Git.

### 4.3.8 VM networking

The Windows orchestrator must be able to reach the Ubuntu guest over SSH.

Preferred options:

1. NAT + explicit SSH port forwarding; or
2. host-only adapter plus NAT for internet access.

Choose the simpler reliable option for the installed VirtualBox version.

Expose only required ports.

Typical local mappings may include:

```text
Windows localhost:2222 -> Ubuntu:22
Windows localhost:8787 -> Ubuntu:8787
```

Do not expose development services to the public network unnecessarily.

### 4.3.9 Automatic Ubuntu provisioning

After SSH is available, `setup/ubuntu-provision.sh` must install/configure:

```text
git
curl
ca-certificates
build-essential
Python
Python venv tooling
Node.js version required by starter
Yarn/package manager required by starter
OpenJDK version required by starter
openssh-server
qemu-kvm
cpu-checker
other Vega prerequisites from current Amazon docs
```

Do not blindly install latest versions if the official starter pins or requires specific versions.

### 4.3.10 KVM hard gate

Before installing/launching VVD, run:

```bash
kvm-ok
```

Also verify:

```bash
test -e /dev/kvm
```

and, where useful:

```bash
egrep -c '(vmx|svm)' /proc/cpuinfo
```

Success condition:

```text
/dev/kvm exists
KVM acceleration can be used
```

If KVM fails:

1. do not pretend VVD is usable;
2. diagnose whether nested virtualization reached Ubuntu;
3. inspect VirtualBox nested virtualization setting;
4. inspect whether the host hypervisor configuration is preventing nesting;
5. print a focused remediation;
6. continue all non-VVD FamilyOS work.

### 4.3.11 Automatic Vega installation

`setup/install-vega.sh` must:

1. check whether `vega` already exists;
2. install Vega using the current official Amazon-supported method;
3. source/configure Vega environment;
4. persist required environment setup for non-interactive SSH sessions;
5. verify:

```bash
vega --version
```

6. verify VVD-related commands are discoverable.

Do not reinstall the SDK on every run.

Before using installer URLs or command flags, Codex must compare them with current Amazon documentation.

### 4.3.12 Repository location

For reliability, keep the working FamilyOS repository on the Ubuntu guest’s native Linux filesystem rather than developing directly from a VirtualBox shared folder.

Preferred guest path:

```text
~/projects/familyos
```

The Windows orchestrator may:

- clone the repository into the guest; or
- synchronize changed files from Windows to the guest.

Use a `.familyos-syncignore` or equivalent to avoid copying:

```text
node_modules
.venv
build outputs
SDK files
.git objects when not needed
```

Prefer Git as the source-of-truth sync mechanism once a remote exists.

### 4.3.13 One-command Windows orchestrator

Create root command wrapper:

```text
familyos.ps1
```

Required commands:

```powershell
.\familyos.ps1 setup
.\familyos.ps1 status
.\familyos.ps1 start
.\familyos.ps1 stop
.\familyos.ps1 sync
.\familyos.ps1 test
.\familyos.ps1 build
.\familyos.ps1 simulator
.\familyos.ps1 reset-simulator
```

Expected behaviors:

### `setup`

```text
preflight
-> install/check VirtualBox
-> obtain Ubuntu
-> create/reuse VM
-> enable nested virtualization
-> unattended install if needed
-> establish SSH
-> provision Ubuntu
-> verify KVM
-> install/check Vega
-> place/sync FamilyOS repo
-> verify toolchain
```

### `status`

Report:

```text
Windows virtualization
VirtualBox
VM power state
SSH
KVM
Vega CLI
VVD state
FamilyOS backend state
latest Vega package state
```

Use readable pass/fail/warn output.

### `start`

```text
start VM if stopped
-> wait for SSH
-> verify guest health
```

### `sync`

```text
synchronize source into Ubuntu guest
```

### `test`

```text
sync
-> run JS/TS tests
-> run backend tests
-> lint
-> typecheck
```

### `build`

```text
start
-> sync
-> test
-> build Vega .vpkg
```

### `simulator`

This is the normal daily command.

```text
start VM if needed
-> wait for SSH
-> verify KVM
-> sync latest source
-> ensure backend is running
-> build Vega package if stale
-> ensure VVD is running
-> install/update latest FamilyOS package
-> launch FamilyOS in VVD
```

### `stop`

Gracefully stop development services and shut down the Ubuntu VM.

### `reset-simulator`

Reset/recreate only simulator-related state where safe. Do not destroy the entire development VM unless a separate explicitly destructive command is used.

### 4.3.14 Automatic recovery behavior

The orchestrator must be self-healing for common non-destructive failures.

Examples:

```text
VM off
-> start VM

SSH not ready
-> wait/retry with timeout

backend stopped
-> restart backend

Vega CLI missing
-> run install/check step

source newer than .vpkg
-> rebuild package

VVD stopped
-> start VVD

FamilyOS not installed in VVD
-> install package

FamilyOS package stale
-> reinstall latest package
```

Use bounded retries and meaningful errors.

Do not create infinite loops.

### 4.3.15 State file

Maintain non-secret automation state under:

```text
.familyos/
```

Example:

```text
.familyos/
├── vm.json
├── paths.json
├── setup-state.json
└── logs/
```

Add secret-bearing files to `.gitignore`.

State may include:

- VM name;
- forwarded SSH port;
- guest repo path;
- last successful provisioning version;
- Vega SDK version detected;
- last built package path.

### 4.3.16 Provisioning version

Create a provisioning version constant.

Example:

```text
FAMILYOS_PROVISION_VERSION=1
```

When provisioning logic changes, increment it.

`setup` should only rerun required migration steps rather than destroying the VM.

### 4.3.17 Logging

Automation logs belong under:

```text
.familyos/logs/
```

Logs must:

- timestamp major steps;
- redact passwords/tokens;
- show failed command;
- show exit code;
- show recommended remediation.

### 4.3.18 Destructive actions

Commands that destroy or recreate the VM must never happen implicitly.

If provided, use an explicit command such as:

```powershell
.\familyos.ps1 destroy-dev-vm
```

It must:

1. clearly state the VM and disk to be deleted;
2. require explicit user confirmation unless a dedicated force flag was intentionally supplied;
3. never delete the Git source-of-truth repository without separate confirmation.

### 4.3.19 macOS/native Ubuntu behavior

If Codex is already running on a supported native macOS or Ubuntu host:

- skip VirtualBox automation;
- install/check Vega natively;
- retain the same `familyos` workflow concepts where practical.

Do not create an unnecessary VM.

### 4.3.20 WSL policy

Do not make WSL the default Vega path.

WSL may still be used for unrelated local tooling if the developer wants it, but the automated VVD path on Windows is:

```text
Windows -> VirtualBox -> supported Ubuntu guest -> KVM -> VVD
```

unless current Amazon documentation later provides a simpler officially supported Windows route.

### 4.3.21 Automation acceptance criteria

Windows bootstrap is complete only when:

- host preflight succeeds;
- VirtualBox is installed or verified;
- `FamilyOS-Vega` VM exists;
- Ubuntu boots unattended;
- SSH succeeds;
- provisioning succeeds;
- `/dev/kvm` exists;
- `kvm-ok` succeeds;
- Vega CLI responds;
- the repo exists inside Ubuntu;
- a repeat `setup` run is idempotent;
- `.\familyos.ps1 status` gives a complete health report.

The VVD portion is complete only when:

- Vega Virtual Device starts;
- FamilyOS `.vpkg` builds;
- package installs;
- FamilyOS launches;
- simulator can be relaunched by `.\familyos.ps1 simulator` without repeating manual infrastructure setup.

---

# 5. Amazon Devices Builder Tools

Before implementing Vega-specific behavior, initialize Amazon Devices Builder Tools.

Run:

```bash
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context
```

If the tool asks which agent is being used and Codex is not explicitly listed, choose **Other/Custom** rather than pretending Codex is one of the named agents.

Then run:

```bash
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status
```

Builder Tools are a development aid, not a runtime dependency of FamilyOS.

If MCP integration is unavailable to the coding agent:

- keep the generated steering/context documentation;
- use current Amazon docs as source of truth;
- do not block general feature work;
- before any Vega-specific implementation, verify the behavior through the current Amazon docs.

Record tool/documentation friction in:

```text
docs/FRICTION_LOG.md
```

This friction log is also useful for hackathon bonus scoring.

---

# 6. Repository Layout

Use a monorepo structure compatible with the official Amazon sample.

Target shape:

```text
familyos/
├── apps/
│   ├── expo-multi-tv/            # Fire OS/Android TV/web development target
│   └── vega/                     # Vega OS Fire TV target
├── packages/
│   ├── shared-ui/
│   │   └── src/
│   │       ├── components/
│   │       ├── screens/
│   │       ├── navigation/
│   │       ├── focus/
│   │       ├── hooks/
│   │       ├── theme/
│   │       └── platform/
│   ├── domain/
│   │   └── src/
│   │       ├── models/
│   │       ├── conflicts/
│   │       ├── schedules/
│   │       ├── actions/
│   │       └── selectors/
│   ├── data/
│   │   └── src/
│   │       ├── repositories/
│   │       ├── providers/
│   │       ├── demo/
│   │       └── persistence/
│   └── api-client/
│       └── src/
├── services/
│   └── family-agent/
│       ├── app/
│       │   ├── main.py
│       │   ├── api/
│       │   ├── models/
│       │   ├── agents/
│       │   ├── tools/
│       │   ├── providers/
│       │   └── services/
│       ├── tests/
│       ├── pyproject.toml
│       └── .env.example
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEMO_SCRIPT.md
│   ├── FIRE_TV_TESTING.md
│   ├── FRICTION_LOG.md
│   ├── PRODUCT_FEEDBACK.md
│   ├── PRIVACY.md
│   └── REFERENCES.md
├── setup/
│   ├── windows-bootstrap.ps1
│   ├── verify-host.ps1
│   ├── ubuntu-provision.sh
│   ├── verify-kvm.sh
│   ├── install-vega.sh
│   ├── build-vega.sh
│   ├── launch-vvd.sh
│   └── sync-repo.ps1
├── scripts/
│   ├── check-dev-host.sh
│   ├── check-dev-host.ps1
│   ├── seed-demo-data.*
│   └── verify-demo.*
├── .familyos/                    # generated local state; mostly gitignored
├── familyos.ps1                  # Windows one-command orchestrator
├── .familyos-syncignore
├── .env.example
├── README.md
└── single.md
```

If the official sample has changed, adapt to its current structure rather than forcing this exact tree.

---

# 7. Technology Choices

## 7.1 TV client

Preferred:

- React Native
- TypeScript
- official Amazon multi-TV sample architecture
- existing sample navigation/focus stack
- platform-specific `.kepler.ts` / Fire OS implementations where needed

Use the versions pinned by the official starter and its lockfile. Do not arbitrarily upgrade core TV/Vega dependencies during the hackathon unless required.

## 7.2 Backend

Use:

- Python
- FastAPI
- Pydantic
- pytest

Reason:

- clean local API;
- easy deterministic service testing;
- easy future AWS deployment;
- compatible with Python agent tooling.

## 7.3 AI provider architecture

Create this interface:

```python
class FamilyBriefingProvider(Protocol):
    async def generate_briefing(
        self,
        context: HouseholdContext
    ) -> FamilyBriefing:
        ...
```

Implement:

1. `DeterministicBriefingProvider`
   - default for tests/offline demo;
   - no LLM;
   - uses normalized context;
   - must always work.

2. `BedrockBriefingProvider`
   - enabled by environment configuration;
   - credentials remain backend-side;
   - returns the same structured schema.

Optional later:

3. Strands/AgentCore-based orchestration provider.

The TV must never call Bedrock directly.

## 7.4 Local persistence

For MVP client state, use a small repository abstraction.

Recommended:

- JSON seed data for demo;
- persistent local client settings where appropriate;
- backend in-memory or SQLite persistence for local mode.

Do not make DynamoDB mandatory for local development.

Production AWS storage may be added later behind the same repository layer.

---

# 8. Domain Model

Create strict domain types.

## 8.1 Family

```ts
type Family = {
  id: string;
  name: string;
  timezone: string;
  memberIds: string[];
};
```

## 8.2 Family member

```ts
type FamilyMember = {
  id: string;
  displayName: string;
  role: "adult" | "child" | "other";
  avatarAsset?: string;
  calendarColorKey: string;
};
```

Do not encode sensitive attributes that are unnecessary for scheduling.

## 8.3 Calendar event

```ts
type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  ownerId: string;
  participantIds: string[];
  location?: {
    name: string;
    address?: string;
  };
  category:
    | "school"
    | "work"
    | "medical"
    | "sports"
    | "family"
    | "meal"
    | "other";
  responsibility?: {
    type: "pickup" | "dropoff" | "drive" | "attend" | "prepare";
    assignedMemberId?: string;
  };
  checklist?: ChecklistItem[];
  source: "demo" | "local" | "google" | "outlook";
};
```

## 8.4 Chore

```ts
type Chore = {
  id: string;
  title: string;
  assigneeId: string;
  dueAt?: string;
  recurrence?: string;
  status: "todo" | "done" | "skipped";
  points?: number;
};
```

## 8.5 Routine

```ts
type Routine = {
  id: string;
  title: string;
  period: "morning" | "afternoon" | "evening";
  memberId?: string;
  steps: RoutineStep[];
};
```

## 8.6 Conflict

```ts
type Conflict = {
  id: string;
  severity: "info" | "warning" | "critical";
  type:
    | "event_overlap"
    | "responsibility_overlap"
    | "travel_buffer"
    | "prep_incomplete";
  title: string;
  description: string;
  affectedEventIds: string[];
  affectedMemberIds: string[];
  suggestedActionIds: string[];
  detectedAt: string;
};
```

## 8.7 Proposed action

```ts
type ProposedAction = {
  id: string;
  type:
    | "reassign_responsibility"
    | "complete_chore"
    | "acknowledge_conflict"
    | "create_reminder";
  title: string;
  description: string;
  payload: Record<string, unknown>;
  requiresConfirmation: true;
  status: "proposed" | "confirmed" | "cancelled" | "completed";
};
```

## 8.8 Family briefing

```ts
type FamilyBriefing = {
  headline: string;
  summary: string;
  highlights: Array<{
    kind: "event" | "conflict" | "chore" | "weather" | "prep";
    text: string;
    referenceId?: string;
  }>;
  generatedAt: string;
  provider: "deterministic" | "bedrock";
};
```

Use runtime schema validation for server responses.

---

# 9. Demo Household

Create synthetic demo data.

Do not use real family names or personal schedules.

Suggested seed household:

- Alex — adult
- Jordan — adult
- Emma — child
- Leo — child

Example day:

```text
07:45  School drop-off — Alex
09:00  Alex work block
14:45  Jordan dentist appointment — ends 15:30
15:15  Emma school pickup — assigned Jordan
17:00  Emma soccer practice
18:30  Dinner
20:00  Evening routine
```

Conflict:

```text
Jordan dentist: 14:45–15:30
Emma pickup: 15:15
Alex: available at 15:15
```

Suggested resolution:

```text
Reassign Emma pickup from Jordan to Alex
```

Soccer preparation:

```text
Cleats       done
Uniform      done
Water bottle missing
Rain jacket  missing when demo weather is rainy
```

This exact dataset must allow the demo to work offline.

---

# 10. FamilyOS UI/UX Direction — Warm, Playful, Child-Friendly, TV-Native

## 10.1 Design Goal

FamilyOS should feel like a premium family organizer designed for homes with young children:

- warm;
- cheerful;
- calm;
- highly legible;
- visually friendly without looking childish;
- simple enough for a child to understand;
- polished enough for parents to trust;
- immediately readable from across a living room.

The visual reference should be the **clean, family-oriented digital-calendar category**: large date/calendar content, generous spacing, rounded cards, simple iconography, soft colors, friendly typography, and obvious household-member ownership.

However, FamilyOS must use its own brand system, components, iconography, color palette, wording, and motion. Do not copy competitor logos, proprietary illustrations, screenshots, distinctive branded assets, or pixel-for-pixel compositions.

The intended feeling is:

```text
Skylight-level simplicity
        +
premium children's educational product warmth
        +
Fire TV-native 10-foot usability
        +
FamilyOS original visual identity
```

## 10.2 Core Visual Personality

Use these words to evaluate every screen:

```text
Warm
Playful
Safe
Organized
Friendly
Clear
Calm
Modern
Family-first
```

Avoid:

```text
Corporate
Cold
Cyberpunk
Gaming-heavy
Neon
Dense
Enterprise-dashboard
Phone-app-on-TV
Overly childish
Toy-like
```

---

## 10.3 FamilyOS Color System

Use a **warm midnight + playful pastel accent** system.

The UI should primarily use a dark, soft TV-friendly background with colorful family cards. This gives the app personality while maintaining strong contrast and avoiding a glaring white television screen at night.

### Core colors

```text
Family Night      #17233C
Deep Navy         #22304F
Soft Cream        #FFF8EE
Cloud White       #FFFFFF
Warm Gray         #AEB7C8
Charcoal Text     #263247
```

### Playful family accent colors

```text
Sky Blue          #65C7F7
Sunshine Yellow   #FFD166
Coral             #FF7A7A
Mint              #73D6A5
Lavender          #A98BF3
Peach             #FFB38A
```

### Status colors

```text
Success           #63D79A
Warning           #FFD166
Critical          #FF6B6B
Info               #65C7F7
```

### Surface colors

```text
Primary Surface       #22304F
Secondary Surface     #2A395C
Elevated Surface      #314267
Light Card            #FFF8EE
Muted Divider         rgba(255,255,255,0.10)
Focus Glow            #FFFFFF
```

### Color usage rules

1. `Family Night` is the default full-screen background.
2. Do not make the interface rainbow-colored everywhere.
3. Use one accent color per family member.
4. Use color to communicate ownership and status, not decoration alone.
5. Every member color must also include:
   - avatar;
   - initials;
   - icon;
   - label.
6. Never encode meaning only through color.
7. The AI briefing card may use `Soft Cream` with dark text to visually distinguish intelligence from ordinary schedule cards.
8. Warning/conflict states must use warm yellow or coral, never aggressive flashing red.
9. Chore completion should feel positive:
   - mint;
   - subtle check animation;
   - no confetti explosion by default.
10. Keep large background areas dark enough for extended TV display.

---

## 10.4 Family Member Color Assignment

Demo household defaults:

```text
Alex     Sky Blue       #65C7F7
Jordan   Coral          #FF7A7A
Emma     Lavender       #A98BF3
Leo      Sunshine       #FFD166
```

Each member gets:

- circular avatar;
- first name;
- accent stripe;
- consistent calendar/event color;
- consistent chore color;
- optional simple character illustration later.

Do not use gendered color assumptions.

---

## 10.5 Typography

Use a highly legible rounded sans-serif family.

Preferred order:

1. Amazon Ember if officially available for the intended target and permitted.
2. System sans-serif available on the target.
3. A bundled open-source rounded sans-serif with appropriate license.

Do not depend on a remote web font.

### Typography scale for 1080p

```text
Hero Time          64–72 px
Page Title         42–48 px
Section Title      30–34 px
Card Title         26–30 px
Body               22–24 px
Metadata           18–20 px
Small Label        16–18 px
```

Rules:

- sentence case;
- avoid all caps except tiny category labels;
- use medium/semibold for emphasis;
- never show dense paragraph text;
- maximum 2 lines for normal card summaries;
- maximum 3 lines for AI briefing text;
- truncate gracefully.

---

## 10.6 Shape Language

FamilyOS should use soft, friendly geometry.

### Cards

```text
Corner radius:     24 px
Small card radius: 18 px
Modal radius:      28 px
Button radius:     18–22 px
Avatar:            circular
```

### Shadow/elevation

TV UI should not rely on subtle desktop shadows.

Use:

- modest elevation;
- contrast between surfaces;
- focus scale;
- focus outline/glow.

Avoid overly glassy or translucent UI.

---

## 10.7 Spacing System

Base unit:

```text
8 px
```

Use:

```text
8
16
24
32
40
48
64
```

Preferred TV safe margin:

```text
64 px minimum at 1080p
```

Primary content should never touch screen edges.

Card padding:

```text
24–32 px
```

Large hero cards:

```text
32–40 px
```

---

## 10.8 TV Focus System

Focus is one of the most important parts of the product.

### Default focused card

When a card receives focus:

```text
scale:           1.04
outline:         4 px white
surface lift:    +1 level
brightness:      slight increase
```

Optional subtle outer glow:

```text
0 0 0 6px rgba(255,255,255,0.15)
```

### Focus animation

Duration:

```text
120–160 ms
```

Use:

```text
ease-out
```

No bouncing.

No elastic animation.

No rotation.

### Selected vs focused

Do not confuse these states.

```text
Focused  = remote cursor location
Selected = chosen/current item
Completed = finished state
```

Each must have a distinct visual treatment.

---

## 10.9 Main Layout Style

The main dashboard should closely follow the **family-wall-calendar interaction pattern**:

```text
┌──────────────────────────────────────────────────────────────┐
│ FAMILYOS         Tuesday, Sep 22               7:42 AM       │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│  FAMILY       │     GOOD MORNING ☀                           │
│  STATUS       │                                              │
│               │     Busy afternoon today.                    │
│  Alex         │     A pickup conflict needs attention.       │
│  Jordan       │                                              │
│  Emma         │     [ Review conflict ]                      │
│  Leo          │                                              │
│               ├────────────────────────┬─────────────────────┤
│               │                        │                     │
│               │  TODAY                 │  CHORES             │
│               │                        │                     │
│               │  7:45 School           │  Emma               │
│               │  2:45 Dentist          │  □ Pack backpack    │
│               │  3:15 Pickup ⚠         │                     │
│               │  5:00 Soccer           │  Leo                │
│               │                        │  ✓ Feed cat          │
│               │                        │                     │
└───────────────┴────────────────────────┴─────────────────────┘
```

The screen should feel visually simple even when the data is complex.

Primary hierarchy:

```text
1. What needs attention now?
2. What happens next?
3. Who is responsible?
4. What can I do?
```

Do not prioritize raw data volume.

---

## 10.10 Home Screen Composition

At 1920×1080:

### Top Bar

Approximate:

```text
height: 100–120 px
```

Contains:

- FamilyOS wordmark;
- current date;
- large current time;
- weather icon/temperature;
- small settings/profile entry.

Do not overload the top bar.

### Left Rail — Family

Approximate width:

```text
330–380 px
```

Show vertical family-member cards:

```text
[Avatar] Alex
Free after 2:00

[Avatar] Jordan
Dentist 2:45–3:30

[Avatar] Emma
School

[Avatar] Leo
School
```

Each card uses the member’s assigned accent.

### Center Top — AI Family Briefing

This is the visual hero.

Use:

```text
Soft Cream background
Dark text
Large friendly icon
Rounded 28 px container
```

Example:

```text
☀ Good morning

Busy afternoon today.
Emma's pickup needs attention.

[ Review conflict ]
```

This should be the first place users look.

### Center Bottom — Today Timeline

Use large horizontal or vertically stacked event cards.

Event card:

```text
5:00
SOCCER

Emma
Kino Sports Complex

Leave by 4:25
```

Family accent appears as:

- top stripe;
- left stripe;
- avatar badge;
- small icon.

### Right — Chores / Routines

Use playful but restrained task cards.

Example:

```text
TODAY

Emma
○ Pack backpack

Leo
✓ Feed cat

Family
○ Put shoes by door
```

Completed items soften and move down.

---

## 10.11 Calendar UI

The calendar should feel like a dedicated household display, not Outlook.

### Default Week View

Use vertical day columns or a horizontal day ribbon with a large focused day panel.

Preferred TV approach:

```text
MON   TUE   WED   THU   FRI   SAT   SUN
      ▲

Tuesday

7:45    School
2:45    Dentist        Jordan
3:15    Pickup ⚠       Emma
5:00    Soccer         Emma
6:30    Dinner
```

Avoid a dense 7-column × hourly grid if it makes text small.

### Calendar event card anatomy

```text
┌────────────────────────────────────┐
│ 5:00 PM                            │
│ Soccer practice                    │
│                                    │
│ ● Emma                             │
│ Kino Sports Complex                │
│                                    │
│ Leave by 4:25 PM                   │
└────────────────────────────────────┘
```

Use the member color as an accent, not the entire card background.

---

## 10.12 Chore UX for Young Families

Chores should feel rewarding without becoming a game.

### Chore card

```text
[Emma avatar]

Pack backpack

Before school

○ Not done
```

Focused:

```text
[ ✓ Mark complete ]
```

Completed:

```text
✓ Pack backpack

Nice job, Emma!
```

Keep celebration short and calm.

Optional micro-animation:

```text
check scales 0.8 → 1.0
card briefly glows mint
```

Maximum duration:

```text
500 ms
```

No loud sounds by default.

---

## 10.13 Routine UX

Morning routine example:

```text
GOOD MORNING, EMMA

3 of 5 done

✓ Brush teeth
✓ Get dressed
✓ Eat breakfast
○ Pack backpack
○ Shoes on

[ Mark next done ]
```

Progress indicator should be large and obvious.

Use simple friendly icons.

---

## 10.14 AI Conflict Card

The conflict state should feel helpful, not alarming.

Use warm yellow/cream rather than red.

Example:

```text
┌──────────────────────────────────────────────┐
│ ⚠ Pickup conflict                          │
│                                              │
│ Emma needs pickup at 3:15 PM.               │
│ Jordan is at the dentist until 3:30 PM.     │
│                                              │
│ Alex is available.                           │
│                                              │
│ [ Assign Alex ]       [ Other options ]      │
└──────────────────────────────────────────────┘
```

If focused:

- white outline;
- slight scale;
- stronger button contrast.

Do not use technical wording like:

```text
responsibility_overlap detected
```

---

## 10.15 AI Briefing Visual Language

AI output must visually feel like an assistant, not a chatbot.

Do not use:

- chat bubbles;
- generic robot avatars;
- “Ask AI anything” box on the home screen;
- infinite conversation threads.

Use a **briefing card**.

Example:

```text
☀ TODAY AT A GLANCE

Busy afternoon.

• Pickup needs attention at 3:15
• Soccer starts at 5:00
• Bring a rain jacket
• Two chores remain

[ Review day ]
```

This reinforces the product as a household coordinator.

---

## 10.16 Empty States

Empty states should feel positive.

Calendar:

```text
Nothing scheduled this afternoon.

Enjoy the open time 🌤
```

Chores:

```text
All done for today.

Nice work, family! ✓
```

Conflicts:

```text
Everything fits today.

No schedule conflicts found.
```

Do not use corporate empty-state language.

---

## 10.17 Child-Friendly Icons

Use simple filled/rounded icons:

```text
School       backpack
Sports       ball
Medical      heart / plus
Meal         fork/spoon
Chore        check
Weather      sun/cloud
Family       people
Pickup       car
Home         house
Birthday     cake
```

Use one icon family consistently.

Do not use emoji as the only production iconography.

Emoji can appear in friendly copy sparingly.

---

## 10.18 Illustration Direction

Optional P1 enhancement:

Create small original flat/vector-style illustrations for:

- morning;
- school;
- soccer;
- bedtime;
- family celebration;
- weather.

Visual style:

- simple geometry;
- soft corners;
- low detail;
- pastel accents;
- diverse non-specific human figures;
- no licensed characters.

Do not copy children's media characters.

Illustrations must remain secondary to schedule readability.

---

## 10.19 Ambient Mode Visual Design

Ambient mode should look like a premium family frame.

Example composition:

```text
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                     Tuesday                                  │
│                     September 22                             │
│                                                              │
│                     7:42 AM                                  │
│                                                              │
│        Emma soccer · 5:00 PM                                 │
│        Leave by 4:25                                         │
│                                                              │
│                    [family photo]                            │
│                                                              │
│        Next: Jordan dentist · 2:45 PM                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Use:

- slow cross-fades;
- subtle movement only;
- reduced visual density;
- no bright static white screen.

---

## 10.20 Modal Style

Modals should sit centered over a dimmed background.

Use:

```text
width: 820–1000 px
padding: 40 px
radius: 28 px
background: Soft Cream or Primary Surface depending on context
```

Primary action should be unmistakable.

Example:

```text
Assign Alex to pickup?

Alex is available at 3:15 PM.

[ Confirm ]      [ Cancel ]
```

Remote focus begins on the safer/non-destructive option when appropriate.

For ordinary reversible household actions, focus may begin on the recommended action if usability testing supports it.

---

## 10.21 Button System

### Primary

```text
background: Sky Blue
text: Family Night
```

or the currently relevant family accent.

### Secondary

```text
background: Secondary Surface
text: Cloud White
```

### Destructive

Use only when genuinely destructive.

```text
background: Coral
text: Cloud White
```

### Focused

```text
white 4 px outline
scale 1.04
```

Button text should use action verbs:

```text
Assign Alex
Mark done
Review conflict
Open calendar
Dismiss
```

Avoid:

```text
OK
Submit
Execute
Proceed
```

when a clearer action exists.

---

## 10.22 Motion

FamilyOS motion should feel calm and delightful.

Use:

```text
focus          120–160 ms
card enter     180–240 ms
modal enter    200–260 ms
success        <= 500 ms
ambient fade   800–1200 ms
```

Allowed:

- fade;
- scale;
- slide <= 24 px;
- progress fill.

Avoid:

- bounce;
- spin;
- shake;
- parallax-heavy UI;
- constant animation;
- confetti as default behavior.

---

## 10.23 Sound

MVP should not require sound.

Optional later:

- subtle completion tone;
- gentle morning cue;
- notification sound.

All sound must be:

- optional;
- low-volume;
- disabled by default for unexpected alerts.

---

## 10.24 Screen-by-Screen Visual Consistency

Every screen must include:

1. consistent top bar;
2. predictable page title;
3. same focus language;
4. same member colors;
5. same rounded-card system;
6. no more than 3 visual emphasis levels;
7. no tiny metadata clusters.

The user should understand where they are from 10 feet away.

---

## 10.25 UI Acceptance Criteria

The UI/UX is not complete until all are true:

1. A parent can understand the home screen in under five seconds.
2. A child who can read basic words can identify their own color/avatar and next task.
3. Focus is visible from across a living room.
4. Every primary action can be completed with D-pad + Select + Back.
5. No core screen looks like a desktop productivity dashboard.
6. No screen contains unreadably small calendar text.
7. A maximum of one dominant warning is shown at once.
8. Member identity is never communicated only by color.
9. Conflict messaging is calm and solution-oriented.
10. AI content looks like a briefing, not a chatbot.
11. Dark backgrounds dominate large TV surfaces.
12. Accent colors make the interface feel appropriate for families with young children.
13. The product feels cohesive in screenshots without needing explanatory narration.
14. The UI remains original and does not use competitor branding or proprietary visual assets.

---

## 10.26 Codex Visual Implementation Rule

When implementing UI stories, Codex must:

1. create reusable design tokens first;
2. create reusable TV card/button/focus primitives;
3. implement one polished screen before copying components across the app;
4. test at 1920×1080;
5. inspect visual hierarchy after every major screen;
6. prefer fewer larger cards over more smaller cards;
7. reject layouts that require reading dense text;
8. keep the child-friendly color system consistent;
9. preserve Fire TV focus behavior above purely decorative effects;
10. document any deviation from these rules in `docs/UI_DECISIONS.md`.

Create:

```text
packages/shared-ui/src/theme/colors.ts
packages/shared-ui/src/theme/spacing.ts
packages/shared-ui/src/theme/typography.ts
packages/shared-ui/src/theme/radii.ts
packages/shared-ui/src/theme/motion.ts
packages/shared-ui/src/components/TvCard.tsx
packages/shared-ui/src/components/TvButton.tsx
packages/shared-ui/src/components/MemberChip.tsx
packages/shared-ui/src/components/FocusRing.tsx
packages/shared-ui/src/components/SectionHeader.tsx
```

Also create:

```text
docs/UI_DECISIONS.md
```

with screenshots or notes for:

- Home;
- Calendar;
- Chores;
- Conflict modal;
- Ambient mode.


# 11. Screens

## 11.1 Home / Today

Required zones:

### Header

- current date;
- current time;
- household name;
- optional small weather summary.

### Family Briefing

Large card:

```text
Good morning

Busy afternoon today.
A pickup conflict needs attention before 3:15 PM.

[Review conflict]
```

### Today Timeline

Show the next 4–6 events.

### Family Status

Each member:

```text
Alex     Free after 2:00
Jordan   Dentist 2:45–3:30
Emma     School
Leo      School
```

### Tasks

Top pending chores/routine steps.

### Conflict banner

When active:

```text
Schedule conflict
Emma pickup overlaps Jordan's dentist appointment.

[Review]
```

## 11.2 Calendar

Views:

- Today
- Week

Do not implement month view until the week view is excellent on TV.

Event card opens detail modal containing:

- title;
- member;
- start/end;
- location;
- responsibility;
- checklist;
- source.

## 11.3 Chores

Columns:

- Today
- Upcoming
- Completed

Cards must be remote-activatable.

Completing a chore requires one Select action, not a text form.

## 11.4 Family

Display member cards plus:

- today availability;
- assigned responsibilities;
- next event.

## 11.5 Conflict Resolution Modal

Example:

```text
PICKUP CONFLICT

Emma pickup
3:15 PM

Jordan
Dentist appointment until 3:30 PM

Alex
Available

Suggested action
Assign Alex to pickup

[Confirm] [Other options] [Dismiss]
```

No automatic mutation.

## 11.6 Settings

MVP settings:

- household name;
- demo mode;
- AI provider status;
- API base URL;
- refresh data;
- reset demo;
- privacy/info.

No secret entry using the TV remote.

---

# 12. Conflict Engine

Implement in `packages/domain`.

It must not depend on React.

## 12.1 Event overlap

For a single member:

```text
A.start < B.end && B.start < A.end
```

Ignore events explicitly marked non-blocking if such a field is later added.

## 12.2 Responsibility overlap

If Member X is assigned to pickup/drop-off/drive during a blocking event, create a warning.

## 12.3 Travel buffer

Create a configurable buffer.

MVP:

```text
DEFAULT_TRAVEL_BUFFER_MINUTES = 20
```

If:

```text
previousEvent.end + buffer > responsibility.start
```

produce conflict.

Do not claim real traffic information unless a real routing provider is active.

## 12.4 Preparation warning

If an event starts within configurable time and a required checklist item is incomplete, surface a preparation warning.

## 12.5 Suggested reassignment

Candidate member:

- adult;
- not participating in a blocking event;
- not already assigned to an overlapping responsibility.

Rank deterministically:

1. explicitly preferred responsible adult if configured;
2. free adult;
3. no suggestion.

Do not use the LLM to decide whether a person is actually free.

---

# 13. AI Family Briefing

## 13.1 Principle

AI explains structured household state.

AI does not invent household state.

Pipeline:

```text
Calendar/Chores/Routines
        |
        v
Domain normalization
        |
        +----> Deterministic conflict engine
        |
        v
HouseholdContext JSON
        |
        v
Family Briefing Provider
        |
        v
Validated FamilyBriefing
        |
        v
TV UI
```

## 13.2 Context schema

Backend input should contain only information needed for the briefing:

```json
{
  "date": "2026-09-22",
  "members": [],
  "events": [],
  "chores": [],
  "routines": [],
  "conflicts": [],
  "weather": {},
  "next_departures": []
}
```

## 13.3 Prompt requirements

The Bedrock prompt must instruct the model:

- use only supplied household facts;
- never invent appointments;
- never invent family members;
- never claim a responsibility was reassigned unless state says so;
- keep output concise for a TV;
- surface conflicts first;
- distinguish suggestion from confirmed action;
- return JSON matching schema.

Validate model output.

If validation fails:

- retry once with a repair prompt;
- otherwise use deterministic provider.

Never show raw model errors to the family.

## 13.4 AI response length

Target:

- headline: <= 7 words
- summary: <= 35 words
- highlights: <= 5
- each highlight: <= 18 words

TV content must be scannable.

---

# 14. Backend API

Base local URL:

```text
http://localhost:8787
```

Use environment configuration for device testing.

Required endpoints:

```text
GET  /health
GET  /v1/household
GET  /v1/events?from=&to=
GET  /v1/chores
GET  /v1/routines
GET  /v1/conflicts
GET  /v1/briefing
POST /v1/actions/propose
POST /v1/actions/{id}/confirm
POST /v1/actions/{id}/cancel
POST /v1/demo/reset
```

Optional:

```text
GET  /v1/weather
POST /v1/integrations/google/connect
GET  /v1/integrations/google/callback
```

## 14.1 API envelope

Success:

```json
{
  "data": {},
  "meta": {
    "request_id": "..."
  }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "..."
  },
  "meta": {
    "request_id": "..."
  }
}
```

Do not expose stack traces to TV clients.

---

# 15. Calendar Provider Abstraction

Create:

```python
class CalendarProvider(Protocol):
    async def list_events(self, start, end) -> list[CalendarEvent]:
        ...
```

Providers:

1. `DemoCalendarProvider`
2. `GoogleCalendarProvider` — later
3. optional Outlook adapter later

The TV should not care which provider produced an event.

## 15.1 Google integration design

Do not type OAuth credentials on the TV.

Preferred future flow:

1. TV shows connection code and QR code.
2. User opens a pairing URL on phone/computer.
3. User signs in to Google.
4. Backend stores encrypted token.
5. TV receives connection status.
6. Events sync.

For the hackathon MVP, Google integration is useful but must not block the core offline demo.

---

# 16. Weather Provider

Use a provider abstraction.

```python
class WeatherProvider(Protocol):
    async def get_household_weather(...) -> WeatherSummary:
        ...
```

Implement:

- `DemoWeatherProvider`
- optional real provider

Demo mode must be able to force:

```text
Rain around soccer practice
```

This keeps the demo deterministic.

Never label demo weather as live weather.

---

# 17. Voice Strategy

Voice must be treated carefully because Fire TV voice capabilities differ by platform and API.

## 17.1 MVP

The MVP is fully functional using:

- D-pad;
- Select;
- Back;
- on-screen actions.

Create a `CommandIntent` abstraction even if the first input surface is not microphone-based.

Examples:

```ts
type CommandIntent =
  | { type: "show_tomorrow" }
  | { type: "show_member"; memberId: string }
  | { type: "review_conflicts" }
  | { type: "complete_chore"; choreId: string };
```

## 17.2 Developer/demo command palette

For development only, expose a command palette accessible from a hidden/dev menu.

It may let the presenter select:

- “What’s happening tomorrow?”
- “Review conflicts”
- “Who can pick Emma up?”
- “Show soccer preparation”

This validates intent routing without pretending speech recognition exists.

## 17.3 Final voice stretch goal

Investigate current official Amazon voice options before implementing.

Potential directions:

- Fire TV-supported voice navigation patterns where applicable;
- Alexa+ companion/agent integration using shared backend;
- a separate Alexa+ hackathon integration as a stretch project.

Do not implement a custom microphone capture path unless current Amazon APIs explicitly support the intended experience.

Do not market the MVP as “voice-enabled” unless the final demo genuinely demonstrates a supported voice workflow.

---

# 18. AWS Architecture

The core app must run locally without AWS.

AWS mode is optional for local development but recommended for the AWS Builder mini challenge.

## 18.1 Minimum AWS mode

```text
Fire TV
   |
   v
FamilyOS Backend
   |
   +----> Amazon Bedrock
```

This is valid technically but is not the strongest mini-challenge architecture.

## 18.2 Preferred hackathon AWS architecture

```text
Fire TV / Vega App
        |
        v
API Gateway or public backend endpoint
        |
        v
Family Agent Service
        |
        +--------------------+
        |                    |
        v                    v
Strands Agent         Deterministic Domain Engine
        |                    |
        v                    |
Amazon Bedrock              |
        |                    |
        +---------+----------+
                  |
                  v
        Household Repository
                  |
                  v
          DynamoDB / storage
```

Optional:

```text
EventBridge
   |
   +--> briefing refresh
   +--> reminder generation
```

Optional AgentCore integration is encouraged only if it materially improves the project and remains stable.

## 18.3 Agent tools

If Strands is used, expose narrowly scoped tools:

```text
get_today_schedule()
get_member_availability(member_id, window)
get_active_conflicts()
get_pending_chores()
get_event_preparation(event_id)
propose_reassignment(conflict_id, member_id)
```

Mutating tools must create **proposals**, not silently commit changes.

A confirmation endpoint performs the mutation.

---

# 19. Security and Privacy

Family schedule data is sensitive.

Implement these principles.

## 19.1 TV client

Never store:

- AWS access keys;
- Google client secrets;
- long-lived OAuth refresh tokens;
- Bedrock credentials.

## 19.2 Backend

- Load secrets from environment/secret store.
- Redact tokens from logs.
- Validate all request payloads.
- Restrict CORS in non-development mode.
- Use HTTPS in deployed mode.
- Add request IDs without logging private data unnecessarily.

## 19.3 AI minimization

Send only context required for a briefing.

Do not send:

- unrelated notes;
- full email inboxes;
- photo content;
- unnecessary addresses;
- hidden credentials.

## 19.4 User control

Every AI-proposed mutation requires confirmation.

Provide:

- dismiss;
- cancel;
- reset demo;
- disconnect provider.

---

# 20. Story-Based Implementation Plan

Execute in this exact order unless a blocking dependency forces a documented change.

---

## EPIC 0 — Bootstrap and Automated Development Environment

### Story 0.1 — Host detection

**Build**

- host-check scripts;
- report OS/CPU/RAM/disk/virtualization;
- detect whether native Vega is supported;
- detect VirtualBox on Windows;
- detect existing `FamilyOS-Vega` VM.

**Acceptance**

- no false claim that Windows is a native supported Vega host;
- Windows automatically routes into the VM setup path;
- macOS/native Ubuntu route into native Vega setup;
- missing optional tools produce actionable status rather than vague failure.

### Story 0.2 — Windows automatic Vega VM

**Build**

On Windows create:

```text
setup/windows-bootstrap.ps1
setup/verify-host.ps1
setup/ubuntu-provision.sh
setup/verify-kvm.sh
setup/install-vega.sh
setup/sync-repo.ps1
familyos.ps1
```

Automation must:

- install/check VirtualBox;
- acquire supported Ubuntu image;
- create/reuse `FamilyOS-Vega`;
- enable nested virtualization;
- run unattended Ubuntu install;
- configure SSH;
- provision dependencies;
- verify `/dev/kvm`;
- run `kvm-ok`;
- install/check Vega;
- place/sync repository into `~/projects/familyos`.

**Acceptance**

- clean Windows machine with virtualization enabled can reach a provisioned Ubuntu guest with minimal human interaction;
- repeat `setup` is safe/idempotent;
- no silent security-feature disabling;
- secrets are not logged;
- BIOS virtualization failure is detected and reported clearly.

### Story 0.3 — One-command lifecycle

Implement:

```powershell
.\familyos.ps1 setup
.\familyos.ps1 status
.\familyos.ps1 start
.\familyos.ps1 stop
.\familyos.ps1 sync
.\familyos.ps1 test
.\familyos.ps1 build
.\familyos.ps1 simulator
.\familyos.ps1 reset-simulator
```

**Acceptance**

`status` reports VM/SSH/KVM/Vega/VVD/backend/package health.

`simulator` automatically:

- starts the VM if required;
- waits for SSH;
- validates KVM;
- syncs code;
- starts backend when needed;
- rebuilds stale Vega package;
- starts VVD when needed;
- installs latest package;
- launches FamilyOS.

### Story 0.4 — Clone/adapt official Amazon sample

Initialize from:

```text
AmazonAppDev/react-native-multi-tv-app-sample
```

Rename product/app identifiers to FamilyOS-safe values.

Do not delete platform architecture.

**Acceptance**

- dependency install succeeds;
- web target launches;
- starter tests still pass or are intentionally replaced with equivalent FamilyOS tests;
- Vega project remains present.

### Story 0.5 — Amazon Devices Builder Tools

Initialize Builder Tools where supported.

Create `docs/REFERENCES.md`.

**Acceptance**

- status checked;
- failure does not block unrelated work;
- friction recorded.

### Story 0.6 — First automated VVD launch

On a Windows host with successful nested virtualization:

```powershell
.\familyos.ps1 simulator
```

must reach the smallest working FamilyOS Vega screen.

On a native supported host, equivalent automation should reach VVD without VirtualBox.

**Acceptance**

- `.vpkg` generated;
- VVD running;
- package installed;
- FamilyOS launched;
- no manual Ubuntu/Vega commands required during the normal path;
- failure clearly identifies the exact blocked layer.

Do not proceed to EPIC 1 until all non-blocked EPIC 0 acceptance criteria pass. A hardware/BIOS blocker may be documented while web/domain work continues.

---

## EPIC 1 — Domain + Demo Data

### Story 1.1 — Domain models

Implement all core types and server equivalents.

**Acceptance**

- TypeScript compiles;
- Pydantic schema tests pass;
- date/time values use ISO 8601.

### Story 1.2 — Seed household

Implement synthetic household.

**Acceptance**

- deterministic seed produces same IDs/data;
- reset endpoint restores known state.

### Story 1.3 — Conflict engine

Implement overlap/responsibility/preparation logic.

**Acceptance tests**

At minimum:

1. non-overlapping events => no conflict;
2. overlap for same adult => event conflict;
3. pickup assigned during appointment => responsibility conflict;
4. free alternate adult => proposed reassignment candidate;
5. no free adult => no fake candidate;
6. incomplete checklist before event => preparation warning;
7. crossing-midnight event handled correctly.

---

## EPIC 2 — TV Shell

### Story 2.1 — FamilyOS navigation

Implement:

- Home
- Calendar
- Chores
- Family
- Settings

**Acceptance**

Every page accessible using keyboard in web mode and remote/D-pad in TV mode.

### Story 2.2 — Focus system

Implement visible focus ring/treatment.

**Acceptance**

- initial focus visible;
- Back behavior predictable;
- no focus trap;
- modal returns focus to opener.

### Story 2.3 — Responsive TV layout

Test:

- 1280×720;
- 1920×1080;
- 3840×2160 logical scaling if supported.

Do not create separate phone layouts.

---

## EPIC 3 — Home Dashboard

### Story 3.1 — Today timeline

Show today’s seeded events.

### Story 3.2 — Family status

Show each member’s current/next state.

### Story 3.3 — Chore summary

Show pending tasks.

### Story 3.4 — Conflict banner

Show deterministic conflict.

**Acceptance**

Using demo seed, the home screen must immediately make the pickup conflict understandable.

---

## EPIC 4 — Calendar

### Story 4.1 — Day view

Remote navigable.

### Story 4.2 — Week view

TV-first grid/list hybrid.

Do not reproduce a tiny desktop calendar grid.

### Story 4.3 — Event detail modal

Show:

- title;
- time;
- participants;
- responsibility;
- location;
- checklist.

**Acceptance**

User can reach an event, inspect it, close details, and return focus to the same event.

---

## EPIC 5 — Chores and Routines

### Story 5.1 — Chore board

Implement To Do / Completed.

### Story 5.2 — Complete chore

Select action updates state.

### Story 5.3 — Routine cards

Morning/evening checklist.

**Acceptance**

State persists across app navigation and refresh within the chosen local persistence strategy.

---

## EPIC 6 — Conflict Resolution

### Story 6.1 — Review conflict

Conflict banner opens resolution modal.

### Story 6.2 — Proposed reassignment

Show Alex as the deterministic available candidate in demo data.

### Story 6.3 — Confirm action

Confirmation changes pickup responsibility.

### Story 6.4 — Recompute

After confirmation:

- conflict disappears;
- timeline updates;
- family status updates;
- action history reflects completion.

**Critical acceptance**

The LLM is not involved in determining Alex’s availability.

---

## EPIC 7 — Local Family Agent API

### Story 7.1 — FastAPI service

Implement required endpoints.

### Story 7.2 — TV API client

Add loading/error/retry states.

### Story 7.3 — Offline/demo fallback

If backend unavailable:

- app shows local demo data;
- AI card can use deterministic briefing;
- app remains demoable.

---

## EPIC 8 — AI Briefing

### Story 8.1 — Deterministic provider

Generate briefing without AI.

### Story 8.2 — Structured provider contract

Implement schema.

### Story 8.3 — Bedrock provider

Add optional Bedrock implementation.

Environment example:

```text
FAMILYOS_AI_PROVIDER=bedrock
AWS_REGION=us-west-2
FAMILYOS_BEDROCK_MODEL_ID=<configured-model-id>
```

Do not hard-code a model ID in business logic.

### Story 8.4 — Graceful fallback

Bedrock timeout/schema error => deterministic briefing.

**Acceptance**

Turning off network does not destroy the demo.

---

## EPIC 9 — Ambient Mode

### Story 9.1 — Idle timer

After configurable inactivity, enter ambient display.

### Story 9.2 — Ambient content

Rotate gently among:

- today summary;
- next activity;
- family photo;
- countdown;
- chores.

### Story 9.3 — Wake

Any relevant remote input returns to dashboard.

**Acceptance**

No aggressive animation or burn-in-prone static hotspot assumptions.

---

## EPIC 10 — Vega Virtual Device

Only execute on a supported Vega host.

### Story 10.1 — Install current Vega tools

Follow current Amazon docs.

Do not pin an outdated SDK unless the official sample requires it.

### Story 10.2 — Manifest validation

For Vega SDK 0.24, current docs require an `[os.version]` section.

Expected current form:

```toml
[os.version]
target = "1.2"
min = "1.2"
```

Before finalizing, verify against current docs.

### Story 10.3 — Build Vega package

Prefer scripts supplied by the Amazon sample.

Typical sample commands include:

```bash
yarn build:vega
```

or from a Vega package:

```bash
yarn build
```

Do not invent a command if the current repository scripts differ.

### Story 10.4 — Start VVD

Current CLI pattern:

```bash
vega virtual-device start
```

### Story 10.5 — Run app

Use the architecture-matching `.vpkg`.

Typical form:

```bash
vega run-app <path-to-vpkg> <app-component-id> -d VirtualDevice
```

Use the actual generated package path and actual manifest component ID.

### Story 10.6 — VVD test checklist

Verify:

- boot;
- Home screen;
- remote/D-pad focus;
- Calendar;
- Chores;
- conflict modal;
- confirmation;
- AI briefing;
- Back behavior;
- ambient mode;
- API connectivity;
- error state.

Capture screenshots for development notes.

Do not use VVD results as proof of real-device performance.

---

## EPIC 11 — Real Fire TV

This is mandatory before final project signoff.

### Story 11.1 — Determine hardware OS

Identify whether the target hardware uses:

- Vega OS; or
- Fire OS.

Do not assume every Fire TV uses Vega OS.

### Story 11.2A — Vega OS device path

Follow current Amazon “Run Your App on Vega Virtual Device or Fire TV” docs.

Enable Developer Mode.

Prefer USB for initial setup/debugging if required by docs.

Vega Device Adapter can later be configured for TCP/IP where supported.

Use:

```bash
vega device list
```

or the current documented equivalent to discover the device.

Build ARM package.

Run using the actual DSN.

The official multi-TV sample provides a pattern similar to:

```bash
yarn vega:firetv <DSN>
```

Use repository-defined scripts where available.

### Story 11.2B — Fire OS path

Use the Expo TV / Android TV target from the multi-TV sample.

Use current Fire TV React Native/ADB documentation.

Validate:

- package installation;
- launch;
- D-pad;
- Back;
- focus;
- network access;
- 1080p TV composition.

### Story 11.3 — Real-device QA

Test on the actual television from typical viewing distance.

Record:

- cold start;
- interaction latency;
- focus bugs;
- clipped text;
- overscan/safe-area issues;
- animation smoothness;
- API reachability;
- Wi-Fi behavior;
- Back/exit behavior.

Do not declare final readiness until real hardware QA passes.

---

## EPIC 12 — Google Calendar Integration

This is P1. Build after the local demo is excellent.

### Story 12.1 — Provider

Implement `GoogleCalendarProvider`.

### Story 12.2 — OAuth

Perform OAuth in backend/browser pairing flow, not by entering passwords on TV.

### Story 12.3 — Mapping

Map provider events to internal `CalendarEvent`.

### Story 12.4 — Disconnect

Allow provider disconnect and token invalidation.

### Story 12.5 — Demo safety

Add a feature flag:

```text
FAMILYOS_USE_DEMO_CALENDAR=true
```

Final judging demo can use deterministic data if live OAuth would add unnecessary failure risk, while clearly explaining the implemented integration.

---

## EPIC 13 — AWS Builder Enhancement

P1 / stretch after core Fire TV experience.

### Story 13.1 — Bedrock

Working structured briefing.

### Story 13.2 — Strands agent

Agent tools read normalized domain state.

### Story 13.3 — Agent proposal flow

Agent can propose but cannot directly perform sensitive mutations.

### Story 13.4 — Persistent cloud state

Optional DynamoDB repository.

### Story 13.5 — Document architecture

Update `docs/ARCHITECTURE.md`.

---

# 21. TV Performance Requirements

Target living-room smoothness.

Rules:

- minimize unnecessary re-renders;
- memoize expensive derived lists;
- do not render enormous hidden calendars;
- use virtualized lists where appropriate;
- pre-size images;
- avoid huge PNGs;
- keep animations simple;
- avoid continuous background effects;
- debounce repeated remote input only when necessary;
- preserve responsiveness under rapid D-pad navigation.

Use Amazon performance tooling when available.

Record:

- startup observations;
- focus latency;
- frame drops;
- memory warnings.

---

# 22. Accessibility

Required:

- visible focus;
- high contrast;
- readable typography;
- text labels for icon actions;
- do not encode member identity only by color;
- support reduced-motion setting if practical;
- avoid flashing content;
- predictable Back behavior.

Add accessibility labels where supported.

---

# 23. Testing Strategy

## 23.1 Domain tests

High coverage for:

- conflict detection;
- availability;
- suggested candidate selection;
- date boundaries;
- checklist warnings;
- action confirmation.

## 23.2 React component tests

Test:

- Home data rendering;
- conflict card;
- focused/unfocused styles where testable;
- event modal;
- chore completion;
- API error state.

## 23.3 Backend tests

Test:

- health;
- events;
- conflicts;
- deterministic briefing;
- action proposal;
- confirmation;
- invalid action;
- reset.

## 23.4 Contract tests

Maintain shared JSON examples.

Validate server output against client schemas.

## 23.5 Smoke test script

Create:

```text
scripts/verify-demo.*
```

It must verify:

1. backend health;
2. demo household loaded;
3. expected pickup conflict exists;
4. briefing exists;
5. action proposal available;
6. reset works.

---

# 24. Demo Mode

A hackathon demo must not depend on perfect Wi-Fi or third-party OAuth.

Add:

```text
FAMILYOS_DEMO_MODE=true
```

Behavior:

- fixed synthetic household;
- fixed date/time option;
- fixed weather option;
- deterministic conflict;
- optional deterministic AI fallback;
- reset button.

Use a controlled demo clock:

```text
FAMILYOS_DEMO_NOW=2026-09-22T14:30:00-07:00
```

Never leak this into production behavior when demo mode is disabled.

Display a subtle developer-only demo status in Settings, not on the primary judging UI.

---

# 25. Three-Minute Hackathon Demo

Build the product so this demo can be reproduced exactly.

## 0:00–0:20 — Problem

Show ordinary TV.

Explain:

> Families already have a large shared screen at home, but schedules and responsibilities are fragmented across phones. FamilyOS turns Fire TV into a shared family command center.

## 0:20–0:45 — Dashboard

Launch FamilyOS.

Show:

- schedule;
- chores;
- family status;
- briefing.

## 0:45–1:20 — Intelligence

AI briefing:

> Busy afternoon. A pickup conflict needs attention.

Open conflict.

Show:

```text
Jordan dentist 2:45–3:30
Emma pickup 3:15
Alex available
```

## 1:20–1:40 — Action

Press Confirm on:

```text
Assign Alex to pickup
```

Conflict disappears.

Schedule updates.

This demonstrates:

- domain reasoning;
- remote UI;
- actual state mutation with confirmation.

## 1:40–2:05 — Context

Open soccer event.

Show:

- leave/preparation;
- incomplete water bottle;
- rain note.

## 2:05–2:25 — Chores

Complete one chore using remote.

## 2:25–2:45 — Platform/AWS

Very briefly explain:

- React Native TV;
- Vega OS;
- Amazon Fire TV;
- Bedrock/Strands if implemented;
- local deterministic fallback.

## 2:45–2:58 — Close

> FamilyOS doesn’t just show a family calendar. It understands the day, spots problems, and helps the household act — on a screen they already own.

Do not exceed three minutes.

---

# 26. Hackathon Compliance Checklist

Before submission, verify against the latest official rules.

Current project requirements include:

- working Fire TV app on Fire OS or Vega OS;
- demo-ready;
- repository available to judges;
- source/assets/instructions included;
- demonstration video;
- demo shows app functioning on intended platform;
- video under three minutes;
- product feedback for tools/APIs/SDKs used;
- primary track identified;
- mini challenge identified if entering;
- third-party SDK/API use is authorized.

Fire TV project may use React Native, Android/Kotlin/Java, or web technologies as long as it runs on Fire OS or Vega OS.

The hackathon rules permit the Fire TV demo to show the project on an actual Fire TV device or simulator, but **this project’s internal definition of done still requires actual-device testing.**

## 26.1 Product Feedback

Create:

```text
docs/PRODUCT_FEEDBACK.md
```

For every relevant Amazon tool/API/SDK answer:

- What was used and why?
- What worked well?
- What needs work?
- How was onboarding?
- Would we use it again?
- Why?

## 26.2 Friction log

Create:

```text
docs/FRICTION_LOG.md
```

Template:

```markdown
## Entry N

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
```

Capture friction while developing, not on the final day.

---

# 27. README Requirements

Final README must include:

1. Product overview.
2. Screenshots.
3. Architecture.
4. Repo structure.
5. Prerequisites.
6. Host compatibility warning.
7. Local backend instructions.
8. Web development instructions.
9. Vega SDK instructions.
10. VVD instructions.
11. Actual Vega Fire TV instructions.
12. Fire OS instructions where supported.
13. Environment variables.
14. Test commands.
15. Demo mode.
16. AWS mode.
17. Google Calendar mode if implemented.
18. Privacy/security notes.
19. Troubleshooting.
20. Hackathon technologies used.
21. Windows automatic environment setup.
22. `familyos.ps1` command reference.
23. VirtualBox/Ubuntu/KVM troubleshooting.
24. How to recover/re-run provisioning without destroying the VM.
25. How to intentionally destroy/recreate the development VM.

No vague “run the app” instructions.

Every command must have been executed at least once by the developer or generated from the current official starter/docs and validated before final submission.

---

# 28. Environment Files

Root `.env.example`:

```dotenv
FAMILYOS_DEMO_MODE=true
FAMILYOS_DEMO_NOW=2026-09-22T14:30:00-07:00

FAMILYOS_API_URL=http://localhost:8787
EXPO_PUBLIC_FAMILYOS_API_URL=http://127.0.0.1:8787

FAMILYOS_AI_PROVIDER=deterministic

AWS_REGION=
AWS_BEARER_TOKEN_BEDROCK=
FAMILYOS_BEDROCK_MODEL_ID=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

FAMILYOS_USE_DEMO_CALENDAR=true
FAMILYOS_USE_DEMO_WEATHER=true
```

Never commit actual `.env`.
`AWS_BEARER_TOKEN_BEDROCK` is a backend-only secret and must never enter an Expo
client environment, source control, or a TV build.

---

# 29. Required Developer Commands

## 29.1 Windows developer experience

The preferred Windows interface is:

```powershell
.\familyos.ps1 setup
.\familyos.ps1 status
.\familyos.ps1 start
.\familyos.ps1 test
.\familyos.ps1 build
.\familyos.ps1 simulator
.\familyos.ps1 stop
```

A Windows user should normally **not** need to SSH into Ubuntu or type Vega commands manually.

`familyos.ps1` is the orchestration entrypoint and must delegate work to the Ubuntu guest when Vega-specific execution is required.

## 29.2 Native/shared app commands

Normalize useful root commands if compatible with the Amazon starter:

```bash
yarn install

yarn dev:web
yarn dev:vega

yarn build:vega

yarn test
yarn lint
yarn typecheck
```

## 29.3 Backend

```bash
cd services/family-agent
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload
pytest
```

On Windows, backend commands may be orchestrated inside Ubuntu by `familyos.ps1` or run natively for fast iteration.

## 29.4 Direct Vega commands

Direct Vega commands remain documented for diagnostics, CI, and native Ubuntu/macOS development, but Windows developers should prefer the wrapper.

Examples:

```bash
vega --version
vega virtual-device start
vega run-app <vpkg> <component-id> -d VirtualDevice
```

Do not invent parameters. Resolve package/component IDs from the built project.

Do not break starter-provided commands merely to match these names. If names differ, create aliases/wrappers or document the actual commands.

---

# 30. Error Handling UX

## Backend unavailable

Display:

```text
Family service is unavailable.
Using offline demo data.

[Retry]
```

## AI unavailable

Display deterministic briefing.

Do not show:

```text
BedrockException: AccessDenied...
```

## Calendar unavailable

Use cached/demo state with timestamp.

## Empty household

Show setup-friendly empty state with visible focus.

## Network latency

Show skeleton/loading card, not a frozen TV.

---

# 31. Telemetry

MVP:

- local developer logs only;
- no behavioral analytics required.

If telemetry is added:

- do not log event titles by default;
- do not log addresses;
- do not log calendar content;
- do not log tokens.

---

# 32. Git and Build Hygiene

- Keep lockfiles committed.
- Do not commit build artifacts unless required.
- Do not commit SDK installations.
- Do not commit `.env`.
- Add clear `.gitignore`.
- Keep generated Amazon configuration required by the project if official setup expects it.
- Commit automation scripts under `setup/` and `familyos.ps1`.
- Gitignore VM disks, Ubuntu ISOs, SDK installations, `.familyos` secret-bearing state, and generated logs where appropriate.
- Preserve third-party license files from starter code.
- Add license information for new dependencies.

---

# 33. Stop Conditions

Codex must stop the **specific blocked action** and clearly report instead of guessing when:

1. BIOS/UEFI hardware virtualization is disabled and cannot be enabled from the OS.
2. Windows UAC/admin approval is required and has not been granted.
3. Nested virtualization cannot be exposed to the Ubuntu guest after automated checks.
4. `/dev/kvm` is unavailable and VVD therefore cannot be trusted to run.
5. A requested system-wide Windows security change would be required but has not been explicitly authorized.
6. An Amazon API requires unavailable credentials.
7. A hardware-only behavior cannot be validated in VVD.
8. Google OAuth cannot be configured without developer credentials.
9. An AWS service cannot be tested without an AWS account/credentials.
10. A current Amazon SDK differs materially from this spec.

A blocked VVD step does **not** mean stop all development.

Continue:

- shared UI;
- web target;
- domain logic;
- backend;
- tests;
- Fire OS-compatible code where possible.

Never claim simulator or hardware validation succeeded unless it actually ran.

---

# 34. Build Priority

If time becomes constrained, prioritize in this order:

```text
1. Fire TV-native focus/navigation
2. Beautiful Home dashboard
3. Deterministic calendar conflict
4. Resolution/confirmation workflow
5. Calendar screen
6. Chores
7. Deterministic briefing
8. Bedrock briefing
9. Ambient mode
10. Google Calendar
11. Strands/AgentCore
12. Voice stretch goal
```

A polished, reliable TV experience with one compelling intelligence workflow is more valuable than ten incomplete integrations.

---

# 35. Definition of MVP Release

Tag:

```text
v0.1-demo
```

only when:

- web dev target works;
- domain tests pass;
- backend tests pass;
- dashboard works;
- calendar works;
- chores work;
- conflict workflow works;
- deterministic briefing works;
- no known focus traps;
- demo reset works.

Tag:

```text
v0.2-vega
```

only when:

- `.vpkg` builds;
- VVD launch succeeds;
- D-pad/remote test passes.

Tag:

```text
v0.3-firetv
```

only when:

- actual Fire TV device launch succeeds;
- real-device focus QA passes;
- networking works;
- no clipping/overscan issue;
- final demo path succeeds end-to-end.

Tag:

```text
v1.0-hackathon
```

only after:

- demo video path rehearsed;
- README verified from clean checkout;
- product feedback completed;
- friction log completed;
- repo sharing/public-license requirement satisfied;
- final hackathon rules rechecked.

---

# 36. First Codex Execution Prompt

After placing this file at the repository root as `single.md`, give Codex:

```text
Read single.md completely and treat it as the implementation contract.

Start with EPIC 0 only.

My preference is a fully automated setup. Do not ask me to manually create an Ubuntu VM, manually install KVM, manually install Vega, manually copy the repo into Linux, or manually launch the simulator if those steps can be scripted.

1. Inspect the current directory and host environment.
2. If the host is Windows:
   a. create the automation files required by section 4.3;
   b. run the host preflight;
   c. install/verify VirtualBox;
   d. download/verify the supported Ubuntu image;
   e. create/reuse the FamilyOS-Vega VM;
   f. enable nested virtualization;
   g. perform unattended Ubuntu installation;
   h. configure SSH networking;
   i. provision Ubuntu;
   j. verify /dev/kvm and kvm-ok;
   k. install/verify Vega SDK;
   l. sync/place this repo inside the Ubuntu native filesystem.
3. If BIOS virtualization or a Windows UAC prompt is the only blocker, stop at that exact point and tell me the single action I need to perform. Do not replace the rest of the workflow with manual instructions.
4. Never silently disable Hyper-V, Defender, Memory Integrity, Device Guard, Credential Guard, WSL, Docker virtualization, the firewall, or Secure Boot. Diagnose first and require explicit approval before any system-wide security change.
5. Initialize/adapt AmazonAppDev/react-native-multi-tv-app-sample unless the repo already has an equivalent starter.
6. Preserve the official multi-platform architecture.
7. Initialize Amazon Devices Builder Tools when supported; if Codex is not an explicit agent choice, use Other/Custom rather than pretending otherwise.
8. Make the web development target run.
9. Implement familyos.ps1 and make `.\familyos.ps1 simulator` the normal Windows path.
10. On a successfully provisioned Windows VM or a native supported host, build and launch the smallest working Vega target in VVD.
11. Create docs/FRICTION_LOG.md and log setup friction.
12. Run relevant lint/typecheck/tests.
13. Do not begin EPIC 1 until EPIC 0 is complete or a true hardware/permission blocker has been documented.

After EPIC 0, continue sequentially through single.md.

For every story:
- implement;
- test;
- run relevant checks;
- fix failures;
- then continue.

For normal Windows simulator testing, prefer:
    .\familyos.ps1 simulator

Never claim Vega simulator or Fire TV hardware testing passed unless you actually ran it on that target.
```

Expected Windows user experience:

```text
User -> Codex: read single.md and build FamilyOS
            |
            v
      automatic preflight
            |
            v
      VirtualBox + Ubuntu
            |
            v
      nested KVM verification
            |
            v
      Vega installation
            |
            v
      FamilyOS build
            |
            v
      Vega Virtual Device
            |
            v
      FamilyOS launches
```

The only expected manual interruptions are genuine OS/firmware permission boundaries such as UAC approval, BIOS virtualization, or an explicitly required reboot.

---

# 37. Key External References

## Amazon Devices Builder Tools

https://developer.amazon.com/docs/vega/0.24/mcp-server

Setup:

```bash
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context
```

Status:

```bash
npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest check-status
```

## Multi-TV starter

https://github.com/AmazonAppDev/react-native-multi-tv-app-sample

## Minimal shared starter

https://github.com/AmazonAppDev/react-native-multi-tv-helloworld

## TV interfaces/focus reference

https://github.com/AmazonAppDev/vega-tv-interfaces-sample

## Vega run documentation

https://developer.amazon.com/docs/vega/0.24/run-apps

## Vega host/version documentation

https://developer.amazon.com/docs/vega/0.24/target-os-version

## VirtualBox automation references

Codex should use the currently installed VirtualBox CLI documentation for:

```text
VBoxManage
unattended install
nested hardware virtualization
VM start/stop/control
NAT/port forwarding
```

Do not pin the automation to undocumented GUI behavior.

## Fire TV React Native

https://developer.amazon.com/docs/fire-tv/get-started-with-react-native.html

---

# 38. Final Product Principle

Every major product decision should pass this test:

> **Does this make FamilyOS feel like an intelligent shared household surface built specifically for a television, rather than a phone calendar enlarged onto a TV?**

If the answer is no, simplify or redesign it.

The signature workflow must remain:

```text
Understand the day
        ↓
Detect a household problem
        ↓
Explain it clearly on TV
        ↓
Suggest a safe action
        ↓
Let the family confirm using the remote
        ↓
Update the shared household state
```

That is the core of FamilyOS.

---

# 39. Approved Roadmap Extension — 2026-09-23

The original MVP remains Phases 1–6. The following user-approved additions extend the
roadmap to ten phases and are planned work, not implemented features:

7. [Improvements](docs/phases/phase-7-improvements.md): shared household lists, a weekly
   meal plan and dashboard dinner summary, photo/email/flyer import into reviewed events,
   tasks or recipes, a filtered month calendar, saved recipes, recurring meals, and
   recipe ingredients added to shopping lists.
8. [Rewards](docs/phases/phase-8-rewards.md): earn and save chore stars, request rewards,
   and require a parent's four-digit access code to approve redemption. This introduces
   the early parent/child approval boundary.
9. [Parent/admin and child access](docs/phases/phase-9-access-modes.md): expand Phase 8
   into persistent roles and permissions enforced by the backend.
10. [Mobile control](docs/phases/phase-10-mobile-control.md): a small phone-friendly web
    companion for setup and event entry, plus family photo upload and management for
    ambient display. A separate native mobile application is not required.

These additions extend the earlier MVP scope without making Phases 7–10 prerequisites
for the Phase 6 MVP release. Existing privacy, remote accessibility, and explicit
confirmation requirements also apply to these features.

Development uses the local web target and automated checks through Phases 1–4, with
Vega integration testing at the end of Phase 5 and final Vega/device validation in
Phase 6. Later-phase TV changes require fresh platform regression before release.
