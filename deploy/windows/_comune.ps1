# =============================================================================
# EssentiaMES - funzioni comuni agli script di installazione per Windows Server
# -----------------------------------------------------------------------------
# Viene incluso (dot-source) dagli altri script: non va eseguito da solo.
# Compatibile con Windows PowerShell 5.1 (Windows Server 2016 e successivi).
# Il file contiene solo caratteri ASCII: PowerShell 5.1 legge gli script senza
# BOM come ANSI e le lettere accentate verrebbero alterate.
# =============================================================================

$ErrorActionPreference = 'Stop'
# La barra di avanzamento rende Invoke-WebRequest lentissimo su PowerShell 5.1.
$ProgressPreference = 'SilentlyContinue'
# Windows Server 2016 non abilita TLS 1.2 per PowerShell: serve per nodejs.org,
# GitHub e download.microsoft.com.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

# Cartella del pacchetto o del sorgente (deploy\windows\..\..)
$RadiceProgetto = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# Componenti scaricati durante l'installazione, con hash SHA256 verificato.
$Componenti = @{
    WinSW      = @{
        Nome   = 'WinSW.NET461.exe'
        Url    = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe'
        Sha256 = 'B5066B7BBDFBA1293E5D15CDA3CAAEA88FBEAB35BD5B38C41C913D492AADFC4F'
    }
    UrlRewrite = @{
        Nome   = 'rewrite_amd64_en-US.msi'
        Url    = 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi'
        Sha256 = '37342FF2F585F263F34F48E9DE59EB1051D61015A8E967DBDE4075716230A32A'
    }
    Arr        = @{
        Nome   = 'requestRouter_amd64.msi'
        Url    = 'https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi'
        Sha256 = 'FB61FDB7101795A34D5129CB37EEE43AB675C7ED76BA3A3B23B039D8C90C2A4B'
    }
}

# --------------------------------------------------------------------- output

function Write-Passo([string]$Testo) {
    Write-Host ''
    Write-Host "==> $Testo" -ForegroundColor Cyan
}
function Write-Ok([string]$Testo) { Write-Host "    [OK] $Testo" -ForegroundColor Green }
function Write-Avviso([string]$Testo) { Write-Host "    [!]  $Testo" -ForegroundColor Yellow }
function Write-Info([string]$Testo) { Write-Host "         $Testo" }

# Interrompe lo script con un messaggio leggibile (il chiamante esce con codice 1).
function Stop-Errore([string]$Testo) {
    throw [System.Exception]::new($Testo)
}

function Write-ErroreFinale($Err) {
    $msg = $Err.Exception.Message
    if ($Err.Exception.InnerException) { $msg = $Err.Exception.InnerException.Message }
    Write-Host ''
    Write-Host "[ERRORE] $msg" -ForegroundColor Red
    if ($Err.InvocationInfo -and $Err.InvocationInfo.ScriptName) {
        Write-Host ("         ({0}, riga {1})" -f (Split-Path $Err.InvocationInfo.ScriptName -Leaf), $Err.InvocationInfo.ScriptLineNumber) -ForegroundColor DarkGray
    }
}

# Registro dell'esecuzione in %ProgramData%\EssentiaMES\log-installazione.
function Start-Registro([string]$Nome) {
    $dir = Join-Path $env:ProgramData 'EssentiaMES\log-installazione'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $file = Join-Path $dir ("{0}-{1}.log" -f $Nome, (Get-Date -Format 'yyyyMMdd-HHmmss'))
    try { Start-Transcript -Path $file -Force | Out-Null } catch { }
    return $file
}
function Stop-Registro { try { Stop-Transcript | Out-Null } catch { } }

# ---------------------------------------------------------------- prerequisiti

function Assert-Amministratore {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Stop-Errore 'Eseguire lo script come Amministratore (tasto destro sul file .cmd > Esegui come amministratore).'
    }
}

function Test-SistemaOperativo {
    $os = Get-CimInstance Win32_OperatingSystem
    Write-Info ("Sistema: {0} (build {1})" -f $os.Caption, $os.BuildNumber)
    if ([int]$os.BuildNumber -lt 14393) {
        Write-Avviso 'Sistema precedente a Windows Server 2016: Node.js 20+ non e'' supportato.'
    }
}

# ------------------------------------------------------------------ interazione

# $NonInterattivo e' il parametro omonimo dello script chiamante (scope dinamico).
function Read-Valore([string]$Domanda, [string]$Predefinito = '') {
    if ($NonInterattivo) { return $Predefinito }
    $testo = $Domanda
    if ($Predefinito) { $testo = "$Domanda [$Predefinito]" }
    $r = Read-Host $testo
    if ([string]::IsNullOrWhiteSpace($r)) { return $Predefinito }
    return $r.Trim()
}

function Read-SiNo([string]$Domanda, [bool]$Predefinito = $true) {
    if ($NonInterattivo) { return $Predefinito }
    $suff = 's/N'
    if ($Predefinito) { $suff = 'S/n' }
    $r = Read-Host "$Domanda ($suff)"
    if ([string]::IsNullOrWhiteSpace($r)) { return $Predefinito }
    return ($r.Trim().ToLower() -in @('s', 'si', 'y', 'yes'))
}

function ConvertFrom-Protetta([Security.SecureString]$Valore) {
    if ($null -eq $Valore) { return '' }
    $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Valore)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

function Read-Segreto([string]$Domanda) {
    if ($NonInterattivo) { return '' }
    return ConvertFrom-Protetta (Read-Host $Domanda -AsSecureString)
}

# Segreto casuale in base64url (per SESSION_SECRET, CRON_SECRET).
function New-Segreto([int]$Byte = 48) {
    $b = New-Object byte[] $Byte
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b)
    $rng.Dispose()
    return ([Convert]::ToBase64String($b)).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

# Password per il login SQL: rispetta sempre la policy di complessita' di Windows.
function New-PasswordSql {
    return ('Em' + (New-Segreto 18) + '7!x')
}

# --------------------------------------------------------------------- file

function Write-FileUtf8([string]$Percorso, [string]$Testo) {
    [IO.File]::WriteAllText($Percorso, $Testo, (New-Object Text.UTF8Encoding($false)))
}

# Riga per il file di configurazione letto da "node --env-file": tra apici singoli
# il valore e' preso alla lettera (nessuna sequenza di escape, $ e # compresi).
function Format-RigaEnv([string]$Nome, [string]$Valore) {
    if ($null -eq $Valore) { $Valore = '' }
    if ($Valore -match "[`r`n]") { Stop-Errore "Il valore di $Nome non puo' contenere ritorni a capo." }
    $bt = [string][char]96
    if (-not $Valore.Contains("'")) { return "$Nome='$Valore'" }
    if (-not $Valore.Contains($bt)) { return "$Nome=$bt$Valore$bt" }
    Stop-Errore "Il valore di $Nome non puo' contenere sia l'apice (') sia l'accento grave."
}

# Imposta (o aggiunge) una variabile in un file .env mantenendo il resto del file.
function Set-ValoreEnv([string]$Percorso, [string]$Nome, [string]$Valore) {
    $righe = New-Object 'Collections.Generic.List[string]'
    $trovata = $false
    foreach ($r in [IO.File]::ReadAllLines($Percorso)) {
        if ($r -match ('^\s*' + [regex]::Escape($Nome) + '\s*=')) {
            $righe.Add((Format-RigaEnv $Nome $Valore))
            $trovata = $true
        } else {
            $righe.Add($r)
        }
    }
    if (-not $trovata) { $righe.Add((Format-RigaEnv $Nome $Valore)) }
    Write-FileUtf8 $Percorso (($righe -join "`r`n") + "`r`n")
}

# Legge un file .env (NOME=valore, eventualmente tra apici) in una hashtable ordinata.
function Read-FileEnv([string]$Percorso) {
    $h = [ordered]@{}
    if (-not (Test-Path $Percorso)) { return $h }
    $bt = [char]96
    foreach ($riga in [IO.File]::ReadAllLines($Percorso)) {
        if ($riga -match '^\s*#') { continue }
        if ($riga -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
        $k = $Matches[1]
        $v = $Matches[2].Trim()
        if ($v.Length -ge 2) {
            $a = $v[0]; $z = $v[$v.Length - 1]
            if (($a -eq [char]39 -and $z -eq [char]39) -or ($a -eq [char]34 -and $z -eq [char]34) -or ($a -eq $bt -and $z -eq $bt)) {
                $v = $v.Substring(1, $v.Length - 2)
            }
        }
        $h[$k] = $v
    }
    return $h
}

# Copia una cartella con robocopy. -Specchio rimuove dalla destinazione i file non piu' presenti.
function Copy-Cartella([string]$Da, [string]$A, [switch]$Specchio, [string[]]$Escludi = @()) {
    if (-not (Test-Path $Da)) { Stop-Errore "Cartella non trovata: $Da" }
    $argomenti = @($Da, $A, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2')
    if ($Specchio) { $argomenti += '/MIR' }
    if ($Escludi.Count -gt 0) { $argomenti += '/XD'; $argomenti += $Escludi }
    & robocopy.exe @argomenti | Out-Null
    $codice = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($codice -ge 8) { Stop-Errore "Copia non riuscita da $Da a $A (robocopy codice $codice)." }
}

# Scarica un file e ne verifica l'hash SHA256. Se il file e' gia' presente in una delle
# cartelle indicate (installazione senza Internet) viene usato quello.
function Get-Componente([hashtable]$Componente, [string]$CartellaDestinazione, [string[]]$CartelleLocali = @()) {
    New-Item -ItemType Directory -Force -Path $CartellaDestinazione | Out-Null
    $dest = Join-Path $CartellaDestinazione $Componente.Nome
    $candidati = @($dest) + @($CartelleLocali | Where-Object { $_ } | ForEach-Object { Join-Path $_ $Componente.Nome })
    foreach ($c in $candidati) {
        if ((Test-Path $c) -and ((Get-FileHash $c -Algorithm SHA256).Hash -eq $Componente.Sha256)) {
            if ($c -ne $dest) { Copy-Item $c $dest -Force }
            return $dest
        }
    }
    Write-Info "Download $($Componente.Url)"
    try {
        Invoke-WebRequest -Uri $Componente.Url -OutFile $dest -UseBasicParsing
    } catch {
        Stop-Errore ("Download non riuscito ({0}). Senza Internet copiare {1} nella cartella {2} e rilanciare." -f $_.Exception.Message, $Componente.Nome, $CartellaDestinazione)
    }
    $hash = (Get-FileHash $dest -Algorithm SHA256).Hash
    if ($hash -ne $Componente.Sha256) {
        Remove-Item $dest -Force
        Stop-Errore "Hash SHA256 non valido per $($Componente.Nome): atteso $($Componente.Sha256), ottenuto $hash."
    }
    return $dest
}

# ------------------------------------------------------------------- Node.js

function Get-NodeExe {
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $std = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $std) { return $std }
    return $null
}

function Get-VersioneNode([string]$NodeExe) {
    $v = (& $NodeExe -v).Trim().TrimStart('v')
    return [version]($v -replace '[^0-9.].*$', '')
}

function Update-PathSessione {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

# Installa Node.js LTS (MSI ufficiale, hash verificato con SHASUMS256.txt) se manca o e' troppo vecchio.
function Install-NodeJs([int]$Major, [string]$Msi, [string]$CartellaDownload, [switch]$Forza) {
    $node = Get-NodeExe
    if ($node -and -not $Forza) {
        $ver = Get-VersioneNode $node
        if ($ver -ge [version]'20.9.0') {
            Write-Ok "Node.js $ver gia' installato ($node)"
            if ($ver.Major -lt 22) { Write-Avviso "Consigliato aggiornare a Node.js $Major LTS." }
            return $node
        }
        Write-Avviso "Node.js $ver troppo vecchio (serve 20.9 o successivo): verra' aggiornato."
    }
    if (-not $Msi) {
        Write-Info "Ricerca dell'ultima versione di Node.js $Major LTS su nodejs.org"
        $indice = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
        $rel = $indice | Where-Object { $_.version -like "v$Major.*" -and $_.lts } | Select-Object -First 1
        if (-not $rel) { Stop-Errore "Nessuna versione LTS di Node.js $Major trovata su nodejs.org." }
        $nome = "node-$($rel.version)-x64.msi"
        $somme = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$($rel.version)/SHASUMS256.txt" -UseBasicParsing).Content
        if ($somme -is [byte[]]) { $somme = [Text.Encoding]::ASCII.GetString($somme) }
        $riga = ($somme -split "`n") | Where-Object { $_.Trim().EndsWith("  $nome") } | Select-Object -First 1
        if (-not $riga) { Stop-Errore "Hash di $nome non trovato in SHASUMS256.txt." }
        $comp = @{ Nome = $nome; Url = "https://nodejs.org/dist/$($rel.version)/$nome"; Sha256 = ($riga.Trim() -split '\s+')[0].ToUpper() }
        $Msi = Get-Componente $comp $CartellaDownload
    }
    if (-not (Test-Path $Msi)) { Stop-Errore "File di installazione di Node.js non trovato: $Msi" }
    Write-Info "Installazione di $(Split-Path $Msi -Leaf)"
    $p = Start-Process -FilePath msiexec.exe -ArgumentList @('/i', "`"$Msi`"", '/qn', '/norestart') -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Stop-Errore "Installazione di Node.js non riuscita (msiexec codice $($p.ExitCode))." }
    Update-PathSessione
    $node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (-not (Test-Path $node)) { $node = Get-NodeExe }
    if (-not $node) { Stop-Errore 'Node.js installato ma node.exe non trovato.' }
    Write-Ok "Node.js $(Get-VersioneNode $node) installato ($node)"
    return $node
}

# ------------------------------------------------------- pacchetto applicazione

# Restituisce la cartella con l'applicazione pronta (server.js):
#  - pacchetto gia' compilato: <radice>\app
#  - sorgente: compila con npm (serve Internet per i pacchetti npm) e assembla in <radice>\.pacchetto\app
function Get-AppCompilata([string]$Radice, [string]$NodeExe, [switch]$Ricompila) {
    if (-not $Ricompila) {
        # pacchetto (<radice>\app) oppure script lanciati da C:\EssentiaMES\strumenti (..\app)
        foreach ($pronta in @((Join-Path $Radice 'app'), (Join-Path $PSScriptRoot '..\app'))) {
            if (Test-Path (Join-Path $pronta 'server.js')) {
                $pronta = (Resolve-Path $pronta).Path
                Write-Ok "Applicazione gia' compilata: $pronta"
                return $pronta
            }
        }
    }
    if (-not (Test-Path (Join-Path $Radice 'package.json'))) {
        Stop-Errore "In $Radice non c'e' ne' un pacchetto compilato (cartella app) ne' il sorgente (package.json)."
    }
    $npm = Join-Path (Split-Path $NodeExe) 'npm.cmd'
    if (-not (Test-Path $npm)) { Stop-Errore "npm non trovato accanto a $NodeExe." }
    Push-Location $Radice
    try {
        $env:NEXT_TELEMETRY_DISABLED = '1'
        Write-Info 'npm ci (scarica le dipendenze)...'
        & $npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Stop-Errore "npm ci non riuscito (codice $LASTEXITCODE). Verificare l'accesso a registry.npmjs.org (proxy: npm config set proxy ...)." }
        Write-Info 'npm run build (compilazione Next.js, qualche minuto)...'
        $env:BUILD_STANDALONE = '1'
        & $npm run build
        $codice = $LASTEXITCODE
        Remove-Item Env:\BUILD_STANDALONE -ErrorAction SilentlyContinue
        if ($codice -ne 0) { Stop-Errore "Compilazione non riuscita (codice $codice)." }
    } finally { Pop-Location }
    $dest = Join-Path $Radice '.pacchetto\app'
    New-CartellaApp -Radice $Radice -Destinazione $dest
    return $dest
}

# Assembla l'app eseguibile dall'output "standalone" di Next.js.
function New-CartellaApp([string]$Radice, [string]$Destinazione) {
    $standalone = Join-Path $Radice '.next\standalone'
    if (-not (Test-Path (Join-Path $standalone 'server.js'))) {
        Stop-Errore "Output standalone non trovato ($standalone\server.js): compilare con BUILD_STANDALONE=1."
    }
    Copy-Cartella $standalone $Destinazione -Specchio
    Copy-Cartella (Join-Path $Radice '.next\static') (Join-Path $Destinazione '.next\static') -Specchio
    foreach ($d in @('public', 'templates', 'database', 'scripts')) {
        Copy-Cartella (Join-Path $Radice $d) (Join-Path $Destinazione $d) -Specchio
    }
    # Eventuali file .env copiati dalla build non devono finire in produzione:
    # la configurazione sta in config\essentia.env.
    Get-ChildItem -Path $Destinazione -Filter '.env*' -File -ErrorAction SilentlyContinue | Remove-Item -Force
}

# Cartella "database" (schema.sql, migrazioni) nel sorgente o nel pacchetto.
function Get-CartellaDatabase([string]$Radice) {
    # sorgente o pacchetto: <radice>\database ; installazione: C:\EssentiaMES\strumenti\..\app\database
    $candidati = @((Join-Path $Radice 'database'), (Join-Path $Radice 'app\database'), (Join-Path $PSScriptRoot '..\app\database'))
    foreach ($c in $candidati) {
        if (Test-Path (Join-Path $c 'schema.sql')) { return $c }
    }
    Stop-Errore "File database\schema.sql non trovato in $Radice."
}

# ------------------------------------------------------------------ SQL Server

# Stringa di connessione per System.Data.SqlClient (incluso in Windows).
# Senza utente usa l'autenticazione Windows dell'account che esegue lo script.
function New-Connessione([string]$Server, [string]$Database = 'master', [string]$Utente = '', [string]$Password = '', [int]$Timeout = 15) {
    $b = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $b['Data Source'] = $Server
    $b['Initial Catalog'] = $Database
    if ($Utente) {
        $b['User ID'] = $Utente
        $b['Password'] = $Password
    } else {
        $b['Integrated Security'] = $true
    }
    $b['Connect Timeout'] = $Timeout
    $b['Application Name'] = 'EssentiaMES-Installazione'
    return $b.ConnectionString
}

function Open-Connessione([string]$Connessione) {
    $cn = New-Object System.Data.SqlClient.SqlConnection $Connessione
    $cn.add_InfoMessage({
            param($origine, $evento)
            foreach ($m in $evento.Errors) { if ($m.Message) { Write-Host "         | $($m.Message)" -ForegroundColor DarkGray } }
        })
    $cn.Open()
    return $cn
}

# Esegue T-SQL e restituisce le righe del primo result set (DataRow).
function Invoke-Sql([string]$Connessione, [string]$Sql, [hashtable]$Parametri = @{}, [int]$Timeout = 600) {
    $cn = Open-Connessione $Connessione
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $Sql
        $cmd.CommandTimeout = $Timeout
        foreach ($k in $Parametri.Keys) {
            $v = $Parametri[$k]
            if ($null -eq $v) { $v = [DBNull]::Value }
            [void]$cmd.Parameters.AddWithValue('@' + $k, $v)
        }
        $da = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
        $ds = New-Object System.Data.DataSet
        [void]$da.Fill($ds)
        if ($ds.Tables.Count -eq 0) { return @() }
        return @($ds.Tables[0].Rows)
    } finally {
        $cn.Close()
    }
}

# Valore di una colonna di una riga SQL, con DBNull convertito in $null
# (in PowerShell 5.1 [DBNull]::Value in un "if" risulterebbe vero).
function Get-Campo($Riga, [string]$Colonna) {
    if ($null -eq $Riga) { return $null }
    $v = $Riga[$Colonna]
    if ($v -is [DBNull]) { return $null }
    return $v
}

# Prima riga del risultato (o $null). Evita l'ambiguita' di PowerShell tra
# "una riga" e "un array di righe".
function Get-PrimaRiga([string]$Connessione, [string]$Sql, [hashtable]$Parametri = @{}) {
    return (Invoke-Sql -Connessione $Connessione -Sql $Sql -Parametri $Parametri | Select-Object -First 1)
}

# Attende che SQL Server accetti connessioni (dopo un riavvio servono alcuni secondi).
function Wait-SqlPronto([string]$Connessione, [int]$Secondi = 90) {
    $fine = (Get-Date).AddSeconds($Secondi)
    while ($true) {
        try {
            Invoke-Sql -Connessione $Connessione -Sql 'SELECT 1 AS x' | Out-Null
            return
        } catch {
            if ((Get-Date) -gt $fine) { throw }
            Start-Sleep -Seconds 3
        }
    }
}

# Esegue un file della cartella deploy\windows\sql con i parametri indicati.
function Invoke-SqlModello([string]$Connessione, [string]$Nome, [hashtable]$Parametri = @{}) {
    $testo = [IO.File]::ReadAllText((Join-Path $PSScriptRoot "sql\$Nome"), [Text.Encoding]::UTF8)
    return Invoke-Sql -Connessione $Connessione -Sql $testo -Parametri $Parametri
}

# Esegue uno script .sql diviso in batch dalle righe "GO" (come SSMS), su una sola connessione.
function Invoke-SqlFile([string]$Connessione, [string]$Percorso) {
    $testo = [IO.File]::ReadAllText($Percorso, [Text.Encoding]::UTF8)
    $opzioni = [Text.RegularExpressions.RegexOptions]::Multiline -bor [Text.RegularExpressions.RegexOptions]::IgnoreCase
    $batch = [regex]::Split($testo, '^\s*GO\s*;?\s*$', $opzioni)
    $cn = Open-Connessione $Connessione
    try {
        foreach ($b in $batch) {
            if ([string]::IsNullOrWhiteSpace($b)) { continue }
            $cmd = $cn.CreateCommand()
            $cmd.CommandText = $b
            $cmd.CommandTimeout = 0
            [void]$cmd.ExecuteNonQuery()
        }
    } finally {
        $cn.Close()
    }
}

# Applica database\schema.sql (idempotente) ed eventualmente le migrazioni.
function Update-Schema([string]$Connessione, [string]$CartellaDatabase, [switch]$Migrazioni) {
    Write-Info 'schema.sql'
    Invoke-SqlFile -Connessione $Connessione -Percorso (Join-Path $CartellaDatabase 'schema.sql')
    if ($Migrazioni) {
        foreach ($f in (Get-ChildItem (Join-Path $CartellaDatabase 'migrazioni') -Filter '*.sql' | Sort-Object Name)) {
            Write-Info "migrazioni\$($f.Name)"
            Invoke-SqlFile -Connessione $Connessione -Percorso $f.FullName
        }
    }
}

# Nome di database ammesso negli script (evita problemi di quoting).
function Assert-NomeDatabase([string]$Nome) {
    if ($Nome -notmatch '^[A-Za-z0-9_][A-Za-z0-9_\-]{0,99}$') {
        Stop-Errore "Nome database non valido: '$Nome' (ammessi lettere, numeri, _ e -)."
    }
}

# Percorso su un SQL Server (anche remoto): niente Join-Path, che in PowerShell 5.1
# fallisce se l'unita' (es. D:) non esiste su questo computer.
function Join-PercorsoServer([string]$Cartella, [string]$File) {
    return ($Cartella.TrimEnd('\', '/') + '\' + $File)
}

function Format-LetteraleSql([string]$Testo) { return "N'" + $Testo.Replace("'", "''") + "'" }

# Istanze SQL Server installate su questo computer (dal registro).
function Get-IstanzeSqlLocali {
    $k = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if (-not (Test-Path $k)) { return @() }
    $chiave = Get-Item $k
    $out = @()
    foreach ($nome in $chiave.GetValueNames()) {
        $id = $chiave.GetValue($nome)
        $servizio = 'MSSQLSERVER'
        if ($nome -ne 'MSSQLSERVER') { $servizio = 'MSSQL$' + $nome }
        $out += [pscustomobject]@{
            Nome     = $nome
            Id       = $id
            Servizio = $servizio
            Chiave   = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$id\MSSQLServer"
        }
    }
    return $out
}

# Nome da usare per collegarsi a un'istanza locale: "." oppure ".\ISTANZA".
function Get-NomeConnessioneLocale($Istanza) {
    if ($Istanza.Nome -eq 'MSSQLSERVER') { return '.' }
    return ".\$($Istanza.Nome)"
}

# Il server indicato e' questo computer?
function Test-ServerLocale([string]$Server) {
    $h = ($Server -replace '^(tcp|np|lpc):', '') -replace '[\\,].*$', ''
    return ($h -in @('.', '(local)', 'localhost', '127.0.0.1', '::1', $env:COMPUTERNAME))
}

# Prova la connessione TCP (senza dipendere da ping/ICMP).
function Test-PortaTcp([string]$NomeHost, [int]$Porta, [int]$TimeoutMs = 3000) {
    $c = New-Object Net.Sockets.TcpClient
    try {
        $t = $c.BeginConnect($NomeHost, $Porta, $null, $null)
        if (-not $t.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
        $c.EndConnect($t)
        return $true
    } catch {
        return $false
    } finally {
        $c.Close()
    }
}

function Get-IndirizziIPv4 {
    try {
        return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
                Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
                Select-Object -ExpandProperty IPAddress)
    } catch { return @() }
}

# --------------------------------------------------------------- servizio e rete

function Wait-Health([int]$Porta, [int]$Secondi = 90) {
    $fine = (Get-Date).AddSeconds($Secondi)
    $ultimo = ''
    while ((Get-Date) -lt $fine) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Porta/api/health" -UseBasicParsing -TimeoutSec 10
            return [pscustomobject]@{ Ok = $true; Stato = [int]$r.StatusCode; Testo = $r.Content }
        } catch {
            $resp = $_.Exception.Response
            if ($resp) {
                $stato = [int]$resp.StatusCode
                $ultimo = "HTTP $stato"
                # 503 = applicazione avviata ma database non raggiungibile
                if ($stato -eq 503) {
                    $sr = New-Object IO.StreamReader($resp.GetResponseStream())
                    return [pscustomobject]@{ Ok = $false; Stato = 503; Testo = $sr.ReadToEnd() }
                }
            } else {
                $ultimo = $_.Exception.Message
            }
        }
        Start-Sleep -Seconds 3
    }
    return [pscustomobject]@{ Ok = $false; Stato = 0; Testo = $ultimo }
}

function Set-RegolaFirewall([string]$Nome, [int]$Porta, [string[]]$RemoteAddress = @('Any')) {
    Get-NetFirewallRule -DisplayName $Nome -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $Nome -Direction Inbound -Protocol TCP -LocalPort $Porta `
        -RemoteAddress $RemoteAddress -Action Allow -Profile Any | Out-Null
}

# ------------------------------------------------------ servizio Windows (WinSW)

# Percorsi dell'installazione.
function Get-PercorsiInstallazione([string]$Cartella) {
    return [pscustomobject]@{
        Radice    = $Cartella
        App       = Join-Path $Cartella 'app'
        Config    = Join-Path $Cartella 'config'
        FileEnv   = Join-Path $Cartella 'config\essentia.env'
        Dati      = Join-Path $Cartella 'data'
        Upload    = Join-Path $Cartella 'data\upload_documenti'
        Log       = Join-Path $Cartella 'logs'
        Servizio  = Join-Path $Cartella 'servizio'
        Download  = Join-Path $Cartella 'download'
        Strumenti = Join-Path $Cartella 'strumenti'
        Backup    = Join-Path $Cartella 'backup'
    }
}

function Get-AccountServizio([string]$NomeServizio, [string]$UtenteServizio) {
    if ($UtenteServizio) { return $UtenteServizio }
    return "NT SERVICE\$NomeServizio"
}

function Invoke-Icacls([string[]]$Argomenti) {
    & icacls.exe @Argomenti | Out-Null
    $codice = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($codice -ne 0) { Stop-Errore ("icacls non riuscito ({0}): {1}" -f $codice, ($Argomenti -join ' ')) }
}

# Permessi minimi per l'account del servizio: lettura dell'app, scrittura solo su dati e log,
# configurazione (contiene password) leggibile solo da amministratori, SYSTEM e servizio.
function Set-PermessiInstallazione($Percorsi, [string]$Account) {
    foreach ($d in @($Percorsi.Dati, $Percorsi.Upload, $Percorsi.Log, $Percorsi.Config, (Join-Path $Percorsi.App '.next\cache'))) {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
    }
    Invoke-Icacls @($Percorsi.Radice, '/grant', "${Account}:(OI)(CI)RX")
    Invoke-Icacls @($Percorsi.Dati, '/grant', "${Account}:(OI)(CI)M")
    Invoke-Icacls @($Percorsi.Log, '/grant', "${Account}:(OI)(CI)M")
    Invoke-Icacls @((Join-Path $Percorsi.App '.next\cache'), '/grant', "${Account}:(OI)(CI)M")
    Invoke-Icacls @($Percorsi.Config, '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', "${Account}:(OI)(CI)R")
}

function Get-XmlEscape([string]$Testo) { return [Security.SecurityElement]::Escape($Testo) }

# File XML di WinSW: node.exe --env-file=<config> server.js, riavvio automatico, log a rotazione.
function New-XmlServizio([string]$NomeServizio, [string]$NodeExe, $Percorsi, [string]$Utente = '', [string]$Password = '') {
    $account = ''
    if ($Utente) {
        $dominio = '.'
        $nome = $Utente
        if ($Utente.Contains('\')) { $dominio, $nome = $Utente.Split('\', 2) }
        $account = @"
  <serviceaccount>
    <domain>$(Get-XmlEscape $dominio)</domain>
    <user>$(Get-XmlEscape $nome)</user>
    <password>$(Get-XmlEscape $Password)</password>
    <allowservicelogon>true</allowservicelogon>
  </serviceaccount>
"@
    }
    return @"
<!-- EssentiaMES: servizio Windows generato da installa-app.ps1 (WinSW 2.12). -->
<service>
  <id>$(Get-XmlEscape $NomeServizio)</id>
  <name>$(Get-XmlEscape $NomeServizio)</name>
  <description>EssentiaMES - gestione produzione e magazzino (Next.js su Node.js)</description>
  <executable>$(Get-XmlEscape $NodeExe)</executable>
  <arguments>--env-file="$(Get-XmlEscape $Percorsi.FileEnv)" server.js</arguments>
  <workingdirectory>$(Get-XmlEscape $Percorsi.App)</workingdirectory>
  <startmode>Automatic</startmode>
  <delayedAutoStart/>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <onfailure action="restart" delay="60 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>20 sec</stoptimeout>
  <logpath>$(Get-XmlEscape $Percorsi.Log)</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
$account</service>
"@
}

function Get-ServizioEsistente([string]$NomeServizio) {
    return Get-Service -Name $NomeServizio -ErrorAction SilentlyContinue
}

function Stop-ServizioApp([string]$NomeServizio) {
    $s = Get-ServizioEsistente $NomeServizio
    if ($s -and $s.Status -ne 'Stopped') {
        Stop-Service -Name $NomeServizio -Force
        $s.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
    }
}

# Rimuove il servizio (se esiste) e attende che Windows lo cancelli davvero.
function Remove-ServizioApp([string]$NomeServizio, [string]$CartellaServizio) {
    $s = Get-ServizioEsistente $NomeServizio
    if (-not $s) { return }
    Stop-ServizioApp $NomeServizio
    $exe = Join-Path $CartellaServizio "$NomeServizio.exe"
    if (Test-Path $exe) { & $exe uninstall | Out-Null } else { & sc.exe delete $NomeServizio | Out-Null }
    $global:LASTEXITCODE = 0
    for ($i = 0; $i -lt 30 -and (Get-ServizioEsistente $NomeServizio); $i++) { Start-Sleep -Seconds 1 }
    if (Get-ServizioEsistente $NomeServizio) { Stop-Errore "Il servizio $NomeServizio non e' stato rimosso (chiudere la console Servizi e riprovare)." }
}
