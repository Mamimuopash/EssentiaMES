import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, sessionCookieOptions } from '@/lib/auth/auth'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { safeLog, L } from '@/lib/audit'
import { consentiTentativo } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'locale'
  if (!consentiTentativo(`login:${ip}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, message: 'Troppi tentativi di accesso. Riprova tra un minuto.' }, { status: 429 })
  }
  let body: { username?: string; password?: string; rememberMe?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Richiesta non valida.' }, { status: 400 })
  }
  try {
    const r = await authenticate(String(body.username || ''), String(body.password || ''), !!body.rememberMe)
    if (!r.ok) return NextResponse.json({ ok: false, message: r.error }, { status: 401 })
    const home = r.user.isOperatore && !r.user.isAdmin ? '/operatore' : '/dashboard'
    const res = NextResponse.json({ ok: true, redirect: home })
    res.cookies.set(SESSION_COOKIE, r.token, sessionCookieOptions(r.maxAge))
    return res
  } catch (e) {
    console.error('[login]', e)
    if ((e as Error).message?.includes('SESSION_SECRET')) {
      return NextResponse.json({ ok: false, message: 'Configurazione incompleta: impostare SESSION_SECRET (vedi README).' }, { status: 500 })
    }
    await safeLog(L.Errors, 'Account/Login', `Errore login: ${(e as Error).message}`, '', { id: '', name: String(body.username || '') })
    return NextResponse.json({ ok: false, message: 'Impossibile contattare il database. Riprovare più tardi.' }, { status: 503 })
  }
}
