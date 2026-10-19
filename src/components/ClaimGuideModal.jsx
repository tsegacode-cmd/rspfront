import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { socialAPI } from '../services/api'
import { getCoinLevel } from '../utils/coinLevels'
import './ClaimGuideModal.css'

const numberFormat = new Intl.NumberFormat()
const moneyFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function ClaimGuideModal({ onClose }) {
  const loggedIn = Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData'))
  const [loading, setLoading] = useState(loggedIn)
  const [error, setError] = useState('')
  const [levelInfo, setLevelInfo] = useState(null)
  const [games, setGames] = useState([])
  const [campaignPricing, setCampaignPricing] = useState(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useEffect(() => {
    if (!loggedIn) return undefined
    let active = true
    Promise.all([
      socialAPI.getCoinLevel(),
      socialAPI.getDailyGameRewards(),
      socialAPI.getLinkCampaigns(),
    ]).then(([levelResponse, gameResponse, campaignResponse]) => {
      if (!levelResponse.success || !levelResponse.data ||
          !gameResponse.success || !Array.isArray(gameResponse.data?.games) ||
          !campaignResponse.success || !campaignResponse.data?.pricing) {
        throw new Error('Reward information is incomplete. Refresh and try again.')
      }
      if (!active) return
      setLevelInfo(levelResponse.data)
      setGames(gameResponse.data.games)
      setCampaignPricing({
        viewerCoins: Number(campaignResponse.data.pricing.viewer_coins || 0),
        posterCoins: Number(campaignResponse.data.pricing.poster_coins || 0),
        viewSeconds: Number(campaignResponse.data.pricing.view_seconds || 0),
      })
    }).catch(loadError => {
      console.error('Could not load reward claim guide:', loadError)
      if (active) setError(loadError.message || 'Could not load current reward amounts.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [loggedIn])

  const rules = levelInfo?.earningRules
  const levels = Array.isArray(levelInfo?.rules) ? levelInfo.rules : []
  const currentLevelName = getCoinLevel(levelInfo?.currentLevel)

  return (
    <div className="claim-guide-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="claim-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="claim-guide-title">
        <button type="button" className="claim-guide-close" aria-label="Close earning and claiming guide" onClick={onClose}>×</button>
        <p className="claim-guide-kicker">REDSEA REWARDS</p>
        <h2 id="claim-guide-title">How to earn and claim</h2>
        <p className="claim-guide-intro">A quick guide to rewards available in the app, how to claim them, and how your current progress is tracked.</p>
        {!loggedIn ? (
          <div className="claim-guide-signin">
            <p>Sign in with a registered account to see your reward amounts, current coin balance, and daily game status.</p>
            <Link to="/login" onClick={onClose}>Sign in to view my reward status</Link>
          </div>
        ) : loading ? (
          <p className="claim-guide-state" role="status">Loading your current reward status…</p>
        ) : error ? (
          <p className="claim-guide-error" role="alert">{error}</p>
        ) : (
          <>
            <section className="claim-guide-progress" aria-label="Your current coin progress">
              <div><small>Coins earned</small><strong>{numberFormat.format(Number(levelInfo.earnedCoins || 0))}</strong></div>
              <div><small>Current level</small><strong>{currentLevelName?.icon || '🪙'} {currentLevelName?.name || 'Starting'}</strong></div>
              <div><small>ETB level rewards credited</small><strong>ETB {moneyFormat.format(Number(levelInfo.totalRewardEtb || 0))}</strong></div>
              {levelInfo.nextLevel && <p>Next: {getCoinLevel(levelInfo.nextLevel)?.name || `Level ${levelInfo.nextLevel}`} at {numberFormat.format(Number(levelInfo.nextThreshold || 0))} lifetime coins.</p>}
              {!levelInfo.nextLevel && <p>You have reached the highest configured coin level.</p>}
            </section>

            <section className="claim-guide-section">
              <h3>1. Earn coins from activities</h3>
              <p>Coin rewards are added to your coin wallet when you complete eligible actions.</p>
              <ul>
                <li>Account signup: <strong>ETB {moneyFormat.format(Number(rules?.signupBonus || 0))} bonus</strong> (one-time)</li>
                <li>Post share: <strong>ETB {moneyFormat.format(Number(rules?.shareReward || 0))} bonus</strong>, where applicable</li>
                <li>Successful invite: <strong>ETB {moneyFormat.format(Number(rules?.inviteReward || 0))} bonus</strong> ({String(rules?.inviteRewardTrigger || 'first approved purchase').replaceAll('_', ' ')})</li>
                <li>Daily active login: <strong>{numberFormat.format(Number(rules?.coinLoginReward || 0))} coins</strong> (once per day)</li>
                <li>Share a post: <strong>{numberFormat.format(Number(rules?.coinShareReward || 0))} coins</strong> (once per post)</li>
                <li>Successful invite: <strong>{numberFormat.format(Number(rules?.coinInviteReward || 0))} coins</strong></li>
                <li>Approved purchase: <strong>{numberFormat.format(Number(rules?.coinPurchaseReward || 0))} coins</strong></li>
                <li>Receive a coin gift: <strong>{numberFormat.format(Number(rules?.coinGiftReceiveReward || 0))} bonus coins</strong>, plus any applicable gift bonus</li>
              </ul>
              {rules?.coinsPerEtb > 0 && <p>Coin conversion: {numberFormat.format(Number(rules.coinsPerEtb))} coins = ETB 1. Conversion minimum: {numberFormat.format(Number(rules.minCoinConversion || 0))} coins{rules.maxCoinConversion > 0 ? `; maximum ${numberFormat.format(Number(rules.maxCoinConversion))} coins per conversion` : ''}.</p>}
            </section>

            <section className="claim-guide-section">
              <h3>2. Play Daily Claim</h3>
              <p>Open Feed → Daily Claim. Choose a game and play while it is enabled. Each game has its own rolling 24-hour play limit; used plays refresh as they expire.</p>
              <div className="claim-guide-games">
                {games.map(game => {
                  const rewards = (game.segments || []).map(segment => Number(segment.coins)).filter(Number.isFinite)
                  const remainingPlays = Math.max(0, Number(game.playsLimit || game.playsPer24Hours || 0) - Number(game.playsUsed || 0))
                  const nextAvailable = game.nextAvailableAt ? new Date(game.nextAvailableAt).getTime() : 0
                  const cooldownMinutes = nextAvailable > Date.now() ? Math.ceil((nextAvailable - Date.now()) / 60000) : 0
                  const cooldownText = cooldownMinutes
                    ? `${Math.floor(cooldownMinutes / 60)}h ${cooldownMinutes % 60}m until a play refreshes`
                    : 'Ready to play'
                  return (
                    <article key={game.id}>
                      <strong>{game.icon} {game.title}</strong>
                      <span>{game.enabled ? `${remainingPlays} of ${Number(game.playsLimit || game.playsPer24Hours || 0)} plays remaining` : 'Temporarily unavailable'}</span>
                      {game.enabled && <span>{remainingPlays ? cooldownText : `All plays used · ${cooldownText}`}</span>}
                      <span>{rewards.length ? `Possible range: ${numberFormat.format(Math.min(...rewards))}–${numberFormat.format(Math.max(...rewards))} coins per play` : 'No reward segments configured'}</span>
                      {(game.segments || []).map((segment, index) => <span key={`${game.id}-segment-${index}`}>{segment.label}: {numberFormat.format(Number(segment.coins || 0))} coins</span>)}
                    </article>
                  )
                })}
              </div>
              <Link className="claim-guide-action" to="/feed?tab=daily-claim" onClick={onClose}>Open Daily Claim games</Link>
            </section>

            <section className="claim-guide-section">
              <h3>3. Reach a level for an ETB bonus</h3>
              <p>Lifetime coins earned from rewards and gifts count toward levels. Each level’s ETB reward is credited once to your bonus wallet when you cross its threshold.</p>
              <div className="claim-guide-levels">
                {levels.map(level => {
                  const reached = Number(levelInfo.earnedCoins || 0) >= Number(level.required_coins || 0)
                  const levelMeta = getCoinLevel(level.level)
                  return <div key={level.level} className={reached ? 'reached' : ''}>
                    <span>{levelMeta?.icon} {levelMeta?.name || `Level ${level.level}`}</span>
                    <span>{numberFormat.format(Number(level.required_coins || 0))} coins</span>
                    <strong>ETB {moneyFormat.format(Number(level.reward_etb || 0))}</strong>
                  </div>
                })}
              </div>
            </section>

            <section className="claim-guide-section">
              <h3>4. Claim qualified campaign-view coins</h3>
              <p>Open Feed → Video Claim &amp; Earn, view a campaign for the required time, then claim after the view qualifies. The campaign owner also receives coins for eligible unique viewers.</p>
              <p>Current configured rates: viewer <strong>{numberFormat.format(Number(campaignPricing.viewerCoins || 0))} coins</strong> per qualified view; campaign owner <strong>{numberFormat.format(Number(campaignPricing.posterCoins || 0))} coins</strong> per unique viewer. Minimum view time: {Number(campaignPricing.viewSeconds || 0)} seconds.</p>
            </section>

            <p className="claim-guide-footnote">ETB wallet bonuses and coins are separate balances. Current configured rules and your reward history are available from Wallet and the Root Promotions → Reward rules dashboard.</p>
            <Link className="claim-guide-action" to="/wallet" onClick={onClose}>Open my wallet and reward history</Link>
          </>
        )}
      </section>
    </div>
  )
}

export default ClaimGuideModal
