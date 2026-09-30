import Link from 'next/link'
import { requirePageUser } from '@/lib/auth/auth'
import LogoutButton from './LogoutButton'

export const metadata = { title: 'Account - EssentiaMES' }

const DOCS_DEFAULT = 'https://drive.google.com/drive/folders/1J8PTHN1RIm1lJFcMY4N0L1ativkn_MpI?usp=sharing'

export default async function AccountPage() {
  const user = await requirePageUser()
  const docs = process.env.DOCS_URL ?? DOCS_DEFAULT
  return (
    <>
      <div className="MainTitleAccount">
        <h1 className="TitleAccount">Account</h1>
      </div>
      <div className="TextAccount mt-5">
        <i className="fa-solid fa-user fa-6x fa-gradient" />
      </div>
      <div className="TextAccount">
        <h3>{user.userName.split('@')[0]}</h3>
      </div>
      <div className="TextAccount">
        <p>In questa sezione puoi effettuare il logout e cambiare password.</p>
      </div>
      <div className="TextAccount">
        <p className="text-muted small">Ruolo: {user.roles.join(', ') || '-'}</p>
      </div>
      {docs && (
        <div className="text-center containerLogout">
          <a className="btn btnLogOut" href={docs} target="_blank" rel="noreferrer">
            Documentazione Essentia
          </a>
        </div>
      )}
      <div className="text-center containerCambioPassword">
        <Link className="btn btnCambioPassword" href="/account/password">
          Cambia Password
        </Link>
      </div>
      <div className="text-center containerLogout">
        <LogoutButton />
      </div>
    </>
  )
}
