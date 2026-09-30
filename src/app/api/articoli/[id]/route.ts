import { route, readJson, reqInt, int, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { TipoElemento } from '@/lib/enums'
import { documentiDi, noteDi } from '@/lib/services/documenti'

/** Dettaglio articolo: anagrafica, note, documenti e ciclo (Brighetti_Articolo/Details). */
export const GET = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Articolo/Details' }, async ({ params }) => {
  const id = reqInt(params.id)
  const articolo = await db.one<Record<string, unknown> & { CodiceArticolo: string }>(
    `SELECT a.Id, a.CodiceArticolo, a.DescrizioneArticolo, a.NoteArticolo, a.FamigliaId, a.Importanza, a.LottoMinimo,
            f.NomeFamiglia AS Famiglia, a.UltimaModifica_Data, a.UltimaModifica_Operatore
       FROM dbo.Brighetti_Articoli a LEFT JOIN dbo.Brighetti_FamiglieProdotto f ON f.Id = a.FamigliaId WHERE a.Id = @id`,
    { id },
  )
  if (!articolo) throw new ApiError(404, 'Articolo non trovato.')
  const [note, documenti, procedure] = await Promise.all([
    noteDi(TipoElemento.Articolo, id),
    documentiDi(TipoElemento.Articolo, id),
    db.query(
      `SELECT IdProcedura, IncrementaleProcedura, [NomeAttività], TipoAttivita FROM dbo.Brighetti_Procedure
        WHERE CodiceArticolo = @c ORDER BY IncrementaleProcedura, IdProcedura`,
      { c: articolo.CodiceArticolo },
    ),
  ])
  return { ok: true, articolo, note, documenti, procedure }
})

/** Modifica articolo (Brighetti_Articolo/Edit). */
export const PUT = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Articolo/Edit' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<Record<string, unknown>>(req)
  const codice = (str(b.CodiceArticolo) ?? '').trim()
  if (!codice) throw new ApiError(400, 'Il codice articolo è obbligatorio.')
  const dati = {
    CodiceArticolo: codice,
    DescrizioneArticolo: str(b.DescrizioneArticolo),
    NoteArticolo: str(b.NoteArticolo),
    FamigliaId: int(b.FamigliaId),
    Importanza: int(b.Importanza, 1) || 1,
    LottoMinimo: int(b.LottoMinimo),
  }
  const n = await db.exec(
    `UPDATE dbo.Brighetti_Articoli SET CodiceArticolo = @CodiceArticolo, DescrizioneArticolo = @DescrizioneArticolo, NoteArticolo = @NoteArticolo,
            FamigliaId = @FamigliaId, Importanza = @Importanza, LottoMinimo = @LottoMinimo,
            UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
      WHERE Id = @id`,
    { ...dati, id, opId: op.id, opName: op.name, now: new Date() },
  )
  if (n === 0) return { ok: false, message: "Impossibile trovare l'articolo richiesto" }
  await writeAudit(db, L.Info, 'Brighetti_Articolo/Edit', `Articolo modificato: ${codice} (Id ${id})`, { Id: id, ...dati }, op)
  return { ok: true, message: 'Articolo correttamente aggiornato' }
})
