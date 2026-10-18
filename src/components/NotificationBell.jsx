import { useEffect, useRef, useState } from 'react'
import {
  getAccountRole,
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
} from '../utils/guestAccount'
import { getAppSoundsEnabled, playAppSound, setAppSoundsEnabled } from '../utils/appSounds'
import './NotificationBell.css'

const NOTIFICATION_ICONS = {
  account_approved: '✅',
  account_created: '🎉',
  password_reset: '🔑',
  receipt_approved: '🧾',
  payment_approved: '💳',
  payment_cancelled: '❌',
  default: '🔔',
}
const iconFor = type => NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.default

const fmtTime = value => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

/**
 * NotificationBell
 * ---------------
 * Bell + unread badge for self-service (guest / user) accounts.
 * Reads the notifications pushed by the root/admin panel — OTP approval,
 * generated password, account creation — and shows them in a popup list.
 * A brand new notification also pops up as a toast so the guest sees the
 * message the moment the administrator acts.
 */
function NotificationBell() {
  const [accountMode, setAccountMode] = useState('staff')
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState(null)
  const [soundsEnabled, setSoundsEnabled] = useState(getAppSoundsEnabled)
  const bellRef = useRef(null)
  const lastSeenIdRef = useRef('')

  const currentPhone = () => {
    try {
      const user = JSON.parse(localStorage.getItem('userData') || '{}')
      const profile = JSON.parse(localStorage.getItem('userProfile') || '{}')
      return user.phone || user.phoneNumber || user.phone_number || profile.phone || ''
    } catch {
      return ''
    }
  }

  const load = () => {
    const role = getAccountRole()
    setAccountMode(role)
    if (role === 'staff') return

    const phone = currentPhone()
    const list = getMyNotifications(phone)
    setNotifications(list)
    setUnread(getUnreadNotificationCount(phone))

    const newest = list[0]
    if (newest && newest.id !== lastSeenIdRef.current) {
      // Skip the very first paint so old notifications do not toast on load.
      if (lastSeenIdRef.current) {
        setToast(newest)
        playAppSound('notification')
      }
      lastSeenIdRef.current = newest.id
    }
  }

  useEffect(() => {
    load()
    const handleUpdate = () => load()
    window.addEventListener('redsea:notifications', handleUpdate)
    const updateSoundPreference = () => setSoundsEnabled(getAppSoundsEnabled())
    window.addEventListener('redsea:sound-settings-updated', updateSoundPreference)
    const interval = window.setInterval(load, 15000)
    return () => {
      window.removeEventListener('redsea:notifications', handleUpdate)
      window.removeEventListener('redsea:sound-settings-updated', updateSoundPreference)
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 7000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!open) return undefined
    const handleClickOutside = event => {
      if (bellRef.current && !bellRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleOpen = () => {
    const next = !open
    setOpen(next)
    if (next) {
      const phone = currentPhone()
      markNotificationsRead(phone)
      setUnread(0)
      setNotifications(getMyNotifications(phone))
    }
  }

  return (
    <div className="notif-bell" ref={bellRef}>
      <button
        type="button"
        className="notif-bell-button"
        onClick={handleOpen}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <span className="notif-bell-icon">🔔</span>
        {unread > 0 && <span className="notif-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-header">
            <strong>🔔 Notifications</strong>
            <button
              type="button"
              className="notif-sound-toggle"
              onClick={() => {
                setAppSoundsEnabled(!soundsEnabled)
                setSoundsEnabled(!soundsEnabled)
              }}
              aria-label={soundsEnabled ? 'Turn notification sounds off' : 'Turn notification sounds on'}
              aria-pressed={soundsEnabled}
            >{soundsEnabled ? '🔊' : '🔕'}</button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications">×</button>
          </div>
          <div className="notif-panel-body">
            {notifications.length === 0 ? (
              <p className="notif-empty">
                <span>📭</span>
                No notifications yet. Administrator replies about your account appear here.
              </p>
            ) : (
              <ul className="notif-list">
                {notifications.map(item => {
                  const hasLink = item.link || item.url || item.route
                  return (
                    <li key={item.id} className={`notif-item ${item.read ? '' : 'unread'}`}>
                      <button
                        type="button"
                        className="notif-item-button"
                        onClick={() => {
                          if (!hasLink) return
                          setOpen(false)
                          window.location.assign(hasLink)
                        }}
                        aria-label={hasLink ? `Open notification: ${item.title || item.message}` : undefined}
                      >
                        <span className="notif-item-icon">{iconFor(item.type)}</span>
                        <div className="notif-item-body">
                          <strong>{item.title || 'Notification'}</strong>
                          <p>{item.message}</p>
                          {item.otp && (
                            <span className="notif-otp">OTP: <b>{item.otp}</b></span>
                          )}
                          {item.password && (
                            <span className="notif-otp">Password: <b>{item.password}</b></span>
                          )}
                          <small>{fmtTime(item.createdAt)}</small>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="notif-toast" role="status">
          <button
            type="button"
            className="notif-toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
          <span className="notif-toast-icon">{iconFor(toast.type)}</span>
          <div className="notif-toast-body">
            <strong>{toast.title || 'New notification'}</strong>
            <p>{toast.message}</p>
            {toast.otp && <span className="notif-otp">OTP: <b>{toast.otp}</b></span>}
            {toast.password && <span className="notif-otp">Password: <b>{toast.password}</b></span>}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
