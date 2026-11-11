# EssentiaMES su Windows Server 2016

Guida passo passo per installare EssentiaMES su **Windows Server 2016** (vale anche per
2019/2022/2025), collegato al **SQL Server** che oggi gestite con SSMS, oppure dopo aver
**spostato il database** su un nuovo SQL Server.

Tutto è automatizzato da script PowerShell in questa cartella, con un file `.cmd` da
lanciare con doppio clic per ciascuno (chiedono da soli i permessi di amministratore):

| File | Dove si esegue | Cosa fa |
| --- | --- | --- |
| `PREPARA-SQL-SERVER.cmd` | sul server **SQL Server** | TCP/IP su porta fissa, autenticazione mista, firewall, login dedicato all'app, aggiornamento schema con backup |
| `PORTING-DATABASE.cmd` | sul **nuovo** server SQL | copia il database dal vecchio SQL Server (backup + ripristino + verifica) |
| `INSTALLA.cmd` | sul server dell'**applicazione** | Node.js, app, configurazione, servizio Windows, firewall o IIS/HTTPS |
| `VERIFICA.cmd` | sul server dell'applicazione | diagnostica completa (servizio, configurazione, database, IIS, log) |
| `AGGIORNA.cmd` | dalla cartella della nuova versione | aggiornamento con ritorno automatico alla versione precedente |
| `DISINSTALLA.cmd` | sul server dell'applicazione | rimuove il servizio (conserva configurazione e documenti) |

---

## Indice

1. [Scegliere lo scenario](#1-scegliere-lo-scenario)
2. [Requisiti](#2-requisiti)
3. [Ottenere il pacchetto](#3-ottenere-il-pacchetto)
4. [Passo 1 – Preparare SQL Server](#4-passo-1--preparare-sql-server)
5. [Passo 2 – Porting del database (solo scenario B)](#5-passo-2--porting-del-database-solo-scenario-b)
6. [Passo 3 – Installare l'applicazione](#6-passo-3--installare-lapplicazione)
7. [Passo 4 – Verifica e collaudo](#7-passo-4--verifica-e-collaudo)
8. [Passaggio dal vecchio software (go-live)](#8-passaggio-dal-vecchio-software-go-live)
9. [Server fuori dall'azienda](#9-server-fuori-dallazienda)
10. [Configurazione](#10-configurazione)
11. [Aggiornamenti, backup, disinstallazione](#11-aggiornamenti-backup-disinstallazione)
12. [Risoluzione dei problemi](#12-risoluzione-dei-problemi)
13. [Come sono stati provati gli script](#13-come-sono-stati-provati-gli-script)

---

## 1. Scegliere lo scenario

| | Scenario | Quando | Passi |
| --- | --- | --- | --- |
| **A** | **Collegamento diretto** al SQL Server esistente | Il server 2016 raggiunge il SQL Server attuale (stesso computer o rete aziendale) | 1 → 3 → 4 |
| **B** | **Porting**: il database si sposta su un nuovo SQL Server sul server 2016 | Si vuole dismettere il vecchio server SQL o tenere tutto sul nuovo server | installare SQL Server → 1 → 2 → 3 → 4 |
| **C** | Server 2016 **fuori dall'azienda** (hosting/cloud) | Come A, attraverso una VPN (o come B, se il database va in hosting) | §9, poi come A o B |

**Consigliato: A.** C'è un solo database, nessuna copia da tenere allineata e SSMS continua
a lavorare dove ha sempre lavorato. Il porting (B) ha senso se il vecchio server va dismesso.
In quel caso **tutti** i programmi che scrivono nel database (raccolta dati macchine,
export Mexal) vanno ripuntati sul nuovo server.

```
 Scenario A                                     Scenario B
 ┌───────────────────────┐   TCP 1433            ┌────────────────────────────────────┐
 │ Windows Server 2016   │ ───────────────▶ SQL  │ Windows Server 2016                │
 │ servizio EssentiaMES  │   (rete aziendale)    │ servizio EssentiaMES ──▶ SQL Server │
 │ (+ IIS per HTTPS)     │                Server │ (+ IIS per HTTPS)        2022       │
 └───────────────────────┘              esistente└────────────────────────────────────┘
                                                      ▲ backup + ripristino (una volta)
                                                      └── vecchio SQL Server
```

## 2. Requisiti

**Server dell'applicazione**
- Windows Server 2016 con gli aggiornamenti di Windows installati, account **amministratore**.
- 4 GB di RAM (8 GB se si compila il sorgente sul server), 2 GB di disco più i documenti.
- Accesso a Internet durante l'installazione verso `nodejs.org` (Node.js), `github.com`
  (WinSW, già incluso nel pacchetto) e `download.microsoft.com` (solo con IIS).
  Senza Internet: vedi [installazione offline](#installazione-senza-internet).

**SQL Server**
- Collegamento diretto (A): SQL Server **2012 o successivo**. Il livello di compatibilità
  del database deve essere almeno 110: `schema.sql` lo alza da solo se serve.
- Porting (B): sul server 2016 si possono installare **SQL Server 2017, 2019 o 2022**
  (anche Express). **SQL Server 2025 non è supportato su Windows Server 2016.**
  SQL Server **Express** ha un limite di **10 GB** per database: lo script di porting lo controlla.
- SSMS non è necessario per l'installazione, ma resta lo strumento per consultare i dati.

## 3. Ottenere il pacchetto

Il pacchetto contiene l'app già compilata, gli script e WinSW: sul server **non** servono
npm né accesso a registry.npmjs.org.

1. **Da GitHub** (consigliato): pagina del repository → **Actions** → workflow **Windows**
   → ultima esecuzione con la spunta verde → sezione **Artifacts** → `EssentiaMES-windows`.
   Il workflow prova anche l'intera installazione su un Windows Server con SQL Server
   ([§13](#13-come-sono-stati-provati-gli-script)).
2. **Da un PC Windows** con Node.js 20.9+ e il sorgente:
   `powershell -ExecutionPolicy Bypass -File deploy\windows\crea-pacchetto.ps1`
   → `dist-windows\EssentiaMES-<versione>.zip`.
3. **Dal sorgente direttamente sul server** (`git clone`): `INSTALLA.cmd` compila da solo,
   ma serve accesso a registry.npmjs.org.

Copiare lo zip sul server. Prima di estrarlo: tasto destro → **Proprietà → Sblocca**, così
Windows non segnala gli script come "scaricati da Internet". Estrarlo per esempio in
`C:\Installazione\EssentiaMES-1.0.0`.

```
EssentiaMES-<versione>\
  LEGGIMI.txt
  app\                  applicazione compilata (Next.js standalone)
  database\             schema.sql, migrazioni, script SQL
  deploy\windows\       script di installazione (questa cartella) + download\WinSW
```

## 4. Passo 1 – Preparare SQL Server

**Dove:** sul computer dove gira SQL Server, con un account Windows che sia amministratore
del computer **e** sysadmin di SQL Server (di solito chi ha installato SQL Server).

Doppio clic su `deploy\windows\PREPARA-SQL-SERVER.cmd`, oppure da PowerShell come
amministratore:

```powershell
cd C:\Installazione\EssentiaMES-1.0.0\deploy\windows

# App su un altro server (es. 192.168.1.20): apre la porta solo per quel server
.\prepara-sql-server.ps1 -Database Brighetti -ConsentiDa 192.168.1.20 -AggiornaSchema

# App sullo stesso server di SQL Server: nessuna regola firewall necessaria
.\prepara-sql-server.ps1 -Database Brighetti -AggiornaSchema
```

Cosa fa:
1. Trova l'istanza (es. `SQLEXPRESS`). Con più istanze la chiede, oppure si indica `-Istanza`.
2. Attiva **TCP/IP** su una **porta fissa** (`-Porta`, predefinita 1433). Le istanze
   Express hanno TCP disattivato e porta dinamica: è la causa più comune di "server non trovato".
3. Attiva l'**autenticazione mista** (SQL Server e Windows), necessaria per il login dell'app.
4. Riavvia il servizio SQL Server **solo se** ha cambiato qualcosa: le connessioni si
   interrompono per qualche secondo, quindi meglio farlo fuori dall'orario di lavoro.
5. Crea la regola del firewall per gli indirizzi indicati in `-ConsentiDa`.
6. Con `-AggiornaSchema` fa un **backup di sicurezza** (`<db>_prima-di-essentia_<data>.bak`
   nella cartella di backup di SQL Server) e poi esegue `database\schema.sql`. Lo script
   aggiunge solo tabelle e colonne mancanti e non tocca i dati.
7. Crea il login **`essentia_app`** con permessi di sola lettura/scrittura sui dati (nessun
   permesso di modificare lo schema) e prova ad accedere via TCP.
8. Mostra i dati da usare nel passo 3 (server, porta, database, utente, password).

> La password del login, se non la indicate, viene **generata e mostrata una sola volta**:
> copiatela subito. Non viene salvata nel registro dell'esecuzione.

| Parametro | Predefinito | Note |
| --- | --- | --- |
| `-Istanza` | rilevata | `MSSQLSERVER` = istanza predefinita |
| `-Porta` | 1433 | se occupata da un'altra istanza lo script lo segnala |
| `-Database` | Brighetti | |
| `-LoginApp` / `-PasswordApp` | essentia_app / generata | |
| `-ConsentiDa` | nessuna regola | IP o sottoreti, es. `192.168.1.20`, `192.168.1.0/24` |
| `-AggiornaSchema` `-Migrazioni` | no | backup + `schema.sql` (+ `migrazioni\*.sql`) |
| `-SoloAutenticazioneWindows` | no | niente login SQL: l'app userà un account di dominio (NTLM) |
| `-SenzaRiavvio` | no | applica le modifiche al prossimo riavvio di SQL Server |
| `-AdminSqlUtente` | utente Windows | es. `sa`, se l'utente Windows non è sysadmin |

<details>
<summary>Alternativa manuale (SQL Server Configuration Manager + SSMS)</summary>

1. *SQL Server Configuration Manager → Configurazione di rete SQL Server → Protocolli per
   &lt;istanza&gt;* → **TCP/IP: Abilitato**. In *Proprietà → Indirizzi IP → IPAll* svuotare
   "Porte TCP dinamiche" e scrivere `1433` in "Porta TCP".
2. SSMS → tasto destro sul server → *Proprietà → Sicurezza* → **Autenticazione di SQL
   Server e di Windows**.
3. Riavviare il servizio SQL Server.
4. Firewall di Windows: regola in ingresso TCP 1433 limitata all'IP del server dell'app.
5. SSMS: backup del database, poi aprire ed eseguire `database\schema.sql` sul database.
6. SSMS: aprire `database\utente-sql-applicazione.sql`, sostituire la password ed eseguirlo.
</details>

## 5. Passo 2 – Porting del database (solo scenario B)

**Prima di iniziare**
1. Installare SQL Server sul server 2016: **SQL Server 2022** (Express gratuito fino a
   10 GB, oppure Standard), scaricabile dal sito Microsoft. Non installare la versione 2025,
   che non è supportata su Windows Server 2016.
   Durante l'installazione aggiungere il proprio account come amministratore SQL.
2. Eseguire il **passo 1 sul nuovo server**: crea il login `essentia_app` che il porting
   associa al database copiato.
3. **Fermare il vecchio software** (sito IIS) e tutti i programmi che scrivono nel
   database (raccolta dati macchine, import/export Mexal). Le modifiche fatte dopo il
   backup andrebbero perse.

**Esecuzione** (sul nuovo server, come amministratore):

```powershell
.\porting-database.ps1 -ServerOrigine VECCHIO-SRV\SQLEXPRESS -DatabaseOrigine Brighetti
# porta fissa: -ServerOrigine "192.168.1.10,1433"
# login SQL per il vecchio server: -UtenteOrigine sa (la password viene chiesta)
```

Cosa fa:
1. Controlla le versioni: un backup **non** si ripristina su una versione di SQL Server più
   vecchia. Controlla anche il limite di 10 GB di Express e che il database di destinazione
   non esista già (`-Sovrascrivi` per sostituirlo, dopo averne fatto un backup).
2. **Backup `COPY_ONLY`** sul vecchio server. Non altera la catena dei backup esistente.
3. Copia il `.bak` nella cartella di backup del nuovo SQL Server attraverso la condivisione
   amministrativa `\\VECCHIO-SRV\C$`. Se non è possibile, lo script spiega quale file
   copiare e dove, e si rilancia con `-FileBackup "<percorso sul nuovo server>"`.
   In alternativa: `-CartellaScambio \\nas\backup` (una condivisione accessibile da entrambi i servizi SQL).
4. **Ripristino** con i file nelle cartelle predefinite della nuova istanza, verificando i checksum.
5. **Sistemazione:**
   - il proprietario diventa `sa`;
   - il livello di compatibilità sale ad almeno 110;
   - gli utenti SQL vengono ricollegati ai login con lo stesso nome;
   - il login `essentia_app` viene associato;
   - viene eseguito `schema.sql`.
6. **Verifica**: confronta il numero di righe di ogni tabella tra origine e destinazione.

Opzioni utili: `-DatabaseDestinazione Brighetti_Test` (copia di prova con altro nome),
`-OrigineSolaLettura` (a porting riuscito mette il vecchio database in sola lettura, così
nessuno ci scrive per errore), `-Migrazioni`.

<details>
<summary>Alternativa manuale (SSMS)</summary>

1. Vecchio server: tasto destro sul database → *Attività → Backup...* → tipo **Completo**,
   spuntare **Backup di sola copia** → file `.bak`.
2. Copiare il `.bak` nella cartella `Backup` della nuova istanza.
3. Nuovo server: tasto destro su *Database → Ripristina database...* → *Dispositivo* →
   il file `.bak` → in *File* spuntare "Riposiziona tutti i file nelle cartelle".
4. Nel nuovo database eseguire `database\schema.sql`, poi il passo 1 (che associa il login).
</details>

## 6. Passo 3 – Installare l'applicazione

**Dove:** sul Windows Server 2016 che ospiterà l'app. Doppio clic su
`deploy\windows\INSTALLA.cmd`: chiede server SQL, porta, database, utente e password.
Oppure da PowerShell come amministratore:

```powershell
cd C:\Installazione\EssentiaMES-1.0.0\deploy\windows

# SQL Server su un altro server, accesso diretto http://<server>:3000
.\installa-app.ps1 -DbServer SRV-SQL -DbPorta 1433 -DbNome Brighetti -DbUtente essentia_app

# SQL Server sullo stesso server + pubblicazione HTTPS tramite IIS + documenti del vecchio sito
.\installa-app.ps1 -DbServer localhost -DbNome Brighetti `
    -ConIIS -NomeHost essentia.azienda.local -CertificatoAutofirmato -FermaSitoIIS "Brighetti" `
    -CartellaDocumentiVecchi "C:\inetpub\wwwroot\Brighetti\Content\upload_documenti"
```

Cosa fa:
1. Installa **Node.js 24 LTS** (MSI ufficiale, hash SHA256 verificato) se manca.
2. Copia l'app in `C:\EssentiaMES\app` (dal pacchetto, o compila il sorgente).
3. Scrive `C:\EssentiaMES\config\essentia.env`:
   - connessione al database cifrata con TLS;
   - `SESSION_SECRET` e `CRON_SECRET` casuali;
   - cartella dei documenti.

   Il file è leggibile solo dagli amministratori e dal servizio. Diventa definitivo solo
   **dopo** una prova di connessione al database riuscita.
4. Copia i documenti del vecchio software (`-CartellaDocumentiVecchi`). Vengono ritrovati
   per nome file anche se nel database c'è il vecchio percorso.
5. Registra il servizio Windows **EssentiaMES** con [WinSW](https://github.com/winsw/winsw):
   - avvio automatico (ritardato, così SQL Server parte prima);
   - riavvio automatico in caso di errore;
   - log a rotazione in `C:\EssentiaMES\logs`;
   - account virtuale `NT SERVICE\EssentiaMES`, che può scrivere solo in `data` e `logs`.

   Le automazioni (ordini automatici, sync Mexal) girano dentro il servizio.
6. Apre la porta 3000 nel firewall, **oppure** con `-ConIIS` pubblica l'app tramite IIS:
   - installa il ruolo IIS, **URL Rewrite** e **Application Request Routing**;
   - crea il sito "EssentiaMES" che inoltra a `127.0.0.1:3000`;
   - attiva HTTPS con il certificato indicato (`-CertificatoThumbprint`) o autofirmato;
   - reindirizza HTTP su HTTPS.

   In questo caso Node ascolta solo in locale.

Struttura risultante:

```
C:\EssentiaMES\
  app\          applicazione (sostituita a ogni aggiornamento)
  config\       essentia.env (configurazione, contiene password)
  data\         upload_documenti\ (documenti allegati: da includere nei backup)
  logs\         EssentiaMES.out.log / .err.log / .wrapper.log
  servizio\     EssentiaMES.exe + EssentiaMES.xml (WinSW)
  strumenti\    copia di questi script (VERIFICA.cmd, DISINSTALLA.cmd, ...)
  backup\       ultime 3 versioni dell'app
  iis\          web.config del sito IIS (solo con -ConIIS)
```

| Parametro | Predefinito | Note |
| --- | --- | --- |
| `-DbServer` | chiesto | nome o IP; `localhost` se SQL Server è sullo stesso computer |
| `-DbPorta` / `-DbIstanza` | 1433 | porta fissa (consigliata) oppure istanza con nome via SQL Browser |
| `-DbNome` / `-DbUtente` / `-DbPassword` | Brighetti / essentia_app / chiesta | |
| `-DbAutenticazione ntlm` `-DbDominio` | sql | account Windows di dominio al posto del login SQL |
| `-DbTlsLegacy` | no | per SQL Server 2008 R2/2012/2014 non aggiornati (errore TLS/handshake) |
| `-DbSenzaCrittografia` | no | solo se SQL Server non supporta TLS |
| `-AggiornaSchema` | no | esegue `schema.sql` con l'utente Windows corrente (sysadmin) |
| `-Porta` | 3000 | porta di Node.js |
| `-UrlPubblico` | `http://<server>:3000` o `https://<NomeHost>` | indirizzo usato dagli utenti |
| `-ConIIS` `-NomeHost` | no | pubblicazione tramite IIS |
| `-CertificatoThumbprint` / `-CertificatoAutofirmato` | | certificato HTTPS (Computer locale → Personale) |
| `-FermaSitoIIS` | | sito IIS del vecchio software da fermare |
| `-CartellaDocumentiVecchi` | | cartella `upload_documenti` del vecchio sito |
| `-UtenteServizio` / `-PasswordServizio` | account virtuale | account di dominio per leggere cartelle di rete (CSV Mexal) |
| `-CartellaInstallazione` / `-NomeServizio` | C:\EssentiaMES / EssentiaMES | per installazioni di prova affiancate |
| `-RiscriviConfigurazione` | no | rifà `essentia.env` da zero |
| `-NodeMsi` / `-AggiornaNode` | | MSI locale (offline) / forza l'installazione di Node.js |
| `-NonInterattivo` | no | nessuna domanda (per automazioni) |

Lo script si può **rilanciare** senza problemi. Mantiene la configurazione esistente e
conserva la versione precedente dell'app in `backup\`. Per passare in un secondo momento
a IIS basta `.\installa-app.ps1 -ConIIS -NomeHost ...`.

**File CSV di Mexal su una cartella di rete:** l'account virtuale accede alla rete come
account del computer (`AZIENDA\NOMESERVER$`). In alternativa a `-UtenteServizio`, si può
dare a quell'account il permesso di lettura sulla condivisione. Nel pannello Automazioni il
percorso si scrive in formato UNC (`\\server\condivisione\file.csv`), non con una lettera
di unità mappata.

### Installazione senza Internet

Mettere in `C:\EssentiaMES\download` (o nella cartella `deploy\windows\download` del
pacchetto) i file che lo script scaricherebbe. Vengono usati se l'hash corrisponde:
- `node-v24.x.y-x64.msi` da nodejs.org (oppure parametro `-NodeMsi`);
- `rewrite_amd64_en-US.msi` e `requestRouter_amd64.msi` (solo con IIS). I link sono in
  `_comune.ps1`.

### Giacenze da Mexal (database Mexal_Frontier)

EssentiaMES può leggere le giacenze **direttamente dal database di Mexal**, senza file CSV.
Lo script `database\mexal-vista-giacenze.sql` è già configurato per `Mexal_Frontier.dbo.Articoli`
(`CKY_ART` = codice, `NMP_ESI` = esistenza):

1. In SSMS aprire `database\mexal-vista-giacenze.sql` ed eseguirlo (F5) con un account
   amministratore. Lo script:
   - crea la vista `dbo.EssentiaMES_GiacenzeMexal` nel database **Brighetti**, dove resta
     anche se Mexal_Frontier viene ricreato ogni giorno;
   - dà a `essentia_app` la sola lettura delle colonne `CKY_ART`, `NMP_ESI`, `NMP_SMN` e
     `NMP_QTAOF`, senza prezzi né altre colonne;
   - mostra le prime righe.
2. Nel pannello **Automazioni**, sezione Sincronizzazione Mexal:
   - "Legge le giacenze direttamente dal database di Mexal" → **Attivo**;
   - magazzino di EssentiaMES in cui scrivere le giacenze (nome o Id, es. `Magazzino Finito`);
   - interruttore della sincronizzazione acceso e **ora** successiva all'aggiornamento
     giornaliero di Mexal_Frontier.
3. Pagina **Sincronizzazione Mexal** → "Sincronizza ora". La risposta indica righe lette,
   aggiornate, create e **ignorate**: sono ignorati gli articoli che non esistono in
   EssentiaMES, finché resta attivo "solo articoli presenti nell'anagrafica".

Facoltativo: togliendo i `--` dalle due righe indicate nello script, la vista passa anche
la **scorta minima** (`NMP_SMN`) e la **quantità ordinata a fornitori** (`NMP_QTAOF`).
EssentiaMES le usa per decidere i riordini automatici, e i valori di Mexal sostituiscono
quelli inseriti in EssentiaMES.

## 7. Passo 4 – Verifica e collaudo

```powershell
C:\EssentiaMES\strumenti\VERIFICA.cmd
```
Controlla Node.js, il servizio, la configurazione (senza mostrare le password), la porta
TCP di SQL Server, la connessione e lo schema del database, `/api/health`, i documenti,
il sito IIS e gli ultimi errori nel log. Alla fine elenca i problemi trovati con
l'indicazione di cosa fare.

Poi:
1. Aprire l'indirizzo mostrato a fine installazione (es. `https://essentia.azienda.local`)
   ed entrare con un **utente del vecchio software**: le password sono le stesse.
2. Seguire la **checklist di collaudo** nel README principale (§9.4) con un amministratore
   e con un operatore da tablet.
3. Test automatico completo (122 verifiche). Usarlo **solo su un database di prova**,
   perché crea dati di test. Va eseguito su un database con i dati demo, come fa il
   workflow GitHub ([§13](#13-come-sono-stati-provati-gli-script)):
   ```powershell
   # database demo sul SQL Server (serve un login con permesso di creare database)
   cd C:\EssentiaMES\app
   $env:DB_SERVER='localhost'; $env:DB_PORT='1433'; $env:DB_NAME='EssentiaDemo'
   $env:DB_USER='sa'; $env:DB_PASSWORD='...'; $env:DB_TRUST_SERVER_CERTIFICATE='true'
   node scripts\db-init.mjs --create-db --migrazioni --seed
   # installazione di prova affiancata, porta 3001, collegata a EssentiaDemo
   ..\strumenti\installa-app.ps1 -CartellaInstallazione C:\EssentiaMES-Test -NomeServizio EssentiaMES-Test `
       -Porta 3001 -DbServer localhost -DbNome EssentiaDemo -DbUtente sa
   $env:BASE_URL='http://localhost:3001'
   $env:CRON_SECRET=(Select-String C:\EssentiaMES-Test\config\essentia.env "^CRON_SECRET='(.*)'$").Matches[0].Groups[1].Value
   node scripts\e2e-smoke.mjs
   # poi: C:\EssentiaMES-Test\strumenti\disinstalla-app.ps1 -CartellaInstallazione C:\EssentiaMES-Test -NomeServizio EssentiaMES-Test -RimuoviTutto
   ```

## 8. Passaggio dal vecchio software (go-live)

1. **Backup** del database. `prepara-sql-server.ps1 -AggiornaSchema` lo fa da solo.
2. Scenario B: fermare il vecchio sito e i programmi che scrivono nel database, poi eseguire il porting.
3. `INSTALLA.cmd` (con `-FermaSitoIIS "<nome vecchio sito>"` se sullo stesso server c'è il vecchio IIS).
   Il vecchio sito conteneva anche **Hangfire**: deve restare fermo, altrimenti i job
   automatici girerebbero due volte. Se per un periodo li volete tenere entrambi accesi,
   mettete `SCHEDULER_ENABLED='false'` in `essentia.env`.
4. `VERIFICA.cmd` e collaudo (§7).
5. Comunicare il nuovo indirizzo e aggiornare i segnalibri dei tablet. Se l'indirizzo resta
   lo stesso del vecchio sito, è IIS a gestirlo con `-NomeHost`.

**Tornare indietro:** fermare il servizio (`Stop-Service EssentiaMES`) e riavviare il vecchio
sito IIS (Gestione IIS → Avvia). `schema.sql` aggiunge soltanto tabelle e colonne, quindi il
database resta utilizzabile dal vecchio software.

## 9. Server fuori dall'azienda

Se il Windows Server 2016 è in hosting/cloud, SQL Server **non va esposto su Internet**.
Le opzioni:

- **Tailscale** (semplice, supporta Windows Server 2016):
  1. installare Tailscale sul server dell'app e sul server SQL (oppure su un PC
     aziendale configurato come *subnet router*), con lo stesso account;
  2. dal pannello di Tailscale annotare l'indirizzo `100.x.y.z` del server SQL;
  3. sul server SQL: `.\prepara-sql-server.ps1 -ConsentiDa 100.64.0.0/10`;
  4. sul server dell'app: `.\installa-app.ps1 -DbServer 100.x.y.z`. La connessione è
     già cifrata con TLS dall'app.
- **VPN site-to-site** del firewall aziendale: `-DbServer` = IP interno del server SQL.

La latenza della VPN rallenta le pagine con molte query. Per questo, con il server in
hosting, conviene considerare il porting (B) del database sul server in hosting, e far
scrivere lì i programmi aziendali attraverso la VPN.

## 10. Configurazione

Tutta la configurazione è in `C:\EssentiaMES\config\essentia.env`. Il servizio lo legge
all'avvio con `node --env-file`. Per modificarlo:

1. aprire Blocco note **come amministratore** e modificare il file;
2. eseguire `Restart-Service EssentiaMES`.

I valori vanno **tra apici singoli** (`DB_PASSWORD='...'`) e sono presi alla lettera: `$`,
`#` e `%` non hanno significati speciali. Se una password contiene un apice, racchiuderla
tra accenti gravi (`` DB_PASSWORD=`l'apice` ``).

| Chiave | Esempio | Note |
| --- | --- | --- |
| `APP_URL` | `https://essentia.azienda.local` | indirizzo pubblico. Le richieste con un'origine diversa vengono rifiutate |
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | con IIS `HOSTNAME='127.0.0.1'` |
| `COOKIE_SECURE` | `true` | `true` solo con HTTPS, altrimenti il login non funziona |
| `DB_SERVER` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | | connessione a SQL Server |
| `DB_AUTH_TYPE` `DB_DOMAIN` | `ntlm` / `AZIENDA` | account Windows invece del login SQL |
| `DB_ENCRYPT` `DB_TRUST_SERVER_CERTIFICATE` `DB_TLS_LEGACY` | | cifratura della connessione |
| `SESSION_SECRET` | (casuale) | se cambia, tutti gli utenti devono rifare il login |
| `UPLOAD_DIR` / `LEGACY_UPLOAD_DIRS` | | cartella dei documenti / cartelle extra dove cercarli |
| `SCHEDULER_ENABLED` / `CRON_SECRET` | `true` | job automatici interni / token per `/api/cron/*` |
| `SMTP_*` | | email delle richieste materiali (righe di esempio nel file) |

## 11. Aggiornamenti, backup, disinstallazione

**Aggiornare** a una nuova versione: estrarre il nuovo pacchetto ed eseguire da lì
`deploy\windows\AGGIORNA.cmd`. Con la nuova versione che aggiorna anche il database:
`.\aggiorna-app.ps1 -AggiornaSchema`.
Lo script prepara la nuova versione mentre l'app è ancora attiva, la sostituisce con una
breve interruzione e controlla che risponda. **Se non parte, ripristina da solo la
versione precedente.** Configurazione, documenti e log non vengono toccati.

**Backup** da includere nella politica aziendale:
- il database (piano di manutenzione SQL Server; con Express, che non ha SQL Agent, un'attività
  pianificata di Windows che esegue `BACKUP DATABASE` tramite `sqlcmd`);
- `C:\EssentiaMES\data` (documenti allegati);
- `C:\EssentiaMES\config\essentia.env`.

**Disinstallare:** `C:\EssentiaMES\strumenti\DISINSTALLA.cmd`
(`-RimuoviIIS` per il sito IIS, `-RimuoviTutto` anche per configurazione e documenti).
Il database non viene mai toccato.

**Comandi utili**
```powershell
Get-Service EssentiaMES                 # stato
Restart-Service EssentiaMES             # riavvio (dopo modifiche a essentia.env)
Get-Content C:\EssentiaMES\logs\EssentiaMES.err.log -Tail 50 -Wait   # log in tempo reale
Invoke-WebRequest http://127.0.0.1:3000/api/health -UseBasicParsing   # {"ok":true,...}
```
I registri di ogni esecuzione degli script sono in `C:\ProgramData\EssentiaMES\log-installazione`.

## 12. Risoluzione dei problemi

| Sintomo | Causa probabile | Soluzione |
| --- | --- | --- |
| L'installazione sembra ferma (nessun messaggio nuovo) | un clic nella finestra ha attivato la "Modifica rapida" della console, che mette in pausa lo script (nel titolo compare "Seleziona"); oppure npm sta ancora scaricando/compilando | premere **Esc** nella finestra. Gli script aggiornati disattivano la Modifica rapida e ogni 30 secondi scrivono "... in corso da m:ss". `npm ci` e la compilazione richiedono 2–10 minuti ciascuno: con il pacchetto già compilato non servono |
| `Failed to connect ... Could not connect` | TCP/IP disattivato, porta dinamica, firewall | `prepara-sql-server.ps1` sul server SQL; `-ConsentiDa <IP app>` |
| `Login failed for user 'essentia_app'` | password errata o solo autenticazione Windows | rilanciare `prepara-sql-server.ps1` (reimposta la password), poi `installa-app.ps1 -RiscriviConfigurazione` |
| Errore TLS / `handshake` / `key too small` | SQL Server 2008 R2–2014 non aggiornato | `-DbTlsLegacy` (o `DB_TLS_LEGACY='true'` nel file) oppure aggiornare SQL Server |
| `Cannot open database` | login non associato al database | `prepara-sql-server.ps1 -Database <nome>` |
| `'TRY_CONVERT' is not a recognized built-in function` | livello di compatibilità 100 | `prepara-sql-server.ps1 -AggiornaSchema` (lo porta a 110) |
| Login rifiutato senza messaggi d'errore | `COOKIE_SECURE='true'` con indirizzo `http://` | usare HTTPS (IIS) oppure `COOKIE_SECURE='false'` |
| "Origine della richiesta non consentita" | indirizzo usato diverso da `APP_URL` | aggiungere l'indirizzo in `APP_URL` (più valori separati da virgola) |
| Il servizio si avvia e si ferma | errore nella configurazione | `C:\EssentiaMES\logs\EssentiaMES.err.log`, `VERIFICA.cmd` |
| IIS risponde 502.3 | servizio EssentiaMES fermo | `Start-Service EssentiaMES` |
| IIS: errore sulla porta 80/443 già in uso | il vecchio sito usa le stesse porte | `-NomeHost <nome>` oppure `-FermaSitoIIS "<sito>"` |
| Avviso del browser sul certificato | certificato autofirmato | usare un certificato aziendale (`-CertificatoThumbprint`) o distribuire quello autofirmato ai client |
| Sync Mexal: file non trovato | il servizio non vede la cartella di rete | percorso UNC, permessi all'account del computer o `-UtenteServizio` |
| Sync Mexal da database: "permission denied" / "is not able to access the database" | manca il permesso su Mexal_Frontier, oppure il database è stato ricreato senza quel permesso | rieseguire `database\mexal-vista-giacenze.sql` in SSMS |
| Sync Mexal: molte righe "ignorate" | codici articolo di Mexal diversi da quelli di EssentiaMES | confrontare i codici (es. spazi, maiuscole), oppure disattivare "solo articoli presenti nell'anagrafica" |
| Restore: "database was backed up on a server running version ..." | nuovo SQL Server più vecchio | installare una versione uguale o successiva (§5) |
| Download non riuscito | server senza Internet / proxy | [installazione offline](#installazione-senza-internet) |

## 13. Come sono stati provati gli script

**Già eseguito**
- Tutti gli script passano il **parser ufficiale di PowerShell** e usano solo sintassi di
  Windows PowerShell 5.1 (quella di Windows Server 2016): TLS 1.2 esplicito, solo caratteri
  ASCII, nessuna sintassi di PowerShell 7.
- `porting-database.ps1` è stato **eseguito per intero** (PowerShell in container) contro
  SQL Server 2022, nei casi seguenti:
  - porting completo con schema e migrazioni, e 34 tabelle uguali all'origine;
  - rifiuto se il database esiste già;
  - sovrascrittura con backup di sicurezza;
  - messaggi chiari quando il server non risponde.
- Le funzioni comuni sono state provate una per una:
  - il file `essentia.env` scritto da PowerShell viene letto da Node in modo identico, anche
    con `$ # % \n` e apici nelle password;
  - l'XML del servizio WinSW è valido;
  - il login SQL viene creato con una password "difficile";
  - i batch `GO` di `schema.sql` vengono eseguiti correttamente.
- L'app, montata nella stessa struttura di `C:\EssentiaMES` e avviata come la avvia il
  servizio (`node --env-file=config\essentia.env server.js`), si collega con il login
  `essentia_app` a permessi ridotti al database copiato. Supera **tutte le 122 verifiche
  end-to-end**: non serve alcun permesso di modifica dello schema.

**Da eseguire su Windows** (registro di SQL Server, servizio Windows, IIS, firewall, MSI):
il workflow **Windows** di GitHub Actions (`.github/workflows/windows.yml`) fa questa prova
completa su un Windows Server 2022 pulito con SQL Server 2022 Express installato con le
impostazioni predefinite (TCP spento, solo autenticazione Windows). In sequenza:
1. crea il pacchetto;
2. esegue `prepara-sql-server.ps1`;
3. fa il porting di un database demo;
4. installa il servizio con Node.js da MSI e lancia `verifica.ps1`;
5. esegue i test end-to-end diretti e tramite IIS in HTTPS;
6. prova aggiornamento e disinstallazione.

Il workflow parte a ogni modifica di `deploy/windows` o a mano (*Actions → Windows → Run
workflow*), ma serve che l'account GitHub possa usare i runner Windows (minuti di Actions
disponibili). Alla prima installazione sul server ogni passaggio viene comunque
controllato: in caso di problemi lo script si ferma e spiega cosa fare.
