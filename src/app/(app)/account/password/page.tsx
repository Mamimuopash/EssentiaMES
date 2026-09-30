import { requirePageUser } from '@/lib/auth/auth'
import CambioPasswordForm from './CambioPasswordForm'

export const metadata = { title: 'Cambia password - EssentiaMES' }

export default async function CambioPasswordPage() {
  await requirePageUser()
  return (
    <>
      <div className="MainTitleCambiaPassword">
        <h1 className="TitleCambiaPassword">Cambia Password</h1>
      </div>
      <CambioPasswordForm />
    </>
  )
}
