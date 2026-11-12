import { TipoAttivitaProcedura } from '@/lib/enums'

/*
 * Cicli di lavoro standard generati alla creazione di un articolo
 * (porting di Brighetti_ArticoloController.Create e ImbarazzanteCreazioneArticoli).
 * Le fasi fanno riferimento a macchine e magazzini PER NOME, come nel vecchio codice.
 * Modulo "puro", testato in tests/cicli.test.ts.
 */

export interface FaseTemplate {
  incrementale: number
  tipo: number // TipoAttivitaProcedura
  /** Nome macchina (Lavorazione) oppure CodiceMagazzino (Versamento). */
  risorsa: string
  nome: string
}

const lav = (incrementale: number, macchina: string, nome: string): FaseTemplate => ({
  incrementale,
  tipo: TipoAttivitaProcedura.Lavorazione,
  risorsa: macchina,
  nome,
})
const ver = (incrementale: number, magazzino: string, nome: string): FaseTemplate => ({
  incrementale,
  tipo: TipoAttivitaProcedura.Versamento,
  risorsa: magazzino,
  nome,
})

/**
 * Template per codice articolo:
 *  - codici che iniziano con G / GT / GP / PCM / SG / SGT / SGP / SGPCM -> ciclo "brocce G";
 *  - altrimenti codici che contengono B (BA, BC, BL, BG, BE, SB...) -> ciclo "brocce B";
 *  - altrimenti nessun ciclo automatico.
 */
export function templateCiclo(codice: string): FaseTemplate[] | null {
  const c = codice || ''
  const prefissiG = ['G', 'GT', 'GP', 'PCM', 'SG', 'SGT', 'SGP', 'SGPCM']
  if (prefissiG.some((p) => c.startsWith(p))) {
    return [
      lav(1, 'Mazak 200MSY L', `Tornitura ${c}`),
      ver(2, 'Magazzino Fresatura', 'Versamento da Tornitura a Fresatura'),
      lav(3, 'Mazak VCN-530C', `Fresatura ${c}`),
      ver(4, 'Magazzino Tratt. Termico', 'Versamento da Fresatura a Tratt. Termico'),
      lav(5, 'Macchina_Trattamento', 'Tratt. Termico'),
      // Nel vecchio codice qui veniva usato per errore il magazzino Tratt. Termico
      // (la variabile del magazzino Rettifica era calcolata ma non usata).
      ver(6, 'Magazzino Rettifica', 'Versamento da Trattamento a Rettifica'),
      lav(7, 'Studer S33', `Rettifica ${c}`),
      ver(8, 'Magazzino Affilatura', 'Versamento da Rettifica ad Affilatura'),
      lav(9, 'Schneberger NGM/81', `Affilatura ${c}`),
      ver(10, 'Magazzino Finito', 'Versamento da Affilatura a Finito'),
    ]
  }
  const contieneB = ['B', 'BA', 'BC', 'BL', 'BG', 'BE', 'SB', 'SBA', 'SBC', 'SBL', 'SBE']
  if (contieneB.some((p) => c.includes(p))) {
    return [
      lav(1, 'Mazak 250 MSY', `Tornitura ${c}`),
      ver(2, 'Magazzino Fresatura', 'Versamento da Tornitura a Fresatura'),
      lav(3, 'Mazak VCN-530C', `Fresatura ${c}`),
      ver(4, 'Magazzino Tratt. Termico', 'Versamento da Fresatura a Tratt. Termico'),
      lav(5, 'Macchina_Trattamento', 'Tratt. Termico'),
      ver(6, 'Magazzino Brunitura', 'Versamento da Trattamento a Brunitura'),
      lav(7, 'Macchina_Brunitura', 'Brunitura'),
      ver(8, 'Magazzino Rettifica', 'Versamento da Brunitura a Rettifica'),
      lav(9, 'Macchina_Rettifica', 'Rettifica'),
      ver(10, 'Magazzino Finito', 'Versamento da Rettifica a Finito'),
    ]
  }
  return null
}

/** Ciclo "generico" usato dalla funzione di generazione massiva dei cicli mancanti. */
export function templateCicloGenerico(): FaseTemplate[] {
  return [
    lav(1, 'Macchina_Tornitura', 'Tornitura'),
    ver(2, 'Magazzino Tratt. Termico', 'Versamento da Tornitura a C/O'),
    lav(3, 'Macchina_Trattamento', 'Tratt. Termico'),
    ver(4, 'Magazzino Rettifica', 'Versamento da C/O a Rettifica'),
    lav(5, 'Macchina_Rettifica', 'Rettifica'),
    ver(6, 'Magazzino Affilatura', 'Versamento Affilatura'),
    lav(7, 'Macchina_Affilatura', 'Affilatura'),
    ver(8, 'Magazzino Finito', 'Versamento Finito'),
  ]
}

/* ------------------------------------------------- articoli senza affilatura */

/** Parole chiave dal pannello ("HDRED, Tin; wonder") -> ["HDRED", "TIN", "WONDER"]. */
export function parseParoleChiave(testo: string | null | undefined): string[] {
  const out: string[] = []
  for (const p of (testo || '').split(/[,;\s]+/)) {
    const v = p.trim().toUpperCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

const escRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Parola chiave trovata nel codice o nella descrizione dell'articolo (null se nessuna).
 * La parola deve stare all'INIZIO di una parola del testo: "TIN" trova "BROCCIA TIN",
 * "G8-TIN" e "TINATA", ma non "SATINATO"; "WOND" trova anche "WONDER".
 */
export function parolaSenzaAffilatura(
  codice: string | null | undefined,
  descrizione: string | null | undefined,
  parole: string[],
): string | null {
  const testo = `${codice || ''} ${descrizione || ''}`.toUpperCase()
  for (const p of parole) {
    if (new RegExp(`(^|[^A-Z0-9])${escRegex(p)}`).test(testo)) return p
  }
  return null
}

/** Fase di affilatura: lavorazione chiamata "Affilatura..." o su una macchina di affilatura. */
export function eFaseAffilatura(f: { tipo: number; nome: string | null; risorsa?: string | null; reparto?: string | null }): boolean {
  if (f.tipo !== TipoAttivitaProcedura.Lavorazione) return false
  return [f.nome, f.risorsa, f.reparto].some((x) => /affilatura|schneberger/i.test(x || ''))
}

/**
 * Toglie dal ciclo la lavorazione di affilatura e il versamento che la precede
 * (magazzino Affilatura), poi rinumera le fasi 1..n: la produzione passa da una
 * fase alla successiva per numero (IncrementaleProcedura +1), niente buchi.
 */
export function togliAffilatura(template: FaseTemplate[]): FaseTemplate[] {
  const fasi = [...template].sort((a, b) => a.incrementale - b.incrementale)
  const i = fasi.findIndex((f) => eFaseAffilatura({ tipo: f.tipo, nome: f.nome, risorsa: f.risorsa }))
  if (i < 0) return fasi
  const inizio = i > 0 && fasi[i - 1].tipo === TipoAttivitaProcedura.Versamento ? i - 1 : i
  const tolto = fasi[inizio]
  const out = [...fasi.slice(0, inizio), ...fasi.slice(i + 1)]
  const seguente = out[inizio]
  if (seguente && tolto !== fasi[i] && /affilatura/i.test(seguente.nome)) {
    // "Versamento da Affilatura a Finito" -> "Versamento da Rettifica a Finito"
    out[inizio] = { ...seguente, nome: `${tolto.nome.replace(/\s+ad?\s+affilatura\s*$/i, '')} a Finito` }
  }
  return out.map((f, n) => ({ ...f, incrementale: n + 1 }))
}
