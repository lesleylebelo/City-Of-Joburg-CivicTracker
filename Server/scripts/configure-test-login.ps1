param([switch]$SeedTestAccounts)
$ErrorActionPreference = 'Stop'
$secret = $null
$pointer = [IntPtr]::Zero
$plain = $null
$payload = $null
$process = $null
$resultCode = 1
try {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $scriptPath = Join-Path $PSScriptRoot 'configure-test-login.cjs'
    & $nodePath $scriptPath --check-config
    if ($LASTEXITCODE -ne 0) { throw 'Invalid private configuration.' }

    $secret = Read-Host 'Supabase postgres owner password (masked; not the application password)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $payload = @{ ownerPassword = $plain } | ConvertTo-Json -Compress

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodePath
    $startInfo.Arguments = '"' + $scriptPath + '"'
    if ($SeedTestAccounts) { $startInfo.Arguments += ' --seed-test-accounts' }
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($payload)
    $process.StandardInput.Close()
    $plain = $null
    $payload = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $pointer = [IntPtr]::Zero
    $secret.Dispose()
    $secret = $null
    $process.WaitForExit()
    $output = $outputTask.GetAwaiter().GetResult()
    $errorOutput = $errorTask.GetAwaiter().GetResult()
    if ($output) { Write-Host $output.TrimEnd() }
    if ($errorOutput) { Write-Host $errorOutput.TrimEnd() }
    $resultCode = $process.ExitCode
} catch {
    Write-Host 'Setup stopped. No owner credential was saved. Check configuration and the Node installation.'
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($secret) { $secret.Dispose() }
    $plain = $null
    $payload = $null
    if ($process) { $process.Dispose() }
}
exit $resultCode
