import { route, readJson, reqInt, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

export const PUT = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Reparto/Edit' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<Record<string, unknown>>(req)
  const nome = (str(b.NomeReparto) ?? '').trim()
  if (!nome) throw new ApiError(400, 'Il nome reparto è obbligatorio.')
  const dati = { NomeReparto: nome, DescrizioneReparto: str(b.DescrizioneReparto) }
  const n = await db.exec(
    `UPDATE dbo.Brighetti_Reparti SET NomeReparto = @NomeReparto, DescrizioneReparto = @DescrizioneReparto,
            UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now WHERE IdReparto = @id`,
    { ...dati, id, opId: op.id, opName: op.name, now: new Date() },
  )
  if (!n) throw new ApiError(404, 'Reparto non trovato.')
  await writeAudit(db, L.Info, 'Brighetti_Reparto/Edit', `Reparto modificato: ${nome} (Id ${id})`, { IdReparto: id, ...dati }, op)
  return { ok: true, message: 'Reparto correttamente modificato' }
})

export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Reparto/DeleteConfirmed' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const r = await db.one<{ NomeReparto: string }>(`SELECT NomeReparto FROM dbo.Brighetti_Reparti WHERE IdReparto = @id`, { id })
  if (!r) throw new ApiError(404, 'Reparto non trovato.')
  await db.exec(`DELETE FROM dbo.Brighetti_Reparti WHERE IdReparto = @id`, { id })
  await writeAudit(db, L.Warning, 'Brighetti_Reparto/DeleteConfirmed', `Reparto eliminato: ${r.NomeReparto} (Id ${id})`, { Id: id, NomeReparto: r.NomeReparto }, op)
  return { ok: true, message: 'Cancellazione Reparto confermata correttamente' }
})
