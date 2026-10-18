import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { marketplaceAPI } from '../services/api'
import { getAccountRole } from '../utils/guestAccount'
import './PromotionPopup.css'

const DISMISSED_PROMOTIONS_KEY = 'redsea_dismissed_promotions'

const readDismissedPromotionIds = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_PROMOTIONS_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.map(String) : [])
  } catch (error) {
    console.error('Could not read dismissed promotion IDs:', error)
    return new Set()
  }
}

const persistDismissedPromotionIds = ids => {
  try {
    localStorage.setItem(DISMISSED_PROMOTIONS_KEY, JSON.stringify([...ids]))
  } catch (error) {
    console.error('Could not persist dismissed promotion IDs:', error)
  }
}

const getPromotionAudience = () => {
  if (getAccountRole() === 'guest') return 'guest'
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    const status = String(user.payment_status || user.paymentStatus || (user.is_paid === true ? 'paid' : user.is_paid === false ? 'unpaid' : '')).toLowerCase()
    const audience = ['paid', 'unpaid', 'other'].includes(status) ? status : 'user'
    return ['guest', 'user', 'paid', 'unpaid', 'other'].includes(audience) ? audience : 'user'
  } catch (error) {
    console.error('Could not determine promotion audience:', error)
    return 'user'
  }
}

function PromotionPopup() {
  const location = useLocation()
  const audience = getPromotionAudience()
  const isRootPage = location.pathname.startsWith('/root/')
  const loadedAudienceRef = useRef(null)
  const dismissedPromotionIds = useRef(readDismissedPromotionIds())
  const audioRef = useRef(null)
  const [promotion, setPromotion] = useState(null)
  const [audioMuted, setAudioMuted] = useState(() => localStorage.getItem('redsea_promotion_audio_muted') !== 'false')
  const [audioError, setAudioError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isRootPage || loadedAudienceRef.current === audience) return undefined
    let active = true
    marketplaceAPI.getPromotions(audience)
      .then(response => {
        if (!active) return
        loadedAudienceRef.current = audience
        const eligiblePromotions = (response.data || []).filter(item => (
          item && item.popup_enabled && item.title && String(item.title).trim() &&
          !dismissedPromotionIds.current.has(String(item.id))
        ))
        setPromotion(eligiblePromotions[0] || null)
      })
      .catch(loadError => {
        if (active) {
          loadedAudienceRef.current = audience
          setError(`Could not load promotion popup: ${loadError.message}`)
        }
      })
    return () => { active = false }
  }, [audience, isRootPage])

  useEffect(() => {
    if (!promotion) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        const nextDismissed = new Set(dismissedPromotionIds.current)
        nextDismissed.add(String(promotion.id))
        dismissedPromotionIds.current = nextDismissed
        persistDismissedPromotionIds(nextDismissed)
        setPromotion(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [promotion])

  useEffect(() => {
    if (!promotion?.audio_data || !audioRef.current) return undefined
    const audio = audioRef.current
    audio.muted = audioMuted
    setAudioError('')
    audio.play().catch(playError => {
      console.error('Could not start promotion audio:', playError)
      setAudioError('Audio could not start automatically. Use the player to start it.')
    })
    return () => audio.pause()
  }, [promotion])

  if (error) return <div className="promotion-popup-error" role="alert">{error}</div>
  if (!promotion) return null

  const dismissPromotion = () => {
    const nextDismissed = new Set(dismissedPromotionIds.current)
    nextDismissed.add(String(promotion.id))
    dismissedPromotionIds.current = nextDismissed
    persistDismissedPromotionIds(nextDismissed)
    setPromotion(null)
  }
  const toggleAudioMute = () => {
    const nextMuted = !audioMuted
    const audio = audioRef.current
    if (audio) {
      audio.muted = nextMuted
      if (!nextMuted) {
        audio.play().catch(playError => {
          console.error('Could not start promotion audio:', playError)
          setAudioError('Audio could not start automatically. Use the player to start it.')
        })
      }
    }
    localStorage.setItem('redsea_promotion_audio_muted', String(nextMuted))
    setAudioMuted(nextMuted)
  }
  const linkedContent = (
    <>
      {promotion.image_data && <img src={promotion.image_data} alt="" className="promotion-popup-image" />}
      <div className="promotion-popup-copy">
        {promotion.badge_text && <span className="promotion-popup-badge">{promotion.badge_text}</span>}
        <h2 id="promotion-popup-title">{promotion.title}</h2>
        {promotion.message && <p>{promotion.message}</p>}
        {promotion.button_text && <span className="promotion-popup-action">{promotion.button_text} →</span>}
      </div>
    </>
  )

  return (
    <div
      className="promotion-popup-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) dismissPromotion()
      }}
    >
      <section
        className="promotion-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-popup-title"
        style={{ backgroundColor: promotion.background_color || '#8b0000' }}
      >
        <button className="promotion-popup-close" type="button" onClick={dismissPromotion} aria-label="Close promotion">×</button>
        {promotion.button_url
          ? <a className="promotion-popup-content-link" href={promotion.button_url}>{linkedContent}</a>
          : linkedContent}
        {promotion.audio_data && (
          <div className="promotion-popup-audio">
            <audio
              ref={audioRef}
              src={promotion.audio_data}
              autoPlay
              muted={audioMuted}
              controls
              onError={() => setAudioError('This browser could not play the uploaded audio format.')}
            >
              Your browser cannot play this audio format.
            </audio>
            <button type="button" className="promotion-popup-mute" aria-pressed={!audioMuted} onClick={toggleAudioMute}>
              {audioMuted ? 'Unmute promotion' : 'Mute promotion'}
            </button>
            {audioError && <span role="status">{audioError}</span>}
          </div>
        )}
      </section>
    </div>
  )
}

export default PromotionPopup
