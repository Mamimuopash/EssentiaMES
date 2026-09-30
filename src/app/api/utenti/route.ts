import { route, readJson, str } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { creaUtente, elencoUtenti, ErroreUtente } from '@/lib/services/utenti'

export const GET = route({ admin: true, indirizzo: 'Account/Utenti' }, async () => ({ ok: true, utenti: await elencoUtenti() }))

/** Creazione utente (Account/CreaUtente): la password la sceglie l'amministratore. */
export const POST = route({ admin: true, indirizzo: 'Account/CreaUtente' }, async ({ req, op }) => {
  const b = await readJson<Record<string, unknown>>(req)
  try {
    const username = str(b.username) ?? ''
    const id = await creaUtente(username, str(b.email), str(b.password) ?? '', str(b.ruolo) ?? 'Operatore')
    await writeAudit(db, L.Info, 'Account/CreaUtente', `Utente creato: ${username}`, { Id: id, UserName: username, Ruolo: str(b.ruolo) }, op)
    return { ok: true, message: 'Utente creato correttamente.', id }
  } catch (e) {
    if (e instanceof ErroreUtente) return { ok: false, message: e.message }
    throw e
  }
})
