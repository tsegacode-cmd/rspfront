import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getApps, initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import { authAPI } from '../services/api'
import './UserRegister.css'

const REGISTRATION_APPROVAL_STORAGE_KEY = 'redsea_pending_registration_request'

const getSavedRegistrationApproval = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(REGISTRATION_APPROVAL_STORAGE_KEY) || 'null')
    return saved?.requestId && saved?.accessKey ? saved : null
  } catch {
    return null
  }
}

function UserRegister() {
  const navigate = useNavigate()
  const referralCode = new URLSearchParams(window.location.search).get('ref') || ''
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    phone: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otpConfig, setOtpConfig] = useState(null)
  const telegramInitData = window.Telegram?.WebApp?.initData || ''
  const [contactType, setContactType] = useState(() => telegramInitData ? 'telegram' : getSavedRegistrationApproval() ? 'root' : 'phone')
  const [otpChannel, setOtpChannel] = useState('sms')
  const [otpChallengeId, setOtpChallengeId] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [firebaseConfirmation, setFirebaseConfirmation] = useState(null)
  const [otpInfo, setOtpInfo] = useState('')
  const [phoneShareStatus, setPhoneShareStatus] = useState('')
  const [registrationApprovalRequest, setRegistrationApprovalRequest] = useState(getSavedRegistrationApproval)
  const registerFormRef = useRef(null)
  const firebaseAuthRef = useRef(null)
  const firebaseVerifierRef = useRef(null)
  const telegramMiniAppMode = Boolean(telegramInitData)

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
        if (active) setError(configError.message || 'Could not load OTP provider settings.')
      })
    return () => {
      active = false
      firebaseVerifierRef.current?.clear()
    }
  }, [])

  const isRegistrationMethodEnabled = channel => {
    if (!otpConfig) return true
    const configured = channel === 'email' ? otpConfig.emailConfigured
      : channel === 'firebase_sms' ? otpConfig.firebaseConfigured
        : channel === 'telegram' ? otpConfig.telegramConfigured
          : otpConfig.smsConfigured
    return configured && otpConfig.purposeMethods?.registration?.[channel] !== false
  }
  const registrationChannelLabel = (channel, label) => {
    if (!otpConfig) return label
    const configured = channel === 'email' ? otpConfig.emailConfigured
      : channel === 'firebase_sms' ? otpConfig.firebaseConfigured
        : otpConfig.smsConfigured
    if (!configured) return `${label} — not configured`
    if (otpConfig.purposeMethods?.registration?.[channel] === false) return `${label} — disabled in OTP settings`
    return label
  }

  const registrationChannels = contactType === 'telegram'
    ? []
    : contactType === 'email'
    ? [['email', registrationChannelLabel('email', 'Email OTP (Resend)')]]
    : contactType === 'root'
    ? []
    : [
      ['sms', registrationChannelLabel('sms', otpConfig?.smsProvider === 'twilio' ? 'Twilio SMS' : 'SMS')],
      ['firebase_sms', registrationChannelLabel('firebase_sms', 'Firebase SMS')],
    ]
  const formLocked = Boolean(otpChallengeId || registrationApprovalRequest)
  const telegramMiniAppEnabled = Boolean(
    otpConfig?.telegramConfigured &&
    otpConfig.purposeMethods?.registration?.telegram !== false &&
    otpConfig.telegramBotUsername,
  )
  const telegramPhoneSharingEnabled = telegramMiniAppEnabled && otpConfig?.telegramWebhookConfigured === true

  useEffect(() => {
    if (!telegramInitData) return
    const webApp = window.Telegram?.WebApp
    webApp?.ready?.()
    webApp?.expand?.()
    setContactType('telegram')
    authAPI.prepareTelegramMiniAppRegistration(telegramInitData, '')
      .then(response => {
        const telegramProfile = response.data
        setFormData(current => ({
          ...current,
          username: current.username || (/^[A-Za-z0-9_.-]{3,40}$/.test(telegramProfile.username || '') ? telegramProfile.username : ''),
          fullName: current.fullName || telegramProfile.fullName || '',
        }))
      })
      .catch(profileError => {
        setError(profileError.message || 'Could not verify your Telegram Mini App identity.')
      })
  }, [telegramInitData])

  useEffect(() => {
    if (!otpConfig || contactType !== 'phone') return
    const phoneMethodsAvailable = ['sms', 'firebase_sms'].some(isRegistrationMethodEnabled)
    if (phoneMethodsAvailable) return
    if (telegramMiniAppEnabled) {
      setContactType('telegram')
    } else if (isRegistrationMethodEnabled('email')) {
      setContactType('email')
      setOtpChannel('email')
    }
  }, [contactType, otpConfig, telegramMiniAppEnabled])

  useEffect(() => {
    if (registrationChannels.length && !registrationChannels.some(([channel]) => channel === otpChannel && isRegistrationMethodEnabled(channel))) {
      setOtpChannel(registrationChannels.find(([channel]) => isRegistrationMethodEnabled(channel))?.[0] || registrationChannels[0][0])
    }
  }, [contactType, otpConfig])

  useEffect(() => {
    if (!registrationApprovalRequest) return undefined

    let active = true
    const syncRegistrationApproval = async () => {
      try {
        const response = await authAPI.getRegistrationApprovalStatus(
          registrationApprovalRequest.requestId,
          registrationApprovalRequest.accessKey,
        )
        if (!active) return
        const request = response.data
        setError('')
        if (request.status === 'completed') {
          localStorage.removeItem(REGISTRATION_APPROVAL_STORAGE_KEY)
          setRegistrationApprovalRequest(null)
          setOtpInfo('Your account is ready. Sign in with your username and password.')
          navigate('/login')
          return
        }
        setRegistrationApprovalRequest(current => ({ ...current, ...request }))
        if (request.status === 'approved' && /^\d{6}$/.test(String(request.otp || ''))) {
          setOtpCode(request.otp)
        }
        setFormData(current => ({
          ...current,
          username: request.username || current.username,
          fullName: request.fullName || current.fullName,
          phone: request.phone || current.phone,
          email: request.email || current.email,
        }))
      } catch (statusError) {
        if (!active) return
        if (statusError.status === 404 || statusError.status === 410) {
          localStorage.removeItem(REGISTRATION_APPROVAL_STORAGE_KEY)
          setRegistrationApprovalRequest(null)
        }
        setError(statusError.message || 'Could not check your signup approval status.')
      }
    }

    syncRegistrationApproval()
    const interval = window.setInterval(syncRegistrationApproval, 3000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [registrationApprovalRequest?.requestId, registrationApprovalRequest?.accessKey, navigate])

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setError('')
  }

  const handleShareTelegramPhone = async () => {
    const webApp = window.Telegram?.WebApp
    if (typeof webApp?.requestContact !== 'function') {
      setError('Your Telegram app does not support contact sharing. Update Telegram and reopen this Mini App.')
      return
    }
    setError('')
    setPhoneShareStatus('Approve the phone-sharing prompt in Telegram. Your phone will fill in after you approve it.')
    try {
      const shared = await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Telegram phone-sharing prompt timed out. Try again.')), 30000)
        try {
          webApp.requestContact(result => {
            window.clearTimeout(timeout)
            resolve(result)
          })
        } catch (requestError) {
          window.clearTimeout(timeout)
          reject(requestError)
        }
      })
      if (!shared) {
        setPhoneShareStatus('')
        setError('Phone sharing was cancelled. Approve Telegram’s prompt to continue signup.')
        return
      }
      setPhoneShareStatus('Phone shared with the bot. Retrieving it securely...')
      const deadline = Date.now() + 45000
      while (Date.now() < deadline) {
        const response = await authAPI.getTelegramRegistrationPhone(telegramInitData)
        const phone = response.data?.phone
        if (phone) {
          setFormData(current => ({ ...current, phone }))
          setPhoneShareStatus('Phone number received from Telegram.')
          return
        }
        await new Promise(resolve => window.setTimeout(resolve, 1500))
      }
      throw new Error('Telegram did not deliver the shared phone number. Check the bot webhook setup and try again.')
    } catch (shareError) {
      setPhoneShareStatus('')
      setError(shareError.message || 'Could not receive your Telegram phone number.')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setOtpInfo('')

    // Validation
    if (!registrationApprovalRequest && formData.password.length < 6) {
      setError('Password must be at least 6 characters long')
      setLoading(false)
      return
    }

    try {
      if (contactType === 'telegram') {
        if (!telegramInitData) {
          throw new Error('Open this signup form inside the Telegram Mini App to create an account without an OTP.')
        }
        if (!isRegistrationMethodEnabled('telegram')) {
          throw new Error('Telegram Mini App signup is disabled or not configured in Root Dashboard → OTP API.')
        }
        const verification = await authAPI.prepareTelegramMiniAppRegistration(telegramInitData, formData.phone)
        const response = await authAPI.register({
          registrationChallengeId: verification.data.registrationChallengeId,
          username: formData.username,
          email: formData.email || null,
          password: formData.password,
          full_name: formData.fullName || null,
          phone: formData.phone,
          telegramChatId: verification.data.telegramChatId,
          referralCode,
        })
        if (!response.success) throw new Error(response.message || 'Telegram signup failed.')
        alert('Registration successful! Please sign in with your username or phone and password.')
        navigate('/login')
        return
      }

      if (contactType === 'root') {
        if (registrationApprovalRequest) {
          if (registrationApprovalRequest.status !== 'approved') {
            return
          }
          if (!/^\d{6}$/.test(otpCode)) {
            setError('Enter the 6-digit approval code.')
            return
          }
          const response = await authAPI.verifyRegistrationApprovalOtp(
            registrationApprovalRequest.requestId,
            registrationApprovalRequest.accessKey,
            otpCode,
          )
          localStorage.removeItem(REGISTRATION_APPROVAL_STORAGE_KEY)
          setRegistrationApprovalRequest(null)
          alert(response.message || 'Account created successfully. Please sign in.')
          navigate('/login')
          return
        }

        const response = await authAPI.createRegistrationApprovalRequest({
          username: formData.username,
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          password: formData.password,
          referralCode,
        })
        localStorage.setItem(REGISTRATION_APPROVAL_STORAGE_KEY, JSON.stringify(response.data))
        setRegistrationApprovalRequest(response.data)
        setOtpCode('')
        setOtpInfo('')
        return
      }

      if (otpChallengeId) {
        let verification
        if (otpChannel === 'firebase_sms') {
          if (!firebaseConfirmation || !firebaseAuthRef.current) {
            throw new Error('Request a new Firebase SMS code before verifying.')
          }
          const firebaseCredential = await firebaseConfirmation.confirm(otpCode)
          const idToken = await firebaseCredential.user.getIdToken()
          await signOut(firebaseAuthRef.current)
          verification = await authAPI.verifyFirebaseOtp({ challengeId: otpChallengeId, idToken })
        } else {
          verification = await authAPI.verifyOtp({ challengeId: otpChallengeId, code: otpCode })
        }
        const response = await authAPI.register({
          registrationChallengeId: verification.data.registrationChallengeId,
          username: formData.username,
          email: formData.email || null,
          password: formData.password,
          full_name: formData.fullName || null,
          phone: formData.phone,
          referralCode
        })
        if (response.success) {
          alert('Registration successful! Please login with your credentials.')
          navigate('/login')
        } else {
          setError(response.message || 'Registration failed. Please try again.')
        }
        return
      }

      const target = contactType === 'email' ? formData.email : formData.phone
      if (!target) {
        throw new Error(contactType === 'email' ? 'Enter an email address to verify.' : 'Enter a phone number to verify.')
      }
      if (!formData.phone.trim()) {
        throw new Error('Enter your phone number. It is required to create an account.')
      }
      if (!isRegistrationMethodEnabled(otpChannel)) {
        throw new Error('The selected OTP provider is disabled or not configured for account creation.')
      }
      if (otpChannel === 'firebase_sms' && !/^\+[1-9]\d{7,14}$/.test(formData.phone.trim())) {
        throw new Error('Enter the phone number in international format, including + and the country code, for Firebase SMS.')
      }
      const response = await authAPI.sendOtp({
        phone: formData.phone,
        email: formData.email,
        purpose: 'registration',
        channel: otpChannel,
      })
      if (otpChannel === 'firebase_sms') {
        if (!firebaseAuthRef.current) throw new Error('Firebase SMS is not configured. Ask an administrator to finish setup in Root Dashboard → OTP API.')
        firebaseVerifierRef.current?.clear()
        firebaseVerifierRef.current = new RecaptchaVerifier(firebaseAuthRef.current, 'register-otp-recaptcha', { size: 'invisible' })
        const confirmation = await signInWithPhoneNumber(firebaseAuthRef.current, formData.phone.trim(), firebaseVerifierRef.current)
        setFirebaseConfirmation(confirmation)
        setOtpInfo('Firebase SMS verification code sent.')
      } else {
        setOtpInfo(response.message)
      }
      setOtpChallengeId(response.data.challengeId)
      setOtpCode('')
    } catch (error) {
      console.error('Registration flow failed:', error)
      setError(error.message || 'Could not complete account registration.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="user-register-page">
      <div className="register-container" role="dialog" aria-modal="true" aria-labelledby="register-title">
        <div className="register-card">
          {/* Logo Section */}
          <div className="register-header">
            <div className="register-logo">
              <span className="logo-icon">📝</span>
              <h1 className="logo-text">RED SEA PROPERTY</h1>
            </div>
            <h2 id="register-title" className="register-title">Create Account</h2>
            <p className="register-subtitle">{telegramMiniAppMode
              ? 'Create your account in Telegram using your Telegram username, shared phone number, and password.'
              : 'Username, phone, and password are required. Other details are optional.'}</p>
          </div>

          {/* Registration Form */}
          <form ref={registerFormRef} onSubmit={handleSubmit} className={`register-form${telegramMiniAppMode ? ' telegram-miniapp-form' : ''}`}>
            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="username">
                  <span className="label-icon">👤</span>
                  Username *
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  placeholder="Choose a username"
                  required={!registrationApprovalRequest}
                  disabled={loading || formLocked}
                />
              </div>

              {!telegramMiniAppMode && <div className="form-group">
                <label htmlFor="fullName">
                  <span className="label-icon">📛</span>
                  Full Name
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="Your full name"
                  disabled={loading || formLocked}
                />
              </div>}
            </div>

            {!telegramMiniAppMode && <div className="form-group">
              <label htmlFor="email">
                <span className="label-icon">📧</span>
              Email (optional)
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="your.email@example.com"
                disabled={loading || formLocked}
              />
            </div>}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="phone">
                  <span className="label-icon">📱</span>
                  Phone *
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="Phone number"
                  required={!registrationApprovalRequest}
                  readOnly={telegramMiniAppMode}
                  disabled={loading || formLocked}
                />
                {telegramMiniAppMode && telegramPhoneSharingEnabled && !formData.phone && (
                  <button type="button" className="login-link" onClick={handleShareTelegramPhone} disabled={loading || phoneShareStatus.includes('Retrieving')}>
                    {phoneShareStatus.includes('Retrieving') ? 'Getting phone number...' : 'Share phone number from Telegram'}
                  </button>
                )}
                {telegramMiniAppMode && phoneShareStatus && <p className="register-subtitle" role="status">{phoneShareStatus}</p>}
              </div>
            </div>

            {!telegramMiniAppMode && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="registrationContactType">Signup method *</label>
                  <select
                    id="registrationContactType"
                    value={contactType}
                    onChange={event => {
                      setContactType(event.target.value)
                      setOtpChannel(event.target.value === 'email' ? 'email' : event.target.value === 'telegram' ? 'telegram' : 'sms')
                      setOtpInfo('')
                      setOtpChallengeId('')
                      setOtpCode('')
                    }}
                    disabled={loading || formLocked}
                  >
                    <option value="telegram" disabled={!otpConfig || !telegramMiniAppEnabled}>Telegram Mini App (no OTP)</option>
                    <option value="phone">Phone number</option>
                    <option value="email">Email address</option>
                    <option value="root">Direct sign up (Root approval)</option>
                  </select>
                </div>
                {contactType !== 'root' && contactType !== 'telegram' && (
                  <div className="form-group">
                    <label htmlFor="registrationOtpChannel">OTP provider *</label>
                    <select
                      id="registrationOtpChannel"
                      value={otpChannel}
                      onChange={event => setOtpChannel(event.target.value)}
                      disabled={loading || formLocked || !registrationChannels.some(([channel]) => isRegistrationMethodEnabled(channel))}
                    >
                      {registrationChannels.map(([channel, label]) => <option key={channel} value={channel} disabled={!isRegistrationMethodEnabled(channel)}>{label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            {contactType === 'telegram' && !telegramInitData && telegramMiniAppEnabled && (
              <div className="register-telegram-signup">
                <p className="register-subtitle">Continue signup in Telegram Mini App. Your Telegram username will be filled in there, and Telegram will ask permission to share your phone.</p>
              </div>
            )}
            {contactType === 'telegram' && telegramInitData && (
              <p className="register-subtitle" role="status">{telegramPhoneSharingEnabled
                ? 'Telegram username verified. Approve Telegram’s phone-sharing prompt to autofill your phone number, then create your password.'
                : 'Telegram phone sharing is not configured yet. Ask an administrator to configure the Telegram webhook in Root Dashboard → OTP API.'}</p>
            )}
            {otpConfig && contactType !== 'root' && registrationChannels.length === 0 && (
              <p className="register-subtitle" role="alert" hidden={contactType === 'telegram'}>
                No OTP provider is enabled and configured for account creation.
              </p>
            )}
            {otpInfo && <p className="register-subtitle" role="status">{otpInfo}</p>}
            {contactType === 'root' && registrationApprovalRequest && (
              <div className={`register-root-approval ${registrationApprovalRequest.status === 'approved' ? 'approved' : ''}`} role="status">
                {registrationApprovalRequest.status === 'approved'
                  ? <>
                    <p>Root approved your signup. Enter this approval code to complete account creation:</p>
                    <strong className="register-root-approval-code">{registrationApprovalRequest.otp || 'Loading code...'}</strong>
                    {registrationApprovalRequest.otpExpiresAt && <small>This code expires {new Date(registrationApprovalRequest.otpExpiresAt).toLocaleString()}.</small>}
                  </>
                  : <p>Your signup request is waiting for Root approval. This form will show the approval code here when Root approves it.</p>}
              </div>
            )}
            {(otpChallengeId || (contactType === 'root' && registrationApprovalRequest?.status === 'approved')) && (
              <>
                <div className="form-group">
                  <label htmlFor="registrationOtpCode">
                    {contactType === 'root' ? '6-digit Root approval code *' : '6-digit verification code *'}
                  </label>
                  <input
                    id="registrationOtpCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otpCode}
                    onChange={event => setOtpCode(event.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <button
                  type="button"
                  className="login-link"
                  onClick={() => {
                    setOtpChallengeId('')
                    setOtpCode('')
                    setOtpInfo('')
                    setFirebaseConfirmation(null)
                    firebaseVerifierRef.current?.clear()
                    firebaseVerifierRef.current = null
                  }}
                  disabled={loading}
                >
                  Change contact or request a new code
                </button>
              </>
            )}
            {otpChannel === 'firebase_sms' && <div id="register-otp-recaptcha" aria-hidden="true" />}

            <div className="form-group">
              <label htmlFor="password">
                <span className="label-icon">🔒</span>
                Password *
              </label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Create a password (min 6 characters)"
                  required={!registrationApprovalRequest}
                  minLength="6"
                  disabled={loading || formLocked}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {contactType === 'telegram' && !telegramMiniAppMode && telegramMiniAppEnabled ? (
              <a
                className="register-btn"
                href={`https://t.me/${otpConfig.telegramBotUsername.replace(/^@/, '')}?startapp=register`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Create account with Telegram
              </a>
            ) : (
              <button
                type="submit"
                className="register-btn"
                disabled={loading}
              >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  <span>{otpChallengeId || registrationApprovalRequest?.status === 'approved'
                    ? 'Verifying and creating account...'
                    : registrationApprovalRequest
                      ? 'Waiting for Root approval...'
                      : contactType === 'root'
                        ? 'Sending signup request to Root...'
                        : 'Sending verification code...'}</span>
                </>
              ) : (
                <>
                  <span>{otpChallengeId || registrationApprovalRequest?.status === 'approved' ? '🔐' : '🚀'}</span>
                  <span>{otpChallengeId || registrationApprovalRequest?.status === 'approved'
                    ? 'Verify & Create Account'
                    : registrationApprovalRequest
                      ? 'Waiting for Root Approval'
                      : contactType === 'root'
                        ? 'Send signup request to Root'
                        : contactType === 'telegram'
                              ? 'Create Account'
                          : 'Send OTP to Create Account'}</span>
                </>
              )}
              </button>
            )}
          </form>

          {/* Footer Links */}
          <div className="register-footer">
            <p>Already have an account? <Link to="/login" className="login-link">Sign in here</Link></p>
            <div className="footer-links">
              <Link to="/" className="footer-link back-home-link">← Back to Home</Link>
              <span className="divider">|</span>
              <Link to="/contact" className="footer-link">Contact us</Link>
              <span className="divider">|</span>
              <button type="button" className="footer-link auth-live-chat-link" onClick={() => window.dispatchEvent(new Event('redsea:open-live-chat'))}>Live chat</button>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="register-decoration">
          <div className="decoration-circle circle-1"></div>
          <div className="decoration-circle circle-2"></div>
          <div className="decoration-circle circle-3"></div>
        </div>
      </div>
    </div>
  )
}

export default UserRegister
