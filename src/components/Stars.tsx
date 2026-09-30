/** Importanza articolo (1..5) come stelle, come nel vecchio elenco articoli. */
export default function Stars({ value }: { value: number }) {
  const n = Math.max(1, Math.min(5, Number(value) || 1))
  return (
    <span className="stars" title={`Importanza ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={`fa-solid fa-star ${i <= n ? 'on' : ''}`} />
      ))}
    </span>
  )
}
