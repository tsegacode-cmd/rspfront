import { useEffect, useState } from 'react'
import { playRewardCelebrationSound } from '../utils/rewardCelebrationSound'
import './RewardCelebration.css'

function RewardCelebration() {
  const [reward, setReward] = useState(null)

  useEffect(() => {
    const showReward = event => {
      const amount = Number(event.detail?.amount)
      if (!Number.isSafeInteger(amount) || amount <= 0) return
      playRewardCelebrationSound()
      const balance = event.detail?.balance == null ? null : Number(event.detail.balance)
      setReward({
        amount,
        balance: Number.isSafeInteger(balance) && balance >= 0
          ? balance
          : null,
        title: String(event.detail?.title || 'Reward claimed'),
        details: String(event.detail?.details || 'Your coins have been added to your wallet.'),
        icon: String(event.detail?.icon || '🎉'),
      })
    }
    window.addEventListener('redsea:coin-reward-earned', showReward)
    return () => window.removeEventListener('redsea:coin-reward-earned', showReward)
  }, [])

  useEffect(() => {
    if (!reward) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setReward(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [reward])

  if (!reward) return null

  return (
    <div
      className="reward-celebration"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) setReward(null)
      }}
    >
      <section className="reward-celebration-card" role="dialog" aria-modal="true" aria-labelledby="reward-celebration-title">
        <div className="reward-celebration-sparkles" aria-hidden="true">✦　✧　✦</div>
        <span className="reward-celebration-icon" aria-hidden="true">{reward.icon}</span>
        <p className="reward-celebration-kicker">COINS ADDED TO YOUR WALLET</p>
        <h2 id="reward-celebration-title">{reward.title}</h2>
        <strong className="reward-celebration-amount">+{reward.amount.toLocaleString()} coins</strong>
        <p className="reward-celebration-details">{reward.details}</p>
        {reward.balance !== null && <p className="reward-celebration-balance">Wallet balance: {reward.balance.toLocaleString()} coins</p>}
        <button type="button" onClick={() => setReward(null)}>Continue</button>
      </section>
    </div>
  )
}

export default RewardCelebration
