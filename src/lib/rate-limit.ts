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
