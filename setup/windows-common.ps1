# Shared Windows helpers, compatible with Windows PowerShell 5.1.
function ConvertTo-FamilyGuestCommand {
    param([string]$Script)
    # Legacy Windows native-argument handling strips embedded double quotes.
    # A quote-free transport preserves Bash variables and multiline scripts.
    $encodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script.Replace("`r", '')))
    return "printf %s $encodedScript | base64 --decode | bash"
}

function Find-VBoxManage {
    $command = Get-Command VBoxManage.exe -ErrorAction SilentlyContinue
    $candidates = @()
    if ($command) { $candidates += $command.Source }
    foreach ($key in @('HKLM:\SOFTWARE\Oracle\VirtualBox', 'HKLM:\SOFTWARE\WOW6432Node\Oracle\VirtualBox')) {
        $installDir = Get-ItemPropertyValue -LiteralPath $key -Name InstallDir -ErrorAction SilentlyContinue
        if ($installDir) { $candidates += Join-Path $installDir 'VBoxManage.exe' }
    }
    foreach ($programDir in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($programDir) { $candidates += Join-Path $programDir 'Oracle\VirtualBox\VBoxManage.exe' }
    }
    return $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique | Select-Object -First 1
}

function Invoke-FamilyVBox {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "VirtualBox operation '$($Arguments[0])' failed with exit code $LASTEXITCODE. Setup stopped at this step."
    }
}

function Get-FamilyVmInfo {
    param([string]$Executable, [string]$VmName)
    $properties = @{}
    Invoke-FamilyVBox $Executable @('showvminfo', $VmName, '--machinereadable') | ForEach-Object {
        if ($_ -match '^"?([^"=]+)"?=(.*)$') {
            $properties[$matches[1]] = $matches[2].Trim('"').Replace('\\', '\')
        }
    }
    return $properties
}

function Initialize-FamilySshKey {
    param([string]$KeyPath)
    if (Test-Path -LiteralPath $KeyPath) {
        if (-not (Test-Path -LiteralPath "$KeyPath.pub")) { throw "Existing key has no public key: $KeyPath.pub. Recover it before continuing." }
        return
    }
    if (Test-Path -LiteralPath "$KeyPath.pub") { throw 'An orphaned SSH public key exists; refusing to replace it.' }
    $keygen = Get-Command ssh-keygen.exe -ErrorAction Stop
    # PS 5.1 drops empty arguments with the call operator. Preserve -N "" by
    # passing a native command line directly, without invoking another shell.
    if ($KeyPath.Contains('"')) { throw 'Invalid SSH key path.' }
    $process = Start-Process -FilePath $keygen.Source -ArgumentList ('-q -t ed25519 -N "" -C familyos-vm -f "{0}"' -f $KeyPath) -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath "$KeyPath.pub")) {
        throw "Unable to create the VM SSH key (exit code $($process.ExitCode))."
    }
}
