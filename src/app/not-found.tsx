import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="container text-center" style={{ paddingTop: 80 }}>
      <i className="fa-solid fa-circle-question fa-5x fa-gradient" />
      <h2 className="mt-3">Pagina non trovata</h2>
      <p className="text-muted">L&apos;elemento richiesto non esiste o è stato eliminato.</p>
      <Link href="/" className="btn btn-grad px-4">Torna alla home</Link>
    </div>
  )
}
