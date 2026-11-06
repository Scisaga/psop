param(
  [string]$Bind = '127.0.0.1',
  [int]$Port = 8780,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required.' }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.11 or later is required.' }
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& python -B scripts/prepare_workspace.py
if ($LASTEXITCODE -ne 0) { throw 'Preparing the v2 device workspace failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Workbench build failed.' }
$workbenchArguments = @('scripts/serve.mjs', '--bind', $Bind, '--port', [string]$Port)
if (-not $NoBrowser) { $workbenchArguments += '--open' }
& node @workbenchArguments
if ($LASTEXITCODE -ne 0) { throw 'Workbench server stopped with an error.' }
