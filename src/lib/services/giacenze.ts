import 'server-only'
import { db } from '@/lib/db'

/*
 * Le giacenze contengono in CodiceArticolo il CODICE articolo (dati nuovi) oppure,
 * per dati storici, l'Id numerico; in CodiceMagazzino l'Id del magazzino (dai form
 * e dalla produzione) oppure il codice Mexal (sync). Qui risolviamo entrambi.
 */
export const GIACENZE_BASE = `
  SELECT g.Id, g.CodiceArticolo AS CodiceArticoloRaw, g.CodiceMagazzino AS CodiceMagazzinoRaw,
         COALESCE(ac.CodiceArticolo, ai.CodiceArticolo, g.CodiceArticolo) AS CodiceArticolo,
         COALESCE(ac.Id, ai.Id) AS IdArticolo,
         COALESCE(mi.CodiceMagazzino, mc.CodiceMagazzino, g.CodiceMagazzino) AS Magazzino,
         COALESCE(mi.Id, mc.Id) AS IdMagazzino,
         CAST(g.[QuantitàGiacenza] AS FLOAT) AS QuantitaGiacenza, CAST(g.[QuantitàSottoscorta] AS FLOAT) AS QuantitaSottoscorta,
         CAST(g.[QuantitàScortaMassima] AS FLOAT) AS QuantitaScortaMassima, CAST(g.InPrevisioneEntrata AS FLOAT) AS InPrevisioneEntrata,
         g.UltimaModifica_Data, g.UltimaModifica_Operatore
    FROM dbo.Brighetti_Giacenze g
    OUTER APPLY (SELECT TOP 1 a.Id, a.CodiceArticolo FROM dbo.Brighetti_Articoli a WHERE a.CodiceArticolo = g.CodiceArticolo ORDER BY a.Id) ac
    OUTER APPLY (SELECT TOP 1 a.Id, a.CodiceArticolo FROM dbo.Brighetti_Articoli a WHERE ac.Id IS NULL AND a.Id = TRY_CONVERT(INT, g.CodiceArticolo)) ai
    OUTER APPLY (SELECT TOP 1 m.Id, m.CodiceMagazzino FROM dbo.Brighetti_Magazzini m WHERE m.Id = TRY_CONVERT(INT, g.CodiceMagazzino)) mi
    OUTER APPLY (SELECT TOP 1 m.Id, m.CodiceMagazzino FROM dbo.Brighetti_Magazzini m WHERE mi.Id IS NULL AND m.CodiceMagazzino = g.CodiceMagazzino ORDER BY m.Id) mc`

export interface GiacenzaView {
  Id: number
  CodiceArticoloRaw: string | null
  CodiceMagazzinoRaw: string | null
  CodiceArticolo: string | null
  IdArticolo: number | null
  Magazzino: string | null
  IdMagazzino: number | null
  QuantitaGiacenza: number
  QuantitaSottoscorta: number
  QuantitaScortaMassima: number
  InPrevisioneEntrata: number
  UltimaModifica_Data: Date | null
  UltimaModifica_Operatore: string | null
}

export async function getGiacenza(id: number) {
  return db.one<GiacenzaView>(`SELECT * FROM (${GIACENZE_BASE}) x WHERE x.Id = @id`, { id })
}

/** Id articolo dal menu a tendina -> codice reale (RisolviCodiceArticolo del vecchio controller). */
export async function risolviCodiceArticolo(valore: string | null): Promise<string | null> {
  if (!valore || !valore.trim()) return valore
  if (/^\d+$/.test(valore.trim())) {
    const a = await db.one<{ CodiceArticolo: string | null }>(`SELECT CodiceArticolo FROM dbo.Brighetti_Articoli WHERE Id = @id`, { id: Number(valore) })
    if (a?.CodiceArticolo && a.CodiceArticolo.trim()) return a.CodiceArticolo
  }
  return valore
}
