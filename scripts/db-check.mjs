#!/usr/bin/env node
/* Verifica la connessione al database e la presenza delle tabelle usate dall'app. */
import { buildConfig, loadEnv, sql } from './_lib.mjs'

loadEnv()
const TABELLE = ['AspNetUsers', 'AspNetRoles', 'AspNetUserRoles', 'AspNetMacchineUsers', 'Log', 'Audit', 'Articoli', 'Ordini', 'OrdiniInCorso',
  'Brighetti_Articoli', 'Brighetti_Magazzini', 'Brighetti_Reparti', 'Brighetti_Macchine', 'Brighetti_Procedure', 'Brighetti_Attività',
  'Brighetti_Tempi', 'Brighetti_Giacenze', 'Brighetti_DettagliGiacenza', 'Brighetti_Lotti', 'Brighetti_Lotti_Articoli', 'Brighetti_Note',
  'Brighetti_Documenti', 'Brighetti_Dati_Macchina', 'Brighetti_Dati_Macchina_Csv', 'Brighetti_Planimetria', 'Brighetti_Impostazioni',
  'Brighetti_OrdiniAutomatici', 'Brighetti_FamiglieProdotto']
const COLONNE = [['Brighetti_Articoli', 'LottoMinimo'], ['Brighetti_Giacenze', 'QuantitàScortaMassima'], ['Brighetti_Lotti', 'CodiceADLACL']]

const cfg = buildConfig()
console.log(`Connessione a ${cfg.server ?? '(connection string)'} / ${cfg.database} ...`)
const t0 = Date.now()
const pool = await new sql.ConnectionPool(cfg).connect().catch((e) => {
  console.error('ERRORE di connessione:', e.message)
  process.exit(1)
})
const info = await pool.request().query('SELECT @@VERSION AS v, DB_NAME() AS db, SYSDATETIME() AS ora')
console.log(`OK in ${Date.now() - t0} ms - ${info.recordset[0].v.split('\n')[0]}`)
let mancanti = 0
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
  console.log(`${mancanti} oggetti mancanti: eseguire "npm run db:init" (o database/schema.sql da SSMS).`)
  process.exit(2)
}
console.log('Schema completo.')
