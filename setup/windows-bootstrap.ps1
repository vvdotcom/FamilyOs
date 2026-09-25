[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$VmName = 'FamilyOS-Vega',
    [ValidateRange(1024,65535)][int]$SshPort = 2222,
    [ValidateRange(1024,65535)][int]$ApiPort = 8787,
    [string]$IsoPath,
    [switch]$ReprepareUnattended
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'windows-common.ps1')
$preflight = & (Join-Path $PSScriptRoot 'verify-host.ps1') -Json | ConvertFrom-Json
if ($preflight.status -eq 'NEEDS_BIOS_VIRTUALIZATION') {
    throw 'Hardware virtualization is disabled in firmware. Enable Intel VT-x/AMD-V/SVM in BIOS/UEFI, then rerun setup.'
}
$vbox = Find-VBoxManage
if (-not $vbox) {
    $winget = Get-Command winget -ErrorAction Stop
    if (-not $preflight.host.administrator) { throw 'NEEDS_ADMIN_APPROVAL: VirtualBox installation requires an elevated PowerShell.' }
    & $winget.Source install --id Oracle.VirtualBox --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "VirtualBox installation failed with exit code $LASTEXITCODE. Check the MSI log in $env:TEMP." }
    $vbox = Find-VBoxManage
    if (-not $vbox) { throw 'VirtualBox installed but VBoxManage was not found.' }
}

$familyRoot = Join-Path $env:LOCALAPPDATA 'FamilyOS'
$cacheRoot = Join-Path $familyRoot 'cache'
$stateRoot = Join-Path $familyRoot 'state'
$vmRoot = Join-Path $familyRoot 'vm'
$diskPath = Join-Path $vmRoot "$VmName.vdi"
$markerPath = Join-Path $stateRoot "$VmName-install.json"
$keyPath = Join-Path $stateRoot 'familyos_ed25519'
New-Item -ItemType Directory -Force -Path $cacheRoot, $stateRoot, $vmRoot | Out-Null

$vmList = @(Invoke-FamilyVBox $vbox @('list', 'vms'))
$vmExists = [bool]($vmList | Select-String -SimpleMatch ('"' + $VmName + '"'))
$info = if ($vmExists) { Get-FamilyVmInfo $vbox $VmName } else { @{} }
if (Test-Path -LiteralPath $markerPath) {
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if (-not $vmExists -or $marker.uuid -ne $info['UUID']) { throw 'Installation marker does not match this VM. Inspect its state before continuing.' }
    if ($ReprepareUnattended -and $marker.stage -ne 'prepared') { throw 'Only an unstarted prepared installation can be regenerated.' }
    if (-not $ReprepareUnattended -and $marker.stage -in @('prepared', 'installing', 'booting')) {
        if ($marker.stage -eq 'prepared' -and $info['VMState'] -eq 'poweroff') {
            Invoke-FamilyVBox $vbox @('startvm', $VmName, '--type', 'headless')
            $marker.stage = 'installing'
            $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath
        }
        Write-Host 'Ubuntu installation was already prepared. Run familyos.ps1 setup to wait for SSH and provision it.'
        return
    }
    if ($marker.stage -eq 'ready') { Write-Host 'Ubuntu bootstrap already complete; reusing the VM.'; return }
}
if ($vmExists) {
    if ($info['VMState'] -ne 'poweroff') { throw 'Existing VM is not powered off. Inspect installation progress before preparing it.' }
    if ($info.ContainsKey('SATA-0-0') -and $info['SATA-0-0'] -notin @('none', $diskPath)) { throw 'Existing VM uses an unexpected disk; refusing to change it.' }
}
# Recover only the freshly created, unallocated VDI from a failed bootstrap.
# A populated disk without an installation marker needs inspection, not reinstall.
if (Test-Path -LiteralPath $diskPath) {
    $diskInfo = @(Invoke-FamilyVBox $vbox @('showmediuminfo', 'disk', $diskPath))
    if ((Get-Item -LiteralPath $diskPath).Length -gt 2MB -or -not ($diskInfo -match 'Storage format:\s+VDI')) {
        throw 'Existing disk contains data and has no bootstrap marker. Preserve it and inspect guest SSH before retrying.'
    }
}

$releaseBase = 'https://releases.ubuntu.com/24.04'
$checksumFile = Join-Path $cacheRoot 'SHA256SUMS'
if (-not (Test-Path -LiteralPath $checksumFile)) { Invoke-WebRequest -UseBasicParsing "$releaseBase/SHA256SUMS" -OutFile $checksumFile }
$isoEntries = @(Get-Content -LiteralPath $checksumFile | ForEach-Object {
    if ($_ -match '^([0-9a-fA-F]{64})\s+\*?(ubuntu-24\.04(?:\.\d+)*-live-server-amd64\.iso)\s*$') {
        [pscustomobject]@{Hash=$matches[1].ToLowerInvariant(); Name=$matches[2]}
    }
})
if ($isoEntries.Count -eq 0) { throw 'No Ubuntu server ISO found in the official checksum manifest.' }
if ($IsoPath) {
    $IsoPath = (Resolve-Path -LiteralPath $IsoPath).Path
    $entry = $isoEntries | Where-Object Name -eq (Split-Path -Leaf $IsoPath) | Select-Object -First 1
    if (-not $entry) { throw 'Supplied ISO is not listed in the cached official checksum manifest.' }
} else {
    $entry = $isoEntries | Where-Object { Test-Path -LiteralPath (Join-Path $cacheRoot $_.Name) } | Select-Object -Last 1
    if (-not $entry) { $entry = $isoEntries | Select-Object -Last 1 }
    $IsoPath = Join-Path $cacheRoot $entry.Name
}
if (-not (Test-Path -LiteralPath $IsoPath)) {
    $partialPath = "$IsoPath.partial"
    Write-Host "Downloading $($entry.Name) from Ubuntu..."
    Invoke-WebRequest -UseBasicParsing "$releaseBase/$($entry.Name)" -OutFile $partialPath
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $partialPath).Hash.ToLowerInvariant() -ne $entry.Hash) { throw 'Downloaded Ubuntu ISO checksum mismatch.' }
    Move-Item -LiteralPath $partialPath -Destination $IsoPath
}
Write-Host 'Verifying Ubuntu ISO SHA256...'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $IsoPath).Hash.ToLowerInvariant() -ne $entry.Hash) { throw "Ubuntu ISO checksum mismatch: $IsoPath" }

Initialize-FamilySshKey $keyPath
$publicKey = (Get-Content -LiteralPath "$keyPath.pub" -Raw).Trim()
if ($publicKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/=]+(?: .*)?$') { throw 'Invalid FamilyOS public key.' }
if (-not $vmExists) { Invoke-FamilyVBox $vbox @('createvm', '--name', $VmName, '--ostype', 'Ubuntu_64', '--basefolder', $vmRoot, '--register') }
$hostRamMB = [int][math]::Floor($preflight.host.totalRamGB * 1024)
$ramMB = [int][math]::Min(12288, [math]::Floor($hostRamMB * 0.6))
if ($ramMB -lt 8192) { throw 'The host cannot safely allocate the recommended 8 GB guest RAM.' }
$cpuCount = [int][math]::Min(6, [math]::Max(2, [math]::Floor($preflight.host.logicalProcessors / 2)))
Invoke-FamilyVBox $vbox @('modifyvm', $VmName, '--memory', "$ramMB", '--cpus', "$cpuCount", '--firmware', 'efi', '--nested-hw-virt', 'on', '--nic1', 'nat', '--graphicscontroller', 'vmsvga', '--vram', '128', '--boot1', 'disk', '--boot2', 'dvd', '--boot3', 'none')
$info = Get-FamilyVmInfo $vbox $VmName
foreach ($rule in @("familyos-ssh,tcp,127.0.0.1,$SshPort,,22", "familyos-api,tcp,127.0.0.1,$ApiPort,,$ApiPort")) {
    if ($info.Values -notcontains $rule) {
        $ruleName = ($rule -split ',')[0]
        if ($info.Values | Where-Object { $_ -like "$ruleName,*" }) { Invoke-FamilyVBox $vbox @('modifyvm', $VmName, '--natpf1', 'delete', $ruleName) }
        Invoke-FamilyVBox $vbox @('modifyvm', $VmName, '--natpf1', $rule)
    }
}
if (-not (Test-Path -LiteralPath $diskPath)) { Invoke-FamilyVBox $vbox @('createmedium', 'disk', '--filename', $diskPath, '--size', '81920', '--format', 'VDI') }
if ($info.Values -notcontains 'SATA') { Invoke-FamilyVBox $vbox @('storagectl', $VmName, '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAhci') }
Invoke-FamilyVBox $vbox @('storageattach', $VmName, '--storagectl', 'SATA', '--port', '0', '--device', '0', '--type', 'hdd', '--medium', $diskPath)
if ($info.Values -notcontains 'IDE') { Invoke-FamilyVBox $vbox @('storagectl', $VmName, '--name', 'IDE', '--add', 'ide') }

# Validate media visibility in VirtualBox's service context. Use a same-volume
# hard link if the user-profile cache is invisible to that service.
$attachArguments = @('storageattach', $VmName, '--storagectl', 'IDE', '--port', '0', '--device', '0', '--type', 'dvddrive', '--medium')
try { Invoke-FamilyVBox $vbox ($attachArguments + $IsoPath) } catch {
    $sharedCache = Join-Path $env:ProgramData 'FamilyOS\cache'
    New-Item -ItemType Directory -Force -Path $sharedCache | Out-Null
    $sharedIso = Join-Path $sharedCache $entry.Name
    if (-not (Test-Path -LiteralPath $sharedIso)) {
        New-Item -ItemType HardLink -Path $sharedIso -Target $IsoPath | Out-Null
    } elseif ((Get-FileHash -Algorithm SHA256 -LiteralPath $sharedIso).Hash.ToLowerInvariant() -ne $entry.Hash) {
        throw "Shared ISO checksum mismatch: $sharedIso"
    }
    Invoke-FamilyVBox $vbox ($attachArguments + $sharedIso)
    $IsoPath = $sharedIso
}
$templatePath = Join-Path (Split-Path -Parent $info['CfgFile']) 'familyos-autoinstall.yaml'
$template = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ubuntu-autoinstall.yaml') -Raw).Replace('__FAMILYOS_SSH_PUBLIC_KEY__', $publicKey.Replace("'", "''"))
[IO.File]::WriteAllText($templatePath, $template.Replace([string][char]13, ''), [Text.UTF8Encoding]::new($false))
$passwordPath = Join-Path $stateRoot 'guest-password.clixml'
if (Test-Path -LiteralPath $passwordPath) { $securePassword = Import-Clixml -LiteralPath $passwordPath } else {
    $randomBytes = [byte[]]::new(24)
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
    $securePassword = ConvertTo-SecureString ([Convert]::ToBase64String($randomBytes)) -AsPlainText -Force
    $securePassword | Export-Clixml -LiteralPath $passwordPath
}
$passwordFile = Join-Path $stateRoot 'install-password.tmp'
try {
    $credential = [PSCredential]::new('familyos', $securePassword)
    [IO.File]::WriteAllText($passwordFile, $credential.GetNetworkCredential().Password, [Text.UTF8Encoding]::new($false))
    $auxiliaryPrefix = Join-Path (Split-Path -Parent $info['CfgFile']) ('Unattended-' + [guid]::NewGuid().ToString('N') + '-')
    $arguments = @('unattended', 'install', $VmName, "--iso=$IsoPath", '--user=familyos', "--user-password-file=$passwordFile", '--full-user-name=FamilyOS Developer', '--hostname=familyos-vega.local', "--script-template=$templatePath", "--auxiliary-base-path=$auxiliaryPrefix", '--no-install-additions', '--start-vm=none')
    # VBox settings output can include passwords. Never emit it unfiltered.
    $output = @(& $vbox @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $safeOutput = $output | Where-Object { "$_" -notmatch '(?i)password|passwd' }
        throw "Unattended preparation failed: $($safeOutput -join [Environment]::NewLine)"
    }
} finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
@{uuid=$info['UUID']; stage='prepared'; iso=$IsoPath} | ConvertTo-Json | Set-Content -LiteralPath $markerPath
Invoke-FamilyVBox $vbox @('startvm', $VmName, '--type', 'headless')
@{uuid=$info['UUID']; stage='installing'; iso=$IsoPath} | ConvertTo-Json | Set-Content -LiteralPath $markerPath
Write-Host 'Ubuntu unattended installation started. Run .\familyos.ps1 setup to wait for installation and continue provisioning.' -ForegroundColor Green

