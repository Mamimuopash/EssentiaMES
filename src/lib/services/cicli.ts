import 'server-only'
import { db, withTransaction, type Db } from '@/lib/db'
import { TipoAttivitaProcedura } from '@/lib/enums'
import { writeLog, L, type Operatore } from '@/lib/audit'
import { templateCiclo, templateCicloGenerico, type FaseTemplate } from './cicli-template'

export interface EsitoCiclo {
  creato: boolean
  fasi: number
  mancanti: string[]
}

/**
 * Crea le procedure (fasi) di un articolo a partire da un template.
 * Tutto-o-niente: se una macchina/magazzino del template non esiste, non crea
 * nulla e lo segnala nel Log (il vecchio codice salvava solo una parte delle fasi).
 */
export async function creaCicloDaTemplate(
  codice: string,
  template: FaseTemplate[],
  op: Operatore,
  conn: Db = db,
): Promise<EsitoCiclo> {
  const esistenti = await conn.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dbo.Brighetti_Procedure WHERE CodiceArticolo = @c`,
    { c: codice },
  )
  if (esistenti && esistenti.n > 0) return { creato: false, fasi: 0, mancanti: [] }

  const risolte: { f: FaseTemplate; idRisorsa: number; idReparto: number }[] = []
  const mancanti: string[] = []
  for (const f of template) {
    if (f.tipo === TipoAttivitaProcedura.Lavorazione) {
      const m = await conn.one<{ IdMacchina: number; IdReparto: number }>(
        `SELECT TOP 1 IdMacchina, IdReparto FROM dbo.Brighetti_Macchine WHERE NomeMacchina = @n ORDER BY IdMacchina`,
        { n: f.risorsa },
      )
      if (!m) mancanti.push(`macchina "${f.risorsa}"`)
      else risolte.push({ f, idRisorsa: m.IdMacchina, idReparto: m.IdReparto })
    } else {
      const m = await conn.one<{ Id: number }>(
        `SELECT TOP 1 Id FROM dbo.Brighetti_Magazzini WHERE CodiceMagazzino = @n ORDER BY Id`,
        { n: f.risorsa },
      )
      if (!m) mancanti.push(`magazzino "${f.risorsa}"`)
      else risolte.push({ f, idRisorsa: m.Id, idReparto: 0 })
    }
  }
  if (mancanti.length > 0) {
    await writeLog(conn, L.Warning, 'Brighetti_Articolo/Create',
      `Ciclo automatico NON creato per l'articolo ${codice}: mancano ${mancanti.join(', ')}.`, '', op)
    return { creato: false, fasi: 0, mancanti }
  }
  const now = new Date()
  for (const r of risolte) {
    await conn.exec(
      `INSERT INTO dbo.Brighetti_Procedure (CodiceArticolo, IncrementaleProcedura, TipoAttivita, idMacchinaMagazzino, idReparto, [NomeAttività],
                                            UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
       VALUES (@c, @inc, @tipo, @ris, @rep, @nome, @opId, @opName, @now)`,
      { c: codice, inc: r.f.incrementale, tipo: r.f.tipo, ris: r.idRisorsa, rep: r.idReparto, nome: r.f.nome, opId: op.id, opName: op.name, now },
    )
  }
  return { creato: true, fasi: risolte.length, mancanti: [] }
}

/** Ciclo automatico alla creazione articolo (se il codice corrisponde a un template). */
export async function creaCicloAutomatico(codice: string, op: Operatore): Promise<EsitoCiclo | null> {
  const t = templateCiclo(codice)
  if (!t) return null
  return withTransaction((tx) => creaCicloDaTemplate(codice, t, op, tx))
}

/** Genera il ciclo generico per tutti gli articoli che non hanno procedure. */
export async function generaCicliMancanti(op: Operatore): Promise<{ creati: number; saltati: number; errori: string[] }> {
  const articoli = await db.query<{ CodiceArticolo: string }>(
    `SELECT a.CodiceArticolo FROM dbo.Brighetti_Articoli a
      WHERE a.CodiceArticolo IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Procedure p WHERE p.CodiceArticolo = a.CodiceArticolo)
      ORDER BY a.Id`,
  )
  let creati = 0
  let saltati = 0
  const errori: string[] = []
  const sistema: Operatore = { id: '', name: op.name || 'Sistema' }
  for (const a of articoli) {
    try {
      const r = await withTransaction((tx) => creaCicloDaTemplate(a.CodiceArticolo, templateCicloGenerico(), sistema, tx))
      if (r.creato) creati++
      else {
        saltati++
        if (r.mancanti.length) {
          errori.push(`Mancano: ${r.mancanti.join(', ')}`)
          break // stesse risorse mancanti per tutti: inutile proseguire
        }
      }
    } catch (e) {
      errori.push(`${a.CodiceArticolo}: ${(e as Error).message}`)
    }
  }
  return { creati, saltati, errori }
}
