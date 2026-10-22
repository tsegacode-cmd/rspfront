import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { marketplaceAPI, socialAPI } from '../services/api'
import { getAccountRole } from '../utils/guestAccount'
import { getSocialShareLinks } from '../utils/socialSharing'
import { playAppSound } from '../utils/appSounds'
import '../pages/SocialFeatures.css'

const TITLES = { friends: 'Friends', message: 'Messages', notification: 'Notifications' }
const currentUserId = () => {
  try { return String(JSON.parse(localStorage.getItem('userData') || '{}').id || '') }
  catch { return '' }
}
const CALL_SIGNAL_TYPES = new Set(['call-offer', 'call-answer', 'call-end'])
const MEDIA_MESSAGE_LIMIT = 8 * 1024 * 1024
const IMAGE_MESSAGE_LIMIT = 5 * 1024 * 1024
const newCallId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
const fileToDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(reader.error || new Error('Could not read the selected image.'))
  reader.readAsDataURL(file)
})
const normalizeVoiceDataUrl = (dataUrl, mimeType) => {
  const separator = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || separator < 0) {
    throw new Error('The microphone recording could not be prepared.')
  }
  const detectedMime = dataUrl.slice(5, separator).split(';', 1)[0].trim().toLowerCase()
  const mime = (mimeType || detectedMime).split(';', 1)[0].trim().toLowerCase()
  if (!mime.startsWith('audio/')) {
    throw new Error('The microphone did not produce a supported audio recording. Check the selected microphone and try again.')
  }
  return `data:${mime};base64,${dataUrl.slice(separator + 1)}`
}
const isWithinMessageEditWindow = createdAt => {
  const raw = String(createdAt)
  const timestamp = Date.parse(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`)
  const age = Date.now() - timestamp
  return Number.isFinite(timestamp) && age >= 0 && age <= 15 * 24 * 60 * 60 * 1000
}
const stopMediaStream = stream => {
  if (!stream) return
  stream.getTracks().forEach(track => {
    try { track.stop() } catch (error) { console.warn('Could not stop media track:', error) }
  })
}
const getSupportedMimeType = (candidates = []) => {
  for (const candidate of candidates) {
    if (candidate && MediaRecorder?.isTypeSupported?.(candidate)) return candidate
  }
  return null
}
const getIceServers = () => {
  const configured = import.meta.env.VITE_WEBRTC_ICE_SERVERS
  if (configured) {
    let servers
    try { servers = JSON.parse(configured) }
    catch { throw new Error('VITE_WEBRTC_ICE_SERVERS must be a JSON array of ICE server settings.') }
    if (!Array.isArray(servers) || !servers.length || servers.some(server => (
      !server || !(typeof server.urls === 'string' || (
        Array.isArray(server.urls) && server.urls.length && server.urls.every(url => typeof url === 'string')
      ))
    ))) {
      throw new Error('VITE_WEBRTC_ICE_SERVERS must contain ICE servers with valid urls.')
    }
    return servers
  }
  return (import.meta.env.VITE_WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean)
    .map(url => ({ urls: url }))
}
const formatAccountRole = role => String(role || 'user')
  .trim()
  .split(/[\s_-]+/)
  .filter(Boolean)
  .map(part => `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`)
  .join(' ') || 'User'
const formatAccountCreatedAt = createdAt => {
  if (!createdAt) return 'Creation date unavailable'
  const date = new Date(String(createdAt).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? 'Creation date unavailable' : date.toLocaleDateString()
}
const presenceLabel = person => (
  <small className={`social-presence ${person.is_online ? 'online' : 'offline'}`}>
    <span aria-hidden="true" />{person.is_online ? 'Online' : 'Offline'}
    {` · ${formatAccountRole(person.role)}`}
  </small>
)

const renderMessageBody = body => String(body).split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
  if (!/^https?:\/\//i.test(part)) return part
  try {
    const url = new URL(part)
    if (!['http:', 'https:'].includes(url.protocol)) return part
    return <a key={`${index}-${url.href}`} href={url.href}>{part}</a>
  } catch {
    return part
  }
})
const renderCoinGift = (item, userId) => {
  let gift
  try {
    gift = JSON.parse(item.body || '{}')
  } catch {
    gift = {}
  }
  const amount = Number(gift.amount)
  const bonus = Number(gift.giftBonus)
  return (
    <div className="social-chat-gift-card">
      <span aria-hidden="true">🎁</span>
      <strong>{Number.isSafeInteger(amount) && amount > 0 ? amount.toLocaleString() : 'A'} coins</strong>
      {Number.isSafeInteger(bonus) && bonus > 0 && <small>+ {bonus.toLocaleString()} bonus coins</small>}
      <small>{String(item.sender_id) === userId ? 'Gift sent' : 'Gift received'}</small>
    </div>
  )
}

function Popup({ title, onClose, children }) {
  const closeButtonRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = event => {
      if (event.key === 'Escape') onCloseRef.current()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div className="social-popup-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="social-popup" role="dialog" aria-modal="true" aria-label={title}>
        <header><strong>{title}</strong><button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`Close ${title}`}>×</button></header>
        <div className="social-popup-content">{children}</div>
      </section>
    </div>
  )
}

function SocialPopups({ activePopup, onClose }) {
  const navigate = useNavigate()
  const [friends, setFriends] = useState({ following: [], followers: [], requests: [], sent: [] })
  const [people, setPeople] = useState([])
  const [search, setSearch] = useState('')
  const [friendsTab, setFriendsTab] = useState('find')
  const [inviteUrl, setInviteUrl] = useState('')
  const [showInviteRecipients, setShowInviteRecipients] = useState(false)
  const [sentInvites, setSentInvites] = useState({})
  const [inbox, setInbox] = useState([])
  const [conversation, setConversation] = useState([])
  const [recipient, setRecipient] = useState(null)
  const [giftRecipientId, setGiftRecipientId] = useState('')
  const [giftAmount, setGiftAmount] = useState('')
  const [giftCoinBalance, setGiftCoinBalance] = useState(null)
  const [giftNotice, setGiftNotice] = useState('')
  const [message, setMessage] = useState('')
  const [replyTarget, setReplyTarget] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageCaption, setImageCaption] = useState('')
  const [forwardingMessageId, setForwardingMessageId] = useState('')
  const [forwardRecipientId, setForwardRecipientId] = useState('')
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [promotions, setPromotions] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recordingVoice, setRecordingVoice] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [callState, setCallState] = useState('idle')
  const [callMediaType, setCallMediaType] = useState('audio')
  const [incomingCall, setIncomingCall] = useState(null)
  const [localCallStream, setLocalCallStream] = useState(null)
  const [remoteCallStream, setRemoteCallStream] = useState(null)
  const [speakerPlaybackBlocked, setSpeakerPlaybackBlocked] = useState(false)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const peerRef = useRef(null)
  const callIdRef = useRef('')
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const voiceRecorderRef = useRef(null)
  const voiceSendInFlightRef = useRef(false)
  const voiceChunksRef = useRef([])
  const voiceStreamRef = useRef(null)
  const voiceRecordingStartedAtRef = useRef(0)
  const voiceTimeoutRef = useRef(null)
  const callTimeoutRef = useRef(null)
  const processedSignalsRef = useRef(new Set())
  const lastMessageIdRef = useRef('')
  const knownConversationMessageIdsRef = useRef(new Set())
  const currentUserIdRef = useRef(currentUserId())
  const callStateRef = useRef(callState)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const imageInputRef = useRef(null)
  callStateRef.current = callState
  const friendList = [...new Map(
    [...friends.following, ...friends.followers].map(person => [String(person.user_id), person])
  ).values()]
  const followConnectionIds = new Set(friendList.map(person => String(person.user_id)))

  const loadFriends = async () => {
    const [response, peopleResponse] = await Promise.all([
      socialAPI.getFriends(),
      socialAPI.getPeople(search.trim())
    ])
    setFriends(response.data)
    setPeople(peopleResponse.data)
  }
  const loadInbox = async () => {
    const [messages, followResponse, peopleResponse] = await Promise.all([
      socialAPI.getInbox(),
      socialAPI.getFriends(),
      socialAPI.getPeople(search.trim())
    ])
    setInbox(messages.data)
    setFriends(followResponse.data)
    setPeople(peopleResponse.data)
  }

  useEffect(() => {
    let active = true
    setError('')
    const load = async () => {
      try {
        if (activePopup === 'friends') {
          await loadFriends()
          const [code] = await Promise.all([socialAPI.getReferralCode()])
          if (active) setInviteUrl(`${window.location.origin}/register?ref=${encodeURIComponent(code.data.referralCode)}`)
        }
        if (activePopup === 'message') await loadInbox()
        if (activePopup === 'notification') {
          const role = getAccountRole()
          let audience = role === 'guest' ? 'guest' : 'user'
          try {
            const user = JSON.parse(localStorage.getItem('userData') || '{}')
            const status = String(user.payment_status || user.paymentStatus || (user.is_paid === true ? 'paid' : user.is_paid === false ? 'unpaid' : '')).toLowerCase()
            if (['paid', 'unpaid', 'other'].includes(status)) audience = status
          } catch (profileError) {
            console.error('Could not determine notification audience:', profileError)
          }
          const [, response, promotionResponse] = await Promise.all([
            socialAPI.markNotificationsRead(),
            socialAPI.getNotifications(),
            marketplaceAPI.getPromotions(audience),
          ])
          if (active) {
            setNotifications(response.data)
            setPromotions(promotionResponse.data.filter(item => item.alert_enabled))
          }
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not load social data.')
      }
    }
    load()
    return () => { active = false }
  }, [activePopup])

  useEffect(() => {
    if (!['friends', 'message'].includes(activePopup)) return undefined
    if (activePopup === 'friends' && friendsTab !== 'find') {
      setPeople([])
      return undefined
    }
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const response = await socialAPI.getPeople(search.trim())
        if (active) setPeople(response.data)
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not search accounts.')
      }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [activePopup, friendsTab, search])

  useEffect(() => {
    if (!['friends', 'message'].includes(activePopup)) return undefined
    let active = true
    const refreshPresence = async () => {
      try {
        if (activePopup === 'friends') {
          await loadFriends()
        } else {
          await loadInbox()
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not refresh messages and online status.')
      }
    }
    const interval = window.setInterval(refreshPresence, 15000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [activePopup, recipient?.user_id, search])

  const act = async callback => {
    setBusy(true)
    setError('')
    try { await callback() }
    catch (actionError) { setError(actionError.message || 'That action could not be completed.') }
    finally { setBusy(false) }
  }

  const openConversation = person => act(async () => {
    setRecipient(person)
    setIncomingCall(null)
    setConversation([])
    setReplyTarget(null)
    setSelectedImage(null)
    setForwardingMessageId('')
    lastMessageIdRef.current = ''
    knownConversationMessageIdsRef.current = new Set()
    const response = await socialAPI.getConversation(person.user_id)
    setConversation(response.data)
    knownConversationMessageIdsRef.current = new Set(response.data.map(item => item.message_id))
    window.dispatchEvent(new Event('redsea:social-updated'))
    lastMessageIdRef.current = response.data.length
      ? response.data[response.data.length - 1].message_id
      : ''
    await processCallSignals(response.data, person)
  })

  const appendConversationMessages = rows => {
    if (!rows.length) return
    lastMessageIdRef.current = rows[rows.length - 1].message_id
    const additions = rows.filter(item => !knownConversationMessageIdsRef.current.has(item.message_id))
    additions.forEach(item => knownConversationMessageIdsRef.current.add(item.message_id))
    if (!additions.length) return
    setConversation(current => [...current, ...additions])
    playAppSound('message')
  }

  const send = event => {
    event.preventDefault()
    if (!recipient || !message.trim()) return
    act(async () => {
      await socialAPI.sendConversationMessage(recipient.user_id, message.trim(), 'text', {
        replyToMessageId: replyTarget?.message_id || null,
      })
      setMessage('')
      setReplyTarget(null)
      const response = await socialAPI.getConversation(recipient.user_id, lastMessageIdRef.current)
      appendConversationMessages(response.data)
      await loadInbox()
    })
  }

  const toggleFriendGift = person => {
    if (giftRecipientId === String(person.user_id)) {
      setGiftRecipientId('')
      setGiftAmount('')
      setGiftNotice('')
      return
    }
    act(async () => {
      const response = await socialAPI.getWallet()
      const walletBalance = Number(response?.data?.coinBalance ?? response?.data?.balance ?? 0)
      setGiftCoinBalance(Number.isFinite(walletBalance) ? walletBalance : 0)
      setGiftNotice('')
      setGiftAmount('')
      setGiftRecipientId(String(person.user_id))
    })
  }

  const sendFriendGift = event => {
    event.preventDefault()
    const friend = friendList.find(person => String(person.user_id) === giftRecipientId)
    const amount = Number(giftAmount)

    if (!friend) {
      setGiftNotice('Choose a friend before sending a coin gift.')
      return
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setGiftNotice('Enter a positive whole-number coin gift.')
      return
    }
    if (Number.isFinite(giftCoinBalance) && amount > giftCoinBalance) {
      setGiftNotice(`Insufficient balance. You have ${Math.max(0, giftCoinBalance).toLocaleString()} coins available.`)
      return
    }
    act(async () => {
      try {
        const response = await socialAPI.giftCoins(friend.username, amount)
        const nextBalance = Number(response?.data?.senderCoinBalance ?? response?.data?.walletBalance ?? giftCoinBalance ?? 0)
        setGiftCoinBalance(Number.isFinite(nextBalance) ? nextBalance : 0)
        setGiftNotice(`Gift sent to @${response.data.recipient}. They received ${Number(response.data.amount + response.data.giftBonus).toLocaleString()} coins including gift rewards.`)
        setGiftRecipientId('')
        setGiftAmount('')
        if (recipient && String(recipient.user_id) === String(friend.user_id)) {
          const conversationResponse = await socialAPI.getConversation(recipient.user_id, lastMessageIdRef.current)
          appendConversationMessages(conversationResponse.data)
        }
        await loadInbox()
      } catch (giftError) {
        setGiftNotice(giftError.message || 'Could not send the gift coin. Please try again.')
      }
    })
  }

  const editConversationMessage = async item => {
    const editedBody = window.prompt('Edit your message', item.type === 'image' ? item.caption || '' : item.body || '')
    if (editedBody === null) return
    await act(async () => {
      await socialAPI.updateMessage(item.message_id, item.type === 'image' ? undefined : editedBody, item.type === 'image' ? editedBody : undefined)
      const response = await socialAPI.getConversation(recipient.user_id)
      setConversation(response.data)
      lastMessageIdRef.current = response.data.at(-1)?.message_id || ''
    })
  }

  const deleteConversationMessage = async item => {
    await act(async () => {
      await socialAPI.deleteMessage(item.message_id)
      const response = await socialAPI.getConversation(recipient.user_id)
      setConversation(response.data)
      setPendingDeleteMessage(null)
    })
  }

  const sendConversationImage = async event => {
    event.preventDefault()
    if (!recipient || !selectedImage) return
    await act(async () => {
      const imageData = await fileToDataUrl(selectedImage)
      await socialAPI.sendConversationMessage(recipient.user_id, imageData, 'image', {
        caption: imageCaption.trim(),
        replyToMessageId: replyTarget?.message_id || null,
      })
      setSelectedImage(null)
      setImageCaption('')
      setReplyTarget(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
      const response = await socialAPI.getConversation(recipient.user_id)
      appendConversationMessages(response.data)
    })
  }

  const forwardConversationMessage = async () => {
    if (!forwardingMessageId || !forwardRecipientId) return
    await act(async () => {
      await socialAPI.forwardMessage(forwardingMessageId, forwardRecipientId)
      setForwardingMessageId('')
      setForwardRecipientId('')
      await loadInbox()
      if (String(forwardRecipientId) === String(recipient?.user_id)) {
        const response = await socialAPI.getConversation(recipient.user_id)
        setConversation(response.data)
        lastMessageIdRef.current = response.data.at(-1)?.message_id || ''
      }
    })
  }

  const closeCall = () => {
    peerRef.current?.close()
    peerRef.current = null
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    setLocalCallStream(null)
    setRemoteCallStream(null)
    setCallState('idle')
    setCallMediaType('audio')
    setIncomingCall(null)
    setSpeakerPlaybackBlocked(false)
    setMicrophoneEnabled(true)
    setCameraEnabled(true)
    callIdRef.current = ''
    window.clearTimeout(callTimeoutRef.current)
  }

  const processCallSignals = async (rows, selectedRecipient = recipient) => {
    if (!selectedRecipient) return
    const me = currentUserIdRef.current
    for (const item of rows || []) {
      if (!CALL_SIGNAL_TYPES.has(item.type) || String(item.sender_id) === me || processedSignalsRef.current.has(item.message_id)) continue
      processedSignalsRef.current.add(item.message_id)
      if (item.type === 'call-offer') {
        const createdAt = Date.parse(String(item.created_at).replace(' ', 'T') + 'Z')
        if (Number.isNaN(createdAt) || Date.now() - createdAt > 120000) continue
        let offer
        try { offer = JSON.parse(item.body) }
        catch (parseError) {
          console.error('Could not read an incoming call offer:', parseError)
          continue
        }
        if (
          (offer.mediaType === 'audio' || offer.mediaType === 'video') &&
          typeof offer.callId === 'string' && offer.callId &&
          (!callIdRef.current || callIdRef.current === offer.callId)
        ) {
          callIdRef.current = offer.callId
          setIncomingCall({
            ...item,
            callId: offer.callId,
            mediaType: offer.mediaType,
            description: offer.description,
          })
        }
      } else if (item.type === 'call-answer' && callStateRef.current === 'calling' && peerRef.current) {
        try {
          const answer = JSON.parse(item.body)
          if (answer.callId !== callIdRef.current) continue
          await peerRef.current.setRemoteDescription(answer.description)
          window.clearTimeout(callTimeoutRef.current)
          setCallState('connecting')
        } catch (answerError) {
          setError(answerError.message || 'Could not connect this call.')
        }
      } else if (item.type === 'call-end') {
        try {
          const signal = JSON.parse(item.body)
          if (signal.callId === callIdRef.current || signal.callId === incomingCall?.callId) closeCall()
        } catch (signalError) {
          setError(signalError.message || 'Could not process the call ending.')
        }
      }
    }
  }

  useEffect(() => {
    if (!activePopup || !recipient) return undefined
    let active = true
    const refreshConversation = async () => {
      try {
        const response = await socialAPI.getConversation(recipient.user_id, lastMessageIdRef.current)
        if (!active) return
        appendConversationMessages(response.data)
        await processCallSignals(response.data, recipient)
      } catch (refreshError) {
        if (active) setError(refreshError.message || 'Could not refresh this conversation.')
      }
    }
    const timer = window.setInterval(refreshConversation, 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [activePopup, recipient?.user_id])

  useEffect(() => {
    let active = true
    const checkIncomingCalls = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        if (recipient && activePopup !== 'message' && (incomingCall || callStateRef.current !== 'idle')) {
          const response = await socialAPI.getConversation(recipient.user_id, lastMessageIdRef.current)
          if (!active) return
          appendConversationMessages(response.data)
          await processCallSignals(response.data, recipient)
          if (
            incomingCall &&
            Date.now() - Date.parse(String(incomingCall.created_at).replace(' ', 'T') + 'Z') > 120000
          ) {
            closeCall()
            setError('This call invitation expired.')
          }
          return
        }
        if (callStateRef.current !== 'idle' || incomingCall) return
        const response = await socialAPI.getInbox()
        if (!active) return
        for (const item of response.data) {
          if (item.type !== 'call-offer' || processedSignalsRef.current.has(item.message_id)) continue
          const createdAt = Date.parse(String(item.created_at).replace(' ', 'T') + 'Z')
          if (Number.isNaN(createdAt) || Date.now() - createdAt > 120000) {
            processedSignalsRef.current.add(item.message_id)
            continue
          }
          let offer
          try { offer = JSON.parse(item.body) }
          catch (parseError) {
            processedSignalsRef.current.add(item.message_id)
            console.error('Could not read an incoming call offer:', parseError)
            continue
          }
          if (
            !['audio', 'video'].includes(offer.mediaType) ||
            typeof offer.callId !== 'string' || !offer.callId ||
            (callIdRef.current && callIdRef.current !== offer.callId)
          ) continue
          const endedCallIds = new Set(response.data
            .filter(message => message.type === 'call-end')
            .map(message => {
              try { return JSON.parse(message.body).callId }
              catch { return '' }
            }))
          if (endedCallIds.has(offer.callId)) {
            processedSignalsRef.current.add(item.message_id)
            continue
          }
          processedSignalsRef.current.add(item.message_id)
          const callerId = String(item.sender_id)
          if (String(recipient?.user_id) !== callerId) {
            setConversation([])
            lastMessageIdRef.current = ''
            setRecipient({ user_id: callerId, username: item.sender_name, full_name: item.sender_name })
          }
          callIdRef.current = offer.callId
          setIncomingCall({
            ...item,
            callId: offer.callId,
            mediaType: offer.mediaType,
            description: offer.description,
          })
          return
        }
      } catch (pollError) {
        if (active) console.error('Could not check for incoming friend calls:', pollError)
      }
    }
    checkIncomingCalls()
    const timer = window.setInterval(checkIncomingCalls, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [activePopup, callState, incomingCall, recipient?.user_id])

  useEffect(() => {
    if (localCallStream && localVideoRef.current) localVideoRef.current.srcObject = localCallStream
  }, [localCallStream])

  useEffect(() => {
    if (!remoteCallStream) return

    const audioStream = new MediaStream(remoteCallStream.getAudioTracks())
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = audioStream
      if (audioStream.getAudioTracks().length) {
        remoteAudioRef.current.play()
          .then(() => setSpeakerPlaybackBlocked(false))
          .catch(() => setSpeakerPlaybackBlocked(true))
      }
    }

    const videoStream = new MediaStream(remoteCallStream.getVideoTracks())
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = videoStream
  }, [remoteCallStream])

  useEffect(() => () => {
    peerRef.current?.close()
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    const recorder = voiceRecorderRef.current
    if (recorder?.state === 'recording') {
      recorder.onstop = null
      recorder.stop()
    }
    voiceStreamRef.current?.getTracks().forEach(track => track.stop())
    window.clearTimeout(voiceTimeoutRef.current)
    window.clearTimeout(callTimeoutRef.current)
  }, [])

  const waitForIceGathering = peer => new Promise(resolve => {
    if (peer.iceGatheringState === 'complete') return resolve()
    const finish = () => {
      window.clearTimeout(timeout)
      peer.removeEventListener('icegatheringstatechange', onStateChange)
      resolve()
    }
    const onStateChange = () => {
      if (peer.iceGatheringState === 'complete') finish()
    }
    const timeout = window.setTimeout(finish, 10000)
    peer.addEventListener('icegatheringstatechange', onStateChange)
  })

  const createCallPeer = stream => {
    if (!stream.getAudioTracks().length) {
      throw new Error('No microphone audio track is available. Check your microphone and permission, then try again.')
    }
    const peer = new RTCPeerConnection({ iceServers: getIceServers() })
    peerRef.current = peer
    stream.getTracks().forEach(track => peer.addTrack(track, stream))
    peer.ontrack = event => {
      const streamWithTracks = event.streams[0] || remoteStreamRef.current || new MediaStream()
      if (!event.streams[0] && !streamWithTracks.getTracks().includes(event.track)) {
        streamWithTracks.addTrack(event.track)
      }
      if (streamWithTracks) {
        remoteStreamRef.current = streamWithTracks
        setRemoteCallStream(new MediaStream(streamWithTracks.getTracks()))
      }
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setCallState('connected')
      if (peer.connectionState === 'connecting') setCallState('connecting')
      if (['failed', 'closed'].includes(peer.connectionState)) closeCall()
    }
    return peer
  }

  const startCall = async mediaType => {
    if (!recipient || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setError('Calls require a supported browser and a secure HTTPS connection (or localhost).')
      return
    }
    try {
      setError('')
      callIdRef.current = newCallId()
      setCallState('calling')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mediaType === 'video',
      })
      localStreamRef.current = stream
      setLocalCallStream(stream)
      setCallMediaType(mediaType)
      const peer = createCallPeer(stream)
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await waitForIceGathering(peer)
      await socialAPI.sendMessage(recipient.user_id, JSON.stringify({
        callId: callIdRef.current,
        mediaType,
        description: peer.localDescription,
      }), 'call-offer')
      callTimeoutRef.current = window.setTimeout(() => {
        if (callStateRef.current !== 'connected' && callStateRef.current !== 'idle') {
          const failureMessage = callStateRef.current === 'calling'
            ? 'No answer yet. You can try calling again.'
            : 'The call could not connect. Check your network and try again.'
          closeCall()
          setError(failureMessage)
        }
      }, 60000)
    } catch (callError) {
      closeCall()
      setError(callError.name === 'NotAllowedError'
        ? 'Allow microphone and camera access in your browser or phone settings, then try again.'
        : !window.isSecureContext
          ? 'Calls and voice messages require HTTPS on mobile, or localhost during development.'
          : callError.message || 'Could not start the call.')
    }
  }

  const answerCall = async () => {
    if (!incomingCall || !recipient) return
    const pendingCall = incomingCall
    try {
      setCallState('connecting')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: pendingCall.mediaType === 'video',
      })
      localStreamRef.current = stream
      callIdRef.current = pendingCall.callId
      setLocalCallStream(stream)
      setCallMediaType(pendingCall.mediaType)
      const peer = createCallPeer(stream)
      await peer.setRemoteDescription(pendingCall.description)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await waitForIceGathering(peer)
      await socialAPI.sendMessage(recipient.user_id, JSON.stringify({
        callId: pendingCall.callId,
        mediaType: pendingCall.mediaType,
        description: peer.localDescription,
      }), 'call-answer')
      setCallState('connecting')
      setIncomingCall(null)
    } catch (callError) {
      closeCall()
      callIdRef.current = pendingCall.callId
      setIncomingCall(pendingCall)
      setError(callError.name === 'NotAllowedError'
        ? 'Allow microphone and camera access in your browser or phone settings, then try again.'
        : !window.isSecureContext
          ? 'Calls and voice messages require HTTPS on mobile, or localhost during development.'
          : callError.message || 'Could not answer the call.')
    }
  }

  const endCall = async () => {
    const peer = recipient
    const callId = callIdRef.current || incomingCall?.callId
    closeCall()
    if (peer && callId) {
      try { await socialAPI.sendMessage(peer.user_id, JSON.stringify({ callId, ended: true }), 'call-end') }
      catch (callError) { setError(callError.message || 'The call ended, but the other person could not be notified.') }
    }
  }

  const toggleMicrophone = () => {
    const enabled = !microphoneEnabled
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = enabled })
    setMicrophoneEnabled(enabled)
  }

  const toggleCamera = () => {
    const enabled = !cameraEnabled
    localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = enabled })
    setCameraEnabled(enabled)
  }

  const enableCallAudio = async () => {
    try {
      await remoteAudioRef.current?.play()
      setSpeakerPlaybackBlocked(false)
    } catch (playbackError) {
      setError(playbackError.message || 'Could not enable call audio. Check your device volume and speaker settings.')
    }
  }

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice messages are not supported by this browser. Try a recent mobile browser over HTTPS.')
      return
    }
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      if (!stream.getAudioTracks().length) {
        stopMediaStream(stream)
        throw new Error('No microphone audio track is available. Check your microphone and permission, then try again.')
      }
      voiceStreamRef.current = stream
      const mimeType = getSupportedMimeType([
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
      ])
      const recorder = new MediaRecorder(stream, mimeType
        ? { mimeType, audioBitsPerSecond: 128000 }
        : { audioBitsPerSecond: 128000 })
      voiceRecorderRef.current = recorder
      voiceChunksRef.current = []
      recorder.ondataavailable = event => {
        if (event.data.size) voiceChunksRef.current.push(event.data)
      }
      recorder.onerror = event => {
        voiceSendInFlightRef.current = false
        setRecordingVoice(false)
        stopMediaStream(stream)
        voiceStreamRef.current = null
        setError(event.error?.message || 'Voice recording failed.')
      }
      recorder.onstop = async () => {
        if (voiceSendInFlightRef.current) return
        voiceSendInFlightRef.current = true
        window.clearTimeout(voiceTimeoutRef.current)
        stopMediaStream(stream)
        voiceStreamRef.current = null
        setRecordingVoice(false)
        setSendingVoice(true)
        const chunks = voiceChunksRef.current
        const recordingMimeType = recorder.mimeType || chunks.find(chunk => chunk.type)?.type || 'audio/webm'
        const blob = new Blob(chunks, { type: recordingMimeType })
        voiceChunksRef.current = []
        voiceRecorderRef.current = null
        const recordingDuration = Date.now() - voiceRecordingStartedAtRef.current
        voiceRecordingStartedAtRef.current = 0
        try {
          if (!blob.size) throw new Error('No audio was captured. Check your microphone and try recording again.')
          if (recordingDuration < 1000) throw new Error('The recording was too short to capture. Record for at least one second and try again.')
          if (blob.size * 4 / 3 > MEDIA_MESSAGE_LIMIT - 256) throw new Error('This voice message is too large to send. Record a shorter message and try again.')
          const dataUrl = normalizeVoiceDataUrl(await fileToDataUrl(blob), recordingMimeType)
          const peer = recipient
          if (!peer) throw new Error('Choose a conversation before sending a voice message.')
          await socialAPI.sendConversationMessage(peer.user_id, dataUrl, 'voice', {
            replyToMessageId: replyTarget?.message_id || null,
          })
          setReplyTarget(null)
          const response = await socialAPI.getConversation(peer.user_id, lastMessageIdRef.current)
          appendConversationMessages(response.data)
        } catch (recordError) {
          setError(recordError.message || 'Could not send the voice message.')
        } finally {
          voiceSendInFlightRef.current = false
          setSendingVoice(false)
        }
      }
      recorder.start(250)
      voiceRecordingStartedAtRef.current = Date.now()
      setRecordingVoice(true)
      voiceTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 60000)
    } catch (recordError) {
      stopMediaStream(voiceStreamRef.current)
      voiceStreamRef.current = null
      setError(recordError.name === 'NotAllowedError'
        ? 'Allow microphone access in your browser or phone settings, then try again.'
        : !window.isSecureContext
          ? 'Voice messages require HTTPS on mobile or localhost during development.'
          : recordError.message || 'Could not start voice recording.')
    }
  }

  const shareInviteExternally = async () => {
    if (!inviteUrl) return
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join REDSEA', url: inviteUrl })
        setError('Invite link shared.')
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
        setError('Invite link copied. Share it with a friend.')
      } else {
        window.prompt('Copy this invite link', inviteUrl)
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError(shareError.message || 'Could not share the invite link.')
    }
  }

  const sendInviteTo = person => act(async () => {
    await socialAPI.sendMessage(person.user_id, `Join REDSEA using my invite link: ${inviteUrl}`)
    setSentInvites(current => ({ ...current, [String(person.user_id)]: true }))
    setError(`Invite sent to ${person.full_name || person.username}.`)
  })

  const copyInvite = async () => {
    if (!inviteUrl) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
        setError('Invite link copied. Share it with a friend.')
      } else {
        window.prompt('Copy this invite link', inviteUrl)
      }
    } catch (copyError) {
      setError(copyError.message || 'Could not copy the invite link.')
    }
  }

  const userId = currentUserId()
  const inviteShareLinks = inviteUrl ? getSocialShareLinks('Join REDSEA', 'Join REDSEA using my invite link.', inviteUrl) : null
  const inviteRecipients = [...new Map(
    [...friends.following, ...friends.followers].map(person => [String(person.user_id), person])
  ).values()]
  const title = showInviteRecipients && activePopup === 'friends'
    ? 'Send invite to friends'
    : recipient && activePopup === 'message'
      ? `Message ${recipient.full_name || recipient.username}`
      : incomingCall
        ? `Incoming ${incomingCall.mediaType} call`
        : callState !== 'idle'
          ? `${callMediaType === 'video' ? 'Video' : 'Voice'} call`
          : TITLES[activePopup]

  if (!activePopup && !incomingCall && callState === 'idle') return null

  return (
    <Popup
      title={title}
      onClose={() => {
        if (!activePopup && (incomingCall || callState !== 'idle')) endCall()
        onClose()
      }}
    >
      {error && <p className="social-status" role="status">{error}</p>}
      {incomingCall && activePopup !== 'message' && (
        <div className="social-incoming-call" role="status">
          <span>Incoming {incomingCall.mediaType} call from {recipient?.full_name}</span>
          <button type="button" onClick={answerCall}>Answer</button>
          <button type="button" onClick={endCall}>Decline</button>
        </div>
      )}
      {callState !== 'idle' && activePopup !== 'message' && (
        <section className={`social-call-panel ${callMediaType}`} aria-label={`${callMediaType} call`}>
          {callMediaType === 'video' ? (
            <div className="social-call-videos">
              <video ref={remoteVideoRef} autoPlay muted playsInline aria-label="Friend video" />
              <video ref={localVideoRef} autoPlay muted playsInline aria-label="Your video" />
            </div>
          ) : (
            <p>{callState === 'connected' ? `Voice call with ${recipient?.full_name}` : `Connecting to ${recipient?.full_name}…`}</p>
          )}
          <audio ref={remoteAudioRef} autoPlay playsInline controls={speakerPlaybackBlocked} aria-label="Call audio" />
          {callState !== 'connected' && callMediaType === 'video' && <p>Connecting to {recipient?.full_name}…</p>}
          <div className="social-call-controls">
            {speakerPlaybackBlocked && <button type="button" onClick={enableCallAudio}>Enable speaker audio</button>}
            <button type="button" onClick={toggleMicrophone}>{microphoneEnabled ? 'Mute mic' : 'Unmute mic'}</button>
            {callMediaType === 'video' && <button type="button" onClick={toggleCamera}>{cameraEnabled ? 'Turn camera off' : 'Turn camera on'}</button>}
            <button type="button" className="end-call" onClick={endCall}>End call</button>
          </div>
        </section>
      )}
      {activePopup === 'friends' && (
        <>
          {showInviteRecipients ? (
            <>
              <button type="button" className="social-back" onClick={() => { setShowInviteRecipients(false); setError('') }}>← Friends</button>
              <p className="social-muted">Choose a friend to send your personal signup link in a message.</p>
              {!inviteRecipients.length && <p className="social-muted">No friends to show yet. Follow someone or connect with them first.</p>}
              {inviteRecipients.map(person => (
                <div className="social-person" key={`invite-${person.user_id}`}>
                  <span><strong>{person.full_name}</strong><small>@{person.username}</small></span>
                  <button
                    type="button"
                    disabled={busy || !inviteUrl || sentInvites[String(person.user_id)]}
                    onClick={() => sendInviteTo(person)}
                  >
                    {sentInvites[String(person.user_id)] ? 'Sent' : 'Send invite'}
                  </button>
                </div>
              ))}
              <div className="social-invite-actions">
                <button type="button" disabled={!inviteUrl} onClick={shareInviteExternally}>Share another way</button>
                <button type="button" disabled={!inviteUrl} onClick={copyInvite}>Copy invite link</button>
              </div>
            </>
          ) : (
            <>
          <div className="social-invite-box">
            <strong>Invite friends</strong>
            <p>Share your personal signup link.</p>
            <div className="social-invite-actions">
              <button type="button" disabled={!inviteUrl} onClick={() => { setShowInviteRecipients(true); setError('') }}>Share invite</button>
              <button type="button" disabled={!inviteUrl} onClick={copyInvite}>Copy invite link</button>
              {inviteShareLinks && <a href={inviteShareLinks.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              {inviteShareLinks && <a href={inviteShareLinks.telegram} target="_blank" rel="noopener noreferrer">Telegram</a>}
            </div>
          </div>
          <nav className="social-tabs" aria-label="Friends">
            {[
              ['find', 'Find people'],
              ['requests', `Requests${friends.requests.length ? ` (${friends.requests.length})` : ''}`],
              ['following', `Following (${friends.following.length})`],
              ['followers', `Followers (${friends.followers.length})`]
            ].map(([tab, label]) => <button type="button" key={tab} className={friendsTab === tab ? 'active' : ''} onClick={() => setFriendsTab(tab)}>{label}</button>)}
          </nav>
          {friendsTab === 'find' && (
            <>
              <label className="social-search">
                <span>Discover accounts</span>
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search username or name" />
              </label>
              {!people.length && <p className="social-muted">{search.trim() ? 'No matching accounts found.' : 'No other accounts to show yet.'}</p>}
              {people.map(person => (
                <div className="social-person" key={person.user_id}>
                  <span>
                    <strong>{person.full_name}</strong>
                    <small>@{person.username}</small>
                    {presenceLabel(person)}
                    <small>Account created: {formatAccountCreatedAt(person.created_at)}</small>
                    {!person.is_active && <small>Inactive account</small>}
                  </span>
                  <div>
                    <button disabled={busy || !person.is_active || !!person.sent_request || !!person.received_request} onClick={() => act(async () => { await socialAPI.requestFriend(person.user_id); await loadFriends() })}>
                      {person.sent_request ? 'Requested' : person.received_request ? 'Request received' : 'Add friend'}
                    </button>
                    <button disabled={busy || !person.is_active || person.following} onClick={() => act(async () => { await socialAPI.follow(person.user_id); await loadFriends() })}>
                      {person.following ? 'Following' : 'Follow'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          {friendsTab === 'requests' && (
            <>
              {!friends.requests.length && <p className="social-muted">No pending friend requests.</p>}
              {friends.requests.map(request => (
                <div className="social-person" key={request.request_id}>
                  <span><strong>{request.full_name}</strong><small>@{request.username}</small>{presenceLabel(request)}</span>
                  <div>
                    <button disabled={busy} onClick={() => act(async () => { await socialAPI.respondFriendRequest(request.request_id, 'accepted'); await loadFriends() })}>Accept</button>
                    <button disabled={busy} onClick={() => act(async () => { await socialAPI.respondFriendRequest(request.request_id, 'declined'); await loadFriends() })}>Decline</button>
                  </div>
                </div>
              ))}
            </>
          )}
          {friendsTab === 'following' && (
            <>
              {!friends.following.length && <p className="social-muted">You are not following anyone yet.</p>}
              {friends.following.map(person => (
                <div className="social-person" key={person.user_id}>
                  <span><strong>{person.full_name}</strong><small>@{person.username}</small>{presenceLabel(person)}</span>
                  <button disabled={busy} onClick={() => act(async () => { await socialAPI.unfollow(person.user_id); await loadFriends() })}>Unfollow</button>
                </div>
              ))}
            </>
          )}
          {friendsTab === 'followers' && (
            <>
              {!friends.followers.length && <p className="social-muted">No followers yet.</p>}
              {friends.followers.map(person => (
                <div className="social-person" key={`follower-${person.user_id}`}>
                  <span><strong>{person.full_name}</strong><small>@{person.username}</small>{presenceLabel(person)}</span>
                  <button disabled={busy || person.following} onClick={() => act(async () => { await socialAPI.follow(person.user_id); await loadFriends() })}>{person.following ? 'Following' : 'Follow back'}</button>
                </div>
              ))}
            </>
          )}
            </>
          )}
        </>
      )}
      {activePopup === 'message' && (
        <>
          {!recipient ? (
            <>
              <h4>Start a conversation</h4>
              <label className="social-search">
                <span>Search friends and all roles</span>
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, username, or role" />
              </label>
              {giftNotice && <p className="social-gift-notice" role="status">{giftNotice}</p>}
              {friendList.map(person => (
                !search.trim() || `${person.full_name} ${person.username} ${person.role || ''}`.toLowerCase().includes(search.trim().toLowerCase())
                  ? <div className="social-message-friend" key={person.user_id}>
                    <div className="social-message-friend-row">
                      <span><strong>{person.full_name}</strong><small>@{person.username}</small>{presenceLabel(person)}</span>
                      <div className="social-message-friend-actions">
                        <button type="button" disabled={busy} onClick={() => openConversation(person)}>Message →</button>
                        {followConnectionIds.has(String(person.user_id)) && (
                          <button
                            type="button"
                            disabled={busy}
                            aria-expanded={giftRecipientId === String(person.user_id)}
                            onClick={() => toggleFriendGift(person)}
                          >
                            🎁 Gift
                          </button>
                        )}
                      </div>
                    </div>
                    {giftRecipientId === String(person.user_id) && (
                      <form className="social-friend-gift-form" onSubmit={sendFriendGift}>
                        <label>
                          Gift coins{giftCoinBalance !== null ? ` · Balance ${giftCoinBalance.toLocaleString()}` : ''}
                          <input
                            type="number"
                            min="1"
                            max={Number.isFinite(giftCoinBalance) ? giftCoinBalance : undefined}
                            step="1"
                            value={giftAmount}
                            onChange={event => setGiftAmount(event.target.value)}
                            aria-label={`Coin gift amount for ${person.full_name}`}
                            placeholder="Whole-number amount"
                            required
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={busy || !giftAmount || !Number.isFinite(giftCoinBalance) || Number(giftAmount) <= 0 || Number(giftAmount) > giftCoinBalance}
                        >
                          {busy ? 'Sending…' : 'Send coins'}
                        </button>
                      </form>
                    )}
                  </div>
                  : null
              ))}
              {people.filter(person => !friends.following.some(link => String(link.user_id) === String(person.user_id)) && !friends.followers.some(link => String(link.user_id) === String(person.user_id))).map(person => (
                <div className="social-person" key={`discover-${person.user_id}`}>
                  <span><strong>{person.full_name}</strong><small>@{person.username}</small>{presenceLabel(person)}</span>
                  <button disabled={busy} onClick={() => act(async () => { await socialAPI.follow(person.user_id); await loadInbox() })}>Follow to message</button>
                </div>
              ))}
              <h4>Recent inbox</h4>
              {[...new Map(inbox.map(item => [String(item.sender_id), item])).values()].map(item => (
                <button className="social-person social-person-button" key={item.sender_id} onClick={() => openConversation({ user_id: item.sender_id, username: item.sender_name, full_name: item.sender_name })}>
                    <span><strong>{item.sender_name}</strong><small>{item.type === 'voice' ? 'Voice message' : item.type?.startsWith('call-') ? 'Call' : item.body}</small></span><span>Open →</span>
                </button>
              ))}
              {!friends.following.length && !friends.followers.length && !people.length && !inbox.length && <p className="social-muted">No accounts or conversations yet.</p>}
            </>
          ) : (
            <>
              <button
                type="button"
                className="social-back"
                onClick={() => {
                  if (callStateRef.current !== 'idle' || incomingCall) endCall()
                  if (voiceRecorderRef.current?.state === 'recording') voiceRecorderRef.current.stop()
                  setRecipient(null)
                  setIncomingCall(null)
                }}
              >
                ← Conversations
              </button>
              <p className={`social-presence ${recipient.is_online ? 'online' : 'offline'}`}>
                <span aria-hidden="true" />{recipient.is_online ? 'Online' : 'Offline'}{recipient.role ? ` · ${recipient.role}` : ''}
              </p>
              {incomingCall && callState === 'idle' && (
                <div className="social-incoming-call" role="status">
                  <span>Incoming {incomingCall.mediaType} call</span>
                  <button type="button" onClick={answerCall}>Answer</button>
                  <button type="button" onClick={endCall}>Decline</button>
                </div>
              )}
              {callState !== 'idle' && (
                <section className={`social-call-panel ${callMediaType}`} aria-label={`${callMediaType} call`}>
                  {callMediaType === 'video' ? (
                    <div className="social-call-videos">
                      <video ref={remoteVideoRef} autoPlay muted playsInline aria-label="Friend video" />
                      <video ref={localVideoRef} autoPlay muted playsInline aria-label="Your video" />
                    </div>
                  ) : (
                    <p>{callState === 'connected' ? `Voice call with ${recipient.full_name}` : `Connecting to ${recipient.full_name}…`}</p>
                  )}
                  <audio ref={remoteAudioRef} autoPlay playsInline controls={speakerPlaybackBlocked} aria-label="Call audio" />
                  {callState !== 'connected' && callMediaType === 'video' && <p>Connecting to {recipient.full_name}…</p>}
                  <div className="social-call-controls">
                    {speakerPlaybackBlocked && <button type="button" onClick={enableCallAudio}>Enable speaker audio</button>}
                    <button type="button" onClick={toggleMicrophone}>{microphoneEnabled ? 'Mute mic' : 'Unmute mic'}</button>
                    {callMediaType === 'video' && <button type="button" onClick={toggleCamera}>{cameraEnabled ? 'Turn camera off' : 'Turn camera on'}</button>}
                    <button type="button" className="end-call" onClick={endCall}>End call</button>
                  </div>
                </section>
              )}
              <div className="social-conversation">
                {conversation.filter(item => !CALL_SIGNAL_TYPES.has(item.type)).map(item => (
                  <article className={`social-message-bubble ${String(item.sender_id) === userId ? 'mine' : ''}`} key={item.message_id}>
                    {item.forwarded_from_message_id && <small className="social-message-forwarded">↗ Forwarded from {item.forwarded_from_name}</small>}
                    {item.reply_to_message_id && (
                      <div className="social-message-reply-preview">
                        <strong>{item.reply_sender_name || 'Member'}</strong>
                        <span>{item.reply_deleted_at ? 'This message was deleted.' : item.reply_type === 'image' ? `🖼 ${item.reply_caption || 'Image'}` : item.reply_type === 'voice' ? '🎙 Voice message' : item.reply_body}</span>
                      </div>
                    )}
                    <small>{item.sender_name}</small>
                    {item.deleted_at
                      ? <em>This message was deleted.</em>
                      : item.type === 'coin-gift'
                        ? renderCoinGift(item, userId)
                        : item.type === 'voice'
                        ? <audio className="social-voice-message" controls preload="metadata" src={item.body}>Your browser cannot play this voice message.</audio>
                        : item.type === 'image'
                          ? <><img className="social-message-image" src={item.body} alt="Shared image" />{item.caption && <span>{item.caption}</span>}</>
                          : renderMessageBody(item.body)}
                    {!item.deleted_at && item.edited_at && <small className="social-message-edited">(edited)</small>}
                    {item.type !== 'coin-gift' && (
                      <div className="social-message-actions">
                        <button type="button" onClick={() => setReplyTarget(item)}>Reply</button>
                        <button type="button" onClick={() => { setForwardingMessageId(item.message_id); setForwardRecipientId('') }}>Forward</button>
                        {String(item.sender_id) === userId && !item.deleted_at &&
                          isWithinMessageEditWindow(item.created_at) && ['text', 'image'].includes(item.type) && (
                          <button type="button" onClick={() => editConversationMessage(item)}>Edit</button>
                        )}
                        {String(item.sender_id) === userId && !item.deleted_at && (
                          <button type="button" onClick={() => setPendingDeleteMessage(item)}>Delete</button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
                {!conversation.some(item => !CALL_SIGNAL_TYPES.has(item.type)) && <p className="social-muted">No messages yet. Say hello.</p>}
              </div>
              {forwardingMessageId && (
                <div className="social-message-forward-form">
                  <label>Forward to
                    <select value={forwardRecipientId} onChange={event => setForwardRecipientId(event.target.value)}>
                      <option value="">Choose a friend</option>
                      {[...new Map([...friends.following, ...friends.followers]
                        .filter(person => String(person.user_id) !== userId)
                        .map(person => [String(person.user_id), person])).values()]
                        .map(person => <option key={person.user_id} value={person.user_id}>{person.full_name || person.username}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busy || !forwardRecipientId} onClick={forwardConversationMessage}>Forward</button>
                  <button type="button" onClick={() => setForwardingMessageId('')}>Cancel</button>
                </div>
              )}
          <div className="social-message-tools" aria-label="Voice and call controls">
                {callState === 'idle' && !incomingCall && (
                  <>
                    <button type="button" disabled={recordingVoice || sendingVoice || busy} onClick={() => startVoiceRecording().catch(recordError => setError(recordError.message || 'Could not record a voice message.'))}>
                      {sendingVoice ? 'Sending voice…' : recordingVoice ? 'Recording…' : '🎙 Voice message'}
                    </button>
                    <button type="button" disabled={recordingVoice || sendingVoice || busy} onClick={() => startCall('audio')}>📞 Voice call</button>
                    <button type="button" disabled={recordingVoice || sendingVoice || busy} onClick={() => startCall('video')}>🎥 Video call</button>
                  </>
                )}
                {recordingVoice && (
                  <button type="button" className="end-call" onClick={() => voiceRecorderRef.current?.stop()}>Stop recording</button>
                )}
              </div>
              <input
                ref={imageInputRef}
                className="social-message-image-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (file.size > IMAGE_MESSAGE_LIMIT) {
                    setError('Images must be 6 MB or smaller.')
                    event.target.value = ''
                    return
                  }
                  setSelectedImage(file)
                  setImageCaption('')
                  setError('')
                }}
              />
              {selectedImage && (
                <form className="social-message-image-caption" onSubmit={sendConversationImage}>
                  <span>{selectedImage.name}</span>
                  <input value={imageCaption} maxLength={1000} onChange={event => setImageCaption(event.target.value)} placeholder="Add a caption (optional)" aria-label="Image caption" />
                  <button type="submit" disabled={busy}>Send image</button>
                  <button type="button" onClick={() => { setSelectedImage(null); setImageCaption('') }}>Cancel</button>
                </form>
              )}
              {replyTarget && <div className="social-message-replying"><span>Replying to {replyTarget.sender_name}</span><button type="button" onClick={() => setReplyTarget(null)}>Cancel reply</button></div>}
              <div className="social-message-tools" aria-label="Voice and call controls">
                <button type="button" disabled={busy} onClick={() => imageInputRef.current?.click()}>🖼 Image</button>
              </div>
              {giftRecipientId === String(recipient.user_id) && (
                <form className="social-friend-gift-form" onSubmit={sendFriendGift}>
                  <label>
                    Gift coins{giftCoinBalance !== null ? ` · Balance ${giftCoinBalance.toLocaleString()}` : ''}
                    <input
                      type="number"
                      min="1"
                      max={Number.isFinite(giftCoinBalance) ? giftCoinBalance : undefined}
                      step="1"
                      value={giftAmount}
                      onChange={event => setGiftAmount(event.target.value)}
                      aria-label={`Coin gift amount for ${recipient.full_name || recipient.username}`}
                      placeholder="Whole-number amount"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !giftAmount || !Number.isFinite(giftCoinBalance) || Number(giftAmount) <= 0 || Number(giftAmount) > giftCoinBalance}
                  >
                    {busy ? 'Sending…' : 'Send gift'}
                  </button>
                </form>
              )}
              <form className="social-message-form" onSubmit={send}>
                <input value={message} maxLength={2000} onChange={event => setMessage(event.target.value)} placeholder={replyTarget ? `Reply to ${replyTarget.sender_name}` : 'Write a message'} required />
                <button
                  type="button"
                  className="social-gift-trigger"
                  disabled={busy || !followConnectionIds.has(String(recipient.user_id))}
                  title={followConnectionIds.has(String(recipient.user_id)) ? 'Send virtual coins' : 'Follow this account or have them follow you to send a coin gift'}
                  aria-expanded={giftRecipientId === String(recipient.user_id)}
                  onClick={() => toggleFriendGift(recipient)}
                >
                  🎁 Gift coins
                </button>
                <button disabled={busy}>Send</button>
              </form>
            </>
          )}
        </>
      )}
      {activePopup === 'message' && pendingDeleteMessage && (
        <div className="social-confirm-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget && !busy) setPendingDeleteMessage(null)
        }}>
          <section className="social-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="socialDeleteTitle">
            <span className="social-confirm-icon" aria-hidden="true">🗑️</span>
            <h2 id="socialDeleteTitle">Delete this message?</h2>
            <p>This removes the message for both people. The conversation will show “This message was deleted.”</p>
            <div className="social-confirm-actions">
              <button type="button" className="social-confirm-cancel" disabled={busy} onClick={() => setPendingDeleteMessage(null)}>Keep message</button>
              <button type="button" className="social-confirm-delete" disabled={busy} onClick={() => deleteConversationMessage(pendingDeleteMessage)}>
                {busy ? 'Deleting…' : 'Delete for everyone'}
              </button>
            </div>
          </section>
        </div>
      )}
      {activePopup === 'notification' && (
        <>
          {promotions.map(item => {
            const cardContent = (
              <>
                {item.image_data && <img src={item.image_data} alt="" />}
                <div>
                  {(item.badge_text || 'Sponsored') && <span>{item.badge_text || 'Sponsored'}</span>}
                  <strong>{item.pinned ? '📌 ' : ''}{item.title}</strong>
                  {item.message && <p>{item.message}</p>}
                  {item.button_text && item.button_url && <span className="social-promotion-cta">{item.button_text} →</span>}
                </div>
              </>
            )
            const clickableProps = item.button_url
              ? {
                  as: 'a',
                  href: item.button_url,
                  target: /^https?:\/\//i.test(item.button_url) ? '_blank' : undefined,
                  rel: /^https?:\/\//i.test(item.button_url) ? 'noreferrer' : undefined,
                }
              : { as: 'button', type: 'button', onClick: () => navigate(item.link || '/feed') }

            const Component = clickableProps.as === 'a' ? 'a' : 'button'
            return (
              <Component
                className={`social-promotion-notice ${item.pinned ? 'pinned' : ''}`}
                key={item.id}
                style={{ backgroundColor: item.background_color }}
                {...(clickableProps.as === 'a' ? { href: clickableProps.href, target: clickableProps.target, rel: clickableProps.rel } : { type: clickableProps.type, onClick: clickableProps.onClick })}
              >
                {cardContent}
              </Component>
            )
          })}
          {!notifications.length && !promotions.length && <p className="social-muted">You have no notifications yet.</p>}
          {notifications.map(item => (
            <button
              type="button"
              className={`social-notice ${item.read_at ? '' : 'unread'}`}
              key={item.notification_id}
              onClick={() => {
                onClose()
                navigate(item.link || '/feed')
              }}
              aria-label={`Open notification: ${item.message}`}
            >
              <strong>{item.actor_name}</strong>
              <p>{item.message}</p>
              {(item.type === 'mention' || item.type === 'tagged_friend') && (
                <small className="social-notification-tag">{item.type === 'tagged_friend' ? 'Friend tag alert' : 'Mention alert'}</small>
              )}
              <small>{new Date(item.created_at).toLocaleString()}</small>
            </button>
          ))}
        </>
      )}
    </Popup>
  )
}

export default SocialPopups
