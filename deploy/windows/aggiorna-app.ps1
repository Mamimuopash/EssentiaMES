<#
.SYNOPSIS
    Aggiorna EssentiaMES a una nuova versione, con ritorno automatico alla precedente se non parte.

.DESCRIPTION
    Da eseguire dalla cartella della NUOVA versione (pacchetto estratto o sorgente aggiornato
    con git pull), non da C:\EssentiaMES\strumenti.
    1. Prepara la nuova app (pacchetto gia' compilato o compilazione del sorgente).
    2. (-AggiornaSchema) applica database\schema.sql con l'utente Windows corrente.
    3. Ferma il servizio, sposta la versione attuale in C:\EssentiaMES\backup, attiva la nuova.
    4. Riavvia e controlla /api/health: se l'app non risponde ripristina la versione precedente.
    Configurazione (config\essentia.env), documenti (data) e log non vengono toccati.

.EXAMPLE
    .\aggiorna-app.ps1 -AggiornaSchema
#>
[CmdletBinding()]
param(
    [string]$CartellaInstallazione = 'C:\EssentiaMES',
    [string]$NomeServizio = 'EssentiaMES',
    # Applica database\schema.sql (e con -Migrazioni anche database\migrazioni) prima di riavviare.
    [switch]$AggiornaSchema,
    [switch]$Migrazioni,
    [switch]$Ricompila,
    [switch]$NonInterattivo
)

. (Join-Path $PSScriptRoot '_comune.ps1')
$registro = Start-Registro 'aggiorna-app'

try {
    Write-Host 'EssentiaMES - aggiornamento' -ForegroundColor White
    Assert-Amministratore
    $P = Get-PercorsiInstallazione $CartellaInstallazione
    if (-not (Test-Path $P.FileEnv)) { Stop-Errore "Installazione non trovata in $CartellaInstallazione (manca config\essentia.env): usare installa-app.ps1." }
    if (-not (Get-ServizioEsistente $NomeServizio)) { Stop-Errore "Servizio $NomeServizio non trovato: usare installa-app.ps1." }
    if ((Resolve-Path $PSScriptRoot).Path.TrimEnd('\') -eq $P.Strumenti.TrimEnd('\')) {
        Stop-Errore 'Eseguire questo script dalla cartella della NUOVA versione (pacchetto estratto o sorgente aggiornato), non da strumenti.'
    }
    $cfg = Read-FileEnv $P.FileEnv
    $porta = 3000
    if ($cfg['PORT']) { $porta = [int]$cfg['PORT'] }

    Write-Passo 'Node.js'
    $node = Get-NodeExe
    if (-not $node) { Stop-Errore 'Node.js non trovato.' }
    if ((Get-VersioneNode $node) -lt [version]'20.9.0') { Stop-Errore 'Node.js troppo vecchio: rilanciare installa-app.ps1 -AggiornaNode.' }
    Write-Ok "Node.js $(Get-VersioneNode $node)"

    Write-Passo 'Nuova versione'
    $nuova = Get-AppCompilata -Radice $RadiceProgetto -NodeExe $node -Ricompila:$Ricompila
    $staging = "$($P.App).nuova"
    Copy-Cartella $nuova $staging -Specchio
    Write-Ok "Preparata in $staging"

    if ($AggiornaSchema) {
        Write-Passo 'Aggiornamento dello schema del database (utente Windows corrente)'
        $srv = $cfg['DB_SERVER']
        if ($cfg['DB_INSTANCE']) { $srv = "$srv\$($cfg['DB_INSTANCE'])" } elseif ($cfg['DB_PORT']) { $srv = "$srv,$($cfg['DB_PORT'])" }
        Update-Schema -Connessione (New-Connessione -Server $srv -Database $cfg['DB_NAME']) -CartellaDatabase (Join-Path $staging 'database') -Migrazioni:$Migrazioni
        Write-Ok 'Schema aggiornato'
    }

    Write-Passo 'Sostituzione'
    $svc = Get-CimInstance Win32_Service -Filter ("Name='" + $NomeServizio + "'")
    $account = $svc.StartName
    Stop-ServizioApp $NomeServizio
    $precedente = Join-Path $P.Backup ("app-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Move-Item -LiteralPath $P.App -Destination $precedente
    Move-Item -LiteralPath $staging -Destination $P.App
    if ($account -and $account -ne 'LocalSystem') { Set-PermessiInstallazione $P $account }
    Copy-Cartella (Resolve-Path $PSScriptRoot).Path $P.Strumenti -Specchio -Escludi @('download')
    Write-Ok "Versione precedente in $precedente"

    Write-Passo 'Avvio'
    Start-Service -Name $NomeServizio
    $salute = Wait-Health -Porta $porta -Secondi 120
    if ($salute.Ok) {
        Write-Ok "Applicazione aggiornata e attiva: $($salute.Testo)"
    } elseif ($salute.Stato -eq 503) {
        Write-Avviso "Applicazione avviata ma database non raggiungibile: $($salute.Testo)"
    } else {
        Write-Avviso "La nuova versione non risponde ($($salute.Testo)): ripristino della precedente."
        Stop-ServizioApp $NomeServizio
        Move-Item -LiteralPath $P.App -Destination (Join-Path $P.Backup ("app-NON-FUNZIONANTE-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss')))
        Move-Item -LiteralPath $precedente -Destination $P.App
        Start-Service -Name $NomeServizio
        $ritorno = Wait-Health -Porta $porta -Secondi 120
        if ($ritorno.Ok) { Write-Ok 'Versione precedente ripristinata e attiva.' }
        Stop-Errore "Aggiornamento annullato. Log del servizio in $($P.Log)."
    }
    Get-ChildItem $P.Backup -Directory -Filter 'app-2*' | Sort-Object Name -Descending | Select-Object -Skip 3 | Remove-Item -Recurse -Force

    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    Stop-Registro
    exit 0
} catch {
    Write-ErroreFinale $_
    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    Stop-Registro
    exit 1
}
