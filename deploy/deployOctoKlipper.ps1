#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Builds and deploys the OctoKlipper plugin to the Raspberry Pi.
.DESCRIPTION
    1. Builds the plugin zip locally (via scripts\zipOctoKlipper.ps1)
    2. Uploads the zip to the Pi via SCP
    3. Runs pip install on the Pi via SSH (into the OctoPrint venv)
    4. Optionally restarts OctoPrint

    Machine-specific settings are read from deploy.config.json (gitignored).
    Copy deploy.config.example.json to deploy.config.json and adjust.
.PARAMETER Restart
    Restart the OctoPrint service after a successful install.
.PARAMETER SkipBuild
    Skip the local zip build and use the existing zip in scripts\.
.PARAMETER Editable
    Upload the source tree instead of the zip and run `pip install -e .`
    (dev workflow; version will carry the git suffix).
#>
param(
    [switch]$Restart,
    [switch]$SkipBuild,
    [switch]$Editable
)

$ErrorActionPreference = "Stop"

# --- Configuration (from deploy.config.json, gitignored) ----------------------
$configPath = Join-Path $PSScriptRoot "deploy.config.json"
$config = @{}
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
}
else {
    Write-Warning "Config file not found: $configPath. Copy deploy.config.example.json to deploy.config.json and adjust."
}

$remoteUser = if ($config.remoteUser) { [string]$config.remoteUser } else { "sven" }
$remoteHost = if ($config.remoteHost) { [string]$config.remoteHost } else { "192.168.1.201" }
$remoteVenvPython = if ($config.remoteVenvPython) { [string]$config.remoteVenvPython } else { "/home/sven/OctoPrint/venv/bin/python3" }
$remoteDir = if ($config.remoteDir) { [string]$config.remoteDir } else { "/home/sven/octoklipper-deploy" }

$localRoot = Split-Path -Parent $PSScriptRoot
$zipScript = Join-Path $localRoot "scripts\zipOctoKlipper.ps1"
$localZip = Join-Path $localRoot "scripts\OctoprintKlipperPlugin.zip"
$remoteZip = "$remoteDir/OctoprintKlipperPlugin.zip"
$remoteTarget = "${remoteUser}@${remoteHost}"

# --- Logging -----------------------------------------------------------------
$deployTimestamp = [datetime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$global:LogFilePath = Join-Path $PSScriptRoot "deploylogs\deploy-$deployTimestamp.log"

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("Info", "Warning", "Error", "Success", "Step")][string]$Level = "Info"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    switch ($Level) {
        "Info"    { Write-Host $logMessage -ForegroundColor White }
        "Warning" { Write-Host $logMessage -ForegroundColor Yellow }
        "Error"   { Write-Host $logMessage -ForegroundColor Red }
        "Success" { Write-Host $logMessage -ForegroundColor Green }
        "Step"    { Write-Host $logMessage -ForegroundColor Cyan }
    }
    $logDir = Split-Path $global:LogFilePath -Parent
    if (-not (Test-Path $logDir)) { $null = New-Item -ItemType Directory -Force -Path $logDir }
    Add-Content -Path $global:LogFilePath -Value $logMessage
}

function Assert-LastExitCode {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed (exit code $LASTEXITCODE)"
    }
}

function Resolve-ExternalCommand {
    param([string[]]$Names, [string[]]$CandidatePaths = @())
    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) { return $cmd.Source }
    }
    foreach ($path in $CandidatePaths) {
        if ($path -and (Test-Path $path)) { return $path }
    }
    return $null
}

# --- SSH client detection (OpenSSH preferred, PuTTY fallback) -----------------
$sshPath = Resolve-ExternalCommand -Names @("ssh", "ssh.exe")
$scpPath = Resolve-ExternalCommand -Names @("scp", "scp.exe")
$plinkPath = Resolve-ExternalCommand -Names @("plink", "plink.exe") -CandidatePaths @(
    (Join-Path $env:ProgramFiles "PuTTY\plink.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "PuTTY\plink.exe")
)
$pscpPath = Resolve-ExternalCommand -Names @("pscp", "pscp.exe") -CandidatePaths @(
    (Join-Path $env:ProgramFiles "PuTTY\pscp.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "PuTTY\pscp.exe")
)

$useOpenSsh = [bool]($sshPath -and $scpPath)
$usePutty = [bool]($plinkPath -and $pscpPath)
if (-not $useOpenSsh -and -not $usePutty) {
    throw "No SSH client found. Install OpenSSH (ssh/scp) or PuTTY (plink/pscp)."
}

$openSshArgs = @(
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "PreferredAuthentications=publickey",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3"
)
$resolvedKeyPath = $null
foreach ($candidate in @((Join-Path $env:USERPROFILE ".ssh\id_ed25519"), (Join-Path $env:USERPROFILE ".ssh\id_rsa"))) {
    if (Test-Path $candidate) { $resolvedKeyPath = $candidate; break }
}
if ($resolvedKeyPath) {
    $openSshArgs += @("-i", $resolvedKeyPath, "-o", "IdentitiesOnly=yes")
}

$password = $null
if ($usePutty) {
    Write-Log -Message "==> Using PuTTY client (plink/pscp)." -Level "Info"
    $credFile = Join-Path $env:USERPROFILE "\.ssh\octoklipper_ssh.cred"
    if (Test-Path $credFile) {
        $securePassword = Get-Content $credFile | ConvertTo-SecureString
    }
    else {
        $securePassword = Read-Host "SSH Password for ${remoteUser}@${remoteHost}" -AsSecureString
        $null = New-Item -ItemType Directory -Force -Path (Split-Path $credFile)
        $securePassword | ConvertFrom-SecureString | Set-Content $credFile
        Write-Log -Message "==> Password saved to $credFile (encrypted for current Windows user)." -Level "Info"
    }
    $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    )
}
else {
    Write-Log -Message "==> Using OpenSSH client (ssh/scp) in batch mode." -Level "Info"
    if ($resolvedKeyPath) {
        Write-Log -Message "==> Using SSH key: $resolvedKeyPath" -Level "Info"
    }
    else {
        Write-Log -Message "==> No explicit SSH key found; OpenSSH agent/default identities will be used." -Level "Info"
    }
}

# --- Remote helpers -----------------------------------------------------------
function Invoke-RemoteCommand {
    param([string]$Command, [string]$Step)
    if ($usePutty) {
        & $plinkPath -batch -pw $password $remoteTarget $Command
        Assert-LastExitCode -Step $Step
    }
    else {
        $sshArgs = $openSshArgs + @("-n") + @($remoteTarget, $Command)
        & $sshPath @sshArgs
        Assert-LastExitCode -Step $Step
    }
}

function Copy-ToRemote {
    param([string]$LocalPath, [string]$RemotePath, [string]$Step)
    # Directories need the recursive flag on both pscp and scp.
    $isDir = Test-Path -Path $LocalPath -PathType Container
    if ($usePutty) {
        $pscpArgs = @("-batch", "-pw", $password)
        if ($isDir) { $pscpArgs += "-r" }
        $pscpArgs += @($LocalPath, "${remoteTarget}:${RemotePath}")
        & $pscpPath @pscpArgs
        Assert-LastExitCode -Step $Step
    }
    else {
        # OpenSSH scp may misinterpret Windows absolute paths; use a relative path.
        $localForTransfer = $LocalPath
        try {
            $resolved = (Resolve-Path -Path $LocalPath -ErrorAction Stop).Path
            if ($resolved -match '^[A-Za-z]:\\') {
                $relative = Resolve-Path -Path $resolved -Relative -ErrorAction Stop
                if (-not [string]::IsNullOrWhiteSpace($relative)) { $localForTransfer = $relative }
            }
        }
        catch { }
        $localForTransfer = $localForTransfer -replace '\\', '/'
        $scpArgs = $openSshArgs
        if ($isDir) { $scpArgs += "-r" }
        $scpArgs += @($localForTransfer, "${remoteTarget}:${RemotePath}")
        & $scpPath @scpArgs
        Assert-LastExitCode -Step $Step
    }
}

# --- 1. Build ----------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Log -Message "==> Building plugin zip..." -Level "Step"
    & $zipScript
    Assert-LastExitCode -Step "Build zip"
}
else {
    Write-Log -Message "==> Skipping build (-SkipBuild)." -Level "Warning"
}

if (-not (Test-Path $localZip)) {
    throw "Zip not found: $localZip. Run without -SkipBuild or build first."
}

# --- 2. Upload ---------------------------------------------------------------
Write-Log -Message "==> Uploading zip to ${remoteTarget}..." -Level "Step"
Invoke-RemoteCommand -Command "mkdir -p '$remoteDir'" -Step "Ensure remote directory"
Copy-ToRemote -LocalPath $localZip -RemotePath $remoteZip -Step "Upload zip"

# --- 3. pip install ----------------------------------------------------------
Write-Log -Message "==> Installing plugin on the Pi..." -Level "Step"
if ($Editable) {
    # Dev workflow: upload the source tree and editable-install it.
    Write-Log -Message "==> Editable mode: uploading source tree..." -Level "Info"
    $remoteSrc = "$remoteDir/OctoprintKlipperPlugin"
    Invoke-RemoteCommand -Command "rm -rf '$remoteSrc' && mkdir -p '$remoteSrc'" -Step "Prepare remote source dir"
    # Upload the plugin package + setup files (exclude dev-only folders).
    $items = @("octoprint_klipper", "setup.py", "setup.cfg", "MANIFEST.in", "requirements.txt", "babel.cfg")
    foreach ($item in $items) {
        $localItem = Join-Path $localRoot $item
        if (Test-Path $localItem) {
            # pscp -r needs the remote target directory to already exist.
            if (Test-Path -Path $localItem -PathType Container) {
                Invoke-RemoteCommand -Command "mkdir -p '$remoteSrc/$item'" -Step "Create remote dir $item"
            }
            Copy-ToRemote -LocalPath $localItem -RemotePath "$remoteSrc/$item" -Step "Upload $item"
        }
    }
    Invoke-RemoteCommand -Command "$remoteVenvPython -m pip install -e '$remoteSrc' --no-build-isolation" -Step "Editable install"
}
else {
    Invoke-RemoteCommand -Command "$remoteVenvPython -m pip install '$remoteZip' --no-build-isolation --no-cache-dir" -Step "pip install"
}

Write-Log -Message "==> Plugin installed." -Level "Success"

# --- 4. Optional restart -----------------------------------------------------
if ($Restart) {
    Write-Log -Message "==> Restarting OctoPrint service..." -Level "Step"
    Invoke-RemoteCommand -Command "sudo systemctl restart octoprint" -Step "Restart OctoPrint"
    Write-Log -Message "==> OctoPrint restarted." -Level "Success"
}
else {
    Write-Log -Message "==> OctoPrint NOT restarted (use -Restart to restart it)." -Level "Warning"
}

Write-Log -Message "`n==> Deploy complete! Log: $global:LogFilePath" -Level "Success"
