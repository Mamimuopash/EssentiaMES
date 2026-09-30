'use client'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container text-center" style={{ paddingTop: 80 }}>
      <i className="fa-solid fa-triangle-exclamation fa-5x text-danger" />
      <h2 className="mt-3">Si è verificato un errore</h2>
      <p className="text-muted">
        {error.message?.includes('connect') || error.message?.includes('ETIMEOUT') || error.message?.includes('ESOCKET')
          ? 'Il database non è raggiungibile. Verificare la connessione verso il server SQL aziendale.'
          : 'Riprovare. Se il problema persiste contattare l’amministratore.'}
      </p>
      {error.digest && <p className="small text-muted">Codice: {error.digest}</p>}
      <button className="btn btn-grad px-4" onClick={reset}>Riprova</button>
    </div>
  )
}
