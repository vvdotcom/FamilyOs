# Phase 1 — Foundation and automated development environment

## Outcome

Create the official multi-TV baseline and an automation-first development path that can
route Windows through a managed Ubuntu guest while keeping the web target available for
fast iteration.

## Specification coverage

- `docs/process/build-spec.md` sections 0, 4–7, 20 / EPIC 0, 27–29, 32–33, and 37.
- Stories 0.1 through 0.6.

## Work packages

- [x] Import Amazon's `react-native-multi-tv-app-sample` without removing Expo, shared UI,
  Fire OS/Android TV, or Vega architecture.
- [x] Rename repository, workspace, Expo, and Vega identifiers to FamilyOS-safe values.
- [x] Add current Vega OS `1.2` manifest targeting required by SDK 0.24.
- [x] Add six-phase implementation documents and core project documentation.
- [x] Implement read-only Windows host detection and machine-readable status.
- [x] Implement idempotent Windows bootstrap, Ubuntu provisioning, KVM verification,
  source sync, Vega build, VVD launch, and root lifecycle orchestration scripts.
- [x] Run full Windows bootstrap through Ubuntu installation and SSH provisioning.
- [x] Initialize Amazon Devices Builder Tools in Other/Custom mode and check status; full
  MCP configuration remains deferred because the current initializer did not configure it.
- [x] Install dependencies and verify the web target, lint, tests, and typecheck.
- [x] Install Vega SDK 0.24.12112 in Ubuntu and verify the SDK health check.
- [x] Build release `.vpkg` packages for ARMv7, ARM64, and x86-64.
- [ ] Start VVD, install the package, and launch FamilyOS (blocked by guest KVM).

## Verification checkpoints

1. `powershell -NoProfile -File setup/verify-host.ps1` reports OS, CPU, RAM, disk,
   virtualization, Git, VirtualBox, VM state, and a routing status.
2. Re-running `./familyos.ps1 setup` is safe and reuses cached ISO/VM state.
3. `yarn install`, `yarn typecheck`, `yarn lint`, and `yarn test` pass.
4. `yarn dev:web` serves the shared application.
5. On a supported Vega host, `./familyos.ps1 simulator` or the native scripts produce a
   `.vpkg`, start VVD, and launch `com.familyos.tv.main`.

## Exit criteria

- The web app is runnable from a clean checkout.
- `familyos.ps1 status` identifies every layer without changing system state.
- Windows provisioning reaches the furthest safe layer and names any UAC, BIOS,
  nested-virtualization, Amazon-authentication, or SDK blocker precisely.
- VVD success is recorded only after a real run.

## Current checkpoint — 2026-09-22

- VirtualBox 7.2.20 is installed in its standard Program Files location. The existing
  `FamilyOS-Vega` VM and disk were preserved during installer recovery.
- Ubuntu 24.04.3 LTS is installed, boots from its disk, and accepts key-only SSH on
  `127.0.0.1:2222`. Cloud-init and noninteractive guest sudo checks pass; source sync passes.
- Emulator blocker: the guest currently exposes zero `vmx`/`svm` CPU flags and no
  `/dev/kvm`. VirtualBox has nested virtualization enabled but falls back to Windows'
  hypervisor (NEM); host virtualization-based security is active. No Windows security
  or hypervisor configuration was changed.
- Web: Metro bundled 948 modules and served `http://localhost:8082`.
- Typecheck: pass for Expo and Vega application boundaries.
- Lint: pass with zero errors; imported starter formatting warnings remain.
- Tests: FamilyOS Vega shell test pass; Expo currently has no tests and is explicitly
  allowed to pass with no tests until Phase 2 adds application tests.
- Development tools: Node 20.20.2, Yarn 4.5.0, Python 3.12.3, OpenJDK 17, Watchman,
  and compiler prerequisites installed. Re-running setup reused the installed guest.
- Vega CLI 1.4.2 and SDK 0.24.12112 installed. `vega sdk config doctor` reports one
  healthy component and zero corrupted components. Re-running the SDK script reuses
  this installation.
- Ubuntu validation: immutable Yarn install, both application typechecks, lint (zero
  errors; starter warnings remain), and the one Vega shell test pass.
- Release packages built successfully for `armv7`, `aarch64`, and `x86_64`; SDK manifest
  validation passed. Copies and checksum records are in `artifacts/vega/` on Windows.
- Not claimed: VVD launch, on-screen app rendering in Vega, or Fire TV hardware validation.

