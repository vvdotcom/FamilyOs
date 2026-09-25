#!/usr/bin/env bash
set -euo pipefail

project_root="${1:-$HOME/projects/familyos}"
component_id='com.familyos.tv.main'

if [[ -f "$HOME/vega/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/vega/env"
fi

"$project_root/setup/verify-kvm.sh"
# This managed Ubuntu guest is x86_64. An ARM TV package cannot run in its VVD.
vpkg="$project_root/apps/vega/build/x86_64-release/vega_x86_64.vpkg"
[[ -f "$vpkg" ]] || { echo 'No x86_64 Vega package found. Run setup/build-vega.sh first.' >&2; exit 1; }

vega virtual-device start --timeout 120
vega run-app "$vpkg" "$component_id" -d VirtualDevice
echo "VVD_RUNNING: launched $component_id from $vpkg"

