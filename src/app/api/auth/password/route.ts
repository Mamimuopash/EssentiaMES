import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { route, readJson, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { hashPassword, validatePassword, verifyPassword } from '@/lib/auth/password'
import { signSession, SESSION_COOKIE } from '@/lib/auth/session'
import { sessionCookieOptions, stampHash } from '@/lib/auth/auth'
import { writeAudit, L } from '@/lib/audit'

/** Cambio password dell'utente corrente (Manage/ChangePassword). */
export const POST = route({ indirizzo: 'Manage/ChangePassword' }, async ({ req, user, op }) => {
  const b = await readJson<{ oldPassword?: string; newPassword?: string; confirmPassword?: string }>(req)
  const oldPassword = String(b.oldPassword || '')
  const newPassword = String(b.newPassword || '')
  if (newPassword !== String(b.confirmPassword || '')) throw new ApiError(400, 'La nuova password e la password di conferma non corrispondono.')
  const errs = validatePassword(newPassword)
  if (errs.length) throw new ApiError(400, errs.join(' '))
  const u = await db.one<{ PasswordHash: string | null }>(`SELECT PasswordHash FROM dbo.AspNetUsers WHERE Id = @id`, { id: user.id })
  if (!u || !verifyPassword(u.PasswordHash, oldPassword)) throw new ApiError(400, 'Password non corretta.')
  const stamp = crypto.randomUUID()
  await db.exec(`UPDATE dbo.AspNetUsers SET PasswordHash = @h, SecurityStamp = @s WHERE Id = @id`, {
    id: user.id,
    h: hashPassword(newPassword),
    s: stamp,
  })
  await writeAudit(db, L.Info, 'Manage/ChangePassword', 'Password modificata', { UserId: user.id }, op)
  // Nuovo token con il nuovo SecurityStamp (le altre sessioni aperte vengono invalidate).
  const maxAge = 60 * 60 * Number(process.env.SESSION_HOURS || 12)
  const token = await signSession({ sub: user.id, name: user.userName, roles: user.roles, st: stampHash(stamp) }, maxAge)
  const res = NextResponse.json({ ok: true, message: 'Password modificata.' })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
  return res
})
