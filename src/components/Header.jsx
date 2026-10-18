import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { clearCurrentUserPermissions } from '../utils/permissions'
import { usePermissions } from '../hooks/usePermissions'
import { useLanguage } from '../contexts/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { useSiteContent } from '../contexts/SiteContentContext'
import { isSiteMenuHidden } from '../utils/siteMenuVisibility'
import PromotionModal from './PromotionModal'
import GuestUpgradeModal from './GuestUpgradeModal'
import QrScannerModal from './QrScannerModal'
import LogoutConfirmationModal from './LogoutConfirmationModal'
import InstallAppModal from './InstallAppModal'
import NotificationBell from './NotificationBell'
import AgentWalletRequestModal from './AgentWalletRequestModal'
import ClaimGuideModal from './ClaimGuideModal'
import { authAPI, serviceBookingAPI, socialAPI } from '../services/api'
import { getCoinLevel } from '../utils/coinLevels'
import logoImage from '../logo/logo.png'
import {
  isGuestMode,
  getCurrentAccount,
  getAccountRole,
  getAccountAccessRole,
  getMyProfile,
  saveMyProfile,
} from '../utils/guestAccount'
import './Header.css'

const getProfileRole = () => {
  const accountMode = getAccountRole()
  if (accountMode === 'guest') return 'guest'

  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    return String(user.role || accountMode).trim().toLowerCase() || accountMode
  } catch (error) {
    console.error('Failed to read the profile role:', error)
    return accountMode
  }
}

const formatRoleLabel = (role) =>
  role.split(/[_\s-]+/).filter(Boolean).map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join(' ')

const COIN_GIFT_NOTICE_TTL = 24 * 60 * 60 * 1000

const getCoinGiftReceiverId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    return String(user.id || user._id || user.username || '')
  } catch (error) {
    console.error('Could not read the signed-in user for the coin gift notice:', error)
    return ''
  }
}

const parseCoinGiftNotices = value => {
  try {
    const valueList = JSON.parse(value || '[]')
    const notices = Array.isArray(valueList) ? valueList : [valueList]
    return notices.filter(notice => {
      if (!notice || typeof notice !== 'object' || !notice.id) return false
      const amount = Number(notice.amount)
      const receivedAt = Number(notice.receivedAt)
      return Number.isSafeInteger(amount) && amount > 0 &&
        Number.isFinite(receivedAt) &&
        receivedAt <= Date.now() &&
        Date.now() < receivedAt + COIN_GIFT_NOTICE_TTL
    }).map(notice => ({
      id: String(notice.id),
      sender: String(notice.sender || 'A friend'),
      amount: Number(notice.amount),
      bonus: Number.isSafeInteger(Number(notice.bonus)) && Number(notice.bonus) > 0 ? Number(notice.bonus) : 0,
      receivedAt: Number(notice.receivedAt),
    }))
  } catch (error) {
    console.error('Could not read the saved coin gift notice:', error)
    return []
  }
}

const SEARCHABLE_PAGES = [
  { labelKey: 'header.home', route: '/', menuKey: 'home', keywords: 'homepage main' },
  { labelKey: 'header.feed', route: '/feed', menuKey: 'feed', keywords: 'social posts' },
  { label: 'Wallet', route: '/wallet', menuKey: 'wallet', keywords: 'balance payments coins' },
  { label: 'Agent Portal', route: '/agent', menuKey: 'agent', keywords: 'agents dashboard' },
  { labelKey: 'header.dataCollect', route: '/data-collect', menuKey: 'data-collect', keywords: 'data collection collector' },
  { labelKey: 'header.fixedCommission', route: '/fixed-commission', menuKey: 'fixed-commission', permission: 'fixedCommission', keywords: 'commission fixed' },
  { labelKey: 'header.createPartnership', route: '/brokerage', menuKey: 'brokerage', keywords: 'brokerage partnership' },
  { label: 'Broker & House', route: '/broker-house', menuKey: 'broker-house', keywords: 'broker house property' },
  { label: 'Room Booking', route: '/room-booking', menuKey: 'room-booking', keywords: 'rooms reservation' },
  { label: 'Logistics', route: '/logistics', menuKey: 'logistics', keywords: 'transport delivery' },
  { labelKey: 'header.movableCommission', route: '/movable-commission', menuKey: 'movable-commission', keywords: 'big service movable commission' },
  { labelKey: 'header.utilityPayment', route: '/utility-payment', menuKey: 'utility-payment', keywords: 'electricity water bill' },
  { labelKey: 'header.serviceRequests', route: '/service-requests', menuKey: 'service-requests', keywords: 'requests bookings' },
  { labelKey: 'header.contact', route: '/contact', menuKey: 'contact', permission: 'contact', keywords: 'support help' },
]

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [siteSearch, setSiteSearch] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileSocialTab, setProfileSocialTab] = useState('followers')
  const [profileSocial, setProfileSocial] = useState({ following: [], followers: [] })
  const [profileSocialError, setProfileSocialError] = useState('')
  const [profileSocialLoading, setProfileSocialLoading] = useState(false)
  const [telegramLink, setTelegramLink] = useState({
    chatId: '',
    challengeId: '',
    code: '',
    linked: false,
    editing: true,
    loading: false,
    error: '',
    message: '',
  })
  const [showNotepadModal, setShowNotepadModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [showPromotionModal, setShowPromotionModal] = useState(false)
  const [showClaimGuide, setShowClaimGuide] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [showGuestUpgradeModal, setShowGuestUpgradeModal] = useState(false)
  const [showAgentWalletModal, setShowAgentWalletModal] = useState(false)
  const [supportTelegramUsername, setSupportTelegramUsername] = useState('')
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [accountMode, setAccountMode] = useState(() => getAccountRole()) // 'staff' | 'guest' | 'user'
  const [profileRole, setProfileRole] = useState(() => getProfileRole())
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installDialogStage, setInstallDialogStage] = useState(null)
  const [installError, setInstallError] = useState('')
  const [isAppInstalled, setIsAppInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  )
  const [coinGiftNotices, setCoinGiftNotices] = useState([])
  const [coinLevelNotices, setCoinLevelNotices] = useState([])
  const [coinLevelInfo, setCoinLevelInfo] = useState(null)
  const [readyDigitalProducts, setReadyDigitalProducts] = useState([])
  const coinGiftNoticesRef = useRef([])
  const location = useLocation()
  const navigate = useNavigate()
  const { language, toggleLanguage } = useLanguage()
  const { t } = useTranslation()
  const siteContent = useSiteContent()

  useEffect(() => {
    if (!profileOpen || !isLoggedIn || ['root', 'admin'].includes(profileRole)) return undefined
    let active = true
    let refreshing = false
    let loggedError = false
    const refreshCoinLevel = async () => {
      if (!active || refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        const response = await socialAPI.getCoinLevel()
        if (!response.success || !response.data) {
          throw new Error(response.message || 'The coin level response was invalid.')
        }
        if (active) {
          setCoinLevelInfo(response.data)
          loggedError = false
        }
      } catch (levelError) {
        if (active && !loggedError) {
          console.error('Could not load the current coin level:', levelError)
          loggedError = true
        }
      } finally {
        refreshing = false
      }
    }
    refreshCoinLevel()
    const timer = window.setInterval(refreshCoinLevel, 30000)
    document.addEventListener('visibilitychange', refreshCoinLevel)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshCoinLevel)
    }
  }, [profileOpen, isLoggedIn, accountMode, profileRole])

  useEffect(() => {
    if (!profileOpen || !isLoggedIn || ['root', 'admin'].includes(profileRole)) {
      setReadyDigitalProducts([])
      return undefined
    }
    let active = true
    let refreshing = false
    let loggedError = false
    const refreshDigitalProducts = async () => {
      if (!active || refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        const response = await serviceBookingAPI.getMyRequests()
        if (!response.success || !Array.isArray(response.data)) {
          throw new Error(response.message || 'Your approved digital products could not be loaded.')
        }
        const products = response.data
          .filter(request => request.digitalProductAvailable &&
            request.paymentStatus === 'approved' &&
            ['confirmed', 'approved'].includes(request.status))
          .slice(0, 3)
        if (active) {
          setReadyDigitalProducts(products)
          loggedError = false
        }
      } catch (productError) {
        if (active && !loggedError) {
          console.error('Could not load approved digital products:', productError)
          loggedError = true
        }
      } finally {
        refreshing = false
      }
    }
    refreshDigitalProducts()
    const timer = window.setInterval(refreshDigitalProducts, 30000)
    document.addEventListener('visibilitychange', refreshDigitalProducts)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshDigitalProducts)
    }
  }, [profileOpen, isLoggedIn, profileRole])

  useEffect(() => {
    if (!isLoggedIn || accountMode === 'guest' || localStorage.getItem('rootToken')) {
      coinGiftNoticesRef.current = []
      setCoinGiftNotices([])
      return undefined
    }

    const receiverId = getCoinGiftReceiverId()
    if (!receiverId) {
      coinGiftNoticesRef.current = []
      setCoinGiftNotices([])
      return undefined
    }
    const storageKey = `redsea:coin-gift-notices:${receiverId}`
    const loadNotice = () => {
      const notices = parseCoinGiftNotices(localStorage.getItem(storageKey))
      coinGiftNoticesRef.current = notices
      setCoinGiftNotices(notices)
      try {
        if (notices.length) localStorage.setItem(storageKey, JSON.stringify(notices))
        else localStorage.removeItem(storageKey)
      } catch (error) {
        console.error('Could not update stored coin gift reminders:', error)
      }
      return notices
    }
    const savedNotices = loadNotice()
    let expiryTimer
    const scheduleExpiry = notices => {
      window.clearTimeout(expiryTimer)
      if (!notices.length) return
      const nextExpiry = Math.min(...notices.map(notice => notice.receivedAt + COIN_GIFT_NOTICE_TTL))
      const remaining = nextExpiry - Date.now()
      expiryTimer = window.setTimeout(() => {
        const activeNotices = parseCoinGiftNotices(localStorage.getItem(storageKey))
        coinGiftNoticesRef.current = activeNotices
        setCoinGiftNotices(activeNotices)
        try {
          if (activeNotices.length) localStorage.setItem(storageKey, JSON.stringify(activeNotices))
          else localStorage.removeItem(storageKey)
        } catch (error) {
          console.error('Could not clear the expired coin gift notice:', error)
        }
        scheduleExpiry(activeNotices)
      }, Math.max(0, remaining))
    }
    scheduleExpiry(savedNotices)

    const handleGiftReceived = event => {
      const gift = event.detail
      if (!gift || !gift.id || String(gift.receiverId) !== receiverId) return
      const receivedAt = Number(gift.receivedAt)
      const amount = Number(gift.amount)
      const bonus = Number(gift.bonus)
      if (!Number.isFinite(receivedAt) || receivedAt > Date.now() ||
          Date.now() >= receivedAt + COIN_GIFT_NOTICE_TTL ||
          !Number.isSafeInteger(amount) || amount <= 0) return
      const notice = {
        id: String(gift.id),
        sender: String(gift.sender || 'A friend'),
        amount,
        bonus: Number.isSafeInteger(bonus) && bonus > 0 ? bonus : 0,
        receivedAt,
      }
      let nextNotices
      try {
        nextNotices = parseCoinGiftNotices(localStorage.getItem(storageKey))
        if (nextNotices.some(item => item.id === notice.id)) return
        nextNotices = [...nextNotices, notice]
        localStorage.setItem(storageKey, JSON.stringify(nextNotices))
      } catch (error) {
        console.error('Could not save the coin gift notice for 24 hours:', error)
        nextNotices = [...coinGiftNoticesRef.current.filter(item => item.id !== notice.id), notice]
      }
      coinGiftNoticesRef.current = nextNotices
      setCoinGiftNotices(nextNotices)
      scheduleExpiry(nextNotices)
    }
    const handleStorage = event => {
      if (event.key !== storageKey) return
      const notices = loadNotice()
      scheduleExpiry(notices)
    }
    window.addEventListener('redsea:coin-gift-received', handleGiftReceived)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.clearTimeout(expiryTimer)
      window.removeEventListener('redsea:coin-gift-received', handleGiftReceived)
      window.removeEventListener('storage', handleStorage)
    }
  }, [accountMode, isLoggedIn, location])

  useEffect(() => {
    if (!isLoggedIn || accountMode === 'guest' || localStorage.getItem('rootToken')) {
      setCoinLevelNotices([])
      return undefined
    }
    const userId = getCoinGiftReceiverId()
    if (!userId) {
      setCoinLevelNotices([])
      return undefined
    }
    const storageKey = `redsea:coin-level-reminders:${userId}`
    const readNotices = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
        const active = Array.isArray(stored) ? stored.filter(notice =>
          notice && typeof notice.id === 'string' &&
          Number.isFinite(notice.receivedAt) &&
          Number.isFinite(notice.rewardEtb) &&
          Date.now() < notice.receivedAt + COIN_GIFT_NOTICE_TTL
        ) : []
        setCoinLevelNotices(active)
        if (active.length) localStorage.setItem(storageKey, JSON.stringify(active))
        else localStorage.removeItem(storageKey)
      } catch (error) {
        console.error('Could not load coin level reward reminders:', error)
        setCoinLevelNotices([])
      }
    }
    readNotices()
    const onLevelReward = event => {
      if (String(event.detail?.userId) === String(userId)) readNotices()
    }
    const onStorage = event => {
      if (event.key === storageKey) readNotices()
    }
    const refresh = window.setInterval(readNotices, 30000)
    window.addEventListener('redsea:coin-level-reward', onLevelReward)
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(refresh)
      window.removeEventListener('redsea:coin-level-reward', onLevelReward)
      window.removeEventListener('storage', onStorage)
    }
  }, [accountMode, isLoggedIn, location])

  useEffect(() => {
    let active = true
    authAPI.getOtpConfig()
      .then(response => {
        if (active) setSupportTelegramUsername(String(response.data?.supportTelegramUsername || '').replace(/^@/, ''))
      })
      .catch(error => {
        if (active) console.error('Could not load Telegram support contact:', error)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!showProfileModal || !isLoggedIn || accountMode === 'guest') return undefined
    let active = true
    setTelegramLink(current => ({ ...current, loading: true, error: '', message: '' }))
    authAPI.getTelegramLinkStatus()
      .then(response => {
        if (active) {
          setTelegramLink(current => ({
            ...current,
            linked: response.data.linked,
            editing: !response.data.linked,
          }))
        }
      })
      .catch(error => {
        if (active) setTelegramLink(current => ({ ...current, error: error.message || 'Could not load Telegram link status.' }))
      })
      .finally(() => {
        if (active) setTelegramLink(current => ({ ...current, loading: false }))
      })
    return () => { active = false }
  }, [showProfileModal, isLoggedIn, accountMode])

  useEffect(() => {
    if (!showProfileModal || !isLoggedIn) return undefined
    let active = true
    setProfileSocialLoading(true)
    socialAPI.getFriends()
      .then(response => {
        if (active) {
          setProfileSocial(response.data)
          setProfileSocialError('')
        }
      })
      .catch(error => {
        if (active) setProfileSocialError(error.message || 'Could not load your followers.')
      })
      .finally(() => { if (active) setProfileSocialLoading(false) })
    return () => { active = false }
  }, [showProfileModal, isLoggedIn])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleAppInstalled = () => {
      setIsAppInstalled(true)
      setInstallPrompt(null)
      setInstallDialogStage(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Use permission polling hook (polls every 30 seconds)
  const { permissions, refreshPermissions } = usePermissions(isLoggedIn, 30000)

  const isMenuHiddenByRole = (menuKey, fallbackRoute = menuKey) => {
    return isSiteMenuHidden(siteContent?.accountAccessSettings, profileRole || getAccountAccessRole(), menuKey, fallbackRoute)
  }

  const canAccessMenu = (menuName) => {
    return permissions?.menus?.[menuName] === true
  }

  const normalizedSearch = siteSearch.trim().toLocaleLowerCase()
  const searchResults = normalizedSearch
    ? SEARCHABLE_PAGES.filter(page =>
      !isMenuHiddenByRole(page.menuKey, page.route) &&
      (!page.permission || canAccessMenu(page.permission)) &&
      `${page.labelKey ? t(page.labelKey) : page.label} ${page.keywords}`
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    ).slice(0, 6)
    : []

  const openSearchResult = (route) => {
    navigate(route)
    setSiteSearch('')
    setIsSearchOpen(false)
    setMenuOpen(false)
  }

  const handleSiteSearch = (event) => {
    event.preventDefault()
    if (searchResults.length) openSearchResult(searchResults[0].route)
    else setIsSearchOpen(true)
  }

  // Check login status and update user profile
  useEffect(() => {
    const authToken = localStorage.getItem('authToken')
    const userData = localStorage.getItem('userData')
    setIsLoggedIn(!!(authToken && userData))

    // Detect guest / user (self-service) account mode so we can hide internal
    // menus and show the upgrade button on the profile.
    setAccountMode(getAccountRole())
    setProfileRole(getProfileRole())

    // Update user profile from userData if available (never clobber the
    // picture or bio, which live only in the saved profile).
    if (userData) {
      try {
        const user = JSON.parse(userData)
        setUserProfile(prev => ({
          ...prev,
          username: user.username || prev.username,
          email: user.email || prev.email,
          fullName: user.full_name || user.fullName || prev.fullName,
          phone: user.phone || prev.phone,
          position: user.position || prev.position
        }))
      } catch (e) {
        console.error('Failed to parse userData:', e)
      }
    }
  }, [location])

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside the profile section
      const profileSection = document.querySelector('.profile-section')
      if (profileSection && !profileSection.contains(event.target)) {
        setProfileOpen(false)
      }
    }

    // Add event listener when profile is open
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [profileOpen])

  // User profile state
  const [userProfile, setUserProfile] = useState(() => {
    // Read the persisted profile first so an uploaded picture / bio survives
    // a reload and is never dropped when userData is re-merged below.
    let stored = {}
    try {
      const saved = localStorage.getItem('userProfile')
      stored = saved ? JSON.parse(saved) : {}
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {}
    } catch (e) {
      console.error('Failed to parse the saved profile:', e)
      stored = {}
    }

    const base = {
      username: stored.username || 'User',
      email: stored.email || 'user@redsea.com',
      fullName: stored.fullName || 'User Name',
      phone: stored.phone || '',
      position: stored.position || '',
      bio: stored.bio || '',
      profilePicture: stored.profilePicture || null,
    }

    // Then overlay the authoritative account fields from userData.
    const userData = localStorage.getItem('userData')
    if (userData) {
      try {
        const user = JSON.parse(userData)
        return {
          ...base,
          username: user.username || base.username,
          email: user.email || base.email,
          fullName: user.full_name || user.fullName || base.fullName,
          phone: user.phone || base.phone,
          position: user.position || base.position,
        }
      } catch (e) {
        console.error('Failed to parse userData:', e)
      }
    }

    return base
  })

  // Notepad state (session only)
  const [notepadContent, setNotepadContent] = useState('')

  // Inline feedback for the profile picture upload
  const [pictureNotice, setPictureNotice] = useState('')

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Save user profile to localStorage (session data only)
  useEffect(() => {
    // Guard the write: a picture that is still too big for the quota must not
    // throw out of the effect, which previously blanked the whole page.
    try {
      localStorage.setItem('userProfile', JSON.stringify(userProfile))
    } catch (storageError) {
      console.error('Could not save the profile to local storage:', storageError)
    }
  }, [userProfile])

  const isActive = (path) => location.pathname === path

  const handleInstallApp = () => {
    setMenuOpen(false)
    setInstallError('')
    setInstallDialogStage('confirm')
  }

  const handleConfirmInstall = async () => {
    if (!installPrompt) {
      setInstallDialogStage('instructions')
      return
    }

    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      if (choice.outcome === 'accepted') {
        setIsAppInstalled(true)
        setInstallDialogStage(null)
      } else {
        setInstallDialogStage('instructions')
      }
    } catch (error) {
      console.error('Could not start the REDSEA app installation:', error)
      setInstallError('Your browser could not start installation. Use the browser menu to add REDSEA to your Home Screen.')
    }
  }

  const handleLogout = () => {
    setProfileOpen(false)
    setShowLogoutConfirmation(true)
  }

  const confirmLogout = () => {
    // Clear all auth tokens and user data
    localStorage.removeItem('authToken')
    localStorage.removeItem('authApiBaseUrl')
    localStorage.removeItem('userData')
    localStorage.removeItem('userProfile')
    clearCurrentUserPermissions() // Clear permissions on logout
    setProfileOpen(false)
    // Redirect to login page
    navigate('/login')
  }

  const handleProfileClick = () => {
    setShowProfileModal(true)
    setProfileOpen(false)
  }

  const startTelegramLink = async () => {
    setTelegramLink(current => ({ ...current, loading: true, error: '', message: '' }))
    try {
      const response = await authAPI.startTelegramLink(telegramLink.chatId)
      setTelegramLink(current => ({
        ...current,
        challengeId: response.data.challengeId,
        code: '',
        message: response.message,
      }))
    } catch (error) {
      setTelegramLink(current => ({ ...current, error: error.message || 'Could not send a Telegram verification code.' }))
    } finally {
      setTelegramLink(current => ({ ...current, loading: false }))
    }
  }

  const verifyTelegramLink = async () => {
    setTelegramLink(current => ({ ...current, loading: true, error: '', message: '' }))
    try {
      const response = await authAPI.verifyTelegramLink(telegramLink.challengeId, telegramLink.code)
      setTelegramLink(current => ({
        ...current,
        challengeId: '',
        chatId: '',
        code: '',
        linked: true,
        editing: false,
        message: response.message,
      }))
    } catch (error) {
      setTelegramLink(current => ({ ...current, error: error.message || 'Could not verify the Telegram code.' }))
    } finally {
      setTelegramLink(current => ({ ...current, loading: false }))
    }
  }

  const handleNotepadClick = () => {
    setShowNotepadModal(true)
    setProfileOpen(false)
  }

  const handlePasswordClick = () => {
    setShowPasswordModal(true)
    setProfileOpen(false)
  }

  const handleProfileUpdate = async (e) => {
    e.preventDefault()

    // Persist the profile (picture + bio + details) for self-service accounts.
    // saveMyProfile writes userProfile and mirrors picture/bio onto the stored
    // account, and never throws even if the browser storage is full.
    const { saved } = saveMyProfile({
      username: userProfile.username,
      email: userProfile.email,
      fullName: userProfile.fullName,
      phone: userProfile.phone,
      position: userProfile.position,
      bio: userProfile.bio || '',
      profilePicture: userProfile.profilePicture || null,
    })
    if (!saved) {
      window.alert('⚠️ Your profile could not be saved to this browser (storage is full). Try a smaller picture.')
      return
    }
    setPictureNotice('')

    // Check if password change is requested
    if (passwordData.currentPassword || passwordData.newPassword || passwordData.confirmPassword) {
      if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
        alert('Please fill all password fields to change password')
        return
      }
      
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        alert('New passwords do not match!')
        return
      }
      
      if (passwordData.newPassword.length < 6) {
        alert('New password must be at least 6 characters long')
        return
      }
      
      try {
        // Get current user data
        const userData = JSON.parse(localStorage.getItem('userData') || '{}')
        const authToken = localStorage.getItem('authToken')
        
        if (!userData.id || !authToken) {
          alert('Please log in again to change your password')
          navigate('/login')
          return
        }
        
        // Call API to change password
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
        const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            current_password: passwordData.currentPassword,
            new_password: passwordData.newPassword
          })
        })
        
        const data = await response.json()
        
        if (data.success) {
          alert('✅ Password changed successfully!')
          setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
          alert('Profile updated successfully!')
          setShowProfileModal(false)
        } else {
          alert('❌ ' + (data.message || 'Failed to change password'))
        }
      } catch (error) {
        console.error('Password change error:', error)
        alert('❌ Failed to change password. Please try again.')
      }
    } else {
      alert('Profile updated successfully!')
      setShowProfileModal(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match!')
      return
    }
    
    if (passwordData.newPassword.length < 6) {
      alert('New password must be at least 6 characters long')
      return
    }
    
    try {
      // Get current user data
      const userData = JSON.parse(localStorage.getItem('userData') || '{}')
      const authToken = localStorage.getItem('authToken')
      
      if (!userData.id || !authToken) {
        alert('Please log in again to change your password')
        navigate('/login')
        return
      }
      
      // Call API to change password
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('✅ Password changed successfully!')
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
        setShowPasswordModal(false)
      } else {
        alert('❌ ' + (data.message || 'Failed to change password'))
      }
    } catch (error) {
      console.error('Password change error:', error)
      alert('❌ Failed to change password. Please try again.')
    }
  }

  const handleProfilePictureChange = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      window.alert('Please choose an image file.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      window.alert('That image is too large. Please choose one under 8 MB.')
      return
    }

    // Downscale + re-encode before storing. A full-size phone photo can be
    // several MB as base64 which blows the ~5 MB localStorage quota and used
    // to throw QuotaExceededError, crashing the render (blank page).
    const reader = new FileReader()
    reader.onerror = () => window.alert('Could not read that image. Please try another file.')
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => window.alert('That file is not a valid image.')
      image.onload = () => {
        const maxSize = 320
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          window.alert('Could not process that image on this device.')
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const compressed = canvas.toDataURL('image/jpeg', 0.72)
        saveMyProfile({ ...getMyProfile(), profilePicture: compressed })
        setUserProfile(prev => ({ ...prev, profilePicture: compressed }))
        setPictureNotice('Profile picture added. Press Update Profile to save it.')
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleDeleteProfile = () => {
    if (window.confirm('Are you sure you want to delete your profile?')) {
      localStorage.removeItem('userProfile')
      setUserProfile({
        username: 'User',
        email: 'user@redsea.com',
        fullName: 'User Name',
        phone: '',
        position: '',
        bio: '',
        profilePicture: null
      })
      setPictureNotice('')
      setShowProfileModal(false)
      alert('Profile deleted successfully!')
    }
  }

  const totalGiftCoins = coinGiftNotices.reduce((total, notice) => total + notice.amount + notice.bonus, 0)
  const giftHoursLeft = coinGiftNotices.length
    ? Math.max(1, Math.ceil((Math.min(
      ...coinGiftNotices.map(notice => notice.receivedAt + COIN_GIFT_NOTICE_TTL)
    ) - Date.now()) / (60 * 60 * 1000)))
    : 0
  const renderGiftNotice = className => (
    <button
      type="button"
      className={className}
      onClick={() => navigate('/wallet')}
      aria-label={`${coinGiftNotices.length} gifts totaling ${totalGiftCoins.toLocaleString()} coins. Open your wallet.`}
      title="This gift reminder stays here for 24 hours"
    >
      <span className="header-gift-box" aria-hidden="true">
        <span className="header-gift-box-lid">🎀</span>
        <span className="header-gift-box-base">🎁</span>
      </span>
      <span className="header-gift-amount">
        <strong>+{totalGiftCoins.toLocaleString()}</strong>
        <small>{coinGiftNotices.length} {coinGiftNotices.length === 1 ? 'gift' : 'gifts'} · {giftHoursLeft}h left</small>
      </span>
    </button>
  )
  const levelRewardTotal = coinLevelNotices.reduce((total, notice) => total + notice.rewardEtb, 0)
  const levelRewardHoursLeft = coinLevelNotices.length
    ? Math.max(1, Math.ceil((Math.min(
      ...coinLevelNotices.map(notice => notice.receivedAt + COIN_GIFT_NOTICE_TTL)
    ) - Date.now()) / (60 * 60 * 1000)))
    : 0
  const renderCoinLevelNotice = className => (
    <button
      type="button"
      className={`${className} header-level-notice`}
      onClick={() => navigate('/wallet')}
      aria-label={`Level rewards totaling ETB ${levelRewardTotal.toLocaleString()} credited to your wallet. Open your wallet.`}
      title="Level reward reminder stays here for 24 hours"
    >
      <span className="header-gift-box" aria-hidden="true">
        <span className="header-gift-box-base">🏆</span>
      </span>
      <span className="header-gift-amount">
        <strong>ETB {levelRewardTotal.toLocaleString()}</strong>
        <small>{coinLevelNotices.length} level {coinLevelNotices.length === 1 ? 'reward' : 'rewards'} · {levelRewardHoursLeft}h left</small>
      </span>
    </button>
  )

  return (
    <header className={`header ${menuOpen ? 'menu-open' : ''}`}>
      {showClaimGuide && <ClaimGuideModal onClose={() => setShowClaimGuide(false)} />}
      {showLogoutConfirmation && (
        <LogoutConfirmationModal
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={confirmLogout}
        />
      )}
      <div className="container header-content">
        <Link to="/" className="logo">
          <img className="logo-image" src={logoImage} alt="" />
          <div className="logo-text">
            <span className="logo-main">{siteContent.headerTitle}</span>
            <span className="logo-tagline">{siteContent.headerTagline}</span>
          </div>
        </Link>

        {!isMenuHiddenByRole('promotions') && (
          <button
            type="button"
            className="promo-trigger"
            onClick={() => setShowPromotionModal(true)}
            aria-label="Open promotions"
          >
            <span className="promo-trigger-icon">🎁</span>
            <span className="promo-trigger-text">
              <span className="promo-trigger-title">Promotions</span>
              <span className="promo-trigger-sub">View latest offers</span>
            </span>
          </button>
        )}
        <button
          type="button"
          className="claim-guide-trigger"
          onClick={() => setShowClaimGuide(true)}
          aria-label="How to earn and claim rewards"
          title="View reward steps, amounts and your claim status"
        >
          <span aria-hidden="true">ⓘ</span>
          <span className="claim-guide-trigger-label">How to earn &amp; claim</span>
        </button>
        {supportTelegramUsername && !isMenuHiddenByRole('telegram-support') && (
          <a
            className="header-telegram-support"
            href={`https://t.me/${encodeURIComponent(supportTelegramUsername)}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Contact support on Telegram"
          >
            <span aria-hidden="true">✈️</span>
            <span>Telegram Support</span>
          </a>
        )}

        <button 
          type="button"
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`nav ${menuOpen ? 'nav-open' : ''}`}>
          {!isMenuHiddenByRole('home', '/') && (
            <Link
              to="/"
              className={isActive('/') ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {t('header.home')}
            </Link>
          )}
          {!isMenuHiddenByRole('data-collect', '/data-collect') && (
            <Link 
              to="/data-collect" 
              className={isActive('/data-collect') ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {t('header.dataCollect')}
            </Link>
          )}
          {canAccessMenu('fixedCommission') && !isMenuHiddenByRole('fixed-commission', '/fixed-commission') && (
            <Link
              to="/fixed-commission"
              className={isActive('/fixed-commission') ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              🏢 {t('header.fixedCommission')}
            </Link>
          )}
          {!isMenuHiddenByRole('brokerage', '/brokerage') && (
            <Link 
              to="/brokerage" 
              className={isActive('/brokerage') ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {t('header.createPartnership')}
            </Link>
          )}
          {!isMenuHiddenByRole('broker-house', '/broker-house') && (
            <Link to="/broker-house" className={isActive('/broker-house') ? 'active' : ''} onClick={() => setMenuOpen(false)}>
              🏠 Broker &amp; House
            </Link>
          )}
          {!isMenuHiddenByRole('room-booking', '/room-booking') && (
            <Link to="/room-booking" className={isActive('/room-booking') ? 'active' : ''} onClick={() => setMenuOpen(false)}>
              🛏️ Room Booking
            </Link>
          )}
          {!isMenuHiddenByRole('logistics', '/logistics') && (
            <Link to="/logistics" className={isActive('/logistics') ? 'active' : ''} onClick={() => setMenuOpen(false)}>
              🚗 Logistics
            </Link>
          )}
          {!isMenuHiddenByRole('movable-commission', '/movable-commission') && (
            <Link to="/movable-commission" className={isActive('/movable-commission') ? 'active' : ''} onClick={() => setMenuOpen(false)}>
              📦 Big Service
            </Link>
          )}
          {!isMenuHiddenByRole('utility-payment', '/utility-payment') && (
            <Link to="/utility-payment" className={isActive('/utility-payment') ? 'active' : ''} onClick={() => setMenuOpen(false)}>
              ⚡ {t('header.utilityPayment')}
            </Link>
          )}
          {canAccessMenu('contact') && !isMenuHiddenByRole('contact', '/contact') && (
            <Link
              to="/contact"
              className={isActive('/contact') ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {t('header.contact')}
            </Link>
          )}
          {!isMenuHiddenByRole('qr-scanner') && (
            <button
              type="button"
              className="qr-scanner-trigger"
              onClick={() => { setMenuOpen(false); setShowQrScanner(true) }}
            >
              <span aria-hidden="true">▦</span> QR Scan
            </button>
          )}
          {(coinGiftNotices.length > 0 || coinLevelNotices.length > 0 || (!isAppInstalled && !isMenuHiddenByRole('install-app'))) && (
            <div className="nav-install-group">
              {coinGiftNotices.length > 0 && (
                renderGiftNotice('header-gift-notice')
              )}
              {coinLevelNotices.length > 0 && renderCoinLevelNotice('header-gift-notice')}
              {!isAppInstalled && !isMenuHiddenByRole('install-app') && (
                <button type="button" className="install-app-button" onClick={handleInstallApp}>
                  {siteContent.installAppButtonText}
                </button>
              )}
            </div>
          )}
        </nav>

        <form
          className="header-search"
          role="search"
          onSubmit={handleSiteSearch}
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsSearchOpen(false)
          }}
        >
          <div className="header-search-control">
            <input
              type="search"
              value={siteSearch}
              onChange={event => {
                setSiteSearch(event.target.value)
                setIsSearchOpen(true)
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={event => {
                if (event.key === 'Escape') setIsSearchOpen(false)
              }}
              placeholder={t('header.searchPlaceholder')}
              aria-label={t('header.searchAriaLabel')}
              aria-autocomplete="list"
              aria-expanded={isSearchOpen && Boolean(normalizedSearch)}
            />
            <button type="submit" aria-label={t('common.search')}>
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <circle cx="10.8" cy="10.8" r="6.3" />
                <path d="m15.4 15.4 4.2 4.2" />
              </svg>
            </button>
          </div>
          {isSearchOpen && normalizedSearch && (
            <div className="header-search-results" role="listbox" aria-label={t('header.searchResultsAriaLabel')}>
              {searchResults.length ? searchResults.map(page => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={page.route}
                  onClick={() => openSearchResult(page.route)}
                >
                  {page.labelKey ? t(page.labelKey) : page.label}
                </button>
              )) : (
                <p>{t('header.noSearchResults')}</p>
              )}
            </div>
          )}
        </form>

        {(coinGiftNotices.length > 0 || coinLevelNotices.length > 0) && (
          <div className="header-gift-mobile-notices">
            {coinGiftNotices.length > 0 && renderGiftNotice('header-gift-notice header-gift-mobile')}
            {coinLevelNotices.length > 0 && renderCoinLevelNotice('header-gift-notice header-gift-mobile')}
          </div>
        )}

        {/* Profile Icon with Dropdown or Login Button */}
        {isLoggedIn ? (
          <div className="profile-section">
            {/* Self-service notification bell (guest / user accounts only) */}
            <NotificationBell />
            
            <button 
              className="profile-icon-btn"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Profile menu"
              aria-expanded={profileOpen}
            >
              {userProfile.profilePicture ? (
                <img 
                  src={userProfile.profilePicture} 
                  alt="Profile" 
                  className="profile-icon-img"
                />
              ) : (
                <span className="profile-icon">👤</span>
              )}
            </button>
            
            {profileOpen && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-header">
                <span className="profile-avatar">
                  {userProfile.profilePicture ? (
                    <img src={userProfile.profilePicture} alt="Profile" className="profile-avatar-img" />
                  ) : (
                    '👤'
                  )}
                </span>
                <div className="profile-info">
                  <span className="profile-name">{userProfile.fullName || userProfile.username}</span>
                  <span className="profile-email">{userProfile.email}</span>
                  <span className={`profile-role-badge ${accountMode}`}>
                    {accountMode === 'guest' ? '👤 ' : accountMode === 'user' ? '✅ ' : '🛡️ '}
                    {formatRoleLabel(profileRole)} Account
                  </span>
                  {coinLevelInfo && (() => {
                    const currentLevel = getCoinLevel(coinLevelInfo.currentLevel)
                    const nextLevel = getCoinLevel(coinLevelInfo.nextLevel)
                    const earned = Number(coinLevelInfo.earnedCoins || 0)
                    const remaining = coinLevelInfo.nextThreshold == null
                      ? 0
                      : Math.max(0, Number(coinLevelInfo.nextThreshold) - earned)
                    const nextRewardEtb = Number(coinLevelInfo.rules?.find(rule =>
                      Number(rule.level) === Number(coinLevelInfo.nextLevel)
                    )?.reward_etb || 0)
                    const progressRange = Number(coinLevelInfo.nextThreshold) - Number(coinLevelInfo.currentThreshold)
                    const progress = coinLevelInfo.nextThreshold == null
                      ? 100
                      : progressRange > 0
                        ? Math.min(100, Math.max(0, ((earned - Number(coinLevelInfo.currentThreshold)) / progressRange) * 100))
                        : 0
                    return (
                      <div className="profile-level-card" aria-label={`Coin level ${coinLevelInfo.currentLevel}`}>
                        <div className="profile-level-summary">
                          <strong>{currentLevel?.icon} {currentLevel?.name || 'Level'} · Level {coinLevelInfo.currentLevel}</strong>
                          <span>ETB {Number(coinLevelInfo.totalRewardEtb || 0).toFixed(2)} rewards</span>
                        </div>
                        <small>
                          {nextLevel
                            ? `Next: ${nextLevel.icon} ${nextLevel.name} · Level ${nextLevel.level} — ${remaining.toLocaleString()} more coins`
                            : 'Highest coin level reached'}
                        </small>
                        {nextLevel && (
                          <small className="profile-level-next-reward">
                            Reach {Number(coinLevelInfo.nextThreshold).toLocaleString()} earned coins · ETB {nextRewardEtb.toFixed(2)} next-level reward
                          </small>
                        )}
                        <progress max="100" value={progress} aria-label="Progress to next coin level" />
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div className="profile-dropdown-divider"></div>
              <button
                type="button"
                className="profile-dropdown-item profile-language-item"
                onClick={toggleLanguage}
                aria-label={language === 'en' ? 'Switch to Amharic' : 'Switch to English'}
              >
                <span className="dropdown-icon">🌐</span>
                <span>{language === 'en' ? 'Language · አማርኛ' : 'ቋንቋ · English'}</span>
              </button>
              <div className="profile-dropdown-divider"></div>
              {accountMode === 'guest' && (
                <button
                  className="profile-dropdown-item upgrade-account-item"
                  onClick={() => { setProfileOpen(false); setShowGuestUpgradeModal(true) }}
                >
                  <span className="dropdown-icon">⬆️</span>
                  <span>Upgrade Account</span>
                </button>
              )}
              {accountMode === 'user' && (
                <div className="profile-dropdown-item upgraded-account-item">
                  <span className="dropdown-icon">✅</span>
                  <span>Account Upgraded</span>
                </div>
              )}
              <Link
                to="/wallet"
                className="profile-dropdown-item"
                onClick={() => setProfileOpen(false)}
              >
                <span className="dropdown-icon">💰</span>
                <span>My wallet</span>
              </Link>
              {isLoggedIn && !['agent', 'root', 'admin'].includes(profileRole) && (
                <button
                  type="button"
                  className="profile-dropdown-item"
                  onClick={() => {
                    setProfileOpen(false)
                    setShowAgentWalletModal(true)
                  }}
                >
                  <span className="dropdown-icon">🏦</span>
                  <span>Agent deposit / withdrawal</span>
                </button>
              )}
              {profileRole === 'agent' && !isMenuHiddenByRole('agent', '/agent') && (
                <Link
                  to="/agent"
                  className="profile-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <span className="dropdown-icon">🧑‍💼</span>
                  <span>Agent workspace</span>
                </Link>
              )}
              {['root', 'admin'].includes(profileRole) && !isMenuHiddenByRole('agent-management', '/agent-management') && (
                <Link
                  to="/agent-management"
                  className="profile-dropdown-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <span className="dropdown-icon">🧑‍💼</span>
                  <span>Agent list</span>
                </Link>
              )}
              <button 
                className="profile-dropdown-item"
                onClick={handleProfileClick}
              >
                <span className="dropdown-icon">👤</span>
                <span>{t('header.myProfile')}</span>
              </button>
              <button 
                className="profile-dropdown-item"
                onClick={handleNotepadClick}
              >
                <span className="dropdown-icon">📝</span>
                <span>{t('header.notepad')}</span>
              </button>
              <button 
                className="profile-dropdown-item"
                onClick={handlePasswordClick}
              >
                <span className="dropdown-icon">🔒</span>
                <span>{t('header.changePassword')}</span>
              </button>
              <div className="profile-dropdown-divider"></div>
              <Link
                to="/service-requests?tab=requests"
                className="profile-dropdown-item"
                onClick={() => setProfileOpen(false)}
              >
                <span className="dropdown-icon">🧾</span>
                <span>Service Requests</span>
              </Link>
              <Link
                to="/service-requests?tab=approved"
                className="profile-dropdown-item"
                onClick={() => setProfileOpen(false)}
              >
                <span className="dropdown-icon">✅</span>
                <span>Approved Payments</span>
              </Link>
              <Link
                to="/service-requests?tab=booked"
                className="profile-dropdown-item"
                onClick={() => setProfileOpen(false)}
              >
                <span className="dropdown-icon">📅</span>
                <span>Booked Services</span>
              </Link>
              {readyDigitalProducts.length > 0 && (
                <section className="profile-digital-products" aria-label="Approved digital products ready to open">
                  <div className="profile-digital-products-heading">
                    <span>Digital products ready</span>
                    <b>{readyDigitalProducts.length}</b>
                  </div>
                  {readyDigitalProducts.map(request => (
                    <Link
                      key={request.requestId}
                      to={`/service-requests?tab=booked&open=${encodeURIComponent(request.requestId)}`}
                      className="profile-digital-product-card"
                      onClick={() => setProfileOpen(false)}
                    >
                      <span className="profile-digital-product-icon" aria-hidden="true">📦</span>
                      <span className="profile-digital-product-copy">
                        <strong>{request.itemName || 'Digital product'}</strong>
                        <small>Payment approved · open or download</small>
                      </span>
                      <span className="profile-digital-product-arrow" aria-hidden="true">›</span>
                    </Link>
                  ))}
                </section>
              )}
              <div className="profile-dropdown-divider"></div>
              <button 
                className="profile-dropdown-item logout-btn"
                onClick={handleLogout}
              >
                <span className="dropdown-icon">🚪</span>
                <span>{t('header.logout')}</span>
              </button>
            </div>
          )}
        </div>
        ) : (
          <div className="auth-buttons">
            <button
              className="language-toggle"
              onClick={toggleLanguage}
              title={language === 'en' ? 'Switch to Amharic' : 'Switch to English'}
              aria-label="Toggle language"
            >
              <span className="lang-text">{language === 'en' ? 'ኢንግሊዝ' : 'EN'}</span>
            </button>
            
            <Link to="/login" className="btn-login">
              <span>🔐</span>
              <span>{t('header.login')}</span>
            </Link>
            <Link to="/register" className="btn-register">
              <span>📝</span>
              <span>{t('header.register')}</span>
            </Link>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content profile-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👤 My Profile</h2>
              <button className="modal-close" onClick={() => setShowProfileModal(false)}>✕</button>
            </div>

            {isLoggedIn && (
              <section className="profile-social-section" aria-label="Followers and following">
                <div className="profile-social-tabs">
                  <button type="button" className={profileSocialTab === 'followers' ? 'active' : ''} onClick={() => setProfileSocialTab('followers')}>
                    Followers ({profileSocial.followers.length})
                  </button>
                  <button type="button" className={profileSocialTab === 'following' ? 'active' : ''} onClick={() => setProfileSocialTab('following')}>
                    Following ({profileSocial.following.length})
                  </button>
                </div>
                {profileSocialLoading && <p className="profile-social-empty">Loading…</p>}
                {profileSocialError && <p className="profile-social-error" role="status">{profileSocialError}</p>}
                {!profileSocialLoading && !profileSocialError && (
                  <div className="profile-social-list">
                    {profileSocial[profileSocialTab].length
                      ? profileSocial[profileSocialTab].map(person => (
                        <div className="profile-social-person" key={person.user_id}>
                          <span className="profile-social-avatar">{(person.full_name || person.username || '?').slice(0, 1).toUpperCase()}</span>
                          <span><strong>{person.full_name || person.username}</strong><small>@{person.username}</small></span>
                        </div>
                      ))
                      : <p className="profile-social-empty">No {profileSocialTab} yet.</p>}
                  </div>
                )}
              </section>
            )}
            
            <form onSubmit={handleProfileUpdate} className="profile-form">
              <div className="profile-picture-section">
                <div className="profile-picture-preview">
                  {userProfile.profilePicture ? (
                    <img src={userProfile.profilePicture} alt="Profile" className="profile-pic-large" />
                  ) : (
                    <span className="profile-pic-placeholder">👤</span>
                  )}
                </div>
                <span className={`profile-role-badge profile-modal-role-badge ${accountMode}`}>
                  Role: {formatRoleLabel(profileRole)}
                </span>
                <div className="profile-picture-actions">
                  <label htmlFor="profilePicture" className="btn-upload-pic">
                    📷 Upload Picture
                  </label>
                  <input
                    type="file"
                    id="profilePicture"
                    accept="image/*"
                    onChange={handleProfilePictureChange}
                    style={{ display: 'none' }}
                  />
                  {userProfile.profilePicture && (
                    <button
                      type="button"
                      className="btn-remove-pic"
                      onClick={() => setUserProfile({ ...userProfile, profilePicture: null })}
                    >
                      🗑️ Remove
                    </button>
                  )}
                </div>
                {pictureNotice && <p className="profile-picture-notice" role="status">{pictureNotice}</p>}
                <p className="profile-picture-hint">
                  Pictures are automatically resized so they save safely in this browser.
                </p>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="username">Username *</label>
                  <input
                    type="text"
                    id="username"
                    value={userProfile.username}
                    onChange={(e) => setUserProfile({ ...userProfile, username: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="fullName">Full Name</label>
                  <input
                    type="text"
                    id="fullName"
                    value={userProfile.fullName}
                    onChange={(e) => setUserProfile({ ...userProfile, fullName: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    value={userProfile.email}
                    onChange={(e) => setUserProfile({ ...userProfile, email: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    value={userProfile.phone}
                    onChange={(e) => setUserProfile({ ...userProfile, phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="position">Position</label>
                  <input
                    type="text"
                    id="position"
                    value={userProfile.position}
                    onChange={(e) => setUserProfile({ ...userProfile, position: e.target.value })}
                  />
                </div>
              </div>

              {/* Bio Section */}
              <div className="profile-bio-section">
                <label htmlFor="bio">
                  <span className="profile-bio-title">📝 Bio</span>
                  <small>Tell others about yourself. Shown on your profile.</small>
                </label>
                <textarea
                  id="bio"
                  className="profile-bio-input"
                  rows={4}
                  maxLength={500}
                  value={userProfile.bio || ''}
                  placeholder="e.g. Broker at Red Sea Property — 5 years experience in Addis Ababa real estate."
                  onChange={(e) => setUserProfile({ ...userProfile, bio: e.target.value })}
                />
                <small className="profile-bio-count">{(userProfile.bio || '').length}/500</small>
              </div>

              {isLoggedIn && accountMode !== 'guest' && (
                <section className="telegram-link-section" aria-labelledby="telegramLinkTitle">
                  <h3 id="telegramLinkTitle">Telegram OTP sign-in</h3>
                  {telegramLink.error && <p className="telegram-link-error" role="alert">{telegramLink.error}</p>}
                  {telegramLink.message && <p className="telegram-link-message" role="status">{telegramLink.message}</p>}
                  {telegramLink.loading && <p role="status">Checking Telegram link...</p>}
                  {telegramLink.linked && !telegramLink.editing ? (
                    <div className="telegram-link-controls">
                      <p>Your Telegram chat is verified and can receive login codes.</p>
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => setTelegramLink(current => ({ ...current, editing: true, message: '', error: '' }))}
                      >
                        Change Telegram chat
                      </button>
                    </div>
                  ) : (
                    <div className="telegram-link-controls">
                      <p>Start the configured REDSEA bot, then enter your private chat ID. We will send a verification code before linking it to your account.</p>
                      <label htmlFor="telegramLinkChatId">Telegram private chat ID</label>
                      <input
                        id="telegramLinkChatId"
                        inputMode="numeric"
                        value={telegramLink.chatId}
                        onChange={event => setTelegramLink(current => ({
                          ...current,
                          chatId: event.target.value,
                          error: '',
                          message: '',
                        }))}
                        placeholder="Your numeric Telegram chat ID"
                        disabled={telegramLink.loading || Boolean(telegramLink.challengeId)}
                      />
                      {telegramLink.challengeId && (
                        <>
                          <label htmlFor="telegramLinkCode">6-digit Telegram verification code</label>
                          <input
                            id="telegramLinkCode"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            value={telegramLink.code}
                            onChange={event => setTelegramLink(current => ({ ...current, code: event.target.value, error: '' }))}
                            disabled={telegramLink.loading}
                          />
                        </>
                      )}
                      <div className="telegram-link-actions">
                        <button
                          type="button"
                          className="btn-submit"
                          onClick={telegramLink.challengeId ? verifyTelegramLink : startTelegramLink}
                          disabled={telegramLink.loading || (telegramLink.challengeId ? !/^\d{6}$/.test(telegramLink.code) : !telegramLink.chatId.trim())}
                        >
                          {telegramLink.loading ? 'Please wait...' : telegramLink.challengeId ? 'Verify and link' : 'Send verification code'}
                        </button>
                        {telegramLink.challengeId && (
                          <button
                            type="button"
                            className="btn-cancel"
                            onClick={() => setTelegramLink(current => ({ ...current, challengeId: '', code: '', message: '', error: '' }))}
                            disabled={telegramLink.loading}
                          >
                            Change chat ID
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Password Change Section */}
              <div className="password-change-section" style={{ marginTop: '24px', paddingTop: '24px', borderTop: '2px solid #e0e0e0' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: '#333' }}>🔒 Change Password</h3>
                
                <div className="form-group">
                  <label htmlFor="currentPasswordProfile">Current Password</label>
                  <input
                    type="password"
                    id="currentPasswordProfile"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="newPasswordProfile">New Password</label>
                    <input
                      type="password"
                      id="newPasswordProfile"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      placeholder="Enter new password"
                      minLength="6"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirmPasswordProfile">Confirm Password</label>
                    <input
                      type="password"
                      id="confirmPasswordProfile"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      placeholder="Confirm new password"
                      minLength="6"
                    />
                  </div>
                </div>

                {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                  <p style={{ color: '#c62828', fontSize: '0.85rem', marginTop: '8px' }}>
                    ⚠️ Passwords do not match
                  </p>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-delete" onClick={handleDeleteProfile}>
                  🗑️ Delete Profile
                </button>
                <div className="modal-actions-right">
                  <button type="button" className="btn-cancel" onClick={() => setShowProfileModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit">
                    ✓ Update Profile
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notepad Modal */}
      {showNotepadModal && (
        <div className="modal-overlay" onClick={() => setShowNotepadModal(false)}>
          <div className="modal-content notepad-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📝 My Notepad</h2>
              <button className="modal-close" onClick={() => setShowNotepadModal(false)}>✕</button>
            </div>
            
            <div className="notepad-container">
              <textarea
                className="notepad-textarea"
                value={notepadContent}
                onChange={(e) => setNotepadContent(e.target.value)}
                placeholder="Write your notes here..."
              />
            </div>

            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-clear" 
                onClick={() => {
                  if (window.confirm('Clear all notes?')) {
                    setNotepadContent('')
                  }
                }}
              >
                🗑️ Clear All
              </button>
              <button type="button" className="btn-submit" onClick={() => setShowNotepadModal(false)}>
                ✓ Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content password-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔒 Change Password</h2>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handlePasswordChange} className="password-form">
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password *</label>
                <input
                  type="password"
                  id="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password *</label>
                <input
                  type="password"
                  id="newPassword"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  required
                  minLength="6"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password *</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  required
                  minLength="6"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  🔒 Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPromotionModal && <PromotionModal onClose={() => setShowPromotionModal(false)} />}
      {showGuestUpgradeModal && <GuestUpgradeModal onClose={() => setShowGuestUpgradeModal(false)} />}
      {showAgentWalletModal && <AgentWalletRequestModal onClose={() => setShowAgentWalletModal(false)} />}
      {showQrScanner && <QrScannerModal onClose={() => setShowQrScanner(false)} />}
      {installDialogStage && (
        <InstallAppModal
          stage={installDialogStage}
          hasNativePrompt={Boolean(installPrompt)}
          error={installError}
          onClose={() => setInstallDialogStage(null)}
          onConfirm={handleConfirmInstall}
        />
      )}
    </header>
  )
}

export default Header
