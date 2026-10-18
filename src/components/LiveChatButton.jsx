import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import LiveSupportChat from './LiveSupportChat'
import { getLiveChatIdentity, getLiveChatToken } from '../utils/liveChatIdentity'
import { liveChatAPI } from '../services/api'
import './LiveChatButton.css'

function LiveChatButton() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const identity = getLiveChatIdentity()
  const token = getLiveChatToken()

  useEffect(() => {
    if (!token) return undefined
    let active = true
    const updatePresence = () => {
      if (document.visibilityState !== 'visible') return
      liveChatAPI.sendClientPresence().catch(error => {
        if (active) console.error('Could not update live chat account presence:', error)
      })
    }
    updatePresence()
    const timer = window.setInterval(updatePresence, 30000)
    document.addEventListener('visibilitychange', updatePresence)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', updatePresence)
    }
  }, [location.pathname, token])

  return (
    <>
      <button
        type="button"
        className={`live-chat-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen(current => !current)}
        aria-label={open ? 'Close live chat' : 'Open live chat'}
      >
        {open ? '✕' : '💬'}
      </button>
      <section
        className="live-chat-panel"
        role="dialog"
        aria-modal="false"
        aria-label="Live chat"
        hidden={!open}
      >
        <header className="live-chat-header">
          <span className="live-chat-avatar">💬</span>
          <div className="live-chat-title">
            <strong>REDSEA Live Support</strong>
            <small>Admin &amp; Root support</small>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
        </header>
        <LiveSupportChat key={identity.identityKey} active={open} />
      </section>
    </>
  )
}

export default LiveChatButton
