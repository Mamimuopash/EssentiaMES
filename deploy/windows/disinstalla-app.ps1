<#
.SYNOPSIS
    Rimuove il servizio EssentiaMES (e, a richiesta, il sito IIS e tutti i file).

.DESCRIPTION
    Per impostazione predefinita conserva configurazione (config), documenti (data) e log,
    cosi' una reinstallazione riparte dagli stessi dati. Il database NON viene toccato.

.EXAMPLE
    .\disinstalla-app.ps1 -RimuoviIIS
#>
[CmdletBinding()]
param(
    [string]$CartellaInstallazione = 'C:\EssentiaMES',
    [string]$NomeServizio = 'EssentiaMES',
    # Rimuove anche il sito e il pool IIS "EssentiaMES".
    [switch]$RimuoviIIS,
    # Cancella anche configurazione, documenti caricati e log.
    [switch]$RimuoviTutto,
    [switch]$NonInterattivo
)

. (Join-Path $PSScriptRoot '_comune.ps1')

try {
    Write-Host 'EssentiaMES - disinstallazione' -ForegroundColor White
    Assert-Amministratore
    $P = Get-PercorsiInstallazione $CartellaInstallazione
    $msg = 'Rimuovere il servizio EssentiaMES?'
    if ($RimuoviTutto) { $msg = 'Rimuovere EssentiaMES INCLUSI configurazione e documenti caricati?' }
    if (-not (Read-SiNo $msg $true)) { Write-Info 'Annullato.'; exit 0 }

    Write-Passo 'Servizio'
    Remove-ServizioApp $NomeServizio $P.Servizio
    Write-Ok 'Servizio rimosso'

    Write-Passo 'Firewall'
    Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'EssentiaMES (TCP *' -or $_.DisplayName -like 'EssentiaMES - IIS*' } | Remove-NetFirewallRule
    Write-Ok 'Regole dell''applicazione rimosse (le regole di SQL Server restano)'

    if ($RimuoviIIS) {
        Write-Passo 'IIS'
        Import-Module WebAdministration -ErrorAction SilentlyContinue
        if (Get-Command Get-Website -ErrorAction SilentlyContinue) {
            if (Get-Website -Name $NomeServizio -ErrorAction SilentlyContinue) {
                $https = Get-WebBinding -Name $NomeServizio -Protocol https -ErrorAction SilentlyContinue
                foreach ($b in @($https)) { if ($b) { try { $b.RemoveSslCertificate() } catch { } } }
                Remove-Website -Name $NomeServizio
            }
            if (Test-Path "IIS:\AppPools\$NomeServizio") { Remove-WebAppPool -Name $NomeServizio }
            Write-Ok 'Sito e pool IIS rimossi (i moduli URL Rewrite/ARR restano installati)'
        }
        $iis = Join-Path $P.Radice 'iis'
        if (Test-Path $iis) { Remove-Item $iis -Recurse -Force }
    }

    Write-Passo 'File'
    foreach ($d in @($P.App, $P.Servizio, $P.Download, $P.Backup, "$($P.App).nuova")) {
        if (Test-Path $d) { Remove-Item $d -Recurse -Force }
    }
    if ($RimuoviTutto) {
        foreach ($d in @($P.Config, $P.Dati, $P.Log)) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
        Write-Ok "Rimossi anche configurazione, documenti e log. Restano solo gli strumenti in $($P.Strumenti) (cancellabili a mano)."
    } else {
        Write-Ok "Conservati: $($P.Config), $($P.Dati), $($P.Log)"
    }
    exit 0
} catch {
    Write-ErroreFinale $_
    exit 1
}
