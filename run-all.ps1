<#
.SYNOPSIS
    Starts all ScanMate2 services in separate PowerShell windows.

.DESCRIPTION
    Launches:
      1. ML/server.py             (FastAPI, activates ML/.venv first)
      2. Server/src/server.js     (Node API via `npm run dev`)
      3. ScanMateApp              (React Native Metro via `npm start`)

.PARAMETER Debug
    Pass -Debug to start the Python server with --debug (frame dumping).

.EXAMPLE
    .\run-all.ps1
    .\run-all.ps1 -Debug
#>

[CmdletBinding()]
param(
    [switch]$DebugMode
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

function Start-ServiceWindow {
    param(
        [string]$Title,
        [string]$WorkingDir,
        [string]$Command
    )
    $full = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$WorkingDir'; $Command"
    Start-Process -FilePath 'powershell.exe' `
                  -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command',$full
}

$launched = 0

# 1) Python FastAPI — port 8000
if (Test-PortInUse 8000) {
    Write-Host "[ML server]    already running on port 8000, skipping." -ForegroundColor Yellow
} else {
    # Use the venv python.exe directly — no activation needed, more reliable.
    # If the venv doesn't exist yet, create it with uv first.
    $pyExe  = Join-Path $root 'ML\.venv\Scripts\python.exe'
    if (-not (Test-Path $pyExe)) {
        Write-Host '[ML server]    .venv not found — running: uv venv + uv pip install' -ForegroundColor Yellow
        $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
        $uvExe = if ($uvCmd) { $uvCmd.Source } else { "$env:USERPROFILE\.local\bin\uv.exe" }
        Push-Location (Join-Path $root 'ML')
        & $uvExe venv .venv
        & $uvExe pip install -r requirements.txt
        Pop-Location
    }
    $pyArgs = if ($DebugMode) { 'server.py --debug' } else { 'server.py' }
    $pyCmd  = "& '$pyExe' $pyArgs"
    Start-ServiceWindow -Title 'ML server.py' `
                        -WorkingDir (Join-Path $root 'ML') `
                        -Command $pyCmd
    Write-Host "[ML server]    launched (port 8000)" -ForegroundColor Green
    $launched++
}

# 2) Node API — port 4000
if (Test-PortInUse 4000) {
    Write-Host "[Node API]     already running on port 4000, skipping." -ForegroundColor Yellow
} else {
    Start-ServiceWindow -Title 'Server (Node)' `
                        -WorkingDir (Join-Path $root 'Server') `
                        -Command 'npm run dev'
    Write-Host "[Node API]     launched (port 4000)" -ForegroundColor Green
    $launched++
}

# 3) React Native Metro — port 8081
if (Test-PortInUse 8081) {
    Write-Host "[Metro]        already running on port 8081, skipping." -ForegroundColor Yellow
} else {
    Start-ServiceWindow -Title 'ScanMateApp (Metro)' `
                        -WorkingDir (Join-Path $root 'ScanMateApp') `
                        -Command 'npx react-native start'
    Write-Host "[Metro]        launched (port 8081)" -ForegroundColor Green
    $launched++
}

if ($launched -eq 0) {
    Write-Host "All services are already running." -ForegroundColor Cyan
} else {
    Write-Host "$launched service window(s) opened. Close a window to stop that service." -ForegroundColor Cyan
}
