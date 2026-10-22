/**
 * Utility payment settings/phone ledger are local; payment requests are stored
 * on the server so customer and Root approvals stay in sync across devices.
 * --------------------------------------------
 * Powers the "Utility Payment" page reachable from the second header bar.
 *
 * Flow:
 *   1. Product cards (titles) are shown from the service catalog.
 *   2. Tapping a card opens its registered phone list (phone -> amount).
 *   3. Choosing a phone opens the "own payment amount", then the payment
 *      method (Telebirr / Ebirr / CBE Birr / Bank) — same providers as the
 *      product booking flow.
 *   4. Submitting stores a payment request and optional PDF/image proof on the server.
 *   5. Root approves payment, then separately approves a generated receipt.
 *   6. Final receipt approval updates linked project registration payment status.
 *
 * Keys are prefixed with "utility_" / "redsea_" so they never clash.
 */

import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { marketplaceAPI, rootAPI, utilityPaymentAPI } from '../services/api.js'

const SETTINGS_KEY = 'utility_payment_settings'
const PHONE_LEDGER_KEY = 'utility_payment_phone_ledger'

// Service catalog storage keys (mirror RootServiceCatalog / ServiceProductSection)
const CATALOG_KEYS = [
  { serviceKey: 'broker-house', label: 'Broker & House' },
  { serviceKey: 'create-partnership', label: 'Create Partnership' },
  { serviceKey: 'room-booking', label: 'Room Booking' },
  { serviceKey: 'logistics', label: 'Logistics' },
  { serviceKey: 'movable-services', label: 'Big Service' },
]

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

const writeList = (key, list) => {
  try {
    localStorage.setItem(key, JSON.stringify(list))
    return true
  } catch (error) {
    console.error(`Could not persist ${key}:`, error)
    return false
  }
}

const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const toNumber = (value) => {
  if (typeof value === 'number') return value
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

/* ------------------------------------------------------------------ */
/* Page settings (popup setting title)                                 */
/* ------------------------------------------------------------------ */

export const getUtilitySettings = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return {
      title: parsed.title || 'Utility Payment',
      subtitle: parsed.subtitle || 'Pay your utility and service amounts quickly and securely.',
    }
  } catch {
    return { title: 'Utility Payment', subtitle: 'Pay your utility and service amounts quickly and securely.' }
  }
}

export const saveUtilitySettings = (settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch (error) {
    console.error('Could not save utility payment settings:', error)
    return false
  }
}


/* ------------------------------------------------------------------ */
/* Product cards (titles) from the service catalog                     */
/* ------------------------------------------------------------------ */

export const getUtilityProductCards = async () => {
  const { data = [] } = await marketplaceAPI.getProducts()
  const categories = new Map(CATALOG_KEYS.map(({ serviceKey, label }) => [serviceKey, label]))
  return data
    .filter(product => categories.has(product.serviceKey) && product.published !== false)
    .map(product => ({
      id: `${product.serviceKey}:${product.id}`,
      serviceKey: product.serviceKey,
      title: product.title || product.name || 'Untitled product',
      category: categories.get(product.serviceKey),
      icon: product.icon || '🧾',
      price: toNumber(product.price),
      paymentOptions: product.paymentOptions || null,
      organizationName: product.organizationName || '',
    }))
}

/* ------------------------------------------------------------------ */
/* Phone ledger: phone number -> amount per product card               */
/* ------------------------------------------------------------------ */

const getLedger = () => readList(PHONE_LEDGER_KEY)

const setLedger = (list) => writeList(PHONE_LEDGER_KEY, list)

/**
 * Returns the registered phone/amount entries for a given product card id.
 * Guest/User accounts registered for utility payment are stored here, and
 * admins can also seed numbers manually.
 */
export const getPhoneEntriesForCard = (cardId) =>
  getLedger().filter(entry => entry.cardId === cardId)

/**
 * Registers a phone number with an amount against a product card.
 * If the phone already exists on the card, the amount is updated.
 */
export const registerPhoneEntry = ({ cardId, phone, amount, ownerName }) => {
  const cleanPhone = String(phone || '').trim()
  if (!/^[0-9+\-\s]{6,20}$/.test(cleanPhone)) throw new Error('Enter a valid phone number.')
  const numericAmount = toNumber(amount)
  if (numericAmount <= 0) throw new Error('Enter an amount greater than zero.')

  const ledger = getLedger()
  const existingIndex = ledger.findIndex(entry => entry.cardId === cardId && entry.phone === cleanPhone)
  const entry = {
    id: existingIndex >= 0 ? ledger[existingIndex].id : makeId('led'),
    cardId,
    phone: cleanPhone,
    amount: numericAmount,
    ownerName: String(ownerName || '').trim(),
    updatedAt: new Date().toISOString(),
  }
  if (existingIndex >= 0) {
    ledger[existingIndex] = entry
    setLedger(ledger)
  } else {
    setLedger([entry, ...ledger])
  }
  return entry
}

/* ------------------------------------------------------------------ */
/* Payment requests: request -> approved -> receipt                    */
/* ------------------------------------------------------------------ */

export const getUtilityRequests = async () => (await rootAPI.getUtilityPayments()).data || []
export const getMyUtilityRequests = async () => (await utilityPaymentAPI.getMine()).data || []

export const getUtilityPaymentProofs = (request) => [
  request?.paymentReceiptPdf,
  request?.paymentReceiptImage,
].filter(file => file?.dataUrl)

const notifyUtilityPaymentsChanged = () => {
  window.dispatchEvent(new CustomEvent('redsea:utility-payments'))
}

/**
 * Creates a utility payment request from a chosen card + phone entry.
 * `status` starts at "request"; root moves it to "approved" then "receipt".
 */
export const createUtilityRequest = async ({
  card,
  phoneEntry,
  paymentMethod,
  paymentAccount = {},
  transactionReference = '',
  paymentReceiptPdf = null,
  paymentReceiptImage = null,
}) => {
  if (!card) throw new Error('A product card is required.')
  if (!phoneEntry) throw new Error('Choose a phone number with an amount.')
  const amount = toNumber(phoneEntry.amount)
  if (amount <= 0) throw new Error('The selected amount must be greater than zero.')
  if (!paymentMethod) throw new Error('Choose a payment method.')

  // Try to read the current signed-in profile for attribution.
  let customer = { name: '', phone: '' }
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}')
    customer = {
      name: user.fullName || user.full_name || user.username || profile.fullName || '',
      phone: user.phone || user.phoneNumber || user.phone_number || profile.phone || '',
    }
  } catch {
    /* ignore */
  }

  const request = {
    card: {
      id: card.id,
      registrationId: card.registrationId || phoneEntry.registrationId || null,
      title: card.title,
      category: card.category,
    },
    phoneEntry: {
      registrationId: phoneEntry.registrationId || card.registrationId || null,
      phone: phoneEntry.phone,
      ownerName: phoneEntry.ownerName || customer.name,
      amount,
    },
    amount,
    paymentMethod,
    paymentAccount,
    transactionReference: String(transactionReference || '').trim(),
    paymentReceiptPdf,
    paymentReceiptImage,
    customerName: customer.name,
    customerPhone: customer.phone || phoneEntry.phone,
  }
  const response = await utilityPaymentAPI.create(request)
  notifyUtilityPaymentsChanged()
  return response.data
}

export const approveUtilityPayment = async requestId => {
  const response = await rootAPI.updateUtilityPayment(requestId, { status: 'approved' })
  notifyUtilityPaymentsChanged()
  return response.data
}

export const cancelUtilityRequest = async requestId => {
  const response = await rootAPI.updateUtilityPayment(requestId, { status: 'cancelled' })
  notifyUtilityPaymentsChanged()
  return response.data
}

/* ------------------------------------------------------------------ */
/* Receipt generation (PDF) + approval                                 */
/* ------------------------------------------------------------------ */

const COMPANY = {
  name: 'Red Sea Property',
  tagline: 'fixed and movable Commission Work & Brokerage Services',
  address: 'Addis Ababa, Ethiopia',
  phone: '0968347171',
}

/**
 * Builds a receipt PDF that combines the manual receipt the admin types with
 * the generated webapp / product-office receipt details. Returns a data URL.
 */
export const buildReceiptPdf = (request) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40

  // Header band
  doc.setFillColor(139, 0, 0)
  doc.rect(0, 0, pageWidth, 90, 'F')
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(margin, 19, 32, 32, 5, 5, 'F')
  doc.setDrawColor(139, 0, 0)
  doc.setLineWidth(2)
  doc.line(margin + 5, 34, margin + 16, 25)
  doc.line(margin + 16, 25, margin + 27, 34)
  doc.rect(margin + 9, 34, 14, 11)
  doc.setFillColor(139, 0, 0)
  doc.rect(margin + 14, 37, 4, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(COMPANY.name, margin + 42, 40)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(COMPANY.tagline, margin + 42, 58)
  doc.text('PAYMENT RECEIPT', pageWidth - margin, 40, { align: 'right' })
  doc.setFontSize(8)
  doc.text('www.redsea.com', pageWidth - margin, 58, { align: 'right' })

  // Receipt meta
  doc.setTextColor(30, 30, 30)
  let y = 120
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Receipt details', margin, y)
  y += 8
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 20

  const manualReceipt = String(request.manualReceipt || '').trim() || '(not provided)'
  const rows = [
    ['Receipt No.', request.receiptNumber || '-'],
    ['Manual Receipt', manualReceipt],
    ['Product / Service', request.cardTitle || '-'],
    ['Category', request.category || '-'],
    ['Payer Name', request.ownerName || request.customerName || '-'],
    ['Phone Number', request.phone || '-'],
    ['Amount', `ETB ${toNumber(request.amount).toLocaleString()}`],
    ['Payment Method', request.paymentMethod || '-'],
    ['Transaction Reference', request.transactionReference || '-'],
    ['Issued On', new Date(request.receiptAt || Date.now()).toLocaleString()],
  ]

  doc.autoTable({
    startY: y,
    head: [['Field', 'Value']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [26, 26, 46], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 170 } },
    margin: { left: margin, right: margin },
  })

  const afterTable = doc.lastAutoTable.finalY + 30
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text(`${COMPANY.name} · ${COMPANY.address} · ${COMPANY.phone}`, margin, afterTable)
  doc.text('This is a computer generated receipt combining the manual and webapp receipt.', margin, afterTable + 14)

  // Signature line
  doc.setDrawColor(120, 120, 120)
  doc.line(pageWidth - margin - 180, afterTable + 50, pageWidth - margin - 78, afterTable + 50)
  doc.text('Authorized Signature', pageWidth - margin - 180, afterTable + 64)
  doc.setDrawColor(139, 0, 0)
  doc.setTextColor(139, 0, 0)
  doc.setLineWidth(1.5)
  doc.circle(pageWidth - margin - 34, afterTable + 48, 27)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('RED SEA', pageWidth - margin - 34, afterTable + 45, { align: 'center' })
  doc.text('VERIFIED', pageWidth - margin - 34, afterTable + 54, { align: 'center' })

  return doc.output('datauristring')
}

/**
 * Approves the receipt for a request that already has an approved payment.
 * Requires a manual receipt number. Generates and stores the PDF receipt and
 * mirrors it onto the client's approved profile section.
 */
export const approveUtilityReceipt = async (requestId, manualReceipt) => {
  const cleanManual = String(manualReceipt || '').trim()
  if (!cleanManual) throw new Error('A manual receipt number is required.')

  const list = await getUtilityRequests()
  const target = list.find(item => item.id === requestId)
  if (!target) throw new Error('Utility payment request not found.')
  if (target.status !== 'approved') throw new Error('Approve the payment before issuing the receipt.')

  const receiptNumber = `RCP-${Date.now().toString().slice(-8)}`
  const withReceipt = {
    ...target,
    receiptNumber,
    manualReceipt: cleanManual,
    receiptAt: new Date().toISOString(),
  }
  withReceipt.receiptPdf = buildReceiptPdf(withReceipt)
  const response = await rootAPI.updateUtilityPayment(requestId, {
    status: 'receipt',
    manualReceipt: cleanManual,
    receiptNumber,
    receiptAt: withReceipt.receiptAt,
    receiptPdf: withReceipt.receiptPdf,
  })
  notifyUtilityPaymentsChanged()
  mirrorReceiptToProfile(withReceipt)
  return response.data
}

/**
 * Stores completed receipts on the signed-in client's profile approved section
 * so they can view/download them from their own account.
 */
export const mirrorReceiptToProfile = (request) => {
  const key = 'redsea_approved_receipts'
  const existing = readList(key)
  const entry = {
    id: request.id,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    receiptNumber: request.receiptNumber,
    manualReceipt: request.manualReceipt,
    cardTitle: request.cardTitle,
    category: request.category,
    phone: request.phone,
    amount: request.amount,
    paymentMethod: request.paymentMethod,
    receiptAt: request.receiptAt,
    receiptPdf: request.receiptPdf,
  }
  writeList(key, [entry, ...existing.filter(item => item.id !== request.id)])
}

export const getApprovedReceipts = async () => (await getUtilityRequests()).filter(item => item.status === 'receipt')

export default {
  getUtilitySettings,
  saveUtilitySettings,
  getUtilityProductCards,
  getPhoneEntriesForCard,
  registerPhoneEntry,
  getUtilityRequests,
  getMyUtilityRequests,
  createUtilityRequest,
  approveUtilityPayment,
  cancelUtilityRequest,
  approveUtilityReceipt,
  buildReceiptPdf,
  mirrorReceiptToProfile,
  getApprovedReceipts,
}
