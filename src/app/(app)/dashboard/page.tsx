import { requirePageUser } from '@/lib/auth/auth'
import { pinPlanimetria, statiMacchine } from '@/lib/services/macchine'
import Dashboard from './Dashboard'

export const metadata = { title: 'Dashboard Admin - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Dashboard: planimetria con pin macchine + stati macchina (vecchia Macchine/AdminDashboard). */
export default async function DashboardPage() {
  const user = await requirePageUser()
  const [pins, stati] = await Promise.all([pinPlanimetria(), statiMacchine()])
  return <Dashboard pins={pins} stati={stati} isAdmin={user.isAdmin} />
}
