import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getApps, initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import TelegramLoginWidget from '../components/TelegramLoginWidget'
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
  const [contactType, setContactType] = useState(() => getSavedRegistrationApproval() ? 'root' : 'phone')
  const [otpChannel, setOtpChannel] = useState('sms')
  const [otpChallengeId, setOtpChallengeId] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [firebaseConfirmation, setFirebaseConfirmation] = useState(null)
  const [otpInfo, setOtpInfo] = useState('')
  const [telegramUser, setTelegramUser] = useState(null)
  const [registrationApprovalRequest, setRegistrationApprovalRequest] = useState(getSavedRegistrationApproval)
  const registerFormRef = useRef(null)
  const firebaseAuthRef = useRef(null)
  const firebaseVerifierRef = useRef(null)
  const telegramSendInProgressRef = useRef(false)

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
        : channel === 'telegram' ? otpConfig.telegramLoginWidgetConfigured && otpConfig.telegramWidgetMethods?.registration === true
          : otpConfig.smsConfigured
    return configured && otpConfig.purposeMethods?.registration?.[channel] !== false
  }

  const registrationChannels = contactType === 'telegram'
    ? [['telegram', 'Telegram Login Widget OTP']].filter(([channel]) => isRegistrationMethodEnabled(channel))
    : contactType === 'email'
    ? [['email', 'Email OTP (Resend)']].filter(([channel]) => isRegistrationMethodEnabled(channel))
    : contactType === 'root'
    ? []
    : [['sms', otpConfig?.smsProvider === 'twilio' ? 'Twilio SMS' : 'SMS'], ['firebase_sms', 'Firebase SMS']]
      .filter(([channel]) => isRegistrationMethodEnabled(channel))
  const formLocked = Boolean(otpChallengeId || registrationApprovalRequest)
  const telegramRegistrationWidgetEnabled = Boolean(
    otpConfig?.telegramLoginWidgetConfigured &&
    otpConfig.telegramWidgetMethods?.registration === true &&
    otpConfig.purposeMethods?.registration?.telegram !== false &&
    otpConfig.telegramBotUsername,
  )

  useEffect(() => {
    if (!otpConfig || contactType !== 'phone') return
    const phoneMethodsAvailable = ['sms', 'firebase_sms'].some(isRegistrationMethodEnabled)
    if (phoneMethodsAvailable) return
    if (otpConfig.telegramLoginWidgetConfigured) {
      setContactType('telegram')
      setOtpChannel('telegram')
    } else if (isRegistrationMethodEnabled('email')) {
      setContactType('email')
      setOtpChannel('email')
    }
  }, [contactType, otpConfig])

  useEffect(() => {
    if (registrationChannels.length && !registrationChannels.some(([channel]) => channel === otpChannel)) {
      setOtpChannel(registrationChannels[0][0])
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

  const handleTelegramAuth = async authenticatedTelegramUser => {
    if (telegramSendInProgressRef.current || otpChallengeId) return
    if (!registerFormRef.current?.reportValidity()) {
      return
    }
    telegramSendInProgressRef.current = true
    setLoading(true)
    setError('')
    setOtpInfo('')
    try {
      const response = await authAPI.sendOtp({
        purpose: 'registration',
        channel: 'telegram',
        phone: formData.phone,
        email: formData.email,
        telegramUser: authenticatedTelegramUser,
      })
      setTelegramUser(authenticatedTelegramUser)
      setContactType('telegram')
      setOtpChannel('telegram')
      setOtpChallengeId(response.data.challengeId)
      setOtpCode('')
      setOtpInfo(response.message || 'Telegram verification code sent.')
    } catch (requestError) {
      console.error('Telegram registration OTP failed:', requestError)
      setError(requestError.message || 'Could not send a Telegram verification code.')
    } finally {
      telegramSendInProgressRef.current = false
      setLoading(false)
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
          telegramChatId: contactType === 'telegram' ? telegramUser?.id : null,
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

      if (contactType === 'telegram') {
        throw new Error('Sign in with the Telegram widget above to receive your verification code.')
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
            <p className="register-subtitle">Username, phone, and password are required. Other details are optional.</p>
          </div>

          {/* Registration Form */}
          <form ref={registerFormRef} onSubmit={handleSubmit} className="register-form">
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

              <div className="form-group">
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
              </div>
            </div>

            <div className="form-group">
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
            </div>

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
                  disabled={loading || formLocked}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="registrationContactType">Verify account with *</label>
                <select
                  id="registrationContactType"
                  value={contactType}
                  onChange={event => {
                    setContactType(event.target.value)
                    setOtpChannel(event.target.value === 'email' ? 'email' : event.target.value === 'telegram' ? 'telegram' : 'sms')
                    setOtpInfo('')
                    setOtpChallengeId('')
                    setOtpCode('')
                    setTelegramUser(null)
                  }}
                  disabled={loading || formLocked}
                >
                  <option value="phone">Phone number</option>
                  <option value="email">Email address</option>
                  <option value="telegram" disabled={!otpConfig || !isRegistrationMethodEnabled('telegram')}>Telegram account</option>
                  <option value="root">Direct sign up (Root approval)</option>
                </select>
              </div>
              {contactType !== 'root' && (
                <div className="form-group">
                  <label htmlFor="registrationOtpChannel">OTP provider *</label>
                  <select
                    id="registrationOtpChannel"
                    value={otpChannel}
                    onChange={event => setOtpChannel(event.target.value)}
                    disabled={loading || formLocked || registrationChannels.length === 0}
                  >
                    {registrationChannels.map(([channel, label]) => <option key={channel} value={channel}>{label}</option>)}
                  </select>
                </div>
              )}
            </div>
            {otpConfig && contactType === 'telegram' && !isRegistrationMethodEnabled('telegram') && (
              <p className="register-subtitle" role="status">
                Telegram account creation requires the bot widget and both the Create account → Telegram provider and Login Widget switches enabled in Root Dashboard → OTP API.
              </p>
            )}
            {otpConfig && contactType !== 'root' && registrationChannels.length === 0 && (
              <p className="register-subtitle" role="alert">
                {contactType === 'telegram'
                  ? 'Telegram account creation requires a configured Login Widget and the Create account → Telegram switch enabled in Root Dashboard → OTP API.'
                  : 'No OTP provider is enabled and configured for account creation.'}
              </p>
            )}
            {telegramRegistrationWidgetEnabled && !otpChallengeId && contactType !== 'root' && (
              <div className="register-telegram-signup">
                <div className="register-telegram-divider">
                  <span>{contactType === 'telegram' ? 'SIGN UP WITH TELEGRAM' : 'OR SIGN UP WITH TELEGRAM'}</span>
                </div>
                <p className="register-subtitle">
                  Fill in your account details above, then use Telegram to verify your phone and create your account.
                  {' '}Start the <a href={`https://t.me/${otpConfig.telegramBotUsername}`} target="_blank" rel="noopener noreferrer">Telegram bot</a> first.
                </p>
                <TelegramLoginWidget botUsername={otpConfig.telegramBotUsername} onAuth={handleTelegramAuth} />
              </div>
            )}
            {otpInfo && <p className="register-subtitle" role="status">{otpInfo}</p>}
            {contactType === 'root' && registrationApprovalRequest && (
              <p className="register-subtitle" role="status">
                {registrationApprovalRequest.status === 'approved'
                  ? <>Root approved your signup. Approval code: <strong>{registrationApprovalRequest.otp}</strong></>
                  : 'Your signup request is waiting for Root approval.'}
              </p>
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
                          ? 'Create Account with Telegram'
                          : 'Send OTP to Create Account'}</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Links */}
          <div className="register-footer">
            <p>Already have an account? <Link to="/login" className="login-link">Sign in here</Link></p>
            <div className="footer-links">
              <Link to="/" className="footer-link back-home-link">← Back to Home</Link>
              <span className="divider">|</span>
              <Link to="/contact" className="footer-link">Need Help?</Link>
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
