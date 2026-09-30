import { SignJWT, jwtVerify } from 'jose'

/*
 * Token di sessione (JWT HS256) in cookie httpOnly.
 * Questo modulo non usa il DB: e' importabile anche dal proxy.
 */

export const SESSION_COOKIE = 'essentia_session'

export interface SessionPayload {
  sub: string // Id utente (AspNetUsers.Id)
  name: string // UserName
  roles: string[]
  /** Hash breve del SecurityStamp: cambia al cambio password -> sessione invalidata. */
  st: string
}

let devSecret: Uint8Array | null = null

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 32) return new TextEncoder().encode(s)
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET mancante o troppo corto (minimo 32 caratteri).')
  }
  if (!devSecret) {
    console.warn('[auth] SESSION_SECRET non impostato: uso un segreto temporaneo (solo sviluppo).')
    devSecret = crypto.getRandomValues(new Uint8Array(48))
  }
  return devSecret
}

export async function signSession(p: SessionPayload, maxAgeSeconds: number): Promise<string> {
  return new SignJWT({ name: p.name, roles: p.roles, st: p.st })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .sign(secret())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    // secret() lancia se SESSION_SECRET manca in produzione: sessione considerata assente.
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      name: String(payload.name ?? ''),
      roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
      st: String(payload.st ?? ''),
    }
  } catch {
    return null
  }
}

export function cookieSecure(): boolean {
  const v = process.env.COOKIE_SECURE
  if (v !== undefined && v !== '') return ['1', 'true', 'yes'].includes(v.toLowerCase())
  return process.env.NODE_ENV === 'production'
}
