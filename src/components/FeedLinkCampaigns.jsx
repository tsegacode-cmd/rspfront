import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { formatProviderUssd, getConfiguredCampaignPaymentProviders } from '../utils/servicePaymentSettings'
import { socialAPI } from '../services/api'
import './FeedLinkCampaigns.css'

const DURATION_TIERS = [
  { id: '1-3', label: '1–3 days' },
  { id: '4-7', label: '4–7 days' },
  { id: '8-15', label: '8–15 days' },
  { id: '16-30', label: '16–30 days' },
  { id: '31-60', label: '31–60 days' },
  { id: '61-180', label: '2–6 months' },
  { id: '181-365', label: '6–12 months' },
]

const SOCIAL_APPS = [
  'TikTok', 'YouTube', 'Facebook', 'Instagram', 'X', 'Snapchat',
  'Telegram', 'WhatsApp', 'LinkedIn', 'Pinterest', 'Twitch', 'Reddit', 'Other',
]

const SOCIAL_APP_BRANDS = {
  tiktok: { mark: '♪', className: 'tiktok' },
  youtube: { mark: '▶', className: 'youtube' },
  facebook: { mark: 'f', className: 'facebook' },
  instagram: { mark: '◎', className: 'instagram' },
  x: { mark: '𝕏', className: 'x' },
  snapchat: { mark: '👻', className: 'snapchat' },
  telegram: { mark: '➤', className: 'telegram' },
  whatsapp: { mark: '◔', className: 'whatsapp' },
  linkedin: { mark: 'in', className: 'linkedin' },
  pinterest: { mark: 'P', className: 'pinterest' },
  twitch: { mark: '▰', className: 'twitch' },
  reddit: { mark: '●', className: 'reddit' },
  other: { mark: '↗', className: 'other' },
}

function SocialAppBadge({ appName }) {
  const brand = SOCIAL_APP_BRANDS[String(appName || '').trim().toLowerCase()] || SOCIAL_APP_BRANDS.other
  return (
    <span className="feed-link-app-badge">
      <span className={`feed-link-app-mark ${brand.className}`} aria-hidden="true">{brand.mark}</span>
      {appName || 'Social link'}
    </span>
  )
}

const EMPTY_FORM = {
  appName: 'TikTok',
  title: '',
  description: '',
  url: '',
  durationTier: '1-3',
  paymentMethod: 'REDSEA Wallet',
  paymentReference: '',
  paymentProof: '',
  images: [],
}
const WALLET_PAYMENT_METHOD = 'REDSEA Wallet'

const formatMoney = amount => `ETB ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const campaignPrice = (pricing, tier) => Number(pricing?.[`price_${tier.replace('-', '_')}`] || 0)

const compressCampaignImage = file => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) {
    reject(new Error('Choose image files only.'))
    return
  }
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Could not read the selected image.'))
  reader.onload = () => {
    const image = new Image()
    image.onerror = () => reject(new Error('The selected file is not a valid image.'))
    image.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Could not prepare the selected image.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      let quality = .74
      let data = canvas.toDataURL('image/webp', quality)
      while (data.length > 1300000 && quality > .34) {
        quality -= .1
        data = canvas.toDataURL('image/webp', quality)
      }
      if (data.length > 1500000) {
        reject(new Error('Choose a smaller photo; each image must be under 1.5 MB after compression.'))
        return
      }
      resolve(data)
    }
    image.src = String(reader.result)
  }
  reader.readAsDataURL(file)
})

function CampaignViewer({ campaign, pricing, isOwner, onClose, onClaimed }) {
  const [viewId, setViewId] = useState('')
  const [viewStarted, setViewStarted] = useState(false)
  const [startingView, setStartingView] = useState(false)
  const [activeSeconds, setActiveSeconds] = useState(0)
  const [requiredSeconds, setRequiredSeconds] = useState(Number(campaign.view_seconds || pricing?.view_seconds || 30))
  const [startError, setStartError] = useState('')
  const [claimError, setClaimError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(null)
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)
  const [closeSeconds, setCloseSeconds] = useState(Number(pricing?.close_delay_seconds || 0))
  const startInFlight = useRef(false)
  const progressInFlight = useRef(false)
  const required = Number(requiredSeconds) || 30
  const canClaim = Boolean(viewId && activeSeconds >= required && !claimed)

  const startViewing = async () => {
    if (isOwner || viewStarted || startInFlight.current) return
    startInFlight.current = true
    setStartingView(true)
    setStartError('')
    try {
      const response = await socialAPI.startLinkCampaignView(campaign.campaign_id)
      if (response.data.alreadyClaimed) {
        setAlreadyClaimed(true)
        setClaimed({
          viewerCoins: response.data.viewerCoins,
          posterCoins: response.data.posterCoins,
        })
      } else {
        setViewId(response.data.viewId)
        setActiveSeconds(Number(response.data.activeSeconds || 0))
        setRequiredSeconds(Number(response.data.requiredSeconds || required))
      }
      setViewStarted(true)
    } catch (error) {
      setStartError(error.message || 'Could not start this campaign view.')
    } finally {
      startInFlight.current = false
      setStartingView(false)
    }
  }

  useEffect(() => {
    if (isOwner || !viewId || claimed) return undefined
    let active = true
    const updateProgress = async () => {
      if (!active || progressInFlight.current) return
      progressInFlight.current = true
      try {
        const response = await socialAPI.progressLinkCampaignView(viewId)
        if (active) setActiveSeconds(Number(response.data.activeSeconds || 0))
      } catch (error) {
        if (active) setClaimError(error.message || 'Could not update campaign viewing progress.')
      } finally {
        progressInFlight.current = false
      }
    }
    const interval = window.setInterval(updateProgress, 1000)
    document.addEventListener('visibilitychange', updateProgress)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', updateProgress)
    }
  }, [viewId, claimed, isOwner])

  useEffect(() => {
    if (closeSeconds <= 0) return undefined
    const interval = window.setInterval(() => {
      setCloseSeconds(current => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [closeSeconds > 0])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = event => {
      if (event.key === 'Escape' && closeSeconds <= 0 && !claiming) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [closeSeconds <= 0, claiming, onClose])

  const claimReward = async () => {
    if (!canClaim || claiming) return
    setClaiming(true)
    setClaimError('')
    try {
      const response = await socialAPI.claimLinkCampaignReward(viewId)
      setClaimed(response.data)
      onClaimed()
      const viewerCoins = Number(response.data?.viewerCoins)
      if (Number.isSafeInteger(viewerCoins) && viewerCoins > 0) {
        window.dispatchEvent(new CustomEvent('redsea:coin-reward-earned', {
          detail: {
            amount: viewerCoins,
            title: 'Campaign reward claimed',
            details: `You earned coins for viewing ${campaign.title}.`,
            icon: '🎉',
          },
        }))
      }
    } catch (error) {
      setClaimError(error.message || 'Could not claim this campaign reward.')
    } finally {
      setClaiming(false)
    }
  }

  const waitSeconds = Math.max(0, required - activeSeconds)
  return (
    <div className="feed-link-viewer-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget && closeSeconds <= 0 && !claiming) onClose()
    }}>
      <section className="feed-link-viewer" role="dialog" aria-modal="true" aria-labelledby="feed-link-viewer-title">
        <header className="feed-link-viewer-header">
          <div><SocialAppBadge appName={campaign.app_name} /><h2 id="feed-link-viewer-title">{campaign.title}</h2></div>
          <button type="button" disabled={closeSeconds > 0 || claiming} onClick={onClose} aria-label={closeSeconds > 0 ? `Close available in ${closeSeconds} seconds` : 'Close campaign viewer'}>
            {closeSeconds > 0 ? `Close in ${closeSeconds}s` : '×'}
          </button>
        </header>
        {campaign.images?.length > 0 && (
          <div className="feed-link-viewer-images">
            {campaign.images.map((image, index) => <img src={image} alt={`${campaign.title} ${index + 1}`} key={`${index}-${image.slice(0, 30)}`} />)}
          </div>
        )}
        {campaign.description && <p className="feed-link-viewer-description">{campaign.description}</p>}
        <div className="feed-link-embed-wrap">
          <iframe
            title={`${campaign.app_name}: ${campaign.title}`}
            src={campaign.url}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          />
          {!isOwner && !claimed && (
            <a
              className="feed-link-play-button"
              href={campaign.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={startViewing}
            >
              {startingView ? 'Starting reward timer…' : viewStarted ? '▶ Open video in a new tab' : '▶ Play video to start the reward countdown'}
            </a>
          )}
        </div>
        <a className="feed-link-open-external" href={campaign.url} target="_blank" rel="noreferrer">
          If {campaign.app_name} doesn’t display in the preview, open it in a new tab ↗
        </a>
        {isOwner ? (
          <p className="feed-link-claim-success" role="status">This is your campaign. You can preview the published link, but cannot claim viewer rewards from your own post.</p>
        ) : claimed ? (
          <div className="feed-link-claim-success" role="status">
            <strong>{alreadyClaimed ? 'Reward already earned' : '🎉 Reward claimed'}</strong>
            <span>{alreadyClaimed
              ? `You already claimed the one-time reward of ${Number(claimed.viewerCoins || 0).toLocaleString()} coins for this campaign.`
              : `You earned ${Number(claimed.viewerCoins || 0).toLocaleString()} coins. The campaign owner earned ${Number(claimed.posterCoins || 0).toLocaleString()} coins.`}</span>
          </div>
        ) : (
          <div className="feed-link-claim-panel">
            <div className="feed-link-progress-copy">
              <strong>{startError ? 'View not available' : !viewStarted ? 'Play the video to start your reward countdown' : startingView || !viewId ? 'Starting secure view…' : waitSeconds ? `Keep viewing for ${waitSeconds}s to qualify` : 'View complete — claim your reward'}</strong>
              <span>{activeSeconds}/{required} seconds {viewStarted && !claimed ? `· Claim unlocks in ${waitSeconds} seconds` : ''} · {Number(campaign.viewer_coins ?? pricing?.viewer_coins ?? 0).toLocaleString()} coins</span>
            </div>
            <progress max={required} value={Math.min(required, activeSeconds)} aria-label="Qualified viewing progress" />
            <button type="button" className="feed-link-claim-button" disabled={!canClaim || claiming} onClick={claimReward}>
              {claiming ? 'Claiming…' : `Claim ${Number(campaign.viewer_coins ?? pricing?.viewer_coins ?? 0).toLocaleString()} coins`}
            </button>
          </div>
        )}
        {(startError || claimError) && <p className="feed-link-viewer-error" role="alert">{startError || claimError}</p>}
      </section>
    </div>
  )
}

function FeedLinkCampaigns({ data, userLoggedIn, requireLogin, onRefresh }) {
  const location = useLocation()
  const [campaigns, setCampaigns] = useState(data?.campaigns || [])
  const [mine, setMine] = useState(data?.mine || [])
  const [pricing, setPricing] = useState(data?.pricing || {})
  const [showRequest, setShowRequest] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [providers, setProviders] = useState([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [walletBalance, setWalletBalance] = useState(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [sending, setSending] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [notice, setNotice] = useState('')
  const [viewer, setViewer] = useState(null)
  const [requestTab, setRequestTab] = useState(false)
  const urlCampaignId = useMemo(() => new URLSearchParams(location.search).get('campaign') || '', [location.search])
  const walletSelected = form.paymentMethod === WALLET_PAYMENT_METHOD
  const provider = providers.find(item => item.id === form.paymentMethod)
  const accounts = provider?.accounts || []
  const account = accounts.find(item => item.id === paymentAccountId) || accounts[0]
  const paymentProvider = provider && account ? { ...provider, ...account } : provider
  const ussd = paymentProvider ? formatProviderUssd(paymentProvider, campaignPrice(pricing, form.durationTier)) : ''
  const amount = campaignPrice(pricing, form.durationTier)

  useEffect(() => {
    setCampaigns(data?.campaigns || [])
    setMine(data?.mine || [])
    setPricing(data?.pricing || {})
  }, [data])

  useEffect(() => {
    if (!showRequest) return undefined
    let active = true
    setProvidersLoading(true)
    setWalletLoading(true)
    getConfiguredCampaignPaymentProviders()
      .then(methods => {
        if (!active) return
        setProviders(methods)
      })
      .catch(error => {
        if (active) setRequestError(`Could not load payment methods: ${error.message}`)
      })
      .finally(() => { if (active) setProvidersLoading(false) })
    socialAPI.getWallet()
      .then(response => {
        if (active) setWalletBalance(Number(response.data.availableBalance || 0))
      })
      .catch(error => {
        if (active) setRequestError(`Could not load your real wallet balance: ${error.message}`)
      })
      .finally(() => { if (active) setWalletLoading(false) })
    return () => { active = false }
  }, [showRequest])

  useEffect(() => {
    if (!urlCampaignId) return
    const match = campaigns.find(item => item.campaign_id === urlCampaignId)
    if (match) setViewer(current => current?.campaign_id === match.campaign_id ? current : match)
    else {
      const ownCampaign = mine.find(item => item.campaign_id === urlCampaignId && item.status === 'approved')
      if (ownCampaign) setViewer(current => current?.campaign_id === ownCampaign.campaign_id ? current : ownCampaign)
    }
  }, [urlCampaignId, campaigns, mine])

  const submitRequest = async event => {
    event.preventDefault()
    if (!userLoggedIn && !requireLogin('Log in to submit a paid link campaign.')) return
    if (!form.images.length) {
      setRequestError('Add at least one campaign photo.')
      return
    }
    let parsedUrl
    try { parsedUrl = new URL(form.url.trim()) } catch { parsedUrl = null }
    if (!parsedUrl || parsedUrl.protocol !== 'https:') {
      setRequestError('Enter a valid HTTPS link to the social media video or post.')
      return
    }
    if (!form.paymentMethod || (!walletSelected && !form.paymentReference.trim()) || amount <= 0) {
      setRequestError(amount <= 0
        ? 'The selected campaign duration does not have a price yet. Contact Root.'
        : walletSelected
          ? 'Choose a payment method.'
          : 'Choose a payment method and enter your payment reference.')
      return
    }
    if (walletSelected && (walletLoading || walletBalance === null || walletBalance < amount)) {
      setRequestError(walletBalance !== null && walletBalance < amount
        ? `Insufficient real wallet balance. You have ETB ${walletBalance.toFixed(2)} available; ETB ${amount.toFixed(2)} is required.`
        : 'Your wallet balance is still loading. Please try again.')
      return
    }
    setSending(true)
    setRequestError('')
    setNotice('')
    try {
      await socialAPI.createLinkCampaign({
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        url: parsedUrl.href,
        paymentMethod: form.paymentMethod,
        paymentReference: walletSelected ? '' : form.paymentReference.trim(),
        paymentProof: walletSelected ? null : form.paymentProof || null,
      })
      setShowRequest(false)
      setForm(EMPTY_FORM)
      setWalletBalance(null)
      setNotice(walletSelected
        ? 'Paid from your REDSEA Wallet. Your link will appear in the feed after Root reviews and approves it.'
        : 'Payment request submitted. Your link will appear in the feed after Root reviews and approves it.')
      const response = await socialAPI.getLinkCampaigns()
      setCampaigns(response.data.campaigns || [])
      setMine(response.data.mine || [])
      setPricing(response.data.pricing || {})
      onRefresh()
    } catch (error) {
      setRequestError(error.message || 'Could not submit the link campaign payment request.')
    } finally {
      setSending(false)
    }
  }

  const addImages = async event => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (form.images.length + files.length > 5) {
      setRequestError('You can add up to five campaign photos.')
      return
    }
    setImageLoading(true)
    try {
      const images = await Promise.all(files.map(compressCampaignImage))
      setForm(current => ({ ...current, images: [...current.images, ...images] }))
      setRequestError('')
    } catch (error) {
      setRequestError(error.message || 'Could not prepare campaign photos.')
    } finally {
      setImageLoading(false)
    }
  }

  return (
    <section className="feed-link-campaigns" aria-label="View videos and earn coins">
      <header className="feed-link-section-header">
        <div>
          <p className="feed-link-section-kicker">WATCH · DISCOVER · EARN</p>
          <h2>View videos, earn coins</h2>
          <p>Explore approved videos and social links. Keep the in-app viewer open to qualify for coins.</p>
        </div>
        <button type="button" className="feed-link-add-button" onClick={() => {
          if (!userLoggedIn && !requireLogin('Log in to submit a paid link campaign.')) return
          setForm(EMPTY_FORM)
          setRequestError('')
          setShowRequest(true)
        }}>＋ Add link</button>
      </header>
      <nav className="feed-link-tabs" aria-label="Link campaigns">
        <button type="button" className={!requestTab ? 'selected' : ''} onClick={() => setRequestTab(false)}>View and earn</button>
        <button type="button" className={requestTab ? 'selected' : ''} onClick={() => setRequestTab(true)}>My submissions {mine.length > 0 && <span>{mine.length}</span>}</button>
      </nav>
      {!requestTab ? (
        campaigns.length ? (
          <div className="feed-link-card-grid">
            {campaigns.map(campaign => (
              <article className="feed-link-card" key={campaign.campaign_id}>
                <button type="button" className="feed-link-card-main" onClick={() => setViewer(campaign)} aria-label={`View ${campaign.title} on ${campaign.app_name} and earn coins`}>
                  <div className="feed-link-card-image-wrap">
                    {campaign.images?.[0]
                      ? <img src={campaign.images[0]} alt="" loading="lazy" />
                      : <span className="feed-link-card-placeholder">🔗</span>}
                    <SocialAppBadge appName={campaign.app_name} />
                  </div>
                  <div className="feed-link-card-copy">
                    <h3>{campaign.title}</h3>
                    <p>{campaign.description || `Watch this ${campaign.app_name} video and earn coins.`}</p>
                    <small>By {campaign.full_name || campaign.username || 'REDSEA creator'}</small>
                  </div>
                </button>
                <button type="button" className="feed-link-earn-button" onClick={() => setViewer(campaign)}>
                  <span>{campaign.already_claimed ? '▶ View again' : '▶ View &amp; claim'}</span>
                  <strong>{campaign.already_claimed
                    ? 'Already earned'
                    : `＋${Number(campaign.viewer_coins ?? pricing?.viewer_coins ?? 0).toLocaleString()} coins`}</strong>
                </button>
              </article>
            ))}
          </div>
        ) : <p className="feed-link-empty">No approved link campaigns are available yet. Check back soon.</p>
      ) : (
        mine.length ? (
          <div className="feed-link-submission-list">
            {mine.map(campaign => (
              <article key={campaign.campaign_id}>
                {campaign.images?.[0] && <img src={campaign.images[0]} alt="" />}
                <div><span className={`feed-link-submission-status ${campaign.status}`}>{campaign.status}</span><h3>{campaign.title}</h3><p>{campaign.app_name} · {campaign.duration_days} days · {formatMoney(campaign.payment_amount)}</p></div>
              </article>
            ))}
          </div>
        ) : <p className="feed-link-empty">No link requests yet. Add a link to submit your first campaign.</p>
      )}
      {notice && <p className="feed-link-notice" role="status">{notice}</p>}

      {showRequest && (
        <div className="feed-link-modal-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget && !sending) setShowRequest(false)
        }}>
          <form className="feed-link-request-modal" role="dialog" aria-modal="true" aria-labelledby="feed-link-request-title" onSubmit={submitRequest}>
            <header>
              <div><span>PAID LINK CAMPAIGN</span><h2 id="feed-link-request-title">Submit a video or social link</h2></div>
              <button type="button" disabled={sending} onClick={() => setShowRequest(false)} aria-label="Close campaign request">×</button>
            </header>
            <label>Social media app
              <select value={form.appName} onChange={event => setForm(current => ({ ...current, appName: event.target.value }))}>
                {SOCIAL_APPS.map(app => <option key={app} value={app}>{app}</option>)}
              </select>
            </label>
            <label>Campaign title
              <input required maxLength={160} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Give your video link a clear title" />
            </label>
            <label>Video / post link
              <input required type="url" inputMode="url" value={form.url} onChange={event => setForm(current => ({ ...current, url: event.target.value }))} placeholder="https://…" />
              <small>Any HTTPS social media link is accepted. Some services block in-app previews; viewers can open those links in a new tab.</small>
            </label>
            <label>Description
              <textarea maxLength={2000} rows={3} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Describe the video or what viewers will see" />
            </label>
            <label>Campaign photos (1–5)
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={imageLoading || form.images.length >= 5} onChange={addImages} />
            </label>
            {form.images.length > 0 && (
              <div className="feed-link-image-previews">
                {form.images.map((image, index) => (
                  <div key={`${index}-${image.slice(0, 24)}`}><img src={image} alt={`Campaign photo ${index + 1}`} /><button type="button" onClick={() => setForm(current => ({ ...current, images: current.images.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove campaign photo ${index + 1}`}>×</button></div>
                ))}
              </div>
            )}
            <label>Campaign duration
              <select value={form.durationTier} onChange={event => setForm(current => ({ ...current, durationTier: event.target.value }))}>
                {DURATION_TIERS.map(tier => <option key={tier.id} value={tier.id}>{tier.label} · {formatMoney(campaignPrice(pricing, tier.id))}</option>)}
              </select>
            </label>
            <div className="feed-link-payment-summary"><span>Payment due</span><strong>{formatMoney(amount)}</strong></div>
            <fieldset className="feed-link-payment-methods">
              <legend>Choose payment method</legend>
              <label className={walletSelected ? 'selected' : ''}>
                <input
                  type="radio"
                  name="campaign-payment-method"
                  value={WALLET_PAYMENT_METHOD}
                  checked={walletSelected}
                  onChange={() => setForm(current => ({ ...current, paymentMethod: WALLET_PAYMENT_METHOD }))}
                />
                <span>💳</span>
                REDSEA Wallet
              </label>
              {providersLoading ? <small>Loading configured payment providers…</small> : providers.map(method => (
                <label key={method.id} className={form.paymentMethod === method.id ? 'selected' : ''}>
                  <input type="radio" name="campaign-payment-method" value={method.id} checked={form.paymentMethod === method.id} onChange={() => setForm(current => ({ ...current, paymentMethod: method.id }))} />
                  {method.logo ? <img src={method.logo} alt="" /> : <span>{method.id === 'Bank' ? '🏦' : '📱'}</span>}
                  {method.name}
                </label>
              ))}
              {!providersLoading && !providers.length && <small>No external payment providers are configured. You can still pay with your REDSEA Wallet.</small>}
            </fieldset>
            {walletSelected && (
              <div className="feed-link-provider-details feed-link-wallet-details">
                <strong>Your REDSEA real wallet balance</strong>
                {walletLoading
                  ? <span>Loading available balance…</span>
                  : walletBalance === null
                    ? <span>Balance unavailable. Close and reopen the form to try again.</span>
                    : <>
                        <span>Available: {formatMoney(walletBalance)}</span>
                        <span>Campaign payment: {formatMoney(amount)}</span>
                        {walletBalance < amount && <span className="feed-link-wallet-insufficient">Add {formatMoney(amount - walletBalance)} to your real wallet to continue.</span>}
                      </>}
              </div>
            )}
            {provider && !walletSelected && (
              <div className="feed-link-provider-details">
                <strong>{provider.name} payment instructions</strong>
                {accounts.length > 1 && (
                  <label className="feed-link-account-select">Choose configured account
                    <select value={account?.id || ''} onChange={event => setPaymentAccountId(event.target.value)}>
                      {accounts.map((item, index) => (
                        <option key={item.id || index} value={item.id}>{item.accountName} — {item.phone || item.accountNumber || `Account ${index + 1}`}</option>
                      ))}
                    </select>
                  </label>
                )}
                {provider.id === 'Bank' ? <>
                  <span>Account name: {account?.accountName || 'Not configured'}</span>
                  <span>Bank: {account?.bankName || 'Not configured'}</span>
                  <span>Account number: {account?.accountNumber || 'Not configured'}</span>
                </> : <>
                  <span>Account name: {paymentProvider?.accountName || 'Not configured'}</span>
                  {paymentProvider?.phone && <span>Wallet phone: {paymentProvider.phone}</span>}
                  {ussd && <a href={`tel:${ussd.replaceAll('#', '%23')}`}>Pay {formatMoney(amount)} and open dialer</a>}
                </>}
              </div>
            )}
            {!walletSelected && <>
              <label>Payment transaction reference
                <input required maxLength={160} value={form.paymentReference} onChange={event => setForm(current => ({ ...current, paymentReference: event.target.value }))} placeholder="Receipt or transaction ID" />
              </label>
              <label>Optional payment proof
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  try {
                    const proof = await compressCampaignImage(file)
                    setForm(current => ({ ...current, paymentProof: proof }))
                  } catch (error) {
                    setRequestError(error.message || 'Could not prepare payment proof.')
                  }
                }} />
              </label>
            </>}
            {requestError && <p className="feed-link-form-error" role="alert">{requestError}</p>}
            <footer>
              <button type="submit" disabled={sending || imageLoading || amount <= 0 || (walletSelected ? walletLoading || walletBalance === null || walletBalance < amount : providersLoading || !provider)}>
                {sending ? walletSelected ? 'Paying from wallet…' : 'Sending payment request…' : imageLoading ? 'Preparing photos…' : walletSelected ? `Pay with REDSEA Wallet · ${formatMoney(amount)}` : `Pay request to publish · ${formatMoney(amount)}`}
              </button>
              <button type="button" disabled={sending} onClick={() => setShowRequest(false)}>Cancel</button>
            </footer>
            <small>Root reviews the campaign before it is published. External payment details are reviewed; REDSEA Wallet payments are charged immediately and refunded if the campaign is rejected. Prices and rewards are configured by Root.</small>
          </form>
        </div>
      )}

      {viewer && (
        <CampaignViewer
          campaign={viewer}
          pricing={pricing}
          isOwner={mine.some(item => item.campaign_id === viewer.campaign_id)}
          onClose={() => setViewer(null)}
          onClaimed={async () => {
            const response = await socialAPI.getLinkCampaigns()
            setCampaigns(response.data.campaigns || [])
            setMine(response.data.mine || [])
            onRefresh()
          }}
        />
      )}
    </section>
  )
}

export default FeedLinkCampaigns
