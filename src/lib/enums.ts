/*
 * Enumerazioni del modello dati: STESSI valori numerici della vecchia
 * applicazione (Models/BrighettiModels.vb), perche' sono salvati cosi' nel DB.
 * File condiviso tra server e client.
 */

export const TipoElemento = {
  Articolo: 1,
  Magazzino: 2,
  Giacenza: 3,
  Lavorazione: 4,
  Lotto: 5,
  Macchina: 6,
} as const

export const TipoAttivitaProcedura = {
  Lavorazione: 1,
  Versamento: 2,
  Conclusione: 99,
} as const
export const TipoAttivitaProceduraLabel: Record<number, string> = {
  1: 'Lavorazione',
  2: 'Versamento',
  99: 'Conclusione',
}

export const ImportanzaArticolo = {
  Nessuna: 1,
  Bassa: 2,
  Intermedia: 3,
  Alta: 4,
  Massima: 5,
} as const
export const ImportanzaLabel: Record<number, string> = {
  1: 'Nessuna',
  2: 'Bassa',
  3: 'Intermedia',
  4: 'Alta',
  5: 'Massima',
}

export const StatoLotto = {
  In_Attesa: 0,
  Inviato: 1,
  Ritornato: 2,
  Non_Completato: 3,
} as const
export const StatoLottoLabel: Record<number, string> = {
  0: 'In Attesa',
  1: 'Inviato',
  2: 'Ritornato da C/O',
  3: 'Non Completato',
}

export const StatoArticoloLotto = {
  In_Attesa: 0,
  Inviato: 1,
  Ritornato: 2,
  Mancante: 3,
} as const
export const StatoArticoloLottoLabel: Record<number, string> = {
  0: 'In Attesa',
  1: 'Inviato',
  2: 'Ritornato',
  3: 'Mancante',
}

export const TipoStatoAttivita = {
  In_attesa: 0,
  In_Attrezzaggio: 1,
  In_Lavorazione: 2,
  StandBy: 3,
  Completato: 4,
  Annullato: 5,
  BloccoDaAttivitaPrecedente: 99,
} as const
export const TipoStatoAttivitaLabel: Record<number, string> = {
  0: 'In attesa',
  1: 'In attrezzaggio',
  2: 'In lavorazione',
  3: 'Sospesa',
  4: 'Completata',
  5: 'Annullata',
  99: 'Bloccata da fase precedente',
}

export const TipoTempoAttivita = {
  Attrezzaggio: 0,
  Lavorazione: 1,
} as const

export const TipoLogLivello = {
  Errors: 0,
  Warning: 1,
  Info: 2,
  Debug: 3,
} as const

export const TipoMagazzino = {
  Magazzino_Interno: 0,
  Magazzino_ContoLavoro: 1,
} as const
export const TipoMagazzinoLabel: Record<number, string> = {
  0: 'Magazzino interno',
  1: 'Magazzino conto lavoro',
}

export const TipoMacchina = {
  non_collegabile: 0,
  mtconnect: 1,
  opcua: 2,
  Scheenberger: 3,
} as const
export const TipoMacchinaLabel: Record<number, string> = {
  0: 'Non collegabile',
  1: 'MTConnect',
  2: 'OPC UA',
  3: 'Schneeberger (CSV)',
}

export const TipoImpostazione = {
  Booleano: 0,
  Testo: 1,
  Numero: 2,
} as const

export const StatoOrdineAutomatico = {
  Proposto: 0,
  Confermato: 1,
  Annullato: 2,
  Inviato: 3,
  Evaso: 4,
} as const
export const StatoOrdineAutomaticoLabel: Record<number, string> = {
  0: 'Proposto',
  1: 'Confermato',
  2: 'Annullato',
  3: 'Inviato',
  4: 'Evaso',
}

export const Ruoli = {
  Admin: 'Admin',
  Operatore: 'Operatore',
  Reparto: 'Reparto',
} as const
export type Ruolo = (typeof Ruoli)[keyof typeof Ruoli]

/** Fuso orario in cui sono salvate le date nel database. */
export const APP_TIMEZONE = 'Europe/Rome'
