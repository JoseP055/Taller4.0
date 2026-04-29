param(
  [string]$SupabaseUrl,
  [string]$SupabaseAnonKey,
  [string]$ApiUrl
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

function Import-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  $lines = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue
  foreach ($line in $lines) {
    $t = $line.Trim()
    if (-not $t) { continue }
    if ($t.StartsWith('#')) { continue }
    $idx = $t.IndexOf('=')
    if ($idx -lt 1) { continue }
    $k = $t.Substring(0, $idx).Trim()
    $v = $t.Substring($idx + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    if ($k) { $map[$k] = $v }
  }
  return $map
}

$backendEnv = Import-DotEnv (Join-Path $backendDir '.env')
$frontendEnv = Import-DotEnv (Join-Path $frontendDir '.env')

$resolvedSupabaseUrl = if ($SupabaseUrl) { $SupabaseUrl } else { $backendEnv['SUPABASE_URL'] }
$resolvedSupabaseAnonKey = if ($SupabaseAnonKey) { $SupabaseAnonKey } else { $backendEnv['SUPABASE_ANON_KEY'] }
$resolvedApiUrl = if ($ApiUrl) { $ApiUrl } else { $frontendEnv['VITE_API_URL'] }

$envCommands = @()
if ($resolvedSupabaseUrl) { $envCommands += "`$env:SUPABASE_URL = '$resolvedSupabaseUrl'" }
if ($resolvedSupabaseAnonKey) { $envCommands += "`$env:SUPABASE_ANON_KEY = '$resolvedSupabaseAnonKey'" }
if ($resolvedApiUrl) { $envCommands += "`$env:VITE_API_URL = '$resolvedApiUrl'" }

$backendCmd = @()
$backendCmd += '& {'
if ($envCommands.Count) { $backendCmd += ($envCommands -join '; ') + ';' }
$backendCmd += 'python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload'
$backendCmd += '}'
$backendCmdStr = ($backendCmd -join ' ')

$frontendCmd = @()
$frontendCmd += '& {'
if ($resolvedApiUrl) { $frontendCmd += "`$env:VITE_API_URL = '$resolvedApiUrl';" }
$frontendCmd += "if ('$resolvedSupabaseUrl') { `$env:VITE_SUPABASE_URL = '$resolvedSupabaseUrl' };"
$frontendCmd += "if ('$resolvedSupabaseAnonKey') { `$env:VITE_SUPABASE_ANON_KEY = '$resolvedSupabaseAnonKey' };"
$frontendCmd += 'npm run dev -- --host 0.0.0.0 --port 5173'
$frontendCmd += '}'
$frontendCmdStr = ($frontendCmd -join ' ')

Start-Process -FilePath 'powershell' -WorkingDirectory $backendDir -ArgumentList @(
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
