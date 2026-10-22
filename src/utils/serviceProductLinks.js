export const SERVICE_PRODUCT_PATHS = {
  'broker-house': '/broker-house',
  'create-partnership': '/brokerage',
  'room-booking': '/room-booking',
  logistics: '/logistics',
  'movable-services': '/movable-commission',
}

export const getServiceProductUrl = (serviceKey, productId) => {
  const path = SERVICE_PRODUCT_PATHS[serviceKey]
  if (!path || productId === null || productId === undefined || productId === '') return ''

  const url = new URL(path, window.location.origin)
  url.searchParams.set('product', String(productId))
  return url.toString()
}
