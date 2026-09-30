import { route, readJson, reqInt, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { datiProcedura } from '@/lib/services/anagrafiche'

export const PUT = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Procedura/Edit' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const d = datiProcedura(await readJson<Record<string, unknown>>(req))
  const n = await db.exec(
    `UPDATE dbo.Brighetti_Procedure SET CodiceArticolo = @CodiceArticolo, IncrementaleProcedura = @IncrementaleProcedura, TipoAttivita = @TipoAttivita,
            [NomeAttività] = @NomeAttivita, idReparto = @idReparto, idMacchinaMagazzino = @idMacchinaMagazzino,
            UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
      WHERE IdProcedura = @id`,
    { ...d, id, opId: op.id, opName: op.name, now: new Date() },
  )
  if (!n) throw new ApiError(404, 'Procedura non trovata.')
  await writeAudit(db, L.Info, 'Brighetti_Procedura/Edit', `Procedura modificata: ${d.NomeAttivita ?? ''} (Id ${id})`, { IdProcedura: id, ...d }, op)
  return { ok: true, message: 'Procedura modificata' }
})

export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Procedura/DeleteConfirmed' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const p = await db.one<{ NomeAttività: string | null; CodiceArticolo: string | null }>(
    `SELECT [NomeAttività], CodiceArticolo FROM dbo.Brighetti_Procedure WHERE IdProcedura = @id`,
    { id },
  )
  if (!p) throw new ApiError(404, 'Procedura non trovata.')
  await db.exec(`DELETE FROM dbo.Brighetti_Procedure WHERE IdProcedura = @id`, { id })
  await writeAudit(db, L.Warning, 'Brighetti_Procedura/DeleteConfirmed',
    `Procedura eliminata: ${p.NomeAttività} (articolo ${p.CodiceArticolo}, Id ${id})`, { Id: id, NomeAttività: p.NomeAttività, CodiceArticolo: p.CodiceArticolo }, op)
  return { ok: true, message: 'Procedura eliminata' }
})
