# FamilyOS phase-1 Vega packages

Built on 2026-09-22 (America/Phoenix) in Ubuntu 24.04.3 with Vega SDK 0.24.12112.
App ID: `com.familyos.tv`; component: `com.familyos.tv.main`; version: `0.1.0`.
Minimum/target Vega OS: `1.2`.

| File | Build target | SHA256 |
| --- | --- | --- |
| `familyos-0.1.0-armv7-release.vpkg` | ARMv7 | `244a225c781b29f23d2752b3780ad3ff05d988eb8e5ae58419a0c1a96ea2a52f` |
| `familyos-0.1.0-aarch64-release.vpkg` | ARM64 | `4e206ab507d5b755cc03ae7ac5bd9494ed9d55c0c62d4e866e21d2c99bbd35be` |
| `familyos-0.1.0-x86_64-release.vpkg` | x86-64 VVD | `5b98f267e321f8f31926e1db3c7f2647d5d2f76f98950eb130387e63f301f353` |

All three builds and SDK manifest validation passed. These are development artifacts:
they have not been installed or run on a Vega device. The local VVD is blocked because
the Ubuntu guest has no KVM access. Build number is still 0 and the app uses a default
icon; release polish and device validation remain later-phase work.

These `.vpkg` files are **Vega-only**, not APKs for Fire OS TVs. The separate Expo/Android
target must be built and tested for Fire OS support.

Rebuild with `./familyos.ps1 build`. The guest keeps public outputs under
`~/projects/familyos/apps/vega/build/<architecture>-release/`.
