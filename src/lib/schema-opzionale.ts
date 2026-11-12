import 'server-only'
import { db } from '@/lib/db'

/*
 * Colonne aggiunte dalle ultime versioni di database/schema.sql: finche' lo
 * schema non viene aggiornato l'app continua a funzionare senza la relativa
 * funzione (invece di andare in errore). Una colonna trovata resta in cache;
 * una mancante viene ricontrollata ogni minuto.
 */
const cache = new Map<string, { presente: boolean; scade: number }>()

export async function colonnaPresente(tabella: string, colonna: string): Promise<boolean> {
  const k = `${tabella}.${colonna}`
  const c = cache.get(k)
  if (c && (c.presente || c.scade > Date.now())) return c.presente
  const r = await db.one<{ l: number | null }>(`SELECT COL_LENGTH(@t, @c) AS l`, { t: `dbo.${tabella}`, c: colonna })
  const presente = !!r && r.l !== null && r.l !== undefined
  cache.set(k, { presente, scade: Date.now() + 60_000 })
  return presente
}

export const nascondiAttivitaDisponibile = () => colonnaPresente('Brighetti_Attività', 'NascostaOperatore')
