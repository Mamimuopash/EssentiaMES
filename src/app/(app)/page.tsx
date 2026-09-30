import { redirect } from 'next/navigation'
import { requirePageUser } from '@/lib/auth/auth'

/** Home: gli operatori vanno alla postazione macchina, gli altri alla dashboard (Home/Index). */
export default async function Home() {
  const user = await requirePageUser()
  redirect(user.isOperatore && !user.isAdmin ? '/operatore' : '/dashboard')
}
