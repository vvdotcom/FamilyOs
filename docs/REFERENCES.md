# References

Checked on 2026-09-22. Amazon documentation is authoritative for Vega behavior.

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

## Phase 1 decisions

- The imported starter currently pins Yarn 4.5.0 and carries separate Expo and Vega apps.
- Vega SDK 0.24 supports Ubuntu 20.04, 22.04, and 24.04 on x86_64; the Windows path uses
  an Ubuntu 24.04 guest.
- SDK 0.24 requires `[os.version]` with current minted OS version `1.2`.
- Setup pins SDK `0.24.12112`, verified in `vega sdk list-remote` on 2026-09-22.
  The docs' example `0.24.9311` was rejected as unavailable by the live registry.
  If the guest cannot access KVM, install the SDK with
  `NONINTERACTIVE=true` and `SKIP_VVD_INSTALL=true`; keep the emulator blocked while
  continuing build and physical-device development. Do not disable Windows security
  or hypervisor features automatically.
- VVD automation uses `vega virtual-device start` and `vega run-app <vpkg> <component-id>
  -d VirtualDevice`.

