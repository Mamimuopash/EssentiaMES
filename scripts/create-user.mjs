#!/usr/bin/env node
/*
 * Crea un utente (o ne reimposta la password se esiste gia').
 *   npm run user:create -- --username mario --password 'Password.1' --ruolo Admin [--email mario@azienda.it]
 * Ruoli: Admin | Operatore | Reparto
 */
import { args, buildConfig, loadEnv, sql, upsertUser } from './_lib.mjs'

loadEnv()
const a = args()
if (!a.username || !a.password) {
  console.error("Uso: npm run user:create -- --username <nome> --password '<password>' [--ruolo Admin|Operatore|Reparto] [--email x]")
  process.exit(1)
}
const pool = await new sql.ConnectionPool(buildConfig()).connect()
try {
  await upsertUser(pool, { username: a.username, password: a.password, ruolo: a.ruolo || 'Operatore', email: a.email })
  console.log('OK')
} catch (e) {
  console.error('ERRORE:', e.message)
  process.exitCode = 1
} finally {
  await pool.close()
}
