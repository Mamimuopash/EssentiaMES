import { requirePageUser } from '@/lib/auth/auth'
import Giacenze from './Giacenze'

export const metadata = { title: 'Dashboard Giacenze - EssentiaMES' }

export default async function GiacenzePage() {
  await requirePageUser({ admin: true })
  return <Giacenze />
}
