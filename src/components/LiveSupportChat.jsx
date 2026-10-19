import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveChatAttachmentBlob, liveChatAPI } from '../services/api'
import { getLiveChatIdentity, getLiveChatToken } from '../utils/liveChatIdentity'
import Pagination, { getPageItems, PAGE_SIZE } from './Pagination'
import { getAppSoundsEnabled } from '../utils/appSounds'
import './LiveSupportChat.css'

const MAX_FILE_SIZE = 6 * 1024 * 1024
const POLL_INTERVAL = 1800
const MESSAGE_EDIT_WINDOW_MS = 15 * 24 * 60 * 60 * 1000
const SAVED_CALLS_DB = 'redsea-live-chat'
const SAVED_CALLS_STORE = 'saved-calls'
const DEFAULT_ICE_SERVERS = (import.meta.env.VITE_WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean)
  .map(url => ({ urls: url }))

const getIceServers = () => {
  const configuredServers = import.meta.env.VITE_WEBRTC_ICE_SERVERS
  if (!configuredServers) return DEFAULT_ICE_SERVERS

  let servers
  try {
    servers = JSON.parse(configuredServers)
  } catch {
    throw new Error('VITE_WEBRTC_ICE_SERVERS must be a JSON array of ICE server settings.')
  }
  if (
    !Array.isArray(servers) ||
    servers.length === 0 ||
    servers.some(server => (
      !server ||
      !(typeof server.urls === 'string' || (
        Array.isArray(server.urls) &&
        server.urls.length > 0 &&
        server.urls.every(url => typeof url === 'string')
      ))
    ))
  ) {
    throw new Error('VITE_WEBRTC_ICE_SERVERS must contain ICE servers with valid urls.')
  }
  return servers
}

const openSavedCallsDb = () => new Promise((resolve, reject) => {
  if (!window.indexedDB) {
    reject(new Error('Saved call recordings are not supported by this browser.'))
    return
  }
  const request = window.indexedDB.open(SAVED_CALLS_DB, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(SAVED_CALLS_STORE)) {
      request.result.createObjectStore(SAVED_CALLS_STORE, { keyPath: 'id' })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error || new Error('Could not open saved call recordings.'))
})

const getSavedCalls = async () => {
  const db = await openSavedCallsDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(SAVED_CALLS_STORE, 'readonly').objectStore(SAVED_CALLS_STORE).getAll()
    request.onsuccess = () => {
      db.close()
      resolve(request.result.sort((left, right) => right.savedAt.localeCompare(left.savedAt)))
    }
    request.onerror = () => {
      db.close()
      reject(request.error || new Error('Could not load saved call recordings.'))
    }
  })
}

const storeSavedCall = async recording => {
  const db = await openSavedCallsDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SAVED_CALLS_STORE, 'readwrite')
    transaction.objectStore(SAVED_CALLS_STORE).put(recording)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error || new Error('Could not save this call recording.'))
    }
    transaction.onabort = () => {
      db.close()
      reject(transaction.error || new Error('Saving this call recording was cancelled.'))
    }
  })
}

const deleteSavedCall = async id => {
  const db = await openSavedCallsDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SAVED_CALLS_STORE, 'readwrite')
    transaction.objectStore(SAVED_CALLS_STORE).delete(id)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error || new Error('Could not delete this call recording.'))
    }
    transaction.onabort = () => {
      db.close()
      reject(transaction.error || new Error('Deleting this call recording was cancelled.'))
    }
  })
}

const newConversationId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0
    return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16)
  })
}

const fileToDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
  reader.readAsDataURL(file)
})

const normalizeAttachment = (dataUrl, mimeType) => {
  const separator = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || separator < 0) {
    throw new Error('The selected file could not be prepared for upload.')
  }
  const dataUrlMime = dataUrl.slice(5, separator).split(';', 1)[0].trim().toLowerCase()
  const mime = (mimeType || dataUrlMime).split(';', 1)[0].trim().toLowerCase()
  if (!mime.startsWith('audio/')) {
    throw new Error('The microphone did not produce a supported audio recording. Check the selected microphone and try again.')
  }
  return { mime, data: `data:${mime};base64,${dataUrl.slice(separator + 1)}` }
}

const getCallDetails = text => {
  const parsed = JSON.parse(text)
  if (parsed?.description && parsed.mediaType === 'video') {
    return { mediaType: 'video', description: parsed.description }
  }
  return { mediaType: 'audio', description: parsed }
}

const waitForIceGathering = peer => new Promise(resolve => {
  if (peer.iceGatheringState === 'complete') {
    resolve()
    return
  }
  const finish = () => {
    clearTimeout(timeout)
    peer.removeEventListener('icegatheringstatechange', onStateChange)
    resolve()
  }
  const onStateChange = () => {
    if (peer.iceGatheringState === 'complete') {
      finish()
    }
  }
  const timeout = setTimeout(finish, 12000)
  peer.addEventListener('icegatheringstatechange', onStateChange)
})

const getAttachmentKind = message => {
  if (message.type === 'voice') return 'voice'
  if (message.attachmentMime?.startsWith('image/')) return 'image'
  if (message.attachmentMime?.startsWith('video/')) return 'video'
  if (message.attachmentMime?.startsWith('audio/')) return 'audio'
  if (message.attachmentMime === 'application/pdf') return 'pdf'
  return 'file'
}

const formatDuration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
const isWithinMessageEditWindow = createdAt => {
  const raw = String(createdAt)
  const timestamp = Date.parse(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`)
  const age = Date.now() - timestamp
  return Number.isFinite(timestamp) && age >= 0 && age <= MESSAGE_EDIT_WINDOW_MS
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

const getMicrophoneStream = async (mediaType = 'audio') => {
  if (!navigator.mediaDevices?.getUserMedia) {
    const devices = mediaType === 'video' ? 'microphone and camera' : 'microphone'
    throw new Error(`This browser does not support ${devices} access. Try an up-to-date browser over HTTPS.`)
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    ...(mediaType === 'video' ? { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } } : {}),
  })
  if (!stream.getAudioTracks().length) {
    stopMediaStream(stream)
    throw new Error('No microphone audio track is available. Check your microphone and permission, then try again.')
  }
  return stream
}

const getMediaAccessError = (error, mediaType = 'audio') => {
  const deviceName = mediaType === 'video' ? 'microphone and camera' : 'microphone'
  if (!window.isSecureContext) {
    return `Allow ${deviceName} access over HTTPS or localhost. Mobile browsers block microphone and camera access on insecure pages.`
  }
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    return mobile
      ? `Microphone access was blocked. Open this site's settings in your mobile browser, allow ${deviceName}, reload the page, and tap again.`
      : `Microphone access was blocked. Allow ${deviceName} in this site's browser settings, reload the page, and try again.`
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return `No ${deviceName} was found on this device.`
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return `The ${deviceName} is busy or unavailable. Close other apps using it and try again.`
  }
  if (error?.name === 'OverconstrainedError') {
    return `The ${deviceName} does not support the requested call settings.`
  }
  if (error?.name === 'AbortError') {
    return `The browser could not start the ${deviceName}. Check the device and permissions, then retry.`
  }
  return error?.message || `Could not access the ${deviceName}. Check browser permissions and try again.`
}

function LiveSupportChat({ admin = false, active = true }) {
  const [clientIdentity, setClientIdentity] = useState(() => admin ? null : getLiveChatIdentity())
  const clientConversationId = clientIdentity?.conversationId || ''
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [conversationSearch, setConversationSearch] = useState('')
  const [conversationPage, setConversationPage] = useState(0)
  const [supportOnline, setSupportOnline] = useState(null)
  const [messages, setMessages] = useState([])
  const [attachmentUrls, setAttachmentUrls] = useState({})
  const [draft, setDraft] = useState('')
  const [replyTarget, setReplyTarget] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [forwardingMessage, setForwardingMessage] = useState(null)
  const [imageToSend, setImageToSend] = useState(null)
  const [imageCaption, setImageCaption] = useState('')
  const [error, setError] = useState('')
  const [soundError, setSoundError] = useState('')
  const [clientConversationReady, setClientConversationReady] = useState(admin)
  const [sending, setSending] = useState(false)
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null)
  const [recording, setRecording] = useState(false)
  const [recordingStartedAt, setRecordingStartedAt] = useState(null)
  const [recordingElapsed, setRecordingElapsed] = useState(0)
  const [callRecordingState, setCallRecordingState] = useState('idle')
  const [recordingRequest, setRecordingRequest] = useState(null)
  const [finishedRecording, setFinishedRecording] = useState(null)
  const [savedCalls, setSavedCalls] = useState([])
  const [savedCallPage, setSavedCallPage] = useState(0)
  const [savedCallUrls, setSavedCallUrls] = useState({})
  const [adminView, setAdminView] = useState('chats')
  const [callState, setCallState] = useState('idle')
  const [callMediaType, setCallMediaType] = useState('audio')
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [speakerEnabled, setSpeakerEnabled] = useState(true)
  const [speakerPlaybackBlocked, setSpeakerPlaybackBlocked] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)
  const [soundsEnabled, setSoundsEnabled] = useState(() => localStorage.getItem('redseaLiveChatSounds') !== 'false')
  const [appSoundsEnabled, setAppSoundsEnabled] = useState(getAppSoundsEnabled)
  const [audioReady, setAudioReady] = useState(false)
  const [localVideoStream, setLocalVideoStream] = useState(null)
  const [remoteCallStream, setRemoteCallStream] = useState(null)
  const messageListRef = useRef(null)
  const lastMessageIdRef = useRef(0)
  const loadedConversationIdRef = useRef('')
  const loadedMessageIdsRef = useRef(new Set())
  const processedSignalsRef = useRef(new Set())
  const peerRef = useRef(null)
  const localCallStreamRef = useRef(null)
  const voiceStreamRef = useRef(null)
  const recorderRef = useRef(null)
  const voiceSendInFlightRef = useRef(false)
  const recordingChunksRef = useRef([])
  const recordingStartedAtRef = useRef(null)
  const callRecorderRef = useRef(null)
  const callRecordingChunksRef = useRef([])
  const callRecordingContextRef = useRef(null)
  const callRecordingCanvasStreamRef = useRef(null)
  const callRecordingFrameRef = useRef(null)
  const remoteCallStreamRef = useRef(null)
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const attachmentUrlsRef = useRef({})
  const localVideoRef = useRef(null)
  const audioContextRef = useRef(null)
  const ringtoneTimerRef = useRef(null)
  const connectionGraceTimerRef = useRef(null)
  const activeRef = useRef(active)
  const callStateRef = useRef(callState)
  activeRef.current = active
  callStateRef.current = callState

  const conversationId = admin ? selectedConversationId : clientConversationId
  const selectedConversation = conversations.find(conversation => conversation.conversationId === selectedConversationId)
  const selectedParticipantLabel = selectedConversation
    ? selectedConversation.participantType === 'account'
      ? `${selectedConversation.displayName} (${selectedConversation.accountRole || 'account'})`
      : 'Guest visitor'
    : ''
  const recoverExpiredClientSession = useCallback(() => {
    if (
      admin ||
      !clientIdentity?.identityKey.startsWith('account:') ||
      getLiveChatToken()
    ) return false

    setClientIdentity(getLiveChatIdentity())
    setClientConversationReady(false)
    setError('Your sign-in session expired. Reconnecting to live support as a guest…')
    return true
  }, [admin, clientIdentity])

  const filteredConversations = conversations.filter(conversation => (
    `${conversation.displayName || ''} ${conversation.accountRole || ''} ${conversation.lastMessage || ''}`
      .toLowerCase()
      .includes(conversationSearch.trim().toLowerCase())
  ))
  const safeConversationPage = Math.min(conversationPage, Math.max(0, Math.ceil(filteredConversations.length / PAGE_SIZE) - 1))
  const visibleConversations = getPageItems(filteredConversations, safeConversationPage)
  const safeSavedCallPage = Math.min(savedCallPage, Math.max(0, Math.ceil(savedCalls.length / PAGE_SIZE) - 1))
  const visibleSavedCalls = getPageItems(savedCalls, safeSavedCallPage)

  const unlockAudio = useCallback(async () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) {
        setSoundError('This browser does not support chat sounds.')
        return
      }
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContextClass()
      }
      if (audioContextRef.current.state !== 'running') {
        await audioContextRef.current.resume()
      }
      setAudioReady(audioContextRef.current.state === 'running')
      setSoundError(audioContextRef.current.state === 'running' ? '' : 'Could not enable chat sounds.')
    } catch (audioError) {
      setSoundError(audioError.message || 'Could not enable chat sounds.')
    }
  }, [])

  useEffect(() => {
    const updateSoundPreference = () => setAppSoundsEnabled(getAppSoundsEnabled())
    window.addEventListener('redsea:sound-settings-updated', updateSoundPreference)
    return () => window.removeEventListener('redsea:sound-settings-updated', updateSoundPreference)
  }, [])

  const playTone = useCallback((frequency, duration = 180) => {
    const audioContext = audioContextRef.current
    if (!soundsEnabled || !appSoundsEnabled || !audioContext || audioContext.state !== 'running') return

    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const startTime = audioContext.currentTime
    const endTime = startTime + duration / 1000
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, startTime)
    gain.gain.setValueAtTime(0.001, startTime)
    gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, endTime)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(startTime)
    oscillator.stop(endTime)
  }, [appSoundsEnabled, soundsEnabled])

  const closeCall = useCallback(() => {
    if (connectionGraceTimerRef.current) {
      clearTimeout(connectionGraceTimerRef.current)
      connectionGraceTimerRef.current = null
    }
    if (callRecorderRef.current?.state === 'recording') {
      callRecorderRef.current.stop()
    } else {
      setCallRecordingState('idle')
    }
    peerRef.current?.close()
    peerRef.current = null
    localCallStreamRef.current?.getTracks().forEach(track => track.stop())
    localCallStreamRef.current = null
    remoteCallStreamRef.current = null
    setLocalVideoStream(null)
    setRemoteCallStream(null)
    setCallState('idle')
    setCallMediaType('audio')
    setIncomingCall(null)
    setRecordingRequest(null)
    setMicrophoneEnabled(true)
    setCameraEnabled(true)
    setSpeakerEnabled(true)
    setSpeakerPlaybackBlocked(false)
  }, [])

  const postMessage = useCallback(async message => {
    if (!conversationId) return
    if (admin) {
      await liveChatAPI.sendAdminMessage(conversationId, message)
    } else {
      await liveChatAPI.sendClientMessage(conversationId, clientIdentity.deviceId, message)
    }
  }, [admin, clientIdentity, conversationId])

  const handleSignal = useCallback(async message => {
    if (!message.type.startsWith('call-') || message.sender === (admin ? 'admin' : 'client')) return
    if (processedSignalsRef.current.has(message.id)) return
    processedSignalsRef.current.add(message.id)

    if (message.type === 'call-offer') {
      const createdAt = Date.parse(message.createdAt.replace(' ', 'T') + 'Z')
      if (!Number.isNaN(createdAt) && Date.now() - createdAt > 120000) return
      const { mediaType } = getCallDetails(message.text)
      setCallMediaType(mediaType)
      setIncomingCall(message)
      return
    }
    if (message.type === 'call-answer' && callStateRef.current === 'calling' && peerRef.current) {
      const { mediaType, description } = getCallDetails(message.text)
      await peerRef.current.setRemoteDescription(description)
      setCallMediaType(mediaType)
      return
    }
    if (message.type === 'call-record-request') {
      setRecordingRequest(message)
      setCallRecordingState('requested')
      return
    }
    if (message.type === 'call-record-consent') {
      setRecordingRequest(null)
      setCallRecordingState('recording')
      return
    }
    if (message.type === 'call-record-decline') {
      setRecordingRequest(null)
      setCallRecordingState('idle')
      return
    }
    if (message.type === 'call-end') closeCall()
  }, [admin, closeCall])

  const loadMessages = useCallback(async () => {
    if (!conversationId) return
    const response = admin
      ? await liveChatAPI.getAdminMessages(conversationId, lastMessageIdRef.current)
      : await liveChatAPI.getClientMessages(conversationId, clientIdentity.deviceId, lastMessageIdRef.current)
    const responseMessages = response.data || []
    const isInitialLoad = loadedConversationIdRef.current !== conversationId
    if (isInitialLoad) loadedMessageIdsRef.current.clear()
    loadedConversationIdRef.current = conversationId
    if (!responseMessages.length) return

    lastMessageIdRef.current = responseMessages[responseMessages.length - 1].id
    const newMessages = responseMessages.filter(message => {
      if (loadedMessageIdsRef.current.has(message.id)) return false
      loadedMessageIdsRef.current.add(message.id)
      return true
    })
    if (!newMessages.length) return
    setMessages(current => {
      const knownIds = new Set(current.map(message => message.id))
      const additions = newMessages.filter(message => {
        if (knownIds.has(message.id)) return false
        knownIds.add(message.id)
        return true
      })
      return additions.length ? [...current, ...additions] : current
    })
    for (const message of newMessages) {
      if (!isInitialLoad && message.sender !== (admin ? 'admin' : 'client') && !message.type.startsWith('call-')) {
        playTone(message.type === 'voice' ? 660 : message.type === 'text' ? 520 : 580)
      }
      await handleSignal(message)
    }
  }, [admin, clientIdentity, conversationId, handleSignal, playTone])

  const refreshCurrentMessages = async () => {
    if (!conversationId) return
    const response = admin
      ? await liveChatAPI.getAdminMessages(conversationId)
      : await liveChatAPI.getClientMessages(conversationId, clientIdentity.deviceId)
    const currentMessages = response.data || []
    setMessages(currentMessages)
    loadedMessageIdsRef.current = new Set(currentMessages.map(message => message.id))
    lastMessageIdRef.current = currentMessages.at(-1)?.id || 0
  }

  useEffect(() => {
    if (admin || !active) return undefined

    let current = true
    setClientConversationReady(false)
    liveChatAPI.registerClientConversation(clientIdentity.conversationId, clientIdentity.deviceId)
      .then(() => {
        if (current) {
          setClientConversationReady(true)
          setError('')
        }
      })
      .catch(requestError => {
        if (current && !recoverExpiredClientSession()) {
          setError(requestError.message || 'Could not connect to live support.')
        }
      })

    return () => { current = false }
  }, [active, admin, clientIdentity, recoverExpiredClientSession])

  useEffect(() => {
    if (!admin) return undefined
    let active = true
    const loadConversations = async () => {
      try {
        const response = await liveChatAPI.getConversations()
        if (active) {
          setConversations(response.data || [])
          setError('')
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'Could not load support conversations.')
      }
    }
    loadConversations()
    const timer = setInterval(loadConversations, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [admin])

  useEffect(() => {
    if (admin || !active) return undefined
    let isCurrent = true
    const updateStatus = async () => {
      try {
        const response = await liveChatAPI.getSupportPresence()
        if (isCurrent) setSupportOnline(Boolean(response.data?.online))
      } catch (requestError) {
        if (isCurrent) console.error('Could not update support online status:', requestError)
      }
    }
    updateStatus()
    const timer = window.setInterval(updateStatus, 15000)
    return () => {
      isCurrent = false
      clearInterval(timer)
    }
  }, [admin, active])

  useEffect(() => {
    if (!admin) return undefined
    let active = true
    getSavedCalls().then(records => {
      if (active) setSavedCalls(records)
    }).catch(requestError => {
      if (active) setError(requestError.message || 'Could not load saved call recordings.')
    })
    return () => { active = false }
  }, [admin])

  useEffect(() => {
    const urls = {}
    savedCalls.forEach(call => { urls[call.id] = URL.createObjectURL(call.blob) })
    setSavedCallUrls(urls)
    return () => Object.values(urls).forEach(URL.revokeObjectURL)
  }, [savedCalls])

  useEffect(() => {
    setAttachmentUrls({})
    return () => {
      Object.values(attachmentUrlsRef.current).forEach(URL.revokeObjectURL)
      attachmentUrlsRef.current = {}
    }
  }, [conversationId])

  const attachmentMessageIds = messages
    .filter(message => message.attachmentName && !message.deletedAt)
    .map(message => message.id)
    .join(',')

  useEffect(() => {
    if (!conversationId || !attachmentMessageIds) return undefined
    let current = true
    const nextUrls = {}
    const attachmentMessages = messages.filter(message => message.attachmentName)

    Promise.all(attachmentMessages.map(async message => {
      const key = `${conversationId}:${message.id}`
      if (attachmentUrlsRef.current[key]) return
      try {
        const blob = await getLiveChatAttachmentBlob(
          conversationId,
          message.id,
          clientIdentity?.deviceId,
          admin
        )
        nextUrls[key] = URL.createObjectURL(blob)
      } catch (requestError) {
        if (current) setError(requestError.message || 'Could not load a chat attachment.')
      }
    })).then(() => {
      if (!current) {
        Object.values(nextUrls).forEach(URL.revokeObjectURL)
        return
      }
      attachmentUrlsRef.current = { ...attachmentUrlsRef.current, ...nextUrls }
      setAttachmentUrls(attachmentUrlsRef.current)
    })

    return () => { current = false }
  }, [admin, attachmentMessageIds, clientIdentity, conversationId])

  useEffect(() => {
    setMessages([])
    lastMessageIdRef.current = 0
    loadedMessageIdsRef.current.clear()
    loadedConversationIdRef.current = ''
    processedSignalsRef.current.clear()
    closeCall()
    if (!conversationId || (!admin && !clientConversationReady)) return undefined

    let active = true
    let polling = false
    const poll = async () => {
      if (polling || (!activeRef.current && callStateRef.current === 'idle')) return
      polling = true
      try {
        await loadMessages()
        if (active) setError('')
      } catch (requestError) {
        if (active && !recoverExpiredClientSession()) {
          setError(requestError.message || 'Could not load chat messages.')
        }
      } finally {
        polling = false
      }
    }
    poll()
    const timer = setInterval(poll, POLL_INTERVAL)
    return () => {
      active = false
      clearInterval(timer)
      closeCall()
    }
  }, [admin, clientConversationReady, conversationId, loadMessages, closeCall, recoverExpiredClientSession])

  useEffect(() => {
    if (!soundsEnabled || !appSoundsEnabled || !audioReady || (!incomingCall && callState !== 'calling')) {
      if (ringtoneTimerRef.current) {
        clearInterval(ringtoneTimerRef.current)
        ringtoneTimerRef.current = null
      }
      return undefined
    }

    const ring = () => {
      playTone(440, 260)
      setTimeout(() => playTone(554, 260), 300)
    }
    ring()
    const timer = setInterval(ring, 1500)
    ringtoneTimerRef.current = timer
    return () => {
      clearInterval(timer)
      if (ringtoneTimerRef.current === timer) ringtoneTimerRef.current = null
    }
  }, [appSoundsEnabled, audioReady, callState, incomingCall, playTone, soundsEnabled])

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [attachmentUrls, incomingCall, messages])

  useEffect(() => {
    if (!recordingStartedAt) {
      setRecordingElapsed(0)
      return undefined
    }
    const updateElapsed = () => setRecordingElapsed(Math.floor((Date.now() - recordingStartedAt) / 1000))
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 250)
    return () => window.clearInterval(timer)
  }, [recordingStartedAt])

  useEffect(() => {
    if (remoteAudioRef.current && remoteCallStream) {
      remoteAudioRef.current.srcObject = new MediaStream(remoteCallStream.getAudioTracks())
      remoteAudioRef.current.muted = !speakerEnabled
      remoteAudioRef.current.play()
        .then(() => setSpeakerPlaybackBlocked(false))
        .catch(() => setSpeakerPlaybackBlocked(true))
    }
    if (remoteVideoRef.current && remoteCallStream && callMediaType === 'video') {
      remoteVideoRef.current.srcObject = remoteCallStream
      remoteVideoRef.current.muted = true
      remoteVideoRef.current.play().catch(() => {
        setError('Call video is ready. Use the video player to start playback if it does not start automatically.')
      })
    }
    if (localVideoRef.current && localVideoStream) {
      localVideoRef.current.srcObject = localVideoStream
    }
    remoteCallStreamRef.current = remoteCallStream
  }, [callMediaType, callState, localVideoStream, remoteCallStream, speakerEnabled])

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    voiceStreamRef.current?.getTracks().forEach(track => track.stop())
    closeCall()
    if (ringtoneTimerRef.current) clearInterval(ringtoneTimerRef.current)
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(audioError => {
        console.warn('Could not close chat audio context:', audioError)
      })
    }
  }, [closeCall])

  const toggleSounds = async () => {
    const nextEnabled = !soundsEnabled
    localStorage.setItem('redseaLiveChatSounds', String(nextEnabled))
    setSoundsEnabled(nextEnabled)
    setSoundError('')
    if (nextEnabled) await unlockAudio()
  }

  const sendText = async event => {
    event?.preventDefault()
    const text = draft.trim()
    if ((!text && !editingMessage) || sending || !conversationId) return
    setSending(true)
    setError('')
    try {
      if (editingMessage) {
        if (admin) {
          await liveChatAPI.updateAdminMessage(conversationId, editingMessage.id, text)
        } else {
          await liveChatAPI.updateClientMessage(conversationId, clientIdentity.deviceId, editingMessage.id, text)
        }
        setEditingMessage(null)
      } else {
        await postMessage({
          type: 'text',
          text,
          replyToMessageId: replyTarget?.id || null,
        })
        playTone(440)
        setReplyTarget(null)
      }
      setDraft('')
      await refreshCurrentMessages()
    } catch (requestError) {
      if (!recoverExpiredClientSession()) {
        setError(requestError.message || 'Message could not be sent.')
      }
    } finally {
      setSending(false)
    }
  }

  const sendFile = async (file, caption = '') => {
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setError('Files must be 6 MB or smaller.')
      return
    }
    setSending(true)
    setError('')
    try {
      const { mime, data } = normalizeAttachment(await fileToDataUrl(file), file.type)
      await postMessage({
        type: 'attachment',
        text: file.type.startsWith('image/') ? caption.trim() : '',
        attachment: { name: file.name, mime, data },
        replyToMessageId: replyTarget?.id || null,
      })
      setReplyTarget(null)
      await loadMessages()
    } catch (requestError) {
      if (!recoverExpiredClientSession()) {
        setError(requestError.message || 'Attachment could not be sent.')
      }
    } finally {
      setSending(false)
    }
  }

  const sendImage = async event => {
    event.preventDefault()
    if (!imageToSend || sending) return
    await sendFile(imageToSend, imageCaption)
    setImageToSend(null)
    setImageCaption('')
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const editMessage = message => {
    setEditingMessage(message)
    setReplyTarget(null)
    setDraft(message.text || '')
  }

  const removeMessage = async message => {
    setPendingDeleteMessage(message)
  }

  const confirmDeleteMessage = async () => {
    if (!pendingDeleteMessage) return
    setSending(true)
    setError('')
    try {
      if (admin) {
        await liveChatAPI.deleteAdminMessage(conversationId, pendingDeleteMessage.id)
      } else {
        await liveChatAPI.deleteClientMessage(conversationId, clientIdentity.deviceId, pendingDeleteMessage.id)
      }
      await refreshCurrentMessages()
      setPendingDeleteMessage(null)
    } catch (requestError) {
      if (!recoverExpiredClientSession()) setError(requestError.message || 'Message could not be deleted.')
    } finally {
      setSending(false)
    }
  }

  const forwardMessage = async message => {
    setSending(true)
    setError('')
    try {
      if (admin) {
        await liveChatAPI.forwardAdminMessage(conversationId, message.id)
      } else {
        await liveChatAPI.forwardClientMessage(conversationId, clientIdentity.deviceId, message.id)
      }
      await loadMessages()
    } catch (requestError) {
      if (!recoverExpiredClientSession()) setError(requestError.message || 'Message could not be forwarded.')
    } finally {
      setSending(false)
    }
  }

  const toggleVoiceRecording = async () => {
    setError('')
    if (sending || voiceSendInFlightRef.current) return
    if (recorderRef.current) {
      if (recorderRef.current.state === 'recording') {
        recorderRef.current.requestData()
        recorderRef.current.stop()
        setSending(true)
      }
      setRecording(false)
      return
    }
    try {
      if (!window.isSecureContext) {
        throw new Error(getMediaAccessError(null, 'audio'))
      }
      if (!window.MediaRecorder) {
        throw new Error('This browser does not support voice recording. Try an up-to-date browser.')
      }
      const stream = await getMicrophoneStream()
      voiceStreamRef.current = stream
      recordingChunksRef.current = []
      const supportedVoiceTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
      ]
      const voiceMimeType = getSupportedMimeType(supportedVoiceTypes)
      const recorder = new MediaRecorder(stream, voiceMimeType
        ? { mimeType: voiceMimeType, audioBitsPerSecond: 128000 }
        : { audioBitsPerSecond: 128000 })
      recorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data.size) recordingChunksRef.current.push(event.data)
      }
      recorder.onerror = event => {
        voiceSendInFlightRef.current = false
        setRecording(false)
        setSending(false)
        setRecordingStartedAt(null)
        recordingStartedAtRef.current = null
        recorderRef.current = null
        recordingChunksRef.current = []
        stopMediaStream(stream)
        voiceStreamRef.current = null
        setError(getMediaAccessError(event.error, 'audio'))
      }
      recorder.onstop = async () => {
        if (voiceSendInFlightRef.current) return
        voiceSendInFlightRef.current = true
        setRecording(false)
        const startedAt = recordingStartedAtRef.current
        recordingStartedAtRef.current = null
        setRecordingStartedAt(null)
        recorderRef.current = null
        stopMediaStream(stream)
        voiceStreamRef.current = null
        const chunks = recordingChunksRef.current
        recordingChunksRef.current = []
        const mimeType = recorder.mimeType || chunks.find(chunk => chunk.type)?.type || 'audio/webm'
        const blob = new Blob(chunks, { type: mimeType })
        setSending(true)
        try {
          if (blob.size > MAX_FILE_SIZE) {
            setError('Voice recordings must be 6 MB or smaller.')
            return
          }
          if (!blob.size) {
            setError('No audio was captured. Check microphone permission and try recording again.')
            return
          }
          if (startedAt && Date.now() - startedAt < 1000) {
            setError('The recording was too short to capture. Record for at least one second and try again.')
            return
          }
          const { mime, data } = normalizeAttachment(await fileToDataUrl(blob), blob.type)
          const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'
          await postMessage({
            type: 'voice',
            attachment: { name: `Voice message.${extension}`, mime, data },
          })
          await loadMessages()
        } catch (requestError) {
          if (!recoverExpiredClientSession()) {
            setError(requestError.message || 'Voice message could not be sent.')
          }
        } finally {
          voiceSendInFlightRef.current = false
          setSending(false)
        }
      }
      recorder.start(250)
      recordingStartedAtRef.current = Date.now()
      setRecordingStartedAt(recordingStartedAtRef.current)
      setRecording(true)
    } catch (requestError) {
      recorderRef.current = null
      recordingChunksRef.current = []
      voiceStreamRef.current?.getTracks().forEach(track => track.stop())
      voiceStreamRef.current = null
      setRecordingStartedAt(null)
      setError(
        requestError.message && requestError.name === 'Error'
          ? requestError.message
          : getMediaAccessError(requestError, 'audio')
      )
    }
  }

  const createPeer = async mediaType => {
    if (!window.isSecureContext) {
      throw new Error(getMediaAccessError(null, mediaType))
    }
    const iceServers = getIceServers()
    let stream
    try {
      stream = await getMicrophoneStream(mediaType)
    } catch (mediaError) {
      throw new Error(
        mediaError.name === 'Error'
          ? mediaError.message
          : getMediaAccessError(mediaError, mediaType)
      )
    }
    localCallStreamRef.current = stream
    if (mediaType === 'video') setLocalVideoStream(stream)
    const peer = new RTCPeerConnection({ iceServers })
    stream.getTracks().forEach(track => peer.addTrack(track, stream))
    peer.ontrack = event => {
      const remoteStream = event.streams[0] || remoteCallStreamRef.current || new MediaStream()
      if (!event.streams[0] && !remoteStream.getTracks().includes(event.track)) {
        remoteStream.addTrack(event.track)
      }
      remoteCallStreamRef.current = remoteStream
      setRemoteCallStream(new MediaStream(remoteStream.getTracks()))
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        if (connectionGraceTimerRef.current) {
          clearTimeout(connectionGraceTimerRef.current)
          connectionGraceTimerRef.current = null
        }
        setCallState('connected')
      }
      if (peer.connectionState === 'disconnected' && !connectionGraceTimerRef.current) {
        connectionGraceTimerRef.current = setTimeout(() => {
          connectionGraceTimerRef.current = null
          if (peer.connectionState !== 'connected') {
            setError('Call connection was lost. Check your network and TURN relay settings, then try again.')
            closeCall()
          }
        }, 15000)
      }
      if (peer.connectionState === 'failed') {
        setError('Could not connect this call. Check microphone/camera permission, network access, and TURN relay settings.')
        closeCall()
      }
    }
    peerRef.current = peer
    return peer
  }

  const startCallRecording = async () => {
    if (!admin || callRecorderRef.current || !localCallStreamRef.current || !remoteCallStreamRef.current) return
    try {
      if (!window.MediaRecorder) throw new Error('Call recording is not supported by this browser.')
      const callStream = new MediaStream()
      if (callMediaType === 'video') {
        const localVideo = document.createElement('video')
        const remoteVideo = document.createElement('video')
        localVideo.muted = true
        remoteVideo.muted = true
        localVideo.playsInline = true
        remoteVideo.playsInline = true
        localVideo.srcObject = localCallStreamRef.current
        remoteVideo.srcObject = remoteCallStreamRef.current
        await Promise.all([
          localVideo.play().catch(() => {}),
          remoteVideo.play().catch(() => {}),
        ])

        const canvas = document.createElement('canvas')
        canvas.width = 1280
        canvas.height = 720
        const canvasContext = canvas.getContext('2d')
        if (!canvasContext || !canvas.captureStream) {
          throw new Error('This browser cannot capture video call recordings.')
        }
        const drawVideo = (video, x) => {
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return
          const halfWidth = canvas.width / 2
          const scale = Math.max(halfWidth / video.videoWidth, canvas.height / video.videoHeight)
          const width = video.videoWidth * scale
          const height = video.videoHeight * scale
          canvasContext.save()
          canvasContext.beginPath()
          canvasContext.rect(x, 0, halfWidth, canvas.height)
          canvasContext.clip()
          canvasContext.drawImage(video, x + (halfWidth - width) / 2, (canvas.height - height) / 2, width, height)
          canvasContext.restore()
        }
        const drawFrame = () => {
          canvasContext.fillStyle = '#111827'
          canvasContext.fillRect(0, 0, canvas.width, canvas.height)
          drawVideo(localVideo, 0)
          drawVideo(remoteVideo, canvas.width / 2)
          callRecordingFrameRef.current = requestAnimationFrame(drawFrame)
        }
        drawFrame()
        const canvasStream = canvas.captureStream(15)
        callRecordingCanvasStreamRef.current = canvasStream
        canvasStream.getVideoTracks().forEach(track => callStream.addTrack(track))
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      const localAudioTrack = localCallStreamRef.current.getAudioTracks()[0]
      const remoteAudioTrack = remoteCallStreamRef.current.getAudioTracks()[0]
      if (AudioContextClass && (localAudioTrack || remoteAudioTrack)) {
        const context = new AudioContextClass()
        if (context.state !== 'running') await context.resume()
        const destination = context.createMediaStreamDestination()
        if (localAudioTrack) {
          context.createMediaStreamSource(new MediaStream([localAudioTrack])).connect(destination)
        }
        if (remoteAudioTrack) {
          context.createMediaStreamSource(new MediaStream([remoteAudioTrack])).connect(destination)
        }
        callRecordingContextRef.current = context
        destination.stream.getAudioTracks().forEach(track => callStream.addTrack(track))
      } else {
        ;[localAudioTrack, remoteAudioTrack].filter(Boolean).forEach(track => callStream.addTrack(track))
      }

      if (!callStream.getTracks().length) throw new Error('Call media is not ready to record yet.')
      const supportedCallTypes = callMediaType === 'video'
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
      const callMimeType = getSupportedMimeType(supportedCallTypes)
      const recorder = new MediaRecorder(callStream, callMimeType ? { mimeType: callMimeType } : undefined)
      callRecordingChunksRef.current = []
      callRecorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data.size) callRecordingChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        callRecorderRef.current = null
        if (callRecordingFrameRef.current) cancelAnimationFrame(callRecordingFrameRef.current)
        callRecordingFrameRef.current = null
        callRecordingCanvasStreamRef.current?.getTracks().forEach(track => track.stop())
        callRecordingCanvasStreamRef.current = null
        if (callRecordingContextRef.current && callRecordingContextRef.current.state !== 'closed') {
          callRecordingContextRef.current.close().catch(audioError => {
            console.warn('Could not close call recording audio context:', audioError)
          })
        }
        callRecordingContextRef.current = null
        setCallRecordingState('idle')
        setError('Call recording failed. The call can continue without recording.')
      }
      recorder.onstop = () => {
        callRecorderRef.current = null
        const mimeType = recorder.mimeType || callRecordingChunksRef.current.find(chunk => chunk.type)?.type || 'audio/webm'
        const blob = new Blob(callRecordingChunksRef.current, { type: mimeType })
        callRecordingChunksRef.current = []
        if (callRecordingFrameRef.current) cancelAnimationFrame(callRecordingFrameRef.current)
        callRecordingFrameRef.current = null
        callRecordingCanvasStreamRef.current?.getTracks().forEach(track => track.stop())
        callRecordingCanvasStreamRef.current = null
        if (callRecordingContextRef.current && callRecordingContextRef.current.state !== 'closed') {
          callRecordingContextRef.current.close().catch(audioError => {
            console.warn('Could not close call recording audio context:', audioError)
          })
        }
        callRecordingContextRef.current = null
        callStream.getTracks().forEach(track => track.stop())
        if (blob.size) {
          setFinishedRecording({ blob, mediaType: callMediaType, conversationId })
          setCallRecordingState('finished')
        } else {
          setCallRecordingState('idle')
        }
      }
      recorder.start(1000)
      setCallRecordingState('recording')
    } catch (requestError) {
      if (callRecordingFrameRef.current) cancelAnimationFrame(callRecordingFrameRef.current)
      callRecordingFrameRef.current = null
      callRecordingCanvasStreamRef.current?.getTracks().forEach(track => track.stop())
      callRecordingCanvasStreamRef.current = null
      if (callRecordingContextRef.current && callRecordingContextRef.current.state !== 'closed') {
        callRecordingContextRef.current.close().catch(audioError => {
          console.warn('Could not close call recording audio context:', audioError)
        })
      }
      callRecordingContextRef.current = null
      setCallRecordingState('idle')
      setError(requestError.message || 'Could not record this call.')
    }
  }

  useEffect(() => {
    if (admin && callRecordingState === 'recording' && !callRecorderRef.current) {
      startCallRecording()
    }
  }, [admin, callMediaType, callRecordingState, localVideoStream, remoteCallStream])

  const startCall = async mediaType => {
    try {
      setError('')
      setCallMediaType(mediaType)
      setCallState('calling')
      const peer = await createPeer(mediaType)
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await waitForIceGathering(peer)
      const text = mediaType === 'video'
        ? JSON.stringify({ mediaType, description: peer.localDescription })
        : JSON.stringify(peer.localDescription)
      await postMessage({ type: 'call-offer', text })
    } catch (requestError) {
      closeCall()
      setError(requestError.message || `Could not start the ${mediaType} call.`)
    }
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    try {
      setError('')
      const { mediaType, description } = getCallDetails(incomingCall.text)
      setCallMediaType(mediaType)
      const peer = await createPeer(mediaType)
      await peer.setRemoteDescription(description)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      await waitForIceGathering(peer)
      const text = mediaType === 'video'
        ? JSON.stringify({ mediaType, description: peer.localDescription })
        : JSON.stringify(peer.localDescription)
      await postMessage({ type: 'call-answer', text })
      setIncomingCall(null)
      setCallState('calling')
    } catch (requestError) {
      closeCall()
      setError(requestError.message || 'Could not answer the call.')
    }
  }

  const endCall = async () => {
    try {
      await postMessage({ type: 'call-end' })
    } catch (requestError) {
      setError(requestError.message || 'Could not notify the other person that the call ended.')
    }
    closeCall()
  }

  const requestCallRecording = async () => {
    try {
      await postMessage({ type: 'call-record-request' })
      setCallRecordingState('requesting')
    } catch (requestError) {
      setError(requestError.message || 'Could not request permission to record the call.')
    }
  }

  const acceptRecordingRequest = async () => {
    if (!recordingRequest) return
    try {
      await postMessage({ type: 'call-record-consent' })
      setRecordingRequest(null)
      setCallRecordingState('recording')
    } catch (requestError) {
      setError(requestError.message || 'Could not confirm call recording consent.')
    }
  }

  const declineRecordingRequest = async () => {
    try {
      await postMessage({ type: 'call-record-decline' })
      setRecordingRequest(null)
      setCallRecordingState('idle')
    } catch (requestError) {
      setError(requestError.message || 'Could not decline call recording.')
    }
  }

  const saveFinishedRecording = async () => {
    if (!finishedRecording) return
    try {
      const savedCall = {
        id: newConversationId(),
        conversationId: finishedRecording.conversationId,
        mediaType: finishedRecording.mediaType,
        savedAt: new Date().toISOString(),
        blob: finishedRecording.blob,
      }
      await storeSavedCall(savedCall)
      setSavedCalls(current => [savedCall, ...current])
      setFinishedRecording(null)
      setCallRecordingState('idle')
      setAdminView('saved')
      setError('')
    } catch (requestError) {
      setError(requestError.message || 'Could not save this call recording.')
    }
  }

  const deleteRecording = async id => {
    try {
      await deleteSavedCall(id)
      setSavedCalls(current => current.filter(call => call.id !== id))
    } catch (requestError) {
      setError(requestError.message || 'Could not delete this call recording.')
    }
  }

  const discardFinishedRecording = () => {
    setFinishedRecording(null)
    setCallRecordingState('idle')
  }

  const toggleMicrophone = () => {
    const enabled = !microphoneEnabled
    localCallStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = enabled })
    setMicrophoneEnabled(enabled)
  }

  const toggleCamera = () => {
    const enabled = !cameraEnabled
    localCallStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = enabled })
    setCameraEnabled(enabled)
  }

  const toggleSpeaker = async () => {
    const enabled = !speakerEnabled
    setSpeakerEnabled(enabled)
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !enabled
      if (enabled) {
        try {
          await remoteAudioRef.current.play()
          setSpeakerPlaybackBlocked(false)
        } catch {
          setSpeakerPlaybackBlocked(true)
        }
      }
    }
  }

  const enableCallAudio = async () => {
    if (!remoteAudioRef.current) return
    remoteAudioRef.current.muted = false
    setSpeakerEnabled(true)
    try {
      await remoteAudioRef.current.play()
      setSpeakerPlaybackBlocked(false)
    } catch (playbackError) {
      setError(playbackError.message || 'Call audio could not start. Use the audio controls or check your phone volume.')
    }
  }

  const renderMessage = message => {
    const attachmentUrl = attachmentUrls[`${conversationId}:${message.id}`] || ''
    const kind = getAttachmentKind(message)
    if (message.type.startsWith('call-')) return null
    const senderLabel = message.senderName || (
      message.sender === 'admin'
        ? 'Support'
        : admin
          ? (selectedConversation?.displayName || 'Guest visitor')
          : (clientIdentity?.displayName || 'Guest visitor')
    )
    return (
      <div key={message.id} className={`chat-message-row ${message.sender === 'admin' ? 'admin' : 'user'}`}>
        <div className="chat-message-bubble">
          {message.forwardedFromMessageId && <small className="chat-message-forwarded">↗ Forwarded from {message.forwardedFromName || 'chat participant'}</small>}
          {message.replyToMessageId && (
            <div className="chat-message-reply-preview">
              <strong>{message.replySenderName || 'Chat participant'}</strong>
              <span>{message.replyDeletedAt ? 'This message was deleted.' : message.replyText || (message.replyType === 'attachment' ? 'Attachment' : 'Voice message')}</span>
            </div>
          )}
          {message.deletedAt
            ? <em className="chat-deleted-placeholder"><span aria-hidden="true">🗑️</span>This message was deleted.</em>
            : message.text && kind !== 'image' && <span>{message.text}</span>}
          {!message.deletedAt && attachmentUrl && kind === 'image' && (
            <>
              <a href={attachmentUrl} target="_blank" rel="noreferrer" className="chat-message-image-link">
                <img src={attachmentUrl} alt={message.attachmentName} className="chat-message-media" loading="lazy" />
              </a>
              {message.text && <span>{message.text}</span>}
            </>
          )}
          {!message.deletedAt && attachmentUrl && (kind === 'voice' || kind === 'audio') && (
            <audio controls preload="metadata" src={attachmentUrl} aria-label="Voice message" />
          )}
          {!message.deletedAt && attachmentUrl && kind === 'video' && (
            <video controls preload="metadata" src={attachmentUrl} className="chat-message-media" aria-label={message.attachmentName} />
          )}
          {!message.deletedAt && attachmentUrl && kind !== 'image' && kind !== 'voice' && kind !== 'audio' && kind !== 'video' && (
            <a href={attachmentUrl} className="chat-message-link">
              {kind === 'pdf' ? '📄' : '📎'} {message.attachmentName}
            </a>
          )}
          <small>{senderLabel} · {new Date(message.createdAt).toLocaleTimeString()}</small>
          {!message.deletedAt && message.editedAt && <small className="chat-message-edited">(edited)</small>}
          {!message.deletedAt && !message.type.startsWith('call-') && (
            <div className="chat-message-actions">
              <button type="button" disabled={sending} onClick={() => { setReplyTarget(message); setEditingMessage(null); setDraft('') }}>Reply</button>
              <button type="button" disabled={sending} onClick={() => forwardMessage(message)}>Forward</button>
              {message.canEdit && isWithinMessageEditWindow(message.createdAt) &&
                (message.type === 'text' || (kind === 'image' && message.type === 'attachment')) && (
                <button type="button" disabled={sending} onClick={() => editMessage(message)}>Edit</button>
              )}
              {message.canEdit && <button type="button" disabled={sending} onClick={() => removeMessage(message)}>Delete</button>}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`support-chat ${admin ? 'support-chat-admin' : 'support-chat-client'}`}
      onClickCapture={() => { if (soundsEnabled) unlockAudio() }}
    >
      {admin && (
        <aside className="support-conversations">
          <div className="support-sidebar-tabs">
            <button type="button" className={adminView === 'chats' ? 'selected' : ''} onClick={() => setAdminView('chats')}>Chats</button>
            <button type="button" className={adminView === 'saved' ? 'selected' : ''} onClick={() => setAdminView('saved')}>Saved ({savedCalls.length})</button>
          </div>
          {adminView === 'chats' && (
            <>
              <h3>Conversations</h3>
              <input
                className="support-conversation-search"
                value={conversationSearch}
                onChange={event => {
                  setConversationSearch(event.target.value)
                  setConversationPage(0)
                }}
                placeholder="Search users, roles, or messages"
                aria-label="Search live chat conversations"
              />
              {filteredConversations.length === 0 && <p>No matching customer conversations.</p>}
              {visibleConversations.map(conversation => (
                <button
                  type="button"
                  key={conversation.conversationId}
                  className={conversation.conversationId === selectedConversationId ? 'selected' : ''}
                  onClick={() => setSelectedConversationId(conversation.conversationId)}
                >
                  <strong>
                    {conversation.participantType === 'account'
                      ? `${conversation.displayName} · ${conversation.accountRole || 'account'}`
                      : 'Guest visitor'}
                  </strong>
                  <span>{conversation.lastMessage || 'New message'}</span>
                  <small className={`support-presence ${conversation.isOnline ? 'online' : 'offline'}`}>
                    <span aria-hidden="true" />
                    {conversation.participantType === 'account' ? (conversation.isOnline ? 'Online' : 'Offline') : 'Guest'}
                    {conversation.accountRole ? ` · ${conversation.accountRole}` : ''}
                  </small>
                  <small>Chat {conversation.conversationId.slice(0, 8)} · Device {String(conversation.deviceId || conversation.conversationId).slice(0, 8)}</small>
                  <small>{new Date(conversation.updatedAt + 'Z').toLocaleString()}</small>
                </button>
              ))}
              <Pagination
                page={safeConversationPage}
                itemCount={filteredConversations.length}
                onPageChange={setConversationPage}
                label="live chat conversations"
              />
            </>
          )}
          {adminView === 'saved' && (
            <div className="support-saved-sidebar">
              <strong>Saved call recordings</strong>
              <small>{savedCalls.length} recording{savedCalls.length === 1 ? '' : 's'} stored on this device</small>
            </div>
          )}
        </aside>
      )}

      <section className="support-conversation">
        <header className="support-chat-title">
          <div>
            <strong>
              {admin && adminView === 'saved'
                ? 'Saved recordings'
                : admin
                  ? (conversationId
                    ? `${selectedParticipantLabel || `Previous chat`} · Chat ${conversationId.slice(0, 8)} · Device ${String(selectedConversation?.deviceId || conversationId).slice(0, 8)}`
                    : 'Select a conversation')
                  : 'REDSEA Live Support'}
            </strong>
            <small>
              {admin && adminView === 'saved'
                ? 'Call recordings are stored privately in this browser.'
                : callRecordingState === 'recording'
                  ? 'Recording is active with both participants’ consent'
                  : callState === 'connected' ? `${callMediaType === 'video' ? 'Video' : 'Audio'} call connected` : callState === 'calling' ? `Calling by ${callMediaType}…` : admin ? 'You are online and available to support users' : `${supportOnline === null ? 'Checking admin status…' : `Admin ${supportOnline ? 'online' : 'offline'}`} · Messages are delivered to the support team`}
            </small>
          </div>
          {(!admin || adminView === 'chats') && (
            <div className="support-chat-actions">
              <button type="button" onClick={toggleSounds} aria-pressed={soundsEnabled}>
                {soundsEnabled ? '🔔 Sound on' : '🔕 Sound off'}
              </button>
              {soundError && <small className="support-sound-error" role="status">{soundError}</small>}
              {callState === 'idle' ? (
                <div className="support-call-actions">
                  <button type="button" onClick={() => startCall('audio')} disabled={!conversationId}>🎙️ Audio call</button>
                  <button type="button" onClick={() => startCall('video')} disabled={!conversationId}>📹 Video call</button>
                </div>
              ) : (
                <button type="button" onClick={endCall}>📵 End call</button>
              )}
            </div>
          )}
        </header>

        {admin && adminView === 'saved' ? (
          <div className="support-saved-list">
            {savedCalls.length === 0 && <div className="support-chat-empty">No calls have been saved on this device yet.</div>}
            {visibleSavedCalls.map(call => (
              <article key={call.id} className="support-saved-recording">
                <div className="support-saved-recording-title">
                  <div>
                    <strong>{call.mediaType === 'video' ? 'Video call' : 'Audio call'} · Visitor {call.conversationId.slice(0, 6)}</strong>
                    <small>Saved {new Date(call.savedAt).toLocaleString()}</small>
                  </div>
                  <button type="button" className="support-delete-recording" onClick={() => deleteRecording(call.id)}>Delete</button>
                </div>
                {call.mediaType === 'video'
                  ? <video controls playsInline preload="metadata" src={savedCallUrls[call.id]} aria-label="Saved video call recording" />
                  : <audio controls preload="metadata" src={savedCallUrls[call.id]} aria-label="Saved audio call recording" />}
              </article>
            ))}
            <Pagination
            page={safeSavedCallPage}
            itemCount={savedCalls.length}
            onPageChange={setSavedCallPage}
            label="saved call recordings"
            />
          </div>
        ) : !conversationId ? (
          <div className="support-chat-empty">Choose a customer conversation to reply and share files.</div>
        ) : !admin && !clientConversationReady ? (
          <div className="support-chat-empty" role={error ? 'alert' : 'status'}>
            {error || 'Connecting to live support…'}
          </div>
        ) : (
          <>
            <div className="chat-control-stream" ref={messageListRef}>
              {messages.map(renderMessage)}
              {incomingCall && (
                <div className="support-incoming-call">
                  <span>Incoming {callMediaType} call from {admin ? 'visitor' : 'support'}</span>
                  <button type="button" onClick={acceptCall}>Accept</button>
                  <button type="button" onClick={endCall}>Decline</button>
                </div>
              )}
              {recordingRequest && (
                <div className="support-recording-consent" role="alert">
                  <span>{admin ? 'The visitor' : 'Support'} is asking to record this call. Recording will begin only if you consent.</span>
                  <button type="button" onClick={acceptRecordingRequest}>Allow recording</button>
                  <button type="button" onClick={declineRecordingRequest}>Decline</button>
                </div>
              )}
              {admin && callRecordingState === 'requesting' && (
                <div className="support-recording-consent" role="status">Waiting for the other participant to allow recording…</div>
              )}
              {callMediaType === 'video' && callState !== 'idle' && (
                <div className="support-video-call">
                  {localVideoStream && <video ref={localVideoRef} autoPlay muted playsInline className="support-local-video" aria-label="Your camera preview" />}
                  <video ref={remoteVideoRef} autoPlay controls playsInline className="support-remote-video" aria-label="Video call" />
                </div>
              )}
              {callState !== 'idle' && (
                <audio
                  ref={remoteAudioRef}
                  autoPlay
                  controls
                  className={remoteCallStream?.getAudioTracks().length ? 'support-remote-audio' : 'support-remote-audio hidden'}
                  aria-label="Remote call audio"
                />
              )}
              {speakerPlaybackBlocked && callState !== 'idle' && (
                <button type="button" className="support-enable-audio" onClick={enableCallAudio}>
                  Tap to enable call audio
                </button>
              )}
              {finishedRecording && (
                <div className="support-save-prompt" role="dialog" aria-label="Save call recording">
                  <strong>Call ended. Save this {finishedRecording.mediaType} recording?</strong>
                  <span>The recording is stored only in this browser.</span>
                  <button type="button" onClick={saveFinishedRecording}>Save recording</button>
                  <button type="button" onClick={discardFinishedRecording}>Discard</button>
                </div>
              )}
            </div>
            {error && <p role="alert" className="support-chat-error">{error}</p>}
            {callState !== 'idle' && (
              <div className="support-call-media-controls">
                <button type="button" onClick={toggleMicrophone} aria-pressed={microphoneEnabled}>
                  {microphoneEnabled ? '🎙️ Mute microphone' : '🔇 Unmute microphone'}
                </button>
                {callMediaType === 'video' && (
                  <button type="button" onClick={toggleCamera} aria-pressed={cameraEnabled}>
                    {cameraEnabled ? '📷 Turn camera off' : '📷 Turn camera on'}
                  </button>
                )}
                <button type="button" onClick={toggleSpeaker} aria-pressed={speakerEnabled}>
                  {speakerEnabled ? '🔊 Speaker on' : '🔈 Speaker off'}
                </button>
                {admin && callState === 'connected' && callRecordingState === 'idle' && (
                  <button type="button" onClick={requestCallRecording}>⏺ Request to record</button>
                )}
              </div>
            )}
            {admin && (
              <div className="chat-control-toolbar" aria-label="Message attachments">
                <button type="button" disabled={sending} onClick={() => fileInputRef.current?.click()}>📎 File</button>
                <button type="button" disabled={sending} onClick={() => imageInputRef.current?.click()}>🖼️ Image</button>
                <button type="button" disabled={sending && !recording} onClick={toggleVoiceRecording}>{recording ? `⏹ Stop (${formatDuration(recordingElapsed)})` : '🎙️ Voice message'}</button>
              </div>
            )}
            <input ref={fileInputRef} type="file" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; sendFile(file) }} />
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={event => {
              const file = event.target.files?.[0]
              if (!file) return
              if (file.size > MAX_FILE_SIZE) {
                setError('Images must be 6 MB or smaller.')
                event.target.value = ''
                return
              }
              setImageToSend(file)
              setImageCaption('')
              setError('')
            }} />
            {!admin && (
              <div className="chat-control-toolbar" aria-label="Message attachments">
                <button type="button" disabled={sending} onClick={() => fileInputRef.current?.click()}>📎 File</button>
                <button type="button" disabled={sending} onClick={() => imageInputRef.current?.click()}>🖼️ Image</button>
                <button type="button" disabled={sending && !recording} onClick={toggleVoiceRecording}>{recording ? `⏹ Stop (${formatDuration(recordingElapsed)})` : '🎙️ Voice message'}</button>
              </div>
            )}
            {imageToSend && (
              <form className="chat-image-caption-form" onSubmit={sendImage}>
                <span>{imageToSend.name}</span>
                <input value={imageCaption} maxLength={1000} onChange={event => setImageCaption(event.target.value)} placeholder="Add a caption (optional)" aria-label="Image caption" />
                <button type="submit" disabled={sending}>Send image</button>
                <button type="button" disabled={sending} onClick={() => { setImageToSend(null); setImageCaption(''); if (imageInputRef.current) imageInputRef.current.value = '' }}>Cancel</button>
              </form>
            )}
            {replyTarget && <div className="chat-replying"><span>Replying to {replyTarget.senderName || (replyTarget.sender === 'admin' ? 'Support' : 'Visitor')}</span><button type="button" onClick={() => setReplyTarget(null)}>Cancel reply</button></div>}
            {editingMessage && <div className="chat-replying"><span>Editing message</span><button type="button" onClick={() => { setEditingMessage(null); setDraft('') }}>Cancel edit</button></div>}
            <form className="chat-control-composer" onSubmit={sendText}>
              <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={editingMessage?.type === 'text' ? 4000 : 4000} placeholder={editingMessage ? (getAttachmentKind(editingMessage) === 'image' ? 'Edit image caption…' : 'Edit message…') : replyTarget ? `Reply to ${replyTarget.senderName || 'participant'}…` : 'Write a message…'} aria-label="Chat message" />
              <button type="submit" disabled={sending || (!draft.trim() && !editingMessage)}>{sending ? 'Saving…' : editingMessage ? 'Save edit' : 'Send'}</button>
            </form>
          </>
        )}
      </section>
      {pendingDeleteMessage && (
        <div className="chat-confirm-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget && !sending) setPendingDeleteMessage(null)
        }}>
          <section className="chat-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="chatDeleteTitle">
            <span className="chat-confirm-icon" aria-hidden="true">🗑️</span>
            <h2 id="chatDeleteTitle">Delete this message?</h2>
            <p>It will be removed for both participants and replaced with “This message was deleted.”</p>
            <div className="chat-confirm-actions">
              <button type="button" disabled={sending} onClick={() => setPendingDeleteMessage(null)}>Keep message</button>
              <button type="button" className="confirm-delete" disabled={sending} onClick={confirmDeleteMessage}>
                {sending ? 'Deleting…' : 'Delete for everyone'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default LiveSupportChat
