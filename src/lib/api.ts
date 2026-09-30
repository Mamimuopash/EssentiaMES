import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser, type CurrentUser } from '@/lib/auth/auth'
import { safeLog, L, type Operatore } from '@/lib/audit'

/*
 * Wrapper per le API (route handler): autenticazione, ruoli, controllo
 * same-origin sulle richieste di modifica e gestione uniforme degli errori
 * (risposta { ok:false, message } + riga nella tabella Log, come nel vecchio
 * software).
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface RouteCtx<P> {
  req: NextRequest
  user: CurrentUser
  op: Operatore
  params: P
}

type Handler<P> = (ctx: RouteCtx<P>) => Promise<Response | object>

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // client non-browser (script, curl): il cookie SameSite=Lax protegge comunque
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const allowed = new Set<string>()
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (host) allowed.add(host.split(',')[0].trim())
  allowed.add(req.nextUrl.host)
  for (const u of (process.env.APP_URL || '').split(',')) {
    try {
      if (u.trim()) allowed.add(new URL(u.trim()).host)
    } catch {
      /* ignora */
    }
  }
  return allowed.has(originHost)
}

export function route<P = Record<string, string>>(
  opts: { admin?: boolean; indirizzo: string; public?: boolean },
  fn: Handler<P>,
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) {
      return NextResponse.json({ ok: false, message: 'Origine della richiesta non consentita.' }, { status: 403 })
    }
    const user = await getCurrentUser()
    if (!user && !opts.public) {
      return NextResponse.json({ ok: false, message: 'Sessione scaduta: effettuare di nuovo il login.' }, { status: 401 })
    }
    if (opts.admin && !user?.isAdmin) {
      return NextResponse.json({ ok: false, message: 'Operazione riservata agli amministratori.' }, { status: 403 })
    }
    const op: Operatore = { id: user?.id ?? '', name: user?.userName ?? '' }
    const params = (context?.params ? await context.params : {}) as P
    try {
      const result = await fn({ req, user: user as CurrentUser, op, params })
      return result instanceof Response ? result : NextResponse.json(result)
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ ok: false, message: e.message }, { status: e.status })
      }
      const msg = (e as Error)?.message || String(e)
      console.error(`[api] ${opts.indirizzo}:`, e)
      await safeLog(L.Errors, opts.indirizzo, `Errore -> ${msg}`, '', op)
      return NextResponse.json({ ok: false, message: `Errore: ${msg}` }, { status: 500 })
    }
  }
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError(400, 'Richiesta non valida (JSON atteso).')
  }
}

/* --- conversioni tolleranti dei valori in ingresso --- */

export function str(v: unknown): string | null {
  if (v === undefined || v === null) return null
  return String(v)
}

export function num(v: unknown, def = 0): number {
  if (v === undefined || v === null || v === '') return def
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : def
}

export function int(v: unknown, def = 0): number {
  return Math.trunc(num(v, def))
}

export function reqInt(v: unknown, nome = 'id'): number {
  const n = Number(v)
  if (!Number.isInteger(n)) throw new ApiError(400, `Parametro "${nome}" non valido.`)
  return n
}
