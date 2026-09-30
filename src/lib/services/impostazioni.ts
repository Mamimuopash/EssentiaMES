import 'server-only'
import { db, type Db } from '@/lib/db'
import { TipoImpostazione } from '@/lib/enums'
import type { Operatore } from '@/lib/audit'

/* Porting di Servizi/ImpostazioniService.vb: interruttori e parametri degli automatismi. */

export const Chiavi = {
  OrdiniAutomaticiAbilitato: 'ordini_automatici.abilitato',
  OrdiniAutomaticiPrefissi: 'ordini_automatici.prefissi_codice',
  OrdiniAutomaticiMoltiplicatore: 'ordini_automatici.moltiplicatore_scorta_minima',
  OrdiniAutomaticiIncludiSemilavorati: 'ordini_automatici.includi_semilavorati',
  SyncMexalAbilitato: 'sync_mexal.abilitato',
  SyncMexalPercorsoFile: 'sync_mexal.percorso_file_csv',
  SyncMexalSeparatore: 'sync_mexal.separatore_csv',
  LottiCreazioneAutomaticaAbilitato: 'lotti.creazione_automatica_abilitato',
  LottiRitornatoSbloccaFase: 'lotti.ritornato_sblocca_fase_abilitato',
  SchedulerOraSyncGiornaliera: 'scheduler.ora_sync_giornaliera',
  SchedulerMinutiIntervalloOrdini: 'scheduler.minuti_intervallo_ordini',
} as const

export interface Impostazione {
  Id: number
  Chiave: string
  Valore: string | null
  Descrizione: string | null
  Categoria: string | null
  Tipo: number
  UltimaModifica_Data: Date | null
  UltimaModifica_Operatore: string | null
}

interface Default {
  chiave: string
  valore: string
  tipo: number
  categoria: string
  descrizione: string
}

export const ELENCO_DEFAULT: Default[] = [
  { chiave: Chiavi.OrdiniAutomaticiAbilitato, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Ordini Automatici',
    descrizione: 'Abilita la generazione automatica delle proposte di riordino al raggiungimento della scorta minima.' },
  { chiave: Chiavi.OrdiniAutomaticiPrefissi, valore: 'G8', tipo: TipoImpostazione.Testo, categoria: 'Ordini Automatici',
    descrizione: 'Prefissi dei codici articolo coinvolti, separati da virgola (es. G8,G12). Lasciare vuoto per tutti i codici.' },
  { chiave: Chiavi.OrdiniAutomaticiMoltiplicatore, valore: '2', tipo: TipoImpostazione.Numero, categoria: 'Ordini Automatici',
    descrizione: "Se l'articolo non ha una scorta massima, riordina fino a questo multiplo della scorta minima (es. 2 = doppio della scorta minima)." },
  { chiave: Chiavi.OrdiniAutomaticiIncludiSemilavorati, valore: 'true', tipo: TipoImpostazione.Booleano, categoria: 'Ordini Automatici',
    descrizione: 'Genera proposte di riordino anche per i semilavorati, non solo per i prodotti finiti.' },
  { chiave: Chiavi.SyncMexalAbilitato, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Sincronizzazione Mexal',
    descrizione: "Abilita l'aggiornamento giornaliero delle giacenze dal gestionale Mexal." },
  { chiave: Chiavi.SyncMexalPercorsoFile, valore: '', tipo: TipoImpostazione.Testo, categoria: 'Sincronizzazione Mexal',
    descrizione: 'Percorso del file CSV esportato da Mexal con le giacenze, raggiungibile dal server dove gira EssentiaMES (es. /mnt/mexal/giacenze.csv).' },
  { chiave: Chiavi.SyncMexalSeparatore, valore: ';', tipo: TipoImpostazione.Testo, categoria: 'Sincronizzazione Mexal',
    descrizione: 'Carattere separatore delle colonne nel file CSV (di norma ; oppure ,).' },
  { chiave: Chiavi.LottiCreazioneAutomaticaAbilitato, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Gestione Lotti',
    descrizione: 'Crea automaticamente un lotto alla chiusura di una fase di versamento.' },
  { chiave: Chiavi.LottiRitornatoSbloccaFase, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Gestione Lotti',
    descrizione: "Quando un lotto passa allo stato 'Ritornato', sblocca automaticamente la fase di lavorazione successiva." },
  { chiave: Chiavi.SchedulerOraSyncGiornaliera, valore: '02:00', tipo: TipoImpostazione.Testo, categoria: 'Pianificazione',
    descrizione: 'Ora (HH:mm) della sincronizzazione giornaliera con Mexal.' },
  { chiave: Chiavi.SchedulerMinutiIntervalloOrdini, valore: '60', tipo: TipoImpostazione.Numero, categoria: 'Pianificazione',
    descrizione: 'Ogni quanti minuti il sistema controlla le scorte per generare le proposte di riordino.' },
]

export async function leggiValoreGrezzo(chiave: string, conn: Db = db): Promise<string | null> {
  const r = await conn.one<{ Valore: string | null }>(
    `SELECT TOP 1 Valore FROM dbo.Brighetti_Impostazioni WHERE Chiave = @chiave ORDER BY Id`,
    { chiave },
  )
  return r ? r.Valore : null
}

export function parseBool(valore: string | null | undefined, def = false): boolean {
  if (valore === null || valore === undefined || valore.trim() === '') return def
  const v = valore.trim().toLowerCase()
  if (v === 'true') return true
  if (v === 'false') return false
  return ['1', 'on', 'si', 'sì'].includes(v)
}

export function parseNumero(valore: string | null | undefined, def = 0): number {
  if (valore === null || valore === undefined || valore.trim() === '') return def
  const n = Number(valore.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : def
}

export async function leggiBool(chiave: string, def = false) {
  return parseBool(await leggiValoreGrezzo(chiave), def)
}
export async function leggiTesto(chiave: string, def = '') {
  const v = await leggiValoreGrezzo(chiave)
  return v === null ? def : v
}
export async function leggiNumero(chiave: string, def = 0) {
  return parseNumero(await leggiValoreGrezzo(chiave), def)
}

export async function scrivi(chiave: string, valore: string, op: Operatore) {
  const n = await db.exec(
    `UPDATE dbo.Brighetti_Impostazioni SET Valore = @valore, UltimaModifica_OperatoreID = @opId,
            UltimaModifica_Operatore = @opName, UltimaModifica_Data = @data WHERE Chiave = @chiave`,
    { chiave, valore, opId: op.id, opName: op.name, data: new Date() },
  )
  if (n === 0) {
    await db.exec(
      `INSERT INTO dbo.Brighetti_Impostazioni (Chiave, Valore, Descrizione, Categoria, Tipo, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
       VALUES (@chiave, @valore, NULL, N'Generale', @tipo, @opId, @opName, @data)`,
      { chiave, valore, tipo: TipoImpostazione.Testo, opId: op.id, opName: op.name, data: new Date() },
    )
  }
}

/** Crea le impostazioni mancanti (idempotente). Gli automatismi nascono SPENTI. */
export async function assicuraDefault() {
  const esistenti = new Set(
    (await db.query<{ Chiave: string }>(`SELECT Chiave FROM dbo.Brighetti_Impostazioni`)).map((r) => r.Chiave),
  )
  for (const d of ELENCO_DEFAULT) {
    if (esistenti.has(d.chiave)) continue
    await db.exec(
      `INSERT INTO dbo.Brighetti_Impostazioni (Chiave, Valore, Descrizione, Categoria, Tipo, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
       VALUES (@chiave, @valore, @descrizione, @categoria, @tipo, N'', N'Sistema', @data)`,
      { chiave: d.chiave, valore: d.valore, descrizione: d.descrizione, categoria: d.categoria, tipo: d.tipo, data: new Date() },
    )
  }
}

export async function elenco(): Promise<Impostazione[]> {
  return db.query<Impostazione>(
    `SELECT Id, Chiave, Valore, Descrizione, Categoria, Tipo, UltimaModifica_Data, UltimaModifica_Operatore
       FROM dbo.Brighetti_Impostazioni ORDER BY Categoria, Chiave`,
  )
}
