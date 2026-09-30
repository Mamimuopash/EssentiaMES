'use client'

import Swal from 'sweetalert2'

/* Helper lato browser: chiamate alle API, notifiche e dialoghi (SweetAlert2 come nel vecchio software). */

export interface ApiResult {
  ok: boolean
  message?: string
  [k: string]: unknown
}

export async function api<T = ApiResult>(
  url: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T & ApiResult> {
  type R = T & ApiResult
  const init: RequestInit = { method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'), credentials: 'same-origin' }
  if (opts.form) init.body = opts.form
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    return { ok: false, message: 'Server non raggiungibile. Controllare la connessione.' } as R
  }
  if (res.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ricarica completa voluta
    window.location.href = `/login?returnUrl=${encodeURIComponent(window.location.pathname)}`
    return { ok: false, message: 'Sessione scaduta' } as R
  }
  try {
    return (await res.json()) as R
  } catch {
    return { ok: false, message: `Errore ${res.status}` } as R
  }
}

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
})

export function notify(ok: boolean, message?: string) {
  void Toast.fire({ icon: ok ? 'success' : 'error', title: message || (ok ? 'Operazione completata' : 'Operazione non riuscita') })
}

export async function conferma(title: string, text: string, confirmButtonText = 'Sì, procedi'): Promise<boolean> {
  const r = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonText: 'Annulla',
    confirmButtonText,
  })
  return r.isConfirmed
}

/** Aggiunta nota (come AddNota del vecchio app.js). type = TipoElemento. */
export async function aggiungiNota(id: number | string, type: number): Promise<boolean> {
  const { value: text } = await Swal.fire({
    input: 'textarea',
    inputLabel: 'Aggiungi qui la nota',
    inputPlaceholder: 'Inserisci qui la nota aggiuntiva...',
    confirmButtonText: 'Aggiungi',
    showCancelButton: true,
    cancelButtonText: 'Annulla',
  })
  if (!text) return false
  const r = await api('/api/note', { body: { Id: Number(id), Nota: text, Type: type } })
  notify(r.ok, r.message)
  return r.ok
}

export async function aggiungiFile(id: number | string, type: number): Promise<boolean> {
  const { value: file } = await Swal.fire({
    title: 'Seleziona File',
    input: 'file',
    inputAttributes: { accept: '*', 'aria-label': 'Carica File per Documento' },
    showCancelButton: true,
    cancelButtonText: 'Annulla',
  })
  if (!file) return false
  const fd = new FormData()
  fd.append('id', String(id))
  fd.append('file', file as File)
  fd.append('Type', String(type))
  const r = await api('/api/documenti', { form: fd })
  notify(r.ok, r.message)
  return r.ok
}

export async function eliminaNota(id: number): Promise<boolean> {
  if (!(await conferma('Eliminare nota?', 'ATTENZIONE: questa operazione sarà irreversibile', 'Sì, cancella!'))) return false
  const r = await api(`/api/note/${id}`, { method: 'DELETE' })
  notify(r.ok, r.message)
  return r.ok
}

export async function eliminaFile(id: number): Promise<boolean> {
  if (!(await conferma('Eliminare file?', 'ATTENZIONE: questa operazione sarà irreversibile', 'Sì, cancella!'))) return false
  const r = await api(`/api/documenti/${id}`, { method: 'DELETE' })
  notify(r.ok, r.message)
  return r.ok
}

export { Swal }
