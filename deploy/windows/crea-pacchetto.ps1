<#
.SYNOPSIS
    Crea il pacchetto di installazione per Windows (app gia' compilata + script), da copiare
    su un server anche senza accesso a Internet per npm.

.DESCRIPTION
    Da eseguire su un PC/server Windows con Node.js 20.9+ e accesso a registry.npmjs.org,
    nella cartella del sorgente. Produce:
        dist-windows\EssentiaMES-<versione>\        (cartella pronta)
        dist-windows\EssentiaMES-<versione>.zip
    Sul server: estrarre lo zip ed eseguire deploy\windows\INSTALLA.cmd come amministratore.
    Lo stesso pacchetto viene prodotto automaticamente da GitHub Actions (workflow "Windows").

.EXAMPLE
    .\deploy\windows\crea-pacchetto.ps1
#>
[CmdletBinding()]
param(
    [string]$Uscita = '',
    [switch]$SenzaZip
)

. (Join-Path $PSScriptRoot '_comune.ps1')

try {
    Write-Host 'EssentiaMES - creazione del pacchetto Windows' -ForegroundColor White
    if (-not $Uscita) { $Uscita = Join-Path $RadiceProgetto 'dist-windows' }
    $node = Get-NodeExe
    if (-not $node) { Stop-Errore 'Serve Node.js 20.9 o successivo (https://nodejs.org).' }
    Write-Ok "Node.js $(Get-VersioneNode $node)"

    $pkg = Get-Content (Join-Path $RadiceProgetto 'package.json') -Raw | ConvertFrom-Json
    $versione = $pkg.version
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($git) {
        try { $commit = (& git.exe -C $RadiceProgetto rev-parse --short HEAD) } catch { $commit = $null }
        $global:LASTEXITCODE = 0
        if ($commit) { $versione = "$versione-$($commit.Trim())" }
    }
    $nome = "EssentiaMES-$versione"
    $dest = Join-Path $Uscita $nome

    Write-Passo 'Compilazione'
    $app = Get-AppCompilata -Radice $RadiceProgetto -NodeExe $node -Ricompila

    Write-Passo "Assemblaggio in $dest"
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Cartella $app (Join-Path $dest 'app') -Specchio
    Copy-Cartella (Join-Path $RadiceProgetto 'database') (Join-Path $dest 'database') -Specchio
    Copy-Cartella $PSScriptRoot (Join-Path $dest 'deploy\windows') -Specchio -Escludi @('download')
    # WinSW incluso nel pacchetto (licenza MIT): il servizio si installa anche senza Internet.
    Get-Componente $Componenti.WinSW (Join-Path $dest 'deploy\windows\download') @((Join-Path $PSScriptRoot 'download')) | Out-Null
    Copy-Item (Join-Path $RadiceProgetto '.env.example') (Join-Path $dest 'env.example.txt')
    $leggimi = @"
EssentiaMES $versione - pacchetto di installazione per Windows Server 2016 o successivo
==================================================================================

1. Sul server SQL (se l'app non e' sullo stesso computer):
     deploy\windows\PREPARA-SQL-SERVER.cmd   (tasto destro > Esegui come amministratore)
2. Solo se il database va spostato su un nuovo SQL Server:
     deploy\windows\PORTING-DATABASE.cmd
3. Sul server dell'applicazione:
     deploy\windows\INSTALLA.cmd
4. Controllo:
     C:\EssentiaMES\strumenti\VERIFICA.cmd

Guida completa: deploy\windows\README.md
"@
    Write-FileUtf8 (Join-Path $dest 'LEGGIMI.txt') ($leggimi -replace "`r?`n", "`r`n")
    Write-Ok 'Pacchetto pronto'

    if (-not $SenzaZip) {
        $zip = "$dest.zip"
        if (Test-Path $zip) { Remove-Item $zip -Force }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::CreateFromDirectory($dest, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
        Write-Ok ("{0} ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
    }
    exit 0
} catch {
    Write-ErroreFinale $_
    exit 1
}
