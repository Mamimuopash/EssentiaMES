<#
.SYNOPSIS
    Prepara SQL Server per EssentiaMES. Va eseguito SUL COMPUTER DOVE GIRA SQL SERVER.

.DESCRIPTION
    1. Abilita il protocollo TCP/IP sull'istanza, su porta fissa (predefinita 1433).
    2. Abilita l'autenticazione mista (SQL Server + Windows), necessaria al login dell'app.
    3. Riavvia il servizio SQL Server se sono cambiate le impostazioni.
    4. Apre la porta nel firewall di Windows per il server dell'applicazione (-ConsentiDa).
    5. Crea (o aggiorna) il login SQL dedicato all'app, con permessi di sola lettura/scrittura dati.
    6. Con -AggiornaSchema: backup di sicurezza del database e poi database\schema.sql.

    Va eseguito con un account Windows amministratore del computer e sysadmin di SQL Server
    (di solito l'account che ha installato SQL Server). Nessuna modifica ai dati esistenti.

.EXAMPLE
    .\prepara-sql-server.ps1 -Database Brighetti -ConsentiDa 192.168.1.20 -AggiornaSchema

.EXAMPLE
    # SQL Server e applicazione sullo stesso server: nessuna regola firewall necessaria
    .\prepara-sql-server.ps1 -Istanza SQLEXPRESS -Database Brighetti -AggiornaSchema
#>
[CmdletBinding()]
param(
    # Nome dell'istanza (MSSQLSERVER = istanza predefinita, SQLEXPRESS, ...). Vuoto = rilevata.
    [string]$Istanza = '',
    # Porta TCP fissa su cui SQL Server restera' in ascolto.
    [int]$Porta = 1433,
    # Database di EssentiaMES (quello del vecchio software).
    [string]$Database = 'Brighetti',
    # Login SQL usato dall'applicazione.
    [string]$LoginApp = 'essentia_app',
    # Password del login (se omessa viene chiesta o generata).
    [Security.SecureString]$PasswordApp,
    # Indirizzi IP / sottoreti autorizzati a raggiungere la porta (es. 192.168.1.20 o 192.168.1.0/24).
    # Vuoto = nessuna regola firewall (app sullo stesso computer o firewall gestito a parte).
    [string[]]$ConsentiDa = @(),
    # Esegue backup + database\schema.sql (aggiunge solo tabelle/colonne mancanti).
    [switch]$AggiornaSchema,
    # Con -AggiornaSchema esegue anche database\migrazioni\*.sql.
    [switch]$Migrazioni,
    # Non abilitare l'autenticazione mista (l'app usera' un account Windows via NTLM).
    [switch]$SoloAutenticazioneWindows,
    # Non riavviare SQL Server (le modifiche a TCP/autenticazione valgono dal prossimo riavvio).
    [switch]$SenzaRiavvio,
    # Account amministratore SQL (es. sa) se l'utente Windows corrente non e' sysadmin.
    [string]$AdminSqlUtente = '',
    [Security.SecureString]$AdminSqlPassword,
    # Non fare domande (usa i valori predefiniti / generati).
    [switch]$NonInterattivo
)

. (Join-Path $PSScriptRoot '_comune.ps1')
$registro = Start-Registro 'prepara-sql-server'
try {
    Write-Host 'EssentiaMES - preparazione di SQL Server' -ForegroundColor White
    Assert-Amministratore
    Assert-NomeDatabase $Database

    # ------------------------------------------------------------- istanza
    Write-Passo 'Istanza SQL Server'
    $istanze = @(Get-IstanzeSqlLocali)
    if ($istanze.Count -eq 0) {
        Stop-Errore 'SQL Server non risulta installato su questo computer: eseguire lo script sul server di SQL Server.'
    }
    $ist = $null
    if ($Istanza) {
        $ist = $istanze | Where-Object { $_.Nome -eq $Istanza } | Select-Object -First 1
        if (-not $ist) { Stop-Errore ("Istanza '{0}' non trovata. Istanze presenti: {1}" -f $Istanza, (($istanze | ForEach-Object { $_.Nome }) -join ', ')) }
    } elseif ($istanze.Count -eq 1) {
        $ist = $istanze[0]
    } else {
        $elenco = ($istanze | ForEach-Object { $_.Nome }) -join ', '
        if ($NonInterattivo) { Stop-Errore "Piu' istanze presenti ($elenco): indicare -Istanza." }
        $scelta = Read-Valore "Istanze presenti: $elenco. Quale usare?" $istanze[0].Nome
        $ist = $istanze | Where-Object { $_.Nome -eq $scelta } | Select-Object -First 1
        if (-not $ist) { Stop-Errore "Istanza '$scelta' non trovata." }
    }
    Write-Ok ("Istanza {0} (servizio {1})" -f $ist.Nome, $ist.Servizio)

    # --------------------------------------------------- TCP/IP e porta fissa
    Write-Passo "Protocollo TCP/IP sulla porta $Porta"
    $chiaveTcp = Join-Path $ist.Chiave 'SuperSocketNetLib\Tcp'
    $chiaveIpAll = Join-Path $chiaveTcp 'IPAll'
    if (-not (Test-Path $chiaveIpAll)) { Stop-Errore "Configurazione di rete dell'istanza non trovata nel registro ($chiaveIpAll)." }
    $tcp = Get-ItemProperty $chiaveTcp
    $ipAll = Get-ItemProperty $chiaveIpAll
    $riavvio = $false
    Write-Info ("Stato attuale: TCP {0}, porta fissa '{1}', porta dinamica '{2}'" -f @('disattivato', 'attivo')[[int]$tcp.Enabled], $ipAll.TcpPort, $ipAll.TcpDynamicPorts)

    # La porta non deve essere gia' usata da un altro programma (es. un'altra istanza).
    $pidSql = (Get-CimInstance Win32_Service -Filter ("Name='" + $ist.Servizio + "'")).ProcessId
    $occupata = @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne $pidSql })
    if ($occupata.Count -gt 0) {
        $proc = Get-Process -Id $occupata[0].OwningProcess -ErrorAction SilentlyContinue
        Stop-Errore ("La porta {0} e' gia' usata da {1} (PID {2}): scegliere un'altra porta con -Porta." -f $Porta, $proc.ProcessName, $occupata[0].OwningProcess)
    }
    # Altri programmi possono gia' collegarsi a questa istanza sulle porte attuali (fisse o
    # dinamica): restano tutte attive, la porta per EssentiaMES si AGGIUNGE.
    $tcpGiaAttivo = ([int]$tcp.Enabled -eq 1)
    $porteFisse = @("$($ipAll.TcpPort)".Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if (-not $tcpGiaAttivo) {
        Set-ItemProperty -Path $chiaveTcp -Name Enabled -Value 1 -Type DWord
        $riavvio = $true
    }
    if ([int]$tcp.ListenOnAllIPs -ne 1 -and -not $tcpGiaAttivo) {
        Set-ItemProperty -Path $chiaveTcp -Name ListenOnAllIPs -Value 1 -Type DWord
        $riavvio = $true
    } elseif ([int]$tcp.ListenOnAllIPs -ne 1) {
        Write-Avviso 'TCP/IP e'' configurato per singoli indirizzi IP: lasciato com''e''. Verificare la porta in SQL Server Configuration Manager.'
    }
    if ($porteFisse -notcontains "$Porta") {
        Set-ItemProperty -Path $chiaveIpAll -Name TcpPort -Value ((@("$Porta") + $porteFisse) -join ',')
        $riavvio = $true
    }
    if (-not $tcpGiaAttivo -and "$($ipAll.TcpDynamicPorts)" -ne '') {
        # TCP era spento: nessun programma usava la porta dinamica, si puo' togliere.
        Set-ItemProperty -Path $chiaveIpAll -Name TcpDynamicPorts -Value ''
        $riavvio = $true
    }
    if ($riavvio) { Write-Ok "Porta $Porta aggiunta (attiva dopo il riavvio); le porte gia' configurate restano attive" } else { Write-Ok 'Gia'' configurato' }

    # ------------------------------------------------- autenticazione mista
    Write-Passo 'Autenticazione'
    $modo = (Get-ItemProperty $ist.Chiave).LoginMode
    if ($SoloAutenticazioneWindows) {
        Write-Info 'Autenticazione mista non richiesta (-SoloAutenticazioneWindows).'
    } elseif ([int]$modo -ne 2) {
        Set-ItemProperty -Path $ist.Chiave -Name LoginMode -Value 2 -Type DWord
        $riavvio = $true
        Write-Ok 'Autenticazione mista (SQL Server e Windows) abilitata'
    } else {
        Write-Ok 'Autenticazione mista gia'' abilitata'
    }

    # ------------------------------------------------------------- riavvio
    if ($riavvio) {
        Write-Passo 'Riavvio del servizio SQL Server'
        if ($SenzaRiavvio) {
            Write-Avviso "Riavvio saltato (-SenzaRiavvio): riavviare il servizio $($ist.Servizio) per applicare le modifiche."
        } else {
            Write-Avviso 'Per qualche secondo si interrompono TUTTE le connessioni a questa istanza (anche di altri programmi).'
            # -Force ferma anche i servizi che dipendono da SQL Server (SQL Agent, servizi di altri
            # programmi): quelli che erano avviati vengono fatti ripartire.
            $dipendenti = @(Get-Service -Name $ist.Servizio -DependentServices | Where-Object { $_.Status -eq 'Running' })
            Restart-Service -Name $ist.Servizio -Force
            (Get-Service -Name $ist.Servizio).WaitForStatus('Running', [TimeSpan]::FromSeconds(120))
            foreach ($d in $dipendenti) {
                try {
                    Start-Service -Name $d.Name
                    Write-Ok "Riavviato anche $($d.DisplayName)"
                } catch {
                    Write-Avviso "Non riesco a riavviare $($d.DisplayName): avviarlo a mano (services.msc)."
                }
            }
            Write-Ok 'Servizio riavviato'
        }
    }

    # ------------------------------------------------------------ firewall
    Write-Passo 'Firewall di Windows'
    $nomeRegola = "EssentiaMES - SQL Server $($ist.Nome) (TCP $Porta)"
    if ($ConsentiDa.Count -gt 0) {
        Set-RegolaFirewall -Nome $nomeRegola -Porta $Porta -RemoteAddress $ConsentiDa
        Write-Ok ("Porta {0} aperta per: {1}" -f $Porta, ($ConsentiDa -join ', '))
    } else {
        Write-Info 'Nessuna regola creata (-ConsentiDa non indicato). Se l''app gira su un altro computer:'
        Write-Info "  .\prepara-sql-server.ps1 -ConsentiDa <IP del server applicativo>"
    }

    # ------------------------------------------------- connessione da admin
    Write-Passo 'Connessione a SQL Server'
    $serverTcp = "tcp:127.0.0.1,$Porta"
    $serverAdmin = $serverTcp
    if ($riavvio -and $SenzaRiavvio) { $serverAdmin = Get-NomeConnessioneLocale $ist }
    $pwdAdmin = ConvertFrom-Protetta $AdminSqlPassword
    $cnMaster = New-Connessione -Server $serverAdmin -Database 'master' -Utente $AdminSqlUtente -Password $pwdAdmin
    Wait-SqlPronto $cnMaster
    $info = Invoke-SqlModello $cnMaster 'info-istanza.sql' @{ db = $Database } | Select-Object -First 1
    Write-Ok ("SQL Server {0} {1} - {2}" -f (Get-Campo $info 'Versione'), (Get-Campo $info 'LivelloProdotto'), (Get-Campo $info 'Edizione'))
    if ([int](Get-Campo $info 'Sysadmin') -ne 1) {
        Stop-Errore 'L''account usato non e'' sysadmin di SQL Server: rilanciare con un amministratore SQL (-AdminSqlUtente sa) o aggiungere l''account al ruolo sysadmin da SSMS.'
    }
    $dbEsiste = $null -ne (Get-Campo $info 'NomeDatabase')
    if ($dbEsiste) {
        Write-Ok ("Database {0}: {1}, {2} MB dati, livello di compatibilita' {3}" -f $Database, (Get-Campo $info 'Stato'), (Get-Campo $info 'DatiMB'), (Get-Campo $info 'Compatibilita'))
    } else {
        Write-Avviso "Il database '$Database' non esiste su questa istanza."
        Write-Info 'Per trasferirlo dal vecchio server usare porting-database.ps1 (che associa anche il login).'
    }

    # ------------------------------------------- backup + aggiornamento schema
    if ($AggiornaSchema -and $dbEsiste) {
        Write-Passo 'Backup di sicurezza e aggiornamento dello schema'
        $cartellaBackup = Get-Campo $info 'CartellaBackup'
        $fileBak = Join-PercorsoServer $cartellaBackup ("{0}_prima-di-essentia_{1}.bak" -f $Database, (Get-Date -Format 'yyyyMMdd_HHmmss'))
        $sqlBackup = "BACKUP DATABASE [$Database] TO DISK = $(Format-LetteraleSql $fileBak) WITH COPY_ONLY, INIT, CHECKSUM, STATS = 25"
        Invoke-Sql -Connessione $cnMaster -Sql $sqlBackup -Timeout 0 | Out-Null
        Write-Ok "Backup: $fileBak"
        $cnDb = New-Connessione -Server $serverAdmin -Database $Database -Utente $AdminSqlUtente -Password $pwdAdmin
        Update-Schema -Connessione $cnDb -CartellaDatabase (Get-CartellaDatabase $RadiceProgetto) -Migrazioni:$Migrazioni
        Write-Ok 'Schema aggiornato (solo tabelle/colonne mancanti, nessun dato modificato)'
    } elseif ($AggiornaSchema) {
        Write-Avviso 'Aggiornamento schema saltato: il database non esiste.'
    }

    # ----------------------------------------------------- login applicazione
    if ($SoloAutenticazioneWindows) {
        Write-Passo 'Login dell''applicazione'
        Write-Info 'Saltato: con -SoloAutenticazioneWindows l''app si collega con un account Windows (DB_AUTH_TYPE=ntlm).'
        Write-Info 'Dare a quell''account i ruoli db_datareader e db_datawriter sul database da SSMS.'
        $pwdApp = ''
    } else {
        Write-Passo "Login dell'applicazione ($LoginApp)"
        $loginEsistente = Get-PrimaRiga $cnMaster 'SELECT name FROM sys.server_principals WHERE name = @n' @{ n = $LoginApp }
        $pwdApp = ConvertFrom-Protetta $PasswordApp
        $generata = $false
        if (-not $pwdApp) {
            # Rilanciando lo script (es. solo per -AggiornaSchema) la password gia' usata dall'app
            # NON deve cambiare: con Invio resta quella attuale.
            if ($loginEsistente) { $pwdApp = Read-Segreto "Il login $LoginApp esiste gia'. Nuova password (Invio = lascia quella attuale)" }
            else { $pwdApp = Read-Segreto "Password per il login $LoginApp (Invio = generata automaticamente)" }
        }
        if (-not $pwdApp -and -not $loginEsistente) { $pwdApp = New-PasswordSql; $generata = $true }
        if ($pwdApp) {
            $esito = Invoke-SqlModello $cnMaster 'crea-login.sql' @{ login = $LoginApp; password = $pwdApp } | Select-Object -First 1
            Write-Ok ("Login {0} {1}" -f $LoginApp, (Get-Campo $esito 'Esito'))
        } else {
            Write-Ok "Login $LoginApp gia' presente: password invariata"
        }
        if ($dbEsiste) {
            $cnDb = New-Connessione -Server $serverAdmin -Database $Database -Utente $AdminSqlUtente -Password $pwdAdmin
            Invoke-SqlModello $cnDb 'associa-utente.sql' @{ login = $LoginApp } | Out-Null
            Write-Ok "Utente $LoginApp associato a $Database (db_datareader, db_datawriter)"
        }
        if ($pwdApp -and -not ($riavvio -and $SenzaRiavvio)) {
            $dbProva = 'master'
            if ($dbEsiste) { $dbProva = $Database }
            $prova = Invoke-SqlModello (New-Connessione -Server $serverTcp -Database $dbProva -Utente $LoginApp -Password $pwdApp) 'prova-login.sql' | Select-Object -First 1
            Write-Ok ("Accesso verificato via TCP come {0} su {1}" -f (Get-Campo $prova 'Login'), (Get-Campo $prova 'NomeDatabase'))
        }
    }

    # -------------------------------------------------------------- riepilogo
    # Il registro si chiude prima del riepilogo: la password non deve finire nel file di log.
    Stop-Registro
    Write-Passo 'Fatto. Dati per installa-app.ps1 sul server dell''applicazione:'
    $ip = (Get-IndirizziIPv4) -join ' / '
    Write-Host ''
    Write-Host ("    Server SQL : {0}   (indirizzi IP: {1})" -f $env:COMPUTERNAME, $ip)
    Write-Host ("    Porta      : {0}" -f $Porta)
    Write-Host ("    Database   : {0}" -f $Database)
    if (-not $SoloAutenticazioneWindows) {
        Write-Host ("    Utente     : {0}" -f $LoginApp)
        if ($generata) {
            Write-Host ("    Password   : {0}" -f $pwdApp) -ForegroundColor Yellow
            Write-Host '                 (generata ora: conservarla, non viene salvata da nessuna parte)' -ForegroundColor Yellow
        } elseif (-not $pwdApp) {
            Write-Host '    Password   : invariata (quella gia'' configurata nell''app)'
        } else {
            Write-Host '    Password   : quella indicata'
        }
    }
    Write-Host ''
    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    exit 0
} catch {
    Write-ErroreFinale $_
    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    Stop-Registro
    exit 1
}
