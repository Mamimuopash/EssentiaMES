<#
.SYNOPSIS
    Copia il database di EssentiaMES dal vecchio SQL Server a quello nuovo (backup + ripristino).

.DESCRIPTION
    Da eseguire sul NUOVO server (quello con l'istanza SQL Server di destinazione),
    con un account Windows amministratore e sysadmin di entrambe le istanze
    (oppure indicando un login SQL con -UtenteOrigine / -UtenteDestinazione).

    1. Controlla versioni ed edizioni (non si puo' ripristinare su una versione piu' vecchia;
       SQL Server Express ha un limite di 10 GB per database).
    2. Backup COPY_ONLY sul vecchio server (non altera la catena dei backup esistente).
    3. Copia del file .bak sul nuovo server (condivisione amministrativa \\server\C$ oppure
       -CartellaScambio). Se la copia non e' possibile lo script spiega come farla a mano
       e si rilancia con -FileBackup.
    4. Ripristino con i file nelle cartelle predefinite della nuova istanza.
    5. Sistemazione: proprietario, livello di compatibilita', utenti orfani, login dell'app,
       database\schema.sql.
    6. Confronto del numero di righe tabella per tabella tra origine e destinazione.

    PRIMA DEL PORTING fermare il vecchio software (sito IIS) e qualsiasi programma che scrive
    nel database (raccolta dati macchine, import Mexal): le modifiche fatte dopo il backup
    non verrebbero copiate.

.EXAMPLE
    .\porting-database.ps1 -ServerOrigine VECCHIO-SRV\SQLEXPRESS -DatabaseOrigine Brighetti

.EXAMPLE
    # Backup copiato a mano nella cartella di backup della nuova istanza
    .\porting-database.ps1 -ServerOrigine VECCHIO-SRV -FileBackup "C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\Brighetti.bak"
#>
[CmdletBinding()]
param(
    # Vecchio SQL Server: NOME\ISTANZA oppure NOME,PORTA oppure IP,PORTA
    [Parameter(Mandatory = $true)][string]$ServerOrigine,
    [string]$DatabaseOrigine = 'Brighetti',
    # Login SQL per l'origine (vuoto = autenticazione Windows dell'utente corrente)
    [string]$UtenteOrigine = '',
    [Security.SecureString]$PasswordOrigine,
    # Nuovo SQL Server (vuoto = istanza locale rilevata automaticamente)
    [string]$ServerDestinazione = '',
    # Nome del database sul nuovo server (vuoto = stesso nome dell'origine)
    [string]$DatabaseDestinazione = '',
    [string]$UtenteDestinazione = '',
    [Security.SecureString]$PasswordDestinazione,
    # File .bak gia' disponibile, percorso visto dal NUOVO SQL Server: salta backup e copia
    [string]$FileBackup = '',
    # Cartella condivisa (\\server\cartella) scrivibile dal servizio SQL di origine e leggibile da quello di destinazione
    [string]$CartellaScambio = '',
    # Login dell'app da associare al database ripristinato (creato da prepara-sql-server.ps1)
    [string]$LoginApp = 'essentia_app',
    # Sovrascrive il database di destinazione se esiste gia' (ne fa prima un backup)
    [switch]$Sovrascrivi,
    [switch]$SenzaAggiornamentoSchema,
    [switch]$Migrazioni,
    # A porting riuscito mette il database di ORIGINE in sola lettura (evita scritture sul vecchio)
    [switch]$OrigineSolaLettura,
    [switch]$NonInterattivo
)

. (Join-Path $PSScriptRoot '_comune.ps1')
$registro = Start-Registro 'porting-database'

# "\\MACCHINA\C$\percorso" per raggiungere un percorso locale di un altro computer.
function ConvertTo-PercorsoRete([string]$Macchina, [string]$Percorso) {
    if ($Percorso -like '\\*') { return $Percorso }
    if ($Macchina -eq $env:COMPUTERNAME) { return $Percorso }
    if ($Percorso -notmatch '^([A-Za-z]):\\(.*)$') { Stop-Errore "Percorso non riconosciuto: $Percorso" }
    return ('\\{0}\{1}$\{2}' -f $Macchina, $Matches[1], $Matches[2])
}

function Get-VersionePrincipale([string]$Versione) { return [int]($Versione.Split('.')[0]) }

$NomiVersione = @{ 10 = '2008/2008 R2'; 11 = '2012'; 12 = '2014'; 13 = '2016'; 14 = '2017'; 15 = '2019'; 16 = '2022'; 17 = '2025' }

try {
    Write-Host 'EssentiaMES - porting del database' -ForegroundColor White
    Assert-Amministratore
    if (-not $DatabaseDestinazione) { $DatabaseDestinazione = $DatabaseOrigine }
    Assert-NomeDatabase $DatabaseOrigine
    Assert-NomeDatabase $DatabaseDestinazione
    if (-not $ServerDestinazione) {
        $locali = @(Get-IstanzeSqlLocali)
        if ($locali.Count -eq 0) { Stop-Errore 'Nessuna istanza SQL Server su questo computer: indicare -ServerDestinazione.' }
        $ServerDestinazione = Get-NomeConnessioneLocale $locali[0]
        if ($locali.Count -gt 1) { Write-Avviso "Piu' istanze locali: uso $ServerDestinazione (cambiare con -ServerDestinazione)." }
    }

    # ------------------------------------------------------------ origine
    Write-Passo "Origine: $ServerOrigine / $DatabaseOrigine"
    $cnOrigine = New-Connessione -Server $ServerOrigine -Database 'master' -Utente $UtenteOrigine -Password (ConvertFrom-Protetta $PasswordOrigine) -Timeout 30
    $infoO = Invoke-SqlModello $cnOrigine 'info-istanza.sql' @{ db = $DatabaseOrigine } | Select-Object -First 1
    $verO = Get-VersionePrincipale (Get-Campo $infoO 'Versione')
    Write-Ok ("SQL Server {0} ({1}) {2} su {3}" -f $NomiVersione[$verO], (Get-Campo $infoO 'Versione'), (Get-Campo $infoO 'Edizione'), (Get-Campo $infoO 'Macchina'))
    if ($null -eq (Get-Campo $infoO 'NomeDatabase')) { Stop-Errore "Il database '$DatabaseOrigine' non esiste su $ServerOrigine." }
    if ((Get-Campo $infoO 'Stato') -ne 'ONLINE') { Stop-Errore "Il database '$DatabaseOrigine' non e' ONLINE (stato: $(Get-Campo $infoO 'Stato'))." }
    $datiMB = [long](Get-Campo $infoO 'DatiMB')
    Write-Ok ("Database {0}: {1} MB dati, {2} MB log, compatibilita' {3}" -f $DatabaseOrigine, $datiMB, (Get-Campo $infoO 'LogMB'), (Get-Campo $infoO 'Compatibilita'))

    # ------------------------------------------------------- destinazione
    Write-Passo "Destinazione: $ServerDestinazione / $DatabaseDestinazione"
    $pwdDest = ConvertFrom-Protetta $PasswordDestinazione
    $cnDest = New-Connessione -Server $ServerDestinazione -Database 'master' -Utente $UtenteDestinazione -Password $pwdDest -Timeout 30
    $infoD = Invoke-SqlModello $cnDest 'info-istanza.sql' @{ db = $DatabaseDestinazione } | Select-Object -First 1
    $verD = Get-VersionePrincipale (Get-Campo $infoD 'Versione')
    Write-Ok ("SQL Server {0} ({1}) {2} su {3}" -f $NomiVersione[$verD], (Get-Campo $infoD 'Versione'), (Get-Campo $infoD 'Edizione'), (Get-Campo $infoD 'Macchina'))
    if ([int](Get-Campo $infoD 'Sysadmin') -ne 1) { Stop-Errore 'Sulla destinazione serve un account sysadmin (per RESTORE).' }
    if ((Get-Campo $infoO 'NomeServer') -eq (Get-Campo $infoD 'NomeServer') -and $DatabaseOrigine -eq $DatabaseDestinazione) {
        Stop-Errore 'Origine e destinazione coincidono: indicare un -DatabaseDestinazione diverso.'
    }
    if ($verD -lt $verO) {
        Stop-Errore ("Impossibile ripristinare un backup di SQL Server {0} su SQL Server {1} (versione piu' vecchia). Installare sul nuovo server SQL Server {0} o successivo (su Windows Server 2016 fino a SQL Server 2022)." -f $NomiVersione[$verO], $NomiVersione[$verD])
    }
    if ([int](Get-Campo $infoD 'TipoMotore') -eq 4 -and $datiMB -gt 10240) {
        Stop-Errore "Il database occupa $datiMB MB: SQL Server Express (destinazione) ha un limite di 10 GB. Serve SQL Server Standard."
    }
    if ($null -ne (Get-Campo $infoD 'NomeDatabase')) {
        if (-not $Sovrascrivi) {
            Stop-Errore "Il database '$DatabaseDestinazione' esiste gia' sulla destinazione: usare -Sovrascrivi (ne verra' fatto prima un backup) o un altro -DatabaseDestinazione."
        }
        if (-not (Read-SiNo "Il database $DatabaseDestinazione sulla destinazione verra' SOSTITUITO. Continuare?" $true)) { Stop-Errore 'Annullato.' }
    }

    # --------------------------------------------------------------- backup
    $creatoDaNoi = $false
    if ($FileBackup) {
        Write-Passo 'Backup'
        Write-Info "Uso il file indicato: $FileBackup"
        $fileDest = $FileBackup
    } else {
        Write-Passo "Backup di $DatabaseOrigine (COPY_ONLY)"
        $nomeFile = "{0}_porting_{1}.bak" -f $DatabaseOrigine, (Get-Date -Format 'yyyyMMdd_HHmmss')
        if ($CartellaScambio) { $fileOrigine = Join-PercorsoServer $CartellaScambio $nomeFile }
        else { $fileOrigine = Join-PercorsoServer (Get-Campo $infoO 'CartellaBackup') $nomeFile }
        $opzioni = 'COPY_ONLY, INIT, CHECKSUM, STATS = 10'
        # Compressione: disponibile su Standard/Enterprise (non su Express)
        if ([int](Get-Campo $infoO 'TipoMotore') -in @(2, 3)) { $opzioni = 'COMPRESSION, ' + $opzioni }
        Invoke-Sql -Connessione $cnOrigine -Sql "BACKUP DATABASE [$DatabaseOrigine] TO DISK = $(Format-LetteraleSql $fileOrigine) WITH $opzioni" -Timeout 0 | Out-Null
        Write-Ok "Backup creato sul server di origine: $fileOrigine"
        $creatoDaNoi = $true

        # ------------------------------------------------------ copia del file
        Write-Passo 'Trasferimento del file di backup'
        $macO = Get-Campo $infoO 'Macchina'
        $macD = Get-Campo $infoD 'Macchina'
        if ($CartellaScambio) {
            $fileDest = $fileOrigine
            Write-Ok 'Cartella condivisa: nessuna copia necessaria'
        } elseif ((Get-Campo $infoO 'NomeServer') -eq (Get-Campo $infoD 'NomeServer')) {
            $fileDest = $fileOrigine
            Write-Ok 'Stessa istanza: nessuna copia necessaria'
        } else {
            $fileDest = Join-PercorsoServer (Get-Campo $infoD 'CartellaBackup') $nomeFile
            $da = ConvertTo-PercorsoRete $macO $fileOrigine
            $a = ConvertTo-PercorsoRete $macD $fileDest
            Write-Info "Da: $da"
            Write-Info "A : $a"
            try {
                Copy-Item -LiteralPath $da -Destination $a -Force
            } catch {
                Write-Avviso "Copia automatica non riuscita: $($_.Exception.Message)"
                Write-Host ''
                Write-Host '    Copiare a mano il file:' -ForegroundColor Yellow
                Write-Host "      $fileOrigine   (sul server $macO)" -ForegroundColor Yellow
                Write-Host '    nella cartella del nuovo server:' -ForegroundColor Yellow
                Write-Host "      $(Get-Campo $infoD 'CartellaBackup')   (sul server $macD)" -ForegroundColor Yellow
                Write-Host '    e rilanciare lo script aggiungendo:' -ForegroundColor Yellow
                Write-Host "      -FileBackup `"$fileDest`"" -ForegroundColor Yellow
                Stop-Errore 'Trasferimento del backup da completare a mano.'
            }
            Write-Ok ("Copiato ({0:N0} MB)" -f ((Get-Item -LiteralPath $a).Length / 1MB))
        }
    }

    # ------------------------------------------------------------ ripristino
    Write-Passo "Ripristino come $DatabaseDestinazione"
    $file = @(Invoke-Sql -Connessione $cnDest -Sql "RESTORE FILELISTONLY FROM DISK = $(Format-LetteraleSql $fileDest)")
    if ($file.Count -eq 0) { Stop-Errore "Il file $fileDest non contiene un backup leggibile." }
    $cartDati = (Get-Campo $infoD 'CartellaDati').TrimEnd('\')
    $cartLog = (Get-Campo $infoD 'CartellaLog').TrimEnd('\')
    $sposta = @()
    $nDati = 0
    $nLog = 0
    foreach ($f in $file) {
        $tipo = [string](Get-Campo $f 'Type')
        $logico = [string](Get-Campo $f 'LogicalName')
        if ($tipo -eq 'L') {
            $nLog++
            $suff = ''
            if ($nLog -gt 1) { $suff = "$nLog" }
            $fisico = "$cartLog\$($DatabaseDestinazione)_log$suff.ldf"
        } elseif ($tipo -eq 'D') {
            $nDati++
            if ($nDati -eq 1) { $fisico = "$cartDati\$DatabaseDestinazione.mdf" }
            else { $fisico = "$cartDati\$($DatabaseDestinazione)_$nDati.ndf" }
        } else {
            # Catalogo full-text o FILESTREAM: cartella dedicata
            $fisico = "$cartDati\$($DatabaseDestinazione)_$logico"
        }
        Write-Info "$logico -> $fisico"
        $sposta += "MOVE $(Format-LetteraleSql $logico) TO $(Format-LetteraleSql $fisico)"
    }
    if ($null -ne (Get-Campo $infoD 'NomeDatabase')) {
        $sicurezza = Join-PercorsoServer (Get-Campo $infoD 'CartellaBackup') ("{0}_prima-del-porting_{1}.bak" -f $DatabaseDestinazione, (Get-Date -Format 'yyyyMMdd_HHmmss'))
        Invoke-Sql -Connessione $cnDest -Sql "BACKUP DATABASE [$DatabaseDestinazione] TO DISK = $(Format-LetteraleSql $sicurezza) WITH COPY_ONLY, INIT, STATS = 25" -Timeout 0 | Out-Null
        Write-Ok "Backup del database sostituito: $sicurezza"
        Invoke-Sql -Connessione $cnDest -Sql "ALTER DATABASE [$DatabaseDestinazione] SET SINGLE_USER WITH ROLLBACK IMMEDIATE" | Out-Null
    }
    $opzRestore = $sposta + @('RECOVERY', 'STATS = 10')
    if ($creatoDaNoi) { $opzRestore += 'CHECKSUM' }
    if ($Sovrascrivi) { $opzRestore += 'REPLACE' }
    Invoke-Sql -Connessione $cnDest -Sql ("RESTORE DATABASE [$DatabaseDestinazione] FROM DISK = $(Format-LetteraleSql $fileDest) WITH " + ($opzRestore -join ', ')) -Timeout 0 | Out-Null
    Write-Ok 'Database ripristinato'

    # ----------------------------------------------------------- sistemazione
    Write-Passo 'Sistemazione del database ripristinato'
    $dopo = Invoke-SqlModello $cnDest 'dopo-ripristino.sql' @{ db = $DatabaseDestinazione } | Select-Object -First 1
    Write-Ok ("Proprietario {0}, livello di compatibilita' {1}" -f (Get-Campo $dopo 'Proprietario'), (Get-Campo $dopo 'Compatibilita'))
    $cnNuovo = New-Connessione -Server $ServerDestinazione -Database $DatabaseDestinazione -Utente $UtenteDestinazione -Password $pwdDest -Timeout 30
    $orfani = @(Invoke-SqlModello $cnNuovo 'ripara-utenti-orfani.sql' | ForEach-Object { Get-Campo $_ 'Utente' } | Where-Object { $_ -and $_ -ne $LoginApp })
    if ($orfani.Count -gt 0) {
        Write-Avviso ("Utenti del vecchio server senza login qui (di solito non servono): {0}" -f ($orfani -join ', '))
    }
    $loginPresente = Get-PrimaRiga $cnDest 'SELECT name FROM sys.server_principals WHERE name = @n' @{ n = $LoginApp }
    if ($loginPresente) {
        Invoke-SqlModello $cnNuovo 'associa-utente.sql' @{ login = $LoginApp } | Out-Null
        Write-Ok "Login $LoginApp associato (db_datareader, db_datawriter)"
    } else {
        Write-Avviso "Il login $LoginApp non esiste su questo SQL Server: eseguire prepara-sql-server.ps1 -Database $DatabaseDestinazione"
    }
    if (-not $SenzaAggiornamentoSchema) {
        Update-Schema -Connessione $cnNuovo -CartellaDatabase (Get-CartellaDatabase $RadiceProgetto) -Migrazioni:$Migrazioni
        Write-Ok 'Schema aggiornato'
    }

    # ------------------------------------------------------------- verifica
    Write-Passo 'Verifica: righe per tabella (origine / destinazione)'
    $cnOrigineDb = New-Connessione -Server $ServerOrigine -Database $DatabaseOrigine -Utente $UtenteOrigine -Password (ConvertFrom-Protetta $PasswordOrigine) -Timeout 30
    $righeO = @{}
    foreach ($r in @(Invoke-SqlModello $cnOrigineDb 'conteggio-righe.sql')) { $righeO[[string](Get-Campo $r 'Tabella')] = [long](Get-Campo $r 'Righe') }
    $diverse = 0
    $totale = 0
    foreach ($r in @(Invoke-SqlModello $cnNuovo 'conteggio-righe.sql')) {
        $t = [string](Get-Campo $r 'Tabella')
        $n = [long](Get-Campo $r 'Righe')
        if (-not $righeO.ContainsKey($t)) { continue }   # tabelle aggiunte da schema.sql
        $totale += $n
        if ($righeO[$t] -ne $n) {
            $diverse++
            Write-Avviso ("{0}: origine {1}, destinazione {2}" -f $t, $righeO[$t], $n)
        }
    }
    if ($diverse -eq 0) {
        Write-Ok ("{0} tabelle, {1:N0} righe: tutte uguali all'origine" -f $righeO.Count, $totale)
    } else {
        Write-Avviso "$diverse tabelle con conteggi diversi: il vecchio database e' stato modificato dopo il backup? Rifare il porting a software fermo."
    }

    if ($OrigineSolaLettura) {
        Write-Passo 'Database di origine in sola lettura'
        Invoke-Sql -Connessione $cnOrigine -Sql "ALTER DATABASE [$DatabaseOrigine] SET READ_ONLY WITH ROLLBACK IMMEDIATE" | Out-Null
        Write-Ok "$DatabaseOrigine su $ServerOrigine ora e' in sola lettura (per riattivarlo: ALTER DATABASE [$DatabaseOrigine] SET READ_WRITE)"
    }

    Write-Passo 'Porting completato'
    Write-Info "Nuovo database: $ServerDestinazione / $DatabaseDestinazione"
    Write-Info 'Ricordarsi di puntare al nuovo server anche gli altri programmi che scrivono nel database'
    Write-Info '(raccolta dati macchine, export Mexal) e di copiare la cartella upload_documenti.'
    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    Stop-Registro
    exit 0
} catch {
    Write-ErroreFinale $_
    Write-Host "    Registro: $registro" -ForegroundColor DarkGray
    Stop-Registro
    exit 1
}
