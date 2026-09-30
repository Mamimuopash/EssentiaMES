import { route, readJson, int, str } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { likeEscape } from '@/lib/sql-utils'

/** Lotto minimo di massa per prefisso codice (Brighetti_Impostazioni/AggiornaLottoMinimoMassivo). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Impostazioni/AggiornaLottoMinimoMassivo' }, async ({ req, op }) => {
  const b = await readJson<{ prefisso?: unknown; valore?: unknown }>(req)
  const p = (str(b.prefisso) ?? '').trim()
  if (!p) return { ok: false, message: 'Inserire un prefisso codice (es. G8).' }
  const valore = int(b.valore)
  const n = await db.exec(
    `UPDATE dbo.Brighetti_Articoli SET LottoMinimo = @v, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
      WHERE CodiceArticolo LIKE @p`,
    { v: valore, p: `${likeEscape(p)}%`, opId: op.id, opName: op.name, now: new Date() },
  )
  const msg = `${n} articoli con prefisso '${p}' aggiornati con lotto minimo ${valore}.`
  await writeAudit(db, L.Warning, 'Brighetti_Impostazioni/AggiornaLottoMinimoMassivo', msg, { Prefisso: p, Valore: valore, Conteggio: n }, op)
  return { ok: true, message: msg }
})
