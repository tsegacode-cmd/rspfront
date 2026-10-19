import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import logoImage from '../logo/logo.png'
import './InstallAppModal.css'

function InstallAppModal({ stage, hasNativePrompt, error, onClose, onConfirm }) {
  const actionButtonRef = useRef(null)
  const isInstructions = stage === 'instructions'
  const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)

  useEffect(() => {
    actionButtonRef.current?.focus()

    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, stage])

  return createPortal(
    <div
      className="install-app-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="install-app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-app-title"
        aria-describedby="install-app-description"
      >
        <button className="install-app-close" type="button" onClick={onClose} aria-label="Close install dialog">
          ×
        </button>
        <img className="install-app-icon" src={logoImage} alt="" />
        <p className="install-app-eyebrow">REDSEA MOBILE APP</p>
        <h2 id="install-app-title">
          {isInstructions ? 'Add REDSEA to your Home Screen' : 'Install REDSEA on this device?'}
        </h2>

        {isInstructions ? (
          <>
            <p id="install-app-description" className="install-app-description">
              {isIOS
                ? 'In Safari, tap Share, choose “Add to Home Screen”, then tap Add.'
                : 'Open your browser menu (⋮ or Share) and choose “Install app” or “Add to Home Screen”.'}
            </p>
            {!isIOS && (
              <p className="install-app-note">
                If you do not see that option, open this website in Chrome or another browser that supports app installation.
              </p>
            )}
            <div className="install-app-actions">
              <button ref={actionButtonRef} type="button" className="install-app-primary" onClick={onClose}>
                Got it
              </button>
            </div>
          </>
        ) : (
          <>
            <p id="install-app-description" className="install-app-description">
              Add REDSEA for quick access and an app-style, full-screen experience. Your browser will show its own final confirmation.
            </p>
            <div className="install-app-benefits">
              <span><b aria-hidden="true">✓</b> Opens directly from your Home Screen</span>
              <span><b aria-hidden="true">✓</b> Uses the latest REDSEA website from the server</span>
            </div>
            <p className="install-app-note">
              Installation is handled securely by your browser; no separate APK download is needed.
            </p>
            {error && <p className="install-app-error" role="alert">{error}</p>}
            <div className="install-app-actions">
              <button type="button" className="install-app-secondary" onClick={onClose}>
                Not now
              </button>
              <button ref={actionButtonRef} type="button" className="install-app-primary" onClick={onConfirm}>
                {hasNativePrompt ? 'Continue to install' : 'Show install steps'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body
  )
}

export default InstallAppModal
