const newId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0
    return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16)
  })
}

const readStoredUser = key => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch (error) {
    console.warn(`Could not read ${key} for the live chat identity:`, error)
    return null
  }
}

const isLiveChatTokenUsable = token => {
  if (!token) return false
  try {
    const payload = token.split('.')[1]
    if (!payload) return false
    const decoded = globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims = JSON.parse(decoded)
    return claims.exp === undefined || (
      typeof claims.exp === 'number' &&
      claims.exp > Date.now() / 1000
    )
  } catch {
    return false
  }
}

export const getLiveChatToken = () => {
  const rootToken = localStorage.getItem('rootToken')
  const userToken = localStorage.getItem('authToken')
  let user = null
  try {
    user = JSON.parse(localStorage.getItem('userData') || 'null')
  } catch (error) {
    console.warn('Could not read the user for the live chat identity:', error)
  }
  const validRootToken = isLiveChatTokenUsable(rootToken)
  const validUserToken = isLiveChatTokenUsable(userToken)
  const isGuestSession = user?.role === 'guest' && userToken?.startsWith('guest-')

  if (rootToken && !validRootToken) localStorage.removeItem('rootToken')
  if (userToken && !validUserToken && !isGuestSession) localStorage.removeItem('authToken')

  return validRootToken ? rootToken : validUserToken ? userToken : null
}

export const getLiveChatIdentity = () => {
  let deviceId = localStorage.getItem('redseaLiveChatDeviceId')
  if (!deviceId) {
    deviceId = newId()
    localStorage.setItem('redseaLiveChatDeviceId', deviceId)
  }

  const token = getLiveChatToken()
  const rootToken = localStorage.getItem('rootToken')
  const isRoot = Boolean(rootToken)
  const user = isRoot ? readStoredUser('rootUser') : readStoredUser('userData')
  const accountId = user?.id ?? user?._id ?? user?.username ?? user?.email
  const role = String(user?.role || (isRoot ? 'root' : 'user')).toLowerCase()
  const accountKey = token
    ? `account:${role}:${accountId || 'signed-in'}`
    : `guest:${deviceId}`
  const conversationStorageKey = `redseaLiveChatConversation:${encodeURIComponent(accountKey)}:${deviceId}`

  let conversationId = localStorage.getItem(conversationStorageKey)
  if (!conversationId && !token) {
    conversationId = localStorage.getItem('redseaLiveChatId')
  }
  if (!conversationId) conversationId = newId()

  localStorage.setItem(conversationStorageKey, conversationId)
  if (!token) localStorage.setItem('redseaLiveChatId', conversationId)

  const displayName = user?.full_name || user?.fullName || user?.username || 'Guest visitor'
  return { deviceId, conversationId, identityKey: `${accountKey}:${deviceId}`, displayName }
}
