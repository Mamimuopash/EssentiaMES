/* Limitatore in memoria (per istanza) per endpoint sensibili come il login. */
const buckets = new Map<string, { count: number; reset: number }>()

export function consentiTentativo(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k)
    return true
  }
  b.count++
  return b.count <= max
}

/**
 * IP del client dal primo valore di X-Forwarded-For. IIS/ARR per impostazione
 * predefinita aggiunge anche la porta ("1.2.3.4:51234", "[::1]:51234"): la togliamo,
 * altrimenti ogni connessione sembrerebbe un client diverso.
 */
export function ipClient(xForwardedFor: string | null | undefined): string {
  let ip = (xForwardedFor || '').split(',')[0].trim()
  const v6 = ip.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (v6) ip = v6[1]
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'))
  return ip || 'locale'
}
