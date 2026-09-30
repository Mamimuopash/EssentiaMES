import { route, readJson, reqInt, int, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

export const PUT = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Magazzino/Edit' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<Record<string, unknown>>(req)
  const codice = (str(b.CodiceMagazzino) ?? '').trim()
  if (!codice) throw new ApiError(400, 'Il codice magazzino è obbligatorio.')
  const dati = { CodiceMagazzino: codice, DescrizioneMagazzino: str(b.DescrizioneMagazzino), TipologiaMagazzino: int(b.TipologiaMagazzino) === 1 ? 1 : 0 }
  const n = await db.exec(
    `UPDATE dbo.Brighetti_Magazzini SET CodiceMagazzino = @CodiceMagazzino, DescrizioneMagazzino = @DescrizioneMagazzino, TipologiaMagazzino = @TipologiaMagazzino,
            UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now WHERE Id = @id`,
    { ...dati, id, opId: op.id, opName: op.name, now: new Date() },
  )
  if (!n) throw new ApiError(404, 'Magazzino non trovato.')
  await writeAudit(db, L.Info, 'Brighetti_Magazzino/Edit', `Magazzino modificato: ${codice} (Id ${id})`, { Id: id, ...dati }, op)
  return { ok: true, message: 'Magazzino correttamente modificato' }
})

export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Magazzino/DeleteConfirmed' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const m = await db.one<{ CodiceMagazzino: string }>(`SELECT CodiceMagazzino FROM dbo.Brighetti_Magazzini WHERE Id = @id`, { id })
  if (!m) throw new ApiError(404, 'Magazzino non trovato.')
  await db.exec(`DELETE FROM dbo.Brighetti_Magazzini WHERE Id = @id`, { id })
  await writeAudit(db, L.Warning, 'Brighetti_Magazzino/DeleteConfirmed', `Magazzino eliminato: ${m.CodiceMagazzino} (Id ${id})`, { Id: id, CodiceMagazzino: m.CodiceMagazzino }, op)
  return { ok: true, message: 'Cancellazione Magazzino confermata correttamente' }
})
