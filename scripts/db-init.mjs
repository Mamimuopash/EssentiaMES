#!/usr/bin/env node
/*
 * Inizializza/aggiorna il database EssentiaMES.
 *
 *   npm run db:init                      -> applica database/schema.sql (idempotente)
 *   npm run db:init -- --create-db       -> crea il database se non esiste (serve permesso su master)
 *   npm run db:init -- --migrazioni      -> esegue anche database/migrazioni/*.sql
 *   npm run db:init -- --seed            -> dati DEMO + utenti demo (solo sviluppo/test!)
 *
 * Connessione da variabili d'ambiente o .env.local (vedi .env.example).
 */
import fs from 'node:fs'
import path from 'node:path'
import { args, buildConfig, loadEnv, runSqlFile, sql, upsertUser } from './_lib.mjs'

loadEnv()
const a = args()
const dbName = buildConfig().database

async function main() {
  if (a['create-db']) {
    const master = await new sql.ConnectionPool(buildConfig('master')).connect()
    const ex = await master.request().input('n', sql.NVarChar, dbName).query('SELECT DB_ID(@n) AS id')
    if (ex.recordset[0].id === null) {
      if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Nome database non valido: ${dbName}`)
      console.log(`-> creazione database ${dbName}`)
      await master.request().batch(`CREATE DATABASE [${dbName}]`)
    } else console.log(`-> database ${dbName} gia' presente`)
    await master.close()
  }
  const pool = await new sql.ConnectionPool(buildConfig()).connect()
  console.log(`-> connesso a ${dbName}`)
  console.log('-> schema.sql')
  await runSqlFile(pool, path.resolve('database/schema.sql'))
  if (a.migrazioni) {
    const dir = path.resolve('database/migrazioni')
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      console.log(`-> migrazioni/${f}`)
      await runSqlFile(pool, path.join(dir, f))
    }
  }
  if (a.seed) {
    console.log('-> seed-demo.sql')
    await runSqlFile(pool, path.resolve('database/seed-demo.sql'))
    console.log('-> utenti demo')
    await upsertUser(pool, { username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'Admin.2026!', ruolo: 'Admin' })
    const opId = await upsertUser(pool, { username: 'operatore', password: process.env.SEED_OPERATORE_PASSWORD || 'Operatore.2026!', ruolo: 'Operatore' })
    const m = await pool.request().input('n', sql.NVarChar, 'Mazak 200MSY L').query('SELECT TOP 1 IdMacchina FROM dbo.Brighetti_Macchine WHERE NomeMacchina = @n')
    if (m.recordset.length) {
      const idM = m.recordset[0].IdMacchina
      await pool.request().input('u', sql.NVarChar, opId).input('m', sql.Int, idM).query(
        `IF NOT EXISTS (SELECT 1 FROM dbo.AspNetMacchineUsers WHERE IdUtente = @u) INSERT dbo.AspNetMacchineUsers (IdUtente, IdMacchina, IdReparto) VALUES (@u, @m, 0);
         UPDATE dbo.Brighetti_Macchine SET IdUtente = @u WHERE IdMacchina = @m`,
      )
      console.log('   operatore associato alla macchina "Mazak 200MSY L"')
    }
  }
  await pool.close()
  console.log('OK')
}

main().catch((e) => {
  console.error('ERRORE:', e.message)
  process.exit(1)
})
