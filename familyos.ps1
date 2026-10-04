[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('setup','status','start','stop','sync','test','build','simulator','reset-simulator','tv')]
    [string]$Command = 'status',
    # tv: the API the TV app talks to (baked into the build).
    [string]$ApiUrl = 'https://hometide.up.railway.app'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'setup\windows-common.ps1')

$root = $PSScriptRoot
$vmName = 'FamilyOS-Vega'
$sshPort = 2222
$keyPath = Join-Path $env:LOCALAPPDATA 'FamilyOS\state\familyos_ed25519'
$knownHostsPath = Join-Path $env:LOCALAPPDATA 'FamilyOS\state\known_hosts'
$sshOptions = @('-i', $keyPath, '-p', "$sshPort", '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', ('UserKnownHostsFile="' + $knownHostsPath + '"'))

function Get-VBoxManage {
    return Find-VBoxManage
}

function Invoke-Guest([string]$GuestCommand) {
    if (-not (Test-Path -LiteralPath $keyPath)) { throw 'VM SSH key missing. Run setup first.' }
    & ssh @sshOptions familyos@127.0.0.1 (ConvertTo-FamilyGuestCommand $GuestCommand)
    if ($LASTEXITCODE -ne 0) { throw "Guest command failed: $GuestCommand" }
}

function Start-FamilyVm([int]$TimeoutMinutes = 5) {
    $vbox = Get-VBoxManage
    if (-not $vbox) { throw 'VirtualBox is not installed.' }
    if (-not (Test-Path -LiteralPath $keyPath)) { throw 'VM SSH key missing. Run setup first.' }
    $markerPath = Join-Path $env:LOCALAPPDATA "FamilyOS\state\$vmName-install.json"
    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $nextNotice = Get-Date
    do {
        $info = Get-FamilyVmInfo $vbox $vmName
        $marker = if (Test-Path -LiteralPath $markerPath) { Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json } else { $null }
        if ($marker -and $marker.uuid -ne $info['UUID']) { throw 'VM and installation marker UUIDs differ.' }
        if ($info['VMState'] -eq 'poweroff') {
            if ($marker -and $marker.stage -eq 'installing') {
                # Autoinstall powers off at completion. Eject its generated DVD
                # before booting the installed disk, preventing reinstall loops.
                foreach ($slot in @($info.Keys | Where-Object { $_ -match '^IDE-\d+-\d+$' })) {
                    if ($info[$slot] -notin @('none', 'emptydrive')) {
                        $parts = $slot -split '-'
                        Invoke-FamilyVBox $vbox @('storageattach', $vmName, '--storagectl', 'IDE', '--port', $parts[1], '--device', $parts[2], '--type', 'dvddrive', '--medium', 'emptydrive')
                    }
                }
                $marker.stage = 'booting'
                $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath
            }
            Invoke-FamilyVBox $vbox @('startvm', $vmName, '--type', 'headless')
            if ($marker -and $marker.stage -eq 'prepared') {
                $marker.stage = 'installing'
                $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath
            }
        } elseif ($info['VMState'] -notin @('running', 'starting', 'stopping')) {
            throw "VM state '$($info['VMState'])' requires inspection before continuing."
        }
        # A refused connection is expected during installation. PS 5.1 treats
        # redirected native stderr as ErrorRecords; don't let that stop polling.
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            # The live installer has a different SSH host key. Wait for its
            # planned poweroff before trusting the installed system's key.
            $sshExit = 255
            if (-not $marker -or $marker.stage -ne 'installing') {
                & ssh @sshOptions -o ConnectTimeout=5 familyos@127.0.0.1 'test -f /var/lib/cloud/instance/boot-finished && ! test -d /run/casper && sudo -n true' 2>$null
                $sshExit = $LASTEXITCODE
            }
        } finally { $ErrorActionPreference = $previousPreference }
        if ($sshExit -eq 0) {
            if ($marker) { $marker.stage = 'ready'; $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath }
            Write-Host 'Ubuntu SSH and provisioning access are ready.' -ForegroundColor Green
            return
        }
        if ((Get-Date) -ge $nextNotice) {
            Write-Host "Waiting for Ubuntu installation/SSH (VM: $($info['VMState']))..."
            $nextNotice = (Get-Date).AddSeconds(30)
        }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)
    throw "VM started but SSH did not become ready within $TimeoutMinutes minutes."
}

function Clear-StaleFamilyVm {
    # VirtualBox keeps listing a VM whose folder was deleted ("Inaccessible"), and bootstrap then
    # cannot recreate it. Drop only that registration; there are no files left to lose.
    $vbox = Get-VBoxManage
    $registry = Join-Path $env:USERPROFILE '.VirtualBox\VirtualBox.xml'
    if (-not $vbox -or -not (Test-Path -LiteralPath $registry)) { return }
    $entries = @(([xml](Get-Content -LiteralPath $registry -Raw)).SelectNodes("//*[local-name()='MachineEntry']"))
    foreach ($entry in $entries) {
        $source = $entry.GetAttribute('src')
        if ((Split-Path -Leaf $source) -ne "$vmName.vbox") { continue }
        if (-not [IO.Path]::IsPathRooted($source)) { $source = Join-Path (Split-Path -Parent $registry) $source }
        if (Test-Path -LiteralPath $source) { continue }
        Write-Host "Removing the stale '$vmName' entry (its files no longer exist)..."
        Invoke-FamilyVBox $vbox @('unregistervm', $entry.GetAttribute('uuid').Trim('{}'))
    }
}

function Test-FamilyVmReady {
    $markerPath = Join-Path $env:LOCALAPPDATA "FamilyOS\state\$vmName-install.json"
    if (-not (Test-Path -LiteralPath $keyPath) -or -not (Test-Path -LiteralPath $markerPath)) { return $false }
    return ((Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json).stage -eq 'ready')
}

function Invoke-FamilySetup {
    Clear-StaleFamilyVm
    & (Join-Path $root 'setup\windows-bootstrap.ps1')
    Start-FamilyVm -TimeoutMinutes 45
    & (Join-Path $root 'setup\sync-repo.ps1')
    Invoke-Guest 'cd ~/projects/familyos && chmod +x setup/*.sh && ./setup/ubuntu-provision.sh'
    # A new login picks up the kvm group added by provisioning.
    Invoke-Guest 'cd ~/projects/familyos && if ./setup/verify-kvm.sh; then ./setup/install-vega.sh; else echo "VVD is blocked; continuing with the Vega SDK for builds and physical-device testing."; SKIP_VVD_INSTALL=true ./setup/install-vega.sh; fi'
}

switch ($Command) {
    'tv' {
        # One command from nothing to Hometide on a Fire TV (Vega OS) on the same Wi-Fi.
        if ($ApiUrl -notmatch '^https://[A-Za-z0-9.-]+(:\d+)?/?$') { throw 'ApiUrl must be an https:// address.' }
        if (-not (Test-FamilyVmReady)) {
            Write-Host 'Creating the FamilyOS-Vega build VM first (Ubuntu + Vega SDK, unattended).' -ForegroundColor Cyan
            Invoke-FamilySetup
        }
        Start-FamilyVm
        & (Join-Path $root 'setup\sync-repo.ps1')
        Write-Host "Building the TV app for $ApiUrl ..." -ForegroundColor Cyan
        Invoke-Guest ("cd ~/projects/familyos && [ ! -f ~/vega/env ] || . ~/vega/env; yarn install --immutable && rm -rf apps/vega/build /tmp/metro-* /tmp/haste-map-* && EXPO_PUBLIC_FAMILYOS_API_URL=$ApiUrl yarn build:vega")
        Write-Host ''
        Write-Host 'On the TV: Settings > My Fire TV > About, select the device name 7 times, then Back >' -ForegroundColor Yellow
        Write-Host 'Developer options. Turn on Developer Mode (it shows a 6-character code of letters and numbers) and set Connection Mode to TCP/IP.' -ForegroundColor Yellow
        Write-Host 'The TV IP address is under Settings > My Fire TV > About > Network.' -ForegroundColor Yellow
        $tvIp = (Read-Host 'TV IP address').Trim()
        if ($tvIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'That is not an IPv4 address.' }
        $code = (Read-Host 'Developer Mode code (leave empty if this TV is already enabled)').Trim()
        if ($code -and $code -notmatch '^[A-Za-z0-9]{6}$') { throw 'The Developer Mode code is 6 letters and numbers, exactly as the TV shows it.' }
        $tvScript = @'
set -euo pipefail
# The Vega CLI keeps its Amazon sign-in in the OS keyring (Secret Service over D-Bus).
# This VM is headless over SSH, so there is none: install gnome-keyring once, then
# rerun this script inside its own D-Bus session with the keyring started and unlocked.
if [ -z "${HOMETIDE_KEYRING:-}" ]; then
  if ! command -v gnome-keyring-daemon >/dev/null 2>&1 || ! command -v dbus-run-session >/dev/null 2>&1; then
    echo 'Installing the keyring the Vega CLI needs to save its sign-in (one time)...'
    sudo -n apt-get update -qq
    sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends gnome-keyring libsecret-1-0 dbus
  fi
  HOMETIDE_KEYRING=1 exec dbus-run-session -- bash "$0"
fi
# A dev-VM keyring, not a secret: the fixed password just lets every run unlock it unattended.
eval "$(printf 'hometide-dev\n' | gnome-keyring-daemon --unlock --components=secrets)"
eval "$(printf 'hometide-dev\n' | gnome-keyring-daemon --start --components=secrets)"
export GNOME_KEYRING_CONTROL
[ ! -f "$HOME/vega/env" ] || . "$HOME/vega/env"
cd ~/projects/familyos
pkg=$(find -L apps/vega/build/armv7-release -maxdepth 1 -type f -name '*.vpkg' -print -quit)
[ -n "$pkg" ] || { echo 'No armv7 package was built.' >&2; exit 1; }
if [ -n "$TV_CODE" ]; then
  echo 'Sign in with your Amazon Developer account when asked (open the link it prints on this PC if no browser opens).'
  vega devmode login
  vega devmode enable-device --code "$TV_CODE"
  echo 'The TV restarts. When it is back on the Home screen, open Developer options, set Connection Mode to TCP/IP, then press Enter.'
  read -r _
fi
vega exec vda connect "$TV_IP:5555"
vega device list
vega device install-app --packagePath "$pkg"
vega device launch-app --appName com.hometide.tv.main
echo 'Hometide is on the TV. Next: Settings > Show pairing code, and scan it with your phone.'
'@
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($tvScript.Replace("`r", '')))
        # Written to a file and run with a terminal attached, so the Vega CLI can ask questions.
        & ssh @sshOptions -t familyos@127.0.0.1 "printf %s $encoded | base64 --decode > /tmp/hometide-tv.sh && TV_IP=$tvIp TV_CODE=$code bash /tmp/hometide-tv.sh"
        if ($LASTEXITCODE -ne 0) { throw 'Installing on the TV failed; the messages above say where.' }
    }
    'setup' { Invoke-FamilySetup }
    'status' {
        & (Join-Path $root 'setup\verify-host.ps1')
        $vbox = Get-VBoxManage
        if ($vbox -and (Test-Path -LiteralPath $keyPath)) {
            $healthCheck = @'
[ ! -f "$HOME/vega/env" ] || . "$HOME/vega/env"
printf 'SSH: PASS\n'
if test -r /dev/kvm && test -w /dev/kvm; then
  printf 'KVM device access: PASS\nVVD: NOT_VERIFIED (requires an actual launch)\n'
else
  printf 'KVM device access: BLOCKED\nVVD: BLOCKED (KVM unavailable)\n'
fi
command -v vega >/dev/null && vega --version || printf 'Vega CLI: MISSING\n'
pgrep -f '[u]vicorn' >/dev/null && printf 'Backend process: RUNNING\n' || printf 'Backend process: STOPPED\n'
vpkg=$(find -L ~/projects/familyos/apps/vega/build -maxdepth 2 -type f -name '*.vpkg' -print -quit 2>/dev/null)
test -n "$vpkg" && printf 'Built package: %s\n' "$vpkg" || printf 'Built package: MISSING\n'
'@
            $previousPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                & ssh @sshOptions -o ConnectTimeout=3 familyos@127.0.0.1 (ConvertTo-FamilyGuestCommand $healthCheck) 2>$null
                $healthExit = $LASTEXITCODE
            } finally { $ErrorActionPreference = $previousPreference }
            if ($healthExit -ne 0) { Write-Host 'Guest health: SSH is not ready or its host key needs inspection.' -ForegroundColor Yellow }
        } else {
            Write-Host 'Guest health: unavailable until setup creates the VM and SSH key.' -ForegroundColor Yellow
        }
    }
    'start' { Start-FamilyVm }
    'stop' {
        $vbox = Get-VBoxManage
        if (-not $vbox) { throw 'VirtualBox is not installed.' }
        $info = & $vbox showvminfo $vmName --machinereadable 2>$null
        if (-not ($info | Select-String 'VMState="running"')) {
            Write-Host 'FamilyOS-Vega is already stopped.'
            break
        }
        Invoke-Guest 'pkill -f uvicorn || true; command -v vega >/dev/null && vega virtual-device stop || true'
        & $vbox controlvm $vmName acpipowerbutton
    }
    'sync' { Start-FamilyVm; & (Join-Path $root 'setup\sync-repo.ps1') }
    'test' {
        Start-FamilyVm
        & (Join-Path $root 'setup\sync-repo.ps1')
        Invoke-Guest 'cd ~/projects/familyos && yarn install --immutable && yarn typecheck && yarn lint && yarn test'
    }
    'build' {
        Start-FamilyVm
        & (Join-Path $root 'setup\sync-repo.ps1')
        Invoke-Guest 'cd ~/projects/familyos && chmod +x setup/*.sh && ./setup/build-vega.sh'
    }
    'simulator' {
        Start-FamilyVm
        & (Join-Path $root 'setup\sync-repo.ps1')
        Invoke-Guest 'cd ~/projects/familyos && chmod +x setup/*.sh && ./setup/verify-kvm.sh && ./setup/build-vega.sh && ./setup/launch-vvd.sh'
    }
    'reset-simulator' {
        Start-FamilyVm
        Invoke-Guest 'vega virtual-device stop || true; rm -rf ~/.vega/virtual-device/tmp ~/.cache/vega-vvd'
        Write-Host 'Only transient simulator state was reset; the development VM was preserved.' -ForegroundColor Green
    }
}

