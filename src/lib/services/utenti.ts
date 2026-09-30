import 'server-only'
import crypto from 'node:crypto'
import { db, withTransaction } from '@/lib/db'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { Ruoli } from '@/lib/enums'

export class ErroreUtente extends Error {}

export interface UtenteView {
  Id: string
  UserName: string
  Email: string | null
  Ruoli: string | null
}

export async function elencoUtenti(soloOperatori = false): Promise<UtenteView[]> {
  return db.query<UtenteView>(
    `SELECT u.Id, u.UserName, u.Email,
            STUFF((SELECT N', ' + r.Name FROM dbo.AspNetUserRoles ur JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId WHERE ur.UserId = u.Id ORDER BY r.Name FOR XML PATH('')), 1, 2, N'') AS Ruoli
       FROM dbo.AspNetUsers u
      WHERE @solo = 0 OR EXISTS (SELECT 1 FROM dbo.AspNetUserRoles ur JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId WHERE ur.UserId = u.Id AND r.Name = @op)
      ORDER BY u.UserName`,
    { solo: soloOperatori ? 1 : 0, op: Ruoli.Operatore },
  )
}

/** Crea un utente compatibile ASP.NET Identity (password V2) con il ruolo indicato. */
export async function creaUtente(userName: string, email: string | null, password: string, ruolo: string): Promise<string> {
  const u = userName.trim()
  if (!u) throw new ErroreUtente('Il nome utente è obbligatorio.')
  if (![Ruoli.Admin, Ruoli.Operatore, Ruoli.Reparto].includes(ruolo as never)) throw new ErroreUtente('Ruolo non valido.')
  const errs = validatePassword(password)
  if (errs.length) throw new ErroreUtente(errs.join(' '))
  const e = email && email.trim() ? email.trim() : null
  const dup = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.AspNetUsers WHERE UPPER(UserName) = UPPER(@u)`, { u })
  if (dup && dup.n > 0) throw new ErroreUtente(`Il nome utente "${u}" è già in uso.`)
  if (e) {
    const dupE = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.AspNetUsers WHERE UPPER(Email) = UPPER(@e)`, { e })
    if (dupE && dupE.n > 0) throw new ErroreUtente(`L'email "${e}" è già in uso.`)
  }
  const role = await db.one<{ Id: string }>(`SELECT Id FROM dbo.AspNetRoles WHERE Name = @r`, { r: ruolo })
  if (!role) throw new ErroreUtente(`Ruolo "${ruolo}" non presente nel database (eseguire database/schema.sql).`)
  const id = crypto.randomUUID()
  await withTransaction(async (tx) => {
    await tx.exec(
      `INSERT INTO dbo.AspNetUsers (Id, Email, EmailConfirmed, PasswordHash, SecurityStamp, PhoneNumber, PhoneNumberConfirmed, TwoFactorEnabled,
                                    LockoutEndDateUtc, LockoutEnabled, AccessFailedCount, UserName)
       VALUES (@id, @e, 0, @h, @s, NULL, 0, 0, NULL, 1, 0, @u)`,
      { id, e, h: hashPassword(password), s: crypto.randomUUID(), u },
    )
    await tx.exec(`INSERT INTO dbo.AspNetUserRoles (UserId, RoleId) VALUES (@id, @r)`, { id, r: role.Id })
  })
  return id
}

export async function reimpostaPassword(id: string, password: string) {
  const errs = validatePassword(password)
  if (errs.length) throw new ErroreUtente(errs.join(' '))
  const n = await db.exec(
    `UPDATE dbo.AspNetUsers SET PasswordHash = @h, SecurityStamp = @s, AccessFailedCount = 0, LockoutEndDateUtc = NULL WHERE Id = @id`,
    { id, h: hashPassword(password), s: crypto.randomUUID() },
  )
  if (!n) throw new ErroreUtente('Utente non trovato.')
}

export async function eliminaUtente(id: string) {
  // Ruoli, claim e login esterni hanno FK ON DELETE CASCADE.
  const n = await db.exec(`DELETE FROM dbo.AspNetUsers WHERE Id = @id`, { id })
  if (!n) throw new ErroreUtente('Utente non trovato.')
}
