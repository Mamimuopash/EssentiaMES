import { route, readJson, int, ApiError } from '@/lib/api'
import { datiGiacenza } from '@/lib/services/anagrafiche'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { likeEscape, termini } from '@/lib/sql-utils'
import { GIACENZE_BASE, risolviCodiceArticolo } from '@/lib/services/giacenze'

const ORDINI: Record<string, string> = {
  articolo: 'CodiceArticolo',
  magazzino: 'Magazzino',
  giacenza: 'QuantitaGiacenza',
  sottoscorta: 'QuantitaSottoscorta',
  data: 'UltimaModifica_Data',
}

/** Elenco giacenze paginato lato server (vecchio Brighetti_Giacenza/ServerProcessing), filtrabile per magazzino. */
export const GET = route({ admin: true, indirizzo: 'Brighetti_Giacenza/ServerProcessing' }, async ({ req }) => {
  const sp = req.nextUrl.searchParams
  const start = Math.max(0, int(sp.get('start')))
  const length = Math.min(500, Math.max(1, int(sp.get('length'), 25)))
  const orderCol = ORDINI[sp.get('order') || 'articolo'] || ORDINI.articolo
  const dir = sp.get('dir') === 'desc' ? 'DESC' : 'ASC'
  const params: Record<string, unknown> = { start, length }
  const where: string[] = []
  termini(sp.get('search')).forEach((t, i) => {
    params[`t${i}`] = `%${likeEscape(t)}%`
    where.push(`(x.CodiceArticolo LIKE @t${i} OR x.Magazzino LIKE @t${i})`)
  })
  const mag = int(sp.get('magazzino'))
  if (mag > 0) {
    params.mag = mag
    where.push('x.IdMagazzino = @mag')
  }
  if (sp.get('sottoscorta') === '1') where.push('x.QuantitaSottoscorta > 0 AND x.QuantitaGiacenza + x.InPrevisioneEntrata <= x.QuantitaSottoscorta')
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const tot = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.Brighetti_Giacenze`)
  const filt = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM (${GIACENZE_BASE}) x ${whereSql}`, params)
  const data = await db.query(
    `SELECT * FROM (${GIACENZE_BASE}) x ${whereSql} ORDER BY x.${orderCol} ${dir}, x.Id OFFSET @start ROWS FETCH NEXT @length ROWS ONLY`,
    params,
  )
  return { ok: true, recordsTotal: tot?.n ?? 0, recordsFiltered: filt?.n ?? 0, data }
})

export const POST = route({ admin: true, indirizzo: 'Brighetti_Giacenza/Create' }, async ({ req, op }) => {
  const d = datiGiacenza(await readJson<Record<string, unknown>>(req))
  if (!d.art || d.art === '0' || !d.mag || d.mag === '0') throw new ApiError(400, 'Selezionare articolo e magazzino.')
  const codice = await risolviCodiceArticolo(d.art)
  const id = await db.insert(
    `INSERT INTO dbo.Brighetti_Giacenze (CodiceArticolo, CodiceMagazzino, [QuantitàGiacenza], [QuantitàSottoscorta], [QuantitàScortaMassima], InPrevisioneEntrata,
                                          UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@art, @mag, @g, @s, @m, 0, @opId, @opName, @now)`,
    { art: codice, mag: d.mag, g: d.QuantitaGiacenza, s: d.QuantitaSottoscorta, m: d.QuantitaScortaMassima, opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Info, 'Brighetti_Giacenza/Create', `Giacenza creata: articolo ${codice}, magazzino ${d.mag}`, { Id: id, CodiceArticolo: codice, CodiceMagazzino: d.mag, ...d }, op)
  return { ok: true, message: 'Giacenza correttamente inserita', id }
})
