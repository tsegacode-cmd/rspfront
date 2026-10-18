import { useEffect, useRef, useState } from 'react'
import { socialAPI } from '../services/api'
import { getLiveChatToken } from '../utils/liveChatIdentity'
import './CoinGiftCelebration.css'

const POLL_INTERVAL = 5000
const GIFT_NOTICE_TTL = 24 * 60 * 60 * 1000

const parseGift = item => {
  try {
    const gift = JSON.parse(item.gift_details || item.body || '{}')
    const amount = Number(gift.amount)
    const bonus = Number(gift.giftBonus)
    const rawCreatedAt = String(item.created_at || '')
    const createdAt = Date.parse(rawCreatedAt.includes('T') ? rawCreatedAt : `${rawCreatedAt.replace(' ', 'T')}Z`)
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isFinite(createdAt)) return null
    return {
      id: item.message_id,
      sender: item.sender_name || 'A friend',
      amount,
      bonus: Number.isSafeInteger(bonus) && bonus > 0 ? bonus : 0,
      receivedAt: createdAt,
    }
  } catch {
    return null
  }
}

const storedGiftIds = userId => {
  try {
    const stored = JSON.parse(localStorage.getItem(`redsea:coin-gift-notices:${userId}`) || '[]')
    if (Array.isArray(stored)) return new Set(stored.map(gift => String(gift.id)))
    return stored?.id ? new Set([String(stored.id)]) : new Set()
  } catch (error) {
    console.error('Could not read stored coin gift reminders:', error)
    return new Set()
  }
}

function CoinGiftCelebration() {
  const [gifts, setGifts] = useState([])
  const seenMessageIdsRef = useRef(new Set())
  const currentUserRef = useRef('')
  const pollingRef = useRef(false)

  useEffect(() => {
    let active = true
    const checkForGifts = async () => {
      if (pollingRef.current) return
      const token = getLiveChatToken()
      if (!token || token.startsWith('guest-') || localStorage.getItem('rootToken')) return

      let userId = ''
      try {
        const user = JSON.parse(localStorage.getItem('userData') || '{}')
        userId = String(user.id || user._id || user.username || '')
      } catch (error) {
        console.error('Could not read the signed-in user for gift notifications:', error)
        return
      }
      if (!userId) return
      if (currentUserRef.current !== userId) {
        currentUserRef.current = userId
        seenMessageIdsRef.current = new Set()
      }

      pollingRef.current = true
      try {
        const response = await socialAPI.getInbox()
        if (!active || !Array.isArray(response.data)) return
        const incomingMessages = response.data
        const newGifts = incomingMessages
          .filter(item => !seenMessageIdsRef.current.has(item.message_id) && item.type === 'coin-gift')
          .map(parseGift)
          .filter(gift => gift && gift.receivedAt <= Date.now() && Date.now() < gift.receivedAt + GIFT_NOTICE_TTL)
          .reverse()
        incomingMessages.forEach(item => seenMessageIdsRef.current.add(item.message_id))
        if (seenMessageIdsRef.current.size > 500) {
          seenMessageIdsRef.current = new Set([...seenMessageIdsRef.current].slice(-250))
        }
        if (newGifts.length) {
          const knownGiftIds = storedGiftIds(userId)
          const unshownGifts = newGifts.filter(gift => !knownGiftIds.has(String(gift.id)))
          unshownGifts.forEach(gift => {
            window.dispatchEvent(new CustomEvent('redsea:coin-gift-received', {
              detail: { ...gift, receiverId: userId },
            }))
            knownGiftIds.add(String(gift.id))
          })
          if (unshownGifts.length) setGifts(current => [...current, ...unshownGifts])
        }
      } catch (error) {
        if (active) console.error('Could not check for incoming coin gifts:', error)
      } finally {
        pollingRef.current = false
      }
    }

    checkForGifts()
    const timer = window.setInterval(checkForGifts, POLL_INTERVAL)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const gift = gifts[0]
  if (!gift) return null

  const dismissGift = () => setGifts(current => current.slice(1))
  const total = gift.amount + gift.bonus

  return (
    <div
      className="coin-gift-celebration"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) dismissGift()
      }}
    >
      <section className="coin-gift-celebration-card" role="dialog" aria-modal="true" aria-labelledby="coin-gift-title">
        <div className="coin-gift-sparkles" aria-hidden="true">
          <span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span>
        </div>
        <p className="coin-gift-kicker">A little surprise for you</p>
        <h2 id="coin-gift-title">{gift.sender} sent you a gift!</h2>
        <div className="coin-gift-box" aria-hidden="true">
          <span className="coin-gift-box-lid">🎀</span>
          <span className="coin-gift-box-base">🎁</span>
          <span className="coin-gift-coins">🪙</span>
        </div>
        <p className="coin-gift-amount">+{total.toLocaleString()} coins</p>
        <p className="coin-gift-details">
          {gift.amount.toLocaleString()} gifted coins
          {gift.bonus > 0 ? ` + ${gift.bonus.toLocaleString()} bonus coins` : ''}
        </p>
        <p className="coin-gift-validity">Your header gift reminder will glow for 24 hours.</p>
        <button type="button" onClick={dismissGift}>Enjoy your gift</button>
      </section>
    </div>
  )
}

export default CoinGiftCelebration
