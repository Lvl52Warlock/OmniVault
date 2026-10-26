param(
  [Parameter(Mandatory = $true)][string]$PanelUrl,
  [Parameter(Mandatory = $true)][string]$PairingCode,
  [string]$RconHost = "127.0.0.1",
  [Parameter(Mandatory = $true)][int]$RconPort,
  [string]$RconPassword,
  [string]$AgentName = $env:COMPUTERNAME,
  [string]$FilesDir,
  [switch]$SkipRconTest
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentVersion = "1.0.0"
try {
  $agentVersion = (Get-Content -LiteralPath (Join-Path $scriptDir "package.json") -Raw | ConvertFrom-Json).version
} catch {}
# Windows PowerShell 5 can otherwise negotiate an older TLS version on some
# machines, which makes the panel pairing request fail.
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}
Set-Location $scriptDir

function Write-Step([string]$text) {
  Write-Host ""
  Write-Host "==> $text" -ForegroundColor Cyan
}

function Get-PanelOrigin([string]$value) {
  $text = $value.Trim()
  if ($text -notmatch "^https?://") { $text = "https://$text" }
  $uri = [Uri]$text
  if ($uri.Scheme -ne "https" -and $uri.Scheme -ne "http") {
    throw "The panel URL must use http or https."
  }
  $origin = "$($uri.Scheme)://$($uri.Host)"
  if (-not $uri.IsDefaultPort) { $origin += ":$($uri.Port)" }
  if ($uri.Scheme -eq "http" -and $uri.Host -notin @("127.0.0.1", "localhost", "::1")) {
    throw "Use the HTTPS panel URL, not plain HTTP."
  }
  return $origin
}

if (-not (Test-Path -LiteralPath (Join-Path $scriptDir "agent.js"))) {
  throw "agent.js was not found next to install-agent.ps1. Unzip the whole agent package."
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
  throw "Node.js is required. Install the Node.js LTS release from https://nodejs.org/ and run this installer again."
}
if (-not $RconPort -or $RconPort -lt 1 -or $RconPort -gt 65535) {
  throw "RconPort must be between 1 and 65535."
}
if (-not $RconPassword) {
  $secure = Read-Host "RCON password for $RconHost`:$RconPort" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $RconPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
if (-not $RconPassword) { throw "The RCON password cannot be empty." }

$filesRoot = ""
if ($FilesDir) {
  $resolvedFiles = Resolve-Path -LiteralPath $FilesDir -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $resolvedFiles.Path -PathType Container)) {
    throw "FilesDir must be a folder, for example the server's Content directory."
  }
  $filesRoot = $resolvedFiles.Path
}

$origin = Get-PanelOrigin $PanelUrl
$normalizedCode = ($PairingCode.ToUpper() -replace "[^A-F0-9]", "")
if ($normalizedCode.Length -ne 8) {
  throw "The pairing code is not valid. Copy the code shown in the control panel (for example 1A2B-3C4D)."
}

Write-Step "Installing the agent dependencies"
& $npm.Source install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed. Check your internet connection and Node.js installation." }

if (-not $SkipRconTest) {
  Write-Step "Testing the local RCON connection"
  $testConfigPath = Join-Path $scriptDir ".agent-test-config.json"
  $testConfig = @{
    panelUrl = "http://127.0.0.1"
    serverId = "test"
    agentToken = "test"
    rcon = @{ host = $RconHost; port = $RconPort; password = $RconPassword }
  }
  try {
    $testConfig | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $testConfigPath -Encoding utf8
    $testOutput = & $node.Source "agent.js" "--test" "--config" $testConfigPath 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "RCON test failed: $($testOutput -join ' ')"
    }
    Write-Host ($testOutput -join [Environment]::NewLine) -ForegroundColor Green
  } finally {
    Remove-Item -LiteralPath $testConfigPath -Force -ErrorAction SilentlyContinue
  }
}

Write-Step "Pairing with the control panel"
$pairBody = @{
  pairingCode = $normalizedCode
  agentName = $AgentName
  agentVersion = $agentVersion
} | ConvertTo-Json
$pair = $null
try {
  $pair = Invoke-RestMethod -Uri "$origin/api/agent/pair" -Method Post -ContentType "application/json" -Body $pairBody -TimeoutSec 30
} catch {
  $detail = ""
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
  throw "The panel rejected the pairing code. Generate a new code in the control panel and try again. $detail"
}
if (-not $pair.ok -or -not $pair.token -or -not $pair.serverId) {
  throw "The panel did not return an agent token. Generate a new pairing code and try again."
}

Write-Step "Saving the agent configuration"
$config = @{
  panelUrl = $origin
  serverId = $pair.serverId
  agentToken = $pair.token
  agentName = $AgentName
  rcon = @{ host = $RconHost; port = [int]$RconPort; password = $RconPassword }
}
if ($filesRoot) { $config.filesRoot = $filesRoot }
$configPath = Join-Path $scriptDir "agent-config.json"
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding utf8

# Keep the RCON password and agent token out of other local accounts.
try {
  $aclUser = "$env:USERDOMAIN\$env:USERNAME"
  if (-not $env:USERDOMAIN) { $aclUser = $env:USERNAME }
  & icacls.exe $configPath /inheritance:r /grant:r "${aclUser}:(R,W)" | Out-Null
} catch {
  Write-Warning "Could not restrict permissions on agent-config.json. Keep that file private."
}

if (-not $SkipRconTest) {
  Write-Step "Verifying the saved configuration"
  $verifyOutput = & $node.Source "agent.js" "--test" 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "The saved agent configuration failed to start: $($verifyOutput -join ' ')"
  }
  Write-Host ($verifyOutput -join [Environment]::NewLine) -ForegroundColor Green
}

Write-Host ""
Write-Host "Agent installed for '$($pair.serverName)'." -ForegroundColor Green
Write-Host "Start it with:" -ForegroundColor Cyan
Write-Host "  .\start-agent.cmd" -ForegroundColor White
Write-Host ""
Write-Host "Keep that window open while you want remote control to work."
Write-Host "The agent only makes outbound HTTPS/WSS connections; no port forwarding is needed."
