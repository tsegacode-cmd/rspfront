import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApps, initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import { authAPI, getApiHealthUrls, isApiBackendConfigured } from '../../../../services/api'
import TelegramLoginWidget from '../../../../components/TelegramLoginWidget'
import logoImage from '../../../../logo/logo.png'
import './RootPortal.css'

function RootPortal() {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  })
  const [loginMethod, setLoginMethod] = useState('password')
  const [otpForm, setOtpForm] = useState({ phone: '', channel: 'sms', code: '', challengeId: '', newPassword: '' })
  const [error, setError] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [networkStatus, setNetworkStatus] = useState('checking')
  const [connectionDetails, setConnectionDetails] = useState({})
  const [otpProviderConfig, setOtpProviderConfig] = useState(null)
  const [otpProviderError, setOtpProviderError] = useState('')
  const [firebaseConfirmation, setFirebaseConfirmation] = useState(null)
  const firebaseAuthRef = useRef(null)
  const firebaseVerifierRef = useRef(null)
  const navigate = useNavigate()

  // Check network connectivity on component mount
  useEffect(() => {
    checkNetworkConnectivity()
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

  const checkNetworkConnectivity = async () => {
    setNetworkStatus('checking')
    
    const hostname = window.location.hostname
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const testUrls = getApiHealthUrls()

    let workingUrl = null
    let lastError = null

    for (const url of testUrls) {
      try {
        console.log(`🌐 Testing root connectivity to: ${url}`)
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          console.log(`✅ Root connection successful: ${url}`)
          workingUrl = url
          break
        }
      } catch (error) {
        console.log(`❌ Root connection failed: ${url} - ${error.message}`)
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
      setError('')
    } else {
      setNetworkStatus('failed')
      setError(!isApiBackendConfigured()
        ? 'The frontend is deployed, but the backend is not configured. Set VITE_API_URL to your public HTTPS backend URL ending in /api/v1 in Vercel, then redeploy.'
        : import.meta.env.PROD
          ? 'Cannot connect to the configured backend. Verify VITE_API_URL and backend availability.'
        : `Network connection failed. ${isMobile ? 'Make sure you\'re on the same WiFi network.' : 'Check if the backend server is running.'}`)
    }
  }

  const handleLogin = async (e) => {
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
      console.log('========================================')
      console.log('🔐 ROOT LOGIN ATTEMPT')
      console.log('========================================')
      console.log('Username:', credentials.username)
      console.log('Password:', credentials.password ? '***' : 'EMPTY')
      console.log('Working URL:', connectionDetails.workingUrl)
      console.log('Is Mobile:', connectionDetails.isMobile)
      
      // Retry logic for mobile
      let response = null
      let attempts = 0
      const maxAttempts = 3

      while (attempts < maxAttempts && !response) {
        attempts++
        try {
          console.log(`🔄 Root login attempt ${attempts}/${maxAttempts}`)
          const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
          response = await authAPI.rootLogin(credentials.username, credentials.password, preferredApiBaseUrl)
          break
        } catch (loginError) {
          console.log(`❌ Root login attempt ${attempts} failed:`, loginError.message)
          
          if (attempts < maxAttempts) {
            console.log('🔄 Retrying root login...')
            await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
          } else {
            throw loginError
          }
        }
      }
      
      console.log('========================================')
      console.log('🔐 ROOT LOGIN RESPONSE')
      console.log('========================================')
      console.log('Response:', response)
      console.log('Success:', response?.success)
      console.log('Message:', response?.message)
      console.log('Data:', response?.data)
      
      if (response && response.success) {
        console.log('✅ ROOT LOGIN SUCCESSFUL!')
        console.log('✅ Token stored in localStorage')
        console.log('✅ Navigating to /root/dashboard')
        
        // Force a small delay to ensure token is stored
        await new Promise(resolve => setTimeout(resolve, 100))
        
        navigate('/root/dashboard')
      } else {
        console.log('❌ Root login failed:', response?.message)
        setError(response?.message || 'Login failed')
      }
    } catch (err) {
      console.error('========================================')
      console.error('❌ ROOT LOGIN ERROR')
      console.error('========================================')
      console.error('Error:', err)
      console.error('Error message:', err.message)
      console.error('Error stack:', err.stack)
      
      // Provide specific error messages for mobile
      let errorMessage = 'Invalid root credentials or server connection failed'
      
      if (err.message.includes('fetch')) {
        errorMessage = connectionDetails.isMobile 
          ? 'Network error. Check WiFi connection and try again.'
          : 'Cannot connect to server. Check if backend is running.'
      } else if (err.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Server may be slow or unreachable.'
      } else if (err.message.includes('CORS')) {
        errorMessage = 'Cross-origin request blocked. Check server configuration.'
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
      setTimeout(() => setError(''), 5000)
    }
  }

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    })
    setError('')
  }

  const updateOtp = event => {
    setOtpForm(current => ({ ...current, [event.target.name]: event.target.value }))
    if (event.target.name === 'channel') {
      setFirebaseConfirmation(null)
      firebaseVerifierRef.current?.clear()
      firebaseVerifierRef.current = null
    }
    setError('')
    setOtpInfo('')
  }

  const resetOtpChallenge = () => {
    setOtpForm(current => ({ ...current, challengeId: '', code: '', newPassword: '' }))
    setFirebaseConfirmation(null)
    firebaseVerifierRef.current?.clear()
    firebaseVerifierRef.current = null
  }

  const changeLoginMethod = method => {
    setLoginMethod(method)
    setOtpForm(current => ({
      ...current,
      channel: method === 'email-otp' ? 'email' : 'sms',
      challengeId: '',
      code: '',
      newPassword: '',
    }))
    setFirebaseConfirmation(null)
    firebaseVerifierRef.current?.clear()
    firebaseVerifierRef.current = null
    setError('')
    setOtpInfo('')
  }

  const handleOtp = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setOtpInfo('')
    try {
      const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
      if (!otpForm.challengeId) {
        if (otpForm.channel === 'firebase_sms' && !/^\+[1-9]\d{7,14}$/.test(otpForm.phone.trim())) {
          throw new Error('Enter the phone number in international format, including + and the country code, for Firebase SMS.')
        }
        const response = await authAPI.sendOtp({
          phone: otpForm.channel === 'email' ? '' : otpForm.phone,
          email: otpForm.channel === 'email' ? otpForm.phone : '',
          purpose: loginMethod === 'reset' ? 'root_password_reset' : 'root_login',
          channel: otpForm.channel,
        }, preferredApiBaseUrl)
        if (otpForm.channel === 'firebase_sms') {
          if (!firebaseAuthRef.current) {
            throw new Error('Firebase SMS is not configured. Ask an administrator to finish Firebase setup in the OTP API settings.')
          }
          firebaseVerifierRef.current?.clear()
          firebaseVerifierRef.current = new RecaptchaVerifier(firebaseAuthRef.current, 'root-otp-recaptcha-container', {
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
      } else {
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
        if (loginMethod === 'reset') {
          setLoginMethod('password')
          resetOtpChallenge()
          setOtpInfo(response.data.message || 'Root password reset successfully.')
        } else {
          navigate('/root/dashboard')
        }
      }
    } catch (otpError) {
      setError(otpError.message || 'Root verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleTelegramWidgetLogin = async telegramUser => {
    if (networkStatus !== 'connected') {
      setError('No network connection. Please check connectivity.')
      return
    }

    setLoading(true)
    setError('')
    setOtpInfo('')
    try {
      const preferredApiBaseUrl = connectionDetails.workingUrl?.replace(/\/health\/?$/, '')
      await authAPI.telegramWidgetLogin(telegramUser, true, preferredApiBaseUrl)
      navigate('/root/dashboard')
    } catch (loginError) {
      setError(loginError.message || 'Telegram sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="root-portal">
      <div className="root-portal-container">
        <div className="root-portal-header">
          <div className="root-logo">
            <img className="root-icon" src={logoImage} alt="" />
            <h1>RED SEA PROPERTY</h1>
            <p className="root-subtitle">Root Portal Access</p>
          </div>
        </div>

        <div className="root-portal-content">
          {/* Network Status Indicator */}
          <div className={`network-status ${networkStatus}`}>
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
          </div>

          <div className="security-notice">
            <span className="notice-icon">⚠️</span>
            <p>Authorized Personnel Only</p>
          </div>

          <label className="root-auth-method-selector" htmlFor="rootLoginMethod">
            <span>Sign-in method</span>
            <select id="rootLoginMethod" value={loginMethod} onChange={event => changeLoginMethod(event.target.value)}>
              <option value="password">Username &amp; password</option>
              <option value="otp">OTP verification</option>
              <option value="email-otp">Email OTP</option>
              <option value="reset">Reset root password</option>
              <option value="telegram">Telegram Login</option>
            </select>
          </label>
          <form onSubmit={event => loginMethod === 'password' ? handleLogin(event) : loginMethod === 'telegram' ? event.preventDefault() : handleOtp(event)} className="root-login-form">
            {otpInfo && <div className="root-otp-info" role="status">{otpInfo}</div>}
            {loginMethod === 'password' ? (
              <>
            <div className="form-group">
              <label htmlFor="username">
                <span className="label-icon">👤</span>
                Root Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={credentials.username}
                onChange={handleChange}
                placeholder="Enter root username"
                required
                autoComplete="off"
                disabled={loading || networkStatus !== 'connected'}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <span className="label-icon">🔑</span>
                Root Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleChange}
                placeholder="Enter root password"
                required
                autoComplete="off"
                disabled={loading || networkStatus !== 'connected'}
              />
            </div>
              </>
            ) : loginMethod === 'telegram' ? (
              <div className="root-telegram-login root-full-width">
                <p>Sign in with the Telegram account linked to your root account.</p>
                {otpProviderConfig?.telegramLoginWidgetConfigured ? (
                  <TelegramLoginWidget botUsername={otpProviderConfig.telegramBotUsername} onAuth={handleTelegramWidgetLogin} />
                ) : (
                  <p className="root-otp-info" role={otpProviderError ? 'alert' : 'status'}>
                    {otpProviderError || 'Telegram Login Widget is not configured. Ask an administrator to configure the bot token, username, and domain.'}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="form-group root-full-width">
                  <label htmlFor="rootOtpPhone">{otpForm.channel === 'email' ? 'Root account email' : 'Root account phone'}</label>
                  <input
                    id="rootOtpPhone"
                    name="phone"
                    type={otpForm.channel === 'email' ? 'email' : 'tel'}
                    autoComplete={otpForm.channel === 'email' ? 'email' : 'tel'}
                    value={otpForm.phone}
                    onChange={updateOtp}
                    required
                    disabled={Boolean(otpForm.challengeId) || loading}
                    placeholder={otpForm.channel === 'email' ? 'Email address linked to your root account' : 'Phone number linked to your root account'}
                  />
                </div>
                {loginMethod === 'email-otp' ? (
                  <p className="root-otp-info root-full-width" role="note">
                    A one-time code will be sent to your registered root email through Resend. Configure email OTP in Root Dashboard → OTP API.
                  </p>
                ) : (
                  <div className="form-group root-full-width">
                    <label htmlFor="rootOtpChannel">Send code by</label>
                    <select id="rootOtpChannel" name="channel" value={otpForm.channel} onChange={updateOtp} disabled={Boolean(otpForm.challengeId) || loading}>
                      <option value="sms" disabled={!otpProviderConfig?.smsConfigured}>Direct SMS</option>
                      <option
                        value="telegram"
                        disabled={!otpProviderConfig?.telegramConfigured || !otpProviderConfig?.rootTelegramChatConfigured}
                      >
                        Telegram
                      </option>
                      <option value="firebase_sms" disabled={!otpProviderConfig?.firebaseConfigured}>Firebase SMS</option>
                      <option value="email" disabled={!otpProviderConfig?.emailConfigured}>Email OTP (Resend)</option>
                    </select>
                  </div>
                )}
                {!otpProviderError && otpProviderConfig && (!otpProviderConfig.firebaseConfigured || !otpProviderConfig.emailConfigured) && (
                  <p className="root-otp-info" role="note">
                    OTP methods are enabled after an administrator configures them in Root Dashboard → OTP API.
                  </p>
                )}
                {otpProviderError && <p className="root-otp-info" role="alert">{otpProviderError}</p>}
                {otpForm.channel === 'telegram' && (
                  <p className="root-otp-info" role="note">
                    The code is sent to the configured root Telegram recipient. If delivery is not configured, use password or SMS to sign in and ask an administrator to configure Telegram delivery.
                  </p>
                )}
                {otpForm.channel === 'firebase_sms' && (
                  <p className="root-otp-info" role="note">
                    Firebase sends a code to this root phone number. Use international format, including + and the country code.
                  </p>
                )}
                {otpForm.channel === 'email' && (
                  <p className="root-otp-info" role="note">
                    The verification code goes to the email address registered on the root account.
                  </p>
                )}
                {otpForm.channel === 'firebase_sms' && <div id="root-otp-recaptcha-container" aria-hidden="true" />}
                {otpForm.challengeId && (
                  <button type="button" className="otp-change-phone" onClick={resetOtpChallenge}>
                    Change phone, email, or delivery method
                  </button>
                )}
                {otpForm.challengeId && (
                  <div className="form-group root-full-width">
                    <label htmlFor="rootOtpCode">6-digit code</label>
                    <input id="rootOtpCode" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otpForm.code} onChange={updateOtp} required />
                  </div>
                )}
                {loginMethod === 'reset' && otpForm.challengeId && (
                  <div className="form-group root-full-width">
                    <label htmlFor="rootNewPassword">New root password (min 6 characters)</label>
                    <input id="rootNewPassword" name="newPassword" type="password" autoComplete="new-password" minLength={6} value={otpForm.newPassword} onChange={updateOtp} required />
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="error-message">
                <span className="error-icon">❌</span>
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

            {loginMethod !== 'telegram' && <button 
              type="submit" 
              className="root-login-btn" 
              disabled={loading || networkStatus !== 'connected'}
            >
              <span className="btn-icon">🚀</span>
              {loading ? 'Please wait...' : networkStatus !== 'connected' ? 'No Connection' : loginMethod === 'password' ? 'Access Root Dashboard' : otpForm.challengeId ? (loginMethod === 'reset' ? 'Reset root password' : 'Verify and access dashboard') : loginMethod === 'email-otp' ? 'Send email OTP' : 'Send root OTP'}
            </button>}
          </form>

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

          <div className="root-info">
            <div className="info-item">
              <span className="info-icon">🛡️</span>
              <span>Secure Connection</span>
            </div>
            <div className="info-item">
              <span className="info-icon">📊</span>
              <span>Full System Access</span>
            </div>
            <div className="info-item">
              <span className="info-icon">⚙️</span>
              <span>Admin Controls</span>
            </div>
          </div>
        </div>

        <div className="root-portal-footer">
          <p>© 2024 REDSEA - Root Portal v1.0</p>
          <p className="footer-warning">All activities are logged and monitored</p>
        </div>
      </div>
    </div>
  )
}

export default RootPortal
