# Publishes the current JS code as an over-the-air update to the installed app (channel "production").
# The app downloads it on next launch and uses it from the launch after that.
# Only JS/asset changes go out this way; new native modules need a new build (GitHub Actions).
#   publish-update.ps1 "Kurze Beschreibung"
param([Parameter(Mandatory = $true)][string]$Message)

$token = [Environment]::GetEnvironmentVariable('EXPO_TOKEN', 'User')
if (-not $token) {
    Write-Host 'EXPO_TOKEN fehlt. Einmalig ausfuehren: setx EXPO_TOKEN "<token von expo.dev>"' -ForegroundColor Red
    exit 1
}
$env:EXPO_TOKEN = $token
Set-Location (Split-Path $PSScriptRoot -Parent)
npx.cmd eas-cli@latest update --branch production --platform ios --environment production --message $Message --non-interactive
