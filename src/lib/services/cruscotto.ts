import 'server-only'
import { db } from '@/lib/db'
import { StatoLotto, StatoOrdineAutomatico, TipoStatoAttivita } from '@/lib/enums'
import { ATTIVITA_COLS, type Attivita } from './produzione'

/* Porting di Brighetti_CruscottoController (Centro di Controllo). */

const S = TipoStatoAttivita
const attiva = (s: number) => s === S.In_attesa || s === S.In_Attrezzaggio || s === S.In_Lavorazione || s === S.StandBy
const chiave = (a: string | null, m: string | null) => `${a ?? ''}|${m ?? ''}`

export interface GiacenzaScoperta {
  Id: number
  CodiceArticolo: string | null
  CodiceMagazzino: string | null
  NomeMagazzino: string | null
  QuantitàGiacenza: number
  InPrevisioneEntrata: number
  QuantitàSottoscorta: number
}

export interface LottoAperto {
  IdLotto: number
  NomeLotto: string | null
  CodiceADLACL: string | null
  StatoLotto: number
  UltimaModifica_Data: Date | null
}

export async function datiCruscotto() {
  const openAtt = await db.query<Attivita>(
    `SELECT ${ATTIVITA_COLS} FROM dbo.[Brighetti_Attività] WHERE [StatoAttività] NOT IN (@c, @a) ORDER BY [IdAttività]`,
    { c: S.Completato, a: S.Annullato },
  )
  const AttivitaStandBy = openAtt.filter((a) => a.StatoAttività === S.StandBy).length
  const AttivitaBloccate = openAtt.filter((a) => a.StatoAttività === S.BloccoDaAttivitaPrecedente).length

  // ODP fermi: hanno fasi bloccate ma nessuna fase avviabile/in corso.
  const perOdp = new Map<string | null, Attivita[]>()
  for (const a of openAtt) {
    const k = a.OrdineDiProduzione
    if (!perOdp.has(k)) perOdp.set(k, [])
    perOdp.get(k)!.push(a)
  }
  const stuck: (string | null)[] = []
  for (const [k, g] of perOdp) {
    if (g.some((a) => a.StatoAttività === S.BloccoDaAttivitaPrecedente) && !g.some((a) => attiva(a.StatoAttività))) stuck.push(k)
  }
  const stuckSet = new Set(stuck.filter((k): k is string => k !== null))
  const AttivitaFerme = openAtt
    .filter(
      (a) =>
        a.StatoAttività === S.StandBy ||
        (a.StatoAttività === S.BloccoDaAttivitaPrecedente && a.OrdineDiProduzione !== null && stuckSet.has(a.OrdineDiProduzione)),
    )
    .sort((x, y) => (x.UltimaModifica_Data?.getTime() ?? 0) - (y.UltimaModifica_Data?.getTime() ?? 0))
    .slice(0, 100)

  // Flusso: attivita' attive per reparto.
  const reparti = await db.query<{ IdReparto: number; NomeReparto: string | null }>(
    `SELECT IdReparto, NomeReparto FROM dbo.Brighetti_Reparti ORDER BY IdReparto`,
  )
  const attive = openAtt.filter((a) => attiva(a.StatoAttività))
  const Flusso = reparti.map((r) => ({ NomeReparto: r.NomeReparto, Conteggio: attive.filter((a) => a.idReparto === r.IdReparto).length }))
  const FlussoMax = Flusso.length > 0 ? Math.max(1, ...Flusso.map((f) => f.Conteggio)) : 1

  const conteggi = await db.one<{ proposte: number; confermati: number }>(
    `SELECT SUM(CASE WHEN Stato = @p THEN 1 ELSE 0 END) AS proposte, SUM(CASE WHEN Stato = @c THEN 1 ELSE 0 END) AS confermati
       FROM dbo.Brighetti_OrdiniAutomatici`,
    { p: StatoOrdineAutomatico.Proposto, c: StatoOrdineAutomatico.Confermato },
  )
  const coperti = new Set(
    (
      await db.query<{ CodiceArticolo: string | null; CodiceMagazzino: string | null }>(
        `SELECT CodiceArticolo, CodiceMagazzino FROM dbo.Brighetti_OrdiniAutomatici WHERE Stato IN (@p, @c, @i)`,
        { p: StatoOrdineAutomatico.Proposto, c: StatoOrdineAutomatico.Confermato, i: StatoOrdineAutomatico.Inviato },
      )
    ).map((o) => chiave(o.CodiceArticolo, o.CodiceMagazzino)),
  )

  const giac = await db.query<GiacenzaScoperta>(
    `SELECT g.Id, g.CodiceArticolo, g.CodiceMagazzino, m.CodiceMagazzino AS NomeMagazzino,
            CAST(g.[QuantitàGiacenza] AS FLOAT) AS [QuantitàGiacenza], CAST(g.InPrevisioneEntrata AS FLOAT) AS InPrevisioneEntrata,
            CAST(g.[QuantitàSottoscorta] AS FLOAT) AS [QuantitàSottoscorta]
       FROM dbo.Brighetti_Giacenze g
       LEFT JOIN dbo.Brighetti_Magazzini m ON CAST(m.Id AS NVARCHAR(20)) = g.CodiceMagazzino
      WHERE g.[QuantitàSottoscorta] > 0 AND g.[QuantitàGiacenza] + g.InPrevisioneEntrata <= g.[QuantitàSottoscorta]
      ORDER BY g.[QuantitàGiacenza]`,
  )
  const Scoperte = giac.filter((g) => !coperti.has(chiave(g.CodiceArticolo, g.CodiceMagazzino))).slice(0, 100)

  const LottiAperti = await db.query<LottoAperto>(
    `SELECT TOP 50 IdLotto, NomeLotto, CodiceADLACL, StatoLotto, UltimaModifica_Data FROM dbo.Brighetti_Lotti
      WHERE StatoLotto IN (@a, @i) ORDER BY UltimaModifica_Data DESC`,
    { a: StatoLotto.In_Attesa, i: StatoLotto.Inviato },
  )
  const nLotti = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.Brighetti_Lotti WHERE StatoLotto IN (@a, @i)`, {
    a: StatoLotto.In_Attesa,
    i: StatoLotto.Inviato,
  })

  return {
    ProposteAperte: conteggi?.proposte ?? 0,
    OrdiniConfermati: conteggi?.confermati ?? 0,
    AttivitaStandBy,
    AttivitaBloccate,
    OdpFermi: stuck.length,
    GiacenzeScoperte: Scoperte.length,
    LottiNonRitornati: nLotti?.n ?? 0,
    Flusso,
    FlussoMax,
    AttivitaFerme,
    Scoperte,
    LottiAperti,
  }
}
