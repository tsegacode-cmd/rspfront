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

export const getRegistrationExportRows = (rows, schemaRows = rows) => {
  const fields = new Set(DEFAULT_REGISTRATION_EXPORT_FIELDS)
  for (const record of schemaRows || []) {
    if (record && typeof record === 'object') {
      Object.keys(record).forEach(field => fields.add(field))
    }
  }

  const columns = [...fields]
  return (rows || []).map(record => Object.fromEntries(
    columns.map(field => [field, formatExportValue(record?.[field])])
  ))
}
