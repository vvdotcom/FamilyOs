[CmdletBinding()]
param(
    [int]$SshPort = 2222,
    [string]$Guest = 'familyos@127.0.0.1',
    [ValidatePattern('^~/[A-Za-z0-9_/-]+$')][string]$GuestPath = '~/projects/familyos'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$keyPath = Join-Path $env:LOCALAPPDATA 'FamilyOS\state\familyos_ed25519'
$knownHostsPath = Join-Path $env:LOCALAPPDATA 'FamilyOS\state\known_hosts'
$connectionOptions = @('-i', $keyPath, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', ('UserKnownHostsFile="' + $knownHostsPath + '"'))
if (-not (Test-Path -LiteralPath $keyPath)) { throw 'FamilyOS VM SSH key is missing. Run familyos.ps1 setup first.' }

& ssh @connectionOptions -p $SshPort $Guest "mkdir -p $GuestPath"
if ($LASTEXITCODE -ne 0) { throw 'Unable to create the guest repository directory.' }

Push-Location $projectRoot
$archiveName = 'familyos-source-' + [guid]::NewGuid().ToString('N') + '.tar'
$archivePath = Join-Path $env:TEMP $archiveName
try {
    # Windows PowerShell 5.1 text-encodes native pipelines, corrupting tar data.
    # Transfer an archive as a file so all PowerShell versions preserve bytes.
    & tar --exclude-from=.familyos-syncignore -cf $archivePath .
    if ($LASTEXITCODE -ne 0) { throw 'Unable to archive the repository.' }
    & scp @connectionOptions -P $SshPort $archivePath "${Guest}:/tmp/$archiveName"
    if ($LASTEXITCODE -ne 0) { throw 'Repository archive transfer failed.' }
    & ssh @connectionOptions -p $SshPort $Guest "tar -xf /tmp/$archiveName -C $GuestPath && rm -- /tmp/$archiveName"
    if ($LASTEXITCODE -ne 0) { throw 'Repository extraction failed.' }
} finally {
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
    Pop-Location
}

Write-Host "Synchronized FamilyOS to $GuestPath" -ForegroundColor Green

