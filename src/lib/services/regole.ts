/*
 * Regole di calcolo "pure" (senza DB), testate in tests/regole.test.ts.
 */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Prefissi codice dal pannello Automazioni ("G8, G12" -> ["G8","G12"]; vuoto = tutti). */
export function parsePrefissi(grezzo: string | null | undefined): string[] {
  if (!grezzo || !grezzo.trim()) return []
  return grezzo
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/** Sotto scorta: punto di riordino definito e (giacenza + in arrivo) <= scorta minima. */
export function sottoScorta(giacenza: number, inArrivo: number, scortaMinima: number): boolean {
  if (scortaMinima <= 0) return false
  return giacenza + inArrivo <= scortaMinima
}

/**
 * Quantita' da proporre: obiettivo = scorta massima (se impostata) altrimenti
 * moltiplicatore x scorta minima; fabbisogno = obiettivo - (giacenza + in arrivo);
 * arrotondata per eccesso al multiplo del lotto minimo. 0 = nessuna proposta.
 */
export function calcolaQuantitaProposta(p: {
  giacenza: number
  inArrivo: number
  scortaMinima: number
  scortaMassima: number
  moltiplicatore: number
  lottoMinimo: number
}): number {
  const obiettivo = p.scortaMassima > 0 ? p.scortaMassima : p.scortaMinima * p.moltiplicatore
  const fabbisogno = round2(obiettivo - (p.giacenza + p.inArrivo))
  if (fabbisogno <= 0) return 0
  if (p.lottoMinimo > 0) return round2(Math.ceil(round2(fabbisogno / p.lottoMinimo)) * p.lottoMinimo)
  return fabbisogno
}

/** Ora "HH:mm" -> [ora, minuto] con default 02:00 (come CronSyncGiornaliera). */
export function parseOra(valore: string | null | undefined): [number, number] {
  let ora = 2
  let minuto = 0
  const parti = (valore || '').split(':')
  if (parti.length >= 2) {
    const o = parseInt(parti[0], 10)
    const m = parseInt(parti[1], 10)
    if (!Number.isNaN(o)) ora = o
    if (!Number.isNaN(m)) minuto = m
  }
  if (ora < 0 || ora > 23) ora = 2
  if (minuto < 0 || minuto > 59) minuto = 0
  return [ora, minuto]
}

/**
 * Il job ordini deve partire in questo minuto? (equivalente del cron Hangfire:
 * intervallo >= 60 -> ogni ora allo scoccare, altrimenti ogni N minuti).
 */
export function jobOrdiniDaEseguire(d: Date, minutiIntervallo: number): boolean {
  let n = Math.trunc(minutiIntervallo)
  if (!Number.isFinite(n) || n < 1) n = 60
  if (n >= 60) return d.getMinutes() === 0
  return d.getMinutes() % n === 0
}

/* ------------------------------------------------------------ efficienza */

/** Minuti "di calendario" tra due istanti come VB DateDiff(Minute). */
function diffMinuti(a: Date, b: Date) {
  return Math.floor(b.getTime() / 60000) - Math.floor(a.getTime() / 60000)
}

/** Arrotondamento bancario (assegnazione Double -> Integer in VB.NET). */
function cint(n: number) {
  const f = Math.floor(n)
  const d = n - f
  if (d > 0.5) return f + 1
  if (d < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

/** Base di calcolo: un turno di 8 ore (480 minuti), come nel vecchio software. */
export const MINUTI_TURNO = 480

export interface Efficienza {
  minuti: number
  perc: number
  percFermo: number
}

function daMinuti(minuti: number): Efficienza {
  if (minuti === 0) return { minuti, perc: 0, percFermo: 100 }
  const perc = cint((minuti * 100) / MINUTI_TURNO)
  return { minuti, perc, percFermo: 100 - perc }
}

/** MTConnect: somma dei minuti tra letture consecutive in stato AUTOMATIC. */
export function efficienzaDaLetture(letture: Date[]): Efficienza {
  let minuti = 0
  for (let i = 1; i < letture.length; i++) minuti += diffMinuti(letture[i - 1], letture[i])
  return daMinuti(minuti)
}

/** CSV (Schneeberger): somma delle durate delle lavorazioni. */
export function efficienzaDaIntervalli(intervalli: { inizio: Date; fine: Date }[]): Efficienza {
  let minuti = 0
  for (const x of intervalli) minuti += diffMinuti(x.inizio, x.fine)
  return daMinuti(minuti)
}
