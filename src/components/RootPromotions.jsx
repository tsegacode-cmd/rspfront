import { useCallback, useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import Pagination, { getPageItems, PAGE_SIZE } from './Pagination'
import { getCoinLevel } from '../utils/coinLevels'
import './RootPromotions.css'

const emptyForm = () => ({
  title: '',
  message: '',
  imageData: '',
  audioData: '',
  buttonText: '',
  buttonUrl: '',
  backgroundColor: '#8b0000',
  audienceStatus: 'all',
  badgeText: '',
  alertEnabled: true,
  pinned: false,
  popupEnabled: false,
})

const PRODUCT_CATEGORY_PATHS = {
  'broker-house': '/broker-house',
  'create-partnership': '/brokerage',
  'room-booking': '/room-booking',
  logistics: '/logistics',
  'movable-services': '/movable-commission',
}
const ALL_REWARD_ROLES = '__all_reward_roles__'
const LINK_CAMPAIGN_TIERS = [
  { id: '1-3', label: '1–3 days', days: 3 },
  { id: '4-7', label: '4–7 days', days: 7 },
  { id: '8-15', label: '8–15 days', days: 15 },
  { id: '16-30', label: '16–30 days', days: 30 },
  { id: '31-60', label: '31–60 days', days: 60 },
  { id: '61-180', label: '2–6 months', days: 180 },
  { id: '181-365', label: '6–12 months', days: 365 },
]
const DAILY_GAME_LABELS = {
  wheel: { title: 'Spin & Win', icon: '🎡' },
  slots: { title: 'Lucky Slots', icon: '🎰' },
  'boom-mines': { title: 'Boom Mine', icon: '💎' },
}
const defaultDailyGameRewardSettings = () => ({
  wheel: {
    enabled: true,
    playsPer24Hours: 3,
    segments: [
      { id: 'small', label: 'Small win', coins: 5 },
      { id: 'medium', label: 'Good win', coins: 10 },
      { id: 'jackpot', label: 'Jackpot', coins: 25 },
      { id: 'try-again', label: 'Try again', coins: 0 },
      { id: 'bonus', label: 'Bonus', coins: 15 },
      { id: 'lucky', label: 'Lucky win', coins: 8 },
    ],
  },
  slots: {
    enabled: true,
    playsPer24Hours: 3,
    segments: [
      { id: 'pair', label: 'Matching pair', coins: 5 },
      { id: 'triple', label: 'Triple match', coins: 20 },
      { id: 'jackpot', label: 'Jackpot', coins: 50 },
      { id: 'try-again', label: 'Try again', coins: 0 },
      { id: 'lucky', label: 'Lucky symbols', coins: 10 },
    ],
  },
  'boom-mines': {
    enabled: true,
    playsPer24Hours: 3,
    segments: [
      { id: 'safe', label: 'Safe pick', coins: 5 },
      { id: 'gold', label: 'Gold mine', coins: 15 },
      { id: 'diamond', label: 'Diamond mine', coins: 30 },
      { id: 'try-again', label: 'Try again', coins: 0 },
    ],
  },
})

const linkCampaignSettingsFromResponse = row => ({
  pricePerDay: Number(row?.price_1_3 || 0) / 3,
  viewerCoins: Number(row?.viewer_coins || 0),
  posterCoins: Number(row?.poster_coins || 0),
  viewSeconds: Number(row?.view_seconds || 30),
  closeDelaySeconds: Number(row?.close_delay_seconds ?? 8),
})

const linkCampaignTierPrice = (settings, tier) => (
  Math.round(Number(settings.pricePerDay || 0) * tier.days * 100) / 100
)

const getProductLink = product => product.productUrl
  || (PRODUCT_CATEGORY_PATHS[product.serviceKey]
    ? `${PRODUCT_CATEGORY_PATHS[product.serviceKey]}?promotionProduct=${encodeURIComponent(product.id)}`
    : '')

const resizeImage = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Could not read that banner image.'))
  reader.onload = () => {
    const image = new Image()
    image.onerror = () => reject(new Error('That banner is not a valid image.'))
    image.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Could not process that banner image.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const result = canvas.toDataURL('image/webp', 0.78)
      if (result.length > 1800000) {
        reject(new Error('Choose a smaller banner image.'))
        return
      }
      resolve(result)
    }
    image.src = String(reader.result)
  }
  reader.readAsDataURL(file)
})

const promotionToForm = promotion => ({
  title: promotion.title || '',
  message: promotion.message || '',
  imageData: promotion.image_data || '',
  audioData: promotion.audio_data || '',
  buttonText: promotion.button_text || '',
  buttonUrl: promotion.button_url || '',
  backgroundColor: promotion.background_color || '#8b0000',
  audienceStatus: promotion.audience_status || 'all',
  badgeText: promotion.badge_text || '',
  alertEnabled: Boolean(promotion.alert_enabled),
  pinned: Boolean(promotion.pinned),
  popupEnabled: Boolean(promotion.popup_enabled),
})

const readAudioFile = file => new Promise((resolve, reject) => {
  if (!file.type.startsWith('audio/')) {
    reject(new Error('Choose a supported audio file.'))
    return
  }
  if (file.size > 6 * 1024 * 1024) {
    reject(new Error('Choose an audio file smaller than 6 MB.'))
    return
  }
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Could not read that audio file.'))
  reader.onload = () => {
    if (typeof reader.result !== 'string' || !reader.result.startsWith('data:audio/')) {
      reject(new Error('That file could not be prepared as audio.'))
      return
    }
    resolve(reader.result)
  }
  reader.readAsDataURL(file)
})

function RootPromotions() {
  const [activeTab, setActiveTab] = useState('promotions')
  const [promotions, setPromotions] = useState([])
  const [products, setProducts] = useState([])
  const [boostRequests, setBoostRequests] = useState([])
  const [roleSettings, setRoleSettings] = useState([])
  const [coinLevelRules, setCoinLevelRules] = useState([])
  const [linkCampaignSettings, setLinkCampaignSettings] = useState(() => linkCampaignSettingsFromResponse(null))
  const [linkCampaignSaving, setLinkCampaignSaving] = useState(false)
  const [dailyGameRewardSettings, setDailyGameRewardSettings] = useState(defaultDailyGameRewardSettings)
  const [dailyGameRewardSaving, setDailyGameRewardSaving] = useState(false)
  const [coinLevelHistory, setCoinLevelHistory] = useState([])
  const [coinLevelHistoryLoading, setCoinLevelHistoryLoading] = useState(false)
  const [coinLevelSaving, setCoinLevelSaving] = useState(false)
  const [selectedRole, setSelectedRole] = useState('')
  const [userActivity, setUserActivity] = useState({ users: [], total: 0 })
  const [userActivityPage, setUserActivityPage] = useState(0)
  const [userActivityLoading, setUserActivityLoading] = useState(false)
  const [rewardBusy, setRewardBusy] = useState(false)
  const [rewardLoading, setRewardLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [promotionPage, setPromotionPage] = useState(0)
  const [boostPage, setBoostPage] = useState(0)
  const [notice, setNotice] = useState('')
  const safePromotionPage = Math.min(promotionPage, Math.max(0, Math.ceil(promotions.length / PAGE_SIZE) - 1))
  const safeBoostPage = Math.min(boostPage, Math.max(0, Math.ceil(boostRequests.length / PAGE_SIZE) - 1))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [promotionResponse, boostResponse, productResponse] = await Promise.all([
        rootAPI.getPromotions(),
        rootAPI.getBoostRequests(),
        rootAPI.getServiceProducts(),
      ])
      setPromotions(promotionResponse.data)
      setBoostRequests(boostResponse.data)
      setProducts(productResponse.data.filter(product => product.published !== false))
    } catch (loadError) {
      setError(`Could not load promotions and boost requests: ${loadError.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadRewardSettings = useCallback(async () => {
    setRewardLoading(true)
    setError('')
    try {
      const [response, levelResponse, campaignSettingsResponse, dailyGameRewardResponse] = await Promise.all([
        rootAPI.getWalletManagement(),
        rootAPI.getCoinLevelRules(),
        rootAPI.getLinkCampaignSettings(),
        rootAPI.getDailyGameRewardSettings(),
      ])
      setRoleSettings(response.data.settings)
      setCoinLevelRules(levelResponse.data)
      setLinkCampaignSettings(linkCampaignSettingsFromResponse(campaignSettingsResponse.data))
      setDailyGameRewardSettings(dailyGameRewardResponse.data)
      setSelectedRole(current => (
        current === ALL_REWARD_ROLES
          ? current
          : response.data.settings.find(setting => setting.role === current)?.role
        || response.data.settings[0]?.role
        || ''
      ))
    } catch (loadError) {
      setError(`Could not load reward rules: ${loadError.message}`)
    } finally {
      setRewardLoading(false)
    }
  }, [])

  const loadCoinLevelHistory = useCallback(async () => {
    setCoinLevelHistoryLoading(true)
    setError('')
    try {
      const response = await rootAPI.getCoinLevelHistory()
      setCoinLevelHistory(response.data)
    } catch (loadError) {
      setError(`Could not load level reward history: ${loadError.message}`)
    } finally {
      setCoinLevelHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'rewards') loadRewardSettings()
  }, [activeTab, loadRewardSettings])

  useEffect(() => {
    if (activeTab !== 'level-history') return undefined
    loadCoinLevelHistory()
    const interval = window.setInterval(loadCoinLevelHistory, 30000)
    return () => window.clearInterval(interval)
  }, [activeTab, loadCoinLevelHistory])

  const loadUserActivity = useCallback(async page => {
    setUserActivityLoading(true)
    setError('')
    try {
      const response = await rootAPI.getUserActivity(page + 1)
      setUserActivity(response.data)
      setUserActivityPage(response.data.page - 1)
    } catch (loadError) {
      setError(`Could not load user activity: ${loadError.message}`)
    } finally {
      setUserActivityLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'activity') return undefined
    loadUserActivity(userActivityPage)
    const interval = window.setInterval(() => loadUserActivity(userActivityPage), 30000)
    return () => window.clearInterval(interval)
  }, [activeTab, loadUserActivity, userActivityPage])

  const selectedRewardSettings = roleSettings.find(setting => setting.role === selectedRole)
    || (selectedRole === ALL_REWARD_ROLES ? roleSettings[0] : null)

  const saveRewardSettings = async event => {
    event.preventDefault()
    if (!selectedRewardSettings) return
    setRewardBusy(true)
    setError('')
    setNotice('')
    try {
      const roles = selectedRole === ALL_REWARD_ROLES
        ? roleSettings
        : [selectedRewardSettings]
      const results = await Promise.allSettled(roles.map(role => rootAPI.updateWalletSettings({
        role: role.role,
        signupBonus: selectedRewardSettings.signup_bonus,
        inviteReward: selectedRewardSettings.invite_reward,
        shareReward: selectedRewardSettings.share_reward,
        productSalePercent: selectedRewardSettings.product_sale_percent,
        currency: role.currency,
        inviteRewardTrigger: selectedRewardSettings.invite_reward_trigger,
        coinLoginReward: selectedRewardSettings.coin_login_reward,
        coinShareReward: selectedRewardSettings.coin_share_reward,
        coinInviteReward: selectedRewardSettings.coin_invite_reward,
        coinPurchaseReward: selectedRewardSettings.coin_purchase_reward,
        coinGiftReceiveReward: selectedRewardSettings.coin_gift_receive_reward,
        coinGiftBonusPercent: selectedRewardSettings.coin_gift_bonus_percent,
        coinSavingsDailyRate: selectedRewardSettings.coin_savings_daily_rate,
        minCoinSavingsDeposit: selectedRewardSettings.min_coin_savings_deposit,
        maxCoinSavingsDeposit: selectedRewardSettings.max_coin_savings_deposit,
        coinPerEtb: selectedRewardSettings.coin_per_etb,
        minCoinConversion: selectedRewardSettings.min_coin_conversion,
        maxCoinConversion: selectedRewardSettings.max_coin_conversion,
        minDeposit: selectedRewardSettings.min_deposit,
        maxDeposit: selectedRewardSettings.max_deposit,
        minWithdrawal: selectedRewardSettings.min_withdrawal,
        maxWithdrawal: selectedRewardSettings.max_withdrawal,
        minBonusWithdrawal: selectedRewardSettings.min_bonus_withdrawal,
        maxBonusWithdrawal: selectedRewardSettings.max_bonus_withdrawal,
      })))
      await loadRewardSettings()
      const failedRoles = results
        .map((result, index) => result.status === 'rejected' ? roles[index].role : null)
        .filter(Boolean)
      if (failedRoles.length) {
        setError(`Reward rules saved for ${roles.length - failedRoles.length} role(s), but failed for: ${failedRoles.join(', ')}.`)
      } else {
        setNotice(selectedRole === ALL_REWARD_ROLES
          ? `Reward rules saved for all ${roles.length} account roles.`
          : `Reward rules saved for ${selectedRewardSettings.role}.`)
      }
    } catch (saveError) {
      setError(`Could not save reward rules: ${saveError.message}`)
    } finally {
      setRewardBusy(false)
    }
  }

  const changeRewardSetting = (key, value) => {
    const targetRole = selectedRole === ALL_REWARD_ROLES ? selectedRewardSettings?.role : selectedRole
    setRoleSettings(current => current.map(setting => setting.role === targetRole
      ? { ...setting, [key]: value }
      : setting))
  }

  const changeCoinLevelRule = (level, key, value) => {
    setCoinLevelRules(current => current.map(rule => rule.level === level
      ? { ...rule, [key]: value }
      : rule))
  }

  const saveCoinLevelSettings = async event => {
    event.preventDefault()
    setCoinLevelSaving(true)
    setError('')
    setNotice('')
    try {
      const rules = coinLevelRules.map(rule => ({
        level: Number(rule.level),
        required_coins: Number(rule.required_coins),
        reward_etb: Number(rule.reward_etb),
      }))
      const response = await rootAPI.saveCoinLevelRules(rules)
      setCoinLevelRules(response.data)
      await loadCoinLevelHistory()
      setNotice('Coin level thresholds and ETB rewards saved. Eligible accounts were rewarded automatically.')
    } catch (saveError) {
      setError(`Could not save coin level rewards: ${saveError.message}`)
    } finally {
      setCoinLevelSaving(false)
    }
  }

  const saveLinkCampaignSettings = async event => {
    event.preventDefault()
    setLinkCampaignSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await rootAPI.saveLinkCampaignSettings({
        ...linkCampaignSettings,
        prices: Object.fromEntries(LINK_CAMPAIGN_TIERS.map(tier => [
          tier.id,
          linkCampaignTierPrice(linkCampaignSettings, tier),
        ])),
      })
      setLinkCampaignSettings(linkCampaignSettingsFromResponse(response.data))
      setNotice('Link campaign prices, coin rewards, and viewer timing saved.')
    } catch (saveError) {
      setError(`Could not save link campaign reward rules: ${saveError.message}`)
    } finally {
      setLinkCampaignSaving(false)
    }
  }

  const changeLinkCampaignPricePerDay = value => {
    setLinkCampaignSettings(current => ({
      ...current,
      pricePerDay: value,
    }))
  }

  const changeDailyGameRule = (gameId, key, value) => {
    setDailyGameRewardSettings(current => ({
      ...current,
      [gameId]: { ...current[gameId], [key]: value },
    }))
  }

  const changeDailyGameSegment = (gameId, segmentId, key, value) => {
    setDailyGameRewardSettings(current => ({
      ...current,
      [gameId]: {
        ...current[gameId],
        segments: current[gameId].segments.map(segment => segment.id === segmentId
          ? { ...segment, [key]: value }
          : segment),
      },
    }))
  }

  const addDailyGameSegment = gameId => {
    setDailyGameRewardSettings(current => {
      const segments = current[gameId].segments
      if (segments.length >= 12) return current
      const id = `segment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      return {
        ...current,
        [gameId]: {
          ...current[gameId],
          segments: [...segments, { id, label: 'New reward', coins: 0 }],
        },
      }
    })
  }

  const removeDailyGameSegment = (gameId, segmentId) => {
    setDailyGameRewardSettings(current => {
      const segments = current[gameId].segments
      if (segments.length <= 2) return current
      return {
        ...current,
        [gameId]: {
          ...current[gameId],
          segments: segments.filter(segment => segment.id !== segmentId),
        },
      }
    })
  }

  const saveDailyGameRewardSettings = async event => {
    event.preventDefault()
    setDailyGameRewardSaving(true)
    setError('')
    setNotice('')
    try {
      const games = Object.fromEntries(Object.entries(dailyGameRewardSettings).map(([id, game]) => [
        id,
        {
          ...game,
          playsPer24Hours: Number(game.playsPer24Hours),
          segments: game.segments.map(segment => ({
            ...segment,
            coins: Number(segment.coins),
          })),
        },
      ]))
      const response = await rootAPI.saveDailyGameRewardSettings(games)
      setDailyGameRewardSettings(response.data)
      setNotice('Daily game reward amounts and 24-hour play limits saved.')
    } catch (saveError) {
      setError(`Could not save daily game reward rules: ${saveError.message}`)
    } finally {
      setDailyGameRewardSaving(false)
    }
  }

  const startEdit = promotion => {
    setEditing(promotion?.id || '')
    setForm(promotion ? promotionToForm(promotion) : emptyForm())
    setError('')
    setNotice('')
  }

  const savePromotion = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (editing) await rootAPI.updatePromotion(editing, form)
      else await rootAPI.createPromotion(form)
      await load()
      setEditing(null)
      setForm(emptyForm())
      setNotice(editing ? 'Promotion updated.' : 'Promotion published.')
    } catch (saveError) {
      setError(`Could not save promotion: ${saveError.message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleVisibility = async promotion => {
    try {
      await rootAPI.updatePromotion(promotion.id, { isHidden: !promotion.is_hidden })
      await load()
      setNotice(promotion.is_hidden ? 'Promotion is visible now.' : 'Promotion hidden.')
      setError('')
    } catch (updateError) {
      setError(`Could not update promotion visibility: ${updateError.message}`)
    }
  }

  const deletePromotion = async promotion => {
    if (!window.confirm(`Delete "${promotion.title}"? This cannot be undone.`)) return
    try {
      await rootAPI.deletePromotion(promotion.id)
      setPromotions(current => current.filter(item => item.id !== promotion.id))
      setNotice('Promotion deleted.')
      setError('')
    } catch (deleteError) {
      setError(`Could not delete promotion: ${deleteError.message}`)
    }
  }

  const updateBoost = async (request, status) => {
    try {
      await rootAPI.updateBoostRequest(request.request_id, status)
      await load()
      setNotice(status === 'approved' ? 'Boost approved and shown across the feed.' : status === 'unboosted' ? 'Boost removed from the feed.' : 'Boost request rejected.')
      setError('')
    } catch (updateError) {
      setError(`Could not update boost request: ${updateError.message}`)
    }
  }

  return (
    <section className="root-promotions">
      <header className="root-promotions-heading">
        <div><h2>Promotions &amp; Boosts</h2><p>Create homepage banners and review paid product-boost requests.</p></div>
        {activeTab === 'promotions' && <button type="button" onClick={() => startEdit(null)}>＋ New promotion</button>}
      </header>
      <div className="root-promotion-tabs" role="tablist" aria-label="Promotion management">
        <button type="button" role="tab" aria-selected={activeTab === 'promotions'} className={activeTab === 'promotions' ? 'active' : ''} onClick={() => setActiveTab('promotions')}>Promotions &amp; alerts</button>
        <button type="button" role="tab" aria-selected={activeTab === 'boosts'} className={activeTab === 'boosts' ? 'active' : ''} onClick={() => setActiveTab('boosts')}>Boost requests ({boostRequests.filter(item => item.status === 'pending').length})</button>
        <button type="button" role="tab" aria-selected={activeTab === 'rewards'} className={activeTab === 'rewards' ? 'active' : ''} onClick={() => setActiveTab('rewards')}>Reward rules</button>
        <button type="button" role="tab" aria-selected={activeTab === 'level-history'} className={activeTab === 'level-history' ? 'active' : ''} onClick={() => setActiveTab('level-history')}>Level reward history</button>
        <button type="button" role="tab" aria-selected={activeTab === 'activity'} className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>User activity</button>
      </div>
      {error && <p className="root-promotion-message error" role="alert">{error}</p>}
      {notice && <p className="root-promotion-message success" role="status">{notice}</p>}
      {activeTab === 'rewards' ? (
        rewardLoading ? <p className="root-promotion-muted">Loading reward rules…</p> : selectedRewardSettings ? (
          <>
          <section className="root-reward-status" aria-labelledby="root-reward-status-title">
            <div className="root-reward-status-heading">
              <div>
                <h3 id="root-reward-status-title">Current reward status</h3>
                <p>Live summary of the saved reward rules and claim availability. Use the forms below to adjust amounts, thresholds, and limits.</p>
              </div>
              <span>{roleSettings.length} role{roleSettings.length === 1 ? '' : 's'} configured</span>
            </div>
            <div className="root-reward-status-grid">
              {roleSettings.map(setting => (
                <article className="root-reward-status-card" key={`status-${setting.role}`}>
                  <h4>{setting.role} account rewards</h4>
                  <p><span>Signup bonus</span><strong>ETB {Number(setting.signup_bonus || 0).toFixed(2)}</strong><em className={Number(setting.signup_bonus) > 0 ? 'enabled' : ''}>{Number(setting.signup_bonus) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Invite reward</span><strong>ETB {Number(setting.invite_reward || 0).toFixed(2)}</strong><em className={Number(setting.invite_reward) > 0 ? 'enabled' : ''}>{Number(setting.invite_reward) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Invite payout trigger</span><strong>{String(setting.invite_reward_trigger || 'first_approved_purchase').replaceAll('_', ' ')}</strong><em className="enabled">Set</em></p>
                  <p><span>Post share bonus</span><strong>ETB {Number(setting.share_reward || 0).toFixed(2)}</strong><em className={Number(setting.share_reward) > 0 ? 'enabled' : ''}>{Number(setting.share_reward) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Referred sale commission</span><strong>{Number(setting.product_sale_percent || 0)}%</strong><em className={Number(setting.product_sale_percent) > 0 ? 'enabled' : ''}>{Number(setting.product_sale_percent) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Post share</span><strong>{Number(setting.coin_share_reward || 0).toLocaleString()} coins</strong><em className={Number(setting.coin_share_reward) > 0 ? 'enabled' : ''}>{Number(setting.coin_share_reward) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Daily login</span><strong>{Number(setting.coin_login_reward || 0).toLocaleString()} coins</strong><em className={Number(setting.coin_login_reward) > 0 ? 'enabled' : ''}>{Number(setting.coin_login_reward) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Successful invite</span><strong>{Number(setting.coin_invite_reward || 0).toLocaleString()} coins</strong><em className={Number(setting.coin_invite_reward) > 0 ? 'enabled' : ''}>{Number(setting.coin_invite_reward) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Approved purchase</span><strong>{Number(setting.coin_purchase_reward || 0).toLocaleString()} coins</strong><em className={Number(setting.coin_purchase_reward) > 0 ? 'enabled' : ''}>{Number(setting.coin_purchase_reward) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Gift received</span><strong>{Number(setting.coin_gift_receive_reward || 0).toLocaleString()} coins</strong><em className={Number(setting.coin_gift_receive_reward) > 0 ? 'enabled' : ''}>{Number(setting.coin_gift_receive_reward) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Gift bonus</span><strong>{Number(setting.coin_gift_bonus_percent || 0)}%</strong><em className={Number(setting.coin_gift_bonus_percent) > 0 ? 'enabled' : ''}>{Number(setting.coin_gift_bonus_percent) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Coin savings daily interest</span><strong>{Number(setting.coin_savings_daily_rate || 0)}%</strong><em className={Number(setting.coin_savings_daily_rate) > 0 ? 'enabled' : ''}>{Number(setting.coin_savings_daily_rate) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Coin savings deposit range</span><strong>{Number(setting.min_coin_savings_deposit || 0).toLocaleString()}–{Number(setting.max_coin_savings_deposit || 0).toLocaleString()} coins</strong><em className="enabled">Set</em></p>
                  <p><span>Coin conversion</span><strong>{Number(setting.coin_per_etb || 0).toLocaleString()} coins / ETB</strong><em className={Number(setting.coin_per_etb) > 0 ? 'enabled' : ''}>{Number(setting.coin_per_etb) > 0 ? 'Active' : 'Off'}</em></p>
                  <p><span>Coin conversion range</span><strong>{Number(setting.min_coin_conversion || 0).toLocaleString()}–{Number(setting.max_coin_conversion || 0).toLocaleString()} coins</strong><em className="enabled">Set</em></p>
                  <p><span>Deposit limits</span><strong>ETB {Number(setting.min_deposit || 0).toFixed(2)}–{Number(setting.max_deposit || 0).toFixed(2)}</strong><em className="enabled">Set</em></p>
                  <p><span>Real withdrawal limits</span><strong>ETB {Number(setting.min_withdrawal || 0).toFixed(2)}–{Number(setting.max_withdrawal || 0).toFixed(2)}</strong><em className="enabled">Set</em></p>
                  <p><span>Bonus withdrawal limits</span><strong>ETB {Number(setting.min_bonus_withdrawal || 0).toFixed(2)}–{Number(setting.max_bonus_withdrawal || 0).toFixed(2)}</strong><em className="enabled">Set</em></p>
                </article>
              ))}
              <article className="root-reward-status-card">
                <h4>Coin level ETB bonuses</h4>
                {coinLevelRules.map(rule => {
                  const levelInfo = getCoinLevel(rule.level)
                  return (
                    <p key={`level-status-${rule.level}`}>
                      <span>{levelInfo?.icon} {levelInfo?.name || `Level ${rule.level}`} · {Number(rule.required_coins || 0).toLocaleString()} coins</span>
                      <strong>ETB {Number(rule.reward_etb || 0).toFixed(2)}</strong>
                      <em className={Number(rule.reward_etb) > 0 ? 'enabled' : ''}>{Number(rule.reward_etb) > 0 ? 'Active' : 'Off'}</em>
                    </p>
                  )
                })}
              </article>
              <article className="root-reward-status-card">
                <h4>Social link-view rewards</h4>
                <p><span>Viewer per qualified view</span><strong>{Number(linkCampaignSettings.viewerCoins || 0).toLocaleString()} coins</strong><em className={Number(linkCampaignSettings.viewerCoins) > 0 ? 'enabled' : ''}>{Number(linkCampaignSettings.viewerCoins) > 0 ? 'Active' : 'Off'}</em></p>
                <p><span>Campaign owner per unique viewer</span><strong>{Number(linkCampaignSettings.posterCoins || 0).toLocaleString()} coins</strong><em className={Number(linkCampaignSettings.posterCoins) > 0 ? 'enabled' : ''}>{Number(linkCampaignSettings.posterCoins) > 0 ? 'Active' : 'Off'}</em></p>
                <p><span>Minimum viewing time</span><strong>{Number(linkCampaignSettings.viewSeconds || 0)} seconds</strong><em className="enabled">Set</em></p>
              </article>
              {Object.entries(DAILY_GAME_LABELS).map(([gameId, meta]) => {
                const game = dailyGameRewardSettings[gameId]
                if (!game) return null
                return (
                  <article className="root-reward-status-card" key={`game-status-${gameId}`}>
                    <h4>{meta.icon} {meta.title}</h4>
                    <p><span>Game status</span><strong>{game.enabled ? 'Enabled' : 'Disabled'}</strong><em className={game.enabled ? 'enabled' : ''}>{game.enabled ? 'Active' : 'Off'}</em></p>
                    <p><span>Plays per 24 hours</span><strong>{Number(game.playsPer24Hours || 0)}</strong><em className="enabled">Set</em></p>
                    {game.segments.map(segment => (
                      <p key={`${gameId}-${segment.id}`}><span>{segment.label}</span><strong>{Number(segment.coins || 0).toLocaleString()} coins</strong><em className={game.enabled ? 'enabled' : ''}>{game.enabled ? 'Active' : 'Off'}</em></p>
                    ))}
                  </article>
                )
              })}
              <article className="root-reward-status-card">
                <h4>Link campaign access prices</h4>
                {LINK_CAMPAIGN_TIERS.map(tier => {
                  const price = linkCampaignTierPrice(linkCampaignSettings, tier)
                  return <p key={`campaign-price-${tier.id}`}><span>{tier.label}</span><strong>ETB {price.toFixed(2)}</strong><em className={price > 0 ? 'enabled' : ''}>{price > 0 ? 'Available' : 'Off'}</em></p>
                })}
              </article>
            </div>
          </section>
          <form className="root-promotion-form" onSubmit={saveRewardSettings}>
            <h3>Reward rules by account role</h3>
            <p className="root-promotion-muted">Set the amounts each role earns for completing supported account tasks. These rules are used by wallet rewards.</p>
            <label>Account role
              <select value={selectedRole} onChange={event => setSelectedRole(event.target.value)}>
                <option value={ALL_REWARD_ROLES}>All accounts</option>
                {roleSettings.map(setting => <option value={setting.role} key={setting.role}>{setting.role}</option>)}
              </select>
            </label>
            {selectedRole === ALL_REWARD_ROLES && <p className="root-promotion-muted">These shared reward, coin, conversion, and transaction limit settings will be applied to every account role. Each role keeps its existing currency.</p>}
            <div className="root-promotion-form-grid">
              <label>Signup bonus
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.signup_bonus} onChange={event => changeRewardSetting('signup_bonus', event.target.value)} />
              </label>
              <label>Successful invite reward (ETB bonus)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.invite_reward} onChange={event => changeRewardSetting('invite_reward', event.target.value)} />
              </label>
              <label>Pay invite reward
                <select value={selectedRewardSettings.invite_reward_trigger} onChange={event => changeRewardSetting('invite_reward_trigger', event.target.value)}>
                  <option value="first_approved_purchase">After first approved booking or product purchase</option>
                  <option value="registration">When the invited account is created</option>
                  <option value="both">At registration and after first approved purchase</option>
                </select>
              </label>
              <label>Share reward (once per post/account)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.share_reward} onChange={event => changeRewardSetting('share_reward', event.target.value)} />
              </label>
              <label>Referred sale commission (%)
                <input type="number" min="0" max="100" step="0.01" value={selectedRewardSettings.product_sale_percent} onChange={event => changeRewardSetting('product_sale_percent', event.target.value)} />
              </label>
              <label>Currency code
                <input maxLength="8" value={selectedRewardSettings.currency} disabled={selectedRole === ALL_REWARD_ROLES} onChange={event => changeRewardSetting('currency', event.target.value.toUpperCase())} />
              </label>
            </div>
            <h3>Virtual coin rewards</h3>
            <p className="root-promotion-muted">Coins are separate from real and bonus ETB balances. Coins are whole-number units; friend gifts and conversions are recorded in the wallet ledger.</p>
            <div className="root-promotion-form-grid">
              <label>Daily active login (coins)
                <input type="number" min="0" step="1" value={selectedRewardSettings.coin_login_reward} onChange={event => changeRewardSetting('coin_login_reward', event.target.value)} />
              </label>
              <label>Share reward (coins, once per post/account)
                <input type="number" min="0" step="1" value={selectedRewardSettings.coin_share_reward} onChange={event => changeRewardSetting('coin_share_reward', event.target.value)} />
              </label>
              <label>Successful invite reward (coins)
                <input type="number" min="0" step="1" value={selectedRewardSettings.coin_invite_reward} onChange={event => changeRewardSetting('coin_invite_reward', event.target.value)} />
              </label>
              <label>Approved purchase reward (coins)
                <input type="number" min="0" step="1" value={selectedRewardSettings.coin_purchase_reward} onChange={event => changeRewardSetting('coin_purchase_reward', event.target.value)} />
              </label>
              <label>Gift received platform reward (coins)
                <input type="number" min="0" step="1" value={selectedRewardSettings.coin_gift_receive_reward} onChange={event => changeRewardSetting('coin_gift_receive_reward', event.target.value)} />
              </label>
              <label>Gift bonus (% of gifted coins)
                <input type="number" min="0" max="100" step="0.01" value={selectedRewardSettings.coin_gift_bonus_percent} onChange={event => changeRewardSetting('coin_gift_bonus_percent', event.target.value)} />
              </label>
            </div>
            <h3>Coin savings</h3>
            <p className="root-promotion-muted">Set one simple interest rate per day for locked coin deposits. Interest is calculated for the selected term and rounded down to whole coins; the principal and interest are returned at maturity.</p>
            <div className="root-promotion-form-grid">
              <label>Daily interest rate (%)
                <input type="number" min="0" max="100" step="0.0001" value={selectedRewardSettings.coin_savings_daily_rate} onChange={event => changeRewardSetting('coin_savings_daily_rate', event.target.value)} />
              </label>
              <label>Minimum savings deposit (coins)
                <input type="number" min="1" step="1" value={selectedRewardSettings.min_coin_savings_deposit} onChange={event => changeRewardSetting('min_coin_savings_deposit', event.target.value)} />
              </label>
              <label>Maximum savings deposit (coins)
                <input type="number" min="1" step="1" value={selectedRewardSettings.max_coin_savings_deposit} onChange={event => changeRewardSetting('max_coin_savings_deposit', event.target.value)} />
              </label>
            </div>
            <h3>Coin conversion and cash limits</h3>
            <p className="root-promotion-muted">Example: 100 coins per ETB means 100,000 coins convert to 1,000 ETB. ETB-to-coin purchases use real ETB balance; converted coins are credited to real ETB balance.</p>
            <div className="root-promotion-form-grid">
              <label>Coins per ETB
                <input type="number" min="1" step="1" value={selectedRewardSettings.coin_per_etb} onChange={event => changeRewardSetting('coin_per_etb', event.target.value)} />
              </label>
              <label>Minimum coin conversion
                <input type="number" min="0" step="1" value={selectedRewardSettings.min_coin_conversion} onChange={event => changeRewardSetting('min_coin_conversion', event.target.value)} />
              </label>
              <label>Maximum coin conversion
                <input type="number" min="1" step="1" value={selectedRewardSettings.max_coin_conversion} onChange={event => changeRewardSetting('max_coin_conversion', event.target.value)} />
              </label>
              <label>Minimum deposit (ETB)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.min_deposit} onChange={event => changeRewardSetting('min_deposit', event.target.value)} />
              </label>
              <label>Maximum deposit (ETB)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.max_deposit} onChange={event => changeRewardSetting('max_deposit', event.target.value)} />
              </label>
              <label>Minimum withdrawal (ETB)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.min_withdrawal} onChange={event => changeRewardSetting('min_withdrawal', event.target.value)} />
              </label>
              <label>Maximum withdrawal (ETB)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.max_withdrawal} onChange={event => changeRewardSetting('max_withdrawal', event.target.value)} />
              </label>
              <label>Minimum bonus withdrawal (ETB)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.min_bonus_withdrawal} onChange={event => changeRewardSetting('min_bonus_withdrawal', event.target.value)} />
              </label>
              <label>Maximum bonus withdrawal (ETB)
                <input type="number" min="0" step="0.01" value={selectedRewardSettings.max_bonus_withdrawal} onChange={event => changeRewardSetting('max_bonus_withdrawal', event.target.value)} />
              </label>
            </div>
            <div className="root-promotion-form-actions">
              <button type="submit" disabled={rewardBusy}>{rewardBusy ? 'Saving…' : selectedRole === ALL_REWARD_ROLES ? 'Save rules for all accounts' : 'Save role rules'}</button>
            </div>
          </form>
          <form className="root-promotion-form root-coin-level-form" onSubmit={saveCoinLevelSettings}>
            <h3>Coin levels and automatic ETB rewards</h3>
            <p className="root-promotion-muted">Levels are based on lifetime coins earned from rewards and gifts, not coins bought or spent. When an account first crosses a level threshold, it receives that level’s ETB bonus automatically. Rewards are credited once per level to the bonus wallet.</p>
            <div className="root-coin-level-list">
              {coinLevelRules.map(rule => {
                const levelInfo = getCoinLevel(rule.level)
                return (
                  <div className="root-coin-level-row" key={rule.level}>
                    <strong>{levelInfo?.icon} {levelInfo?.name} · Level {rule.level}</strong>
                    <label>Lifetime coins to reach level
                      <input
                        type="number"
                        min={rule.level === 1
                          ? 0
                          : Number(coinLevelRules.find(item => item.level === rule.level - 1)?.required_coins || 0) + 1}
                        step="1"
                        value={rule.required_coins}
                        onChange={event => changeCoinLevelRule(rule.level, 'required_coins', event.target.value)}
                      />
                      {rule.level === 1 && <small>Set this to zero or a positive whole number of lifetime coins.</small>}
                    </label>
                    <label>Automatic ETB bonus
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={rule.reward_etb}
                        onChange={event => changeCoinLevelRule(rule.level, 'reward_etb', event.target.value)}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
            <div className="root-promotion-form-actions">
              <button type="submit" disabled={coinLevelSaving || coinLevelRules.length !== 8}>
                {coinLevelSaving ? 'Saving and rewarding…' : 'Save level rules'}
              </button>
            </div>
          </form>
          <form className="root-promotion-form root-link-campaign-rules" onSubmit={saveLinkCampaignSettings}>
            <h3>Social link campaign prices and rewards</h3>
            <p className="root-promotion-muted">Set one campaign price per day. Each duration option is charged at its full day count (for example, 1–3 days is priced as 3 days). The prices below are calculated automatically, and each approved campaign keeps a snapshot of its reward settings.</p>
            <div className="root-link-campaign-price-grid">
              <label>Campaign price per day (ETB)
                <input
                  type="number"
                  min="0"
                  max="273972.60"
                  step="0.01"
                  required
                  value={linkCampaignSettings.pricePerDay}
                  onChange={event => changeLinkCampaignPricePerDay(event.target.value)}
                />
              </label>
              <div className="root-link-campaign-price-preview" aria-live="polite">
                <strong>Calculated duration prices</strong>
                {LINK_CAMPAIGN_TIERS.map(tier => (
                  <p key={`campaign-price-preview-${tier.id}`}>
                    <span>{tier.label}</span>
                    <span>ETB {linkCampaignTierPrice(linkCampaignSettings, tier).toFixed(2)}</span>
                  </p>
                ))}
              </div>
            </div>
            <div className="root-promotion-form-grid">
              <label>Viewer reward per qualified view (coins)
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  required
                  value={linkCampaignSettings.viewerCoins}
                  onChange={event => setLinkCampaignSettings(current => ({ ...current, viewerCoins: event.target.value }))}
                />
              </label>
              <label>Campaign owner reward per unique viewer (coins)
                <input
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  required
                  value={linkCampaignSettings.posterCoins}
                  onChange={event => setLinkCampaignSettings(current => ({ ...current, posterCoins: event.target.value }))}
                />
              </label>
              <label>Required active viewing time (seconds)
                <input
                  type="number"
                  min="1"
                  max="3600"
                  step="1"
                  required
                  value={linkCampaignSettings.viewSeconds}
                  onChange={event => setLinkCampaignSettings(current => ({ ...current, viewSeconds: event.target.value }))}
                />
              </label>
              <label>Viewer close-button delay (seconds)
                <input
                  type="number"
                  min="0"
                  max="300"
                  step="1"
                  required
                  value={linkCampaignSettings.closeDelaySeconds}
                  onChange={event => setLinkCampaignSettings(current => ({ ...current, closeDelaySeconds: event.target.value }))}
                />
              </label>
            </div>
            <div className="root-promotion-form-actions">
              <button type="submit" disabled={linkCampaignSaving}>
                {linkCampaignSaving ? 'Saving…' : 'Save link campaign rules'}
              </button>
            </div>
          </form>
          <form className="root-promotion-form root-daily-game-rules" onSubmit={saveDailyGameRewardSettings}>
            <h3>Daily Claim game rewards</h3>
            <p className="root-promotion-muted">Configure each game’s reward segments and the number of plays available in a rolling 24-hour window. Each segment has an equal chance. When a player uses the limit, the oldest play expires after 24 hours and one play becomes available again.</p>
            {Object.entries(DAILY_GAME_LABELS).map(([gameId, meta]) => {
              const game = dailyGameRewardSettings[gameId]
              if (!game) return null
              return (
                <fieldset className="root-daily-game-rule" key={gameId}>
                  <legend>{meta.icon} {meta.title}</legend>
                  <div className="root-daily-game-controls">
                    <label className="root-daily-game-enabled">
                      <input
                        type="checkbox"
                        checked={game.enabled}
                        onChange={event => changeDailyGameRule(gameId, 'enabled', event.target.checked)}
                      />
                      Game enabled
                    </label>
                    <label>Plays per 24 hours
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="1"
                        required
                        value={game.playsPer24Hours}
                        onChange={event => changeDailyGameRule(gameId, 'playsPer24Hours', event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="root-daily-game-segments">
                    {game.segments.map(segment => (
                      <div className="root-daily-game-segment" key={segment.id}>
                        <label>Segment label
                          <input
                            type="text"
                            maxLength="40"
                            required
                            value={segment.label}
                            onChange={event => changeDailyGameSegment(gameId, segment.id, 'label', event.target.value)}
                          />
                        </label>
                        <label>Coin reward
                          <input
                            type="number"
                            min="0"
                            max="1000000000"
                            step="1"
                            required
                            value={segment.coins}
                            onChange={event => changeDailyGameSegment(gameId, segment.id, 'coins', event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => removeDailyGameSegment(gameId, segment.id)}
                          disabled={game.segments.length <= 2}
                          aria-label={`Remove ${segment.label} from ${meta.title}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => addDailyGameSegment(gameId)}
                    disabled={game.segments.length >= 12}
                  >
                    + Add reward segment
                  </button>
                </fieldset>
              )
            })}
            <div className="root-promotion-form-actions">
              <button type="submit" disabled={dailyGameRewardSaving}>
                {dailyGameRewardSaving ? 'Saving…' : 'Save daily game reward rules'}
              </button>
            </div>
          </form>
          </>
        ) : <p className="root-promotion-muted">No account roles are available for reward configuration.</p>
      ) : activeTab === 'activity' ? (
        <section className="root-user-activity" aria-label="User activity">
          <div className="root-user-activity-heading">
            <div>
              <h3>User activity</h3>
              <p className="root-promotion-muted">Online status refreshes every 30 seconds. Online means the account sent a heartbeat in the last 90 seconds.</p>
            </div>
            <button type="button" className="secondary" onClick={() => loadUserActivity(userActivityPage)} disabled={userActivityLoading}>
              {userActivityLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {userActivityLoading && !userActivity.users.length ? <p className="root-promotion-muted">Loading user activity…</p> : userActivity.users.length ? (
            <>
              <div className="root-user-activity-table-wrap">
                <table className="root-user-activity-table">
                  <thead>
                    <tr><th>User</th><th>Role</th><th>Account</th><th>Coin level</th><th>Coins earned</th><th>Presence</th><th>Last login</th></tr>
                  </thead>
                  <tbody>
                    {userActivity.users.map(user => (
                      <tr key={user.id}>
                        <td><strong>{user.full_name || user.username || 'Unknown user'}</strong><small>{user.email || (user.username ? `@${user.username}` : `Account ${user.id}`)}</small></td>
                        <td>{user.role || '—'}</td>
                        <td>{user.is_active ? 'Active' : 'Disabled'}</td>
                        <td>{getCoinLevel(user.current_level)?.icon} {getCoinLevel(user.current_level)?.name || '—'} · {user.current_level || 0}</td>
                        <td>{Number(user.earned_coins || 0).toLocaleString()}</td>
                        <td><span className={`root-user-presence ${user.is_online ? 'online' : 'offline'}`}><i aria-hidden="true" />{user.is_online ? 'Online' : 'Offline'}</span></td>
                        <td>{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never logged in'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={userActivityPage} itemCount={userActivity.total} onPageChange={setUserActivityPage} label="user activity" />
            </>
          ) : !userActivityLoading ? <p className="root-promotion-muted">No user activity to show.</p> : null}
        </section>
      ) : activeTab === 'level-history' ? (
        <section className="root-user-activity" aria-label="Coin level reward history">
          <div className="root-user-activity-heading">
            <div>
              <h3>Coin level achievements and rewards</h3>
              <p className="root-promotion-muted">Every first-time level achievement, earned-coin total, and ETB bonus credited to the user’s bonus wallet.</p>
            </div>
            <button type="button" className="secondary" onClick={loadCoinLevelHistory} disabled={coinLevelHistoryLoading}>
              {coinLevelHistoryLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {coinLevelHistoryLoading && !coinLevelHistory.length ? <p className="root-promotion-muted">Loading level history…</p> : coinLevelHistory.length ? (
            <div className="root-user-activity-table-wrap">
              <table className="root-user-activity-table">
                <thead><tr><th>User</th><th>Achieved level</th><th>Coins earned</th><th>ETB bonus</th><th>Achieved at</th></tr></thead>
                <tbody>
                  {coinLevelHistory.map((entry, index) => {
                    const level = getCoinLevel(entry.level)
                    return (
                      <tr key={`${entry.user_id}-${entry.level}-${index}`}>
                        <td><strong>{entry.full_name}</strong><small>{entry.username ? `@${entry.username}` : `Account ${entry.user_id}`}</small></td>
                        <td>{level?.icon} {level?.name || 'Level'} · {entry.level}</td>
                        <td>{Number(entry.earned_coins).toLocaleString()}</td>
                        <td>ETB {Number(entry.reward_etb).toFixed(2)}</td>
                        <td>{new Date(`${entry.created_at}Z`).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : !coinLevelHistoryLoading ? <p className="root-promotion-muted">No level rewards have been achieved yet.</p> : null}
        </section>
      ) : loading ? <p className="root-promotion-muted">Loading…</p> : activeTab === 'promotions' ? (
        <>
          {editing !== null && (
            <form className="root-promotion-form" onSubmit={savePromotion}>
              <h3>{editing ? 'Edit promotion' : 'Create promotion'}</h3>
              <label>Title *
                <input required maxLength={160} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} />
              </label>
              <label>Message
                <textarea maxLength={1200} rows={4} value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} />
              </label>
              <div className="root-promotion-form-grid">
                <label>Banner image
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    try {
                      const imageData = await resizeImage(file)
                      setForm(current => ({ ...current, imageData }))
                      setError('')
                    } catch (imageError) {
                      setError(imageError.message)
                    } finally {
                      event.target.value = ''
                    }
                  }} />
                </label>
                <label>Optional voice promotion (audio)
                  <input type="file" accept="audio/*" onChange={async event => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    try {
                      const audioData = await readAudioFile(file)
                      setForm(current => ({ ...current, audioData }))
                      setError('')
                    } catch (audioError) {
                      setError(audioError.message)
                    } finally {
                      event.target.value = ''
                    }
                  }} />
                </label>
                <label>Background color
                  <input type="color" value={form.backgroundColor} onChange={event => setForm(current => ({ ...current, backgroundColor: event.target.value }))} />
                </label>
                <label>Button text
                  <input maxLength={60} value={form.buttonText} onChange={event => setForm(current => ({ ...current, buttonText: event.target.value }))} />
                </label>
                <label>Button / banner link
                  <input type="text" maxLength={500} value={form.buttonUrl} onChange={event => setForm(current => ({ ...current, buttonUrl: event.target.value }))} placeholder="https://… or an app page" />
                </label>
                <label>Connect a published product
                  <select
                    value={products.find(product => getProductLink(product) && getProductLink(product) === form.buttonUrl)?.id || ''}
                    onChange={event => {
                      const product = products.find(item => item.id === event.target.value)
                      setForm(current => ({
                        ...current,
                        buttonUrl: product ? getProductLink(product) : '',
                        buttonText: product && !current.buttonText ? 'View product' : current.buttonText,
                      }))
                    }}
                  >
                    <option value="">No linked product / use custom URL</option>
                    {products.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.title || product.name || 'Untitled product'} · {product.serviceKey}
                      </option>
                    ))}
                  </select>
                </label>
                <label>Audience / account status
                  <select value={form.audienceStatus} onChange={event => setForm(current => ({ ...current, audienceStatus: event.target.value }))}>
                    <option value="all">Everyone</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="guest">Guest</option><option value="user">Registered user</option><option value="other">Other status</option>
                  </select>
                </label>
                <label>Badge text
                  <input maxLength={60} value={form.badgeText} onChange={event => setForm(current => ({ ...current, badgeText: event.target.value }))} placeholder="e.g. Guest offer" />
                </label>
              </div>
              {form.audioData && (
                <div className="root-promotion-audio">
                  <audio controls preload="metadata" src={form.audioData}>Your browser cannot play this audio format.</audio>
                  <button type="button" className="secondary" onClick={() => setForm(current => ({ ...current, audioData: '' }))}>Remove audio</button>
                </div>
              )}
              <p className="root-promotion-muted">Audio plays in the public promotion popup when that popup option is enabled. Maximum file size: 6 MB; playback depends on browser format support.</p>
              <div className="root-promotion-preview" style={{ backgroundColor: form.backgroundColor }}>
                {form.imageData && <img src={form.imageData} alt="Promotion banner preview" />}
                <div><b>{form.badgeText || 'Promotion'}</b><strong>{form.title || 'Promotion title'}</strong><span>{form.message}</span></div>
              </div>
              <div className="root-promotion-checks">
                <label><input type="checkbox" checked={form.alertEnabled} onChange={event => setForm(current => ({ ...current, alertEnabled: event.target.checked }))} /> Show in notification alerts</label>
                <label><input type="checkbox" checked={form.pinned} onChange={event => setForm(current => ({ ...current, pinned: event.target.checked }))} /> Pin alert / show first</label>
                <label><input type="checkbox" checked={form.popupEnabled} onChange={event => setForm(current => ({ ...current, popupEnabled: event.target.checked }))} /> Show in the public popup when the webapp opens (required for audio playback)</label>
              </div>
              <div className="root-promotion-form-actions">
                <button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish promotion'}</button>
                <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(emptyForm()) }}>Cancel</button>
              </div>
            </form>
          )}
          <div className="root-promotion-list">
            {!promotions.length && <p className="root-promotion-muted">No promotions yet. Create one to add it to the homepage slider.</p>}
            {getPageItems(promotions, safePromotionPage).map(promotion => (
              <article className={`root-promotion-card ${promotion.is_hidden ? 'hidden' : ''}`} key={promotion.id}>
                {promotion.image_data && <img src={promotion.image_data} alt="" />}
                <div className="root-promotion-card-copy" style={{ borderLeftColor: promotion.background_color }}>
                  <div className="root-promotion-card-top"><span>{promotion.badge_text || 'Promotion'} · {promotion.audience_status}{promotion.popup_enabled ? ' · Popup' : ''}{promotion.audio_data ? ' · Audio' : ''}</span><b>{promotion.is_hidden ? 'Hidden' : 'Visible'}{promotion.pinned ? ' · Pinned' : ''}</b></div>
                  <h3>{promotion.title}</h3><p>{promotion.message}</p>
                  {promotion.button_text && <small>Button: {promotion.button_text}</small>}
                </div>
                <div className="root-promotion-card-actions">
                  <button type="button" onClick={() => startEdit(promotion)}>Edit</button>
                  <button type="button" onClick={() => toggleVisibility(promotion)}>{promotion.is_hidden ? 'Unhide' : 'Hide'}</button>
                  <button type="button" className="danger" onClick={() => deletePromotion(promotion)}>Delete</button>
                </div>
              </article>
            ))}
            <Pagination page={safePromotionPage} itemCount={promotions.length} onPageChange={setPromotionPage} label="promotions" />
          </div>
        </>
      ) : (
        <div className="root-boost-list">
          {!boostRequests.length && <p className="root-promotion-muted">No boost requests have been submitted.</p>}
          {getPageItems(boostRequests, safeBoostPage).map(request => (
            <article className="root-boost-card" key={request.request_id}>
              <div className="root-boost-card-heading">
                <strong>{request.product_name || 'Product link'} · {request.full_name || request.username || `Account ${request.user_id}`}</strong>
                <span className={`root-boost-status ${request.status}`}>{request.status}</span>
              </div>
              {request.content && <p>{request.content}</p>}
              {request.product_url && <a href={request.product_url} target="_blank" rel="noreferrer">{request.product_url}</a>}
              <p>Amount: <b>ETB {Number(request.amount).toLocaleString()}</b> · Payment method: <b>{request.payment_method || 'Not provided'}</b> · Reference: <b>{request.payment_reference}</b></p>
              {request.payment_proof && <details><summary>View payment proof</summary><img src={request.payment_proof} alt="Payment proof submitted by user" /></details>}
              <small>Submitted {new Date(request.created_at).toLocaleString()}</small>
              {request.status === 'pending' && <div className="root-boost-actions">
                <button type="button" onClick={() => updateBoost(request, 'approved')}>Approve &amp; boost</button>
                <button type="button" className="danger" onClick={() => updateBoost(request, 'rejected')}>Reject</button>
              </div>}
              {request.status === 'approved' && <div className="root-boost-actions"><button type="button" className="danger" onClick={() => updateBoost(request, 'unboosted')}>Unboost</button></div>}
            </article>
          ))}
          <Pagination page={safeBoostPage} itemCount={boostRequests.length} onPageChange={setBoostPage} label="boost requests" />
        </div>
      )}
    </section>
  )
}

export default RootPromotions
