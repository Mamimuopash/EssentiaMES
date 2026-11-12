import 'server-only'
import { db } from '@/lib/db'
import { TipoAttivitaProcedura, TipoStatoAttivita, TipoTempoAttivita } from '@/lib/enums'
import { fmtDate } from '@/lib/format'
import { inviaMail, smtpPresente } from '@/lib/mail'
import { writeLog, safeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiBool, leggiTesto } from './impostazioni'
import {
  htmlReportMacchine,
  htmlReportOdp,
  oggettoReportMacchine,
  oggettoReportOdp,
  parseDestinatari,
  type ReportMacchine,
  type ReportOdp,
  type RigaOdp,
  type RigaUsoMacchina,
} from './report-html'

/*
 * Email automatiche:
 *  - mail_odp: ogni giorno, lista degli ODP creati e/o lavorati nella giornata;
 *  - mail_uso_macchine: ogni settimana, tempo registrato su EssentiaMES da ogni macchina.
 * Lanciate dallo scheduler (lib/scheduler.ts) o a mano dal pannello Automazioni.
 */

const inizioGiorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const giornoDopo = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)

/** ODP creati nel giorno (prefisso "dd/MM/yyyy_" del codice) o con tempi/modifiche nel giorno. */
export async function datiReportOdp(giorno: Date): Promise<ReportOdp> {
  const da = inizioGiorno(giorno)
  const a = giornoDopo(da)
  const prefisso = `${fmtDate(new Date(da.getFullYear(), da.getMonth(), da.getDate(), 12))}_`
  const righe = await db.query<RigaOdp & { CreatoOggi: number | boolean }>(
    `WITH odp AS (
       SELECT OrdineDiProduzione FROM dbo.[Brighetti_Attività]
        WHERE OrdineDiProduzione IS NOT NULL
          AND (LEFT(OrdineDiProduzione, LEN(@pref)) = @pref OR (UltimaModifica_Data >= @da AND UltimaModifica_Data < @a))
       UNION
       SELECT at.OrdineDiProduzione FROM dbo.Brighetti_Tempi t
         JOIN dbo.[Brighetti_Attività] at ON at.[IdAttività] = t.[IdAttività]
        WHERE at.OrdineDiProduzione IS NOT NULL AND t.DataFine >= @da AND t.DataFine < @a
     ),
     fasi AS (
       SELECT x.OrdineDiProduzione AS Odp, MIN(x.CodiceArticolo) AS CodiceArticolo,
              CAST(MAX(x.[QuantitàdaProdurre]) AS FLOAT) AS Quantita, COUNT(*) AS Fasi,
              SUM(CASE WHEN x.[StatoAttività] IN (@compl, @ann) THEN 1 ELSE 0 END) AS FasiChiuse,
              MIN(x.[IdAttività]) AS PrimaId
         FROM dbo.[Brighetti_Attività] x JOIN odp o ON o.OrdineDiProduzione = x.OrdineDiProduzione
        GROUP BY x.OrdineDiProduzione
     )
     SELECT f.Odp, f.CodiceArticolo, f.Quantita, f.Fasi, f.FasiChiuse,
            fa.[NomeAttività] AS FaseAttuale, fa.[StatoAttività] AS StatoFaseAttuale,
            CASE WHEN fa.TipoAttivitaProcedura = @lav THEN m.NomeMacchina ELSE g.CodiceMagazzino END AS PostazioneFaseAttuale,
            CAST(CASE WHEN LEFT(f.Odp, LEN(@pref)) = @pref THEN 1 ELSE 0 END AS BIT) AS CreatoOggi,
            ISNULL(tm.MinAttrezzaggio, 0) AS MinAttrezzaggio, ISNULL(tm.MinLavorazione, 0) AS MinLavorazione
       FROM fasi f
       OUTER APPLY (SELECT TOP 1 y.[NomeAttività], y.[StatoAttività], y.TipoAttivitaProcedura, y.idMacchinaMagazzino
                      FROM dbo.[Brighetti_Attività] y
                     WHERE y.OrdineDiProduzione = f.Odp AND y.[StatoAttività] NOT IN (@compl, @ann)
                     ORDER BY y.IncrementaleProcedura, y.[IdAttività]) fa
       LEFT JOIN dbo.Brighetti_Macchine m ON m.IdMacchina = fa.idMacchinaMagazzino
       LEFT JOIN dbo.Brighetti_Magazzini g ON g.Id = fa.idMacchinaMagazzino
       OUTER APPLY (SELECT SUM(CASE WHEN t.[TipoAttività] = @tAtt THEN DATEDIFF(MINUTE, t.DataInizio, t.DataFine) ELSE 0 END) AS MinAttrezzaggio,
                           SUM(CASE WHEN t.[TipoAttività] = @tLav THEN DATEDIFF(MINUTE, t.DataInizio, t.DataFine) ELSE 0 END) AS MinLavorazione
                      FROM dbo.Brighetti_Tempi t JOIN dbo.[Brighetti_Attività] z ON z.[IdAttività] = t.[IdAttività]
                     WHERE z.OrdineDiProduzione = f.Odp AND t.DataFine >= @da AND t.DataFine < @a) tm
      ORDER BY f.PrimaId`,
    {
      pref: prefisso,
      da,
      a,
      compl: TipoStatoAttivita.Completato,
      ann: TipoStatoAttivita.Annullato,
      lav: TipoAttivitaProcedura.Lavorazione,
      tAtt: TipoTempoAttivita.Attrezzaggio,
      tLav: TipoTempoAttivita.Lavorazione,
    },
  )
  const aperti = await db.one<{ n: number }>(
    `SELECT COUNT(DISTINCT OrdineDiProduzione) AS n FROM dbo.[Brighetti_Attività]
      WHERE OrdineDiProduzione IS NOT NULL AND [StatoAttività] NOT IN (@compl, @ann)`,
    { compl: TipoStatoAttivita.Completato, ann: TipoStatoAttivita.Annullato },
  )
  return {
    giorno: da,
    righe: righe.map((r) => ({ ...r, CreatoOggi: !!r.CreatoOggi })),
    odpAperti: aperti?.n ?? 0,
  }
}

/** Tempi registrati per macchina (fasi di lavorazione) nei `giorni` che terminano con `fine` (escluso). */
export async function datiReportMacchine(fine: Date, giorni = 7): Promise<ReportMacchine> {
  const a = inizioGiorno(fine)
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate() - giorni)
  const righe = await db.query<RigaUsoMacchina>(
    `SELECT m.IdMacchina, m.NomeMacchina, r.NomeReparto AS Reparto,
            ISNULL(p.MinAttrezzaggio, 0) AS MinAttrezzaggio, ISNULL(p.MinLavorazione, 0) AS MinLavorazione,
            ISNULL(p.Attivita, 0) AS Attivita, ISNULL(p.Odp, 0) AS Odp, ISNULL(p.Giorni, 0) AS Giorni,
            u.UltimoUso
       FROM dbo.Brighetti_Macchine m
       LEFT JOIN dbo.Brighetti_Reparti r ON r.IdReparto = m.IdReparto
       OUTER APPLY (
         SELECT SUM(CASE WHEN t.[TipoAttività] = @tAtt THEN DATEDIFF(MINUTE, t.DataInizio, t.DataFine) ELSE 0 END) AS MinAttrezzaggio,
                SUM(CASE WHEN t.[TipoAttività] = @tLav THEN DATEDIFF(MINUTE, t.DataInizio, t.DataFine) ELSE 0 END) AS MinLavorazione,
                COUNT(DISTINCT t.[IdAttività]) AS Attivita,
                COUNT(DISTINCT x.OrdineDiProduzione) AS Odp,
                COUNT(DISTINCT CONVERT(DATE, t.DataFine)) AS Giorni
           FROM dbo.Brighetti_Tempi t JOIN dbo.[Brighetti_Attività] x ON x.[IdAttività] = t.[IdAttività]
          WHERE x.idMacchinaMagazzino = m.IdMacchina AND x.TipoAttivitaProcedura = @lav
            AND t.DataFine >= @da AND t.DataFine < @a) p
       OUTER APPLY (
         SELECT MAX(t.DataFine) AS UltimoUso
           FROM dbo.Brighetti_Tempi t JOIN dbo.[Brighetti_Attività] x ON x.[IdAttività] = t.[IdAttività]
          WHERE x.idMacchinaMagazzino = m.IdMacchina AND x.TipoAttivitaProcedura = @lav AND t.DataFine < @a) u
      ORDER BY m.NomeMacchina, m.IdMacchina`,
    { da, a, lav: TipoAttivitaProcedura.Lavorazione, tAtt: TipoTempoAttivita.Attrezzaggio, tLav: TipoTempoAttivita.Lavorazione },
  )
  return { da, a, righe }
}

export interface EsitoMail {
  ok: boolean
  message: string
}

const appUrl = () => process.env.APP_URL || undefined

async function invia(
  tipo: 'odp' | 'macchine',
  op: Operatore,
  opts: { destinatari?: string; rispettaToggle?: boolean; riferimento?: Date },
): Promise<EsitoMail> {
  const chiaveAbil = tipo === 'odp' ? Chiavi.MailOdpAbilitato : Chiavi.MailMacchineAbilitato
  const chiaveDest = tipo === 'odp' ? Chiavi.MailOdpDestinatari : Chiavi.MailMacchineDestinatari
  const indirizzo = tipo === 'odp' ? 'EmailAutomatiche/OdpGiornalieri' : 'EmailAutomatiche/UsoMacchine'
  if (opts.rispettaToggle && !(await leggiBool(chiaveAbil))) return { ok: true, message: 'Email automatica disattivata.' }

  const { validi, scartati } = parseDestinatari(opts.destinatari ?? (await leggiTesto(chiaveDest, '')))
  if (validi.length === 0) {
    const message = `Nessun destinatario valido: compilare "${chiaveDest}" nel pannello Automazioni.`
    await safeLog(L.Warning, indirizzo, message, '', op)
    return { ok: false, message }
  }
  if (!smtpPresente()) {
    const message = 'Email non inviata: server SMTP non configurato (SMTP_HOST, SMTP_FROM nel file essentia.env).'
    await safeLog(L.Warning, indirizzo, message, '', op)
    return { ok: false, message }
  }
  const rif = opts.riferimento ?? new Date()
  try {
    if (tipo === 'odp') {
      const dati = await datiReportOdp(rif)
      await inviaMail(validi, oggettoReportOdp(dati), htmlReportOdp(dati, appUrl()))
    } else {
      // Settimana che termina con la giornata di riferimento (inclusa).
      const dati = await datiReportMacchine(new Date(rif.getFullYear(), rif.getMonth(), rif.getDate() + 1))
      await inviaMail(validi, oggettoReportMacchine(dati), htmlReportMacchine(dati, appUrl()))
    }
  } catch (e) {
    const message = `Invio email non riuscito: ${(e as Error).message}`
    await safeLog(L.Errors, indirizzo, message, '', op)
    return { ok: false, message }
  }
  const message = `Email inviata a ${validi.join(', ')}${scartati.length ? ` (indirizzi ignorati: ${scartati.join(', ')})` : ''}.`
  await writeLog(db, L.Info, indirizzo, message, '', op)
  return { ok: true, message }
}

export function inviaMailOdp(op: Operatore, opts: { destinatari?: string; rispettaToggle?: boolean; riferimento?: Date } = {}) {
  return invia('odp', op, opts)
}

export function inviaMailUsoMacchine(op: Operatore, opts: { destinatari?: string; rispettaToggle?: boolean; riferimento?: Date } = {}) {
  return invia('macchine', op, opts)
}

/** Anteprima HTML (pannello Automazioni) senza inviare nulla. */
export async function anteprima(tipo: 'odp' | 'macchine', riferimento = new Date()): Promise<string> {
  if (tipo === 'odp') return htmlReportOdp(await datiReportOdp(riferimento), appUrl())
  return htmlReportMacchine(
    await datiReportMacchine(new Date(riferimento.getFullYear(), riferimento.getMonth(), riferimento.getDate() + 1)),
    appUrl(),
  )
}
