const DEFAULT_REGISTRATION_EXPORT_FIELDS = [
  '_id',
  'id',
  'receipt_no',
  'registration_id',
  'round',
  'project_title',
  'client_name',
  'national_id',
  'client_type',
  'person',
  'org_type',
  'contact_person',
  'client_phone',
  'client_email',
  'city',
  'address',
  'kebele',
  'house_no',
  'tv_no',
  'staff_id',
  'staff_username',
  'staff_full_name',
  'staff_role',
  'work_type',
  'condition',
  'sign',
  'gov_letter',
  'paid_amount',
  'payment_status',
  'payment_period_type',
  'payment_period_from',
  'payment_period_to',
  'commission_period_amount',
  'commission_fee',
  'commission_total',
  'collected_amount',
  'transaction_number',
  'registration_datetime',
  'registered_at',
  'created_at',
  'updated_at',
]

const EXPORT_FIELD_LABELS = {
  _id: 'Database ID',
  id: 'Record ID',
  receipt_no: 'Registration / Receipt No',
  registration_id: 'Registration ID',
  round: 'Round',
  project_title: 'Project Title',
  client_name: 'Client / Organization Name',
  national_id: 'National ID',
  client_type: 'Client Type',
  person: 'Person Type',
  org_type: 'Organization Type',
  contact_person: 'Contact Person',
  client_phone: 'Phone',
  client_email: 'Email',
  city: 'City',
  address: 'Address',
  kebele: 'Kebele',
  house_no: 'House No',
  tv_no: 'TV No',
  staff_id: 'Staff ID',
  staff_username: 'Staff Username',
  staff_full_name: 'Registered By',
  staff_role: 'Staff Role',
  work_type: 'Work Type',
  condition: 'Condition',
  sign: 'Sign',
  gov_letter: 'Government Letter',
  paid_amount: 'Paid Amount (ETB)',
  payment_status: 'Payment Status',
  payment_period_type: 'Payment Period',
  payment_period_from: 'Payment Period From',
  payment_period_to: 'Payment Period To',
  commission_period_amount: 'Commission Period Amount',
  commission_fee: 'Commission Fee',
  commission_total: 'Commission Total',
  collected_amount: 'Collected Amount',
  transaction_number: 'Transaction Number',
  registration_datetime: 'Registration Date and Time',
  registered_at: 'Registered At',
  created_at: 'Created At',
  updated_at: 'Last Updated At',
  has_registration_image: 'Has Registration Image',
}

export const PERSONAL_REPORT_EXPORT_COLUMNS = [
  ['receipt_no', 'Reg ID'],
  ['round', 'Round'],
  ['project_title', 'Project Title'],
  ['client_name', 'Name'],
  ['national_id', 'National ID'],
  ['city', 'City'],
  ['address', 'Address'],
  ['kebele', 'Kebele'],
  ['house_no', 'House No'],
  ['client_phone', 'Phone'],
  ['registered_by', 'Registered By'],
  ['paid_amount', 'Payment'],
  ['payment_period_type', 'Year'],
  ['payment_status', 'Status'],
  ['registered_at', 'Registered At'],
  ['has_bank_receipt', 'Bank Receipt PDF'],
  ['has_owner_receipt', 'Project Owner Receipt PDF'],
]

export const ORGANIZATION_REPORT_EXPORT_COLUMNS = [
  ['receipt_no', 'Reg ID'],
  ['round', 'Round'],
  ['project_title', 'Project Title'],
  ['client_name', 'Organization Name'],
  ['national_id', 'National ID'],
  ['org_type', 'Type'],
  ['contact_person', 'Contact Person'],
  ['client_phone', 'Phone'],
  ['client_email', 'Email'],
  ['city', 'City'],
  ['address', 'Address'],
  ['kebele', 'Kebele'],
  ['house_no', 'House No'],
  ['registered_by', 'Staff'],
  ['paid_amount', 'Payment'],
  ['payment_period_type', 'Year'],
  ['payment_status', 'Status'],
  ['registered_at', 'Registered At'],
  ['has_bank_receipt', 'Bank Receipt PDF'],
  ['has_owner_receipt', 'Project Owner Receipt PDF'],
]

const isPaid = record =>
  String(record?.payment_status || '').trim().toLowerCase() === 'paid'

const getRegisteredBy = record => {
  const username = String(record?.staff_username || '').trim()
  const fullName = String(record?.staff_full_name || '').trim()
  const identity = fullName && username && fullName.toLowerCase() !== username.toLowerCase()
    ? `${fullName} (@${username})`
    : fullName || username || '—'
  const role = String(record?.staff_role || '').trim()
  return role ? `${identity} · ${role}` : identity
}

const getReportExportValue = (record, field) => {
  if (field === 'round') return `R${record?.round || 1}`
  if (field === 'project_title') {
    return record?.project_title || record?.projectTitle || record?.product_title ||
      record?.productTitle || record?.project_name || '—'
  }
  if (field === 'registered_by') return getRegisteredBy(record)
  if (field === 'paid_amount') return record?.paid_amount == null ? '—' : `ETB ${record.paid_amount}`
  if (field === 'payment_status') return isPaid(record) ? 'Paid' : 'Unpaid'
  if (field === 'registered_at') return record?.registered_at || record?.created_at || '—'
  if (field === 'has_bank_receipt' || field === 'has_owner_receipt') {
    return record?.[field] ? 'Available' : 'Not attached'
  }
  const value = record?.[field]
  return value == null || value === '' ? '—' : formatExportValue(value)
}

const getReportExportRows = (records, columns) =>
  (records || []).map(record => Object.fromEntries(
    columns.map(([field, label]) => [label, getReportExportValue(record, field)])
  ))

export const getPersonalReportExportRows = records =>
  getReportExportRows(records, PERSONAL_REPORT_EXPORT_COLUMNS)

export const getOrganizationReportExportRows = records =>
  getReportExportRows(records, ORGANIZATION_REPORT_EXPORT_COLUMNS)

const formatExportValue = value => {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (error) {
      console.error('Could not serialize a registration export value:', error)
      return String(value)
    }
  }
  return value
}

const formatExportHeader = field => EXPORT_FIELD_LABELS[field] || String(field)
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, character => character.toUpperCase())

export const getRegistrationExportRows = (rows, schemaRows = rows) => {
  const fields = new Set(DEFAULT_REGISTRATION_EXPORT_FIELDS)
  for (const record of schemaRows || []) {
    if (record && typeof record === 'object') {
      Object.keys(record).forEach(field => fields.add(field))
    }
  }

  const columns = [...fields].map(field => [field, formatExportHeader(field)])
  return (rows || []).map(record => Object.fromEntries(
    columns.map(([field, label]) => [label, formatExportValue(record?.[field])])
  ))
}
