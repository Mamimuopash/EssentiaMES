# EssentiaMES

Gestionale di produzione (MES) per reparti, macchine, cicli di lavoro, ordini di
produzione, giacenze, lotti e automazioni di riordino. **Riscrittura in Next.js**
della precedente applicazione ASP.NET MVC (VB.NET, Entity Framework 6).

- **Stesso database SQL Server** (gestibile da SSMS come prima): nomi di tabelle e
  colonne identici, nessuna migrazione dei dati.
- **Stesse logiche e query** del vecchio software, riscritte come SQL
  parametrizzato leggibile (cartella `src/lib/services` e `src/app/api`).
- **Stessi utenti e password**: gli hash ASP.NET Identity esistenti sono verificati
  così come sono (nessun reset password).
- Pensato per girare **fuori dall'azienda** (VPS/cloud) collegandosi al SQL
  Server aziendale in modo sicuro (VPN/Tailscale, TLS).

---

## Indice

1. [Architettura](#1-architettura)
2. [Struttura del progetto](#2-struttura-del-progetto)
3. [Requisiti](#3-requisiti)
4. [Configurazione](#4-configurazione)
5. [Database](#5-database)
6. [Collegare il software esterno al SQL Server aziendale](#6-collegare-il-software-esterno-al-sql-server-aziendale)
7. [Deploy](#7-deploy)
8. [Migrazione dal vecchio software (IIS)](#8-migrazione-dal-vecchio-software-iis)
9. [Test completo](#9-test-completo)
10. [Funzionalità e corrispondenza con il vecchio software](#10-funzionalità-e-corrispondenza-con-il-vecchio-software)
11. [Differenze di comportamento rispetto al vecchio software](#11-differenze-di-comportamento-rispetto-al-vecchio-software)
12. [Sicurezza](#12-sicurezza)
13. [Operatività e manutenzione](#13-operatività-e-manutenzione)

---

## 1. Architettura

```
 Browser (tablet operatori / PC ufficio)
        │ HTTPS
        ▼
 ┌──────────────────────────────┐        VPN / Tailscale / tunnel        ┌────────────────────────┐
 │ Server esterno (VPS / cloud) │  ───────────── TCP 1433 (TLS) ───────▶ │ SQL Server aziendale   │
 │  Next.js 16 (Node 22)        │                                         │ database "Brighetti"   │
 │  - pagine React (SSR)        │                                         │ (gestito da SSMS)      │
 │  - API /api/*                │                                         └────────────────────────┘
 │  - scheduler job interni     │
 │  - documenti allegati (disco)│
 └──────────────────────────────┘
```

| Componente | Tecnologia |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Accesso dati | driver `mssql` (tedious), query T-SQL parametrizzate, transazioni |
| Autenticazione | tabelle ASP.NET Identity (`AspNetUsers`, ruoli `Admin`/`Operatore`/`Reparto`), hash PBKDF2 compatibili, sessione JWT in cookie httpOnly |
| UI | Bootstrap 5 + Font Awesome + stile originale (`site.css`), SweetAlert2, Chart.js |
| Job pianificati | scheduler interno (sostituisce Hangfire) + endpoint `/api/cron/*` per cron esterni |
| Excel lotti | `exceljs` sullo stesso template `templates/Lotti.xlsx` |
| Email richieste materiali | `nodemailer` (SMTP) |

## 2. Struttura del progetto

```
database/
  schema.sql                      schema completo e idempotente (crea solo ciò che manca)
  migrazioni/001_...sql           giacenze da Id articolo a codice (una tantum, idempotente)
  migrazioni/002_...sql           indici consigliati (facoltativi)
  seed-demo.sql                   dati demo per test (NON in produzione)
  utente-sql-applicazione.sql     login SQL dedicato con permessi minimi
scripts/                          db-init, db-check, create-user, e2e-smoke (Node puro)
src/
  app/(app)/...                   pagine autenticate (dashboard, operatore, anagrafiche, ...)
  app/api/...                     API JSON usate dalle pagine
  app/login                       accesso
  components/                     tabelle, modali, grafici, note/documenti
  lib/db.ts                       connessione e transazioni SQL Server
  lib/auth/                       password Identity, sessione, utente corrente
  lib/services/                   logica di business (produzione, ordini automatici, lotti, Mexal, ...)
  lib/scheduler.ts                job pianificati
  proxy.ts                        protezione delle pagine (redirect al login)
templates/Lotti.xlsx              template stampa lotti
public/assets/                    loghi, planimetria, pin
tests/                            test unitari (vitest)
Dockerfile, docker-compose.yml    immagine di produzione e deploy con Tailscale
```

## 3. Requisiti

- **Node.js 20.9+** (consigliato 22 LTS) oppure **Docker**.
- **SQL Server 2016 o successivo** (quello attuale dell'azienda va bene), con TCP/IP abilitato.
- Connettività di rete dal server che ospita l'app al SQL Server (vedi §6).

## 4. Configurazione

Copiare `.env.example` in `.env.local` (sviluppo) o `.env.production` (Docker) e compilare.
Le variabili principali:

| Variabile | Descrizione |
| --- | --- |
| `DB_SERVER`, `DB_PORT` | host/IP del SQL Server (tramite VPN/Tailscale se esterno) e porta (1433) |
| `DB_INSTANCE` | istanza con nome (es. `SQLEXPRESS`), in alternativa alla porta |
| `DB_NAME` | nome del database (nella vecchia installazione: `Brighetti`) |
| `DB_USER`, `DB_PASSWORD` | login SQL (consigliato un login dedicato: `database/utente-sql-applicazione.sql`) |
| `DB_AUTH_TYPE=ntlm`, `DB_DOMAIN` | in alternativa, autenticazione Windows di dominio |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | TLS verso SQL Server (vedi §6) |
| `DB_CONNECTION_STRING` | in alternativa ai campi sopra, stringa stile ADO.NET |
| `SESSION_SECRET` | **obbligatorio in produzione**, ≥ 32 caratteri casuali (`openssl rand -base64 48`) |
| `TZ` | **Europe/Rome**: le date nel DB sono in ora italiana, come le salvava il vecchio software |
| `UPLOAD_DIR` | cartella dei documenti allegati; `LEGACY_UPLOAD_DIRS` per cercare i file del vecchio software |
| `SCHEDULER_ENABLED`, `CRON_SECRET` | job pianificati interni / esterni (vedi §13) |
| `SMTP_*` | email "Richiesta materiali" (facoltativo) |
| `APP_URL` | URL pubblico, se l'app è dietro un reverse proxy che cambia l'header Host |

## 5. Database

L'app usa **lo stesso database** del vecchio software. Non servono conversioni di dati.

### 5.1 Allineare lo schema (una volta, e a ogni aggiornamento)

`database/schema.sql` è **idempotente**: su un database esistente crea solo le
tabelle/colonne mancanti (es. quelle delle Automazioni, se il vecchio
`AGGIORNAMENTO_DB.sql` non era mai stato eseguito) e non tocca i dati.

- **Da SSMS**: aprire `database/schema.sql`, selezionare il database (`Brighetti`) ed eseguire.
  Consigliato anche `database/migrazioni/001_giacenze_codice_articolo.sql`.
  Facoltativo `002_indici_consigliati.sql` (velocizza le pagine macchina/attività; eseguirlo fuori orario).
- **Da riga di comando** (con un login che abbia diritti DDL):
  ```bash
  npm run db:init -- --migrazioni
  npm run db:check          # verifica connessione e presenza di tutte le tabelle/colonne
  ```

> Lo schema è stato verificato applicandolo sia a un database vuoto sia al dump
> storico del 2023 (`Essentia.sql`, 1000 articoli e 6 utenti): gli oggetti mancanti
> vengono creati e i dati restano invariati.

### 5.2 Login SQL dedicato (consigliato)

Eseguire `database/utente-sql-applicazione.sql` in SSMS (cambiando la password):
crea `essentia_app` con soli permessi di lettura/scrittura dati. L'app non ha
bisogno di altri permessi; lo schema lo si aggiorna da SSMS con un account amministratore.

### 5.3 Utenti

Gli utenti esistenti accedono con **le stesse credenziali**. Per crearne di nuovi:
- dall'app: *Dashboard Utenti → Gest. Account → Crea Utente* (Admin);
- da riga di comando: `npm run user:create -- --username mario --password 'Password.1' --ruolo Admin`
  (se l'utente esiste gli reimposta la password: utile per il primo accesso admin).

Regole password (come prima): almeno 6 caratteri con maiuscola, minuscola, numero e carattere speciale.

## 6. Collegare il software esterno al SQL Server aziendale

Il SQL Server **resta in azienda**; il software gira fuori. Serve un canale di rete
sicuro verso la porta 1433. **Non esporre SQL Server direttamente su Internet.**
Opzioni, dalla più consigliata:

**A. Tailscale (consigliato, nessuna porta da aprire sul firewall aziendale)**
1. Installare Tailscale sul server Windows con SQL Server (oppure su una macchina
   della LAN configurata come *subnet router* verso l'IP del SQL Server).
2. Il container dell'app entra nella stessa tailnet (servizio `tailscale` in
   `docker-compose.yml`, chiave `TS_AUTHKEY`).
3. `DB_SERVER` = nome MagicDNS o IP `100.x.y.z` del server SQL.
4. Nelle ACL Tailscale consentire solo `essentia-mes → server-sql:1433`.

**B. VPN site-to-site** (WireGuard/IPsec) tra la VPS e il firewall aziendale:
`DB_SERVER` = IP LAN del SQL Server; regola firewall che consente solo l'IP VPN della VPS sulla 1433.

**C. Cloudflare Tunnel / Zero Trust**: `cloudflared` in azienda pubblica il servizio
TCP 1433 e `cloudflared access tcp` lato server applicativo lo espone su `localhost:1433`.

**D. (sconsigliato)** port forwarding della 1433 con allow-list sull'IP della VPS e
cifratura forzata: solo se le altre opzioni non sono praticabili.

Configurazione lato SQL Server (SQL Server Configuration Manager):
- abilitare **TCP/IP**, porta statica **1433**, regola nel Windows Firewall;
- per la cifratura installare un certificato e attivare **Force Encryption**;
  quindi `DB_ENCRYPT=true` e `DB_TRUST_SERVER_CERTIFICATE=false`.
  Con certificato autofirmato (solo dentro VPN) usare `DB_TRUST_SERVER_CERTIFICATE=true`.
- Latenza: ogni pagina esegue alcune query; ospitare l'app in un datacenter vicino
  (Italia/Milano) mantiene i tempi di risposta simili a quelli in LAN.

Verifica rapida dal server applicativo: `npm run db:check` (o dentro Docker:
`docker compose exec app node scripts/db-check.mjs`).

## 7. Deploy

### 7.1 Docker Compose + Tailscale (consigliato)

```bash
git clone <repo> essentia-mes && cd essentia-mes
cp .env.example .env.production        # compilare DB_*, SESSION_SECRET, CRON_SECRET ...
TS_AUTHKEY=tskey-auth-xxxx docker compose up -d --build
docker compose logs -f app             # "[scheduler] avviato", nessun errore DB
curl http://localhost:3000/api/health  # {"ok":true,"db":"connesso"}
```
Se la connettività al DB è già garantita da una VPN di sistema, avviare solo `app`
(togliere `network_mode: service:tailscale` e aggiungere `ports: ["3000:3000"]`).

### 7.2 HTTPS (obbligatorio in produzione)

Mettere l'app dietro un reverse proxy con certificato. Esempio **Caddy** (`Caddyfile`):
```
mes.azienda.it {
    reverse_proxy localhost:3000
}
```
I cookie di sessione sono `Secure` in produzione: senza HTTPS il login non funziona
(solo per test in chiaro: `COOKIE_SECURE=false`).

### 7.3 Docker senza compose

```bash
docker build -t essentia-mes .
docker run -d --name essentia-mes --env-file .env.production -p 3000:3000 \
  -v essentia-data:/app/data --restart unless-stopped essentia-mes
```
Il volume `/app/data` contiene i documenti allegati: includerlo nei backup.

### 7.4 Node.js senza Docker (VPS Linux o Windows Server)

```bash
npm ci
npm run build
npm start                    # porta 3000 (variabile PORT per cambiarla)
```
Per tenerlo attivo: `pm2 start npm --name essentia -- start` (Linux/Windows) oppure un servizio
systemd / NSSM. Impostare le variabili di §4 (file `.env.production` o ambiente di sistema).

### 7.5 Piattaforme serverless (Vercel e simili)

Sconsigliate: il DB aziendale deve essere raggiungibile dalla piattaforma, i documenti
sono salvati su disco e lo scheduler interno richiede un processo sempre attivo.
Se proprio necessario: `SCHEDULER_ENABLED=false`, cron della piattaforma su
`/api/cron/ordini-automatici` e `/api/cron/sync-mexal` (header `Authorization: Bearer $CRON_SECRET`)
e uno storage persistente per `UPLOAD_DIR`.

## 8. Migrazione dal vecchio software (IIS)

1. **Backup** completo del database da SSMS (*Tasks → Back Up...*).
2. Eseguire `database/schema.sql` (+ `migrazioni/001`) sul database (§5.1).
3. Copiare la cartella dei documenti del vecchio sito
   (`...\Content\upload_documenti`) nel volume/cartella `UPLOAD_DIR`: i documenti
   vengono ritrovati per nome file anche se nel DB c'è il vecchio percorso Windows
   (in alternativa indicarla in `LEGACY_UPLOAD_DIRS`).
4. Configurare e avviare il nuovo software (§7), verificare `db:check` e il login di un admin.
5. Eseguire la checklist di collaudo (§9.4) con un amministratore e un operatore.
6. Spegnere il vecchio sito IIS. Le due applicazioni possono anche convivere per un
   periodo (stesso DB, stesse password), ma **un solo scheduler deve essere attivo**:
   disattivare Hangfire nel vecchio sito oppure mettere `SCHEDULER_ENABLED=false` nel nuovo.
7. Gli operatori usano lo stesso indirizzo? Aggiornare il DNS/segnalibro dei tablet verso il nuovo URL.

## 9. Test completo

### 9.1 Controlli statici e test unitari

```bash
npm ci
npm run lint          # ESLint (config Next.js)
npm run typecheck     # TypeScript strict
npm test              # vitest: hash password Identity (vettori ufficiali Microsoft),
                      # regole riordino, parser CSV Mexal, cicli automatici, date/fusi
```

### 9.2 Ambiente di test completo in locale (SQL Server in Docker)

```bash
# 1. SQL Server usa-e-getta
docker compose --profile test up -d sqlserver

# 2. .env.local per il test
cat > .env.local <<'ENV'
DB_SERVER=localhost
DB_PORT=1433
DB_NAME=EssentiaTest
DB_USER=sa
DB_PASSWORD=Essentia!Dev2026
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true
SESSION_SECRET=segreto-di-test-lungo-almeno-trentadue-caratteri
TZ=Europe/Rome
COOKIE_SECURE=false
CRON_SECRET=cron-test
ENV

# 3. crea DB + schema + migrazioni + dati demo + utenti demo
npm run db:init -- --create-db --migrazioni --seed
#    utenti demo: admin / Admin.2026!   operatore / Operatore.2026! (associato alla "Mazak 200MSY L")

# 4. build e avvio in modalità produzione
npm run build && npm start          # http://localhost:3000

# 5. test end-to-end (in un altro terminale)
npm run e2e
```

`npm run e2e` (script `scripts/e2e-smoke.mjs`) esegue **121 verifiche** via HTTP e
controlla lo stato del database dopo ogni passo:
login/permessi, tutte le pagine, anagrafiche, creazione articolo con ciclo automatico,
ODP, flusso operatore completo (attrezzaggio → lavorazione → quantità parziale →
sospensione → ripresa → chiusura), scarico/carico giacenze tra magazzini con dettagli
giacenza, lotto automatico, lotto *Ritornato* (sblocco fase), export Excel, riordino
automatico (calcolo quantità, lotto minimo, niente doppioni, conferma/evaso),
import CSV Mexal, note e documenti (upload/download), planimetria, gestione utenti,
cambio/reset password con invalidazione sessione, protezione CSRF, endpoint cron, audit.
Lo stesso script si può lanciare contro l'immagine Docker (`BASE_URL=http://host:porta npm run e2e`).

> ⚠️ Lo script **scrive dati**: usarlo solo su un database di test.

### 9.3 Test su una copia dei dati reali (consigliato prima del go-live)

1. Da SSMS fare un backup del DB di produzione e ripristinarlo su un SQL Server di test
   (anche quello Docker del §9.2: `docker cp backup.bak <container>:/tmp/` e
   *Restore Database* da SSMS collegato a `localhost,1433`).
2. `DB_NAME` = nome del DB ripristinato, `npm run db:init -- --migrazioni`, `npm run db:check`.
3. Avviare l'app e accedere con le **credenziali reali** di un admin e di un operatore.
4. Seguire la checklist §9.4 confrontando i dati con il vecchio software.

### 9.4 Checklist di collaudo manuale

| Ruolo | Verifica |
| --- | --- |
| Tutti | Login con credenziali esistenti; logout; cambio password; blocco dopo 5 tentativi errati (5 minuti) |
| Operatore | La postazione mostra la propria macchina e le attività in attesa/sospese; la lista si aggiorna da sola |
| Operatore | Avvio in *Attrezzaggio* → *Concludi* passa in *Lavorazione*; timer corretto |
| Operatore | *Concludi* con quantità inferiore all'obiettivo: la fase resta aperta; con quantità piena: fase chiusa |
| Operatore | *Sospendi* e ripresa di un'attività; note e documenti della macchina dalla finestra di avvio |
| Admin | Dashboard: pin in planimetria (aggiunta/rimozione in modalità modifica, popover con programma), tab *Stati Macchina* |
| Admin | Scheda macchina (note, documenti, grafico stati) e *Analisi* con filtro date |
| Admin | Articoli: ricerca, creazione (ciclo automatico per codici G/B), modifica, dettaglio con ciclo |
| Admin | Giacenze: filtro per magazzino, crea/modifica/elimina, *Crea ODP* |
| Admin | Dopo la chiusura di una fase: giacenza caricata nel magazzino successivo e scaricata dal precedente |
| Admin | Lotti: modifica stato e righe, *Ritornato*, export Excel, note/documenti |
| Admin | Automazioni: interruttori, parametri, lotto minimo di massa, cancellazione richieste aperte |
| Admin | Ordini automatici: genera, conferma, annulla, evaso; Centro di Controllo coerente |
| Admin | Sync Mexal: import CSV di prova; eventuale file configurato |
| Admin | Dashboard Utenti: storico ODP con dettaglio fasi; crea/reimposta/cancella utente |
| Admin | Tabelle `Audit` e `Log` in SSMS: le operazioni risultano tracciate come prima |

## 10. Funzionalità e corrispondenza con il vecchio software

| Vecchio (ASP.NET) | Nuovo (Next.js) |
| --- | --- |
| `Account/Login`, `Manage/Account`, `Manage/ChangePassword` | `/login`, `/account`, `/account/password` |
| `Brighetti_Operatori/AvvioAttivita`, `AvvioMacchina`, `ApriAttività` | `/operatore` (finestra *Apri Attività*) |
| `Brighetti_Operatori/VisualizzaAttività`, `SospendiAttività`, `ConcludiAttività` | `/operatore/attivita/[id]` |
| `Macchine/AdminDashboard` + `MacchineStati` + pinpoint (`Home/ListaMacchine`, `SalvaPinpoint`, ...) | `/dashboard` |
| `Macchine/Istanza`, `Macchine/Analisi` | `/macchine/[id]`, `/macchine/[id]/analisi` |
| `Brighetti_Cruscotto` | `/cruscotto` |
| `Brighetti_Articolo` (+ `ServerProcessing`) | `/articoli` (paginazione lato server) |
| `Brighetti_Magazzino`, `Brighetti_Giacenza` (+ `CreateODP`) | `/magazzini`, `/giacenze` |
| `Brighetti_Lotti` (+ `ListaArticoli` Excel) | `/lotti` |
| `Brighetti_Reparto`, `Brighetti_Macchina` | `/reparti`, `/macchine` |
| `Brighetti_Procedura` | `/procedure` (cicli di lavoro) |
| `Home/Storico` + `Home/MostraOrdine` + `Account/Utenti` | `/storico` |
| `Brighetti_Impostazioni`, `Brighetti_OrdiniAutomatici`, `Brighetti_Sync` | `/automazioni`, `/ordini-automatici`, `/sync-mexal` |
| `Home/Carrello`, `InserisciArticoloDaOrdinare`, `InviaRichiestaAmministratore` | `/carrello` |
| `Home/AddNota`, `DeleteNota`, `AddFile`, `DeleteFile`, `DownloadFile` | `/api/note`, `/api/documenti` |
| Hangfire (`ordini-automatici`, `sync-mexal`) | scheduler interno + `/api/cron/[job]` |

Non riportati perché inutilizzati o non raggiungibili nel vecchio software:
registrazione pubblica (`Account/Register`), login esterni/2FA/SMS (template Identity
non configurati), pagine demo `About`/`Contact`, CRUD della vecchia tabella `Macchine`
(sostituita da `Brighetti_Macchine`), `AvvioReparto` (vuota), `InvioMail` di prova.

## 11. Differenze di comportamento rispetto al vecchio software

La logica è stata portata fedelmente. Queste le **correzioni** introdotte dove il
vecchio codice andava in errore o faceva chiaramente altro da quanto previsto:

- **Chiusura fase con giacenza precedente**: nel vecchio `ConcludiAttività` la lista
  `ListaQuantità` non veniva caricata (proprietà non *virtual*, nessun `Include`),
  quindi lo scarico del magazzino precedente sollevava un'eccezione e annullava la
  chiusura. Ora il dettaglio giacenza viene cercato con una query esplicita.
- **Sblocco fase successiva**: il vecchio codice prendeva la *prima* attività con
  quell'articolo e incrementale in tutto il DB (anche di altri ODP, anche già
  completata). Ora sblocca solo la fase dello **stesso ODP** ancora bloccata; idem
  per la chiusura della fase di versamento (prima `IdAttività + 1`).
- **Ciclo automatico brocce "G"**: il versamento verso la Rettifica usava per errore
  il magazzino Tratt. Termico (la variabile corretta veniva calcolata e ignorata).
  Se una macchina/magazzino del ciclo non esiste il ciclo non viene creato a metà
  (prima restavano fasi parziali) e l'anomalia è scritta nel `Log`.
- **Semilavorati conto lavoro** (ordini automatici): il confronto avveniva tra
  codice magazzino e Id (mai vero); ora riconosce entrambi.
- **Giacenze storiche** con Id articolo al posto del codice: prima sparivano
  dall'elenco (errore di conversione), ora sono mostrate e gestite.
- **Import CSV Mexal**: `12,50` veniva letto come 1250 (separatore migliaia);
  ora gestisce formati italiano e internazionale e file in codifica Windows-1252.
- **Documenti**: i file con lo stesso nome si sovrascrivevano; ora il nome su disco ha
  un prefisso data/ora (il nome originale resta quello mostrato e scaricato).
- **Analisi macchina**: la data finale del filtro è inclusa; le macchine non
  collegate non vanno più in errore (mostrano produzione e coda senza grafico efficienza).
- **Scheda macchina**: mostra l'ultima lettura (prima la più vecchia della settimana).
- **Dettaglio ODP**: i tempi sono la somma di tutte le sessioni (prima solo l'ultima).
- **Eliminazione giacenza** con dettagli collegati: prima falliva per vincolo FK.
- **Associazione operatore–macchina**: al salvataggio di una macchina ora viene
  davvero scritta in `AspNetMacchineUsers` (prima non veniva salvata).
- **Guardie** aggiunte: non si può avviare una seconda attività sulla stessa
  macchina, né concludere un'attività già completata; ODP senza ciclo o con
  quantità 0 vengono rifiutati con un messaggio chiaro; codici articolo duplicati rifiutati.
- **Magazzini e macchine**: da interfaccia si impostano anche *tipo magazzino*
  (interno / conto lavoro) e *tipologia collegamento* della macchina (MTConnect, CSV...),
  prima modificabili solo da SSMS.

Comportamenti **mantenuti come prima** (da valutare con il reparto):
- alla creazione di una giacenza dal flusso di produzione la *scorta minima* viene
  impostata uguale alla quantità prodotta: con gli ordini automatici attivi e
  `includi_semilavorati = true` questo genera proposte anche per i semilavorati;
- l'efficienza macchina è calcolata su un turno di 480 minuti (può superare il 100%);
- il codice ODP è `gg/mm/aaaa_<IdPrimaProcedura>` (due ODP dello stesso articolo nello
  stesso giorno hanno lo stesso codice: il flusso li distingue comunque).

## 12. Sicurezza

Il software è pensato per essere esposto su Internet:
- tutte le pagine e le API richiedono login; le funzioni di gestione richiedono il ruolo **Admin**
  (nel vecchio software molte pagine non avevano alcun controllo di accesso);
- gli operatori possono operare solo sulle attività delle **proprie** macchine;
- sessione firmata (`SESSION_SECRET`) in cookie `httpOnly`, `SameSite=Lax`, `Secure`;
  il cambio/reset password invalida le altre sessioni (SecurityStamp);
- blocco account dopo 5 tentativi errati (colonne Identity) e limite di richieste di login per IP;
- controllo dell'origine sulle richieste di modifica (protezione CSRF);
- query sempre parametrizzate; upload con limite di dimensione e nomi file sanificati;
- nessuna registrazione pubblica: gli utenti li crea l'amministratore.

Nota: il vecchio dump `Essentia.sql` (con gli hash delle password di allora) è stato
rimosso dal branch ma resta nella cronologia git; valutare il cambio password degli
utenti storici se il repository è stato condiviso.

## 13. Operatività e manutenzione

- **Salute**: `GET /api/health` (usato anche dall'healthcheck Docker).
- **Log**: errori e eventi nella tabella `Log`, operazioni utente in `Audit` (come prima),
  più l'output del processo (`docker compose logs app`).
- **Job pianificati**: generazione proposte di riordino ogni `scheduler.minuti_intervallo_ordini`
  minuti e sync Mexal giornaliera a `scheduler.ora_sync_giornaliera`; ogni job rispetta il
  proprio interruttore (pannello Automazioni) e i parametri sono riletti ogni minuto.
  Con più istanze dell'app lasciare `SCHEDULER_ENABLED=true` su una sola, oppure disattivarlo
  e usare un cron esterno:
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://mes.azienda.it/api/cron/ordini-automatici`.
- **Sync Mexal da file**: il percorso configurato deve essere raggiungibile dal server
  dell'app (es. cartella condivisa montata nel container); in alternativa usare l'import manuale.
- **Backup**: database (piano di manutenzione SQL Server, come prima) + volume `/app/data`
  (documenti allegati).
- **Aggiornamenti**: `git pull && docker compose up -d --build`; se il rilascio lo indica,
  rieseguire `database/schema.sql` (idempotente).
