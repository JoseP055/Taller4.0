param(
  [string]$SupabaseUrl,
  [string]$SupabaseAnonKey,
  [string]$ApiUrl
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

$envCommands = @()
if ($SupabaseUrl) { $envCommands += "`$env:SUPABASE_URL = '$SupabaseUrl'" }
if ($SupabaseAnonKey) { $envCommands += "`$env:SUPABASE_ANON_KEY = '$SupabaseAnonKey'" }
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
