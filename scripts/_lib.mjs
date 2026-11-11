// Funzioni condivise dagli script di amministrazione (Node puro, nessuna build richiesta).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sql from 'mssql'

/** Carica .env.local / .env (senza sovrascrivere variabili gia' impostate). */
export function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m || line.trim().startsWith('#')) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[m[1]] === undefined) process.env[m[1]] = v
    }
  }
  if (!process.env.TZ) process.env.TZ = process.env.APP_TIMEZONE || 'Europe/Rome'
}

const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'si', 'on'].includes(String(v).toLowerCase()))

/** Stessa logica di src/lib/db.ts#buildConfig. */
export function buildConfig(database) {
  const options = {
    useUTC: false,
    enableArithAbort: true,
    encrypt: bool(process.env.DB_ENCRYPT, true),
    trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, false),
    appName: 'EssentiaMES-Script',
  }
  if (bool(process.env.DB_TLS_LEGACY, false)) {
    // Vedi src/lib/db.ts: SQL Server datati (TLS 1.0 / certificato debole).
    options.cryptoCredentialsDetails = { minVersion: 'TLSv1', ciphers: 'DEFAULT:@SECLEVEL=0', secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT }
  }
  if (process.env.DB_CONNECTION_STRING) {
    const parsed = sql.ConnectionPool.parseConnectionString(process.env.DB_CONNECTION_STRING)
    const cfg = { ...parsed, options: { ...(parsed.options || {}), ...options, encrypt: parsed.options?.encrypt ?? options.encrypt } }
    if (database) cfg.database = database
    return cfg
  }
  const cfg = {
    server: process.env.DB_SERVER || 'localhost',
    database: database || process.env.DB_NAME || 'Brighetti',
    options,
    connectionTimeout: 30000,
    requestTimeout: 600000,
  }
  if (process.env.DB_INSTANCE) cfg.options.instanceName = process.env.DB_INSTANCE
  else cfg.port = Number(process.env.DB_PORT || 1433)
  if ((process.env.DB_AUTH_TYPE || 'sql').toLowerCase() === 'ntlm') {
    cfg.authentication = { type: 'ntlm', options: { domain: process.env.DB_DOMAIN || '', userName: process.env.DB_USER || '', password: process.env.DB_PASSWORD || '' } }
  } else {
    cfg.user = process.env.DB_USER
    cfg.password = process.env.DB_PASSWORD
  }
  return cfg
}

/** Esegue uno script T-SQL diviso in batch dalle righe "GO" (come SSMS/sqlcmd). */
export async function runSqlFile(pool, file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
  const batches = text.split(/^\s*GO\s*;?\s*$/gim).map((b) => b.trim()).filter(Boolean)
  for (const b of batches) {
    const req = new sql.Request(pool)
    req.on('info', (i) => console.log(`   ${i.message}`))
    await req.batch(b)
  }
}

/** Hash password formato ASP.NET Identity V2 (come src/lib/auth/password.ts). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, 1000, 32, 'sha1')
  return Buffer.concat([Buffer.from([0]), salt, key]).toString('base64')
}

export function validatePassword(p) {
  const e = []
  if (!p || p.length < 6) e.push('almeno 6 caratteri')
  if (!/[0-9]/.test(p)) e.push('una cifra')
  if (!/[a-z]/.test(p)) e.push('una minuscola')
  if (!/[A-Z]/.test(p)) e.push('una maiuscola')
  if (!/[^a-zA-Z0-9]/.test(p)) e.push('un carattere speciale')
  return e
}

/** Crea (o aggiorna la password di) un utente con ruolo. */
export async function upsertUser(pool, { username, password, ruolo, email }) {
  const errs = validatePassword(password)
  if (errs.length) throw new Error(`Password non valida: servono ${errs.join(', ')}`)
  const role = await new sql.Request(pool).input('r', sql.NVarChar, ruolo).query('SELECT Id FROM dbo.AspNetRoles WHERE Name = @r')
  if (!role.recordset.length) throw new Error(`Ruolo ${ruolo} inesistente (eseguire prima lo schema)`)
  const roleId = role.recordset[0].Id
  const ex = await new sql.Request(pool).input('u', sql.NVarChar, username).query('SELECT Id FROM dbo.AspNetUsers WHERE UPPER(UserName) = UPPER(@u)')
  let id
  if (ex.recordset.length) {
    id = ex.recordset[0].Id
    await new sql.Request(pool)
      .input('id', sql.NVarChar, id)
      .input('h', sql.NVarChar, hashPassword(password))
      .input('s', sql.NVarChar, crypto.randomUUID())
      .query('UPDATE dbo.AspNetUsers SET PasswordHash = @h, SecurityStamp = @s, AccessFailedCount = 0, LockoutEndDateUtc = NULL WHERE Id = @id')
    console.log(`   utente "${username}" esistente: password aggiornata`)
  } else {
    id = crypto.randomUUID()
    await new sql.Request(pool)
      .input('id', sql.NVarChar, id)
      .input('e', sql.NVarChar, email || null)
      .input('h', sql.NVarChar, hashPassword(password))
      .input('s', sql.NVarChar, crypto.randomUUID())
      .input('u', sql.NVarChar, username)
      .query(`INSERT INTO dbo.AspNetUsers (Id, Email, EmailConfirmed, PasswordHash, SecurityStamp, PhoneNumber, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEndDateUtc, LockoutEnabled, AccessFailedCount, UserName)
              VALUES (@id, @e, 0, @h, @s, NULL, 0, 0, NULL, 1, 0, @u)`)
    console.log(`   utente "${username}" creato`)
  }
  await new sql.Request(pool)
    .input('id', sql.NVarChar, id)
    .input('r', sql.NVarChar, roleId)
    .query('IF NOT EXISTS (SELECT 1 FROM dbo.AspNetUserRoles WHERE UserId = @id AND RoleId = @r) INSERT dbo.AspNetUserRoles (UserId, RoleId) VALUES (@id, @r)')
  return id
}

export function args() {
  const out = {}
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue
    const k = a[i].slice(2)
    if (a[i + 1] !== undefined && !a[i + 1].startsWith('--')) out[k] = a[++i]
    else out[k] = true
  }
  return out
}

export { sql }
