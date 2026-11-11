<#
.SYNOPSIS
    Pubblica EssentiaMES tramite IIS (reverse proxy verso il servizio Node.js), con HTTPS.

.DESCRIPTION
    1. Installa il ruolo IIS (se manca), URL Rewrite 2.1 e Application Request Routing 3.0
       (MSI ufficiali Microsoft, hash verificato).
    2. Abilita il proxy di ARR (mantenendo l'host originale, timeout 5 minuti).
    3. Crea il sito IIS "EssentiaMES" (cartella C:\EssentiaMES\iis con il solo web.config)
       che inoltra tutte le richieste a http://127.0.0.1:<PortaApp>.
    4. HTTPS con un certificato esistente (-CertificatoThumbprint) o autofirmato
       (-CertificatoAutofirmato); l'HTTP viene reindirizzato su HTTPS.

    Utile quando sul server c'e' gia' IIS (es. il vecchio software ASP.NET) o serve HTTPS.
    Di solito si lancia tramite installa-app.ps1 -ConIIS.

.EXAMPLE
    .\configura-iis.ps1 -NomeHost essentia.azienda.local -CertificatoAutofirmato -FermaSito Brighetti
#>
[CmdletBinding()]
param(
    # Nome con cui gli utenti raggiungono il sito (vuoto = qualsiasi nome/indirizzo del server).
    [string]$NomeHost = '',
    [int]$PortaApp = 3000,
    [int]$PortaHttp = 80,
    [int]$PortaHttps = 443,
    # Impronta (thumbprint) di un certificato in Computer locale > Personale.
    [string]$CertificatoThumbprint = '',
    # Crea un certificato autofirmato (i browser mostreranno un avviso finche' non viene considerato attendibile).
    [switch]$CertificatoAutofirmato,
    # Solo HTTP (sconsigliato: password in chiaro sulla rete).
    [switch]$SoloHttp,
    [string]$NomeSito = 'EssentiaMES',
    [string]$CartellaSito = 'C:\EssentiaMES\iis',
    # Sito IIS da fermare (es. quello del vecchio software, se usa le stesse porte).
    [string]$FermaSito = '',
    [switch]$NonInterattivo
)

. (Join-Path $PSScriptRoot '_comune.ps1')
$registroProprio = -not (Get-Variable -Name registro -Scope 1 -ErrorAction SilentlyContinue)
if ($registroProprio) { $registro = Start-Registro 'configura-iis' }

function Invoke-AppCmd([string[]]$Argomenti) {
    $appcmd = Join-Path $env:windir 'system32\inetsrv\appcmd.exe'
    $out = & $appcmd @Argomenti | Out-String
    $codice = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($codice -ne 0) { Stop-Errore ("appcmd {0}: {1}" -f ($Argomenti -join ' '), $out.Trim()) }
    return $out
}

function Install-Msi([string]$Percorso) {
    $p = Start-Process -FilePath msiexec.exe -ArgumentList @('/i', "`"$Percorso`"", '/qn', '/norestart') -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Stop-Errore "Installazione di $(Split-Path $Percorso -Leaf) non riuscita (msiexec codice $($p.ExitCode))." }
}

# Prova una richiesta al sito impostando l'intestazione Host (anche con certificato autofirmato).
function Test-Sito([string]$Url, [string]$HostHeader) {
    $req = [Net.HttpWebRequest]::Create($Url)
    if ($HostHeader) { $req.Host = $HostHeader }
    $req.Timeout = 30000
    $req.AllowAutoRedirect = $false
    $precedente = [Net.ServicePointManager]::ServerCertificateValidationCallback
    [Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    try {
        $resp = $req.GetResponse()
        $codice = [int]$resp.StatusCode
        $resp.Close()
        return $codice
    } catch [Net.WebException] {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return "errore: $($_.Exception.Message)"
    } finally {
        [Net.ServicePointManager]::ServerCertificateValidationCallback = $precedente
    }
}

try {
    Write-Host 'EssentiaMES - pubblicazione tramite IIS' -ForegroundColor White
    Assert-Amministratore
    $download = Join-Path (Split-Path $CartellaSito) 'download'
    $usaHttps = -not $SoloHttp

    # ------------------------------------------------------------- ruolo IIS
    Write-Passo 'Ruolo IIS'
    $funzioni = @('Web-Server', 'Web-Mgmt-Console', 'Web-Scripting-Tools')
    $mancanti = @(Get-WindowsFeature -Name $funzioni | Where-Object { -not $_.Installed } | ForEach-Object { $_.Name })
    if ($mancanti.Count -gt 0) {
        Write-Info ("Installazione: {0}" -f ($mancanti -join ', '))
        $r = Install-WindowsFeature -Name $mancanti
        if (-not $r.Success) { Stop-Errore 'Installazione del ruolo IIS non riuscita.' }
    }
    Import-Module WebAdministration
    Write-Ok 'IIS presente'

    # ----------------------------------------------------- moduli URL Rewrite / ARR
    Write-Passo 'Moduli URL Rewrite e Application Request Routing'
    $moduli = @(Get-WebGlobalModule | ForEach-Object { $_.Name })
    if ($moduli -notcontains 'RewriteModule') {
        Install-Msi (Get-Componente $Componenti.UrlRewrite $download @((Join-Path $PSScriptRoot 'download')))
        Write-Ok 'URL Rewrite 2.1 installato'
    } else { Write-Ok 'URL Rewrite gia'' presente' }
    if ($moduli -notcontains 'ApplicationRequestRouting') {
        Install-Msi (Get-Componente $Componenti.Arr $download @((Join-Path $PSScriptRoot 'download')))
        Write-Ok 'Application Request Routing 3.0 installato'
    } else { Write-Ok 'Application Request Routing gia'' presente' }

    # --------------------------------------------------------- proxy di ARR
    Write-Passo 'Proxy di ARR'
    # includePortInXForwardedFor=False: l'app riceve l'IP del client senza porta (limite tentativi di login).
    Invoke-AppCmd @('set', 'config', '-section:system.webServer/proxy', '/enabled:True', '/preserveHostHeader:True',
        '/reverseRewriteHostInResponseHeaders:False', '/includePortInXForwardedFor:False', '/timeout:00:05:00', '/commit:apphost') | Out-Null
    $consentite = Invoke-AppCmd @('list', 'config', '-section:system.webServer/rewrite/allowedServerVariables')
    foreach ($v in @('HTTP_X_FORWARDED_PROTO', 'HTTP_X_FORWARDED_HOST')) {
        if ($consentite -notmatch [regex]::Escape("name=`"$v`"")) {
            Invoke-AppCmd @('set', 'config', '-section:system.webServer/rewrite/allowedServerVariables', "/+[name='$v']", '/commit:apphost') | Out-Null
        }
    }
    Write-Ok 'Proxy abilitato (host originale mantenuto, timeout 5 minuti)'

    # --------------------------------------------------- sito e web.config
    Write-Passo "Sito IIS $NomeSito"
    New-Item -ItemType Directory -Force -Path $CartellaSito | Out-Null
    $proto = 'http'
    if ($usaHttps) { $proto = 'https' }
    $redirect = ''
    if ($usaHttps) {
        $redirect = @'
        <rule name="EssentiaMES-https" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}{UNENCODED_URL}" appendQueryString="false" redirectType="Permanent" />
        </rule>
'@
    }
    $webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<!-- EssentiaMES: IIS inoltra tutte le richieste al servizio Node.js. Generato da configura-iis.ps1. -->
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
$redirect        <rule name="EssentiaMES-proxy" stopProcessing="true">
          <match url="(.*)" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="$proto" />
            <set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" />
          </serverVariables>
          <action type="Rewrite" url="http://127.0.0.1:$PortaApp{UNENCODED_URL}" appendQueryString="false" />
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering allowDoubleEscaping="true">
        <!-- allegati fino a 100 MB (l'app accetta MAX_UPLOAD_MB, predefinito 50) -->
        <requestLimits maxAllowedContentLength="104857600" />
      </requestFiltering>
    </security>
    <httpErrors existingResponse="PassThrough" />
  </system.webServer>
</configuration>
"@
    Write-FileUtf8 (Join-Path $CartellaSito 'web.config') $webConfig

    if ($FermaSito) {
        $vecchio = Get-Website -Name $FermaSito -ErrorAction SilentlyContinue
        if ($vecchio) {
            Stop-Website -Name $FermaSito
            Set-ItemProperty "IIS:\Sites\$FermaSito" -Name serverAutoStart -Value $false
            Write-Ok "Sito '$FermaSito' fermato (non si riavvia da solo; i file restano dove sono)"
        } else {
            Write-Avviso "Sito '$FermaSito' non trovato."
        }
    }

    $pool = 'EssentiaMES'
    if (-not (Test-Path "IIS:\AppPools\$pool")) { New-WebAppPool -Name $pool | Out-Null }
    Set-ItemProperty "IIS:\AppPools\$pool" -Name managedRuntimeVersion -Value ''
    Set-ItemProperty "IIS:\AppPools\$pool" -Name startMode -Value 'AlwaysRunning'
    if (Get-Website -Name $NomeSito -ErrorAction SilentlyContinue) { Remove-Website -Name $NomeSito }
    # Id esplicito: New-Website senza -Id fallisce se in IIS non c'e' nessun sito.
    $id = 1 + (@(Get-Website | ForEach-Object { [int]$_.id }) + @(0) | Measure-Object -Maximum).Maximum
    New-Website -Name $NomeSito -Id $id -PhysicalPath $CartellaSito -ApplicationPool $pool -Port $PortaHttp -HostHeader $NomeHost | Out-Null

    # Le stesse porte e lo stesso nome non possono essere usati da due siti avviati.
    $conflitti = @(Get-Website | Where-Object { $_.Name -ne $NomeSito -and $_.State -eq 'Started' } | Where-Object {
            $altro = $_
            @($altro.Bindings.Collection) | Where-Object {
                $parti = $_.bindingInformation.Split(':')
                ($parti[1] -eq "$PortaHttp" -or ($usaHttps -and $parti[1] -eq "$PortaHttps")) -and $parti[2] -eq $NomeHost
            }
        })
    if ($conflitti.Count -gt 0) {
        $nomi = ($conflitti | ForEach-Object { $_.Name }) -join ', '
        Stop-Errore ("Il sito '{0}' usa gia' le stesse porte/nome host. Indicare -NomeHost (es. essentia.azienda.local) oppure -FermaSito '{0}'." -f $nomi)
    }

    # ------------------------------------------------------------ HTTPS
    if ($usaHttps) {
        Write-Passo 'HTTPS'
        $cert = $null
        if ($CertificatoThumbprint) {
            $impronta = ($CertificatoThumbprint -replace '[^0-9A-Fa-f]', '').ToUpper()
            $cert = Get-Item "Cert:\LocalMachine\My\$impronta" -ErrorAction SilentlyContinue
            if (-not $cert) { Stop-Errore "Certificato $impronta non trovato in Computer locale > Personale." }
        } elseif ($CertificatoAutofirmato -or (Read-SiNo 'Nessun certificato indicato: crearne uno autofirmato?' $true)) {
            $dns = @($NomeHost, $env:COMPUTERNAME) | Where-Object { $_ } | Select-Object -Unique
            $cert = New-SelfSignedCertificate -DnsName $dns -CertStoreLocation 'Cert:\LocalMachine\My' `
                -FriendlyName 'EssentiaMES (autofirmato)' -NotAfter (Get-Date).AddYears(5)
            Write-Ok "Certificato autofirmato creato ($($cert.Thumbprint)) per: $($dns -join ', ')"
            Write-Info 'Per evitare l''avviso del browser: esportarlo e importarlo tra le "Autorita'' di certificazione'
            Write-Info 'radice attendibili" dei client (anche via criteri di gruppo), oppure usare un certificato aziendale.'
        } else {
            Stop-Errore 'Serve un certificato per HTTPS: -CertificatoThumbprint, -CertificatoAutofirmato oppure -SoloHttp.'
        }
        $sni = 0
        if ($NomeHost) { $sni = 1 }
        New-WebBinding -Name $NomeSito -Protocol https -Port $PortaHttps -HostHeader $NomeHost -SslFlags $sni
        $binding = Get-WebBinding -Name $NomeSito -Protocol https -Port $PortaHttps -HostHeader $NomeHost
        $binding.AddSslCertificate($cert.Thumbprint, 'My')
        Write-Ok "HTTPS sulla porta $PortaHttps"
    }

    Start-Website -Name $NomeSito
    Write-Ok ("Sito avviato: {0}://{1}" -f $proto, $(if ($NomeHost) { $NomeHost } else { $env:COMPUTERNAME }))

    # ---------------------------------------------------------- firewall
    Set-RegolaFirewall -Nome 'EssentiaMES - IIS HTTP' -Porta $PortaHttp
    if ($usaHttps) { Set-RegolaFirewall -Nome 'EssentiaMES - IIS HTTPS' -Porta $PortaHttps }

    # ------------------------------------------------------------- prova
    Write-Passo 'Verifica'
    $portaProva = $PortaHttp
    if ($usaHttps) { $portaProva = $PortaHttps }
    $nomeProva = 'localhost'
    $risolto = $true
    if ($NomeHost) {
        # Con HTTPS legato al nome (SNI) la prova va fatta usando il nome, non 127.0.0.1.
        $nomeProva = $NomeHost
        try { [void][Net.Dns]::GetHostAddresses($NomeHost) } catch { $risolto = $false }
    }
    if ($risolto) {
        $esito = Test-Sito ("{0}://{1}:{2}/api/health" -f $proto, $nomeProva, $portaProva) ''
        if ($esito -eq 200) { Write-Ok "IIS -> EssentiaMES: ${proto}://${nomeProva}/api/health risponde 200" }
        elseif ($esito -eq 503) { Write-Avviso 'IIS raggiunge l''app ma il database non risponde (503).' }
        else { Write-Avviso "Risposta inattesa da IIS: $esito (il servizio EssentiaMES e' avviato?)" }
    } else {
        Write-Avviso "Il nome $NomeHost non e' ancora risolto dal DNS: prova completa rimandata."
    }
    if ($usaHttps) {
        $rinvio = Test-Sito "http://127.0.0.1:$PortaHttp/" $NomeHost
        if ($rinvio -eq 301) { Write-Ok 'HTTP reindirizzato su HTTPS' } else { Write-Avviso "Reindirizzamento HTTP->HTTPS: risposta $rinvio" }
    }
    Write-Info 'Se il nome host non e'' ancora nel DNS aziendale, aggiungerlo (record A verso questo server).'

    if ($registroProprio) { Stop-Registro }
    exit 0
} catch {
    Write-ErroreFinale $_
    if ($registroProprio) { Stop-Registro }
    exit 1
}
