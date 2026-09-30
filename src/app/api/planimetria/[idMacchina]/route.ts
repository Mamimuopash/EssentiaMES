import { route, reqInt } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

export const DELETE = route<{ idMacchina: string }>({ admin: true, indirizzo: 'Home/deletePinPoint' }, async ({ params, op }) => {
  const id = reqInt(params.idMacchina)
  await db.exec(`DELETE FROM dbo.Brighetti_Planimetria WHERE Id = (SELECT TOP 1 Id FROM dbo.Brighetti_Planimetria WHERE IdEsternoMacchina = @id ORDER BY Id)`, { id })
  await writeAudit(db, L.Info, 'Home/deletePinPoint', 'Pinpoint rimosso correttamente', { id }, op)
  return { ok: true, message: `Pinpoint rimosso correttamente -> ${id}.`, id }
})
