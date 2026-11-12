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
  OrdiniAutomaticiPrefissiEsclusi: 'ordini_automatici.prefissi_esclusi',
  SyncMexalAbilitato: 'sync_mexal.abilitato',
  SyncMexalPercorsoFile: 'sync_mexal.percorso_file_csv',
  SyncMexalSeparatore: 'sync_mexal.separatore_csv',
  SyncMexalDaDatabase: 'sync_mexal.leggi_da_database',
  SyncMexalVista: 'sync_mexal.vista_database',
  SyncMexalMagazzino: 'sync_mexal.magazzino_predefinito',
  SyncMexalSoloAnagrafica: 'sync_mexal.solo_articoli_anagrafica',
  LottiCreazioneAutomaticaAbilitato: 'lotti.creazione_automatica_abilitato',
  LottiRitornatoSbloccaFase: 'lotti.ritornato_sblocca_fase_abilitato',
  SchedulerOraSyncGiornaliera: 'scheduler.ora_sync_giornaliera',
  SchedulerMinutiIntervalloOrdini: 'scheduler.minuti_intervallo_ordini',
  SchedulerOrariOrdini: 'scheduler.orari_ordini',
  MailOdpAbilitato: 'mail_odp.abilitato',
  MailOdpDestinatari: 'mail_odp.destinatari',
  MailOdpOra: 'mail_odp.ora',
  MailMacchineAbilitato: 'mail_uso_macchine.abilitato',
  MailMacchineDestinatari: 'mail_uso_macchine.destinatari',
  MailMacchineGiorno: 'mail_uso_macchine.giorno',
  MailMacchineOra: 'mail_uso_macchine.ora',
  CicliParoleSenzaAffilatura: 'cicli.parole_senza_affilatura',
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
  { chiave: Chiavi.OrdiniAutomaticiPrefissiEsclusi, valore: 'G8A', tipo: TipoImpostazione.Testo, categoria: 'Ordini Automatici',
    descrizione: 'Prefissi dei codici articolo ESCLUSI dagli ordini automatici, separati da virgola (es. G8A): hanno la precedenza sui prefissi inclusi. Lasciare vuoto per non escludere nulla.' },
  { chiave: Chiavi.SyncMexalAbilitato, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Sincronizzazione Mexal',
    descrizione: "Abilita l'aggiornamento giornaliero delle giacenze dal gestionale Mexal." },
  { chiave: Chiavi.SyncMexalPercorsoFile, valore: '', tipo: TipoImpostazione.Testo, categoria: 'Sincronizzazione Mexal',
    descrizione: "Percorso del file CSV esportato da Mexal con le giacenze (es. \\\\server\\export\\giacenze.csv), leggibile dall'account del servizio EssentiaMES." },
  { chiave: Chiavi.SyncMexalSeparatore, valore: ';', tipo: TipoImpostazione.Testo, categoria: 'Sincronizzazione Mexal',
    descrizione: 'Carattere separatore delle colonne nel file CSV (di norma ; oppure ,).' },
  { chiave: Chiavi.SyncMexalDaDatabase, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Sincronizzazione Mexal',
    descrizione: 'Legge le giacenze direttamente dal database di Mexal (vista indicata sotto) invece che dal file CSV.' },
  { chiave: Chiavi.SyncMexalVista, valore: 'dbo.EssentiaMES_GiacenzeMexal', tipo: TipoImpostazione.Testo, categoria: 'Sincronizzazione Mexal',
    descrizione: 'Vista SQL con le colonne Articolo e Giacenza (facoltative: Magazzino, ScortaMinima, InArrivo), nel formato schema.Nome oppure Database.schema.Nome. Si crea con database/mexal-vista-giacenze.sql.' },
  { chiave: Chiavi.SyncMexalMagazzino, valore: '', tipo: TipoImpostazione.Testo, categoria: 'Sincronizzazione Mexal',
    descrizione: 'Magazzino di EssentiaMES (nome o Id) in cui scrivere le giacenze lette da Mexal quando la vista non ha la colonna Magazzino.' },
  { chiave: Chiavi.SyncMexalSoloAnagrafica, valore: 'true', tipo: TipoImpostazione.Booleano, categoria: 'Sincronizzazione Mexal',
    descrizione: "Con la lettura dal database aggiorna solo gli articoli presenti nell'anagrafica di EssentiaMES (gli altri articoli di Mexal vengono ignorati)." },
  { chiave: Chiavi.LottiCreazioneAutomaticaAbilitato, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Gestione Lotti',
    descrizione: 'Crea automaticamente un lotto alla chiusura di una fase di versamento.' },
  { chiave: Chiavi.LottiRitornatoSbloccaFase, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Gestione Lotti',
    descrizione: "Quando un lotto passa allo stato 'Ritornato', sblocca automaticamente la fase di lavorazione successiva." },
  { chiave: Chiavi.SchedulerOraSyncGiornaliera, valore: '20:00', tipo: TipoImpostazione.Testo, categoria: 'Pianificazione',
    descrizione: 'Ora (HH:mm) della sincronizzazione giornaliera con Mexal: la sera, dopo l\'aggiornamento di Mexal e prima del controllo scorte (es. 20:00 con controllo scorte alle 20:30).' },
  { chiave: Chiavi.SchedulerMinutiIntervalloOrdini, valore: '60', tipo: TipoImpostazione.Numero, categoria: 'Pianificazione',
    descrizione: 'Ogni quanti minuti il sistema controlla le scorte per generare le proposte di riordino (usato solo se gli orari fissi qui sotto sono vuoti).' },
  { chiave: Chiavi.SchedulerOrariOrdini, valore: '20:30', tipo: TipoImpostazione.Testo, categoria: 'Pianificazione',
    descrizione: 'Orari fissi (HH:mm, separati da virgola o /, es. 20:00/21:00) del controllo scorte per le proposte di riordino. Se compilato sostituisce il controllo ogni N minuti; vuoto = ogni N minuti.' },
  { chiave: Chiavi.CicliParoleSenzaAffilatura, valore: 'HDRED,TIN,WONDER,WOND,ZIRI,INOX', tipo: TipoImpostazione.Testo, categoria: 'Cicli di lavoro',
    descrizione: "Parole che, nel codice o nella descrizione dell'articolo, indicano che NON va in affilatura (separate da virgola): i cicli generati per questi articoli non hanno la fase di affilatura. Per i cicli già esistenti usare \"Togli affilatura\" nella pagina Procedure." },
  { chiave: Chiavi.MailOdpAbilitato, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Email automatiche',
    descrizione: "Invia ogni giorno un'email con la lista degli ODP del giorno (creati e lavorati)." },
  { chiave: Chiavi.MailOdpDestinatari, valore: '', tipo: TipoImpostazione.Testo, categoria: 'Email automatiche',
    descrizione: 'Destinatari della mail giornaliera degli ODP, separati da virgola.' },
  { chiave: Chiavi.MailOdpOra, valore: '20:30', tipo: TipoImpostazione.Testo, categoria: 'Email automatiche',
    descrizione: 'Ora di invio (HH:mm) della mail giornaliera degli ODP.' },
  { chiave: Chiavi.MailMacchineAbilitato, valore: 'false', tipo: TipoImpostazione.Booleano, categoria: 'Email automatiche',
    descrizione: "Invia ogni settimana un'email con il tempo registrato su EssentiaMES da ogni macchina (attrezzaggio e lavorazione) negli ultimi 7 giorni." },
  { chiave: Chiavi.MailMacchineDestinatari, valore: '', tipo: TipoImpostazione.Testo, categoria: 'Email automatiche',
    descrizione: 'Destinatari della mail settimanale sull\'uso delle macchine, separati da virgola.' },
  { chiave: Chiavi.MailMacchineGiorno, valore: 'venerdì', tipo: TipoImpostazione.Testo, categoria: 'Email automatiche',
    descrizione: 'Giorno di invio della mail settimanale (lunedì ... domenica, oppure 1-7 con 1 = lunedì).' },
  { chiave: Chiavi.MailMacchineOra, valore: '20:30', tipo: TipoImpostazione.Testo, categoria: 'Email automatiche',
    descrizione: 'Ora di invio (HH:mm) della mail settimanale sull\'uso delle macchine.' },
]

/** Valore predefinito di una chiave (usato finche' l'impostazione non e' stata creata nel DB). */
export function predefinito(chiave: string): string {
  return ELENCO_DEFAULT.find((d) => d.chiave === chiave)?.valore ?? ''
}

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
