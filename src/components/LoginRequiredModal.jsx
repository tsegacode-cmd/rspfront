import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import './LoginRequiredModal.css'

function LoginRequiredModal({ isOpen, message, onClose }) {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setError('')
      setPassword('')
      setIdentifier('')
    }
  }, [isOpen])

  const handleSubmit = async event => {
    event.preventDefault()
    setError('')

    const trimmedIdentifier = identifier.trim()
    if (!trimmedIdentifier || !password.trim()) {
      setError('Enter your phone or email and password.')
      return
    }

    setLoading(true)
    try {
      const response = await authAPI.login(trimmedIdentifier, password, undefined)
      if (!response?.success) {
        setError(response?.message || 'Login failed. Please try again.')
        return
      }

      onClose?.()
      const nextRoute = String(response.user?.role || '').toLowerCase() === 'agent' ? '/agent' : '/'
      navigate(nextRoute, { replace: true })
    } catch (loginError) {
      setError(loginError.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="login-required-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose?.()
    }}>
      <div className="login-required-modal" role="dialog" aria-modal="true" aria-labelledby="login-required-title">
        <button type="button" className="login-required-close" aria-label="Close login dialog" onClick={onClose}>×</button>
        <div className="login-required-header">
          <div className="login-required-icon">🔐</div>
          <h3 id="login-required-title">Please login first</h3>
        </div>

        <p className="login-required-message">{message || 'You need to sign in before continuing.'}</p>

        <form className="login-required-form" onSubmit={handleSubmit}>
          <label className="login-required-field">
            <span>Phone or email</span>
            <input
              type="text"
              value={identifier}
              onChange={event => setIdentifier(event.target.value)}
              placeholder="e.g. +2519XX or name@example.com"
              autoComplete="username"
            />
          </label>

          <label className="login-required-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-required-error">{error}</div>}

          <button type="submit" className="login-required-submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <div className="login-required-footer">
          <span>Need an account?</span>
          <Link to="/register" onClick={onClose}>Create account</Link>
        </div>
      </div>
    </div>
  )
}

export default LoginRequiredModal
