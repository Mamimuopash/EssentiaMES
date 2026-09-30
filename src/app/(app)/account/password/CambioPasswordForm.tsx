'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, notify } from '@/components/client-api'

export default function CambioPasswordForm() {
  const router = useRouter()
  const [f, setF] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form
      className="mt-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setErr(null)
        const r = await api('/api/auth/password', { body: f })
        setBusy(false)
        if (!r.ok) return setErr(r.message || 'Errore')
        notify(true, 'La password è stata modificata.')
        router.push('/account')
      }}
    >
      {err && <div className="text-danger text-center mb-3">{err}</div>}
      {(
        [
          ['oldPassword', 'Vecchia Password...', 'current-password'],
          ['newPassword', 'Nuova Password...', 'new-password'],
          ['confirmPassword', 'Conferma Password...', 'new-password'],
        ] as const
      ).map(([k, ph, ac]) => (
        <div className="mb-3 d-flex justify-content-center" key={k}>
          <input type="password" className="form-control inputLogin" placeholder={ph} autoComplete={ac} value={f[k]} onChange={set(k)} required />
        </div>
      ))}
      <p className="text-center text-muted small">Minimo 6 caratteri, con maiuscola, minuscola, numero e carattere speciale.</p>
      <div className="text-center">
        <button type="submit" className="btn btnRichiesta" disabled={busy}>
          Cambia password
        </button>
      </div>
    </form>
  )
}
