export const isPromoCodeExpired = (code, now = Date.now()) => {
  if (!code?.expiresAt) return false
  const expiresAt = Date.parse(code.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

export const filterUnexpiredPromoCodes = (codes, now = Date.now()) =>
  codes.filter(code => !isPromoCodeExpired(code, now))

export const getNextPromoCodeExpiryDelay = (codes, now = Date.now()) => {
  const nextExpiry = codes.reduce((next, code) => {
    if (!code?.expiresAt) return next
    const expiresAt = Date.parse(code.expiresAt)
    return Number.isFinite(expiresAt) && expiresAt > now ? Math.min(next, expiresAt) : next
  }, Infinity)
  return Number.isFinite(nextExpiry) ? nextExpiry - now : null
}
