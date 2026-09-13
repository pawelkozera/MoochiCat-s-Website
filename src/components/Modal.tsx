import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import formCats from '../assets/form-cats.png'
import modalClose from '../assets/modal-close.png'
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
      className="modal modal-cat-form"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
        <svg className="modal-form-cats" viewBox="744 53 624 375" aria-hidden="true" focusable="false">
          <image href={formCats} width="2048" height="1535" />
        </svg>
      <div className="modal-form-surface">
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>

        <button
          type="button"
          className="modal-close-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <svg viewBox="217 83 1376 1379" aria-hidden="true" focusable="false">
            <image href={modalClose} width="2048" height="1535" />
          </svg>
        </button>
      </header>

      {children}
      </div>
    </dialog>
  )
}