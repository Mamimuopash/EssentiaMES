import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/auth'
import LoginForm from './LoginForm'
import pkg from '../../../package.json'

export const metadata = { title: 'Accedi - EssentiaMES' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnUrl?: string }> }) {
  const user = await getCurrentUser().catch(() => null)
  if (user) redirect(user.isOperatore && !user.isAdmin ? '/operatore' : '/dashboard')
  const { returnUrl } = await searchParams
  const safeReturn = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : undefined
  return (
    <>
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '85vh', padding: 16 }}>
        <section className="card cardLogin" style={{ boxShadow: 'none', width: '100%', maxWidth: 560 }}>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/Small.png" width={200} alt="Essentia" style={{ margin: 32 }} />
          </div>
          <LoginForm returnUrl={safeReturn} />
        </section>
      </div>
      <p style={{ position: 'fixed', bottom: 16, right: 16, margin: 0 }} className="text-muted small">
        EssentiaMES V.{pkg.version}
      </p>
    </>
  )
}
