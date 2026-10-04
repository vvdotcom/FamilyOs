#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
sudo -n apt-get update
sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  build-essential ca-certificates curl git jq lz4 openssh-server \
  python3 python3-dev python3-pip python3-venv \
  qemu-kvm cpu-checker openjdk-17-jdk rsync unzip watchman \
  dbus gnome-keyring libsecret-1-0

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)" -lt 18 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo -n systemctl enable --now ssh
sudo -n usermod -aG kvm "${USER}"
sudo -n corepack enable
corepack prepare yarn@4.5.0 --activate

node --version
yarn --version
python3 --version
java -version
echo 'Ubuntu provisioning complete. Log out and back in if KVM group membership was newly added.'

