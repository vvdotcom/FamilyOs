# Repairs the specific drive-root installation found during FamilyOS setup.
# Run elevated. Windows Installer removes only its registered product files.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repairRoot = Join-Path $env:ProgramData 'FamilyOS\repair'
New-Item -ItemType Directory -Path $repairRoot -Force | Out-Null
$statusPath = Join-Path $repairRoot 'status.json'
function Set-RepairStatus([string]$Stage, [string]$Detail) {
    @{stage=$Stage; detail=$Detail; updated=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $statusPath
}
try {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Windows administrator approval is required for VirtualBox drivers.' }
    $installer = Join-Path $env:ProgramData 'FamilyOS\cache\VirtualBox-7.2.20-175154-Win.exe'
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash -ne 'A81777D2B36380CE042A29E9C554CF032EB46A793F62E3CC82E7411E535C2C26') { throw 'Installer hash mismatch.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Oracle') { throw 'Installer is not validly signed by Oracle.' }
    $installDir = Get-ItemPropertyValue -LiteralPath 'HKLM:\SOFTWARE\Oracle\VirtualBox' -Name InstallDir -ErrorAction SilentlyContinue
    if ($installDir -and $installDir -ne 'D:\') { throw "VirtualBox install directory changed to '$installDir'; this targeted repair no longer applies." }
    if (Test-Path -LiteralPath 'D:\VBoxManage.exe') {
        $running = @(& 'D:\VBoxManage.exe' list runningvms)
        if ($LASTEXITCODE -ne 0 -or $running.Count -gt 0) { throw 'Cannot repair VirtualBox while a VM is running.' }
    }
    Set-RepairStatus 'backing-up' 'Preserving VM registration and configuration.'
    $backup = Join-Path $repairRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
    New-Item -ItemType Directory -Path $backup | Out-Null
    foreach ($source in @((Join-Path $env:USERPROFILE '.VirtualBox\VirtualBox.xml'), (Join-Path $env:LOCALAPPDATA 'FamilyOS\vm\FamilyOS-Vega\FamilyOS-Vega.vbox'))) {
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $backup }
    }
    foreach ($window in @(Get-Process -Name VirtualBox -ErrorAction SilentlyContinue)) {
        if ($window.Path -ne 'D:\VirtualBox.exe') { throw 'Unexpected VirtualBox executable is open.' }
        $null = $window.CloseMainWindow()
        if (-not $window.WaitForExit(10000)) { throw 'Close the VirtualBox Manager window, then rerun this repair.' }
    }
    foreach ($service in @(Get-Process -Name VBoxSVC -ErrorAction SilentlyContinue)) {
        if ($service.Path -eq 'D:\VBoxSVC.exe') { Stop-Process -Id $service.Id -ErrorAction Stop }
    }
    $product = '{BA553E42-4B98-43E8-BD2F-A0A19A58FF6F}'
    if (Test-Path -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$product") {
        Set-RepairStatus 'uninstalling' 'Removing registered VirtualBox program files; preserving all VM disks.'
        $uninstallLog = Join-Path $repairRoot 'uninstall.log'
        $remove = Start-Process msiexec.exe -ArgumentList ('/x {0} /qn /norestart /L*v "{1}"' -f $product, $uninstallLog) -WindowStyle Hidden -Wait -PassThru
        if ($remove.ExitCode -notin @(0,3010)) { throw "VirtualBox removal failed ($($remove.ExitCode)); see $uninstallLog." }
    }
    Set-RepairStatus 'installing' 'Installing signed Oracle VirtualBox in C:\Program Files\Oracle\VirtualBox.'
    # The fresh install uses Oracle's Program Files default. Avoid passing a
    # quoted INSTALLDIR through both the EXE wrapper and MSI command parsers.
    $install = Start-Process -FilePath $installer -ArgumentList '--silent -msiparams REBOOT=ReallySuppress VBOX_START=0' -WindowStyle Hidden -Wait -PassThru
    if ($install.ExitCode -notin @(0,3010)) { throw "Oracle installer failed ($($install.ExitCode)); inspect the latest MSI log in the temp folder." }
    $vbox = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
    $version = & $vbox --version
    if ($LASTEXITCODE -ne 0) { throw 'Repaired VirtualBox failed its version check.' }
    Set-RepairStatus 'complete' "VirtualBox $version installed. Resume FamilyOS bootstrap. A VM start will verify driver readiness."
} catch {
    Set-RepairStatus 'failed' $_.Exception.Message
    throw
}
