#!/usr/bin/env bash
set -euo pipefail

virtualization_flags="$(grep -Eoc '(vmx|svm)' /proc/cpuinfo || true)"
echo "CPU virtualization flags: ${virtualization_flags}"

if [[ ! -e /dev/kvm ]]; then
  echo 'KVM_BLOCKED: /dev/kvm is missing. Verify VirtualBox nested virtualization and host hypervisor compatibility.' >&2
  exit 2
fi

if command -v kvm-ok >/dev/null 2>&1; then
  kvm-ok
else
  echo 'KVM_BLOCKED: kvm-ok is unavailable; install cpu-checker.' >&2
  exit 3
fi

if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
  echo 'KVM_BLOCKED: current user cannot access /dev/kvm. Re-login after joining the kvm group.' >&2
  exit 4
fi

echo 'KVM_READY: /dev/kvm exists and acceleration can be used.'

