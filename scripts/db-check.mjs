#!/usr/bin/env node
/* Verifica la connessione al database e la presenza delle tabelle usate dall'app. */
import { buildConfig, loadEnv, sql } from './_lib.mjs'

loadEnv()
const TABELLE = ['AspNetUsers', 'AspNetRoles', 'AspNetUserRoles', 'AspNetMacchineUsers', 'Log', 'Audit', 'Articoli', 'Ordini', 'OrdiniInCorso',
  'Brighetti_Articoli', 'Brighetti_Magazzini', 'Brighetti_Reparti', 'Brighetti_Macchine', 'Brighetti_Procedure', 'Brighetti_Attività',
  'Brighetti_Tempi', 'Brighetti_Giacenze', 'Brighetti_DettagliGiacenza', 'Brighetti_Lotti', 'Brighetti_Lotti_Articoli', 'Brighetti_Note',
  'Brighetti_Documenti', 'Brighetti_Dati_Macchina', 'Brighetti_Dati_Macchina_Csv', 'Brighetti_Planimetria', 'Brighetti_Impostazioni',
  'Brighetti_OrdiniAutomatici', 'Brighetti_FamiglieProdotto']
const COLONNE = [['Brighetti_Articoli', 'LottoMinimo'], ['Brighetti_Giacenze', 'QuantitàScortaMassima'], ['Brighetti_Lotti', 'CodiceADLACL'],
  ['Brighetti_Attività', 'NascostaOperatore']]

const cfg = buildConfig()
console.log(`Connessione a ${cfg.server ?? '(connection string)'} / ${cfg.database} ...`)
const t0 = Date.now()
const pool = await new sql.ConnectionPool(cfg).connect().catch((e) => {
  console.error('ERRORE di connessione:', e.message)
  for (const s of suggerimenti(e)) console.error(`  - ${s}`)
  process.exit(1)
})
const info = await pool.request().query(
  'SELECT @@VERSION AS v, DB_NAME() AS db, SYSDATETIME() AS ora, (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) AS livello',
)
console.log(`OK in ${Date.now() - t0} ms - ${info.recordset[0].v.split('\n')[0]}`)
let mancanti = 0
// TRY_CONVERT e OFFSET/FETCH richiedono il livello di compatibilita' 110 (SQL Server 2012) o superiore.
const livello = info.recordset[0].livello
if (livello !== null && livello < 110) {
  console.log(`  Livello di compatibilita' del database = ${livello}: serve almeno 110 (ALTER DATABASE ... SET COMPATIBILITY_LEVEL = 110)`)
  mancanti++
}
for (const t of TABELLE) {
  const r = await pool.request().input('t', sql.NVarChar, `dbo.${t}`).query('SELECT OBJECT_ID(@t) AS id')
  if (r.recordset[0].id === null) {
    console.log(`  MANCA tabella ${t}`)
    mancanti++
  }
}
for (const [t, c] of COLONNE) {
  const r = await pool.request().input('t', sql.NVarChar, `dbo.${t}`).input('c', sql.NVarChar, c).query('SELECT COL_LENGTH(@t, @c) AS l')
  if (r.recordset[0].l === null) {
    console.log(`  MANCA colonna ${t}.${c}`)
    mancanti++
  }
}
await pool.close()
if (mancanti) {
  console.log(`${mancanti} problemi trovati: eseguire database/schema.sql con un account amministratore (npm run db:init, SSMS o deploy/windows/prepara-sql-server.ps1 -AggiornaSchema).`)
  process.exit(2)
}
console.log('Schema completo.')

/** Indicazioni pratiche in base all'errore di connessione (codici di tedious/mssql). */
function suggerimenti(e) {
  const m = `${e.code || ''} ${e.message || ''} ${e.originalError?.message || ''}`
  const out = []
  if (/ELOGIN|Login failed/i.test(m)) {
    out.push('Utente o password errati, oppure SQL Server accetta solo l\'autenticazione Windows (abilitare la modalita\' mista).')
    out.push("Con l'autenticazione Windows impostare DB_AUTH_TYPE=ntlm, DB_DOMAIN, DB_USER e DB_PASSWORD.")
  }
  if (/ESOCKET|ECONNREFUSED|ETIMEOUT|ENOTFOUND|Failed to connect/i.test(m)) {
    out.push('Server o porta non raggiungibili: verificare DB_SERVER/DB_PORT, che il protocollo TCP/IP sia attivo in SQL Server Configuration Manager e il firewall.')
    out.push('Per le istanze con nome (es. SQLEXPRESS) usare una porta fissa (DB_PORT) oppure DB_INSTANCE con il servizio SQL Server Browser attivo.')
  }
  if (/self[- ]signed|certificate|CERT_|unable to verify/i.test(m)) out.push('Certificato del server non attendibile: impostare DB_TRUST_SERVER_CERTIFICATE=true.')
  if (/SSL|TLS|EPROTO|handshake|wrong version|unsupported protocol|key too small|ECONNRESET/i.test(m)) {
    out.push('Errore TLS: con SQL Server 2008 R2/2012/2014 non aggiornati impostare DB_TLS_LEGACY=true (oppure DB_ENCRYPT=false).')
  }
  if (/Cannot open database|database .* does not exist/i.test(m)) out.push('Il database indicato in DB_NAME non esiste o il login non ha accesso (mappare l\'utente nel database).')
  return out
}
