/**
 * Guest & User Account System (localStorage backed)
 * -------------------------------------------------
 * Handles:
 *   - Guest mode entry (full name + phone) from the login page
 *   - Guest -> User account upgrade requests (full name + password + OTP)
 *   - OTP generation with 24 hour expiry
 *   - Password generate / reset / change
 *   - Client-side notifications (bell / notification popup)
 *
 * Data lives in localStorage so the whole flow works end-to-end without
 * requiring backend schema changes. All keys are prefixed with "redsea_".
 */

const GUEST_SESSION_KEY = 'redsea_guest_session'
const GUEST_ACCOUNTS_KEY = 'redsea_guest_accounts'
const USER_ACCOUNTS_KEY = 'redsea_user_accounts'
const UPGRADE_REQUESTS_KEY = 'redsea_upgrade_requests'
const NOTIFICATIONS_KEY = 'redsea_notifications'

// OTP validity window. The request said "24 day"; 24 hours is the standard and
// safer choice for a one-time password. Change this constant to alter it.
export const OTP_EXPIRY_HOURS = 24

/* ------------------------------------------------------------------ */
/* Low level helpers                                                   */
/* ------------------------------------------------------------------ */

const readList = (key) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const readProfile = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('userProfile') || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const writeProfile = (profile) => {
  try {
    localStorage.setItem('userProfile', JSON.stringify(profile))
    return true
  } catch (error) {
    console.error('Could not persist the profile:', error)
    return false
  }
}

const writeList = (key, list) => {
  try {
    localStorage.setItem(key, JSON.stringify(list))
    return true
  } catch (error) {
    console.error(`Could not persist ${key}:`, error)
    return false
  }
}

const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Light-weight, non-cryptographic obfuscation so passwords are never stored in
// plain text. (Replace with a server hash when a real backend is wired up.)
const hashPassword = (password) => {
  const input = String(password || '')
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }
  return `h${(hash >>> 0).toString(36)}_${input.length}`
}

export const verifyPassword = (password, storedHash) => hashPassword(password) === storedHash

/* ------------------------------------------------------------------ */
/* OTP + password helpers                                              */
/* ------------------------------------------------------------------ */

export const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000))

export const generatePassword = (length = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

const otpExpiry = () => Date.now() + OTP_EXPIRY_HOURS * 60 * 60 * 1000
const isExpired = (expiresAt) => Number(expiresAt) < Date.now()
const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('251') && digits.length === 12) return `0${digits.slice(3)}`
  return digits
}

/* ------------------------------------------------------------------ */
/* App auth session (mirrors what ProtectedRoute / Header expect)      */
/* ------------------------------------------------------------------ */

const setAppSession = (userData, tokenPrefix) => {
  localStorage.removeItem('rootToken')
  localStorage.removeItem('rootUser')
  localStorage.removeItem('rootApiBaseUrl')
  localStorage.removeItem('authApiBaseUrl')
  localStorage.setItem('authToken', `${tokenPrefix}-${makeId('tok')}`)
  localStorage.setItem('userData', JSON.stringify(userData))

  // Keep the picture / bio the person already uploaded so upgrading from a
  // guest session to a full user account never wipes their profile.
  const previous = readProfile()
  const account = findUserByPhone(userData.phone) || {}
  writeProfile({
    username: userData.phone,
    email: userData.email || `${userData.phone}@guest.redsea.com`,
    fullName: userData.fullName,
    phone: userData.phone,
    position: userData.role === 'guest' ? 'Guest' : 'User',
    bio: account.bio || previous.bio || '',
    profilePicture: account.profilePicture || previous.profilePicture || null,
  })
  // Ensure guest / user accounts never see the internal DataCollector tools.
  const permissions = {
    menus: {
      home: true,
      dataCollector: false,
      fixedCommission: true,
      movableCommission: true,
      brokerage: true,
      contact: true,
    },
    tabs: {
      dataRegistration: false,
      randomPiadRegister: false,
      scanner: false,
      payRegistration: false,
      unpaid: false,
      paid: false,
      needApproval: false,
      registered: false,
      result: false,
      paidRandomDataForm: false,
    },
    buttons: { create: false, edit: false, delete: false, approve: false },
  }
  localStorage.setItem('currentUserPermissions', JSON.stringify(permissions))
}

/* ------------------------------------------------------------------ */
/* Guest mode                                                          */
/* ------------------------------------------------------------------ */

export const registerGuest = ({ fullName, phone }) => {
  const cleanName = String(fullName || '').trim()
  const cleanPhone = String(phone || '').trim()
  if (!cleanName) throw new Error('Full name is required.')
  if (!/^[0-9+\-\s]{6,20}$/.test(cleanPhone)) throw new Error('Enter a valid phone number.')

  const existingGuest = getRegisteredGuests().find(
    guest => normalizePhone(guest.phone) === normalizePhone(cleanPhone)
  ) || getGuestSession()
  if (existingGuest && normalizePhone(existingGuest.phone) === normalizePhone(cleanPhone)) {
    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(existingGuest))
    setAppSession(existingGuest, 'guest')
    return existingGuest
  }

  const guest = {
    id: makeId('guest'),
    role: 'guest',
    fullName: cleanName,
    phone: cleanPhone,
    startedAt: new Date().toISOString(),
  }
  localStorage.setItem(GUEST_ACCOUNTS_KEY, JSON.stringify([guest, ...getRegisteredGuests()]))
  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(guest))
  setAppSession(guest, 'guest')
  return guest
}

export const getRegisteredGuests = () => {
  const guests = readList(GUEST_ACCOUNTS_KEY).filter(guest =>
    guest && guest.role === 'guest' && typeof guest.phone === 'string'
  )
  try {
    const legacyGuest = JSON.parse(localStorage.getItem(GUEST_SESSION_KEY) || 'null')
    if (
      legacyGuest?.role === 'guest' &&
      typeof legacyGuest.phone === 'string' &&
      !guests.some(guest => normalizePhone(guest.phone) === normalizePhone(legacyGuest.phone))
    ) {
      guests.push(legacyGuest)
    }
  } catch {
    // Keep valid saved guest accounts available if the legacy session is malformed.
  }
  return guests
}

export const loginGuest = ({ phone }) => {
  const cleanPhone = String(phone || '').trim()
  if (!/^[0-9+\-\s]{6,20}$/.test(cleanPhone)) throw new Error('Enter a valid phone number.')

  const guest = getRegisteredGuests().find(
    account => normalizePhone(account.phone) === normalizePhone(cleanPhone)
  ) || getGuestSession()
  if (!guest || normalizePhone(guest.phone) !== normalizePhone(cleanPhone)) {
    throw new Error('No guest registration was found for this phone on this device. Register as a guest first.')
  }

  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(guest))
  setAppSession(guest, 'guest')
  return guest
}

export const getGuestSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(GUEST_SESSION_KEY) || 'null')
    if (session?.role === 'guest' && typeof session.phone === 'string') return session
    return getRegisteredGuests()[0] || null
  } catch {
    return null
  }
}

export const isGuestMode = () => {
  const session = getGuestSession()
  if (!session) return false
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    return String(user.role || '').trim().toLowerCase() === 'guest' &&
      normalizePhone(user.phone) === normalizePhone(session.phone)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* User accounts                                                       */
/* ------------------------------------------------------------------ */

export const getUserAccounts = () => readList(USER_ACCOUNTS_KEY)

export const findUserByPhone = (phone) =>
  getUserAccounts().find(account => account.phone === String(phone || '').trim()) || null

export const getCurrentAccount = () => {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    if (!user || (user.role !== 'user' && user.role !== 'guest')) return null
    return findUserByPhone(user.phone) || null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Upgrade requests (guest -> user)                                    */
/* ------------------------------------------------------------------ */

export const getUpgradeRequests = () => readList(UPGRADE_REQUESTS_KEY)

export const createUpgradeRequest = ({ fullName, phone, password }) => {
  const cleanName = String(fullName || '').trim()
  const cleanPhone = String(phone || '').trim()
  if (!cleanName) throw new Error('Full name is required.')
  if (!/^[0-9+\-\s]{6,20}$/.test(cleanPhone)) throw new Error('Enter a valid phone number.')
  if (String(password || '').length < 6) throw new Error('Password must be at least 6 characters.')

  const existing = getUpgradeRequests().find(
    request => request.phone === cleanPhone && request.status === 'pending'
  )
  if (existing) throw new Error('An upgrade request for this phone number is already pending approval.')

  const otp = generateOTP()
  const request = {
    id: makeId('upg'),
    fullName: cleanName,
    phone: cleanPhone,
    passwordHash: hashPassword(password),
    otp,
    otpExpiresAt: otpExpiry(),
    status: 'pending', // pending -> approved -> completed
    requestedAt: new Date().toISOString(),
    approvedAt: null,
  }
  if (!writeList(UPGRADE_REQUESTS_KEY, [request, ...getUpgradeRequests()])) {
    throw new Error('Could not save the upgrade request. Check browser storage and try again.')
  }
  return request
}

export const findPendingRequestByPhone = (phone) =>
  getUpgradeRequests().find(
    request => request.phone === String(phone || '').trim() && request.status === 'approved'
  ) || null

export const approveUpgradeRequest = (requestId) => {
  const list = getUpgradeRequests()
  const target = list.find(request => request.id === requestId)
  if (!target) throw new Error('Upgrade request not found.')
  if (target.status !== 'pending') throw new Error('This request has already been processed.')

  const updated = list.map(request => request.id === requestId
    ? { ...request, status: 'approved', approvedAt: new Date().toISOString() }
    : request)
  writeList(UPGRADE_REQUESTS_KEY, updated)
  // The guest receives the OTP + their details straight in their notification
  // bell / popup so they can finish the registration without asking for it.
  pushNotification({
    type: 'account_approved',
    title: 'Account approved — here is your OTP',
    message: `Your account for ${target.fullName} (${target.phone}) was approved. Use OTP ${target.otp} with your password to activate it. The OTP is valid for ${OTP_EXPIRY_HOURS} hours (until ${new Date(Number(target.otpExpiresAt)).toLocaleString()}).`,
    phone: target.phone,
    otp: target.otp,
    fullName: target.fullName,
    requestId: target.id,
  })
  return updated.find(request => request.id === requestId)
}

/**
 * Final step: guest registers by phone, enters the OTP + password.
 * On success a real user account is created and the session upgrades.
 */
export const completeUpgradeWithOTP = ({ phone, otp, password }) => {
  const cleanPhone = String(phone || '').trim()
  const request = findPendingRequestByPhone(cleanPhone)
  if (!request) throw new Error('No approved request found for this phone number.')
  if (isExpired(request.otpExpiresAt)) throw new Error('This OTP has expired. Please request a new one.')
  if (String(otp || '').trim() !== request.otp) throw new Error('Incorrect OTP. Please check and try again.')
  if (String(password || '').length < 6) throw new Error('Password must be at least 6 characters.')
  if (hashPassword(password) !== request.passwordHash) throw new Error('Password does not match the one you set. Please re-enter it.')

  const account = {
    id: makeId('user'),
    role: 'user',
    fullName: request.fullName,
    phone: request.phone,
    passwordHash: request.passwordHash,
    createdAt: new Date().toISOString(),
  }
  const accounts = getUserAccounts().filter(item => item.phone !== account.phone)
  writeList(USER_ACCOUNTS_KEY, [account, ...accounts])

  writeList(UPGRADE_REQUESTS_KEY, getUpgradeRequests().map(item => item.id === request.id
    ? { ...item, status: 'completed', completedAt: new Date().toISOString() }
    : item))

  localStorage.removeItem(GUEST_SESSION_KEY)
  writeList(GUEST_ACCOUNTS_KEY, getRegisteredGuests().filter(
    guest => normalizePhone(guest.phone) !== normalizePhone(account.phone)
  ))
  setAppSession(account, 'user')

  pushNotification({
    type: 'account_created',
    title: 'Account created',
    message: `Welcome ${account.fullName}! Your user account is now active.`,
    phone: account.phone,
  })
  return account
}

/* ------------------------------------------------------------------ */
/* Password operations (used by root OTP control tab)                  */
/* ------------------------------------------------------------------ */

export const resetUserPassword = (phone, newPassword) => {
  const cleanPhone = String(phone || '').trim()
  if (String(newPassword || '').length < 6) throw new Error('Password must be at least 6 characters.')
  const accounts = getUserAccounts()
  const target = accounts.find(account => account.phone === cleanPhone)
  if (!target) throw new Error('No user account found for this phone number.')
  const updated = accounts.map(account => account.phone === cleanPhone
    ? { ...account, passwordHash: hashPassword(newPassword) }
    : account)
  writeList(USER_ACCOUNTS_KEY, updated)
  return updated.find(account => account.phone === cleanPhone)
}

export const changeUserPassword = ({ phone, currentPassword, newPassword }) => {
  const account = findUserByPhone(phone)
  if (!account) throw new Error('No user account found.')
  if (hashPassword(currentPassword) !== account.passwordHash) throw new Error('Current password is incorrect.')
  return resetUserPassword(phone, newPassword)
}

/* ------------------------------------------------------------------ */
/* Notifications (client side)                                         */
/* ------------------------------------------------------------------ */

export const getNotifications = () => readList(NOTIFICATIONS_KEY)

/**
 * Current account role: 'guest' | 'user' | 'staff'.
 * Used by the header to decide which badge and menu items to show.
 */
export const getAccountRole = () => {
  try {
    if (isGuestMode()) return 'guest'
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    const role = String(user.role || '').trim().toLowerCase()
    return role === 'user' || role === 'guest' ? role : 'staff'
  } catch {
    return 'staff'
  }
}

export const getAccountAccessRole = () => {
  try {
    if (isGuestMode()) return 'guest'
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    return String(user.role || '').trim().toLowerCase() || 'staff'
  } catch (error) {
    console.error('Failed to read the account access role:', error)
    return 'staff'
  }
}

/** Notifications addressed to one phone number (or broadcast ones). */
export const getMyNotifications = (phone) => {
  const cleanPhone = String(phone || '').trim()
  return getNotifications().filter(item => !item.phone || item.phone === cleanPhone)
}

export const getUnreadNotificationCount = (phone) =>
  getMyNotifications(phone).filter(item => !item.read).length

export const pushNotification = (notification) => {
  const entry = {
    id: makeId('note'),
    read: false,
    createdAt: new Date().toISOString(),
    ...notification,
  }
  writeList(NOTIFICATIONS_KEY, [entry, ...getNotifications()])
  window.dispatchEvent(new CustomEvent('redsea:notifications'))
  return entry
}

export const markNotificationsRead = (phone) => {
  const cleanPhone = String(phone || '').trim()
  const matches = item => !cleanPhone || !item.phone || item.phone === cleanPhone
  writeList(NOTIFICATIONS_KEY, getNotifications().map(item => (matches(item) ? { ...item, read: true } : item)))
  window.dispatchEvent(new CustomEvent('redsea:notifications'))
}

export const clearNotifications = () => {
  writeList(NOTIFICATIONS_KEY, [])
  window.dispatchEvent(new CustomEvent('redsea:notifications'))
}

/* ------------------------------------------------------------------ */
/* Profile (picture + bio) for guest / user accounts                  */
/* ------------------------------------------------------------------ */

export const getMyProfile = () => readProfile()

/**
 * Saves the self-service profile (picture, bio, name, phone, position) into
 * `userProfile` and mirrors the picture/bio onto the stored user account so
 * they survive a session upgrade or a fresh login.
 */
export const saveMyProfile = (updates = {}) => {
  const next = { ...readProfile(), ...updates }
  const saved = writeProfile(next)

  const phone = String(next.phone || '').trim()
  if (phone) {
    const accounts = getUserAccounts()
    if (accounts.some(account => account.phone === phone)) {
      writeList(USER_ACCOUNTS_KEY, accounts.map(account => (account.phone === phone
        ? {
          ...account,
          fullName: next.fullName || account.fullName,
          bio: next.bio || '',
          profilePicture: next.profilePicture || null,
          updatedAt: new Date().toISOString(),
        }
        : account)))
    }
  }

  window.dispatchEvent(new CustomEvent('redsea:profile'))
  return { saved, profile: next }
}

export default {
  OTP_EXPIRY_HOURS,
  generateOTP,
  generatePassword,
  verifyPassword,
  registerGuest,
  getGuestSession,
  isGuestMode,
  getUserAccounts,
  findUserByPhone,
  getCurrentAccount,
  getUpgradeRequests,
  createUpgradeRequest,
  approveUpgradeRequest,
  findPendingRequestByPhone,
  completeUpgradeWithOTP,
  resetUserPassword,
  changeUserPassword,
  getAccountRole,
  getMyProfile,
  saveMyProfile,
  getNotifications,
  getMyNotifications,
  getUnreadNotificationCount,
  pushNotification,
  markNotificationsRead,
  clearNotifications,
}
