param(
  [string]$DbServer,
  [string]$DbDatabase,
  [string]$DbUser,
  [string]$DbPassword,
  [string]$DbConnStr,
  [string]$ApiUrl
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

$envCommands = @()
if ($DbConnStr) { $envCommands += "`$env:DB_CONN_STR = '$DbConnStr'" }
if ($DbServer) { $envCommands += "`$env:DB_SERVER = '$DbServer'" }
if ($DbDatabase) { $envCommands += "`$env:DB_DATABASE = '$DbDatabase'" }
if ($DbUser) { $envCommands += "`$env:DB_USER = '$DbUser'" }
if ($DbPassword) { $envCommands += "`$env:DB_PASSWORD = '$DbPassword'" }
if ($ApiUrl) { $envCommands += "`$env:VITE_API_URL = '$ApiUrl'" }

$backendCmd = @()
$backendCmd += '& {'
if ($envCommands.Count) { $backendCmd += ($envCommands -join '; ') + ';' }
$backendCmd += 'python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload'
$backendCmd += '}'
$backendCmdStr = ($backendCmd -join ' ')

$frontendCmd = @()
$frontendCmd += '& {'
if ($ApiUrl) { $frontendCmd += "`$env:VITE_API_URL = '$ApiUrl';" }
$frontendCmd += 'npm run dev -- --host 0.0.0.0 --port 5173'
$frontendCmd += '}'
$frontendCmdStr = ($frontendCmd -join ' ')

Start-Process -FilePath 'powershell' -WorkingDirectory $root -ArgumentList @(
  '-NoExit',
  '-NoProfile',
  '-Command',
  $backendCmdStr
)

Start-Process -FilePath 'powershell' -WorkingDirectory $frontendDir -ArgumentList @(
  '-NoExit',
  '-NoProfile',
  '-Command',
  $frontendCmdStr
)
