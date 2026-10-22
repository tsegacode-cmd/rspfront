import { useEffect, useMemo, useRef, useState } from 'react'
import { marketplaceAPI } from '../services/api'
import { getAccountRole } from '../utils/guestAccount'
import './PromotionModal.css'

const FALLBACK_SLIDES = [
  {
    id: 'products',
    icon: '🛍️',
    title: 'Featured Products & Services',
    accent: '#e67e22',
    body: 'Discover top-rated moving, brokerage, room booking and logistics services from trusted providers across the network.',
    items: ['📦 Big Service — Moving & property', '🏠 Broker & House — Listings', '🛏️ Room Booking — Stays', '🚗 Logistics — Vehicle rental'],
  },
  {
    id: 'earnings',
    icon: '💰',
    title: 'Your Earnings',
    accent: '#27ae60',
    body: 'Track commissions and payouts in real time. Your earning summary updates automatically as jobs complete.',
    items: ['Total earned: ETB 0', 'This month: ETB 0', 'Pending payout: ETB 0', 'Completed jobs: 0'],
  },
  {
    id: 'payment-success',
    icon: '✅',
    title: 'Payment Successful',
    accent: '#2980b9',
    body: 'Payments approved by the admin appear here. Successful transactions are confirmed instantly.',
    items: ['Last payment: —', 'Status: Awaiting activity', 'Method: —', 'Reference: —'],
  },
  {
    id: 'promotions',
    icon: '🎉',
    title: 'Special Promotions',
    accent: '#8e44ad',
    body: 'Limited-time offers and discounts on premium services. Check back often for new deals.',
    items: ['🔥 Up to 50% off moving', '⭐ Bonus on referrals', '🎁 First-booking rewards', '📢 More coming soon'],
  },
]

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

function PromotionModal({ onClose }) {
  const [index, setIndex] = useState(0)
  const [slides, setSlides] = useState(FALLBACK_SLIDES)
  const trackRef = useRef(null)
  const audience = getPromotionAudience()

  useEffect(() => {
    let active = true

    marketplaceAPI.getPromotions(audience)
      .then(response => {
        if (!active) return
        const popupPromotions = (response?.data || []).filter(item => item.popup_enabled && item.title)
        setSlides(popupPromotions.length ? popupPromotions.map((promotion, promoIndex) => ({
          id: promotion.id || `promotion-${promoIndex}`,
          icon: promotion.badge_text ? '📣' : '🎉',
          title: promotion.title,
          accent: promotion.background_color || '#8e44ad',
          body: promotion.message || 'Check out this latest update from REDSEA.',
          items: [
            ...(promotion.badge_text ? [promotion.badge_text] : []),
            ...(promotion.button_text ? [`${promotion.button_text}${promotion.button_url ? ' — Learn more' : ''}`] : []),
            ...(promotion.button_url ? ['Open offer'] : []),
          ].filter(Boolean),
        })) : FALLBACK_SLIDES)
      })
      .catch(() => {
        if (active) setSlides(FALLBACK_SLIDES)
      })

    return () => { active = false }
  }, [audience])

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(current => (slides.length ? (current + 1) % slides.length : 0))
    }, 4000)
    return () => clearInterval(timer)
  }, [slides.length])

  useEffect(() => {
    const track = trackRef.current
    if (track) track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' })
  }, [index])

  const active = slides[index] || slides[0]

  return (
    <div className="promo-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="promo-modal" role="dialog" aria-modal="true" aria-labelledby="promo-modal-title">
        <div className="promo-modal-header">
          <div>
            <span className="promo-kicker">PROMOTIONS</span>
            <h2 id="promo-modal-title">What&apos;s happening at REDSEA</h2>
          </div>
          <button type="button" className="promo-close" onClick={onClose} aria-label="Close promotions">×</button>
        </div>

        <div className="promo-track" ref={trackRef}>
          {slides.map((slide, slideIndex) => (
            <article
              key={slide.id}
              className={`promo-slide ${slideIndex === index ? 'active' : ''}`}
              style={{ '--promo-accent': slide.accent }}
            >
              <span className="promo-slide-icon">{slide.icon}</span>
              <h3>{slide.title}</h3>
              <p>{slide.body}</p>
              <ul>
                {slide.items.map(item => <li key={`${slide.id}-${item}`}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>

        <div className="promo-dots">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              className={slideIndex === index ? 'active' : ''}
              onClick={() => setIndex(slideIndex)}
              aria-label={`Show ${slide.title}`}
            />
          ))}
        </div>

        {active && (
          <p className="promo-active-label" style={{ color: active.accent }}>
            {active.icon} {active.title}
          </p>
        )}
      </section>
    </div>
  )
}

export default PromotionModal
