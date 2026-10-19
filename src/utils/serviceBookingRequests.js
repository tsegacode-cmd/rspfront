import { serviceBookingAPI } from '../services/api'

export const getServiceBookingRequests = async () => {
  const response = await serviceBookingAPI.getRequests()
  if (!response.success || !Array.isArray(response.data)) {
    throw new Error(response.message || 'Could not load service booking requests.')
  }
  return response.data
}

export const getMyServiceBookingRequests = async () => {
  const response = await serviceBookingAPI.getMyRequests()
  if (!response.success || !Array.isArray(response.data)) {
    throw new Error(response.message || 'Could not load your service booking requests.')
  }
  return response.data
}

export const updateServiceBookingRequest = async (requestId, changes) => {
  const status = changes.paymentStatus === 'approved' || changes.status === 'confirmed'
    ? 'approved'
    : changes.paymentStatus === 'cancelled' || changes.status === 'cancelled'
      ? 'cancelled'
      : ''
  const deliveryStatus = changes.deliveryStatus
  if (!status && !deliveryStatus) throw new Error('Choose a booking payment action or delivery status.')

  const update = {}
  if (status) update.status = status
  if (deliveryStatus) update.deliveryStatus = deliveryStatus
  const response = await serviceBookingAPI.updateRequest(requestId, update)
  if (!response.success) throw new Error(response.message || 'Could not update the payment request.')
  return getServiceBookingRequests()
}

export const saveServiceBookingRequest = async (item, paymentMethod, paymentSelection = {}, customer = {}) => {
  const rawAmount = paymentSelection.amount ?? item.price
  const amount = typeof rawAmount === 'number'
    ? rawAmount
    : Number(String(rawAmount ?? '').replace(/[^\d.]/g, ''))
  const requestId = `booking-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const request = {
    requestId,
    itemId: String(item.id || ''),
    itemName: item.title || item.name || 'Service booking',
    category: item.category || '',
    amount,
    paymentType: paymentSelection.type || 'fullPayment',
    paymentLabel: paymentSelection.label || 'Full payment',
    paymentMethod,
    customerName: customer.name || '',
    customerPhone: customer.phone || '',
    transactionReference: customer.transactionReference || '',
    paymentAccount: customer.paymentAccount || {},
    deliveryRequested: Boolean(customer.deliveryRequested),
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('A valid booking payment amount is required.')
  }
  if (paymentMethod === 'REDSEA Wallet') {
    if (!request.itemId) throw new Error('REDSEA Wallet booking is available for verified catalog items only.')
    const response = await serviceBookingAPI.createWalletRequest({
      requestId,
      itemId: request.itemId,
      paymentType: request.paymentType,
      customerName: request.customerName,
      customerPhone: request.customerPhone,
      deliveryRequested: request.deliveryRequested,
    })
    if (!response.success) throw new Error(response.message || 'Could not complete wallet booking.')
    return response.data
  }
  const response = await serviceBookingAPI.createRequest(request)
  if (!response.success) throw new Error(response.message || 'Could not submit the booking payment request.')
  return response.data
}
