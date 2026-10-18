export const SITE_ACCOUNT_ROLES = [
  { key: 'guest', label: 'Guest' },
  { key: 'user', label: 'User' },
  { key: 'staff', label: 'Staff' },
  { key: 'manager', label: 'Manager' },
  { key: 'agent', label: 'Agent' },
  { key: 'driver', label: 'Driver' },
  { key: 'admin', label: 'Admin' },
  { key: 'root', label: 'Root Admin' },
]

export const SITE_HEADER_MENUS = [
  { id: 'home', label: 'Home', route: '/' },
  { id: 'data-collect', label: 'Data Collector', route: '/data-collect' },
  { id: 'fixed-commission', label: 'Fixed Commission', route: '/fixed-commission' },
  { id: 'brokerage', label: 'Create Partnership', route: '/brokerage' },
  { id: 'broker-house', label: 'Broker & House', route: '/broker-house' },
  { id: 'room-booking', label: 'Room Booking', route: '/room-booking' },
  { id: 'logistics', label: 'Logistics', route: '/logistics' },
  { id: 'movable-commission', label: 'Big Service', route: '/movable-commission' },
  { id: 'utility-payment', label: 'Utility Payment', route: '/utility-payment' },
  { id: 'contact', label: 'Contact', route: '/contact' },
  { id: 'qr-scanner', label: 'QR Scan' },
  { id: 'install-app', label: 'Install REDSEA App' },
  { id: 'feed', label: 'Feed', route: '/feed' },
  { id: 'wallet', label: 'Wallet', route: '/wallet' },
  { id: 'friends', label: 'Friends' },
  { id: 'messages', label: 'Message' },
  { id: 'notifications', label: 'Notification' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'telegram-support', label: 'Telegram Support' },
  { id: 'agent', label: 'Agent Workspace', route: '/agent' },
  { id: 'agent-management', label: 'Agent Management', route: '/agent-management' },
  { id: 'mini-ride', label: 'Mini Ride', route: '/mini-ride' },
  { id: 'driver', label: 'Driver Portal', route: '/driver' },
]

export const DEFAULT_ROLE_HIDDEN_MENUS = {
  guest: ['data-collect'],
  user: ['data-collect'],
  staff: [],
  manager: [],
  agent: [],
  driver: [],
  admin: [],
  root: [],
}

const normalizeMenuKey = value => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === '/' ? '/' : normalized.replace(/^\/+|\/+$/g, '')
}

export const isSiteMenuHidden = (settings, role, menuId, fallbackRoute = menuId) => {
  if (settings?.enabled === false) return false

  const normalizedRole = String(role || '').trim().toLowerCase()
  const rule = Array.isArray(settings?.rules)
    ? settings.rules.find(item => String(item?.role || '').trim().toLowerCase() === normalizedRole)
    : null
  if (rule?.enabled === false) return false

  const menuKey = normalizeMenuKey(menuId)
  const routeKey = normalizeMenuKey(fallbackRoute)
  return [
    ...(Array.isArray(rule?.hiddenMenus) ? rule.hiddenMenus : DEFAULT_ROLE_HIDDEN_MENUS[normalizedRole] || []),
    ...(Array.isArray(rule?.hiddenRoutes) ? rule.hiddenRoutes : []),
  ].some(value => {
    const hiddenKey = normalizeMenuKey(value)
    return hiddenKey === menuKey || hiddenKey === routeKey
  })
}
