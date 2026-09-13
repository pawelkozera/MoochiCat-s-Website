import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import formCats from '../assets/form-cats.png'
import './Modal.css'

type ModalProps = {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  variant?: 'default' | 'event-form'
}

export function Modal({
  title,
  children,
  onClose,
  busy = false,
  variant = 'default',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()

    return () => {
      dialog?.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className={variant === 'event-form' ? 'modal modal-cat-form' : 'modal'}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      {variant === 'event-form' && (
        <svg className="modal-form-cats" viewBox="744 53 624 375" aria-hidden="true" focusable="false">
          <image href={formCats} width="2048" height="1535" />
        </svg>
      )}
      <div className={variant === 'event-form' ? 'modal-form-surface' : undefined}>
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>

        <button
          type="button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {children}
      </div>
    </dialog>
  )
}