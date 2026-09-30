import { route, readJson, int, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { likeEscape, termini } from '@/lib/sql-utils'
import { creaCicloAutomatico } from '@/lib/services/cicli'

const ORDINI: Record<string, string> = {
  codice: 'a.CodiceArticolo',
  descrizione: 'a.DescrizioneArticolo',
  importanza: 'a.Importanza',
  famiglia: 'f.NomeFamiglia',
  lotto: 'a.LottoMinimo',
  data: 'a.UltimaModifica_Data',
}

/** Elenco articoli con paginazione/ricerca lato server (vecchio Brighetti_Articolo/ServerProcessing). */
export const GET = route({ admin: true, indirizzo: 'Brighetti_Articolo/ServerProcessing' }, async ({ req }) => {
  const sp = req.nextUrl.searchParams
  const start = Math.max(0, int(sp.get('start')))
  const length = Math.min(500, Math.max(1, int(sp.get('length'), 25)))
  const orderCol = ORDINI[sp.get('order') || 'codice'] || ORDINI.codice
  const dir = sp.get('dir') === 'desc' ? 'DESC' : 'ASC'
  const params: Record<string, unknown> = { start, length }
  const where = termini(sp.get('search')).map((t, i) => {
    params[`t${i}`] = `%${likeEscape(t)}%`
    return `(a.CodiceArticolo LIKE @t${i} OR a.DescrizioneArticolo LIKE @t${i})`
  })
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const tot = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.Brighetti_Articoli`)
  const filt = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.Brighetti_Articoli a ${whereSql}`, params)
  const data = await db.query(
    `SELECT a.Id, a.CodiceArticolo, a.DescrizioneArticolo, a.NoteArticolo, a.Importanza, a.FamigliaId, a.LottoMinimo,
            ISNULL(f.NomeFamiglia, N'-') AS Famiglia, a.UltimaModifica_Data
       FROM dbo.Brighetti_Articoli a LEFT JOIN dbo.Brighetti_FamiglieProdotto f ON f.Id = a.FamigliaId
       ${whereSql}
      ORDER BY ${orderCol} ${dir}, a.Id
      OFFSET @start ROWS FETCH NEXT @length ROWS ONLY`,
    params,
  )
  return { ok: true, recordsTotal: tot?.n ?? 0, recordsFiltered: filt?.n ?? 0, data }
})

/** Creazione articolo + ciclo di lavoro automatico per i codici G.../B... (Brighetti_Articolo/Create). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Articolo/Create' }, async ({ req, op }) => {
  const b = await readJson<Record<string, unknown>>(req)
  const codice = (str(b.CodiceArticolo) ?? '').trim()
  if (!codice) throw new ApiError(400, 'Il codice articolo è obbligatorio.')
  const dup = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.Brighetti_Articoli WHERE CodiceArticolo = @c`, { c: codice })
  if (dup && dup.n > 0) throw new ApiError(409, `Esiste già un articolo con codice ${codice}.`)
  const art = {
    CodiceArticolo: codice,
    DescrizioneArticolo: str(b.DescrizioneArticolo),
    NoteArticolo: str(b.NoteArticolo),
    FamigliaId: int(b.FamigliaId),
    Importanza: int(b.Importanza, 1) || 1,
    LottoMinimo: int(b.LottoMinimo),
  }
  const id = await db.insert(
    `INSERT INTO dbo.Brighetti_Articoli (CodiceArticolo, DescrizioneArticolo, NoteArticolo, FamigliaId, Importanza, LottoMinimo,
                                         UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@CodiceArticolo, @DescrizioneArticolo, @NoteArticolo, @FamigliaId, @Importanza, @LottoMinimo, @opId, @opName, @now)`,
    { ...art, opId: op.id, opName: op.name, now: new Date() },
  )
  let messaggioCiclo = ''
  const ciclo = await creaCicloAutomatico(codice, op)
  if (ciclo?.creato) messaggioCiclo = ` Ciclo di lavoro standard creato (${ciclo.fasi} fasi).`
  else if (ciclo && ciclo.mancanti.length) messaggioCiclo = ` Ciclo automatico NON creato: mancano ${ciclo.mancanti.join(', ')}.`
  await writeAudit(db, L.Info, 'Brighetti_Articolo/Create', `Articolo creato: ${codice} - ${art.DescrizioneArticolo ?? ''}`, { Id: id, ...art }, op)
  return { ok: true, message: `Articolo correttamente inserito.${messaggioCiclo}`, id }
})
