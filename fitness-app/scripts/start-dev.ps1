# Starts the Expo dev server for the iPhone.
#   start-dev.ps1              -> for Expo Go
#   start-dev.ps1 -DevClient   -> for the installed development build (needed for Apple Health)
# Extra arguments (e.g. --clear) are passed through to `expo start`.
# Reads EXPO_TOKEN from the Windows user environment (set once with `setx EXPO_TOKEN ...`),
# so it also works in shells that were started before the variable was set.
param([switch]$DevClient)

$token = [Environment]::GetEnvironmentVariable('EXPO_TOKEN', 'User')
if (-not $token) {
    Write-Host 'EXPO_TOKEN fehlt. Einmalig ausfuehren: setx EXPO_TOKEN "<token von expo.dev>"' -ForegroundColor Red
    exit 1
}
$env:EXPO_TOKEN = $token
Set-Location (Split-Path $PSScriptRoot -Parent)
$mode = if ($DevClient) { '--dev-client' } else { '--go' }
npx.cmd expo start $mode @args
