import Link from 'next/link'
import { requirePageUser } from '@/lib/auth/auth'
import { Chiavi, leggiBool, leggiTesto, predefinito } from '@/lib/services/impostazioni'
import SyncMexal from './SyncMexal'

export const metadata = { title: 'Sincronizzazione Mexal - EssentiaMES' }
export const dynamic = 'force-dynamic'

export default async function SyncMexalPage() {
  await requirePageUser({ admin: true })
  const [abilitato, percorso, ora] = await Promise.all([
    leggiBool(Chiavi.SyncMexalAbilitato),
    leggiTesto(Chiavi.SyncMexalPercorsoFile, ''),
    leggiTesto(Chiavi.SchedulerOraSyncGiornaliera, predefinito(Chiavi.SchedulerOraSyncGiornaliera)),
  ])
  return (
    <div style={{ marginTop: 24 }}>
      <h2 className="page-title">Sincronizzazione giacenze Mexal</h2>
      <p>
        Stato automatismo: {abilitato ? <span className="badge bg-success">ATTIVO</span> : <span className="badge bg-secondary">SPENTO</span>}
        &nbsp; Sync giornaliera alle <code>{ora}</code>
        &nbsp; <Link href="/automazioni">Configura nel pannello Automazioni</Link>
      </p>
      <p>
        File CSV configurato: <code>{percorso || '(non impostato)'}</code>
      </p>
      <SyncMexal />
    </div>
  )
}
