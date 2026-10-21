import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import SocialPopups from './SocialPopups'
import { socialAPI } from '../services/api'
import { getAccountAccessRole } from '../utils/guestAccount'
import { getLiveChatToken } from '../utils/liveChatIdentity'
import { useSiteContent } from '../contexts/SiteContentContext'
import { isSiteMenuHidden } from '../utils/siteMenuVisibility'
import { playAppSound, unlockAppSounds } from '../utils/appSounds'
import './SecondHeaderBar.css'

function SecondHeaderBar() {
  const siteContent = useSiteContent()
  const [activePopup, setActivePopup] = useState(null)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const lastUnreadCounts = useRef({ notifications: null, messages: null })
  const [accountBadge, setAccountBadge] = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem('userData') || '{}')
      const profile = JSON.parse(localStorage.getItem('userProfile') || '{}')
      const paymentStatus = String(user.payment_status || user.paymentStatus || (user.is_paid === true ? 'paid' : user.is_paid === false ? 'unpaid' : '') || profile.paymentStatus || '').toLowerCase()
      return {
        role: getAccountAccessRole(),
        status: ['paid', 'unpaid', 'other'].includes(paymentStatus) ? paymentStatus : '',
        picture: profile.profilePicture || '',
        isLoggedIn: Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData')),
      }
    } catch {
      return {
        role: getAccountAccessRole(),
        status: '',
        picture: '',
        isLoggedIn: Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData')),
      }
    }
  })
  const isMenuVisible = (menuId, fallbackRoute = menuId) =>
    !isSiteMenuHidden(siteContent?.accountAccessSettings, accountBadge.role, menuId, fallbackRoute)

  useEffect(() => {
    const unlock = () => unlockAppSounds()
    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!getLiveChatToken()) return undefined
    let active = true
    let loading = false
    let loadFailed = false
    const loadUnread = async () => {
      if (!active || loading || document.visibilityState !== 'visible') return
      loading = true
      try {
        const response = await socialAPI.getSocialUnreadCounts()
        if (active) {
          const nextNotifications = Number(response.data?.notifications)
          const nextMessages = Number(response.data?.messages)
          if (
            !Number.isSafeInteger(nextNotifications) || nextNotifications < 0 ||
            !Number.isSafeInteger(nextMessages) || nextMessages < 0
          ) throw new Error('The social unread-count response was invalid.')
          loadFailed = false
          if (lastUnreadCounts.current.notifications !== null && nextNotifications > lastUnreadCounts.current.notifications) {
            playAppSound('notification')
          }
          if (lastUnreadCounts.current.messages !== null && nextMessages > lastUnreadCounts.current.messages) {
            playAppSound('message')
          }
          lastUnreadCounts.current = { notifications: nextNotifications, messages: nextMessages }
          setUnreadNotifications(nextNotifications)
          setUnreadMessages(nextMessages)
        }
      } catch (error) {
        if (!loadFailed) console.error('Could not refresh social notification count:', error)
        loadFailed = true
      } finally {
        loading = false
      }
    }
    loadUnread()
    const interval = window.setInterval(loadUnread, 500)
    document.addEventListener('visibilitychange', loadUnread)
    window.addEventListener('redsea:social-updated', loadUnread)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', loadUnread)
      window.removeEventListener('redsea:social-updated', loadUnread)
    }
  }, [])

  useEffect(() => {
    if (!getLiveChatToken()) return undefined
    let active = true
    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return
      socialAPI.updatePresence().catch(error => {
        if (active) console.error('Could not update account online status:', error)
      })
    }
    heartbeat()
    const interval = window.setInterval(heartbeat, 30000)
    document.addEventListener('visibilitychange', heartbeat)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', heartbeat)
    }
  }, [])

  useEffect(() => {
    const refreshBadge = () => {
      try {
        const user = JSON.parse(localStorage.getItem('userData') || '{}')
        const profile = JSON.parse(localStorage.getItem('userProfile') || '{}')
        const paymentStatus = String(user.payment_status || user.paymentStatus || (user.is_paid === true ? 'paid' : user.is_paid === false ? 'unpaid' : '') || profile.paymentStatus || '').toLowerCase()
        setAccountBadge({
          role: getAccountAccessRole(),
          status: ['paid', 'unpaid', 'other'].includes(paymentStatus) ? paymentStatus : '',
          picture: profile.profilePicture || '',
          isLoggedIn: Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData')),
        })
      } catch (error) {
        console.error('Could not refresh the account status badge:', error)
      }
    }
    window.addEventListener('storage', refreshBadge)
    window.addEventListener('redsea:account-updated', refreshBadge)
    const interval = window.setInterval(refreshBadge, 500)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('storage', refreshBadge)
      window.removeEventListener('redsea:account-updated', refreshBadge)
    }
  }, [])

  return (
    <>
      <nav className="second-header-bar" aria-label="Quick actions">
        {accountBadge.role !== 'staff' && (
          <span className={`shb-account-badge ${accountBadge.status || accountBadge.role}`} aria-label={`Account: ${accountBadge.status || accountBadge.role}`}>
            {accountBadge.picture
              ? <img src={accountBadge.picture} alt="" />
              : <span aria-hidden="true">{accountBadge.role === 'guest' ? 'G' : 'U'}</span>}
            <b>{accountBadge.status || (accountBadge.role === 'guest' ? 'Guest' : 'User')}</b>
          </span>
        )}
        {isMenuVisible('feed') && (
          <Link to="/feed" className="shb-item">
            <span className="shb-icon">📰</span>
            <span className="shb-label">Feed</span>
          </Link>
        )}
        {isMenuVisible('utility-payment', '/utility-payment') && (
          <Link to="/utility-payment" className="shb-item">
            <span className="shb-icon">💳</span>
            <span className="shb-label">Payment</span>
          </Link>
        )}
        {accountBadge.isLoggedIn && isMenuVisible('wallet') && (
          <Link to="/wallet" className="shb-item">
            <span className="shb-icon">💰</span>
            <span className="shb-label">Wallet</span>
          </Link>
        )}
        {isMenuVisible('friends') && (
          <button type="button" className="shb-item" onClick={() => setActivePopup('friends')}>
            <span className="shb-icon">👥</span>
            <span className="shb-label">Friends</span>
          </button>
        )}
        {isMenuVisible('messages') && (
          <button type="button" className="shb-item" onClick={() => setActivePopup('message')} aria-label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ''}`}>
            <span className="shb-icon">✉️</span>
            <span className="shb-label">Message</span>
            {unreadMessages > 0 && <span className="shb-count">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}
          </button>
        )}
        {accountBadge.isLoggedIn && isMenuVisible('mini-ride', '/mini-ride') && (
          <Link to="/mini-ride" className="shb-item">
            <span className="shb-icon">🚕</span>
            <span className="shb-label">Mini Ride</span>
          </Link>
        )}
        {accountBadge.isLoggedIn && accountBadge.role === 'driver' && isMenuVisible('driver', '/driver') && (
          <Link to="/driver" className="shb-item">
            <span className="shb-icon">🧑‍✈️</span>
            <span className="shb-label">Driver Portal</span>
          </Link>
        )}
        {isMenuVisible('notifications') && (
          <button type="button" className="shb-item" onClick={() => { setUnreadNotifications(0); setActivePopup('notification') }}>
            <span className="shb-icon">🔔</span>
            <span className="shb-label">Notification</span>
            {unreadNotifications > 0 && <span className="shb-count">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
          </button>
        )}
      </nav>

      <SocialPopups activePopup={activePopup} onClose={() => setActivePopup(null)} />
    </>
  )
}

export default SecondHeaderBar
