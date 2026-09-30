import { route, readJson, reqInt, ApiError } from '@/lib/api'
import { db, withTransaction } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { TipoElemento } from '@/lib/enums'
import { documentiDi, noteDi } from '@/lib/services/documenti'
import { datiMacchina } from '@/lib/services/anagrafiche'

export const GET = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Macchina/Details' }, async ({ params }) => {
  const id = reqInt(params.id)
  const macchina = await db.one(
    `SELECT m.IdMacchina, m.NomeMacchina, m.DescrizioneMacchina, m.IdReparto, m.IdUtente, m.TipologiaMacchina, m.CollegamentoMacchina,
            r.NomeReparto, u.UserName AS NomeUtente, m.UltimaModifica_Data, m.UltimaModifica_Operatore
       FROM dbo.Brighetti_Macchine m
       LEFT JOIN dbo.Brighetti_Reparti r ON r.IdReparto = m.IdReparto
       LEFT JOIN dbo.AspNetUsers u ON u.Id = m.IdUtente
      WHERE m.IdMacchina = @id`,
    { id },
  )
  if (!macchina) throw new ApiError(404, 'Macchina non trovata.')
  const [note, documenti] = await Promise.all([noteDi(TipoElemento.Macchina, id), documentiDi(TipoElemento.Macchina, id)])
  return { ok: true, macchina, note, documenti }
})

/** Modifica macchina: se cambia l'operatore aggiorna anche l'associazione (AspNetMacchineUsers). */
export const PUT = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Macchina/Edit' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const dati = datiMacchina(await readJson<Record<string, unknown>>(req))
  const prima = await db.one<{ IdUtente: string | null }>(`SELECT IdUtente FROM dbo.Brighetti_Macchine WHERE IdMacchina = @id`, { id })
  if (!prima) throw new ApiError(404, 'Macchina non trovata.')
  await withTransaction(async (tx) => {
    if ((prima.IdUtente ?? '0') !== dati.IdUtente) {
      const n = await tx.exec(
        `UPDATE TOP (1) dbo.AspNetMacchineUsers SET IdUtente = @nuovo WHERE IdMacchina = @id AND IdUtente = @vecchio`,
        { id, nuovo: dati.IdUtente, vecchio: prima.IdUtente ?? '0' },
      )
      if (n === 0 && dati.IdUtente !== '0') {
        await tx.exec(`INSERT INTO dbo.AspNetMacchineUsers (IdUtente, IdMacchina, IdReparto) VALUES (@u, @m, 0)`, { u: dati.IdUtente, m: id })
      }
      if (dati.IdUtente === '0') {
        await tx.exec(`DELETE FROM dbo.AspNetMacchineUsers WHERE IdMacchina = @id AND IdUtente = N'0'`, { id })
      }
    }
    await tx.exec(
      `UPDATE dbo.Brighetti_Macchine SET NomeMacchina = @NomeMacchina, DescrizioneMacchina = @DescrizioneMacchina, IdReparto = @IdReparto, IdUtente = @IdUtente,
              TipologiaMacchina = @TipologiaMacchina, CollegamentoMacchina = @CollegamentoMacchina,
              UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
        WHERE IdMacchina = @id`,
      { ...dati, id, opId: op.id, opName: op.name, now: new Date() },
    )
    await writeAudit(tx, L.Info, 'Brighetti_Macchina/Edit', `Macchina modificata: ${dati.NomeMacchina} (Id ${id})`, { IdMacchina: id, ...dati }, op)
  })
  return { ok: true, message: 'Macchina correttamente modificata' }
})

export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Macchina/DeleteConfirmed' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const m = await db.one<{ NomeMacchina: string }>(`SELECT NomeMacchina FROM dbo.Brighetti_Macchine WHERE IdMacchina = @id`, { id })
  if (!m) throw new ApiError(404, 'Macchina non trovata.')
  await db.exec(`DELETE FROM dbo.Brighetti_Macchine WHERE IdMacchina = @id`, { id })
  await writeAudit(db, L.Warning, 'Brighetti_Macchina/DeleteConfirmed', `Macchina eliminata: ${m.NomeMacchina} (Id ${id})`, { IdMacchina: id, NomeMacchina: m.NomeMacchina }, op)
  return { ok: true, message: 'Cancellazione Macchina confermata correttamente' }
})
