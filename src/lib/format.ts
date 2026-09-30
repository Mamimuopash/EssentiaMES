import { APP_TIMEZONE } from './enums'

/* Formattazione condivisa server/client (date sempre nel fuso dell'azienda). */

type DateLike = Date | string | number | null | undefined

function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined || d === '') return null
  const x = d instanceof Date ? d : new Date(d)
  return Number.isNaN(x.getTime()) ? null : x
}

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('it-IT', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  if (o.hour === '24') o.hour = '00'
  return o
}

/** dd/MM/yyyy HH:mm:ss (come DateTime.ToString() in cultura it-IT) */
export function fmtDateTime(d: DateLike): string {
  const x = toDate(d)
  if (!x) return ''
  const p = parts(x)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`
}

/** dd/MM/yy HH:mm */
export function fmtDateTimeShort(d: DateLike): string {
  const x = toDate(d)
  if (!x) return ''
  const p = parts(x)
  return `${p.day}/${p.month}/${p.year.slice(-2)} ${p.hour}:${p.minute}`
}

/** dd/MM/yyyy */
export function fmtDate(d: DateLike): string {
  const x = toDate(d)
  if (!x) return ''
  const p = parts(x)
  return `${p.day}/${p.month}/${p.year}`
}

/** yyyyMMdd (formato del filtro date dell'analisi macchina) */
export function fmtYmd(d: DateLike): string {
  const x = toDate(d)
  if (!x) return ''
  const p = parts(x)
  return `${p.year}${p.month}${p.day}`
}

/** Numero in formato italiano, max 2 decimali. */
export function fmtNum(n: number | string | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || n === '') return ''
  const v = typeof n === 'number' ? n : Number(n)
  if (Number.isNaN(v)) return String(n)
  return v.toLocaleString('it-IT', { maximumFractionDigits: decimals })
}

/**
 * Equivalente di VB DateDiff(DateInterval.Minute, a, b): numero di "confini di
 * minuto" attraversati (non arrotonda la durata, tronca i secondi di entrambe).
 */
export function dateDiffMinutes(a: DateLike, b: DateLike): number {
  const x = toDate(a)
  const y = toDate(b)
  if (!x || !y) return 0
  return Math.floor(y.getTime() / 60000) - Math.floor(x.getTime() / 60000)
}

/** Arrotondamento "bancario" come CInt/assegnazione a Integer in VB.NET. */
export function vbCInt(n: number): number {
  const f = Math.floor(n)
  const diff = n - f
  if (diff > 0.5) return f + 1
  if (diff < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}
