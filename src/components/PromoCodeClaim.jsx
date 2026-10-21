import { useCallback, useEffect, useState } from 'react'
import { socialAPI } from '../services/api'
import { downloadPromoCodesPdf } from '../utils/promoCodePdf'
import { playRewardCelebrationSound } from '../utils/rewardCelebrationSound'
import { filterUnexpiredPromoCodes, getNextPromoCodeExpiryDelay } from '../utils/promoCodes'
import PromoCodeListModal from './PromoCodeListModal'
import './PromoCodeClaim.css'

function PromoCodeClaim() {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [claimedReward, setClaimedReward] = useState(null)
  const [showCodesModal, setShowCodesModal] = useState(false)

  const copyCode = async promoCode => {
    try {
      await navigator.clipboard.writeText(promoCode)
      setNotice(`Promo code ${promoCode} copied.`)
      setError('')
    } catch (copyError) {
      setError(`Could not copy promo code: ${copyError.message}`)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await socialAPI.getPromoCodes()
      setCodes(filterUnexpiredPromoCodes(Array.isArray(response.data?.codes) ? response.data.codes : []))
    } catch (loadError) {
      setError(loadError.message || 'Could not load promo codes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const delay = getNextPromoCodeExpiryDelay(codes)
    if (delay === null) return undefined
    const timer = window.setTimeout(() => {
      setCodes(current => filterUnexpiredPromoCodes(current))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [codes])

  useEffect(() => {
    if (!claimedReward) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setClaimedReward(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [claimedReward])

  const claim = async event => {
    event.preventDefault()
    if (!code.trim()) {
      setError('Enter a promo code to claim.')
      return
    }
    setClaiming(true)
    setError('')
    setNotice('')
    setClaimedReward(null)
    try {
      const response = await socialAPI.claimPromoCode(code.trim())
      const result = response.data?.claimed
      if (!result || !Number.isFinite(Number(result.amount)) || !['coin', 'real', 'bonus'].includes(result.rewardType)) {
        throw new Error('The claim succeeded but the server returned incomplete reward details.')
      }
      setClaimedReward(result)
      playRewardCelebrationSound()
      setCode('')
      await load()
    } catch (claimError) {
      setError(claimError.message || 'That promo code could not be claimed.')
    } finally {
      setClaiming(false)
    }
  }

  const downloadCodes = async () => {
    try {
      await downloadPromoCodesPdf(codes, 'redsea-available-promo-codes.pdf')
      setNotice('The promo-code PDF was downloaded.')
      setError('')
    } catch (downloadError) {
      setError(`Could not download the promo-code PDF: ${downloadError.message}`)
    }
  }

  const rewardLabel = item => item.rewardType === 'coin'
    ? `${Number(item.amount).toLocaleString()} virtual coins`
    : `ETB ${Number(item.amount).toFixed(2)} in the ${item.rewardType === 'real' ? 'real' : 'bonus'} wallet`

  return (
    <section className="daily-games-panel">
      {claimedReward && (
        <div className="promo-claim-celebration" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setClaimedReward(null)
        }}>
          <section className="promo-claim-celebration-card" role="dialog" aria-modal="true" aria-labelledby="promo-claim-celebration-title">
            <button type="button" className="promo-claim-celebration-close" onClick={() => setClaimedReward(null)} aria-label="Close reward">×</button>
            <div className="promo-claim-celebration-sparkles" aria-hidden="true">✦ ✧ ✦</div>
            <span className="promo-claim-celebration-icon" aria-hidden="true">{claimedReward.rewardType === 'coin' ? '🪙' : '🎁'}</span>
            <p className="daily-games-kicker">PROMO CODE REWARD CLAIMED</p>
            <h2 id="promo-claim-celebration-title">{claimedReward.title || 'Congratulations!'}</h2>
            <strong>{rewardLabel(claimedReward)}</strong>
            <p>Code <code>{claimedReward.code}</code> was claimed successfully and the reward has been added to your {claimedReward.rewardType === 'coin' ? 'coin wallet' : `${claimedReward.rewardType} wallet`}.</p>
            <button type="button" onClick={() => setClaimedReward(null)}>Enjoy your reward</button>
          </section>
        </div>
      )}
      {showCodesModal && (
        <PromoCodeListModal
          codes={codes}
          title="Posted promo codes"
          loading={loading}
          onClose={() => setShowCodesModal(false)}
          onUse={promoCode => {
            setCode(promoCode)
            setShowCodesModal(false)
          }}
        />
      )}
      <header className="daily-games-heading">
        <div>
          <p className="daily-games-kicker">SPECIAL OFFER</p>
          <h2>Promo code claim</h2>
          <p>Claim valid REDSEA promo codes for a bonus reward.</p>
        </div>
        <span className="daily-games-header-icon" aria-hidden="true">🎟️</span>
      </header>
      {error && <p className="daily-games-error" role="alert">{error}</p>}
      {notice && <p className="daily-games-result won" role="status">{notice}</p>}
      <form onSubmit={claim} className="root-promotion-form">
        <div className="root-promotion-form-grid">
          <label>Promo code
            <input value={code} maxLength={40} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="REDSEA-XXXXXX" />
          </label>
          <button type="submit" disabled={claiming}>{claiming ? 'Claiming…' : 'Claim reward'}</button>
        </div>
      </form>
      <div className="root-promotions-heading promo-code-list-heading">
        <div><h3>Available promo codes</h3><p>Copy a code or claim it to receive its reward.</p></div>
        <div className="promo-code-list-heading-actions">
          <button type="button" disabled={loading} onClick={() => setShowCodesModal(true)}>See codes</button>
          <button type="button" disabled={!codes.length || loading} onClick={downloadCodes}>Download all codes PDF</button>
        </div>
      </div>
      <div className="root-promotion-list">
        {loading ? <p className="root-promotion-muted">Loading available promo codes…</p> : !codes.length ? (
          <p className="root-promotion-muted">No active promo codes are available right now.</p>
        ) : codes.map(item => (
          <article className="root-promotion-card" key={item.id}>
            <div className="root-promotion-card-copy" style={{ borderLeftColor: item.rewardType === 'real' ? '#0ea5e9' : '#8b0000' }}>
              <div className="root-promotion-card-top"><span>{item.title}</span><b>{item.claimedByMe ? 'Claimed by you' : Number(item.maxClaims) > 0 && Number(item.totalClaims) >= Number(item.maxClaims) ? 'Fully claimed' : 'Available'}</b></div>
              <h3>{item.code}</h3>
              <p>{item.description || 'Instant reward promo code.'}</p>
              <small>
                Reward: {item.rewardType === 'coin' ? `${Number(item.amount || 0).toLocaleString()} coins` : `ETB ${Number(item.amount || 0).toFixed(2)}`}
                {item.rewardType !== 'coin' && ` · ${item.rewardType === 'real' ? 'Real wallet' : 'Bonus wallet'}`}
                {' · Expires: '}{item.expiresAt ? new Date(item.expiresAt).toLocaleString() : 'No expiry'}
              </small>
            </div>
            <div className="root-promotion-card-actions">
              <button type="button" onClick={() => copyCode(item.code)}>Copy</button>
              <button type="button" disabled={item.claimedByMe || (Number(item.maxClaims) > 0 && Number(item.totalClaims) >= Number(item.maxClaims))} onClick={() => setCode(item.code)}>Use</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default PromoCodeClaim
