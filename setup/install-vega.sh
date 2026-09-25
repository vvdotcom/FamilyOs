#!/usr/bin/env bash
set -euo pipefail

export NONINTERACTIVE=true
export SKIP_VVD_INSTALL="${SKIP_VVD_INSTALL:-false}"
# Pinned to an available 0.24 release verified with `vega sdk list-remote`.
export VEGA_SDK_VERSION="${VEGA_SDK_VERSION:-0.24.12112}"
export PATH="$HOME/vega/bin:$PATH"

if [[ -f "$HOME/vega/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/vega/env"
fi

if [[ -f "$HOME/vega/env" ]] && command -v vega >/dev/null 2>&1 &&
  vega sdk list-installed --json | jq -e --arg version "$VEGA_SDK_VERSION" '.activeSemver == $version' >/dev/null; then
  vega --version
  vega sdk list-installed
  exit 0
fi

curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash

if [[ -f "$HOME/vega/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/vega/env"
fi

command -v vega >/dev/null 2>&1 || { echo 'Vega CLI installation did not add vega to PATH.' >&2; exit 1; }
vega sdk use "$VEGA_SDK_VERSION"
vega sdk list-installed --json | jq -e --arg version "$VEGA_SDK_VERSION" '.activeSemver == $version' >/dev/null
grep -q 'source "$HOME/vega/env"' "$HOME/.profile" 2>/dev/null || printf '\n[ -f "$HOME/vega/env" ] && source "$HOME/vega/env"\n' >> "$HOME/.profile"
vega --version
vega sdk list-installed
vega virtual-device --help >/dev/null

