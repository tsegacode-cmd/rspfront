import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getApps, initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import { authAPI, getApiHealthUrls, isApiBackendConfigured } from '../services/api'
import { getGuestSession, loginGuest, registerGuest } from '../utils/guestAccount'
import TelegramLoginWidget from '../components/TelegramLoginWidget'
import './UserLogin.css'

const PASSWORD_RESET_APPROVAL_STORAGE_KEY = 'redsea_pending_password_reset'

const getSavedPasswordReset = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PASSWORD_RESET_APPROVAL_STORAGE_KEY) || 'null')
    return saved?.requestId && saved?.accessKey ? saved : null
  } catch {
    return null
  }
}

function UserLogin() {
  const navigate = useNavigate()
  const telegramWebApp = window.Telegram?.WebApp
  const telegramInitData = telegramWebApp?.initData || ''
  const telegramStartParam = String(telegramWebApp?.initDataUnsafe?.start_param || '').toLowerCase()
  const requestedReset = new URLSearchParams(window.location.search).get('reset')
  // mode: 'login' (default) or 'guest' (register by full name + phone)
  const [mode, setMode] = useState('login')
  const [guestMode, setGuestMode] = useState(() => getGuestSession() ? 'login' : 'register')
  const [authMode, setAuthMode] = useState(() => requestedReset === 'telegram' || telegramStartParam === 'password_reset' ? 'password-reset' : 'password')
  const [resetMethod, setResetMethod] = useState(() =>
    requestedReset === 'root' || (!telegramInitData && getSavedPasswordReset()) ? 'root' : 'telegram',
  )
  const [resetForm, setResetForm] = useState({
    username: telegramWebApp?.initDataUnsafe?.user?.username || '',
    phone: '',
    newPassword: '',
    approvalCode: '',
  })
  const [passwordResetRequest, setPasswordResetRequest] = useState(getSavedPasswordReset)
  const [otpForm, setOtpForm] = useState({
    phone: '',
    channel: 'sms',
    code: '',
    newPassword: '',
    challengeId: '',
  })
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  })
  const [guestData, setGuestData] = useState(() => {
    const guest = getGuestSession()
    return {
      fullName: guest?.fullName || '',
      phone: guest?.phone || '',
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [networkStatus, setNetworkStatus] = useState('checking')
  const [showNetworkStatus, setShowNetworkStatus] = useState(true)
  const [connectionDetails, setConnectionDetails] = useState({})
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(Boolean(telegramInitData))
  const [otpProviderConfig, setOtpProviderConfig] = useState(null)
  const [otpProviderError, setOtpProviderError] = useState('')
  const [firebaseConfirmation, setFirebaseConfirmation] = useState(null)
  const firebaseAuthRef = useRef(null)
  const firebaseVerifierRef = useRef(null)
  const networkStatusTimerRef = useRef(null)

  useEffect(() => {
    if (!passwordResetRequest) return undefined
    let active = true
    const syncPasswordReset = async () => {
      try {
        const response = await authAPI.getPasswordResetApprovalStatus(passwordResetRequest.requestId, passwordResetRequest.accessKey)
        if (!active) return
        const request = response.data
        if (request.status === 'completed') {
          localStorage.removeItem(PASSWORD_RESET_APPROVAL_STORAGE_KEY)
          setPasswordResetRequest(null)
          setResetForm(current => ({ ...current, newPassword: '', approvalCode: '' }))
          setAuthMode('password')
          setOtpInfo('Password reset successfully. Sign in with your new password.')
          return
        }
        setPasswordResetRequest(current => ({ ...current, ...request }))
        setResetForm(current => ({
          ...current,
          username: request.username || current.username,
          phone: request.phone || current.phone,
          approvalCode: request.status === 'approved' ? request.otp || current.approvalCode : current.approvalCode,
        }))
      } catch (statusError) {
        if (!active) return
        if (statusError.status === 404 || statusError.status === 410) {
          localStorage.removeItem(PASSWORD_RESET_APPROVAL_STORAGE_KEY)
          setPasswordResetRequest(null)
        }
        setError(statusError.message || 'Could not check password reset approval status.')
      }
    }
    syncPasswordReset()
    const timer = window.setInterval(syncPasswordReset, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [passwordResetRequest?.requestId, passwordResetRequest?.accessKey])

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setOtpInfo('')
  }

  const handleGuestRegister = (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const guest = registerGuest(guestData)
      setGuestData({ fullName: guest.fullName, phone: guest.phone })
      navigate('/', { replace: true })
    } catch (guestError) {
      setError(guestError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGuestLogin = (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      loginGuest({ phone: guestData.phone })
      navigate('/', { replace: true })
    } catch (guestError) {
      setError(guestError.message || 'Could not sign in as guest.')
    } finally {
      setLoading(false)
    }
  }

  // Check if already logged in
  useEffect(() => {
    const authToken = localStorage.getItem('authToken')
    if (authToken) {
      navigate('/')
    }
  }, [navigate])

  // Check network connectivity on component mount
  useEffect(() => {
    checkNetworkConnectivity()
    return () => window.clearTimeout(networkStatusTimerRef.current)
  }, [])

  useEffect(() => {
    let active = true
    const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
    authAPI.getOtpConfig(preferredApiBaseUrl)
      .then(response => {
        if (!active) return
        const config = response.data
        setOtpProviderConfig(config)
        if (config.firebaseConfigured) {
          const existingApp = getApps().find(app => app.name === 'redsea-otp')
          const app = existingApp || initializeApp(config.firebase, 'redsea-otp')
          firebaseAuthRef.current = getAuth(app)
        }
        setOtpProviderError('')
      })
      .catch(configError => {
        if (active) setOtpProviderError(configError.message || 'Could not load OTP provider settings.')
      })
    return () => { active = false }
  }, [connectionDetails.workingUrl])

  useEffect(() => {
    const telegramWebApp = window.Telegram?.WebApp
    if (!telegramWebApp?.initData) return
    telegramWebApp.ready()
    telegramWebApp.expand()
    setIsTelegramMiniApp(true)
  }, [])

  const checkNetworkConnectivity = async () => {
    window.clearTimeout(networkStatusTimerRef.current)
    setShowNetworkStatus(true)
    setNetworkStatus('checking')
    networkStatusTimerRef.current = window.setTimeout(() => setShowNetworkStatus(false), 2000)
    
    const hostname = window.location.hostname
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const testUrls = getApiHealthUrls()

    let workingUrl = null
    let lastError = null

    for (const url of testUrls) {
      try {
        console.log(`🌐 Testing connectivity to: ${url}`)
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          console.log(`✅ Connection successful: ${url}`)
          workingUrl = url
          break
        }
      } catch (error) {
        console.log(`❌ Connection failed: ${url} - ${error.message}`)
        lastError = error
        continue
      }
    }

    setConnectionDetails({
      hostname,
      isMobile,
      workingUrl,
      lastError: lastError?.message,
      testUrls
    })

    if (workingUrl) {
      setNetworkStatus('connected')
      networkStatusTimerRef.current = window.setTimeout(() => setShowNetworkStatus(false), 2000)
      setError('')
    } else {
      window.clearTimeout(networkStatusTimerRef.current)
      setShowNetworkStatus(true)
      setNetworkStatus('failed')
      setError(!isApiBackendConfigured()
        ? 'The frontend is deployed, but the backend is not configured. Set VITE_API_URL to your public HTTPS backend URL ending in /api/v1 in Vercel, then redeploy.'
        : import.meta.env.PROD
          ? 'Cannot connect to the configured backend. Verify VITE_API_URL and backend availability.'
        : `Network connection failed. ${isMobile ? 'Make sure you\'re on the same WiFi network.' : 'Check if the backend server is running.'}`)
    }
  }

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Check network first
    if (networkStatus !== 'connected') {
      setError('No network connection. Please check connectivity.')
      setLoading(false)
      return
    }

    try {
      console.log('🔍 Login attempt for:', formData.identifier)
      console.log('🌐 Using connection:', connectionDetails.workingUrl)
      
      // Call API for authentication with retry logic
      let response = null
      let attempts = 0
      const maxAttempts = 3

      while (attempts < maxAttempts && !response) {
        attempts++
        try {
          console.log(`🔄 Login attempt ${attempts}/${maxAttempts}`)
          const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
          response = await authAPI.login(formData.identifier, formData.password, preferredApiBaseUrl)
          break
        } catch (loginError) {
          console.log(`❌ Login attempt ${attempts} failed:`, loginError.message)
          
          if (attempts < maxAttempts) {
            console.log('🔄 Retrying login...')
            await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
          } else {
            throw loginError
          }
        }
      }
      
      if (!response || !response.success) {
        console.error('❌ Login failed:', response?.message)
        setError(response?.message || 'Invalid username or password')
        setLoading(false)
        return
      }

      console.log('✅ Login successful for:', response.user.username)

      // Store auth data
      localStorage.setItem('authToken', response.token)
      localStorage.setItem('userData', JSON.stringify(response.user))
      localStorage.setItem('userProfile', JSON.stringify({
        username: response.user.username,
        email: response.user.email || 'user@redsea.com',
        fullName: response.user.full_name || response.user.username,
        phone: response.user.phone || '',
        position: response.user.position || '',
        profilePicture: null
      }))

      // Store permissions from server response
      if (response.user.permissions) {
        localStorage.setItem('currentUserPermissions', JSON.stringify(response.user.permissions))
        console.log('✅ User permissions loaded from server:', response.user.permissions)
      }

      const loggedInRole = String(response.user.role || '').toLowerCase()
      navigate(loggedInRole === 'agent' ? '/agent' : loggedInRole === 'driver' ? '/driver' : '/')
      
    } catch (error) {
      console.error('Login error:', error)
      
      // Provide specific error messages for mobile
      let errorMessage = 'Login failed. Please try again.'
      
      if (error.message.includes('fetch')) {
        errorMessage = connectionDetails.isMobile 
          ? 'Network error. Check WiFi connection and try again.'
          : 'Cannot connect to server. Check if backend is running.'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Server may be slow or unreachable.'
      } else if (error.message.includes('CORS')) {
        errorMessage = 'Cross-origin request blocked. Check server configuration.'
      }
      
      setError(errorMessage)
      setLoading(false)
    }
  }

  const handlePasswordResetSubmit = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setOtpInfo('')
    try {
      if ((!passwordResetRequest || resetMethod === 'telegram') &&
        (resetForm.newPassword.length < 6 || resetForm.newPassword.length > 128)) {
        throw new Error('New password must be between 6 and 128 characters.')
      }
      if (resetMethod === 'telegram') {
        if (!telegramInitData) {
          throw new Error('Open the Telegram Mini App from the reset link to reset your password with Telegram.')
        }
        const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
        const response = await authAPI.resetPasswordWithTelegramMiniApp(
          telegramInitData,
          resetForm.newPassword,
          preferredApiBaseUrl,
        )
        setFormData(current => ({ ...current, identifier: resetForm.username, password: '' }))
        setResetForm(current => ({ ...current, newPassword: '' }))
        setAuthMode('password')
        setOtpInfo(response.message || 'Password reset successfully. Sign in with your new password.')
        return
      }

      if (passwordResetRequest?.status === 'approved') {
        if (!/^\d{6}$/.test(resetForm.approvalCode)) {
          throw new Error('Enter the 6-digit Root approval code.')
        }
        const response = await authAPI.verifyPasswordResetApprovalOtp(
          passwordResetRequest.requestId,
          passwordResetRequest.accessKey,
          resetForm.approvalCode,
        )
        localStorage.removeItem(PASSWORD_RESET_APPROVAL_STORAGE_KEY)
        setPasswordResetRequest(null)
        setResetForm(current => ({ ...current, newPassword: '', approvalCode: '' }))
        setAuthMode('password')
        setOtpInfo(response.message || 'Password reset successfully. Sign in with your new password.')
        return
      }

      if (passwordResetRequest) {
        setOtpInfo('Your password reset request is waiting for Root approval.')
        return
      }
      const response = await authAPI.createPasswordResetApprovalRequest({
        username: resetForm.username,
        phone: resetForm.phone,
        password: resetForm.newPassword,
      })
      localStorage.setItem(PASSWORD_RESET_APPROVAL_STORAGE_KEY, JSON.stringify(response.data))
      setPasswordResetRequest(response.data)
      setOtpInfo(response.message || 'Password reset request submitted for Root approval.')
    } catch (resetError) {
      setError(resetError.message || 'Could not reset your password.')
    } finally {
      setLoading(false)
    }
  }

  const sendPhoneCode = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setOtpInfo('')
    try {
      const purpose = authMode === 'password-reset' ? 'password_reset' : 'login'
      const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
      if (otpForm.channel === 'firebase_sms' && !/^\+[1-9]\d{7,14}$/.test(otpForm.phone.trim())) {
        throw new Error('Enter the phone number in international format, including + and the country code, for Firebase SMS.')
      }
      const response = await authAPI.sendOtp({
        phone: otpForm.channel === 'email' ? '' : otpForm.phone,
        email: otpForm.channel === 'email' ? otpForm.phone : '',
        purpose,
        channel: otpForm.channel,
      }, preferredApiBaseUrl)
      if (otpForm.channel === 'firebase_sms') {
        if (!firebaseAuthRef.current) {
          throw new Error('Firebase SMS is not configured. Ask an administrator to finish Firebase setup in the OTP API settings.')
        }
        firebaseVerifierRef.current?.clear()
        firebaseVerifierRef.current = new RecaptchaVerifier(firebaseAuthRef.current, 'otp-recaptcha-container', {
          size: 'invisible',
        })
        const confirmation = await signInWithPhoneNumber(
          firebaseAuthRef.current,
          otpForm.phone.trim(),
          firebaseVerifierRef.current,
        )
        setFirebaseConfirmation(confirmation)
        setOtpInfo('Firebase SMS verification code sent.')
      } else {
        setOtpInfo(response.message)
      }
      setOtpForm(current => ({ ...current, challengeId: response.data.challengeId, code: '' }))
    } catch (otpError) {
      setError(otpError.message || 'Could not send the verification code.')
    } finally {
      setLoading(false)
    }
  }

  const verifyPhoneCode = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
      let response
      if (otpForm.channel === 'firebase_sms') {
        if (!firebaseConfirmation || !firebaseAuthRef.current) {
          throw new Error('Request a new Firebase SMS code before verifying.')
        }
        const firebaseCredential = await firebaseConfirmation.confirm(otpForm.code)
        const idToken = await firebaseCredential.user.getIdToken()
        await signOut(firebaseAuthRef.current)
        response = await authAPI.verifyFirebaseOtp({
          challengeId: otpForm.challengeId,
          idToken,
          newPassword: otpForm.newPassword,
        }, preferredApiBaseUrl)
      } else {
        response = await authAPI.verifyOtp({
          challengeId: otpForm.challengeId,
          code: otpForm.code,
          newPassword: otpForm.newPassword,
        }, preferredApiBaseUrl)
      }
      if (authMode === 'password-reset') {
        setOtpForm(current => ({ ...current, challengeId: '', code: '', newPassword: '' }))
        setFirebaseConfirmation(null)
        setAuthMode('password')
        setOtpInfo(response.data.message || response.message || 'Password reset successfully.')
      } else {
        navigate('/')
      }
    } catch (otpError) {
      setError(otpError.message || 'Could not verify the code.')
    } finally {
      setLoading(false)
    }
  }

  const handleTelegramWidgetLogin = async (telegramUser) => {
    if (networkStatus !== 'connected') {
      setError('No network connection. Please check connectivity.')
      return
    }

    setLoading(true)
    setError('')
    setOtpInfo('')
    try {
      const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
      await authAPI.telegramWidgetLogin(telegramUser, false, preferredApiBaseUrl)
      navigate('/')
    } catch (loginError) {
      setError(loginError.message || 'Telegram sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleTelegramPasswordReset = async telegramUser => {
    if (networkStatus !== 'connected') {
      setError('No network connection. Please check connectivity.')
      return
    }
    setLoading(true)
    setError('')
    setOtpInfo('')
    try {
      const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
      const response = await authAPI.sendOtp({
        purpose: 'password_reset',
        channel: 'telegram',
        telegramUser,
      }, preferredApiBaseUrl)
      setOtpForm(current => ({ ...current, challengeId: response.data.challengeId, code: '', newPassword: '' }))
      setOtpInfo(response.message || 'A password-reset code was sent to your linked Telegram chat.')
    } catch (requestError) {
      setError(requestError.message || 'Could not send a password-reset code to Telegram.')
    } finally {
      setLoading(false)
    }
  }

  const handleTelegramLogin = async () => {
    const initData = window.Telegram?.WebApp?.initData
    if (!initData) {
      setError('Open this page from the Telegram Mini App to sign in with Telegram.')
      return
    }
    if (networkStatus !== 'connected') {
      setError('No network connection. Please check connectivity.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
      await authAPI.telegramMiniAppLogin(initData, preferredApiBaseUrl)
      navigate('/')
    } catch (loginError) {
      setError(loginError.message || 'Telegram Mini App login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const updateOtpField = (event) => {
    setOtpForm(current => ({ ...current, [event.target.name]: event.target.value }))
    if (event.target.name === 'channel') {
      setFirebaseConfirmation(null)
      firebaseVerifierRef.current?.clear()
      firebaseVerifierRef.current = null
    }
    setError('')
  }

  const changeAuthMode = (nextMode) => {
    setAuthMode(nextMode)
    setOtpForm(current => ({
      ...current,
      channel: nextMode === 'email-login' ? 'email' : nextMode === 'phone-login' ? 'sms' : current.channel,
      challengeId: '',
      code: '',
      newPassword: '',
    }))
    setFirebaseConfirmation(null)
    firebaseVerifierRef.current?.clear()
    firebaseVerifierRef.current = null
    setOtpInfo('')
    setError('')
  }

  const otpPurpose = authMode === 'password-reset' ? 'password_reset' : 'login'
  const channelConfigured = channel => {
    if (!otpProviderConfig) return true
    const configured = channel === 'email' ? otpProviderConfig.emailConfigured
      : channel === 'firebase_sms' ? otpProviderConfig.firebaseConfigured
        : channel === 'telegram' ? otpProviderConfig.telegramConfigured
          : otpProviderConfig.smsConfigured
    return configured && otpProviderConfig.purposeMethods?.[otpPurpose]?.[channel] !== false
  }
  const otpChannels = [
    ['sms', otpProviderConfig?.smsProvider === 'twilio' ? 'Twilio SMS' : 'Direct SMS'],
    ['telegram', 'Telegram'],
    ['firebase_sms', 'Firebase SMS'],
    ['email', 'Email OTP (Resend)'],
  ].filter(([channel]) => channelConfigured(channel))
  const telegramWidgetEnabled = Boolean(
    otpProviderConfig?.telegramLoginWidgetConfigured &&
    otpProviderConfig.telegramWidgetMethods?.login === true &&
    otpProviderConfig.purposeMethods?.login?.telegram !== false,
  )
  const telegramResetWidgetEnabled = Boolean(
    authMode === 'password-reset' &&
    otpForm.channel === 'telegram' &&
    otpProviderConfig?.telegramLoginWidgetConfigured &&
    otpProviderConfig.telegramWidgetMethods?.password_reset === true &&
    otpProviderConfig.purposeMethods?.password_reset?.telegram !== false,
  )

  useEffect(() => {
    if (authMode === 'email-login') {
      setOtpForm(current => current.channel === 'email' ? current : { ...current, channel: 'email' })
    } else if (authMode !== 'password' && authMode !== 'telegram' && otpChannels.length
      && !otpChannels.some(([channel]) => channel === otpForm.channel)) {
      setOtpForm(current => ({ ...current, channel: otpChannels[0][0] }))
    }
  }, [authMode, otpProviderConfig])

  useEffect(() => {
    if (authMode === 'telegram' && otpProviderConfig && !telegramWidgetEnabled) {
      setAuthMode('password')
    }
  }, [authMode, otpProviderConfig, telegramWidgetEnabled])

  return (
    <div className="user-login-page">
      <header className="login-page-header">
        {otpProviderConfig?.supportTelegramUsername && (
          <a
            className="login-page-telegram-support"
            href={`https://t.me/${encodeURIComponent(String(otpProviderConfig.supportTelegramUsername).replace(/^@/, ''))}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Contact support on Telegram"
          >
            <span aria-hidden="true">✈️</span>
            <span>Telegram Support</span>
          </a>
        )}
      </header>
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <span className="logo-icon">🔐</span>
              <h1 className="logo-text">RED SEA PROPERTY</h1>
            </div>
            <p className="login-tagline">fixed and movable Commission Work & Brokerage Services</p>
            <h2 className="login-title">{mode === 'guest' ? (guestMode === 'register' ? 'Guest Registration' : 'Guest Login') : 'Account Login'}</h2>
            <p className="login-subtitle">{mode === 'guest' ? (guestMode === 'register' ? 'Register once with your name and phone, then use Guest Login next time.' : 'Enter the phone number you used to register this guest on this device.') : 'Users, staff, and root administrators sign in here with their account credentials. Your account role is assigned to your account.'}</p>

            {/* Mode selector: Login or Guest */}
            <div className="login-mode-selector">
              <button
                type="button"
                className={`login-mode-btn ${mode === 'login' ? 'active' : ''}`}
                onClick={() => switchMode('login')}
              >
                🔐 Sign In
              </button>
              <button
                type="button"
                className={`login-mode-btn ${mode === 'guest' ? 'active' : ''}`}
                onClick={() => switchMode('guest')}
              >
                👤 Guest
              </button>
            </div>
            
            {/* Network Status Indicator */}
            {showNetworkStatus && <div className={`network-status ${networkStatus}`}>
              {networkStatus === 'checking' && (
                <>
                  <span className="status-icon">🔄</span>
                  <span>Checking connection...</span>
                </>
              )}
              {networkStatus === 'connected' && (
                <>
                  <span className="status-icon">✅</span>
                  <span>Connected to server</span>
                </>
              )}
              {networkStatus === 'failed' && (
                <>
                  <span className="status-icon">❌</span>
                  <span>Connection failed</span>
                  <button 
                    type="button" 
                    className="retry-btn"
                    onClick={checkNetworkConnectivity}
                  >
                    🔄 Retry
                  </button>
                </>
              )}
            </div>}
          </div>

          {mode === 'login' && (
          <form onSubmit={authMode === 'password' ? handleSubmit : handlePasswordResetSubmit} className="login-form">
            {authMode === 'password' ? (
              <label className="auth-method-selector" htmlFor="authMethod">
                <span>Sign-in method</span>
                <select id="authMethod" value="password" disabled>
                  <option value="password">Username and password</option>
                </select>
              </label>
            ) : (
              <label className="auth-method-selector" htmlFor="resetMethod">
                <span>Password reset method</span>
                <select
                  id="resetMethod"
                  value={resetMethod}
                  onChange={event => {
                    setResetMethod(event.target.value)
                    setPasswordResetRequest(null)
                    localStorage.removeItem(PASSWORD_RESET_APPROVAL_STORAGE_KEY)
                    setOtpInfo('')
                    setError('')
                  }}
                  disabled={Boolean(passwordResetRequest) || isTelegramMiniApp}
                >
                  <option value="telegram" disabled={!otpProviderConfig?.telegramConfigured || !otpProviderConfig?.telegramBotUsername || otpProviderConfig?.purposeMethods?.password_reset?.telegram === false}>Telegram Mini App</option>
                  <option value="root">Direct Root approval</option>
                </select>
              </label>
            )}
            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
                {networkStatus === 'failed' && (
                  <button 
                    type="button" 
                    className="error-retry-btn"
                    onClick={checkNetworkConnectivity}
                  >
                    Check Connection
                  </button>
                )}
              </div>
            )}

            {otpInfo && <div className="otp-info" role="status">{otpInfo}</div>}
            {authMode === 'password' ? (
              <>
                <div className="form-group">
                  <label htmlFor="identifier">
                    <span className="label-icon">👤</span>
                    Username / Email / Phone
                  </label>
                  <input
                    type="text"
                    id="identifier"
                    name="identifier"
                    value={formData.identifier}
                    onChange={handleInputChange}
                    placeholder="Enter username, email, or phone"
                    required
                    disabled={loading || networkStatus !== 'connected'}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">
                    <span className="label-icon">🔒</span>
                    Password
                  </label>
                  <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter your password"
                  required
                  disabled={loading || networkStatus !== 'connected'}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                  disabled={loading || networkStatus !== 'connected'}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
                  </div>
                </div>
              </>
            ) : resetMethod === 'telegram' ? (
              <>
                {isTelegramMiniApp ? (
                  <>
                    <div className="form-group">
                      <label htmlFor="resetTelegramUsername">Telegram username</label>
                      <input id="resetTelegramUsername" value={resetForm.username ? `@${resetForm.username}` : `Telegram ID ${telegramWebApp?.initDataUnsafe?.user?.id || ''}`} readOnly />
                    </div>
                    <p className="otp-info" role="note">Telegram verifies the account linked to this Mini App. Enter a new password below; your current password is never requested or filled in.</p>
                    <div className="form-group">
                      <label htmlFor="telegramNewPassword">New password</label>
                      <input
                        id="telegramNewPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        value={resetForm.newPassword}
                        onChange={event => setResetForm(current => ({ ...current, newPassword: event.target.value }))}
                        required
                        disabled={loading}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="otp-info" role="note">Open the Telegram Mini App to reset the password for your linked account.</p>
                    {otpProviderConfig?.telegramBotUsername && (
                      <a
                        className="login-btn"
                        href={`https://t.me/${String(otpProviderConfig.telegramBotUsername).replace(/^@/, '')}?startapp=password_reset`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Reset password with Telegram
                      </a>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                {passwordResetRequest ? (
                  <p className="otp-info" role="status">
                    {passwordResetRequest.status === 'approved'
                      ? 'Root approved the password reset. Enter the approval code below to apply your new password.'
                      : 'Your request is waiting for Root approval. This form will show the OTP when approved.'}
                  </p>
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor="rootResetUsername">Username</label>
                      <input id="rootResetUsername" value={resetForm.username} onChange={event => setResetForm(current => ({ ...current, username: event.target.value }))} required autoComplete="username" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="rootResetPhone">Phone number on account</label>
                      <input id="rootResetPhone" type="tel" value={resetForm.phone} onChange={event => setResetForm(current => ({ ...current, phone: event.target.value }))} required autoComplete="tel" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="rootResetNewPassword">New password</label>
                      <input id="rootResetNewPassword" type="password" minLength={6} maxLength={128} autoComplete="new-password" value={resetForm.newPassword} onChange={event => setResetForm(current => ({ ...current, newPassword: event.target.value }))} required />
                    </div>
                  </>
                )}
                {passwordResetRequest?.status === 'approved' && (
                  <>
                    <p className="register-root-approval approved" role="status">
                      Root approval code: <strong className="register-root-approval-code">{passwordResetRequest.otp || 'Loading code...'}</strong>
                      {passwordResetRequest.otpExpiresAt && <small>Expires {new Date(passwordResetRequest.otpExpiresAt).toLocaleString()} (within 24 hours of approval).</small>}
                    </p>
                    <div className="form-group">
                      <label htmlFor="rootResetApprovalCode">6-digit approval code</label>
                      <input id="rootResetApprovalCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={resetForm.approvalCode} onChange={event => setResetForm(current => ({ ...current, approvalCode: event.target.value }))} required />
                    </div>
                  </>
                )}
              </>
            )}

            {authMode === 'password' ? (
              <>
                <button type="submit" className="login-btn" disabled={loading || networkStatus !== 'connected'}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
                <button type="button" className="login-link login-reset-link" onClick={() => {
                  setAuthMode('password-reset')
                  setResetMethod(otpProviderConfig?.telegramConfigured && otpProviderConfig?.telegramBotUsername ? 'telegram' : 'root')
                  setError('')
                  setOtpInfo('')
                }}>
                  Forgot password?
                </button>
              </>
            ) : resetMethod === 'telegram' && !isTelegramMiniApp ? null : (
              <button type="submit" className="login-btn" disabled={loading || networkStatus !== 'connected' || Boolean(passwordResetRequest && passwordResetRequest.status !== 'approved')}>
                {loading ? 'Processing...' : passwordResetRequest?.status === 'approved' ? 'Verify code and reset password' : resetMethod === 'root' ? 'Request Root approval' : 'Reset password'}
              </button>
            )}
            {authMode === 'password-reset' && (
              <button type="button" className="login-link login-reset-link" onClick={() => {
                if (passwordResetRequest) return
                setAuthMode('password')
                setError('')
                setOtpInfo('')
              }}>
                Back to sign in
              </button>
            )}
          </form>
          )}

          {mode === 'guest' && (
            <>
            <div className="guest-mode-selector" aria-label="Guest account options">
              <button
                type="button"
                className={guestMode === 'login' ? 'active' : ''}
                onClick={() => { setGuestMode('login'); setError('') }}
              >
                Guest Login
              </button>
              <button
                type="button"
                className={guestMode === 'register' ? 'active' : ''}
                onClick={() => { setGuestMode('register'); setError('') }}
              >
                Register Guest
              </button>
            </div>
            <form onSubmit={guestMode === 'register' ? handleGuestRegister : handleGuestLogin} className="login-form">
              {error && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {guestMode === 'register' && <div className="form-group">
                <label htmlFor="guestFullName">
                  <span className="label-icon">👤</span>
                  Full Name
                </label>
                <input
                  type="text"
                  id="guestFullName"
                  name="guestFullName"
                  value={guestData.fullName}
                  onChange={event => { setGuestData({ ...guestData, fullName: event.target.value }); setError('') }}
                  placeholder="Enter your full name"
                  required
                  disabled={loading}
                />
              </div>}

              <div className="form-group">
                <label htmlFor="guestPhone">
                  <span className="label-icon">📞</span>
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="guestPhone"
                  name="guestPhone"
                  value={guestData.phone}
                  onChange={event => { setGuestData({ ...guestData, phone: event.target.value }); setError('') }}
                  placeholder={guestMode === 'login' ? 'Enter your registered phone number' : '09...'}
                  autoComplete="tel"
                  required
                  disabled={loading}
                />
              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <span>{guestMode === 'register' ? '👤' : '🔓'}</span>
                    <span>{guestMode === 'register' ? 'Register as Guest' : 'Login as Guest'}</span>
                  </>
                )}
              </button>

              {guestMode === 'register' && <p className="guest-mode-note">
                Guest mode lets you pay utility amounts. You can upgrade to a full account anytime from your profile.
              </p>}
            </form>
            </>
          )}

          {/* Connection Details for Debugging */}
          {connectionDetails.isMobile && (
            <div className="connection-debug">
              <details>
                <summary>Connection Details</summary>
                <div className="debug-info">
                  <p><strong>Device:</strong> {connectionDetails.isMobile ? 'Mobile' : 'Desktop'}</p>
                  <p><strong>Current URL:</strong> {window.location.href}</p>
                  <p><strong>Hostname:</strong> {connectionDetails.hostname}</p>
                  {connectionDetails.workingUrl && (
                    <p><strong>Server:</strong> {connectionDetails.workingUrl}</p>
                  )}
                  {connectionDetails.lastError && (
                    <p><strong>Last Error:</strong> {connectionDetails.lastError}</p>
                  )}
                </div>
              </details>
            </div>
          )}

          <div className="login-footer">
            {mode === 'login' && authMode === 'password' && (
              <p className="login-signup-prompt">
                Don&apos;t have an account? <Link to="/register" className="register-link">Sign up</Link>
              </p>
            )}
            <div className="footer-links">
              <Link to="/" className="footer-link back-home-link">← Back to Home</Link>
              <span className="divider">|</span>
              <Link to="/contact" className="footer-link">Contact us</Link>
              <span className="divider">|</span>
              <button type="button" className="footer-link auth-live-chat-link" onClick={() => window.dispatchEvent(new Event('redsea:open-live-chat'))}>Live chat</button>
            </div>
          </div>
        </div>

        <div className="login-decoration">
          <div className="decoration-circle circle-1"></div>
          <div className="decoration-circle circle-2"></div>
          <div className="decoration-circle circle-3"></div>
        </div>
      </div>
    </div>
  )
}

export default UserLogin
