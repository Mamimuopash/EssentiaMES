<#
.SYNOPSIS
    Diagnostica dell'installazione di EssentiaMES (servizio, configurazione, database, IIS, log).

.DESCRIPTION
    Non modifica nulla. Da usare dopo l'installazione o quando qualcosa non funziona:
    il riepilogo finale indica cosa controllare. Esce con codice 1 se trova problemi.

.EXAMPLE
    C:\EssentiaMES\strumenti\verifica.ps1
#>
[CmdletBinding()]
param(
    [string]$CartellaInstallazione = 'C:\EssentiaMES',
    [string]$NomeServizio = 'EssentiaMES'
)

. (Join-Path $PSScriptRoot '_comune.ps1')
$ErrorActionPreference = 'Continue'
$problemi = New-Object 'Collections.Generic.List[string]'
function Add-Problema([string]$Testo) { $problemi.Add($Testo); Write-Avviso $Testo }

Write-Host 'EssentiaMES - verifica dell''installazione' -ForegroundColor White
$P = Get-PercorsiInstallazione $CartellaInstallazione

Write-Passo 'Sistema e Node.js'
Test-SistemaOperativo
$node = Get-NodeExe
if ($node) {
    $ver = Get-VersioneNode $node
    if ($ver -ge [version]'20.9.0') { Write-Ok "Node.js $ver ($node)" } else { Add-Problema "Node.js $ver troppo vecchio (serve 20.9+)" }
} else { Add-Problema 'Node.js non installato' }

Write-Passo 'Servizio Windows'
$svc = Get-CimInstance Win32_Service -Filter ("Name='" + $NomeServizio + "'") -ErrorAction SilentlyContinue
if ($svc) {
    Write-Info ("Stato: {0}, avvio: {1}, account: {2}" -f $svc.State, $svc.StartMode, $svc.StartName)
    if ($svc.State -ne 'Running') { Add-Problema "Il servizio $NomeServizio non e' avviato (Start-Service $NomeServizio)" } else { Write-Ok 'In esecuzione' }
    if ($svc.StartMode -ne 'Auto') { Add-Problema 'Il servizio non parte automaticamente all''avvio di Windows' }
} else { Add-Problema "Servizio $NomeServizio non installato" }

Write-Passo 'Configurazione'
$cfg = Read-FileEnv $P.FileEnv
if ($cfg.Count -eq 0) {
    Add-Problema "File di configurazione mancante: $($P.FileEnv)"
} else {
    Write-Ok $P.FileEnv
    foreach ($k in @('APP_URL', 'PORT', 'HOSTNAME', 'DB_SERVER', 'DB_PORT', 'DB_INSTANCE', 'DB_NAME', 'DB_AUTH_TYPE', 'DB_USER', 'DB_ENCRYPT', 'DB_TLS_LEGACY', 'UPLOAD_DIR', 'SCHEDULER_ENABLED', 'SMTP_HOST')) {
        if ($cfg.Contains($k)) { Write-Info ("{0,-18} {1}" -f $k, $cfg[$k]) }
    }
    if (-not $cfg['SESSION_SECRET'] -or $cfg['SESSION_SECRET'].Length -lt 32) { Add-Problema 'SESSION_SECRET mancante o piu'' corto di 32 caratteri: il login non funziona' }
    if (-not $cfg['DB_PASSWORD']) { Add-Problema 'DB_PASSWORD vuota' }
    if ($cfg['APP_URL'] -like 'http:*' -and $cfg['COOKIE_SECURE'] -eq 'true') { Add-Problema 'COOKIE_SECURE=true con indirizzo http: il login non funzionerebbe senza HTTPS' }
}

Write-Passo 'Rete verso SQL Server'
if ($cfg['DB_SERVER']) {
    $hostDb = $cfg['DB_SERVER']
    $istanza = $cfg['DB_INSTANCE']
    # "server\ISTANZA" nel nome: la porta non si usa, la fornisce SQL Server Browser.
    if ($hostDb -match '^(.+?)\\(.+)$') { $hostDb = $Matches[1]; $istanza = $Matches[2] }
    if ($istanza) {
        Write-Info ("Istanza con nome {0} su {1}: la porta viene fornita dal servizio SQL Server Browser (UDP 1434)." -f $istanza, $hostDb)
    } elseif ($cfg['DB_PORT']) {
        if (Test-PortaTcp $hostDb ([int]$cfg['DB_PORT'])) { Write-Ok ("{0}:{1} raggiungibile" -f $hostDb, $cfg['DB_PORT']) }
        else { Add-Problema ("Porta {0} di {1} non raggiungibile (TCP/IP disattivato in SQL Server, firewall, VPN?)" -f $cfg['DB_PORT'], $hostDb) }
    }
}

Write-Passo 'Database'
$appDir = $P.App
if ($node -and (Test-Path (Join-Path $appDir 'scripts\db-check.mjs')) -and (Test-Path $P.FileEnv)) {
    Push-Location $appDir
    & $node "--env-file=$($P.FileEnv)" (Join-Path $appDir 'scripts\db-check.mjs')
    $esito = $LASTEXITCODE
    Pop-Location
    if ($esito -eq 1) { Add-Problema 'Connessione al database non riuscita' }
    elseif ($esito -eq 2) { Add-Problema 'Schema del database incompleto (prepara-sql-server.ps1 -AggiornaSchema)' }
} else { Add-Problema 'Applicazione non installata correttamente (manca app\scripts\db-check.mjs)' }

Write-Passo 'Applicazione'
$porta = 3000
if ($cfg['PORT']) { $porta = [int]$cfg['PORT'] }
$salute = Wait-Health -Porta $porta -Secondi 5
if ($salute.Ok) { Write-Ok "http://127.0.0.1:$porta/api/health -> $($salute.Testo)" }
elseif ($salute.Stato -eq 503) { Add-Problema "L'app risponde ma non raggiunge il database: $($salute.Testo)" }
else { Add-Problema "L'app non risponde sulla porta $porta ($($salute.Testo))" }

Write-Passo 'Documenti'
if ($cfg['UPLOAD_DIR'] -and (Test-Path $cfg['UPLOAD_DIR'])) {
    Write-Ok ("{0} ({1} file)" -f $cfg['UPLOAD_DIR'], @(Get-ChildItem $cfg['UPLOAD_DIR'] -File -Recurse -ErrorAction SilentlyContinue).Count)
} elseif ($cfg['UPLOAD_DIR']) { Add-Problema "Cartella documenti inesistente: $($cfg['UPLOAD_DIR'])" }

Write-Passo 'IIS'
$appcmd = Join-Path $env:windir 'system32\inetsrv\appcmd.exe'
if (Test-Path $appcmd) {
    $sito = (& $appcmd list site /name:$NomeServizio) | Out-String
    $global:LASTEXITCODE = 0
    if ($sito.Trim()) {
        Write-Info $sito.Trim()
        if ($sito -notmatch 'state:Started') { Add-Problema "Sito IIS $NomeServizio non avviato" }
    } else { Write-Info 'Nessun sito IIS EssentiaMES (accesso diretto alla porta dell''app).' }
} else { Write-Info 'IIS non installato.' }

Write-Passo 'Ultimi errori nel log del servizio'
$errLog = Join-Path $P.Log "$NomeServizio.err.log"
if ((Test-Path $errLog) -and (Get-Item $errLog).Length -gt 0) {
    Get-Content $errLog -Tail 20 | ForEach-Object { Write-Info $_ }
} else { Write-Ok 'Nessun errore registrato' }

Write-Host ''
if ($problemi.Count -eq 0) {
    Write-Host 'Tutto in ordine.' -ForegroundColor Green
    exit 0
}
Write-Host ("{0} problemi trovati:" -f $problemi.Count) -ForegroundColor Yellow
$problemi | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
exit 1
