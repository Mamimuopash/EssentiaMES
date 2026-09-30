import { requirePageUser } from '@/lib/auth/auth'
import BottomNav from '@/components/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser()
  const ruolo = user.isAdmin ? 'admin' : user.isOperatore ? 'operatore' : 'altro'
  return (
    <>
      <BottomNav ruolo={ruolo} />
      <div className="container body-content">{children}</div>
    </>
  )
}
