# launch-chrome.ps1
# Starts Chrome with the extension loaded and remote debugging enabled.
# Run from the repository root:
#   powershell -ExecutionPolicy Bypass -File scripts\launch-chrome.ps1
#
# Options:
#   -Port        Remote debugging port (default: 9222)
#   -Profile     User data dir for the test profile (default: .chrome-test-profile)

param(
  [int]$Port    = 9222,
  [string]$Profile = ".chrome-test-profile"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionPath = Join-Path $repoRoot "extension"
$profilePath   = Join-Path $repoRoot $Profile

$chromeCandidates = @(
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
  "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Error "Chrome not found. Set the path manually in this script."
  exit 1
}

Write-Host "Extension : $extensionPath"
Write-Host "Profile   : $profilePath"
Write-Host "CDP port  : $Port"
Write-Host ""
Write-Host "Starting Chrome... (leave this window open while running e2e tests)"

& $chrome `
  "--remote-debugging-port=$Port" `
  "--user-data-dir=$profilePath" `
  "--load-extension=$extensionPath" `
  "--no-first-run" `
  "--no-default-browser-check" `
  "--disable-extensions-except=$extensionPath" `
  "about:blank"
