import 'server-only'
import { constants as cryptoConstants } from 'node:crypto'
import sql from 'mssql'

/*
 * Accesso a SQL Server (lo stesso database della vecchia applicazione ASP.NET).
 *
 * Le date nel DB sono salvate in ora LOCALE italiana (DateTime.Now lato .NET):
 * per leggerle/scriverle senza spostamenti usiamo `useUTC: false` e il processo
 * Node gira con TZ=Europe/Rome (vedi README e Dockerfile).
 */
if (!process.env.TZ) process.env.TZ = process.env.APP_TIMEZONE || 'Europe/Rome'

export { sql }

type SqlType = sql.ISqlTypeFactory | sql.ISqlType
/** Parametro tipizzato esplicitamente: `{ id: typed(sql.Int, 5) }`. */
export interface TypedParam {
  __typed: true
  type: SqlType
  value: unknown
}
export const typed = (type: SqlType, value: unknown): TypedParam => ({ __typed: true, type, value })

export type Params = Record<string, unknown>

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: Params): Promise<T[]>
  one<T = Record<string, unknown>>(text: string, params?: Params): Promise<T | undefined>
  /** Esegue e ritorna il numero di righe modificate. */
  exec(text: string, params?: Params): Promise<number>
  /** INSERT ... ; ritorna SCOPE_IDENTITY() */
  insert(text: string, params?: Params): Promise<number>
}

function bool(v: string | undefined, def: boolean) {
  if (v === undefined || v === '') return def
  return ['1', 'true', 'yes', 'si', 'on'].includes(v.toLowerCase())
}

export function buildConfig(): sql.config {
  const options: sql.IOptions = {
    useUTC: false,
    enableArithAbort: true,
    encrypt: bool(process.env.DB_ENCRYPT, true),
    trustServerCertificate: bool(process.env.DB_TRUST_SERVER_CERTIFICATE, false),
    appName: 'EssentiaMES-Next',
  }
  if (bool(process.env.DB_TLS_LEGACY, false)) {
    // SQL Server 2008 R2 / 2012 / 2014 senza aggiornamenti TLS 1.2 o con certificato
    // autogenerato debole: Node li rifiuterebbe con le impostazioni TLS predefinite.
    options.cryptoCredentialsDetails = {
      minVersion: 'TLSv1',
      ciphers: 'DEFAULT:@SECLEVEL=0',
      secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
    }
  }
  const pool = {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: 0,
    idleTimeoutMillis: 30000,
  }
  const connectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 15000)
  const requestTimeout = Number(process.env.DB_REQUEST_TIMEOUT_MS || 30000)

  if (process.env.DB_CONNECTION_STRING) {
    // Formato ADO.NET, es. "Server=srv,1433;Database=Brighetti;User Id=essentia;Password=...;Encrypt=true"
    const parsed = sql.ConnectionPool.parseConnectionString(process.env.DB_CONNECTION_STRING) as sql.config
    return {
      ...parsed,
      options: { ...(parsed.options || {}), ...options, encrypt: parsed.options?.encrypt ?? options.encrypt },
      pool,
      connectionTimeout,
      requestTimeout,
    }
  }

  const cfg: sql.config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'Brighetti',
    options,
    pool,
    connectionTimeout,
    requestTimeout,
  }
  if (process.env.DB_INSTANCE) {
    // Istanza con nome (es. SQLEXPRESS): usa SQL Browser (UDP 1434), la porta viene ignorata.
    cfg.options!.instanceName = process.env.DB_INSTANCE
  } else {
    cfg.port = Number(process.env.DB_PORT || 1433)
  }
  const authType = (process.env.DB_AUTH_TYPE || 'sql').toLowerCase()
  if (authType === 'ntlm') {
    // Autenticazione Windows (account di dominio) da host Linux/esterno.
    cfg.authentication = {
      type: 'ntlm',
      options: {
        domain: process.env.DB_DOMAIN || '',
        userName: process.env.DB_USER || '',
        password: process.env.DB_PASSWORD || '',
      },
    }
  } else {
    cfg.user = process.env.DB_USER
    cfg.password = process.env.DB_PASSWORD
  }
  return cfg
}

declare global {
  var __essentiaPool: Promise<sql.ConnectionPool> | undefined
}

export function getPool(): Promise<sql.ConnectionPool> {
  if (!globalThis.__essentiaPool) {
    const pool = new sql.ConnectionPool(buildConfig())
    pool.on('error', (err) => console.error('[db] errore pool', err))
    globalThis.__essentiaPool = pool.connect().catch((err) => {
      globalThis.__essentiaPool = undefined
      throw err
    })
  }
  return globalThis.__essentiaPool
}

function bindParams(req: sql.Request, params?: Params) {
  if (!params) return
  for (const [name, raw] of Object.entries(params)) {
    if (raw && typeof raw === 'object' && (raw as TypedParam).__typed) {
      const p = raw as TypedParam
      req.input(name, p.type as sql.ISqlType, p.value)
    } else if (raw === null || raw === undefined) {
      req.input(name, sql.NVarChar, null)
    } else if (typeof raw === 'number') {
      if (Number.isInteger(raw) && Math.abs(raw) < 2147483648) req.input(name, sql.Int, raw)
      else req.input(name, sql.Decimal(18, 6), raw)
    } else if (typeof raw === 'string') {
      req.input(name, sql.NVarChar(sql.MAX), raw)
    } else if (typeof raw === 'boolean') {
      req.input(name, sql.Bit, raw)
    } else if (raw instanceof Date) {
      req.input(name, sql.DateTime, raw)
    } else {
      req.input(name, raw)
    }
  }
}

function makeDb(newRequest: () => Promise<sql.Request>): Db {
  const run = async (text: string, params?: Params) => {
    const req = await newRequest()
    bindParams(req, params)
    return req.query(text)
  }
  return {
    async query<T>(text: string, params?: Params) {
      const r = await run(text, params)
      return (r.recordset || []) as T[]
    },
    async one<T>(text: string, params?: Params) {
      const r = await run(text, params)
      return (r.recordset?.[0] as T | undefined) ?? undefined
    },
    async exec(text: string, params?: Params) {
      const r = await run(text, params)
      return r.rowsAffected.reduce((a, b) => a + b, 0)
    },
    async insert(text: string, params?: Params) {
      const r = await run(`${text}; SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`, params)
      return Number(r.recordset?.[0]?.id ?? 0)
    },
  }
}

/** Accesso "semplice" (ogni query sul pool). */
export const db: Db = makeDb(async () => new sql.Request(await getPool()))

/**
 * Esegue `fn` in una transazione: commit se va a buon fine, rollback altrimenti.
 * Le query dentro `fn` devono usare il `tx` ricevuto.
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const pool = await getPool()
  const transaction = new sql.Transaction(pool)
  await transaction.begin()
  // Le richieste in una transazione mssql devono essere sequenziali: le serializziamo.
  let chain: Promise<unknown> = Promise.resolve()
  const tx = makeDb(async () => new sql.Request(transaction))
  const serial: Db = {
    query: (t, p) => (chain = chain.then(() => tx.query(t, p))) as never,
    one: (t, p) => (chain = chain.then(() => tx.one(t, p))) as never,
    exec: (t, p) => (chain = chain.then(() => tx.exec(t, p))) as never,
    insert: (t, p) => (chain = chain.then(() => tx.insert(t, p))) as never,
  }
  try {
    const result = await fn(serial)
    await chain
    await transaction.commit()
    return result
  } catch (err) {
    try {
      await transaction.rollback()
    } catch {
      /* transazione gia' annullata dal server */
    }
    throw err
  }
}

/** Verifica di connettivita' (usata da /api/health e dagli script). */
export async function ping(): Promise<{ ok: boolean; server?: string; database?: string; error?: string }> {
  try {
    const r = await db.one<{ server: string; database: string }>(
      'SELECT @@SERVERNAME AS server, DB_NAME() AS [database]',
    )
    return { ok: true, server: r?.server, database: r?.database }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
