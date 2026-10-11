# Compasso no Windows: instala o servidor local (liga sozinho quando você entra no Windows) e controla.
#
#   powershell -ExecutionPolicy Bypass -File scripts\compasso-windows.ps1 instalar [BACKUP.json]
#   ... status | abrir | iniciar | parar | reiniciar | log | desinstalar
#
# Onde fica cada coisa:
#   %USERPROFILE%\Compasso\app      código do app (substituído a cada "instalar")
#   %USERPROFILE%\Compasso\dados    banco compasso.db e backups\  <- seus dados
#   %USERPROFILE%\Compasso\logs     servidor.log
#   Pasta Inicializar\Compasso.vbs  liga o servidor, sem janela, a cada login
param([string]$Comando = '', [string]$Backup = '')
$ErrorActionPreference = 'Stop'

$Port     = if ($env:COMPASSO_PORT) { [int]$env:COMPASSO_PORT } else { 8080 }
$Base     = Join-Path $env:USERPROFILE 'Compasso'
$App      = Join-Path $Base 'app'
$Data     = Join-Path $Base 'dados'
$Logs     = Join-Path $Base 'logs'
$LogFile  = Join-Path $Logs 'servidor.log'
$Src      = Split-Path -Parent $PSScriptRoot
$Url      = "http://localhost:$Port"
$Launcher = Join-Path ([Environment]::GetFolderPath('Startup')) 'Compasso.vbs'

function Say([string]$m) { Write-Host $m }

# Python 3.9+ (python.org, Microsoft Store ou winget). Devolve o caminho do python.exe.
function Get-PyExe {
  $code = "import sys; print(sys.executable if sys.version_info >= (3, 9) else '')"
  foreach ($cmd in @('py', 'python', 'python3')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { continue }
    try {
      if ($cmd -eq 'py') { $out = & py -3 -c $code 2>$null } else { $out = & $cmd -c $code 2>$null }
      $exe = ($out | Select-Object -Last 1)
      if ($exe) { $exe = $exe.Trim() }
      if ($exe -and (Test-Path $exe)) { return $exe }
    } catch { }
  }
  return $null
}

function Get-PyWExe([string]$exe) {
  $w = Join-Path (Split-Path $exe) 'pythonw.exe'
  if (Test-Path $w) { return $w } else { return $exe }
}

function Test-Up {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Headers @{ 'X-Compasso' = '1' } "$Url/api/health"
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Wait-Up {
  for ($i = 0; $i -lt 40; $i++) { if (Test-Up) { return $true }; Start-Sleep -Milliseconds 250 }
  return $false
}

function Stop-Compasso {
  $procs = Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains('compasso.py') -and $_.CommandLine.Contains($App) }
  foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($procs) { Start-Sleep -Milliseconds 500 }
}

# O .vbs roda o pythonw (sem janela). Em VBScript, aspas dentro do texto são escritas dobradas ("").
function Write-Launcher([string]$pyw) {
  $q = '""'
  $cmd = $q + $pyw + $q + ' ' + $q + (Join-Path $App 'server\compasso.py') + $q +
         ' --port ' + $Port + ' --data ' + $q + $Data + $q + ' --log ' + $q + $LogFile + $q
  $vbs = "' Liga o servidor do Compasso, sem janela. Criado pelo instalador do Compasso.`r`n" +
         'CreateObject("WScript.Shell").Run "' + $cmd + '", 0, False' + "`r`n"
  Set-Content -Path $Launcher -Value $vbs -Encoding Unicode
}

function Start-Compasso {
  if (-not (Test-Path $Launcher)) { Say 'O Compasso não está instalado. Rode o instalador primeiro.'; exit 1 }
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $Launcher + '"')
  if (Wait-Up) { Say "Rodando em $Url" } else { Show-LogTail; exit 1 }
}

function Show-LogTail {
  Say "O servidor não respondeu em $Url. Últimas linhas de $LogFile :"
  if (Test-Path $LogFile) { Get-Content $LogFile -Tail 15 }
}

switch ($Comando) {
  'instalar' {
    $exe = Get-PyExe
    if (-not $exe) {
      Say 'O Compasso precisa do Python 3.9 ou mais novo, e ele não foi encontrado neste computador.'
      Say 'Instale pelo site que vai abrir agora (marque "Add python.exe to PATH" na primeira tela) e rode o instalador de novo.'
      Say 'Ou, no PowerShell:  winget install Python.Python.3.12'
      Start-Process 'https://www.python.org/downloads/windows/'
      exit 1
    }
    if ($Backup -and -not (Test-Path $Backup)) { Say "Backup não encontrado: $Backup"; exit 1 }
    $pyw = Get-PyWExe $exe
    Stop-Compasso
    foreach ($d in @($App, $Data, $Logs)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    if ((Resolve-Path $Src).Path -ne $App) {
      foreach ($d in @('public', 'server', 'scripts')) {
        $dst = Join-Path $App $d
        if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
        Copy-Item -Recurse -Force (Join-Path $Src $d) $dst
      }
      Copy-Item -Force (Join-Path $Src 'README.md') $App
      Get-ChildItem -Path $App -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
    }
    if ($Backup) { & $exe (Join-Path $App 'server\compasso.py') --data $Data --import $Backup }
    Write-Launcher $pyw
    Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $Launcher + '"')
    if (Wait-Up) {
      Say ''
      Say "Compasso instalado e rodando em $Url"
      Say "  dados: $Data\compasso.db (backup automático diário em $Data\backups)"
      Say '  liga sozinho quando você entra no Windows.'
      Start-Process $Url
    } else { Show-LogTail; exit 1 }
  }
  'desinstalar' {
    Stop-Compasso
    if (Test-Path $Launcher) { Remove-Item -Force $Launcher }
    if (Test-Path $App) { Remove-Item -Recurse -Force $App }
    Say "Compasso removido. Seus dados continuam em $Data (apague a pasta à mão se quiser)."
  }
  'status' {
    if (Test-Up) { Say "rodando em $Url" } else { Say 'parado' }
    if (Test-Path $Launcher) { Say 'liga sozinho no login: sim' } else { Say 'liga sozinho no login: não (rode o instalador)' }
  }
  'iniciar'   { if (Test-Up) { Say "Já está rodando em $Url" } else { Start-Compasso } }
  'parar'     { Stop-Compasso; Say 'parado (volta a ligar no próximo login, ou com: iniciar)' }
  'reiniciar' { Stop-Compasso; Start-Compasso }
  'abrir'     { Start-Process $Url }
  'log'       { if (Test-Path $LogFile) { Get-Content $LogFile -Tail 40 -Wait } else { Say 'Ainda não há registro.' } }
  default {
    Say 'Uso: powershell -ExecutionPolicy Bypass -File scripts\compasso-windows.ps1 <comando>'
    Say 'Comandos: instalar [BACKUP.json] | status | abrir | iniciar | parar | reiniciar | log | desinstalar'
    exit 1
  }
}
