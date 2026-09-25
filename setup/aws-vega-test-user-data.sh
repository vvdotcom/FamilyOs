#!/usr/bin/env bash
set -Eeuo pipefail

exec > >(tee -a /var/log/familyos-vega-test-bootstrap.log) 2>&1
export DEBIAN_FRONTEND=noninteractive

# Cap the paid test window. EC2's instance-initiated shutdown behavior is set to
# terminate, and the root EBS volume is configured to delete on termination.
if ! systemctl is-active --quiet familyos-vega-test-auto-terminate.timer; then
  systemd-run --unit=familyos-vega-test-auto-terminate --on-active=8h /usr/bin/systemctl poweroff
fi

apt-get update
apt-get install -y --no-install-recommends \
  build-essential ca-certificates curl git jq lz4 openbox openjdk-17-jdk \
  openssh-client python3 python3-dev python3-pip python3-venv qemu-kvm \
  rsync unzip watchman websockify x11vnc xterm xvfb novnc

# Ubuntu 24.04 does not publish an awscli apt candidate on this image. Install
# AWS CLI v2 from AWS's official distribution so the instance role can fetch
# exactly the pre-authorized private package object.
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
  rm -rf /tmp/aws /tmp/awscliv2.zip
fi

if ! command -v node >/dev/null 2>&1 || \
  [[ "$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

usermod -aG kvm ubuntu
install -d -o ubuntu -g ubuntu /home/ubuntu/familyos
aws s3 cp \
  s3://familyos-vega-test-237320501162-20260923/familyos-0.1.0-x86_64-release.vpkg \
  /home/ubuntu/familyos/familyos-0.1.0-x86_64-release.vpkg \
  --region us-west-2
echo '5b98f267e321f8f31926e1db3c7f2647d5d2f76f98950eb130387e63f301f353  /home/ubuntu/familyos/familyos-0.1.0-x86_64-release.vpkg' | sha256sum -c -
chown -R ubuntu:ubuntu /home/ubuntu/familyos

cat >/etc/systemd/system/familyos-vega-xvfb.service <<'UNIT'
[Unit]
Description=FamilyOS Vega test virtual display
After=network.target

[Service]
User=ubuntu
ExecStart=/usr/bin/Xvfb :0 -screen 0 1920x1080x24 -nolisten tcp
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/familyos-vega-desktop.service <<'UNIT'
[Unit]
Description=Lightweight FamilyOS Vega test desktop
Requires=familyos-vega-xvfb.service
After=familyos-vega-xvfb.service

[Service]
User=ubuntu
Environment=DISPLAY=:0
ExecStart=/usr/bin/openbox-session
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/familyos-vega-terminal.service <<'UNIT'
[Unit]
Description=FamilyOS Vega setup terminal
Requires=familyos-vega-desktop.service
After=familyos-vega-desktop.service

[Service]
User=ubuntu
Environment=DISPLAY=:0
ExecStart=/usr/bin/xterm -geometry 120x35+20+20 -T FamilyOS-Vega-Setup
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/familyos-vega-vnc.service <<'UNIT'
[Unit]
Description=Loopback-only VNC for the FamilyOS Vega test desktop
Requires=familyos-vega-xvfb.service
After=familyos-vega-xvfb.service

[Service]
User=ubuntu
Environment=DISPLAY=:0
ExecStart=/usr/bin/x11vnc -display :0 -forever -shared -localhost -nopw -rfbport 5900
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/familyos-vega-novnc.service <<'UNIT'
[Unit]
Description=Loopback-only noVNC web client for the FamilyOS Vega test desktop
Requires=familyos-vega-vnc.service
After=familyos-vega-vnc.service

[Service]
User=ubuntu
ExecStart=/usr/bin/websockify --web /usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable familyos-vega-xvfb.service familyos-vega-desktop.service \
  familyos-vega-terminal.service familyos-vega-vnc.service familyos-vega-novnc.service
systemctl restart familyos-vega-xvfb.service familyos-vega-desktop.service \
  familyos-vega-terminal.service familyos-vega-vnc.service familyos-vega-novnc.service

printf '\nFamilyOS Vega host bootstrap completed.\n'
printf 'Package: /home/ubuntu/familyos/familyos-0.1.0-x86_64-release.vpkg\n'
printf 'After interactive SDK installation, run:\n'
printf '  source ~/.bashrc\n'
# Xvfb on this CPU-only EC2 host needs Mesa software OpenGL. --no-gl-accel
# passes -gpu off to VVD and caused texture validation errors / a black screen.
printf '  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe vega virtual-device start --timeout 120\n'
printf '  vega run-app ~/familyos/familyos-0.1.0-x86_64-release.vpkg com.familyos.tv.main -d VirtualDevice\n'
