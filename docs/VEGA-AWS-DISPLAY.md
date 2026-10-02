# Vega display on the AWS test desktop

Verified on 2026-09-23 with Ubuntu 24.04, Vega SDK 0.24.12112,
Xvfb/Openbox/noVNC, and a c8i.2xlarge EC2 instance with nested virtualization.

The virtual device booted and `com.hometide.tv.main` was running, but the
screen was black when started with `--no-gl-accel`. Its process arguments
included `-gpu off`, and `virtual_device.err` repeatedly reported
`sPrepareTexImage2D ... failed validation`.

Restarting with OpenGL enabled and Mesa's llvmpipe software renderer displayed
the Fire TV boot logo and the installed app's home screen:

```bash
source ~/.bashrc
vega virtual-device stop
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \
  vega virtual-device start --timeout 120
vega device launch-app --appName com.hometide.tv.main --device VirtualDevice
```

Use these commands inside the Ubuntu desktop terminal, where `DISPLAY` points
to the existing Xvfb desktop. Do not append `--no-gl-accel` on this host.

If the package has not been installed yet:

```bash
vega run-app ~/familyos/familyos-0.1.0-x86_64-release.vpkg \
  com.hometide.tv.main -d VirtualDevice
```

The installed 0.1.0 package currently shows the starter media interface with
Home, Explore, TV, and movie cards. Seeing it verifies app rendering, not
completion of the planned FamilyOS product or media playback testing.

The AWS instance's existing automatic termination deadline remains in effect.
These launch commands only restart the nested virtual device; they do not
extend the cloud test window.
