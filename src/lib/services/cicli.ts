import 'server-only'
import { db, withTransaction, type Db } from '@/lib/db'
import { TipoAttivitaProcedura, TipoStatoAttivita } from '@/lib/enums'
import { writeAudit, writeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiTesto, predefinito } from './impostazioni'
import {
  eFaseAffilatura,
  parolaSenzaAffilatura,
  parseParoleChiave,
  templateCiclo,
  templateCicloGenerico,
  togliAffilatura,
  type FaseTemplate,
} from './cicli-template'

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

/** Parole chiave degli articoli che non vanno in affilatura (pannello Automazioni). */
export async function paroleSenzaAffilatura(): Promise<string[]> {
  return parseParoleChiave(await leggiTesto(Chiavi.CicliParoleSenzaAffilatura, predefinito(Chiavi.CicliParoleSenzaAffilatura)))
}

/**
 * Ciclo da creare per un articolo: template G/B in base al codice, altrimenti (se
 * richiesto) il ciclo generico; senza affilatura se codice/descrizione contengono
 * una delle parole chiave (HDRED, TIN, ...).
 */
export function templatePerArticolo(
  codice: string,
  descrizione: string | null | undefined,
  parole: string[],
  usaGenerico: boolean,
): { template: FaseTemplate[]; tipo: 'G' | 'B' | 'generico'; senzaAffilatura: string | null } | null {
  const specifico = templateCiclo(codice)
  const base = specifico ?? (usaGenerico ? templateCicloGenerico() : null)
  if (!base) return null
  const tipo = specifico ? (specifico[0].risorsa === 'Mazak 250 MSY' ? 'B' : 'G') : 'generico'
  const parola = parolaSenzaAffilatura(codice, descrizione, parole)
  return { template: parola ? togliAffilatura(base) : base, tipo, senzaAffilatura: parola }
}

/** Ciclo automatico alla creazione articolo (se il codice corrisponde a un template). */
export async function creaCicloAutomatico(codice: string, op: Operatore, descrizione?: string | null): Promise<EsitoCiclo | null> {
  const t = templatePerArticolo(codice, descrizione, await paroleSenzaAffilatura(), false)
  if (!t) return null
  return withTransaction((tx) => creaCicloDaTemplate(codice, t.template, op, tx))
}

interface ArticoloSenzaCiclo {
  CodiceArticolo: string
  DescrizioneArticolo: string | null
}

async function articoliSenzaCiclo(): Promise<ArticoloSenzaCiclo[]> {
  return db.query<ArticoloSenzaCiclo>(
    `SELECT a.CodiceArticolo, a.DescrizioneArticolo FROM dbo.Brighetti_Articoli a
      WHERE a.CodiceArticolo IS NOT NULL AND LTRIM(RTRIM(a.CodiceArticolo)) <> N''
        AND NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Procedure p WHERE p.CodiceArticolo = a.CodiceArticolo)
      ORDER BY a.Id`,
  )
}

/** Quanti cicli verrebbero creati da "Genera cicli mancanti", per tipo (nessuna modifica). */
export async function anteprimaCicliMancanti() {
  const parole = await paroleSenzaAffilatura()
  const conteggio = { articoli: 0, G: 0, B: 0, generico: 0, senzaAffilatura: 0 }
  for (const a of await articoliSenzaCiclo()) {
    const t = templatePerArticolo(a.CodiceArticolo, a.DescrizioneArticolo, parole, true)!
    conteggio.articoli++
    conteggio[t.tipo]++
    if (t.senzaAffilatura) conteggio.senzaAffilatura++
  }
  return conteggio
}

/**
 * Crea il ciclo completo per tutti gli articoli che non hanno procedure: ciclo G o B
 * in base al codice (come alla creazione dell'articolo), altrimenti il ciclo generico;
 * senza affilatura per gli articoli con le parole chiave.
 */
export async function generaCicliMancanti(op: Operatore): Promise<{ creati: number; saltati: number; errori: string[] }> {
  const parole = await paroleSenzaAffilatura()
  let creati = 0
  let saltati = 0
  const errori: string[] = []
  const sistema: Operatore = { id: op.id, name: op.name || 'Sistema' }
  // Template con macchine/magazzini mancanti: inutile ritentarli per ogni articolo.
  const impossibili = new Set<string>()
  for (const a of await articoliSenzaCiclo()) {
    const t = templatePerArticolo(a.CodiceArticolo, a.DescrizioneArticolo, parole, true)!
    const chiave = `${t.tipo}|${t.senzaAffilatura ? 'senza' : 'con'}`
    if (impossibili.has(chiave)) {
      saltati++
      continue
    }
    try {
      const r = await withTransaction((tx) => creaCicloDaTemplate(a.CodiceArticolo, t.template, sistema, tx))
      if (r.creato) creati++
      else {
        saltati++
        if (r.mancanti.length) {
          impossibili.add(chiave)
          const msg = `Ciclo ${t.tipo}: mancano ${r.mancanti.join(', ')}`
          if (!errori.includes(msg)) errori.push(msg)
        }
      }
    } catch (e) {
      saltati++
      errori.push(`${a.CodiceArticolo}: ${(e as Error).message}`)
    }
  }
  return { creati, saltati, errori }
}

/* ------------------------------------------- affilatura sui cicli esistenti */

interface FaseDb {
  IdProcedura: number
  CodiceArticolo: string
  IncrementaleProcedura: number
  TipoAttivita: number
  NomeAttivita: string | null
  idMacchinaMagazzino: number
  idReparto: number
  Risorsa: string | null
  Reparto: string | null
}

export interface ArticoloDaTogliereAffilatura {
  CodiceArticolo: string
  DescrizioneArticolo: string | null
  Parola: string
  FaseAffilatura: string | null
  /** Attivita' ancora aperte di ODP dell'articolo: finche' ci sono, il ciclo non si tocca. */
  AttivitaAperte: number
}

async function fasiArticolo(conn: Db, codice: string): Promise<FaseDb[]> {
  return conn.query<FaseDb>(
    `SELECT p.IdProcedura, p.CodiceArticolo, p.IncrementaleProcedura, p.TipoAttivita, p.[NomeAttività] AS NomeAttivita,
            p.idMacchinaMagazzino, p.idReparto,
            CASE WHEN p.TipoAttivita = @lav THEN m.NomeMacchina ELSE g.CodiceMagazzino END AS Risorsa, r.NomeReparto AS Reparto
       FROM dbo.Brighetti_Procedure p
       LEFT JOIN dbo.Brighetti_Macchine m ON m.IdMacchina = p.idMacchinaMagazzino
       LEFT JOIN dbo.Brighetti_Magazzini g ON g.Id = p.idMacchinaMagazzino
       LEFT JOIN dbo.Brighetti_Reparti r ON r.IdReparto = CASE WHEN p.TipoAttivita = @lav THEN m.IdReparto ELSE p.idReparto END
      WHERE p.CodiceArticolo = @c
      ORDER BY p.IncrementaleProcedura, p.IdProcedura`,
    { c: codice, lav: TipoAttivitaProcedura.Lavorazione },
  )
}

const faseAffilatura = (f: FaseDb) =>
  eFaseAffilatura({ tipo: f.TipoAttivita, nome: f.NomeAttivita, risorsa: f.TipoAttivita === TipoAttivitaProcedura.Lavorazione ? f.Risorsa : null, reparto: f.Reparto })

/** Articoli con le parole chiave il cui ciclo ha ancora la fase di affilatura (nessuna modifica). */
export async function anteprimaSenzaAffilatura(): Promise<{ parole: string[]; articoli: ArticoloDaTogliereAffilatura[] }> {
  const parole = await paroleSenzaAffilatura()
  if (parole.length === 0) return { parole, articoli: [] }
  const candidati = await db.query<{ CodiceArticolo: string; DescrizioneArticolo: string | null; AttivitaAperte: number }>(
    `SELECT a.CodiceArticolo, MIN(a.DescrizioneArticolo) AS DescrizioneArticolo,
            (SELECT COUNT(*) FROM dbo.[Brighetti_Attività] x
              WHERE x.CodiceArticolo = a.CodiceArticolo AND x.[StatoAttività] NOT IN (@compl, @ann)) AS AttivitaAperte
       FROM dbo.Brighetti_Articoli a
      WHERE a.CodiceArticolo IS NOT NULL
        AND EXISTS (SELECT 1 FROM dbo.Brighetti_Procedure p WHERE p.CodiceArticolo = a.CodiceArticolo)
      GROUP BY a.CodiceArticolo
      ORDER BY a.CodiceArticolo`,
    { compl: TipoStatoAttivita.Completato, ann: TipoStatoAttivita.Annullato },
  )
  const articoli: ArticoloDaTogliereAffilatura[] = []
  for (const c of candidati) {
    const parola = parolaSenzaAffilatura(c.CodiceArticolo, c.DescrizioneArticolo, parole)
    if (!parola) continue
    const fase = (await fasiArticolo(db, c.CodiceArticolo)).find(faseAffilatura)
    if (!fase) continue
    articoli.push({ ...c, Parola: parola, FaseAffilatura: fase.NomeAttivita })
  }
  return { parole, articoli }
}

/**
 * Toglie la fase di affilatura (e il versamento nel magazzino Affilatura che la
 * precede) dai cicli degli articoli con le parole chiave e rinumera le fasi seguenti.
 * Gli articoli con ODP ancora aperti vengono saltati (le loro attivita' seguono il
 * ciclo vecchio). Le fasi tolte restano nell'Audit (JSON) per poterle ricreare.
 */
export async function togliAffilaturaDaiCicli(op: Operatore): Promise<{ modificati: number; saltati: string[] }> {
  const { articoli } = await anteprimaSenzaAffilatura()
  let modificati = 0
  const saltati: string[] = []
  for (const a of articoli) {
    if (a.AttivitaAperte > 0) {
      saltati.push(a.CodiceArticolo)
      continue
    }
    await withTransaction(async (tx) => {
      const fasi = await fasiArticolo(tx, a.CodiceArticolo)
      const i = fasi.findIndex(faseAffilatura)
      if (i < 0) return
      const inizio = i > 0 && fasi[i - 1].TipoAttivita === TipoAttivitaProcedura.Versamento ? i - 1 : i
      const tolte = fasi.slice(inizio, i + 1)
      const restanti = [...fasi.slice(0, inizio), ...fasi.slice(i + 1)]
      for (const f of tolte) await tx.exec(`DELETE FROM dbo.Brighetti_Procedure WHERE IdProcedura = @id`, { id: f.IdProcedura })
      const seguente = restanti[inizio]
      const now = new Date()
      for (let n = 0; n < restanti.length; n++) {
        const f = restanti[n]
        let nome = f.NomeAttivita
        if (f === seguente && tolte.length > 1 && /affilatura/i.test(nome || '')) {
          nome = `${(tolte[0].NomeAttivita || 'Versamento').replace(/\s+ad?\s+affilatura\s*$/i, '')} a Finito`
        }
        if (f.IncrementaleProcedura !== n + 1 || nome !== f.NomeAttivita) {
          await tx.exec(
            `UPDATE dbo.Brighetti_Procedure SET IncrementaleProcedura = @inc, [NomeAttività] = @nome,
                    UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
              WHERE IdProcedura = @id`,
            { id: f.IdProcedura, inc: n + 1, nome, opId: op.id, opName: op.name, now },
          )
        }
      }
      await writeAudit(tx, L.Warning, 'Brighetti_Procedure/TogliAffilatura',
        `Affilatura tolta dal ciclo dell'articolo ${a.CodiceArticolo} (parola "${a.Parola}"): eliminate ${tolte.length} fasi, ${restanti.length} fasi rinumerate`,
        { CodiceArticolo: a.CodiceArticolo, Parola: a.Parola, FasiEliminate: tolte, FasiPrima: fasi }, op)
    })
    modificati++
  }
  await writeLog(db, L.Info, 'Brighetti_Procedure/TogliAffilatura',
    `Cicli senza affilatura: ${modificati} articoli modificati, ${saltati.length} saltati per ODP aperti.`, '', op)
  return { modificati, saltati }
}
