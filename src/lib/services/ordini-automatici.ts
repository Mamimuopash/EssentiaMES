import 'server-only'
import { db } from '@/lib/db'
import { StatoOrdineAutomatico, TipoMagazzino } from '@/lib/enums'
import { writeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiBool, leggiNumero, leggiTesto, predefinito } from './impostazioni'
import { calcolaQuantitaProposta, codiceInAutomatismo, parsePrefissi, sottoScorta } from './regole'

/*
 * Porting di Servizi/OrdiniAutomaticiService.vb: genera PROPOSTE di riordino
 * per le giacenze sotto scorta minima. Non invia nulla: l'admin conferma o annulla.
 */

export interface EsitoGenerazione {
  Generate: number
  Saltate: number
  /** Sotto scorta ma esclusi dai prefissi esclusi (es. G8A). */
  Escluse: number
  Messaggio: string
}

interface GiacenzaRow {
  Id: number
  CodiceArticolo: string | null
  CodiceMagazzino: string | null
  QuantitaGiacenza: number
  QuantitaSottoscorta: number
  QuantitaScortaMassima: number
  InPrevisioneEntrata: number
  CodiceRisolto: string | null
  LottoMinimo: number | null
}

export async function generaProposte(
  op: Operatore,
  opts: { rispettaToggle?: boolean; origine?: string } = {},
): Promise<EsitoGenerazione> {
  const origine = opts.origine ?? 'Manuale'
  const esito: EsitoGenerazione = { Generate: 0, Saltate: 0, Escluse: 0, Messaggio: '' }

  if (opts.rispettaToggle && !(await leggiBool(Chiavi.OrdiniAutomaticiAbilitato))) {
    esito.Messaggio = 'Automatismo ordini automatici disattivato.'
    return esito
  }

  const prefissi = parsePrefissi(await leggiTesto(Chiavi.OrdiniAutomaticiPrefissi, ''))
  const esclusi = parsePrefissi(await leggiTesto(Chiavi.OrdiniAutomaticiPrefissiEsclusi, predefinito(Chiavi.OrdiniAutomaticiPrefissiEsclusi)))
  let moltiplicatore = await leggiNumero(Chiavi.OrdiniAutomaticiMoltiplicatore, 2)
  if (moltiplicatore <= 0) moltiplicatore = 2
  const includiSemilavorati = await leggiBool(Chiavi.OrdiniAutomaticiIncludiSemilavorati, true)

  // Magazzini conto lavoro (semilavorati): le giacenze li referenziano per Id o per codice.
  const contoLavoro = new Set<string>()
  for (const m of await db.query<{ Id: number; CodiceMagazzino: string | null }>(
    `SELECT Id, CodiceMagazzino FROM dbo.Brighetti_Magazzini WHERE TipologiaMagazzino = @t`,
    { t: TipoMagazzino.Magazzino_ContoLavoro },
  )) {
    contoLavoro.add(String(m.Id))
    if (m.CodiceMagazzino) contoLavoro.add(m.CodiceMagazzino)
  }

  // Giacenze con codice articolo "risolto" (le giacenze storiche possono contenere l'Id articolo).
  const giacenze = await db.query<GiacenzaRow>(`
    SELECT g.Id, g.CodiceArticolo, g.CodiceMagazzino,
           g.[QuantitàGiacenza] AS QuantitaGiacenza, g.[QuantitàSottoscorta] AS QuantitaSottoscorta,
           g.[QuantitàScortaMassima] AS QuantitaScortaMassima, g.InPrevisioneEntrata,
           COALESCE(ac.CodiceArticolo, ai.CodiceArticolo, g.CodiceArticolo) AS CodiceRisolto,
           COALESCE(ac.LottoMinimo, ai.LottoMinimo) AS LottoMinimo
      FROM dbo.Brighetti_Giacenze g
      OUTER APPLY (SELECT TOP 1 a.CodiceArticolo, a.LottoMinimo FROM dbo.Brighetti_Articoli a
                    WHERE a.CodiceArticolo = g.CodiceArticolo ORDER BY a.Id) ac
      OUTER APPLY (SELECT TOP 1 a.CodiceArticolo, a.LottoMinimo FROM dbo.Brighetti_Articoli a
                    WHERE ac.CodiceArticolo IS NULL AND a.Id = TRY_CONVERT(INT, g.CodiceArticolo)) ai
     ORDER BY g.Id`)

  // Ordini NON terminati (Proposto/Confermato/Inviato): niente doppioni.
  const inCorso = new Set(
    (
      await db.query<{ CodiceArticolo: string | null; CodiceMagazzino: string | null }>(
        `SELECT CodiceArticolo, CodiceMagazzino FROM dbo.Brighetti_OrdiniAutomatici WHERE Stato IN (@p, @c, @i)`,
        { p: StatoOrdineAutomatico.Proposto, c: StatoOrdineAutomatico.Confermato, i: StatoOrdineAutomatico.Inviato },
      )
    ).map((o) => `${o.CodiceArticolo ?? ''}|${o.CodiceMagazzino ?? ''}`),
  )

  const now = new Date()
  for (const g of giacenze) {
    if (!sottoScorta(g.QuantitaGiacenza, g.InPrevisioneEntrata, g.QuantitaSottoscorta)) continue

    const codice = g.CodiceRisolto ?? ''
    if (!codiceInAutomatismo(codice, prefissi, [])) continue
    if (!codiceInAutomatismo(codice, [], esclusi)) {
      esito.Escluse++
      continue
    }

    if (!includiSemilavorati && g.CodiceMagazzino && contoLavoro.has(g.CodiceMagazzino)) {
      esito.Saltate++
      continue
    }

    const chiave = `${codice}|${g.CodiceMagazzino ?? ''}`
    if (inCorso.has(chiave)) {
      esito.Saltate++
      continue
    }

    const lottoMin = g.LottoMinimo ?? 0
    const quantita = calcolaQuantitaProposta({
      giacenza: g.QuantitaGiacenza,
      inArrivo: g.InPrevisioneEntrata,
      scortaMinima: g.QuantitaSottoscorta,
      scortaMassima: g.QuantitaScortaMassima,
      moltiplicatore,
      lottoMinimo: lottoMin,
    })
    if (quantita <= 0) continue

    await db.exec(
      `INSERT INTO dbo.Brighetti_OrdiniAutomatici
         (CodiceArticolo, CodiceMagazzino, [QuantitàGiacenza], ScortaMinima, ScortaMassima, LottoMinimo, [QuantitàProposta],
          Stato, Origine, Note, DataGenerazione, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
       VALUES (@art, @mag, @giac, @smin, @smax, @lotto, @qta, @stato, @origine, N'', @now, @opId, @opName, @now)`,
      {
        art: codice,
        mag: g.CodiceMagazzino,
        giac: g.QuantitaGiacenza,
        smin: g.QuantitaSottoscorta,
        smax: g.QuantitaScortaMassima,
        lotto: lottoMin,
        qta: quantita,
        stato: StatoOrdineAutomatico.Proposto,
        origine,
        now,
        opId: op.id,
        opName: op.name,
      },
    )
    inCorso.add(chiave)
    esito.Generate++
  }

  await writeLog(
    db,
    L.Info,
    'OrdiniAutomaticiService/GeneraProposte',
    `Proposte di riordino generate: ${esito.Generate} (saltate: ${esito.Saltate}, escluse per prefisso: ${esito.Escluse}, origine: ${origine})`,
    '',
    op,
  )
  esito.Messaggio = `Generate ${esito.Generate} proposte di riordino.`
  return esito
}
