$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path -LiteralPath "agent-config.json")) {
  Write-Host "The agent is not installed yet. Run install-agent.ps1 with the pairing code from the control panel." -ForegroundColor Yellow
  Read-Host "Press Enter to close"
  exit 1
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js was not found. Install Node.js LTS from https://nodejs.org/ and try again." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

$logDir = Join-Path $scriptDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir "agent.log"

Write-Host "Starting the OmniVault agent. Keep this window open." -ForegroundColor Cyan
Write-Host "Log: $logPath"
Write-Host ""

$env:OMNIVAULT_AGENT_SUPERVISED = "1"
while ($true) {
  & $node.Source "agent.js" 2>&1 | Tee-Object -FilePath $logPath -Append
  $exitCode = $LASTEXITCODE
  if (Test-Path -LiteralPath ".update-restart") {
    Remove-Item -LiteralPath ".update-restart" -Force -ErrorAction SilentlyContinue
    Write-Host "Agent update installed; restarting..." -ForegroundColor Cyan
    Start-Sleep -Seconds 1
    continue
  }
  exit $exitCode
}
