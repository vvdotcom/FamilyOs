# Run with powershell.exe (5.1) to exercise native empty-argument handling.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'windows-common.ps1')
$testRoot = Join-Path $env:TEMP ('familyos-bootstrap-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$key = Join-Path $testRoot 'key with spaces'
$recovered = Join-Path $testRoot 'recovered.pub'
try {
    $guestScript = 'value=""; test -n "$value" && echo present || echo missing'
    $transport = ConvertTo-FamilyGuestCommand $guestScript
    $encoded = ($transport -split ' ')[2]
    if ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) -ne $guestScript) {
        throw 'Guest script quoting was not preserved.'
    }
    Initialize-FamilySshKey $key
    $hash = (Get-FileHash -LiteralPath $key).Hash
    Initialize-FamilySshKey $key
    if ((Get-FileHash -LiteralPath $key).Hash -ne $hash) { throw 'Rerunning setup replaced an existing private key.' }
    $keygen = (Get-Command ssh-keygen.exe).Source
    $result = Start-Process $keygen -ArgumentList ('-y -P "" -f "{0}"' -f $key) -WindowStyle Hidden -RedirectStandardOutput $recovered -Wait -PassThru
    if ($result.ExitCode -ne 0) { throw 'Generated SSH private key cannot be read with its empty passphrase.' }
    $public = (Get-Content -LiteralPath "$key.pub" -Raw).Trim() -split ' '
    $roundtrip = (Get-Content -LiteralPath $recovered -Raw).Trim() -split ' '
    if ($public[1] -ne $roundtrip[1]) { throw 'Generated public/private keys do not match.' }
    $caught = $false
    try { Invoke-FamilyVBox $env:ComSpec @('/d', '/c', 'exit', '7') } catch {
        if ($_.Exception.Message -notmatch 'exit code 7') { throw }
        $caught = $true
    }
    if (-not $caught) { throw 'Native failure was silently ignored.' }
    Write-Host 'PASS: guest-script quoting, SSH key round-trip, paths with spaces, idempotent key reuse, and native failure propagation.'
} finally {
    # Delete only the three files produced by this test; no recursive removal.
    foreach ($file in @($key, "$key.pub", $recovered)) {
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
    }
    Remove-Item -LiteralPath $testRoot
}
