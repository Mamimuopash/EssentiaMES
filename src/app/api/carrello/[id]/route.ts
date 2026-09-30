import { route, reqInt } from '@/lib/api'
import { db } from '@/lib/db'

/** Rimuove una riga dalla propria richiesta (Home/CancellaArticoloInOrdine). */
export const DELETE = route<{ id: string }>({ indirizzo: 'Home/CancellaArticoloInOrdine' }, async ({ params, user }) => {
  await db.exec(`DELETE FROM dbo.OrdiniInCorso WHERE Id = @id AND (UltimaModifica_OperatoreID = @u OR @admin = 1)`, {
    id: reqInt(params.id),
    u: user.id,
    admin: user.isAdmin ? 1 : 0,
  })
  return { ok: true, message: 'Articolo rimosso correttamente.' }
})
