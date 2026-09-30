import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import Procedure, { type ProceduraRow } from './Procedure'

export const metadata = { title: 'Cicli di lavoro - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Procedure (fasi dei cicli di lavoro per articolo) - vecchio Brighetti_Procedura. */
export default async function ProcedurePage({ searchParams }: { searchParams: Promise<{ articolo?: string }> }) {
  await requirePageUser({ admin: true })
  const { articolo } = await searchParams
  const rows = await db.query<ProceduraRow>(
    `SELECT p.IdProcedura, p.CodiceArticolo, p.IncrementaleProcedura, p.TipoAttivita, p.[NomeAttività] AS NomeAttivita, p.idReparto, p.idMacchinaMagazzino,
            CASE WHEN p.TipoAttivita = 2 THEN mg.CodiceMagazzino ELSE mc.NomeMacchina END AS Risorsa, r.NomeReparto, p.UltimaModifica_Data
       FROM dbo.Brighetti_Procedure p
       LEFT JOIN dbo.Brighetti_Macchine mc ON mc.IdMacchina = p.idMacchinaMagazzino
       LEFT JOIN dbo.Brighetti_Magazzini mg ON mg.Id = p.idMacchinaMagazzino
       LEFT JOIN dbo.Brighetti_Reparti r ON r.IdReparto = p.idReparto
      WHERE @art IS NULL OR p.CodiceArticolo = @art
      ORDER BY p.CodiceArticolo, p.IncrementaleProcedura, p.IdProcedura`,
    { art: articolo && articolo.trim() ? articolo.trim() : null },
  )
  return <Procedure rows={rows} articolo={articolo ?? ''} />
}
