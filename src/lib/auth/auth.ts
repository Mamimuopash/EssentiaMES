import 'server-only'
import crypto from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { Ruoli } from '@/lib/enums'
import { SESSION_COOKIE, cookieSecure, signSession, verifySession } from './session'
import { verifyPassword } from './password'

export interface CurrentUser {
  id: string
  userName: string
  email: string | null
  roles: string[]
  isAdmin: boolean
  isOperatore: boolean
}

export const stampHash = (stamp: string | null | undefined) =>
  crypto.createHash('sha256').update(stamp || '').digest('hex').slice(0, 16)

interface UserRow {
  Id: string
  UserName: string
  Email: string | null
  PasswordHash: string | null
  SecurityStamp: string | null
  LockoutEnabled: boolean
  AccessFailedCount: number
  Bloccato: number
}

export async function loadRoles(userId: string): Promise<string[]> {
  const rows = await db.query<{ Name: string }>(
    `SELECT r.[Name] FROM dbo.AspNetUserRoles ur JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId WHERE ur.UserId = @id`,
    { id: userId },
  )
  return rows.map((r) => r.Name)
}

function toCurrentUser(u: { Id: string; UserName: string; Email: string | null }, roles: string[]): CurrentUser {
  return {
    id: u.Id,
    userName: u.UserName,
    email: u.Email,
    roles,
    isAdmin: roles.includes(Ruoli.Admin),
    isOperatore: roles.includes(Ruoli.Operatore),
  }
}

/** Utente della richiesta corrente (verifica token + stato attuale nel DB). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies()
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!payload) return null
  const u = await db.one<{ Id: string; UserName: string; Email: string | null; SecurityStamp: string | null }>(
    `SELECT Id, UserName, Email, SecurityStamp FROM dbo.AspNetUsers WHERE Id = @id`,
    { id: payload.sub },
  )
  // Utente cancellato o password cambiata dopo il login -> sessione non piu' valida.
  if (!u || stampHash(u.SecurityStamp) !== payload.st) return null
  return toCurrentUser(u, await loadRoles(u.Id))
})

/** Per le pagine: reindirizza al login (o alla home) se non autorizzato. */
export async function requirePageUser(opts?: { admin?: boolean }): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (opts?.admin && !user.isAdmin) redirect('/')
  return user
}

export type LoginResult =
  | { ok: true; user: CurrentUser; token: string; maxAge: number }
  | { ok: false; error: string }

const DUMMY_HASH = Buffer.alloc(49).toString('base64')
const LOCKOUT_MAX_FAILED = 5
const LOCKOUT_MINUTES = 5

function lockoutEnabled() {
  const v = (process.env.LOGIN_LOCKOUT || 'true').toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(v)
}

/**
 * Verifica credenziali come ASP.NET Identity (UserName case-insensitive).
 * Blocco account dopo 5 tentativi falliti per 5 minuti (colonne Identity
 * AccessFailedCount / LockoutEndDateUtc) per tutti gli utenti, disattivabile con LOGIN_LOCKOUT=false.
 */
export async function authenticate(userName: string, password: string, rememberMe: boolean): Promise<LoginResult> {
  const generic = 'Credenziali inserite non valide.'
  if (!userName || !password) return { ok: false, error: generic }
  const u = await db.one<UserRow>(
    `SELECT TOP 1 Id, UserName, Email, PasswordHash, SecurityStamp, LockoutEnabled, AccessFailedCount,
            CASE WHEN LockoutEndDateUtc IS NOT NULL AND LockoutEndDateUtc > GETUTCDATE() THEN 1 ELSE 0 END AS Bloccato
       FROM dbo.AspNetUsers WHERE UPPER(UserName) = UPPER(@u)`,
    { u: userName.trim() },
  )
  if (!u) {
    // Stesso costo computazionale anche per utenti inesistenti.
    verifyPassword(DUMMY_HASH, password)
    return { ok: false, error: generic }
  }
  // Il vecchio software non usava il blocco (LockoutEnabled = 0 sugli utenti storici):
  // ora l'app e' esposta su Internet, quindi il blocco vale per tutti gli utenti.
  const useLockout = lockoutEnabled()
  if (useLockout && u.Bloccato) {
    return { ok: false, error: `Account temporaneamente bloccato per troppi tentativi. Riprova tra ${LOCKOUT_MINUTES} minuti.` }
  }
  if (!verifyPassword(u.PasswordHash, password)) {
    if (useLockout) {
      const failed = (u.AccessFailedCount || 0) + 1
      if (failed >= LOCKOUT_MAX_FAILED) {
        await db.exec(
          `UPDATE dbo.AspNetUsers SET AccessFailedCount = 0, LockoutEndDateUtc = DATEADD(MINUTE, @m, GETUTCDATE()) WHERE Id = @id`,
          { id: u.Id, m: LOCKOUT_MINUTES },
        )
      } else {
        await db.exec(`UPDATE dbo.AspNetUsers SET AccessFailedCount = @f WHERE Id = @id`, { id: u.Id, f: failed })
      }
    }
    return { ok: false, error: generic }
  }
  if (u.AccessFailedCount) {
    await db.exec(`UPDATE dbo.AspNetUsers SET AccessFailedCount = 0 WHERE Id = @id`, { id: u.Id })
  }
  const roles = await loadRoles(u.Id)
  const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * Number(process.env.SESSION_HOURS || 12)
  const token = await signSession({ sub: u.Id, name: u.UserName, roles, st: stampHash(u.SecurityStamp) }, maxAge)
  return { ok: true, user: toCurrentUser(u, roles), token, maxAge }
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
