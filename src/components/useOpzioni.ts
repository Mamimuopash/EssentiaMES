'use client'

import { useEffect, useState } from 'react'
import { api } from './client-api'

export interface Opzione {
  value: number | string
  label: string | null
  [k: string]: unknown
}

/** Carica le opzioni per un menu a tendina (/api/opzioni?tipo=...). */
export function useOpzioni(tipo: string, attivo = true): Opzione[] {
  const [items, setItems] = useState<Opzione[]>([])
  useEffect(() => {
    if (!attivo) return
    let annullato = false
    void api<{ items: Opzione[] }>(`/api/opzioni?tipo=${tipo}`).then((r) => {
      if (!annullato && r.ok) setItems(r.items)
    })
    return () => {
      annullato = true
    }
  }, [tipo, attivo])
  return items
}
