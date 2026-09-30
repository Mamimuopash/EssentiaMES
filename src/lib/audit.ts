import 'server-only'
import { db as poolDb, type Db } from '@/lib/db'
import { TipoLogLivello } from '@/lib/enums'

/*
 * Tracciatura su tabelle [Audit] (operazioni utente) e [Log] (errori/eventi
 * tecnici), come nella vecchia applicazione.
 */

export interface Operatore {
  id: string
  name: string
}

export const SISTEMA: Operatore = { id: '', name: 'Sistema' }

function serialize(dati: unknown): string {
  if (dati === undefined || dati === null) return ''
  if (typeof dati === 'string') return dati
  try {
    return JSON.stringify(dati)
  } catch {
    return String(dati)
  }
}

async function write(
  table: 'Audit' | 'Log',
  conn: Db,
  livello: number,
  indirizzo: string,
  messaggio: string,
  dati: unknown,
  op: Operatore,
  data: Date = new Date(),
) {
  await conn.exec(
    `INSERT INTO dbo.[${table}] (Livello, Indirizzo, Messaggio, Dati, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@livello, @indirizzo, @messaggio, @dati, @opId, @opName, @data)`,
    { livello, indirizzo, messaggio, dati: serialize(dati), opId: op.id ?? '', opName: op.name ?? '', data },
  )
}

export const writeAudit = (
  conn: Db,
  livello: number,
  indirizzo: string,
  messaggio: string,
  dati: unknown,
  op: Operatore,
  data?: Date,
) => write('Audit', conn, livello, indirizzo, messaggio, dati, op, data)

export const writeLog = (
  conn: Db,
  livello: number,
  indirizzo: string,
  messaggio: string,
  dati: unknown,
  op: Operatore,
  data?: Date,
) => write('Log', conn, livello, indirizzo, messaggio, dati, op, data)

/** Scrive su [Log] senza mai lanciare eccezioni (usato nei catch). */
export async function safeLog(livello: number, indirizzo: string, messaggio: string, dati: unknown, op: Operatore) {
  try {
    await writeLog(poolDb, livello, indirizzo, messaggio, dati, op)
  } catch (e) {
    console.error('[log] impossibile scrivere su Log:', (e as Error).message, '|', messaggio)
  }
}

export const L = TipoLogLivello
