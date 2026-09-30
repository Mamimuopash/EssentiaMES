'use client'

import { useEffect } from 'react'

export default function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  size = 'lg',
}: {
  title: React.ReactNode
  open: boolean
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  const maxWidth = size === 'md' ? 560 : size === 'xl' ? 1140 : 820
  return (
    <div className="modal-backdrop-custom" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-custom" style={{ maxWidth }} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h5 className="modal-title m-0">{title}</h5>
          <button type="button" className="btn-close" aria-label="Chiudi" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
