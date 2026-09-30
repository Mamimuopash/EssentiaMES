import { route, reqInt } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

/** Cancellazione logica articolo del catalogo (Home/CancellaArticolo). */
export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Home/CancellaArticolo' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const a = await db.one<{ Nome_Articolo: string | null }>(`SELECT Nome_Articolo FROM dbo.Articoli WHERE Id = @id`, { id })
  await db.exec(`UPDATE dbo.Articoli SET ArticoloCancellato = 1 WHERE Id = @id`, { id })
  await writeAudit(db, L.Warning, 'Home/CancellaArticolo', `Articolo eliminato (soft delete): ${a?.Nome_Articolo} (Id ${id})`, { Id: id, Nome: a?.Nome_Articolo }, op)
  return { ok: true, message: 'Articolo correttamente cancellato dal magazzino.' }
})
