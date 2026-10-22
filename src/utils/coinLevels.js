export const COIN_LEVELS = [
  { level: 1, name: 'Bronze', icon: '🥉' },
  { level: 2, name: 'Silver', icon: '🥈' },
  { level: 3, name: 'Gold', icon: '🥇' },
  { level: 4, name: 'Platinum', icon: '💠' },
  { level: 5, name: 'Diamond', icon: '💎' },
  { level: 6, name: 'Elite', icon: '🏆' },
  { level: 7, name: 'Master', icon: '👑' },
  { level: 8, name: 'Legend', icon: '🌟' },
]

export const getCoinLevel = level =>
  COIN_LEVELS.find(item => item.level === Number(level)) || null
