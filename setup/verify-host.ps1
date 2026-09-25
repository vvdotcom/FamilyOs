[CmdletBinding()]
param(
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'windows-common.ps1')

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$computer = try { Get-CimInstance Win32_ComputerSystem -ErrorAction Stop } catch { $null }
$os = try { Get-CimInstance Win32_OperatingSystem -ErrorAction Stop } catch { $null }
$processor = try { Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1 } catch { $null }
$systemDrive = try { Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'" -ErrorAction Stop } catch { $null }
$computerInfo = if (-not $computer) {
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.Devices.ComputerInfo]::new()
} else { $null }
$driveInfo = if (-not $systemDrive) { [IO.DriveInfo]::new($env:SystemDrive) } else { $null }
$vbox = Find-VBoxManage
$git = Get-Command git -ErrorAction SilentlyContinue
$vmName = 'FamilyOS-Vega'
$vmExists = $false
$vmState = 'missing'
$nestedVirtualization = $false

if ($vbox) {
    $vmList = & $vbox list vms 2>$null
    $vmExists = [bool]($vmList | Select-String -SimpleMatch ('"' + $vmName + '"'))
    if ($vmExists) {
        $vmInfo = & $vbox showvminfo $vmName --machinereadable 2>$null
        $stateLine = $vmInfo | Select-String '^VMState=' | Select-Object -First 1
        if ($stateLine) { $vmState = ($stateLine.Line -split '=', 2)[1].Trim('"') }
        $nestedLine = $vmInfo | Select-String '^(NestedHWVirt|nested-hw-virt)=' | Select-Object -First 1
        if ($nestedLine) { $nestedVirtualization = $nestedLine.Line -match 'on|true|1' }
    }
}

$firmwareVirtualization = $null
if ($processor -and $null -ne $processor.VirtualizationFirmwareEnabled) {
    $firmwareVirtualization = [bool]$processor.VirtualizationFirmwareEnabled
}

$status = if ($firmwareVirtualization -eq $false) {
    'NEEDS_BIOS_VIRTUALIZATION'
} elseif (-not $vbox) {
    'NEEDS_ADMIN_APPROVAL'
} elseif (-not $vmExists) {
    'NEEDS_VM_CREATION'
} elseif ($vmState -ne 'running') {
    'VM_STOPPED'
} elseif ($nestedVirtualization) {
    'VM_RUNNING_GUEST_UNVERIFIED'
} else {
    'NEEDS_NESTED_VIRTUALIZATION'
}

$result = [ordered]@{
    status = $status
    host = [ordered]@{
        operatingSystem = if ($os) { $os.Caption } else { [Runtime.InteropServices.RuntimeInformation]::OSDescription }
        version = if ($os) { $os.Version } else { [Environment]::OSVersion.Version.ToString() }
        architecture = if ($os) { $os.OSArchitecture } else { [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() }
        cpu = if ($processor) { $processor.Name.Trim() } else { $env:PROCESSOR_IDENTIFIER }
        logicalProcessors = if ($computer) { [int]$computer.NumberOfLogicalProcessors } else { [Environment]::ProcessorCount }
        totalRamGB = if ($computer) { [math]::Round($computer.TotalPhysicalMemory / 1GB, 1) } else { [math]::Round($computerInfo.TotalPhysicalMemory / 1GB, 1) }
        freeDiskGB = if ($systemDrive) { [math]::Round($systemDrive.FreeSpace / 1GB, 1) } else { [math]::Round($driveInfo.AvailableFreeSpace / 1GB, 1) }
        firmwareVirtualization = $firmwareVirtualization
        powershell = $PSVersionTable.PSVersion.ToString()
        administrator = Test-Administrator
    }
    git = [ordered]@{
        available = [bool]$git
        path = if ($git) { $git.Source } else { $null }
    }
    virtualBox = [ordered]@{
        available = [bool]$vbox
        path = $vbox
    }
    vm = [ordered]@{
        name = $vmName
        exists = $vmExists
        state = $vmState
        nestedVirtualization = $nestedVirtualization
    }
    routing = 'Windows is not a native Vega SDK host; use the managed Ubuntu x86_64 guest.'
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5 -Compress
    exit 0
}

Write-Host "FamilyOS host preflight: $status" -ForegroundColor Cyan
Write-Host "OS: $($result.host.operatingSystem) $($result.host.version) [$($result.host.architecture)]"
Write-Host "CPU: $($result.host.cpu) ($($result.host.logicalProcessors) logical processors)"
Write-Host "RAM: $($result.host.totalRamGB) GB | Free system disk: $($result.host.freeDiskGB) GB"
Write-Host "Firmware virtualization: $($result.host.firmwareVirtualization)"
Write-Host "PowerShell: $($result.host.powershell) | Administrator: $($result.host.administrator)"
Write-Host "Git: $($result.git.available) | VirtualBox: $($result.virtualBox.available)"
Write-Host "VM: $($result.vm.name) | Exists: $($result.vm.exists) | State: $($result.vm.state) | Nested virtualization: $($result.vm.nestedVirtualization)"
Write-Host $result.routing

