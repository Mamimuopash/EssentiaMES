import { requirePageUser } from '@/lib/auth/auth'
import Articoli from './Articoli'

export const metadata = { title: 'Dashboard Articoli - EssentiaMES' }

export default async function ArticoliPage() {
  await requirePageUser({ admin: true })
  return <Articoli />
}
