/*
 * Lettura delle giacenze direttamente dal database di Mexal (es. Mexal_Frontier):
 * EssentiaMES legge una vista con le colonne Articolo, Magazzino, Giacenza
 * (modello in database/mexal-vista-giacenze.sql). Modulo "puro" (nessun accesso
 * al DB): testato in tests/mexal-db.test.ts.
 */
import type { MexalGiacenza } from './mexal-csv'

/**
 * Nome SQL sicuro per la vista configurata nel pannello: 1-3 parti
 * (database.schema.nome), ognuna racchiusa tra parentesi quadre.
 */
export function nomeOggettoSql(valore: string | null | undefined): string {
  const testo = (valore || '').trim()
  if (!testo) throw new Error('Vista del database Mexal non configurata (pannello Automazioni).')
  const parti = testo.split('.').map((p) => p.trim().replace(/^\[(.*)\]$/, '$1'))
  if (parti.length > 3 || parti.some((p) => !/^[A-Za-z0-9_][A-Za-z0-9_ $#@-]{0,127}$/.test(p))) {
    throw new Error(`Nome della vista Mexal non valido: "${testo}" (formato: Database.schema.NomeVista).`)
  }
  return parti.map((p) => `[${p.replace(/]/g, ']]')}]`).join('.')
}

/** Riga della vista: le colonne si cercano per nome, senza distinguere maiuscole/minuscole. */
export type RigaVista = Record<string, unknown>

function campo(r: RigaVista, nome: string): unknown {
  const k = Object.keys(r).find((x) => x.toLowerCase() === nome.toLowerCase())
  return k === undefined ? undefined : r[k]
}

function numero(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

const chiave = (s: string) => s.trim().toUpperCase()

/**
 * Indice dei magazzini EssentiaMES: sia l'Id sia il codice (nome) portano all'Id,
 * il formato usato dalla produzione in Brighetti_Giacenze.CodiceMagazzino.
 */
export function indiceMagazzini(magazzini: { Id: number; CodiceMagazzino: string | null }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const g of magazzini) {
    m.set(String(g.Id), String(g.Id))
    if (g.CodiceMagazzino && g.CodiceMagazzino.trim()) m.set(chiave(g.CodiceMagazzino), String(g.Id))
  }
  return m
}

/** Codice magazzino da salvare: l'Id se riconosciuto (per Id o per nome), altrimenti null. */
export function risolviMagazzino(valore: string, indice: Map<string, string>): string | null {
  return indice.get(chiave(valore)) ?? null
}

/**
 * Converte le righe lette dalla vista (colonne Articolo, Giacenza; facoltative Magazzino,
 * ScortaMinima, InArrivo). Senza colonna Magazzino si usa `magazzinoPredefinito`.
 * Con `soloAnagrafica` scarta gli articoli che non sono nell'anagrafica di EssentiaMES;
 * i magazzini non riconosciuti sono sempre scartati (creerebbero giacenze in un
 * magazzino inesistente).
 */
export function preparaRigheVista(
  righe: RigaVista[],
  opzioni: { articoli: Set<string>; magazzini: Map<string, string>; soloAnagrafica: boolean; magazzinoPredefinito?: string | null },
): { righe: MexalGiacenza[]; ignorate: number } {
  const out: MexalGiacenza[] = []
  let ignorate = 0
  for (const r of righe) {
    const a = campo(r, 'Articolo')
    const articolo = a === null || a === undefined ? '' : String(a).trim()
    const m = campo(r, 'Magazzino')
    const magazzino = m === null || m === undefined || String(m).trim() === '' ? (opzioni.magazzinoPredefinito || '').trim() : String(m).trim()
    const quantita = numero(campo(r, 'Giacenza'))
    if (!articolo || !magazzino || quantita === undefined) {
      ignorate++
      continue
    }
    const idMagazzino = risolviMagazzino(magazzino, opzioni.magazzini)
    if (!idMagazzino || (opzioni.soloAnagrafica && !opzioni.articoli.has(chiave(articolo)))) {
      ignorate++
      continue
    }
    const riga: MexalGiacenza = { CodiceArticolo: articolo, CodiceMagazzino: idMagazzino, Quantita: quantita }
    const smin = numero(campo(r, 'ScortaMinima'))
    const arrivo = numero(campo(r, 'InArrivo'))
    if (smin !== undefined) riga.ScortaMinima = smin
    if (arrivo !== undefined) riga.InArrivo = arrivo
    out.push(riga)
  }
  return { righe: out, ignorate }
}

/** Vero se la vista non ha la colonna Magazzino (serve allora il magazzino predefinito). */
export function vistaSenzaMagazzino(righe: RigaVista[]): boolean {
  return righe.length > 0 && campo(righe[0], 'Magazzino') === undefined
}

export const chiaveArticolo = chiave
