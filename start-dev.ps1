param(
  [string]$SupabaseUrl,
  [string]$SupabaseAnonKey,
  [string]$ApiUrl
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

function Resolve-Executable([string[]]$Names) {
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
  }
  return $null
}

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

$resolvedSupabaseUrl = if ($SupabaseUrl) { $SupabaseUrl } elseif ($backendEnv['SUPABASE_URL']) { $backendEnv['SUPABASE_URL'] } else { $frontendEnv['VITE_SUPABASE_URL'] }
$resolvedSupabaseAnonKey = if ($SupabaseAnonKey) { $SupabaseAnonKey } elseif ($backendEnv['SUPABASE_ANON_KEY']) { $backendEnv['SUPABASE_ANON_KEY'] } else { $frontendEnv['VITE_SUPABASE_ANON_KEY'] }
$resolvedApiUrl = if ($ApiUrl) { $ApiUrl } else { $frontendEnv['VITE_API_URL'] }
$resolvedAllowedEmailDomains = $frontendEnv['VITE_ALLOWED_EMAIL_DOMAINS']
if (-not $resolvedApiUrl) { $resolvedApiUrl = 'http://localhost:8000' }

$envCommands = @()
if ($resolvedSupabaseUrl) { $envCommands += "`$env:SUPABASE_URL = '$resolvedSupabaseUrl'" }
if ($resolvedSupabaseAnonKey) { $envCommands += "`$env:SUPABASE_ANON_KEY = '$resolvedSupabaseAnonKey'" }
if ($resolvedApiUrl) { $envCommands += "`$env:VITE_API_URL = '$resolvedApiUrl'" }

$psExe = Resolve-Executable @('pwsh', 'powershell')
$pythonExe = Resolve-Executable @('python', 'py')
$npmExe = Resolve-Executable @('npm')

if (-not $psExe) { throw 'No se encontró PowerShell (pwsh o powershell).' }
if (-not $pythonExe) { throw 'No se encontró Python (python o py).' }
if (-not $npmExe) { throw 'No se encontró npm. Instala Node.js.' }

$frontendNodeModules = Join-Path $frontendDir 'node_modules'
if (-not (Test-Path -LiteralPath $frontendNodeModules)) {
  & $npmExe install --prefix $frontendDir | Out-Host
}

$pyCheck = & $pythonExe -c "import fastapi, uvicorn, pydantic" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $pythonExe -m pip install --upgrade pip | Out-Host
  & $pythonExe -m pip install fastapi uvicorn pydantic | Out-Host
}

$backendCmd = @()
$backendCmd += '& {'
if ($envCommands.Count) { $backendCmd += ($envCommands -join '; ') + ';' }
$backendCmd += "& '$pythonExe' -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
$backendCmd += '}'
$backendCmdStr = ($backendCmd -join ' ')

$frontendCmd = @()
$frontendCmd += '& {'
if ($resolvedApiUrl) { $frontendCmd += "`$env:VITE_API_URL = '$resolvedApiUrl';" }
$frontendCmd += "if ('$resolvedSupabaseUrl') { `$env:VITE_SUPABASE_URL = '$resolvedSupabaseUrl' };"
$frontendCmd += "if ('$resolvedSupabaseAnonKey') { `$env:VITE_SUPABASE_ANON_KEY = '$resolvedSupabaseAnonKey' };"
$frontendCmd += "if ('$resolvedAllowedEmailDomains') { `$env:VITE_ALLOWED_EMAIL_DOMAINS = '$resolvedAllowedEmailDomains' };"
$frontendCmd += "& '$npmExe' run dev"
$frontendCmd += '}'
$frontendCmdStr = ($frontendCmd -join ' ')

Start-Process -FilePath $psExe -WorkingDirectory $backendDir -ArgumentList @(
  '-NoExit',
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  $backendCmdStr
)

Start-Process -FilePath $psExe -WorkingDirectory $frontendDir -ArgumentList @(
  '-NoExit',
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  $frontendCmdStr
)
