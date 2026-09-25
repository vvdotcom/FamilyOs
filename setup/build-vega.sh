#!/usr/bin/env bash
set -euo pipefail

project_root="${1:-$HOME/projects/familyos}"
cd "$project_root"

if [[ -f "$HOME/vega/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/vega/env"
fi

command -v vega >/dev/null 2>&1 || { echo 'Vega CLI is not installed.' >&2; exit 1; }
yarn install --immutable
yarn typecheck
yarn lint
yarn test
yarn build:vega

# SDK outputs are symlinks into its artifact cache. Follow them, but only list
# the public architecture directories, not duplicate private staging outputs.
mapfile -t packages < <(find -L apps/vega/build -maxdepth 2 -type f -name '*.vpkg' -print | sort)
[[ ${#packages[@]} -gt 0 ]] || { echo 'Build returned without any Vega packages.' >&2; exit 1; }
printf '%s\n' "${packages[@]}"

