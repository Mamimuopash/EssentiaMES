import { route, readJson, reqInt, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { StatoOrdineAutomatico } from '@/lib/enums'

const AZIONI: Record<string, { stato: number; msg: string; da: number[] }> = {
  conferma: { stato: StatoOrdineAutomatico.Confermato, msg: 'Proposta di riordino confermata', da: [StatoOrdineAutomatico.Proposto] },
  annulla: { stato: StatoOrdineAutomatico.Annullato, msg: 'Proposta di riordino annullata', da: [StatoOrdineAutomatico.Proposto] },
  evaso: { stato: StatoOrdineAutomatico.Evaso, msg: 'Ordine di riordino segnato come evaso', da: [StatoOrdineAutomatico.Confermato, StatoOrdineAutomatico.Inviato] },
}

/** Conferma / annulla / evaso di una proposta (Brighetti_OrdiniAutomatici/Conferma|Annulla|Evaso). */
export const POST = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_OrdiniAutomatici/CambiaStato' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<{ azione?: unknown }>(req)
  const a = AZIONI[str(b.azione) ?? '']
  if (!a) throw new ApiError(400, 'Azione non valida.')
  const o = await db.one<{ Stato: number; CodiceArticolo: string | null }>(`SELECT Stato, CodiceArticolo FROM dbo.Brighetti_OrdiniAutomatici WHERE Id = @id`, { id })
  if (!o) return { ok: false, message: `Proposta di riordino non trovata (Id ${id}).` }
  if (!a.da.includes(o.Stato)) return { ok: false, message: 'Operazione non consentita nello stato attuale della proposta.' }
  await db.exec(
    `UPDATE dbo.Brighetti_OrdiniAutomatici SET Stato = @s, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now WHERE Id = @id`,
    { id, s: a.stato, opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Info, 'Brighetti_OrdiniAutomatici/CambiaStato', `${a.msg} (Id ${id}, articolo ${o.CodiceArticolo})`,
    { Id: id, StatoPrecedente: o.Stato, StatoNuovo: a.stato }, op)
  return { ok: true, message: a.msg }
})
