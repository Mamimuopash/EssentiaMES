/**
 * Indicatore a semicerchio (rosso / giallo / verde) con lancetta, come i
 * "gauge" della vecchia Analisi (scala 0-105, lancetta limitata alla scala).
 */
export default function Gauge({ value, max = 105 }: { value: number; max?: number }) {
  const v = Math.max(0, Math.min(max, value))
  const r = 70
  const cx = 90
  const cy = 90
  const arco = (a0: number, a1: number) => {
    const p = (a: number) => [cx + r * Math.cos(Math.PI + a * Math.PI), cy + r * Math.sin(Math.PI + a * Math.PI)]
    const [x0, y0] = p(a0)
    const [x1, y1] = p(a1)
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`
  }
  const ang = Math.PI + (v / max) * Math.PI
  const nx = cx + (r - 12) * Math.cos(ang)
  const ny = cy + (r - 12) * Math.sin(ang)
  return (
    <svg viewBox="0 0 180 100" width="180" height="100" role="img" aria-label={`Valore ${value}`}>
      <path d={arco(0, 1 / 3)} stroke="rgba(255, 35, 0, 0.79)" strokeWidth="18" fill="none" />
      <path d={arco(1 / 3, 2 / 3)} stroke="rgba(255, 206, 86, 1)" strokeWidth="18" fill="none" />
      <path d={arco(2 / 3, 1)} stroke="rgba(46, 191, 0, 0.79)" strokeWidth="18" fill="none" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#000" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="#000" />
    </svg>
  )
}
