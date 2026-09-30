'use client'

import { useState } from 'react'

export default function LoginForm({ returnUrl }: { returnUrl?: string }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      })
      const data = await res.json().catch(() => ({ ok: false, message: 'Errore di rete' }))
      if (!data.ok) {
        setError(data.message || 'Credenziali inserite non valide.')
        return
      }
      window.location.href = returnUrl || data.redirect || '/'
    } catch {
      setError('Server non raggiungibile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-100 pb-3">
      {error && <div className="text-danger text-center mb-2">{error}</div>}
      <div className="my-3 inputLoginContainer">
        <input className="form-control inputLogin" placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div className="my-3 inputLoginContainer">
        <input className="form-control inputLogin" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <div className="form-check d-flex justify-content-center gap-2">
        <input className="form-check-input" type="checkbox" id="remember" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
        <label className="form-check-label" htmlFor="remember">Ricordami su questo dispositivo</label>
      </div>
      <div className="mt-5 mb-4 text-center">
        <button type="submit" className="btn btnRichiesta" disabled={busy}>
          {busy ? 'Accesso in corso...' : 'Accedi'}
        </button>
      </div>
    </form>
  )
}
