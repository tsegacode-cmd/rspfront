import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './CardShareActions.css'

function CardShareActions({ url, title, className = '' }) {
  const [dialogMode, setDialogMode] = useState(null)
  const [status, setStatus] = useState('')
  const shareTitle = title || 'Product'
  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareTitle}\n${url}`)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareTitle)}`
  }

  useEffect(() => {
    if (!dialogMode) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setDialogMode(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [dialogMode])

  const copyLink = async () => {
    setDialogMode('copy')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setStatus('Link copied.')
      } else {
        setStatus('Select the link below and copy it.')
      }
    } catch (error) {
      setStatus(`Could not copy link: ${error.message}`)
    }
  }

  const shareLink = async () => {
    setDialogMode('share')
    setStatus('')
  }

  const shareWithDevice = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url })
        setStatus('Link shared.')
      } else {
        setStatus('Choose WhatsApp or Telegram, or copy the link below.')
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus('Share cancelled.')
      } else {
        setStatus(`Could not share link: ${error.message}`)
      }
    }
  }

  return (
    <div className={`card-share-actions ${className}`.trim()} onClick={event => event.stopPropagation()}>
      <button type="button" onClick={copyLink} aria-label={`Copy link to ${title}`}>
        Copy link
      </button>
      <button type="button" onClick={shareLink} aria-label={`Share ${title}`}>
        Share
      </button>
      {dialogMode && createPortal(
        <div className="card-share-dialog-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget) setDialogMode(null)
        }}>
          <section className="card-share-dialog" role="dialog" aria-modal="true" aria-labelledby="card-share-dialog-title">
            <button type="button" className="card-share-dialog-close" onClick={() => setDialogMode(null)} aria-label="Close dialog">×</button>
            <h2 id="card-share-dialog-title">{dialogMode === 'copy' ? 'Copy product link' : 'Share product'}</h2>
            <p>{shareTitle}</p>
            <input type="url" value={url} readOnly aria-label="Product link" onFocus={event => event.target.select()} />
            {status && <p className="card-share-dialog-status" role="status">{status}</p>}
            <div className="card-share-dialog-actions">
              <button type="button" onClick={copyLink}>Copy link</button>
              {dialogMode === 'share' && (
                <>
                  <button type="button" onClick={shareWithDevice}>More sharing options</button>
                  <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  <a href={shareLinks.telegram} target="_blank" rel="noopener noreferrer">Telegram</a>
                </>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  )
}

export default CardShareActions
