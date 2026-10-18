import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { socialAPI } from '../services/api'
import { getLiveChatToken } from '../utils/liveChatIdentity'
import { getCoinLevel } from '../utils/coinLevels'
import './CoinGiftCelebration.css'

const POLL_INTERVAL = 10000
const NOTICE_TTL = 24 * 60 * 60 * 1000

const getUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    return String(user.id || user._id || user.username || '')
  } catch (error) {
    console.error('Could not read the signed-in user for level-up rewards:', error)
    return ''
  }
}

const readDismissedNotices = storageKey => {
  try {
    const notices = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(notices)) return []
    return notices.filter(notice =>
      notice && typeof notice.id === 'string' &&
      Number.isFinite(notice.dismissedAt) &&
      Date.now() < notice.dismissedAt + NOTICE_TTL
    )
  } catch (error) {
    console.error('Could not read dismissed level-up reward reminders:', error)
    return []
  }
}

const readActiveReminders = storageKey => {
  try {
    const notices = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(notices)) return []
    return notices.filter(notice =>
      notice && typeof notice.id === 'string' &&
      Number.isFinite(notice.receivedAt) &&
      Date.now() < notice.receivedAt + NOTICE_TTL
    )
  } catch (error) {
    console.error('Could not read level-up reward reminders:', error)
    return []
  }
}

function CoinLevelCelebration() {
  const [achievement, setAchievement] = useState(null)
  const pollingRef = useRef(false)
  const seenUserRef = useRef('')

  const pollLevelRewards = useCallback(async () => {
    const token = getLiveChatToken()
    const userId = getUserId()
    if (!token || token.startsWith('guest-') || localStorage.getItem('rootToken') || !userId || pollingRef.current) return
    pollingRef.current = true
    try {
      const response = await socialAPI.getCoinLevel()
      if (!response.success || !Array.isArray(response.data?.history)) {
        throw new Error(response.message || 'The coin level history response was invalid.')
      }
      if (seenUserRef.current !== userId) {
        seenUserRef.current = userId
        setAchievement(null)
      }
      const dismissedKey = `redsea:coin-level-dismissed:${userId}`
      const reminderKey = `redsea:coin-level-reminders:${userId}`
      const dismissed = readDismissedNotices(dismissedKey)
      const dismissedIds = new Set(dismissed.map(notice => notice.id))
      const now = Date.now()
      const recentAchievements = response.data.history
        .map(item => {
          const createdAt = Date.parse(String(item.created_at || '').includes('T')
            ? item.created_at
            : `${String(item.created_at || '').replace(' ', 'T')}Z`)
          const level = Number(item.level)
          const rewardEtb = Number(item.reward_etb)
          return {
            id: `level-${level}-${item.created_at}`,
            level,
            rewardEtb,
            earnedCoins: Number(item.earned_coins),
            receivedAt: createdAt,
          }
        })
        .filter(item =>
          Number.isSafeInteger(item.level) &&
          Number.isFinite(item.rewardEtb) && item.rewardEtb > 0 &&
          Number.isSafeInteger(item.earnedCoins) &&
          Number.isFinite(item.receivedAt) &&
          item.receivedAt <= now && now < item.receivedAt + NOTICE_TTL
        )
        .sort((left, right) => left.receivedAt - right.receivedAt)

      const activeReminders = readActiveReminders(reminderKey)
      const reminderIds = new Set(activeReminders.map(notice => notice.id))
      const newAchievements = recentAchievements.filter(item => !reminderIds.has(item.id))
      if (newAchievements.length) {
        const reminders = [...activeReminders, ...newAchievements.map(item => ({
          id: item.id,
          level: item.level,
          rewardEtb: item.rewardEtb,
          receivedAt: item.receivedAt,
        }))]
        localStorage.setItem(reminderKey, JSON.stringify(reminders))
        window.dispatchEvent(new CustomEvent('redsea:coin-level-reward', {
          detail: { userId, reminders },
        }))
      }

      const nextAchievement = recentAchievements.find(item => !dismissedIds.has(item.id))
      setAchievement(nextAchievement || null)
      localStorage.setItem(dismissedKey, JSON.stringify(dismissed))
    } catch (error) {
      console.error('Could not check for new coin level rewards:', error)
    } finally {
      pollingRef.current = false
    }
  }, [])

  useEffect(() => {
    pollLevelRewards()
    const timer = window.setInterval(pollLevelRewards, POLL_INTERVAL)
    const onVisible = () => {
      if (document.visibilityState === 'visible') pollLevelRewards()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pollLevelRewards])

  useEffect(() => {
    if (!achievement) return undefined
    const remaining = achievement.receivedAt + NOTICE_TTL - Date.now()
    if (remaining <= 0) {
      setAchievement(null)
      return undefined
    }
    const timer = window.setTimeout(() => {
      setAchievement(null)
      pollLevelRewards()
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [achievement, pollLevelRewards])

  if (!achievement) return null
  const level = getCoinLevel(achievement.level)
  const dismiss = () => {
    const userId = getUserId()
    const storageKey = `redsea:coin-level-dismissed:${userId}`
    const dismissed = readDismissedNotices(storageKey)
    try {
      localStorage.setItem(storageKey, JSON.stringify([
        ...dismissed.filter(notice => notice.id !== achievement.id),
        { id: achievement.id, dismissedAt: Date.now() },
      ]))
    } catch (error) {
      console.error('Could not save the level-up reward reminder:', error)
    }
    setAchievement(null)
    pollLevelRewards()
  }
  const hoursLeft = Math.max(1, Math.ceil((achievement.receivedAt + NOTICE_TTL - Date.now()) / 3600000))

  return (
    <div className="coin-gift-celebration" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) dismiss()
    }}>
      <section className="coin-gift-celebration-card coin-level-celebration-card" role="dialog" aria-modal="true" aria-labelledby="coin-level-title">
        <div className="coin-gift-sparkles" aria-hidden="true">
          <span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span>
        </div>
        <p className="coin-gift-kicker">LEVEL REWARD UNLOCKED</p>
        <h2 id="coin-level-title">Congratulations! You reached {level?.name || 'a new level'}</h2>
        <div className="coin-gift-box coin-level-trophy" aria-hidden="true">
          <span className="coin-gift-box-lid">✨</span>
          <span className="coin-gift-box-base">{level?.icon || '🏆'}</span>
          <span className="coin-gift-coins">🎁</span>
        </div>
        <p className="coin-gift-amount coin-level-amount">ETB {achievement.rewardEtb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p className="coin-gift-details">Your level {achievement.level} ETB reward has been credited to your bonus wallet.</p>
        <p className="coin-gift-validity">This reward reminder stays available for {hoursLeft} hours.</p>
        <div className="coin-level-actions">
          <Link to="/wallet" onClick={dismiss}>View my wallet</Link>
          <button type="button" onClick={dismiss}>Enjoy your reward</button>
        </div>
      </section>
    </div>
  )
}

export default CoinLevelCelebration
