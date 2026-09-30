import { route, readJson, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { eliminaUtente, ErroreUtente, reimpostaPassword } from '@/lib/services/utenti'

/** Reimpostazione password da parte dell'amministratore. */
export const PATCH = route<{ id: string }>({ admin: true, indirizzo: 'Account/ReimpostaPassword' }, async ({ req, params, op }) => {
  const b = await readJson<Record<string, unknown>>(req)
  try {
    await reimpostaPassword(params.id, str(b.password) ?? '')
  } catch (e) {
    if (e instanceof ErroreUtente) return { ok: false, message: e.message }
    throw e
  }
  await writeAudit(db, L.Warning, 'Account/ReimpostaPassword', 'Password reimpostata dall’amministratore', { UserId: params.id }, op)
  return { ok: true, message: 'Password reimpostata.' }
})

export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Account/CancellaUtente' }, async ({ params, user, op }) => {
  if (params.id === user.id) throw new ApiError(400, 'Non puoi cancellare il tuo stesso utente.')
  const u = await db.one<{ UserName: string }>(`SELECT UserName FROM dbo.AspNetUsers WHERE Id = @id`, { id: params.id })
  try {
    await eliminaUtente(params.id)
  } catch (e) {
    if (e instanceof ErroreUtente) return { ok: false, message: e.message }
    throw e
  }
  await writeAudit(db, L.Warning, 'Account/CancellaUtente', `Utente cancellato: ${u?.UserName}`, { Id: params.id }, op)
  return { ok: true, message: "L'utente è stato cancellato correttamente. Nello storico potrai sempre trovare i suoi ordini." }
})
