import 'server-only'
import { db } from '@/lib/db'
import { TipoAttivitaProcedura, TipoElemento, TipoMacchina, TipoStatoAttivita } from '@/lib/enums'
import { dateDiffMinutes, fmtDate, fmtDateTime } from '@/lib/format'
import { efficienzaDaIntervalli, efficienzaDaLetture, type Efficienza } from './regole'
import { ATTIVITA_COLS, type Attivita } from './produzione'

/* Porting di MacchineController.vb (stati, analisi, istanza, dati pinpoint). */

export interface Macchina {
  IdMacchina: number
  NomeMacchina: string | null
  DescrizioneMacchina: string | null
  IdReparto: number
  IdUtente: string | null
  TipologiaMacchina: number
  CollegamentoMacchina: string | null
  UltimaModifica_Data: Date | null
  UltimaModifica_Operatore: string | null
}

export const MACCHINA_COLS = `IdMacchina, NomeMacchina, DescrizioneMacchina, IdReparto, IdUtente, TipologiaMacchina, CollegamentoMacchina,
  UltimaModifica_Data, UltimaModifica_Operatore`

export async function getMacchina(id: number) {
  return db.one<Macchina>(`SELECT ${MACCHINA_COLS} FROM dbo.Brighetti_Macchine WHERE IdMacchina = @id`, { id })
}

const oggi = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

async function efficienzaGiorno(m: Macchina, dal: Date, al: Date): Promise<Efficienza | null> {
  if (m.TipologiaMacchina === TipoMacchina.mtconnect) {
    const rows = await db.query<{ DataRilevazione: Date }>(
      `SELECT DataRilevazione FROM dbo.Brighetti_Dati_Macchina
        WHERE idMacchina = @id AND DataRilevazione >= @dal AND DataRilevazione <= @al AND StatoOperativoMacchina = N'AUTOMATIC'
        ORDER BY id`,
      { id: m.IdMacchina, dal, al },
    )
    return efficienzaDaLetture(rows.map((r) => r.DataRilevazione))
  }
  if (m.TipologiaMacchina === TipoMacchina.Scheenberger) {
    const rows = await db.query<{ DataInizioLavorazione: Date; DataFineLavorazione: Date }>(
      `SELECT DataInizioLavorazione, DataFineLavorazione FROM dbo.Brighetti_Dati_Macchina_Csv
        WHERE idMacchina = @id AND DataRilevazione >= @dal AND DataRilevazione <= @al ORDER BY id`,
      { id: m.IdMacchina, dal, al },
    )
    return efficienzaDaIntervalli(rows.map((r) => ({ inizio: r.DataInizioLavorazione, fine: r.DataFineLavorazione })))
  }
  return null
}

interface UltimaLettura {
  DataRilevazione: Date
  ProgrammaDescrizione: string | null
  Programma: string | null
  StatoOperativoMacchina: string | null
}

async function ultimaLettura(m: Macchina): Promise<UltimaLettura | undefined> {
  if (m.TipologiaMacchina === TipoMacchina.mtconnect) {
    return db.one<UltimaLettura>(
      `SELECT TOP 1 DataRilevazione, ProgrammaDescrizione, Programma, StatoOperativoMacchina FROM dbo.Brighetti_Dati_Macchina
        WHERE idMacchina = @id ORDER BY id DESC`,
      { id: m.IdMacchina },
    )
  }
  if (m.TipologiaMacchina === TipoMacchina.Scheenberger) {
    return db.one<UltimaLettura>(
      `SELECT TOP 1 DataRilevazione, ProgrammaDescrizione, Programma, N'Lavorazione' AS StatoOperativoMacchina FROM dbo.Brighetti_Dati_Macchina_Csv
        WHERE idMacchina = @id ORDER BY id DESC`,
      { id: m.IdMacchina },
    )
  }
  return undefined
}

export interface StatoMacchinaRow {
  IdMacchina: number
  NomeMacchina: string | null
  StatoMacchina: string
  UltimiDatiRilevati: string
  UltimoProgrammaMacchina: string
  Efficienza: Efficienza | null
}

/** Tab "Stati Macchina" della dashboard (efficienza di ieri sulle 8 ore). */
export async function statiMacchine(): Promise<StatoMacchinaRow[]> {
  const macchine = await db.query<Macchina>(`SELECT ${MACCHINA_COLS} FROM dbo.Brighetti_Macchine ORDER BY IdMacchina`)
  const out: StatoMacchinaRow[] = []
  const al = oggi()
  const dal = addDays(al, -1)
  for (const m of macchine) {
    const ult = await ultimaLettura(m)
    if (!ult) {
      out.push({ IdMacchina: m.IdMacchina, NomeMacchina: m.NomeMacchina, StatoMacchina: '-', UltimiDatiRilevati: '-', UltimoProgrammaMacchina: '-', Efficienza: null })
      continue
    }
    out.push({
      IdMacchina: m.IdMacchina,
      NomeMacchina: m.NomeMacchina,
      StatoMacchina: ult.StatoOperativoMacchina ?? '-',
      UltimiDatiRilevati: fmtDate(ult.DataRilevazione),
      UltimoProgrammaMacchina: ult.ProgrammaDescrizione ?? '-',
      Efficienza: await efficienzaGiorno(m, dal, al),
    })
  }
  return out
}

/** Dati per il popover del pin in planimetria (Macchine/getDatiMacchina). */
export async function datiPinpoint(id: number) {
  const m = await getMacchina(id)
  if (!m) return null
  let programmaDesc = ''
  let dataRilevazione = ''
  const inCorso = await db.one<{ NomeAttività: string | null; UltimaModifica_Data: Date | null }>(
    `SELECT TOP 1 [NomeAttività], UltimaModifica_Data FROM dbo.[Brighetti_Attività]
      WHERE idMacchinaMagazzino = @id AND [StatoAttività] IN (@a, @l) ORDER BY [IdAttività]`,
    { id, a: TipoStatoAttivita.In_Attrezzaggio, l: TipoStatoAttivita.In_Lavorazione },
  )
  let attivita = ''
  if (inCorso) {
    attivita = `${inCorso.NomeAttività ?? ''} - in lavorazione da: ${dateDiffMinutes(inCorso.UltimaModifica_Data, new Date())} min.`
  }
  const ult = await ultimaLettura(m)
  if (ult) {
    programmaDesc = ult.ProgrammaDescrizione ?? ''
    dataRilevazione = fmtDateTime(ult.DataRilevazione)
  }
  if (programmaDesc === '') {
    programmaDesc = attivita
    dataRilevazione = fmtDate(new Date())
  }
  return { nomeMacchina: m.NomeMacchina, descrizioneMacchina: m.DescrizioneMacchina, programmaDesc, dataRilevazione, accesa: !!inCorso }
}

export interface PinMacchina {
  IdMacchina: number
  NomeMacchina: string | null
  DescrizioneMacchina: string | null
  posX: string | null
  posY: string | null
  MacchinaAccesa: boolean
}

/** Pin della planimetria (AdminDashboard). */
export async function pinPlanimetria(): Promise<PinMacchina[]> {
  const rows = await db.query<PinMacchina & { accese: number }>(`
    SELECT m.IdMacchina, m.NomeMacchina, m.DescrizioneMacchina, p.posX, p.posY,
           (SELECT COUNT(*) FROM dbo.[Brighetti_Attività] a WHERE a.idMacchinaMagazzino = m.IdMacchina AND a.[StatoAttività] IN (1, 2)) AS accese
      FROM dbo.Brighetti_Macchine m
      CROSS APPLY (SELECT TOP 1 posX, posY FROM dbo.Brighetti_Planimetria x WHERE x.IdEsternoMacchina = m.IdMacchina ORDER BY x.Id) p
     ORDER BY m.IdMacchina`)
  return rows.map((r) => ({ ...r, MacchinaAccesa: r.accese > 0 }))
}

export async function macchineSenzaPin() {
  return db.query<{ IdMacchina: number; NomeMacchina: string | null }>(
    `SELECT IdMacchina, NomeMacchina FROM dbo.Brighetti_Macchine m
      WHERE NOT EXISTS (SELECT 1 FROM dbo.Brighetti_Planimetria p WHERE p.IdEsternoMacchina = m.IdMacchina)
      ORDER BY IdMacchina`,
  )
}

/* ---------------------------------------------------------------- ANALISI */

export interface Analisi {
  IdMacchina: number
  NomeMacchina: string | null
  Collegata: boolean
  ListaEff: { Data: string; PercEfficienza: number; PercTotale: number }[]
  ListaProduzione: { Articolo: string | null; QuantitàProdotta: number; QuantitàScartata: number; TempoDiProduzione: number }[]
  ListaPrevisione: { Articolo: string | null; qtaProdurre: number; DataCreazione: string }[]
  GaugeProdotti: number
  GaugeScartati: number
  GaugeCoda: number
  Dal: string
  Al: string
}

function parseYmd(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null
  const d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Analisi macchina. `periodo` = "yyyyMMdd-yyyyMMdd" (default ultimi 7 giorni);
 * la data di fine e' inclusa.
 */
export async function analisiMacchina(id: number, periodo?: string | null): Promise<Analisi | null> {
  const m = await getMacchina(id)
  if (!m) return null
  let dal = addDays(oggi(), -7)
  let alIncl = oggi()
  if (periodo && periodo.includes('-')) {
    const [a, b] = periodo.split('-')
    const pa = parseYmd(a)
    const pb = parseYmd(b)
    if (pa && pb) {
      dal = pa
      alIncl = pb
    }
  }
  const alEscl = addDays(alIncl, 1)

  const ListaEff: Analisi['ListaEff'] = []
  const collegata = m.TipologiaMacchina === TipoMacchina.mtconnect || m.TipologiaMacchina === TipoMacchina.Scheenberger
  if (collegata) {
    for (let i = 1; i <= 7; i++) {
      const giornoAl = addDays(oggi(), -i + 1)
      const giornoDal = addDays(oggi(), -i)
      const e = await efficienzaGiorno(m, giornoDal, giornoAl)
      ListaEff.push({ Data: fmtDate(giornoDal), PercEfficienza: e?.perc ?? 0, PercTotale: e?.percFermo ?? 100 })
    }
  }

  const prod = await db.query<{ IdAttività: number; CodiceArticolo: string | null; QuantitàProdotta: number; QuantitàScartata: number; minuti: number | null }>(
    `SELECT a.[IdAttività], a.CodiceArticolo, CAST(a.[QuantitàProdotta] AS FLOAT) AS [QuantitàProdotta], CAST(a.[QuantitàScartata] AS FLOAT) AS [QuantitàScartata],
            (SELECT SUM(DATEDIFF(MINUTE, t.DataInizio, t.DataFine)) FROM dbo.Brighetti_Tempi t WHERE t.[IdAttività] = a.[IdAttività]) AS minuti
       FROM dbo.[Brighetti_Attività] a
      WHERE a.idMacchinaMagazzino = @id AND a.TipoAttivitaProcedura = @t AND a.UltimaModifica_Data >= @dal AND a.UltimaModifica_Data < @al
      ORDER BY a.UltimaModifica_Data DESC`,
    { id, t: TipoAttivitaProcedura.Lavorazione, dal, al: alEscl },
  )
  const coda = await db.query<Attivita>(
    `SELECT ${ATTIVITA_COLS} FROM dbo.[Brighetti_Attività]
      WHERE idMacchinaMagazzino = @id AND [StatoAttività] IN (@w, @s, @b) ORDER BY [IdAttività]`,
    { id, w: TipoStatoAttivita.In_attesa, s: TipoStatoAttivita.StandBy, b: TipoStatoAttivita.BloccoDaAttivitaPrecedente },
  )
  const tot = await db.one<{ p: number | null; s: number | null }>(
    `SELECT CAST(SUM([QuantitàProdotta]) AS FLOAT) AS p, CAST(SUM([QuantitàScartata]) AS FLOAT) AS s FROM dbo.[Brighetti_Attività]
      WHERE idMacchinaMagazzino = @id AND UltimaModifica_Data >= @dal AND UltimaModifica_Data < @al AND [StatoAttività] = @c`,
    { id, dal, al: alEscl, c: TipoStatoAttivita.Completato },
  )
  return {
    IdMacchina: id,
    NomeMacchina: m.NomeMacchina,
    Collegata: collegata,
    ListaEff,
    ListaProduzione: prod.map((p) => ({
      Articolo: p.CodiceArticolo,
      QuantitàProdotta: p.QuantitàProdotta,
      QuantitàScartata: p.QuantitàScartata,
      TempoDiProduzione: p.minuti ?? 0,
    })),
    ListaPrevisione: coda.map((c) => ({
      Articolo: c.CodiceArticolo,
      qtaProdurre: c.QuantitàdaProdurre,
      DataCreazione: fmtDate(c.UltimaModifica_Data),
    })),
    GaugeCoda: coda.length,
    GaugeProdotti: Math.trunc(tot?.p ?? 0),
    GaugeScartati: Math.trunc(tot?.s ?? 0),
    Dal: fmtDate(dal),
    Al: fmtDate(alIncl),
  }
}

/* ---------------------------------------------------------------- ISTANZA */

export async function istanzaMacchina(id: number) {
  const m = await getMacchina(id)
  if (!m) return null
  const ultima = await db.one<{ Programma: string | null; ProgrammaDescrizione: string | null; StatoOperativoMacchina: string | null; DataRilevazione: Date }>(
    `SELECT TOP 1 Programma, ProgrammaDescrizione, StatoOperativoMacchina, DataRilevazione FROM dbo.Brighetti_Dati_Macchina
      WHERE idMacchina = @id AND DataRilevazione < GETDATE() AND DataRilevazione > DATEADD(DAY, -7, GETDATE())
      ORDER BY id DESC`,
    { id },
  )
  const perStato = await db.query<{ Stato: string | null; Number: number }>(
    `SELECT EsecuzioneMacchina AS Stato, COUNT(*) AS Number FROM dbo.Brighetti_Dati_Macchina WHERE idMacchina = @id GROUP BY EsecuzioneMacchina`,
    { id },
  )
  const note = await db.query<{ Id: number; Contenuto_Nota: string | null; Data_Nota: Date; Operatore_Nome: string | null }>(
    `SELECT Id, Contenuto_Nota, Data_Nota, Operatore_Nome FROM dbo.Brighetti_Note WHERE IdEsterno = @id AND TypeElem = @t ORDER BY Data_Nota DESC`,
    { id, t: TipoElemento.Macchina },
  )
  const documenti = await db.query<{ Id: number; Nome_File: string | null; DataCreazioneFile: Date; Operatore_Nome: string | null }>(
    `SELECT Id, Nome_File, DataCreazioneFile, Operatore_Nome FROM dbo.Brighetti_Documenti WHERE IdEsterno = @id AND TypeElem = @t ORDER BY DataCreazioneFile DESC`,
    { id, t: TipoElemento.Macchina },
  )
  return { macchina: m, ultima, perStato, note, documenti }
}
