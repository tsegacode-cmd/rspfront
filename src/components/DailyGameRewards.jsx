import { useCallback, useEffect, useState } from 'react'
import { socialAPI } from '../services/api'
import './DailyGameRewards.css'

const numberFormat = new Intl.NumberFormat()
const WAIT_TIME_MS = 1350
const WHEEL_COLORS = ['#c41e3a', '#f3c969', '#246d58', '#4d66a1', '#ad6b25', '#773d91']
const SLOT_SYMBOLS = ['🍒', '🔔', '⭐']

const makeWheelBackground = segments => {
  if (!segments.length) return '#e2e8f0'
  const wedges = segments.map((segment, index) => {
    const start = index / segments.length * 100
    const end = (index + 1) / segments.length * 100
    return `${WHEEL_COLORS[index % WHEEL_COLORS.length]} ${start}% ${end}%`
  })
  return `conic-gradient(${wedges.join(', ')})`
}

const formatCooldown = (nextAvailableAt, now) => {
  const remaining = new Date(nextAvailableAt).getTime() - now
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Ready to play'
  const totalMinutes = Math.ceil(remaining / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

function DailyGameRewards({ requireLogin }) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const loggedIn = Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData'))

  const loadGames = useCallback(async () => {
    if (!loggedIn) {
      setLoading(false)
      return
    }
    setError('')
    try {
      const response = await socialAPI.getDailyGameRewards()
      if (!response.success || !Array.isArray(response.data?.games)) {
        throw new Error('The daily reward games response was invalid.')
      }
      setGames(response.data.games.map(game => ({
        ...game,
        playsLimit: Number(game.playsLimit ?? game.playsPer24Hours),
        playsUsed: Number(game.playsUsed || 0),
        segments: Array.isArray(game.segments) ? game.segments : [],
      })))
    } catch (loadError) {
      setError(loadError.message || 'Could not load daily reward games.')
    } finally {
      setLoading(false)
    }
  }, [loggedIn])

  useEffect(() => { loadGames() }, [loadGames])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), playing === 'slots' ? 100 : 30000)
    return () => window.clearInterval(interval)
  }, [playing])
  useEffect(() => {
    const expiries = games
      .filter(game => game.nextAvailableAt && game.playsUsed >= game.playsLimit)
      .map(game => new Date(game.nextAvailableAt).getTime())
      .filter(expiry => Number.isFinite(expiry))
    if (!expiries.length) return undefined
    const timeout = window.setTimeout(() => {
      setNow(Date.now())
      loadGames()
    }, Math.max(Math.min(...expiries) - Date.now() + 50, 0))
    return () => window.clearTimeout(timeout)
  }, [games, loadGames])

  const play = async (game, selectedMineIndex) => {
    if (!loggedIn) {
      requireLogin('Sign in to play daily reward games and earn coins.')
      return
    }
    const cooldownActive = game.nextAvailableAt && new Date(game.nextAvailableAt).getTime() > Date.now()
    if (playing || !game.enabled || (game.playsUsed >= game.playsLimit && cooldownActive)) return
    setPlaying(game.id)
    setResult(null)
    setError('')
    try {
      const mineIndex = game.id === 'boom-mines'
        ? selectedMineIndex ?? Math.floor(Math.random() * 9)
        : undefined
      const crypto = globalThis.crypto
      const requestId = crypto?.randomUUID?.() || (crypto?.getRandomValues
        ? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
        : '')
      if (!requestId) throw new Error('Secure reward plays are not supported in this browser. Please use an updated browser over HTTPS.')
      const [response] = await Promise.all([
        socialAPI.playDailyRewardGame(game.id, requestId),
        new Promise(resolve => window.setTimeout(resolve, WAIT_TIME_MS)),
      ])
      if (!response.success || !response.data?.play || !Array.isArray(response.data.games)) {
        throw new Error(response.message || 'The reward game returned an invalid result. Please refresh and try again.')
      }
      setGames(response.data.games.map(updatedGame => ({
        ...updatedGame,
        playsLimit: Number(updatedGame.playsLimit ?? updatedGame.playsPer24Hours),
        playsUsed: Number(updatedGame.playsUsed || 0),
        segments: Array.isArray(updatedGame.segments) ? updatedGame.segments : [],
      })))
      const completedPlay = { ...response.data.play, mineIndex }
      setResult(completedPlay)
      if (Number(completedPlay.coinsAwarded) > 0) {
        window.dispatchEvent(new CustomEvent('redsea:coin-reward-earned', {
          detail: {
            amount: Number(completedPlay.coinsAwarded),
            balance: Number(completedPlay.coinBalance),
            title: `${game.title} reward`,
            details: completedPlay.segmentLabel,
            icon: game.icon || '🎉',
          },
        }))
      }
    } catch (playError) {
      setError(playError.message || 'Your play could not be completed.')
      await loadGames()
    } finally {
      setPlaying('')
    }
  }

  if (loading) return <section className="daily-games-panel"><p className="social-muted">Loading your daily games…</p></section>

  return (
    <section className="daily-games-panel" aria-labelledby="daily-games-title">
      <header className="daily-games-heading">
        <div>
          <p className="daily-games-kicker">PLAY • WIN • EARN COINS</p>
          <h2 id="daily-games-title">Daily Claim</h2>
          <p>Play the games below for a chance to earn coins. Your plays refresh on a rolling 24-hour timer.</p>
        </div>
        <span className="daily-games-header-icon" aria-hidden="true">🎁</span>
      </header>
      {!loggedIn && (
        <div className="daily-games-login">
          <p>Sign in to play and claim coin rewards.</p>
          <button type="button" onClick={() => requireLogin('Sign in to play daily reward games and earn coins.')}>Sign in to play</button>
        </div>
      )}
      {error && <p className="daily-games-error" role="alert">{error}</p>}
      {result && (
        <div className={`daily-games-result ${result.coinsAwarded > 0 ? 'won' : 'missed'}`} role="status">
          <span className="daily-games-result-icon" aria-hidden="true">{result.coinsAwarded > 0 ? '🎉' : '✨'}</span>
          <div>
            <strong>{result.coinsAwarded > 0
              ? `You won ${numberFormat.format(result.coinsAwarded)} coins!`
              : 'No coins this round — try again!'}</strong>
            <p>{result.segmentLabel} · Wallet balance: {numberFormat.format(result.coinBalance)} coins</p>
          </div>
        </div>
      )}
      <div className="daily-games-grid">
        {games.filter(game => game.enabled).map(game => {
          const isPlaying = playing === game.id
          const cooldownActive = game.nextAvailableAt && new Date(game.nextAvailableAt).getTime() > now
          const locked = !loggedIn || (game.playsUsed >= game.playsLimit && cooldownActive)
          const remaining = cooldownActive
            ? Math.max(game.playsLimit - game.playsUsed, 0)
            : game.nextAvailableAt ? game.playsLimit : Math.max(game.playsLimit - game.playsUsed, 0)
          const gameResult = result?.gameId === game.id ? result : null
          return (
            <article className={`daily-game-card ${isPlaying ? 'is-playing' : ''}`} key={game.id}>
              <div className="daily-game-card-heading">
                <span className="daily-game-icon" aria-hidden="true">{game.icon}</span>
                <div><h3>{game.title}</h3><p>{remaining} of {game.playsLimit} plays left</p></div>
              </div>
              {game.id === 'wheel' && (
                <div className="daily-wheel-wrap">
                  <span className="daily-wheel-pointer" aria-hidden="true">▼</span>
                  <div className="daily-wheel" style={{ background: makeWheelBackground(game.segments) }}>
                    <span>{isPlaying ? '✨' : gameResult?.coinsAwarded > 0 ? '🏆' : 'GO'}</span>
                  </div>
                </div>
              )}
              {game.id === 'slots' && (
                <div className="daily-slot-reels" aria-label="Slot machine">
                  {SLOT_SYMBOLS.map((symbol, index) => (
                    <span key={`${symbol}-${index}`} className={isPlaying ? 'shuffling' : ''}>{isPlaying ? SLOT_SYMBOLS[(index + Math.floor(now / 100)) % SLOT_SYMBOLS.length] : gameResult?.coinsAwarded > 0 ? '💰' : symbol}</span>
                  ))}
                </div>
              )}
              {game.id === 'boom-mines' && (
                <div className="daily-mine-grid" aria-label="Mine tiles">
                  {Array.from({ length: 9 }, (_, index) => (
                    <button
                      type="button"
                      key={index}
                      className={gameResult && index === gameResult.mineIndex ? (gameResult.coinsAwarded > 0 ? 'found' : 'empty') : ''}
                      disabled={locked || Boolean(playing)}
                      onClick={() => play(game, index)}
                      aria-label={`Choose mine tile ${index + 1}`}
                    >
                      {gameResult && index === gameResult.mineIndex ? (gameResult.coinsAwarded > 0 ? '💎' : '💥') : '·'}
                    </button>
                  ))}
                </div>
              )}
              <div className="daily-game-prizes" aria-label={`${game.title} prizes`}>
                {game.segments.map(segment => (
                  <span key={segment.id}>{segment.label}: <strong>{numberFormat.format(segment.coins)}</strong></span>
                ))}
              </div>
              {game.playsUsed >= game.playsLimit && cooldownActive && (
                <p className="daily-game-cooldown">
                  Next play in <strong>{formatCooldown(game.nextAvailableAt, now)}</strong>
                </p>
              )}
              <button type="button" className="daily-game-play" onClick={() => play(game)} disabled={locked || Boolean(playing)}>
                {isPlaying ? 'Playing…' : !loggedIn
                  ? 'Sign in to play'
                  : cooldownActive ? `Ready in ${formatCooldown(game.nextAvailableAt, now)}` : 'Play & claim'}
              </button>
            </article>
          )
        })}
      </div>
      {!games.some(game => game.enabled) && <p className="social-muted">Daily reward games are temporarily unavailable.</p>}
    </section>
  )
}

export default DailyGameRewards
