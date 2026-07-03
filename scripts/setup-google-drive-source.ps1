param(
  [Parameter(Mandatory = $true)]
  [string]$SpreadsheetId,

  [Parameter(Mandatory = $true)]
  [string]$DriveRootFolderId,

  [Parameter(Mandatory = $false)]
  [string]$AppsScriptUrl = "",

  [Parameter(Mandatory = $false)]
  [string]$CurrentUser = "Production User",

  [Parameter(Mandatory = $false)]
  [string]$CurrentRole = "Management",

  [switch]$SkipSchema,

  [switch]$Build
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $scriptPath = Split-Path -Parent $MyInvocation.ScriptName
  return (Resolve-Path (Join-Path $scriptPath "..")).Path
}

function Extract-GoogleId {
  param([string]$Value)
  $text = $Value.Trim()
  $match = [regex]::Match($text, "[-\w]{25,}")
  if ($match.Success) { return $match.Value }
  return $text
}

function Set-EnvValue {
  param(
    [string[]]$Lines,
    [string]$Name,
    [string]$Value
  )

  $escaped = [regex]::Escape($Name)
  $next = "$Name=$Value"
  $found = $false
  $updated = foreach ($line in $Lines) {
    if ($line -match "^$escaped=") {
      $found = $true
      $next
    } else {
      $line
    }
  }

  if (-not $found) {
    return @($updated + $next)
  }

  return @($updated)
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string[]]$Lines
  )
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, (($Lines -join [Environment]::NewLine) + [Environment]::NewLine), $utf8NoBom)
}

$repoRoot = Resolve-RepoRoot
$appDir = Join-Path $repoRoot "app"
$codePath = Join-Path $repoRoot "google-apps-script\Code.gs"
$envPath = Join-Path $appDir ".env.production"

if (-not (Test-Path $codePath)) {
  throw "Could not find google-apps-script\Code.gs from $repoRoot"
}

$sheetId = Extract-GoogleId $SpreadsheetId
$driveId = Extract-GoogleId $DriveRootFolderId

$code = Get-Content -LiteralPath $codePath -Raw
$code = [regex]::Replace($code, "const SPREADSHEET_ID = '.*?';", "const SPREADSHEET_ID = '$sheetId';")
$code = [regex]::Replace($code, "const DRIVE_ROOT_FOLDER_ID = '.*?';", "const DRIVE_ROOT_FOLDER_ID = '$driveId';")
[System.IO.File]::WriteAllText($codePath, $code, (New-Object System.Text.UTF8Encoding($false)))

$envLines = @()
if (Test-Path $envPath) {
  $envLines = @(Get-Content -LiteralPath $envPath)
}

$envLines = Set-EnvValue $envLines "VITE_DATA_MODE" "google"
if ($AppsScriptUrl.Trim()) {
  $envLines = Set-EnvValue $envLines "VITE_APPS_SCRIPT_URL" $AppsScriptUrl.Trim()
}
$envLines = Set-EnvValue $envLines "VITE_CURRENT_USER" $CurrentUser
$envLines = Set-EnvValue $envLines "VITE_CURRENT_ROLE" $CurrentRole
Write-Utf8NoBom $envPath $envLines

Write-Host "Updated Apps Script constants:"
Write-Host "  SPREADSHEET_ID=$sheetId"
Write-Host "  DRIVE_ROOT_FOLDER_ID=$driveId"
Write-Host "Updated app production env:"
Write-Host "  $envPath"

if (-not $SkipSchema) {
  Push-Location $appDir
  try {
    npm run schema:csv
  } finally {
    Pop-Location
  }
}

if ($Build) {
  Push-Location $appDir
  try {
    npm run build:production
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "Next manual steps:"
Write-Host "1. Import export-templates\google-sheet-schema CSV headers into the Google Sheet tabs if not done yet."
Write-Host "2. Paste google-apps-script\Code.gs into Apps Script, deploy as a web app, and copy the deployment URL."
Write-Host "3. Re-run this script with -AppsScriptUrl if you did not pass it the first time."
