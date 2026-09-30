import { route, readJson, reqInt, int, str, ApiError } from '@/lib/api'
import { db, withTransaction } from '@/lib/db'
import { writeAudit, safeLog, L } from '@/lib/audit'
import { StatoLotto, TipoElemento } from '@/lib/enums'
import { documentiDi, noteDi } from '@/lib/services/documenti'
import { sbloccaFaseDaLottoRitornato } from '@/lib/services/lotti'

export const GET = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Lotti/Details' }, async ({ params }) => {
  const id = reqInt(params.id)
  const lotto = await db.one(
    `SELECT IdLotto, NomeLotto, DescrizioneLotto, StatoLotto, TipologiaLotto, CodiceADLACL, Fornitore, IdMagazzinoProvenienza,
            UltimaModifica_Data, UltimaModifica_Operatore FROM dbo.Brighetti_Lotti WHERE IdLotto = @id`,
    { id },
  )
  if (!lotto) throw new ApiError(404, 'Lotto non trovato.')
  const [articoli, note, documenti] = await Promise.all([
    db.query(
      `SELECT IdLottoArticolo, IdArticolo, NomeArticolo, [QuantitàArticolo] AS QuantitaArticolo, NoteArticolo, StatoArticoloLotto
         FROM dbo.Brighetti_Lotti_Articoli WHERE IdLotto = @id ORDER BY IdLottoArticolo`,
      { id },
    ),
    noteDi(TipoElemento.Lotto, id),
    documentiDi(TipoElemento.Lotto, id),
  ])
  return { ok: true, lotto, articoli, note, documenti }
})

interface ArticoloLottoIn {
  IdLottoArticolo: number
  QuantitaArticolo: string | null
  StatoArticoloLotto: number
  NoteArticolo: string | null
}

/**
 * Modifica lotto e righe articolo (Brighetti_Lotti/Edit). Se il lotto passa a
 * "Ritornato" e l'automatismo e' attivo, sblocca la fase successiva.
 */
export const PUT = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Lotti/Edit' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<Record<string, unknown>>(req)
  const stato = int(b.StatoLotto)
  const d = {
    NomeLotto: str(b.NomeLotto),
    DescrizioneLotto: str(b.DescrizioneLotto),
    Fornitore: str(b.Fornitore),
    CodiceADLACL: str(b.CodiceADLACL),
    StatoLotto: [0, 1, 2, 3].includes(stato) ? stato : 0,
  }
  const articoli: ArticoloLottoIn[] = Array.isArray(b.Articoli)
    ? (b.Articoli as Record<string, unknown>[]).map((a) => ({
        IdLottoArticolo: int(a.IdLottoArticolo),
        QuantitaArticolo: str(a.QuantitaArticolo),
        StatoArticoloLotto: [0, 1, 2, 3].includes(int(a.StatoArticoloLotto)) ? int(a.StatoArticoloLotto) : 0,
        NoteArticolo: str(a.NoteArticolo),
      }))
    : []
  const now = new Date()
  const esiste = await db.one(`SELECT IdLotto FROM dbo.Brighetti_Lotti WHERE IdLotto = @id`, { id })
  if (!esiste) throw new ApiError(404, 'Lotto non trovato.')
  await withTransaction(async (tx) => {
    await tx.exec(
      `UPDATE dbo.Brighetti_Lotti SET NomeLotto = @NomeLotto, DescrizioneLotto = @DescrizioneLotto, Fornitore = @Fornitore, CodiceADLACL = @CodiceADLACL,
              StatoLotto = @StatoLotto, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
        WHERE IdLotto = @id`,
      { ...d, id, opId: op.id, opName: op.name, now },
    )
    await writeAudit(tx, L.Warning, 'Brighetti_Lotti/Edit', `Lotto Modificato correttamente: ${id}`, { IdLotto: id, ...d, ListaArticoli: articoli }, op)
    for (const a of articoli) {
      await tx.exec(
        `UPDATE dbo.Brighetti_Lotti_Articoli SET [QuantitàArticolo] = @q, StatoArticoloLotto = @s, NoteArticolo = @n
          WHERE IdLottoArticolo = @ida AND IdLotto = @id`,
        { q: a.QuantitaArticolo, s: a.StatoArticoloLotto, n: a.NoteArticolo, ida: a.IdLottoArticolo, id },
      )
      await writeAudit(tx, L.Warning, 'Brighetti_Lotti/Edit', `Articolo nel Lotto Modificato correttamente: ${a.IdLottoArticolo}`, a, op)
    }
  })
  let extra = ''
  if (d.StatoLotto === StatoLotto.Ritornato) {
    try {
      const n = await sbloccaFaseDaLottoRitornato(id, op)
      if (n > 0) extra = ` Sbloccate ${n} fasi successive.`
    } catch (e) {
      await safeLog(L.Warning, 'LottiAutomaticiService/SbloccaFaseDaLottoRitornato', `Errore sblocco fase: ${(e as Error).message}`, '', op)
    }
  }
  return { ok: true, message: `Lotto Modificato Correttamente!${extra}` }
})

export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Lotti/DeleteConfirmed' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const l = await db.one<{ NomeLotto: string | null }>(`SELECT NomeLotto FROM dbo.Brighetti_Lotti WHERE IdLotto = @id`, { id })
  if (!l) throw new ApiError(404, 'Lotto non trovato.')
  await withTransaction(async (tx) => {
    await tx.exec(`DELETE FROM dbo.Brighetti_Lotti_Articoli WHERE IdLotto = @id`, { id })
    await tx.exec(`DELETE FROM dbo.Brighetti_Lotti WHERE IdLotto = @id`, { id })
    await writeAudit(tx, L.Warning, 'Brighetti_Lotti/DeleteConfirmed', `Lotto eliminato: ${l.NomeLotto} (Id ${id})`, { Id: id, NomeLotto: l.NomeLotto }, op)
  })
  return { ok: true, message: 'Lotto eliminato' }
})
