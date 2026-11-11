<#
.SYNOPSIS
    Installa EssentiaMES come servizio Windows (Windows Server 2016 o successivo).

.DESCRIPTION
    1. Installa Node.js LTS se manca (MSI ufficiale, hash verificato).
    2. Usa il pacchetto gia' compilato (cartella app) oppure compila il sorgente con npm.
    3. Crea C:\EssentiaMES\{app,config,data,logs,servizio,strumenti,backup}.
    4. Scrive la configurazione (config\essentia.env) e verifica la connessione a SQL Server.
    5. Registra il servizio Windows "EssentiaMES" (WinSW): avvio automatico, riavvio
       in caso di errore, log a rotazione, account virtuale con permessi minimi.
    6. Apre la porta nel firewall oppure (-ConIIS) pubblica l'app tramite IIS in HTTPS.

    Si puo' rilanciare: la configurazione esistente viene mantenuta (salvo -RiscriviConfigurazione)
    e la versione precedente dell'app viene conservata in C:\EssentiaMES\backup.

.EXAMPLE
    # Interattivo: chiede i dati mancanti
    .\installa-app.ps1

.EXAMPLE
    .\installa-app.ps1 -DbServer SRV-SQL -DbPorta 1433 -DbNome Brighetti -DbUtente essentia_app `
        -ConIIS -NomeHost essentia.azienda.local -CertificatoAutofirmato
#>
[CmdletBinding()]
param(
    [string]$CartellaInstallazione = 'C:\EssentiaMES',
    [string]$NomeServizio = 'EssentiaMES',
    # Porta HTTP di Node.js (con -ConIIS resta interna al server).
    [int]$Porta = 3000,
    # Indirizzo con cui gli utenti apriranno l'app (es. http://srv-essentia:3000 o https://essentia.azienda.it).
    [string]$UrlPubblico = '',

    # --- database
    # Server SQL: nome o IP (localhost se SQL Server e' su questo computer).
    [string]$DbServer = '',
    # Istanza con nome raggiunta tramite SQL Browser (in alternativa a una porta fissa).
    [string]$DbIstanza = '',
    [int]$DbPorta = 1433,
    [string]$DbNome = 'Brighetti',
    # sql = login SQL (consigliato), ntlm = account Windows di dominio.
    [ValidateSet('sql', 'ntlm')][string]$DbAutenticazione = 'sql',
    [string]$DbUtente = 'essentia_app',
    [Security.SecureString]$DbPassword,
    [string]$DbDominio = '',
    # Connessione non cifrata (solo se SQL Server non supporta TLS).
    [switch]$DbSenzaCrittografia,
    # SQL Server 2008 R2/2012/2014 non aggiornati (TLS 1.0, certificato debole).
    [switch]$DbTlsLegacy,
    # Esegue database\schema.sql con l'utente Windows corrente (sysadmin) prima di avviare l'app.
    [switch]$AggiornaSchema,

    # --- opzioni
    # Cartella upload_documenti del vecchio software da copiare (es. C:\inetpub\wwwroot\Brighetti\upload_documenti).
    [string]$CartellaDocumentiVecchi = '',
    # Account Windows del servizio (es. AZIENDA\svc_essentia), utile per leggere cartelle di rete (CSV Mexal).
    # Vuoto = account virtuale "NT SERVICE\EssentiaMES" (consigliato).
    [string]$UtenteServizio = '',
    [Security.SecureString]$PasswordServizio,
    # Pubblica l'app tramite IIS (reverse proxy, HTTPS): vedi configura-iis.ps1.
    [switch]$ConIIS,
    [string]$NomeHost = '',
    [string]$CertificatoThumbprint = '',
    [switch]$CertificatoAutofirmato,
    # Sito IIS del vecchio software da fermare (es. "Brighetti").
    [string]$FermaSitoIIS = '',

    [int]$NodeMajor = 24,
    # Installa/aggiorna Node.js anche se e' gia' presente una versione compatibile.
    [switch]$AggiornaNode,
    # MSI di Node.js gia' scaricato (installazione senza Internet).
    [string]$NodeMsi = '',
    # Ricompila anche se e' presente un pacchetto gia' compilato.
    [switch]$Ricompila,
    [switch]$SenzaFirewall,
    [switch]$RiscriviConfigurazione,
    [switch]$NonInterattivo
)

. (Join-Path $PSScriptRoot '_comune.ps1')
$registro = Start-Registro 'installa-app'

try {
    Write-Host 'EssentiaMES - installazione su Windows Server' -ForegroundColor White
    Assert-Amministratore
    Test-SistemaOperativo
    $P = Get-PercorsiInstallazione $CartellaInstallazione
    foreach ($d in @($P.Radice, $P.Config, $P.Dati, $P.Upload, $P.Log, $P.Servizio, $P.Download, $P.Backup)) {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
    }

    # ------------------------------------------------------------- Node.js
    Write-Passo 'Node.js'
    $node = Install-NodeJs -Major $NodeMajor -Msi $NodeMsi -CartellaDownload $P.Download -Forza:$AggiornaNode

    # ------------------------------------------------------- applicazione
    Write-Passo 'Applicazione'
    $appPronta = Get-AppCompilata -Radice $RadiceProgetto -NodeExe $node -Ricompila:$Ricompila

    # ----------------------------------------------------- configurazione
    Write-Passo 'Configurazione'
    $configEsistente = (Test-Path $P.FileEnv) -and -not $RiscriviConfigurazione
    $fileProva = $P.FileEnv
    if ($configEsistente) {
        $cfg = Read-FileEnv $P.FileEnv
        Write-Ok "Configurazione esistente mantenuta: $($P.FileEnv)"
        Write-Info '(per rifarla da zero: -RiscriviConfigurazione; per modificarla: Blocco note + riavvio del servizio)'
        if ($cfg['PORT']) { $Porta = [int]$cfg['PORT'] }
        if ($ConIIS) {
            # Passaggio a IIS: Node ascolta solo in locale e l'indirizzo pubblico diventa quello di IIS.
            $h = $NomeHost
            if (-not $h) { $h = $env:COMPUTERNAME }
            $url = $UrlPubblico
            if (-not $url) { $url = "https://$h" }
            Set-ValoreEnv $P.FileEnv 'HOSTNAME' '127.0.0.1'
            Set-ValoreEnv $P.FileEnv 'APP_URL' $url
            if ($url -like 'https:*') { Set-ValoreEnv $P.FileEnv 'COOKIE_SECURE' 'true' }
            Write-Ok "Configurazione aggiornata per IIS ($url)"
        }
    } else {
        $locali = @(Get-IstanzeSqlLocali)
        $serverPred = ''
        if ($locali.Count -gt 0) { $serverPred = 'localhost' }
        if (-not $DbServer) { $DbServer = Read-Valore 'Server SQL (nome o IP; localhost se e'' su questo computer)' $serverPred }
        if (-not $DbServer) { Stop-Errore 'Indicare il server SQL con -DbServer.' }
        if (-not $NonInterattivo -and -not $DbIstanza -and -not $PSBoundParameters.ContainsKey('DbPorta')) {
            $DbPorta = [int](Read-Valore 'Porta TCP di SQL Server' "$DbPorta")
        }
        if (-not $PSBoundParameters.ContainsKey('DbNome')) { $DbNome = Read-Valore 'Nome del database' $DbNome }
        if (-not $PSBoundParameters.ContainsKey('DbUtente')) {
            $utentePred = $DbUtente
            if ($DbAutenticazione -eq 'ntlm') { $utentePred = '' }
            $DbUtente = Read-Valore 'Utente SQL' $utentePred
        }
        $pwdDb = ConvertFrom-Protetta $DbPassword
        if (-not $pwdDb) { $pwdDb = Read-Segreto "Password di $DbUtente" }
        if (-not $pwdDb) { Stop-Errore 'Password del database mancante (-DbPassword).' }
        if ($DbAutenticazione -eq 'ntlm' -and -not $DbDominio) { $DbDominio = Read-Valore 'Dominio Windows dell''utente' $env:USERDOMAIN }

        if (-not $UrlPubblico) {
            if ($ConIIS) {
                $h = $NomeHost
                if (-not $h) { $h = $env:COMPUTERNAME }
                $UrlPubblico = "https://$h"
            } else {
                $UrlPubblico = "http://$($env:COMPUTERNAME):$Porta"
            }
        }
        $ascolto = '0.0.0.0'
        if ($ConIIS) { $ascolto = '127.0.0.1' }
        $cookieSicuro = 'false'
        if ($UrlPubblico -like 'https:*') { $cookieSicuro = 'true' }
        $cifra = 'true'
        if ($DbSenzaCrittografia) { $cifra = 'false' }

        $righe = @(
            '# =============================================================================',
            '# EssentiaMES - configurazione del servizio (letta da node --env-file all''avvio)',
            '# Dopo una modifica riavviare il servizio:  Restart-Service EssentiaMES',
            '# Il file contiene password: e'' leggibile solo da amministratori e dal servizio.',
            '# Elenco completo delle opzioni: .env.example nel sorgente.',
            '# =============================================================================',
            (Format-RigaEnv 'NODE_ENV' 'production'),
            (Format-RigaEnv 'PORT' "$Porta"),
            (Format-RigaEnv 'HOSTNAME' $ascolto),
            (Format-RigaEnv 'TZ' 'Europe/Rome'),
            (Format-RigaEnv 'NEXT_TELEMETRY_DISABLED' '1'),
            (Format-RigaEnv 'APP_URL' $UrlPubblico),
            (Format-RigaEnv 'COOKIE_SECURE' $cookieSicuro),
            '',
            '# --- Database SQL Server',
            (Format-RigaEnv 'DB_SERVER' $DbServer)
        )
        if ($DbIstanza) { $righe += (Format-RigaEnv 'DB_INSTANCE' $DbIstanza) } else { $righe += (Format-RigaEnv 'DB_PORT' "$DbPorta") }
        $righe += @(
            (Format-RigaEnv 'DB_NAME' $DbNome),
            (Format-RigaEnv 'DB_AUTH_TYPE' $DbAutenticazione),
            (Format-RigaEnv 'DB_USER' $DbUtente),
            (Format-RigaEnv 'DB_PASSWORD' $pwdDb)
        )
        if ($DbAutenticazione -eq 'ntlm') { $righe += (Format-RigaEnv 'DB_DOMAIN' $DbDominio) }
        $righe += @(
            (Format-RigaEnv 'DB_ENCRYPT' $cifra),
            (Format-RigaEnv 'DB_TRUST_SERVER_CERTIFICATE' 'true')
        )
        if ($DbTlsLegacy) { $righe += (Format-RigaEnv 'DB_TLS_LEGACY' 'true') }
        $righe += @(
            '',
            '# --- Sicurezza (generati automaticamente)',
            (Format-RigaEnv 'SESSION_SECRET' (New-Segreto 48)),
            (Format-RigaEnv 'CRON_SECRET' (New-Segreto 32)),
            '',
            '# --- Documenti e automazioni',
            (Format-RigaEnv 'UPLOAD_DIR' $P.Upload),
            (Format-RigaEnv 'MAX_UPLOAD_MB' '50'),
            (Format-RigaEnv 'SCHEDULER_ENABLED' 'true'),
            '',
            '# --- Email richieste materiali (facoltativo): togliere il # e compilare',
            "# SMTP_HOST='smtp.azienda.it'",
            "# SMTP_PORT='587'",
            "# SMTP_SECURE='false'",
            "# SMTP_USER='noreply@azienda.it'",
            "# SMTP_PASSWORD=''",
            "# SMTP_FROM='noreply@azienda.it'",
            "# SMTP_RICHIESTE_MATERIALI_TO='magazzino@azienda.it'",
            ''
        )
        # Scritta prima in un file temporaneo: diventa definitiva solo se la connessione funziona.
        $fileProva = "$($P.FileEnv).nuovo"
        Write-FileUtf8 $fileProva (($righe -join "`r`n"))
        Write-Ok 'Configurazione preparata'
    }

    # -------------------------------------------------- stop e rilascio app
    Write-Passo 'Copia dell''applicazione'
    Stop-ServizioApp $NomeServizio
    if ($appPronta.TrimEnd('\') -eq $P.App.TrimEnd('\')) {
        # Script lanciato da C:\EssentiaMES\strumenti sulla stessa installazione: l'app resta quella.
        Write-Ok "Applicazione gia' installata in $($P.App)"
    } elseif (Test-Path (Join-Path $P.App 'server.js')) {
        $vecchia = Join-Path $P.Backup ("app-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Move-Item -LiteralPath $P.App -Destination $vecchia
        Write-Info "Versione precedente conservata in $vecchia"
        Get-ChildItem $P.Backup -Directory -Filter 'app-2*' | Sort-Object Name -Descending | Select-Object -Skip 3 | Remove-Item -Recurse -Force
    }
    if ($appPronta.TrimEnd('\') -ne $P.App.TrimEnd('\')) { Copy-Cartella $appPronta $P.App -Specchio }
    $sorgStrumenti = (Resolve-Path $PSScriptRoot).Path
    if ($sorgStrumenti.TrimEnd('\') -ne $P.Strumenti.TrimEnd('\')) {
        Copy-Cartella $sorgStrumenti $P.Strumenti -Specchio -Escludi @('download')
    }
    Write-Ok "Applicazione in $($P.App)"

    if ($CartellaDocumentiVecchi) {
        if (-not (Test-Path $CartellaDocumentiVecchi)) { Stop-Errore "Cartella documenti non trovata: $CartellaDocumentiVecchi" }
        Copy-Cartella $CartellaDocumentiVecchi $P.Upload
        Write-Ok ("Documenti copiati in {0} ({1} file)" -f $P.Upload, @(Get-ChildItem $P.Upload -File -Recurse).Count)
    }

    # ---------------------------------------------------- schema (facoltativo)
    if ($AggiornaSchema) {
        Write-Passo 'Aggiornamento dello schema del database (utente Windows corrente)'
        $cfgTmp = Read-FileEnv $fileProva
        $srv = $cfgTmp['DB_SERVER']
        if ($cfgTmp['DB_INSTANCE']) { $srv = "$srv\$($cfgTmp['DB_INSTANCE'])" } elseif ($cfgTmp['DB_PORT']) { $srv = "$srv,$($cfgTmp['DB_PORT'])" }
        $cnSchema = New-Connessione -Server $srv -Database $cfgTmp['DB_NAME']
        Update-Schema -Connessione $cnSchema -CartellaDatabase (Join-Path $P.App 'database')
        Write-Ok 'Schema aggiornato'
    }

    # ----------------------------------------------- verifica del database
    Write-Passo 'Verifica della connessione a SQL Server'
    Push-Location $P.App
    try {
        & $node "--env-file=$fileProva" (Join-Path $P.App 'scripts\db-check.mjs')
        $esitoDb = $LASTEXITCODE
        $global:LASTEXITCODE = 0
    } finally { Pop-Location }
    if ($esitoDb -eq 1) {
        if ($fileProva -ne $P.FileEnv) { Remove-Item $fileProva -Force }
        Stop-Errore 'Connessione al database non riuscita (vedi i suggerimenti sopra). Correggere e rilanciare lo script.'
    }
    if ($esitoDb -eq 2) {
        Write-Avviso 'Schema del database incompleto: l''app potrebbe dare errori.'
        Write-Info 'Sul server SQL eseguire: prepara-sql-server.ps1 -AggiornaSchema (oppure rilanciare con -AggiornaSchema).'
    } else {
        Write-Ok 'Database raggiungibile e schema completo'
    }
    if ($fileProva -ne $P.FileEnv) { Move-Item -LiteralPath $fileProva -Destination $P.FileEnv -Force }

    # ------------------------------------------------------------ servizio
    Write-Passo "Servizio Windows $NomeServizio"
    $winsw = Get-Componente $Componenti.WinSW $P.Download @((Join-Path $PSScriptRoot 'download'))
    Remove-ServizioApp $NomeServizio $P.Servizio
    $exeServizio = Join-Path $P.Servizio "$NomeServizio.exe"
    $xmlServizio = Join-Path $P.Servizio "$NomeServizio.xml"
    Copy-Item $winsw $exeServizio -Force
    $pwdServizio = ConvertFrom-Protetta $PasswordServizio
    if ($UtenteServizio -and -not $pwdServizio) { $pwdServizio = Read-Segreto "Password dell'account $UtenteServizio" }
    Write-FileUtf8 $xmlServizio (New-XmlServizio -NomeServizio $NomeServizio -NodeExe $node -Percorsi $P -Utente $UtenteServizio -Password $pwdServizio)
    & $exeServizio install
    if ($LASTEXITCODE -ne 0) { Stop-Errore "Registrazione del servizio non riuscita (codice $LASTEXITCODE)." }
    if ($UtenteServizio) {
        # La password serve solo in fase di registrazione: non la lasciamo nel file XML.
        Write-FileUtf8 $xmlServizio (New-XmlServizio -NomeServizio $NomeServizio -NodeExe $node -Percorsi $P)
    } else {
        & sc.exe config $NomeServizio obj= "NT SERVICE\$NomeServizio" | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Errore "Impostazione dell'account virtuale non riuscita (sc.exe codice $LASTEXITCODE)." }
    }
    $account = Get-AccountServizio $NomeServizio $UtenteServizio
    Set-PermessiInstallazione $P $account
    Write-Ok "Servizio registrato (account: $account, avvio automatico ritardato, riavvio in caso di errore)"

    Start-Service -Name $NomeServizio
    $salute = Wait-Health -Porta $Porta -Secondi 120
    if ($salute.Ok) {
        Write-Ok "Applicazione avviata: http://127.0.0.1:$Porta/api/health -> $($salute.Testo)"
    } elseif ($salute.Stato -eq 503) {
        Write-Avviso "Applicazione avviata ma database non raggiungibile dal servizio: $($salute.Testo)"
    } else {
        Write-Avviso "L'applicazione non risponde ($($salute.Testo)). Ultime righe del log:"
        foreach ($f in @("$NomeServizio.err.log", "$NomeServizio.out.log", "$NomeServizio.wrapper.log")) {
            $pf = Join-Path $P.Log $f
            if (Test-Path $pf) { Get-Content $pf -Tail 15 | ForEach-Object { Write-Info $_ } }
        }
        Stop-Errore 'Avvio del servizio non riuscito.'
    }

    # ------------------------------------------------------ rete / IIS
    if ($ConIIS) {
        Write-Passo 'Pubblicazione tramite IIS'
        $argIis = @{ PortaApp = $Porta; NomeHost = $NomeHost; NonInterattivo = $NonInterattivo }
        if ($CertificatoThumbprint) { $argIis.CertificatoThumbprint = $CertificatoThumbprint }
        if ($CertificatoAutofirmato) { $argIis.CertificatoAutofirmato = $true }
        if ($FermaSitoIIS) { $argIis.FermaSito = $FermaSitoIIS }
        & (Join-Path $PSScriptRoot 'configura-iis.ps1') @argIis
        if ($LASTEXITCODE -ne 0) { Stop-Errore 'Configurazione di IIS non riuscita (vedi sopra). Il servizio resta raggiungibile solo da questo server.' }
    } elseif (-not $SenzaFirewall) {
        Write-Passo 'Firewall di Windows'
        Set-RegolaFirewall -Nome "EssentiaMES (TCP $Porta)" -Porta $Porta
        Write-Ok "Porta $Porta aperta in ingresso"
    }

    # ---------------------------------------------------------- riepilogo
    $cfg = Read-FileEnv $P.FileEnv
    Write-Passo 'Installazione completata'
    Write-Host ''
    Write-Host "    Indirizzo      : $($cfg['APP_URL'])" -ForegroundColor Green
    Write-Host "    Servizio       : $NomeServizio  (Restart-Service $NomeServizio)"
    Write-Host "    Configurazione : $($P.FileEnv)"
    Write-Host "    Log            : $($P.Log)"
    Write-Host "    Documenti      : $($P.Upload)"
    Write-Host "    Diagnostica    : $($P.Strumenti)\verifica.ps1"
    Write-Host ''
    Write-Host '    Gli utenti del vecchio software entrano con le stesse credenziali.'
    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    Stop-Registro
    exit 0
} catch {
    Write-ErroreFinale $_
    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    Stop-Registro
    exit 1
}
