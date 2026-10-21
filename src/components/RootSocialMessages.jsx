import { useEffect, useMemo, useState } from 'react'
import { socialAPI } from '../services/api'
import Pagination, { getPageItems, PAGE_SIZE } from './Pagination'

const getRootUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('rootUser') || '{}')
    const id = user.id ?? user._id
    return id == null ? '' : String(id)
  } catch (error) {
    console.error('Could not read the root account for messaging:', error)
    return ''
  }
}

function RootSocialMessages() {
  const [accounts, setAccounts] = useState([])
  const [threads, setThreads] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [selectedPeer, setSelectedPeer] = useState(null)
  const [messages, setMessages] = useState([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accountPage, setAccountPage] = useState(0)
  const [threadPage, setThreadPage] = useState(0)
  const rootUserId = useMemo(getRootUserId, [])
  const safeAccountPage = Math.min(accountPage, Math.max(0, Math.ceil(accounts.length / PAGE_SIZE) - 1))
  const safeThreadPage = Math.min(threadPage, Math.max(0, Math.ceil(threads.length / PAGE_SIZE) - 1))
  const visibleAccounts = getPageItems(accounts, safeAccountPage)
  const visibleThreads = getPageItems(threads, safeThreadPage)

  const loadThreads = async userId => {
    const response = await socialAPI.getRootUserThreads(userId)
    setThreads(response.data || [])
  }

  const loadConversation = async (account, peer) => {
    const response = await socialAPI.getRootMessageConversation(account.user_id, peer.user_id)
    setMessages(response.data || [])
    setSelectedPeer(peer)
  }

  useEffect(() => {
    setAccountPage(0)
    let active = true
    const timer = window.setTimeout(() => {
      socialAPI.getRootMessageUsers(query.trim(), role)
        .then(response => { if (active) setAccounts(response.data || []) })
        .catch(loadError => { if (active) setError(loadError.message || 'Could not search accounts.') })
    }, 200)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, role])

  useEffect(() => {
    if (!selectedAccount) return undefined
    let active = true
    const refresh = async () => {
      try {
        const [threadResponse, conversationResponse] = await Promise.all([
          socialAPI.getRootUserThreads(selectedAccount.user_id),
          selectedPeer
            ? socialAPI.getRootMessageConversation(selectedAccount.user_id, selectedPeer.user_id)
            : Promise.resolve(null),
        ])
        if (active) {
          setThreads(threadResponse.data || [])
          if (conversationResponse) setMessages(conversationResponse.data || [])
        }
      } catch (refreshError) {
        if (active) setError(refreshError.message || 'Could not refresh account messages.')
      }
    }
    const interval = window.setInterval(refresh, 12000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [selectedAccount?.user_id, selectedPeer?.user_id])

  const selectAccount = async account => {
    setSelectedAccount(account)
    setSelectedPeer(null)
    setMessages([])
    setThreadPage(0)
    setError('')
    try {
      await loadThreads(account.user_id)
      if (!rootUserId) {
        setError('The root account ID is missing, so direct messages cannot be opened.')
        return
      }
      await loadConversation(account, {
        user_id: rootUserId,
        full_name: 'Root administrator',
        username: 'root',
        role: 'root',
      })
    } catch (loadError) {
      setError(loadError.message || 'Could not load this account’s messages.')
    }
  }

  const send = async event => {
    event.preventDefault()
    if (!selectedAccount || selectedPeer?.user_id !== rootUserId || !draft.trim()) return
    setBusy(true)
    setError('')
    try {
      await socialAPI.sendRootMessage(selectedAccount.user_id, draft.trim())
      setDraft('')
      await loadConversation(selectedAccount, selectedPeer)
      await loadThreads(selectedAccount.user_id)
    } catch (sendError) {
      setError(sendError.message || 'Could not send the message.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="root-social-messages" aria-label="User messages">
      <div className="root-social-account-list">
        <h3>Search accounts</h3>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, username, or email" aria-label="Search all accounts" />
        <input value={role} onChange={event => setRole(event.target.value)} placeholder="Filter role (leave blank for all)" aria-label="Filter accounts by role" />
        <div className="root-social-scroll">
          {visibleAccounts.map(account => (
            <button
              key={account.user_id}
              type="button"
              className={selectedAccount?.user_id === account.user_id ? 'selected' : ''}
              onClick={() => selectAccount(account)}
            >
              <strong>{account.full_name}</strong>
              <small>@{account.username} · {account.role}</small>
              <span className={`root-social-status ${account.is_online ? 'online' : ''}`}>
                {account.is_online ? 'Online' : 'Offline'}
              </span>
            </button>
          ))}
          {!accounts.length && <p>No accounts match this search.</p>}
        </div>
        <Pagination
          page={safeAccountPage}
          itemCount={accounts.length}
          onPageChange={setAccountPage}
          label="accounts"
        />
      </div>
      <div className="root-social-thread-list">
        <h3>{selectedAccount ? `${selectedAccount.full_name}’s chats` : 'Conversations'}</h3>
        {selectedAccount && rootUserId && (
          <button
            type="button"
            className={`root-social-thread ${selectedPeer?.user_id === rootUserId ? 'selected' : ''}`}
            onClick={() => loadConversation(selectedAccount, {
              user_id: rootUserId,
              full_name: 'Root administrator',
              username: 'root',
              role: 'root',
            }).catch(loadError => setError(loadError.message || 'Could not load the root conversation.'))}
          >
            <strong>Root direct message</strong><small>Open or start a private chat</small>
          </button>
        )}
        <div className="root-social-scroll">
          {visibleThreads.map(thread => (
            <button
              key={thread.user_id}
              type="button"
              className={`root-social-thread ${selectedPeer?.user_id === thread.user_id ? 'selected' : ''}`}
              onClick={() => loadConversation(selectedAccount, thread)
                .catch(loadError => setError(loadError.message || 'Could not load the selected chat.'))}
            >
              <strong>{thread.full_name}</strong>
              <small>@{thread.username} · {thread.role} · {thread.is_online ? 'Online' : 'Offline'}</small>
              <span>{thread.last_message || 'No messages'}</span>
            </button>
          ))}
        </div>
        <Pagination
          page={safeThreadPage}
          itemCount={threads.length}
          onPageChange={setThreadPage}
          label="conversations"
        />
      </div>
      <div className="root-social-conversation">
        <h3>{selectedPeer ? `${selectedAccount?.full_name} ↔ ${selectedPeer.full_name}` : 'Select an account to view messages'}</h3>
        {error && <p className="root-social-error" role="alert">{error}</p>}
        {selectedPeer && (
          <>
            <div className="root-social-message-list">
              {messages.map(item => (
                !item.type?.startsWith('call-') &&
                <article className={item.sender_id === rootUserId ? 'mine' : ''} key={item.message_id}>
                  <small>{item.sender_name} · {new Date(item.created_at + (item.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</small>
                  {item.type === 'voice'
                    ? <audio controls preload="metadata" src={item.body}>Your browser cannot play this voice message.</audio>
                    : <p>{item.body}</p>}
                </article>
              ))}
              {!messages.some(item => !item.type?.startsWith('call-')) && <p className="root-social-empty">No messages in this conversation yet.</p>}
            </div>
            {selectedPeer.user_id === rootUserId ? (
              <form onSubmit={send}>
                <input value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder={`Message ${selectedAccount.full_name} as Root`} required />
                <button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}</button>
              </form>
            ) : (
              <p className="root-social-empty">This is a user-to-user conversation. Open Root direct message to contact {selectedAccount.full_name} as Root.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default RootSocialMessages
