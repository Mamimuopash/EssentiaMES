import 'server-only'
import { db, withTransaction, type Db } from '@/lib/db'
import {
  TipoAttivitaProcedura,
  TipoStatoAttivita,
  TipoTempoAttivita,
} from '@/lib/enums'
import { writeAudit, safeLog, L, type Operatore } from '@/lib/audit'
import { dateDiffMinutes, fmtDate, vbCInt } from '@/lib/format'
import { round2 } from './regole'
import { creaLottoDaVersamento } from './lotti'

/*
 * Flusso di produzione: porting di Brighetti_GiacenzaController.CreateODP e di
 * Brighetti_OperatoriController (Apri/Sospendi/ConcludiAttività) con le stesse
 * regole e la chiusura fase in transazione.
 */

export interface Attivita {
  IdAttività: number
  OrdineDiProduzione: string | null
  IncrementaleProcedura: number
  CodiceArticolo: string | null
  NomeAttività: string | null
  idReparto: number
  idMacchinaMagazzino: number
  QuantitàdaProdurre: number
  QuantitàProdotta: number
  QuantitàScartata: number
  StatoAttività: number
  TipoAttivitaProcedura: number
  UltimaModifica_OperatoreID: string | null
  UltimaModifica_Operatore: string | null
  UltimaModifica_Data: Date | null
}

export const ATTIVITA_COLS = `[IdAttività], OrdineDiProduzione, IncrementaleProcedura, CodiceArticolo, [NomeAttività], idReparto, idMacchinaMagazzino,
  CAST([QuantitàdaProdurre] AS FLOAT) AS [QuantitàdaProdurre], CAST([QuantitàProdotta] AS FLOAT) AS [QuantitàProdotta],
  CAST([QuantitàScartata] AS FLOAT) AS [QuantitàScartata], [StatoAttività], TipoAttivitaProcedura,
  UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data`

export class ErroreProduzione extends Error {}

const nomeStato = (s: number) =>
  Object.entries(TipoStatoAttivita).find(([, v]) => v === s)?.[0] ?? String(s)

export async function getAttivita(id: number, conn: Db = db): Promise<Attivita | undefined> {
  return conn.one<Attivita>(`SELECT ${ATTIVITA_COLS} FROM dbo.[Brighetti_Attività] WHERE [IdAttività] = @id`, { id })
}

/* ------------------------------------------------------------------ ODP */

export async function creaOdp(idArticolo: number, qta: number, op: Operatore) {
  const art = await db.one<{ Id: number; CodiceArticolo: string }>(
    `SELECT Id, CodiceArticolo FROM dbo.Brighetti_Articoli WHERE Id = @id`,
    { id: idArticolo },
  )
  if (!art) throw new ErroreProduzione('Articolo non trovato.')
  if (!(qta > 0)) throw new ErroreProduzione('Indicare una quantità da produrre maggiore di zero.')
  const procedure = await db.query<{
    IdProcedura: number
    CodiceArticolo: string
    IncrementaleProcedura: number
    NomeAttività: string | null
    idReparto: number
    idMacchinaMagazzino: number
    TipoAttivita: number
  }>(
    `SELECT IdProcedura, CodiceArticolo, IncrementaleProcedura, [NomeAttività], idReparto, idMacchinaMagazzino, TipoAttivita
       FROM dbo.Brighetti_Procedure WHERE CodiceArticolo = @c ORDER BY IncrementaleProcedura, IdProcedura`,
    { c: art.CodiceArticolo },
  )
  if (procedure.length === 0) {
    throw new ErroreProduzione(`Nessun ciclo di lavoro (procedura) definito per l'articolo ${art.CodiceArticolo}.`)
  }
  const now = new Date()
  // Stesso formato del vecchio software: "dd/MM/yyyy_<IdPrimaProcedura>"
  const odp = `${fmtDate(now)}_${procedure[0].IdProcedura}`
  await withTransaction(async (tx) => {
    let first = true
    for (const p of procedure) {
      await tx.exec(
        `INSERT INTO dbo.[Brighetti_Attività] (OrdineDiProduzione, IncrementaleProcedura, CodiceArticolo, [NomeAttività], idReparto, idMacchinaMagazzino,
            [QuantitàdaProdurre], [QuantitàProdotta], [QuantitàScartata], [StatoAttività], TipoAttivitaProcedura,
            UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
         VALUES (@odp, @inc, @art, @nome, @rep, @mac, @qta, 0, 0, @stato, @tipo, @opId, @opName, @now)`,
        {
          odp,
          inc: p.IncrementaleProcedura,
          art: p.CodiceArticolo,
          nome: p.NomeAttività,
          rep: p.idReparto,
          mac: p.idMacchinaMagazzino,
          qta,
          stato: first ? TipoStatoAttivita.In_attesa : TipoStatoAttivita.BloccoDaAttivitaPrecedente,
          tipo: p.TipoAttivita,
          opId: op.id,
          opName: op.name,
          now,
        },
      )
      first = false
    }
    await writeAudit(tx, L.Info, 'Brighetti_Giacenza/CreateODP', `ODP creato per articolo ${art.CodiceArticolo}, quantità ${qta}`,
      { IdArticolo: idArticolo, Qta: qta }, op)
  })
  return odp
}

/* ------------------------------------------------------------- ATTIVITA' */

export async function attivitaInCorsoMacchina(idMacchina: number): Promise<Attivita | undefined> {
  return db.one<Attivita>(
    `SELECT TOP 1 ${ATTIVITA_COLS} FROM dbo.[Brighetti_Attività]
      WHERE idMacchinaMagazzino = @m AND [StatoAttività] IN (@a, @l) ORDER BY [IdAttività]`,
    { m: idMacchina, a: TipoStatoAttivita.In_Attrezzaggio, l: TipoStatoAttivita.In_Lavorazione },
  )
}

export async function attivitaDisponibiliMacchina(idMacchina: number): Promise<Attivita[]> {
  return db.query<Attivita>(
    `SELECT ${ATTIVITA_COLS} FROM dbo.[Brighetti_Attività]
      WHERE idMacchinaMagazzino = @m AND [StatoAttività] IN (@w, @s) ORDER BY [IdAttività]`,
    { m: idMacchina, w: TipoStatoAttivita.In_attesa, s: TipoStatoAttivita.StandBy },
  )
}

/** Avvio attivita': stato 0 = attrezzaggio, 1 = lavorazione. */
export async function apriAttivita(id: number, stato: number, op: Operatore) {
  const a = await getAttivita(id)
  if (!a) throw new ErroreProduzione('Attività non trovata.')
  if (a.StatoAttività !== TipoStatoAttivita.In_attesa && a.StatoAttività !== TipoStatoAttivita.StandBy) {
    throw new ErroreProduzione(`L'attività non è avviabile (stato attuale: ${nomeStato(a.StatoAttività)}).`)
  }
  const inCorso = await attivitaInCorsoMacchina(a.idMacchinaMagazzino)
  if (inCorso && inCorso.IdAttività !== a.IdAttività) {
    throw new ErroreProduzione(`Sulla macchina è già in corso l'attività "${inCorso.NomeAttività}".`)
  }
  const nuovo = stato === 0 ? TipoStatoAttivita.In_Attrezzaggio : TipoStatoAttivita.In_Lavorazione
  await db.exec(
    `UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @s, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
      WHERE [IdAttività] = @id`,
    { s: nuovo, id, opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Warning, 'Brighetti_Operatori/ApriAttività', `Attività aperta correttamente: ${id}`,
    { IdAttività: id, StatoAttivita: stato }, op)
}

async function registraTempo(conn: Db, a: Attivita, tipo: number, fine: Date) {
  await conn.exec(
    `INSERT INTO dbo.Brighetti_Tempi ([IdAttività], [TipoAttività], DataInizio, DataFine, Note) VALUES (@id, @tipo, @inizio, @fine, N'')`,
    { id: a.IdAttività, tipo, inizio: a.UltimaModifica_Data ?? fine, fine },
  )
}

export async function sospendiAttivita(id: number, qtaProdotta: number, qtaScartata: number, op: Operatore) {
  const now = new Date()
  const a = await getAttivita(id)
  if (!a) throw new ErroreProduzione('Attività non trovata.')
  await withTransaction(async (tx) => {
    await tx.exec(
      `UPDATE dbo.[Brighetti_Attività] SET [QuantitàProdotta] = @p, [QuantitàScartata] = @s WHERE [IdAttività] = @id`,
      { id, p: qtaProdotta, s: qtaScartata },
    )
    if (a.StatoAttività === TipoStatoAttivita.In_Attrezzaggio) await registraTempo(tx, a, TipoTempoAttivita.Attrezzaggio, now)
    else if (a.StatoAttività === TipoStatoAttivita.In_Lavorazione) await registraTempo(tx, a, TipoTempoAttivita.Lavorazione, now)
    await tx.exec(
      `UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @st, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
        WHERE [IdAttività] = @id`,
      { id, st: TipoStatoAttivita.StandBy, opId: op.id, opName: op.name, now },
    )
    await writeAudit(tx, L.Warning, 'Brighetti_Operatori/SospendiAttività', `Attività sospesa correttamente: ${id}`,
      { IdAttività: id, QuantitàProdotta: qtaProdotta, QuantitàScartata: qtaScartata }, op)
  })
}

export interface EsitoConclusione {
  ok: boolean
  message: string
}

/**
 * Chiusura attivita' (stessa logica del vecchio ConcludiAttività):
 *  - da ATTREZZAGGIO: registra il tempo e passa in LAVORAZIONE;
 *  - da LAVORAZIONE con quantita' parziale: registra il tempo e torna IN ATTESA;
 *  - da LAVORAZIONE completata (in transazione): scarica la giacenza del magazzino
 *    della fase precedente, carica quella della fase successiva (+ dettaglio
 *    giacenza), chiude la fase di versamento e sblocca la lavorazione seguente;
 *    poi (fuori transazione) eventuale lotto automatico.
 */
export async function concludiAttivita(id: number, qtaProdotta: number, qtaScartata: number, op: Operatore): Promise<EsitoConclusione> {
  const now = new Date()
  const indirizzo = 'Brighetti_Operatori/ConcludiAttività'
  try {
    const a = await getAttivita(id)
    if (!a) return { ok: false, message: 'Attività non trovata.' }

    if (a.StatoAttività === TipoStatoAttivita.In_Attrezzaggio) {
      await withTransaction(async (tx) => {
        await tx.exec(
          `UPDATE dbo.[Brighetti_Attività] SET [QuantitàProdotta] = @p, [QuantitàScartata] = @s WHERE [IdAttività] = @id`,
          { id, p: qtaProdotta, s: qtaScartata },
        )
        await registraTempo(tx, a, TipoTempoAttivita.Attrezzaggio, now)
        await tx.exec(
          `UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @st, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
            WHERE [IdAttività] = @id`,
          { id, st: TipoStatoAttivita.In_Lavorazione, opId: op.id, opName: op.name, now },
        )
        await writeAudit(tx, L.Info, indirizzo, `Attrezzaggio concluso, avvio lavorazione: attività ${id}`,
          { IdAttività: id, CodiceArticolo: a.CodiceArticolo }, op, now)
      })
      return { ok: true, message: 'Attività conclusa correttamente' }
    }

    if (a.StatoAttività !== TipoStatoAttivita.In_Lavorazione) {
      return {
        ok: false,
        message: `Impossibile concludere: l'attività non è in Attrezzaggio o Lavorazione (stato attuale: ${nomeStato(a.StatoAttività)}).`,
      }
    }

    // --- In lavorazione ---
    if (round2(qtaProdotta) < round2(a.QuantitàdaProdurre)) {
      await withTransaction(async (tx) => {
        await tx.exec(
          `UPDATE dbo.[Brighetti_Attività] SET [QuantitàProdotta] = @p, [QuantitàScartata] = @s WHERE [IdAttività] = @id`,
          { id, p: qtaProdotta, s: qtaScartata },
        )
        await registraTempo(tx, a, TipoTempoAttivita.Lavorazione, now)
        await tx.exec(
          `UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @st, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
            WHERE [IdAttività] = @id`,
          { id, st: TipoStatoAttivita.In_attesa, opId: op.id, opName: op.name, now },
        )
        await writeAudit(tx, L.Info, indirizzo,
          `Quantità parziale registrata su attività ${id} (${qtaProdotta}/${a.QuantitàdaProdurre}), scarti: ${qtaScartata}`,
          { IdAttività: id, CodiceArticolo: a.CodiceArticolo, QuantitàProdotta: qtaProdotta, QuantitàScartata: qtaScartata, QuantitàdaProdurre: a.QuantitàdaProdurre },
          op, now)
      })
      return {
        ok: true,
        message: `Quantità parziale registrata (${qtaProdotta}/${a.QuantitàdaProdurre}). L'attività resta aperta.`,
      }
    }

    await withTransaction(async (tx) => {
      await tx.exec(
        `UPDATE dbo.[Brighetti_Attività] SET [QuantitàProdotta] = @p, [QuantitàScartata] = @s WHERE [IdAttività] = @id`,
        { id, p: qtaProdotta, s: qtaScartata },
      )
      await registraTempo(tx, a, TipoTempoAttivita.Lavorazione, now)

      // 1) Scarico della giacenza nel magazzino della fase precedente (versamento precedente).
      const precedente = await tx.one<{ IdProcedura: number; idMacchinaMagazzino: number }>(
        `SELECT TOP 1 IdProcedura, idMacchinaMagazzino FROM dbo.Brighetti_Procedure
          WHERE CodiceArticolo = @c AND IncrementaleProcedura = @inc ORDER BY IdProcedura`,
        { c: a.CodiceArticolo, inc: a.IncrementaleProcedura - 1 },
      )
      if (precedente) {
        const g = await tx.one<{ Id: number }>(
          `SELECT TOP 1 Id FROM dbo.Brighetti_Giacenze WHERE CodiceArticolo = @c AND CodiceMagazzino = @m ORDER BY Id`,
          { c: a.CodiceArticolo, m: String(precedente.idMacchinaMagazzino) },
        )
        if (g) {
          await tx.exec(
            `DELETE FROM dbo.Brighetti_DettagliGiacenza WHERE id = (
               SELECT TOP 1 id FROM dbo.Brighetti_DettagliGiacenza
                WHERE (Brighetti_Giacenza_Id = @g OR idGiacenza = @g) AND idProcedura = @p ORDER BY id)`,
            { g: g.Id, p: precedente.IdProcedura },
          )
          await tx.exec(
            `UPDATE dbo.Brighetti_Giacenze
                SET [QuantitàGiacenza] = CASE WHEN [QuantitàGiacenza] - @q < 0 THEN 0 ELSE [QuantitàGiacenza] - @q END
              WHERE Id = @g`,
            { g: g.Id, q: qtaProdotta },
          )
        }
      }

      // 2) Fase chiusa.
      await tx.exec(`UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @st WHERE [IdAttività] = @id`, {
        id,
        st: TipoStatoAttivita.Completato,
      })

      // 3) Carico nel magazzino della fase successiva (versamento) + dettaglio giacenza (per i lotti).
      const seguente = await tx.one<{ IdProcedura: number; idMacchinaMagazzino: number; IncrementaleProcedura: number }>(
        `SELECT TOP 1 IdProcedura, idMacchinaMagazzino, IncrementaleProcedura FROM dbo.Brighetti_Procedure
          WHERE CodiceArticolo = @c AND IncrementaleProcedura = @inc ORDER BY IdProcedura`,
        { c: a.CodiceArticolo, inc: a.IncrementaleProcedura + 1 },
      )
      if (seguente) {
        const mag = String(seguente.idMacchinaMagazzino)
        let g = await tx.one<{ Id: number }>(
          `SELECT TOP 1 Id FROM dbo.Brighetti_Giacenze WHERE CodiceArticolo = @c AND CodiceMagazzino = @m ORDER BY Id`,
          { c: a.CodiceArticolo, m: mag },
        )
        if (!g) {
          const newId = await tx.insert(
            `INSERT INTO dbo.Brighetti_Giacenze (CodiceArticolo, CodiceMagazzino, InPrevisioneEntrata, [QuantitàGiacenza], [QuantitàSottoscorta], [QuantitàScortaMassima],
                                                  UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
             VALUES (@c, @m, 0, @q, @q, 0, @opId, @opName, @now)`,
            { c: a.CodiceArticolo, m: mag, q: qtaProdotta, opId: op.id, opName: op.name, now },
          )
          g = { Id: newId }
        } else {
          await tx.exec(`UPDATE dbo.Brighetti_Giacenze SET [QuantitàGiacenza] = [QuantitàGiacenza] + @q WHERE Id = @g`, {
            g: g.Id,
            q: qtaProdotta,
          })
        }
        await tx.exec(
          `INSERT INTO dbo.Brighetti_DettagliGiacenza (idGiacenza, idProcedura, [QuantitàProdotta], Brighetti_Giacenza_Id) VALUES (@g, @p, @q, @g)`,
          { g: g.Id, p: seguente.IdProcedura, q: qtaProdotta },
        )
      }

      // 4) Chiusura della fase di versamento (fase successiva dello stesso ODP).
      const versamento = await tx.one<{ IdAttività: number }>(
        `SELECT TOP 1 [IdAttività] FROM dbo.[Brighetti_Attività]
          WHERE [IdAttività] > @id AND CodiceArticolo = @c AND IncrementaleProcedura = @inc
            AND ISNULL(OrdineDiProduzione, N'') = ISNULL(@odp, N'')
          ORDER BY [IdAttività]`,
        { id, c: a.CodiceArticolo, inc: a.IncrementaleProcedura + 1, odp: a.OrdineDiProduzione },
      )
      if (versamento) {
        await tx.exec(
          `UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @st, [QuantitàProdotta] = @p, [QuantitàScartata] = @s WHERE [IdAttività] = @v`,
          { v: versamento.IdAttività, st: TipoStatoAttivita.Completato, p: qtaProdotta, s: qtaScartata },
        )
      }

      // 5) Sblocco della lavorazione successiva dello stesso ODP.
      if (seguente) {
        const next = await tx.one<{ IdAttività: number }>(
          `SELECT TOP 1 [IdAttività] FROM dbo.[Brighetti_Attività]
            WHERE [IdAttività] > @id AND CodiceArticolo = @c AND IncrementaleProcedura = @inc
              AND ISNULL(OrdineDiProduzione, N'') = ISNULL(@odp, N'') AND [StatoAttività] = @blocco
            ORDER BY [IdAttività]`,
          {
            id,
            c: a.CodiceArticolo,
            inc: seguente.IncrementaleProcedura + 1,
            odp: a.OrdineDiProduzione,
            blocco: TipoStatoAttivita.BloccoDaAttivitaPrecedente,
          },
        )
        if (next) {
          await tx.exec(`UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @st WHERE [IdAttività] = @n`, {
            n: next.IdAttività,
            st: TipoStatoAttivita.In_attesa,
          })
        }
      }

      await tx.exec(
        `UPDATE dbo.[Brighetti_Attività] SET UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now WHERE [IdAttività] = @id`,
        { id, opId: op.id, opName: op.name, now },
      )
    })

    // Lotto automatico (dopo il commit; un errore qui non blocca la chiusura).
    try {
      await creaLottoDaVersamento(a.CodiceArticolo, qtaProdotta, op)
    } catch (e) {
      await safeLog(L.Warning, 'LottiAutomaticiService/CreaLottoDaVersamento', `Errore creazione lotto automatico: ${(e as Error).message}`, '', op)
    }
    await writeAudit(db, L.Info, indirizzo,
      `Attività conclusa: ${id} - articolo ${a.CodiceArticolo}, prodotti: ${qtaProdotta}, scarti: ${qtaScartata}`,
      { IdAttività: id, CodiceArticolo: a.CodiceArticolo, QuantitàProdotta: qtaProdotta, QuantitàScartata: qtaScartata }, op, now)
    return { ok: true, message: 'Attività conclusa correttamente' }
  } catch (e) {
    await safeLog(L.Warning, indirizzo, `Errore conclusione attività: \n${(e as Error).message}`, '', op)
    return { ok: false, message: 'Errore nella conclusione attività' }
  }
}

/* ---------------------------------------------------------- STORICO ODP */

export interface OrdineStorico {
  Id: string
  CodiceArticolo: string | null
  DataOrdine: Date | null
  OpName: string
}

/** ODP con attivita' modificate negli ultimi 7 giorni (Home/Storico). */
export async function storicoOrdini(): Promise<OrdineStorico[]> {
  const rows = await db.query<{ OrdineDiProduzione: string; CodiceArticolo: string | null; UltimaModifica_Data: Date | null; UltimaModifica_Operatore: string | null }>(`
    WITH odp AS (
      SELECT DISTINCT OrdineDiProduzione FROM dbo.[Brighetti_Attività]
       WHERE UltimaModifica_Data >= DATEADD(DAY, -7, CAST(CAST(GETDATE() AS DATE) AS DATETIME)) AND UltimaModifica_Data <= GETDATE()
         AND OrdineDiProduzione IS NOT NULL)
    SELECT o.OrdineDiProduzione, f.CodiceArticolo, f.UltimaModifica_Data, f.UltimaModifica_Operatore
      FROM odp o
      CROSS APPLY (SELECT TOP 1 CodiceArticolo, UltimaModifica_Data, UltimaModifica_Operatore FROM dbo.[Brighetti_Attività] a
                    WHERE a.OrdineDiProduzione = o.OrdineDiProduzione ORDER BY a.[IdAttività]) f
     ORDER BY f.UltimaModifica_Data DESC`)
  return rows.map((r) => {
    const op = r.UltimaModifica_Operatore || ''
    return {
      Id: r.OrdineDiProduzione,
      CodiceArticolo: r.CodiceArticolo,
      DataOrdine: r.UltimaModifica_Data,
      OpName: op.length > 20 ? `${op.substring(0, 15)}...` : op,
    }
  })
}

export interface DettaglioFaseOrdine {
  IncrementaleAttività: number
  NomeAttività: string | null
  Quantitàprodotta: number
  QuantitàScartata: number
  CountNote: number
  CountAllegati: number
  TempoLavorazione: number
  TempoAttrezzaggio: number
  PercCompletamento: number
  Stato: number
}

/** Dettaglio ODP: fasi di lavorazione con tempi, note e allegati (Home/MostraOrdine). */
export async function dettaglioOrdine(odp: string): Promise<DettaglioFaseOrdine[]> {
  const tot = await db.one<{ tot: number; compl: number }>(
    `SELECT COUNT(*) AS tot, SUM(CASE WHEN [StatoAttività] = @c THEN 1 ELSE 0 END) AS compl
       FROM dbo.[Brighetti_Attività] WHERE OrdineDiProduzione = @odp`,
    { odp, c: TipoStatoAttivita.Completato },
  )
  const perc = tot && tot.compl ? vbCInt((tot.compl * 100) / tot.tot) : 0
  const fasi = await db.query<Attivita>(
    `SELECT ${ATTIVITA_COLS} FROM dbo.[Brighetti_Attività]
      WHERE OrdineDiProduzione = @odp AND TipoAttivitaProcedura = @t ORDER BY IncrementaleProcedura, [IdAttività]`,
    { odp, t: TipoAttivitaProcedura.Lavorazione },
  )
  const out: DettaglioFaseOrdine[] = []
  for (const f of fasi) {
    const cnt = await db.one<{ note: number; doc: number }>(
      `SELECT (SELECT COUNT(*) FROM dbo.Brighetti_Note WHERE IdEsterno = @id AND TypeElem = 4) AS note,
              (SELECT COUNT(*) FROM dbo.Brighetti_Documenti WHERE IdEsterno = @id AND TypeElem = 4) AS doc`,
      { id: f.IdAttività },
    )
    const tempi = await db.query<{ TipoAttività: number; DataInizio: Date; DataFine: Date }>(
      `SELECT [TipoAttività], DataInizio, DataFine FROM dbo.Brighetti_Tempi WHERE [IdAttività] = @id ORDER BY IdTempo`,
      { id: f.IdAttività },
    )
    let lav = 0
    let att = 0
    for (const t of tempi) {
      if (t.TipoAttività === TipoTempoAttivita.Lavorazione) lav += dateDiffMinutes(t.DataInizio, t.DataFine)
      else att += dateDiffMinutes(t.DataInizio, t.DataFine)
    }
    out.push({
      IncrementaleAttività: f.IncrementaleProcedura,
      NomeAttività: f.NomeAttività,
      Quantitàprodotta: f.QuantitàProdotta,
      QuantitàScartata: f.QuantitàScartata,
      CountNote: cnt?.note ?? 0,
      CountAllegati: cnt?.doc ?? 0,
      TempoLavorazione: lav,
      TempoAttrezzaggio: att,
      PercCompletamento: perc,
      Stato: f.StatoAttività,
    })
  }
  return out
}
