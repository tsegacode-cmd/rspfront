import { useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import { authAPI } from '../services/api'
import {
  getGuestSession,
} from '../utils/guestAccount'
import TelegramLoginWidget from './TelegramLoginWidget'
import './GuestUpgradeModal.css'

const getSavedUpgradeRequest = () => {
  try {
    return JSON.parse(localStorage.getItem('redsea_pending_upgrade_request') || '{}')
  } catch {
    return {}
  }
}

function GuestUpgradeModal({ onClose }) {
  const guest = getGuestSession()
  const savedUpgradeRequest = getSavedUpgradeRequest()
  const [form, setForm] = useState({
    fullName: guest?.fullName || '',
    phone: guest?.phone || '',
    email: '',
    password: '',
    contactType: 'phone',
    channel: 'admin',
    telegramUser: null,
    code: '',
  })
  const [otpConfig, setOtpConfig] = useState(null)
  const [otpConfigError, setOtpConfigError] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [adminRequestId, setAdminRequestId] = useState(savedUpgradeRequest.requestId || '')
  const [adminRequestAccessKey, setAdminRequestAccessKey] = useState(savedUpgradeRequest.accessKey || '')
  const [adminApproval, setAdminApproval] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [firebaseConfirmation, setFirebaseConfirmation] = useState(null)
  const firebaseAuthRef = useRef(null)
  const firebaseVerifierRef = useRef(null)

  useEffect(() => {
    let active = true
    authAPI.getOtpConfig()
      .then(response => {
        if (!active) return
        setOtpConfig(response.data)
        if (response.data.firebaseConfigured) {
          const existingApp = getApps().find(app => app.name === 'redsea-otp')
          const app = existingApp || initializeApp(response.data.firebase, 'redsea-otp')
          firebaseAuthRef.current = getAuth(app)
        }
      })
      .catch(configError => {
        if (active) setOtpConfigError(configError.message || 'Could not load OTP provider settings.')
      })
    return () => {
      active = false
      firebaseVerifierRef.current?.clear()
    }
  }, [])

  useEffect(() => {
    if (!adminRequestId) return undefined

    let active = true
    const syncAdminApproval = async () => {
      try {
        const response = await authAPI.getGuestUpgradeStatus(adminRequestId, adminRequestAccessKey)
        if (!active || response.data.status !== 'approved') return
        setAdminApproval({
          title: 'Account approved',
          message: 'Root approved your request. Enter the approval code below to activate your account.',
          otp: response.data.otp,
        })
      } catch (statusError) {
        if (active && statusError.status !== 404) {
          setError(statusError.message || 'Could not check the upgrade approval status.')
          if (statusError.status === 410) {
            localStorage.removeItem('redsea_pending_upgrade_request')
            setAdminRequestId('')
            setAdminRequestAccessKey('')
            setAdminApproval(null)
          }
        }
      }
    }

    syncAdminApproval()
    const interval = window.setInterval(syncAdminApproval, 3000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [adminRequestId, adminRequestAccessKey])

  const update = event => {
    const { name, value } = event.target
    setForm(current => {
      if (name === 'contactType') {
        return {
          ...current,
          contactType: value,
          channel: value === 'email' ? 'email' : value === 'phone' ? 'admin' : current.channel,
          telegramUser: null,
        }
      }
      return { ...current, [name]: value }
    })
    setError('')
    setInfo('')
  }

  const handleTelegramAuth = telegramUser => {
    setForm(current => ({ ...current, telegramUser }))
    setError('')
    setInfo(`Telegram account ${telegramUser.first_name || ''} connected.`)
  }

  const isUpgradeMethodEnabled = channel => {
    if (!otpConfig) return true
    const configured = channel === 'sms' ? otpConfig.smsConfigured
      : channel === 'email' ? otpConfig.emailConfigured
        : channel === 'firebase_sms' ? otpConfig.firebaseConfigured
          : otpConfig.telegramConfigured && otpConfig.telegramLoginWidgetConfigured && otpConfig.telegramWidgetMethods?.upgrade === true
    return configured && otpConfig.purposeMethods?.upgrade?.[channel] !== false
  }

  const providerUnavailable = otpConfig && (
    ['sms', 'email', 'telegram', 'firebase_sms'].includes(form.channel) && !isUpgradeMethodEnabled(form.channel)
  )

  const sendCode = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    try {
      if (form.channel === 'telegram' && !form.telegramUser) {
        throw new Error('Connect your Telegram account before requesting a code.')
      }
      const response = await authAPI.sendOtp({
        phone: form.phone,
        email: form.email,
        purpose: 'upgrade',
        channel: form.channel,
        telegramUser: form.telegramUser,
        fullName: form.fullName,
        password: form.password,
      })
      if (form.channel === 'firebase_sms') {
        if (!firebaseAuthRef.current) throw new Error('Firebase SMS is not configured in Root Dashboard → OTP API.')
        firebaseVerifierRef.current?.clear()
        firebaseVerifierRef.current = new RecaptchaVerifier(firebaseAuthRef.current, 'guest-upgrade-recaptcha', { size: 'invisible' })
        const confirmation = await signInWithPhoneNumber(firebaseAuthRef.current, form.phone.trim(), firebaseVerifierRef.current)
        setFirebaseConfirmation(confirmation)
        setInfo('Firebase SMS verification code sent.')
      } else {
        setInfo(response.message)
      }
      setChallengeId(response.data.challengeId)
    } catch (sendError) {
      setError(sendError.message || 'Could not send verification code.')
    } finally {
      setLoading(false)
    }
  }

  const requestAdminOtp = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const response = await authAPI.createGuestUpgradeRequest({
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        password: form.password,
      })
      setAdminRequestId(response.data.requestId)
      setAdminRequestAccessKey(response.data.accessKey)
      localStorage.setItem('redsea_pending_upgrade_request', JSON.stringify(response.data))
      setInfo('Your request was sent to Root. Keep this page open; it will update when Root approves it.')
      setAdminApproval(null)
    } catch (requestError) {
      setError(requestError.message || 'Could not submit the account approval request.')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      let response
      if (form.channel === 'firebase_sms') {
        if (!firebaseConfirmation || !firebaseAuthRef.current) throw new Error('Request a new Firebase SMS code before verifying.')
        const credential = await firebaseConfirmation.confirm(form.code)
        const idToken = await credential.user.getIdToken()
        await signOut(firebaseAuthRef.current)
        response = await authAPI.verifyFirebaseOtp({ challengeId, idToken })
      } else {
        response = await authAPI.verifyOtp({ challengeId, code: form.code })
      }
      const user = response.data.user
      localStorage.setItem('authToken', response.data.token)
      localStorage.setItem('userData', JSON.stringify(user))
      localStorage.setItem('userProfile', JSON.stringify({
        username: user.username,
        email: user.email || `${user.username}@redsea.com`,
        fullName: user.full_name || user.username,
        phone: user.phone || '',
        position: user.position || '',
        profilePicture: null,
      }))
      if (user.permissions) {
        localStorage.setItem('currentUserPermissions', JSON.stringify(user.permissions))
      }
      localStorage.removeItem('redsea_guest_session')
      window.location.href = '/'
    } catch (verifyError) {
      setError(verifyError.message || 'Could not verify the code.')
    } finally {
      setLoading(false)
    }
  }

  const completeAdminUpgrade = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    try {
      await authAPI.verifyGuestUpgradeOtp(adminRequestId, adminRequestAccessKey, form.code)
      localStorage.removeItem('redsea_pending_upgrade_request')
      localStorage.removeItem('redsea_guest_session')
      window.location.href = '/'
    } catch (registerError) {
      setError(registerError.message || 'Could not complete account registration.')
    } finally {
      setLoading(false)
    }
  }

  const submitForm = event => {
    if (form.channel === 'admin') {
      if (adminApproval) return completeAdminUpgrade(event)
      if (!adminRequestId) return requestAdminOtp(event)
      return undefined
    }
    return challengeId ? verifyCode(event) : sendCode(event)
  }

  const isAdminFlow = form.channel === 'admin'
  const formLocked = Boolean(challengeId || adminRequestId)

  return (
    <div className="gu-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="gu-modal" role="dialog" aria-modal="true" aria-label="Upgrade account">
        <div className="gu-header">
          <div>
            <span className="gu-step">{challengeId ? 'Verify contact' : 'Create account'}</span>
            <h2>⬆️ Upgrade to User Account</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {info && <div className="gu-info" role="status">{info}</div>}
        <form className="gu-body" onSubmit={submitForm}>
          <p className="gu-desc">
            {isAdminFlow
              ? 'Submit an upgrade request for Root approval. After approval, enter the code shown here to create your user account and sign in automatically.'
              : 'Verify your phone or email to create a user account. OTP delivery uses the providers configured in Root Dashboard → OTP API.'}
          </p>
          {error && <p className="gu-error" role="alert">{error}</p>}
          {otpConfigError && <p className="gu-error" role="alert">{otpConfigError}</p>}

          <label>Full Name
            <input name="fullName" type="text" value={form.fullName} onChange={update} required disabled={formLocked} />
          </label>
          <label>Register with
            <select name="contactType" value={form.contactType} onChange={update} disabled={formLocked}>
              <option value="phone">Phone number</option>
              <option value="email">Email address</option>
            </select>
          </label>
          {form.contactType === 'email' ? (
            <label>Email Address
              <input name="email" type="email" autoComplete="email" value={form.email} onChange={update} required disabled={formLocked} />
            </label>
          ) : (
            <label>Phone Number
              <input name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update} required disabled={formLocked} />
            </label>
          )}
          <label>Password (min 6 characters)
            <input name="password" type="password" value={form.password} onChange={update} required minLength={6} disabled={formLocked} autoComplete="new-password" />
          </label>
          <label>OTP delivery method
            <select name="channel" value={form.channel} onChange={update} disabled={formLocked || form.contactType === 'email'}>
              {form.contactType === 'phone' ? (
                <>
                  <option value="admin">Root approval (default)</option>
                  {isUpgradeMethodEnabled('sms') && <option value="sms">{otpConfig?.smsProvider === 'twilio' ? 'Twilio SMS' : 'Direct SMS'}</option>}
                  {isUpgradeMethodEnabled('firebase_sms') && <option value="firebase_sms">Firebase SMS</option>}
                  {isUpgradeMethodEnabled('telegram') && <option value="telegram">Telegram</option>}
                </>
              ) : (
                isUpgradeMethodEnabled('email') && <option value="email">Email OTP</option>
              )}
            </select>
          </label>
          {form.channel === 'firebase_sms' && <div id="guest-upgrade-recaptcha" aria-hidden="true" />}
          {form.channel === 'telegram' && (
            <div className="gu-telegram">
              {otpConfig?.telegramLoginWidgetConfigured ? (
                <>
                  <p>Connect your Telegram account to receive the verification code. No chat ID is needed.</p>
                  <TelegramLoginWidget botUsername={otpConfig.telegramBotUsername} onAuth={handleTelegramAuth} />
                  {form.telegramUser && <span className="gu-telegram-connected">Telegram account connected</span>}
                </>
              ) : (
                <p className="gu-otp-hint">Telegram OTP is unavailable until the bot token and username are configured in Root Dashboard → OTP API.</p>
              )}
            </div>
          )}
          {isAdminFlow && adminRequestId && !adminApproval && (
            <div className="gu-approval-message" role="status">
              <strong>Waiting for admin approval</strong>
              <p>Your request is stored for Root review. This form will show the OTP after approval.</p>
            </div>
          )}
          {isAdminFlow && adminApproval && (
            <div className="gu-approval-message" role="status">
              <strong>{adminApproval.title || 'Account approved'}</strong>
              <p>{adminApproval.message}</p>
              {adminApproval.otp && <span className="gu-approved-otp">OTP: <b>{adminApproval.otp}</b></span>}
            </div>
          )}
          {otpConfig && !isUpgradeMethodEnabled(form.channel) && form.channel !== 'admin' && (
            <p className="gu-otp-hint">This verification provider is disabled for guest upgrades or is not configured in Root Dashboard → OTP API.</p>
          )}

          {(challengeId || (isAdminFlow && adminApproval)) && (
            <label>6-digit verification code
              <input name="code" inputMode="numeric" autoComplete="one-time-code" value={form.code} onChange={update} required pattern="[0-9]{6}" maxLength={6} />
            </label>
          )}
          <div className="gu-actions">
            <button type="button" className="gu-cancel" onClick={adminRequestId ? onClose : challengeId ? () => { setChallengeId(''); setInfo(''); setError('') } : onClose}>
              {adminRequestId || challengeId ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="gu-submit"
              disabled={loading || (!challengeId && !adminRequestId && (providerUnavailable || (form.channel === 'telegram' && !form.telegramUser))) || (isAdminFlow && adminRequestId && !adminApproval)}
            >
              {loading
                ? 'Please wait...'
                : isAdminFlow
                  ? adminApproval ? 'Register account' : adminRequestId ? 'Waiting for admin approval' : 'Request admin OTP'
                  : challengeId ? 'Verify and create account' : 'Send verification code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default GuestUpgradeModal
