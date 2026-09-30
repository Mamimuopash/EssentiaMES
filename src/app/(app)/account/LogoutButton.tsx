'use client'

export default function LogoutButton() {
  return (
    <button
      type="button"
      className="btn btnLogOut"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ricarica completa voluta
        window.location.href = '/login'
      }}
    >
      Logout
    </button>
  )
}
