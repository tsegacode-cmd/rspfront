import { useEffect } from 'react'
import './PromoCodeListModal.css'

const formatReward = item => item.rewardType === 'coin'
  ? `${Number(item.amount || 0).toLocaleString()} coins`
  : `ETB ${Number(item.amount || 0).toFixed(2)} · ${item.rewardType === 'real' ? 'Real wallet' : 'Bonus wallet'}`

function PromoCodeListModal({ codes, title, onClose, onUse, loading = false }) {
  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="promo-code-list-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="promo-code-list-modal" role="dialog" aria-modal="true" aria-labelledby="promo-code-list-modal-title">
        <header className="promo-code-list-modal-header">
          <div>
            <h2 id="promo-code-list-modal-title">{title}</h2>
            <p>{loading ? 'Loading promo codes…' : `${codes.length} code${codes.length === 1 ? '' : 's'}`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close promo code list">×</button>
        </header>
        {loading ? <p className="promo-code-list-modal-empty">Loading promo codes…</p> : codes.length === 0 ? (
          <p className="promo-code-list-modal-empty">No promo codes are currently posted.</p>
        ) : (
          <div className="promo-code-list-modal-scroll">
            <div className="promo-code-list-modal-items">
              {codes.map(item => {
                const isExhausted = Number(item.maxClaims) > 0 && Number(item.totalClaims) >= Number(item.maxClaims)
                const status = item.claimedByMe ? 'Claimed by you' : isExhausted ? 'Fully claimed' : item.status || 'Available'
                return (
                  <article className="promo-code-list-modal-item" key={item.id || item.code}>
                    <div className="promo-code-list-modal-item-heading">
                      <strong>{item.title || 'Promo reward'}</strong>
                      <span className={item.claimedByMe || isExhausted ? 'claimed' : ''}>{status}</span>
                    </div>
                    <code>{item.code}</code>
                    <p>{item.description || 'Promo code reward'}</p>
                    <small>{formatReward(item)} · Expires: {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : 'No expiry'}</small>
                    {onUse && <button type="button" disabled={item.claimedByMe || isExhausted} onClick={() => onUse(item.code)}>Use code</button>}
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default PromoCodeListModal
