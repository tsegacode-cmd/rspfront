import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './LogoutConfirmationModal.css'

function LogoutConfirmationModal({ onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()

    const handleKeyDown = event => {
      if (event.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return createPortal(
    <div
      className="logout-confirm-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        className="logout-confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-description"
      >
        <div className="logout-confirm-icon" aria-hidden="true">↪</div>
        <h2 id="logout-confirm-title">Log out?</h2>
        <p id="logout-confirm-description">
          Are you sure you want to log out? You will need to sign in again to access your account.
        </p>
        <div className="logout-confirm-actions">
          <button ref={cancelButtonRef} type="button" className="logout-confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="logout-confirm-submit" onClick={onConfirm}>
            Log out
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

export default LogoutConfirmationModal
