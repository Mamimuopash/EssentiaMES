import { route, reqInt } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

export const DELETE = route<{ id: string }>({ indirizzo: 'Home/DeleteNota' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  await db.exec(`DELETE FROM dbo.Brighetti_Note WHERE Id = @id`, { id })
  await writeAudit(db, L.Info, 'Home/DeleteNota', 'Eliminata nota', id, op)
  return { ok: true, message: `Nota correttamente eliminata -> ${id}.`, id }
})
