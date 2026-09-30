'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

type Voce = { href: string; label: string }

function Icona({ icon, attiva }: { icon: string; attiva: boolean }) {
  return <i className={`fa-solid ${icon} fa-2x ${attiva ? 'fa-gradient' : 'fa-gradient-Not'}`} />
}

function Dropup({ icon, voci, pathname, open, onToggle }: { icon: string; voci: Voce[]; pathname: string; open: boolean; onToggle: () => void }) {
  const attiva = voci.some((v) => pathname.startsWith(v.href))
  return (
    <div className={`nav-item-x dropup ${open ? 'open' : ''}`}>
      <button type="button" className="nav-btn dropbtn" onClick={onToggle} aria-label="Menu">
        <Icona icon={icon} attiva={attiva} />
      </button>
      <div className="dropup-content">
        {voci.map((v) => (
          <Link key={v.href} href={v.href} onClick={onToggle}>
            {v.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Barra di navigazione inferiore (stessa struttura del vecchio _Layout). */
export default function BottomNav({ ruolo }: { ruolo: 'admin' | 'operatore' | 'altro' }) {
  const pathname = usePathname()
  const [aperto, setAperto] = useState<string | null>(null)
  const logo = (
    <div className="nav-item-x">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/Logo.png" width={50} alt="Essentia" />
    </div>
  )
  const account = (
    <div className="nav-item-x">
      <Link href="/account" aria-label="Account">
        <Icona icon="fa-user" attiva={pathname.startsWith('/account')} />
      </Link>
    </div>
  )
  if (ruolo !== 'admin') {
    const home = ruolo === 'operatore' ? '/operatore' : '/dashboard'
    return (
      <nav className="bottom-nav">
        <div className="nav-item-x">
          <Link href={home} aria-label="Home">
            <Icona icon="fa-house" attiva={pathname.startsWith(home)} />
          </Link>
        </div>
        {logo}
        {account}
      </nav>
    )
  }
  const toggle = (k: string) => setAperto(aperto === k ? null : k)
  return (
    <nav className="bottom-nav">
      <div className="nav-item-x">
        <Link href="/dashboard" aria-label="Dashboard">
          <Icona icon="fa-house" attiva={pathname.startsWith('/dashboard')} />
        </Link>
      </div>
      <div className="nav-item-x">
        <Link href="/cruscotto" aria-label="Centro di Controllo">
          <Icona icon="fa-gauge-high" attiva={pathname.startsWith('/cruscotto')} />
        </Link>
      </div>
      <Dropup
        icon="fa-cart-shopping"
        pathname={pathname}
        open={aperto === 'mag'}
        onToggle={() => toggle('mag')}
        voci={[
          { href: '/articoli', label: 'Dashboard Articoli' },
          { href: '/magazzini', label: 'Dashboard Magazzino' },
          { href: '/giacenze', label: 'Dashboard Giacenza' },
          { href: '/lotti', label: 'Dashboard Lotti' },
        ]}
      />
      {logo}
      <Dropup
        icon="fa-industry"
        pathname={pathname}
        open={aperto === 'prod'}
        onToggle={() => toggle('prod')}
        voci={[
          { href: '/reparti', label: 'Dashboard Reparti' },
          { href: '/macchine', label: 'Dashboard Macchina' },
          { href: '/procedure', label: 'Cicli di lavoro' },
          { href: '/storico', label: 'Dashboard Utenti' },
        ]}
      />
      <Dropup
        icon="fa-robot"
        pathname={pathname}
        open={aperto === 'auto'}
        onToggle={() => toggle('auto')}
        voci={[
          { href: '/automazioni', label: 'Automazioni' },
          { href: '/ordini-automatici', label: 'Ordini Automatici' },
          { href: '/sync-mexal', label: 'Sincronizzazione Mexal' },
        ]}
      />
      {account}
    </nav>
  )
}
