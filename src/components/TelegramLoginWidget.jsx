import { useEffect, useId, useRef, useState } from 'react'
import './TelegramLoginWidget.css'

function TelegramLoginWidget({ botUsername, onAuth }) {
  const containerRef = useRef(null)
  const onAuthRef = useRef(onAuth)
  const callbackId = useId().replace(/[^A-Za-z0-9_]/g, '')
  const hostname = window.location.hostname
  const isLocalHostname = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '::1'
  const [widgetError, setWidgetError] = useState('')

  useEffect(() => {
    onAuthRef.current = onAuth
  }, [onAuth])

  useEffect(() => {
    const username = String(botUsername || '').trim().replace(/^@/, '')
    if (!username || !containerRef.current) return undefined
    if (!/^[A-Za-z0-9_]{5,32}bot$/i.test(username)) {
      setWidgetError('Telegram bot username must be 5–32 letters, numbers, or underscores and end in "bot".')
      return undefined
    }

    let active = true
    const callbackName = `onRedseaTelegramAuth${callbackId}`
    setWidgetError('')
    window[callbackName] = telegramUser => {
      if (active) onAuthRef.current(telegramUser)
    }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', username)
    script.setAttribute('data-size', 'medium')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-onauth', `${callbackName}(user)`)
    script.onerror = () => {
      if (active) setWidgetError('Telegram Login Widget could not load. Check the site connection and configure its domain with BotFather using /setdomain.')
    }
    containerRef.current.replaceChildren(script)

    return () => {
      active = false
      if (window[callbackName]) delete window[callbackName]
      containerRef.current?.replaceChildren()
    }
  }, [botUsername, callbackId])

  return (
    <>
      <div className="telegram-login-widget" ref={containerRef} aria-label="Sign in with Telegram" />
      {widgetError && <p className="telegram-login-widget-error" role="alert">{widgetError}</p>}
      <p className="telegram-login-widget-hint" role="note">
        {isLocalHostname
          ? 'Telegram Login Widget cannot use localhost. Open this page through your public HTTPS website domain, then have the bot owner authorize that hostname with BotFather using /setdomain.'
          : <>If Telegram says “Bad domain” or “Invalid domain”, the bot owner must authorize <strong>{hostname}</strong> with BotFather using /setdomain. Enter only the hostname, without https:// or a path, then reload this page.</>}
      </p>
    </>
  )
}

export default TelegramLoginWidget
