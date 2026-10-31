import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { canAccessTab } from '../../utils/permissions'
import { useTranslation } from '../../hooks/useTranslation'
import Pagination, { getPageItems, PAGE_SIZE } from '../../components/Pagination'
import { useSiteContent } from '../../contexts/SiteContentContext'
import { getAccountAccessRole } from '../../utils/guestAccount'
import { useStaffList } from '../../hooks/useStaffList'
import { getRegistrationExportRows } from '../../utils/registrationExport'
import { generateNextReceiptNumber, normalizeRegistrationId } from '../../utils/registrationId'

// Inline page imports — Data Menu modal
import DataRegistration from './DataRegistration'
import RandomPiadRegister from './RandomPiadRegister'
import RandomPayer from './RandomPayer'
import Scanner from './Scanner'
import PayRegistration from './PayRegistration'
import Registered from './Registered'
import NeedApproval from './NeedApproval'
import Result from './Result'
import PaidRandomDataForm from './PaidRandomDataForm'
import PdfAttachmentField from './PdfAttachmentField'

import './DataCollect.css'

/* ─────────────────────────────────────────────────
   EBC TAB CONTENT PANELS
───────────────────────────────────────────────── */
/* ── Kebele options 1-19 + special areas ── */
const KEBELE_OPTIONS = [
  ...Array.from({ length: 19 }, (_, i) => ({ value: String(i + 1), label: `ቀበሌ ${i + 1} / Kebele ${i + 1}` })),
  { value: 'soffi',      label: 'ቀበሌ ሶፊ / Kebele Soffi'          },
  { value: 'eroee',      label: 'ቀበሌ ኤሮዒ / Kebele Eroee'          },
  { value: 'direteyara', label: 'ቀበሌ ድሬተያራ / Kebele Direteyara'  },
  { value: 'custom',     label: '✏️ Other (Custom)...'              },
]

/* ── Payment year ranges ── */
const YEAR_RANGES = [
  { value: '2014-2018', label: '2014 – 2018' },
  { value: '2015-2018', label: '2015 – 2018' },
  { value: '2017-2018', label: '2017 – 2018' },
  { value: '2014-2019', label: '2014 – 2019' },
  { value: '2015-2019', label: '2015 – 2019' },
  { value: '2017-2019', label: '2017 – 2019' },
  { value: '2018-2018', label: '2018 – 2018' },
  { value: 'custom',    label: '✏️ Custom Range...' },
]

/* ── Report sub-tabs for Paid/Unpaid/Total ── */
const REPORT_SUB_TABS = [
  { id: 'paid', label: 'Paid', icon: '✅', color: '#2e7d32' },
  { id: 'unpaid', label: 'Unpaid', icon: '⏳', color: '#e65100' },
  { id: 'total', label: 'Total', icon: '📊', color: '#1565c0' }
]

const readStoredRound = (key, fallbackKey) => {
  try {
    const stored = localStorage.getItem(key) || (fallbackKey ? localStorage.getItem(fallbackKey) : null)
    const round = Number(stored)
    return Number.isInteger(round) && round >= 1 && round <= 20 ? round : 1
  } catch {
    return 1
  }
}

const writeStoredFilter = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch (storageError) {
    console.error(`Could not persist ${key}:`, storageError)
  }
}

const readStoredFilter = (key, fallback = '') => {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

const getRegistrationDate = record => {
  const value = record.registration_datetime || record.registered_at || record.created_at
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const isWithinDateFilter = (record, filter, startDate, endDate) => {
  if (filter === 'all') return true
  const date = getRegistrationDate(record)
  if (!date) return false
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (filter === 'today') return date >= todayStart && date < new Date(todayStart.getTime() + 86400000)
  if (filter === 'week') {
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const nextWeek = new Date(weekStart)
    nextWeek.setDate(nextWeek.getDate() + 7)
    return date >= weekStart && date < nextWeek
  }
  if (filter === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return date >= monthStart && date < nextMonth
  }
  if (filter === 'custom') {
    const start = startDate ? new Date(`${startDate}T00:00:00`) : null
    const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null
    return (!start || date >= start) && (!end || date <= end)
  }
  return true
}

const getCurrentUserProfile = () => {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    return user && typeof user === 'object' && !Array.isArray(user) ? user : {}
  } catch (error) {
    console.error('Could not read the current staff profile:', error)
    return {}
  }
}

const getStaffFilterDefault = () => {
  if (!['staff', 'user'].includes(getAccountAccessRole())) return 'all'
  const user = getCurrentUserProfile()
  return String(user.username || user.full_name || user.fullName || user.id || user._id || user.email || '').trim()
}

const getRegistrationStaffValues = record =>
  [record.staff_id, record.staff_username, record.staff_full_name]
    .map(value => String(value || '').trim().toLocaleLowerCase())
    .filter(value => value && !['n/a', 'ebc-staff', 'ebc staff'].includes(value))

const getRegistrationStaffOptions = records => {
  const options = []
  ;(Array.isArray(records) ? records : []).forEach(record => {
    const aliases = getRegistrationStaffValues(record)
    if (!aliases.length) return

    const existing = options.find(option => aliases.some(alias => option.aliases.includes(alias)))
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...aliases])]
      return
    }

    const username = String(record.staff_username || '').trim()
    const fullName = String(record.staff_full_name || '').trim()
    const id = String(record.staff_id ?? '').trim()
    const role = String(record.staff_role || 'staff').trim()
    const value = username || id || fullName
    if (!value) return
    const identity = fullName && username && fullName.toLocaleLowerCase() !== username.toLocaleLowerCase()
      ? `${fullName} (@${username})`
      : fullName || username || id
    options.push({
      value,
      label: `${identity} · ${role}`,
      aliases,
    })
  })

  return options.sort((left, right) => left.label.localeCompare(right.label))
}

const matchesRegistrationStaffFilter = (record, filter, role, staffOptions) => {
  const recordStaff = getRegistrationStaffValues(record)
  if (['staff', 'user'].includes(role)) {
    const user = getCurrentUserProfile()
    const currentStaff = [user.staff_id, user.username, user.full_name, user.fullName, user.id, user._id, user.email]
      .map(value => String(value || '').trim().toLocaleLowerCase())
      .filter(Boolean)
    return recordStaff.some(value => currentStaff.includes(value))
  }
  if (filter === 'all') return true
  const normalizedFilter = String(filter || '').trim().toLocaleLowerCase()
  const selected = staffOptions.find(option => option.value.toLocaleLowerCase() === normalizedFilter)
  const selectedAliases = selected?.aliases || [normalizedFilter]
  return recordStaff.some(value => selectedAliases.includes(value))
}

const getStaffValue = staff =>
  String(staff?.username || staff?.full_name || staff?.fullName || staff?.id || staff?._id || staff?.email || '').trim()

const getRegistrationStaffLabel = record => {
  const username = String(record?.staff_username || '').trim()
  const fullName = String(record?.staff_full_name || '').trim()
  const identity = fullName && username && fullName.toLocaleLowerCase() !== username.toLocaleLowerCase()
    ? `${fullName} (@${username})`
    : fullName || username || '—'
  const role = String(record?.staff_role || '').trim()
  return role ? `${identity} · ${role}` : identity
}

const useRegisteredStaff = (setForm, registeredStaff, defaultKey = 'ebc_default_staff') => {
  const { staffList: allStaff, loading, error } = useStaffList(true)
  const user = useMemo(getCurrentUserProfile, [])
  const currentRole = getAccountAccessRole()
  const staffOptions = useMemo(() => {
    const options = allStaff.filter(staff =>
      staff && typeof staff === 'object' &&
      ['staff', 'user', 'manager', 'admin', 'root'].includes(String(staff.role || '').trim().toLowerCase())
    )
    if (['staff', 'user'].includes(currentRole) && getStaffValue(user) &&
        !options.some(staff => getStaffValue(staff).toLocaleLowerCase() === getStaffValue(user).toLocaleLowerCase())) {
      options.unshift({ ...user, role: currentRole })
    }
    return options
  }, [allStaff, currentRole, user])

  useEffect(() => {
    let configuredStaff = ''
    try {
      const saved = localStorage.getItem(defaultKey)
      const value = saved ? JSON.parse(saved) : null
      configuredStaff = typeof value === 'string'
        ? value
        : String(value?.username || value?.full_name || value?.fullName || value?.id || '').trim()
    } catch (storageError) {
      console.error(`Could not read ${defaultKey}:`, storageError)
    }
    const desiredStaff = ['staff', 'user'].includes(currentRole) ? getStaffValue(user) : configuredStaff
    const selected = staffOptions.find(staff =>
      [staff.username, staff.full_name, staff.fullName, staff.id, staff._id]
        .some(value => String(value || '').trim().toLocaleLowerCase() === desiredStaff.toLocaleLowerCase())
    ) || (['staff', 'user'].includes(currentRole) ? null : staffOptions[0])
    const selectedValue = getStaffValue(selected) || desiredStaff
    setForm(previous => {
      if (['staff', 'user'].includes(currentRole)) {
        return selectedValue ? { ...previous, registeredStaff: selectedValue } : previous
      }
      return previous.registeredStaff || !selectedValue
        ? previous
        : { ...previous, registeredStaff: selectedValue }
    })
  }, [currentRole, defaultKey, setForm, staffOptions, user])

  const selectedStaff = staffOptions.find(staff =>
    getStaffValue(staff).toLocaleLowerCase() === String(registeredStaff || '').trim().toLocaleLowerCase()
  )
  return { staffOptions, selectedStaff, loading, error }
}

// Project title + logo helpers (shared across registration, filter, report and downloads)
const readProjectTitles = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('ebc_product_titles') || '[]')
    return Array.isArray(parsed)
      ? [...new Set(parsed.map(title => String(title || '').trim()).filter(Boolean))]
      : []
  } catch {
    return []
  }
}

const getRegistrationProjectTitle = (record) =>
  [record.project_title, record.projectTitle, record.product_title, record.productTitle, record.project_name]
    .map(title => String(title || '').trim())
    .find(Boolean) || ''

const normalizeProjectTitle = (title) => String(title || '').trim().toLocaleLowerCase()

const escapeHtml = (value) => String(value ?? '—')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const buildReportFilename = (report, projectTitle, roundFilter, extension) => {
  const safePart = (value) => String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'All_Projects'
  const round = roundFilter === 'all' ? 'All_Rounds' : `Round_${roundFilter}`
  return `EBC_${safePart(report)}_${safePart(projectTitle)}_${safePart(round)}_${Date.now()}.${extension}`
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isRegistrationPaid = (record) =>
  String(record.payment_status || '').trim().toLocaleLowerCase() === 'paid'

const readDefaultProjectTitle = () => {
  const titles = readProjectTitles()
  try {
    const selected = localStorage.getItem('ebc_default_product_title')
    if (selected && titles.includes(selected)) return selected
  } catch (error) {
    console.error('Could not read the default project title:', error)
  }
  return titles.length ? titles[0] : ''
}

const readProjectLogo = () => {
  try {
    return localStorage.getItem('ebc_product_logo') || ''
  } catch {
    return ''
  }
}

// Per-title logo map: { [title]: dataUrl }
const readProjectTitleLogos = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('ebc_product_title_logos') || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeProjectTitleLogo = (title, dataUrl) => {
  const map = readProjectTitleLogos()
  if (dataUrl) map[title] = dataUrl
  else delete map[title]
  try {
    localStorage.setItem('ebc_product_title_logos', JSON.stringify(map))
  } catch { /* ignore */ }
}

// Logo for a specific title, falling back to the global logo
const readProjectLogoForTitle = (title) => {
  if (title) {
    const map = readProjectTitleLogos()
    if (map[title]) return map[title]
  }
  return readProjectLogo()
}

const assertRegistrationRound = (response, expectedRound) => {
  if (!response?.success || !response?.data) {
    throw new Error(response?.message || 'The server did not confirm the registration save.')
  }
  const savedRound = Number(response?.data?.round)
  if (!Number.isInteger(savedRound) || savedRound !== expectedRound) {
    throw new Error(`The server did not confirm Round ${expectedRound}. Please retry and verify the saved record.`)
  }
}

const assertRegistrationPayment = (response, expectedStatus, expectedAmount) => {
  if (!response?.success || !response?.data) {
    throw new Error(response?.message || 'The server did not confirm the payment update.')
  }
  if (String(response.data.payment_status || '').trim().toLowerCase() !== expectedStatus) {
    throw new Error(`The database did not save the expected ${expectedStatus} payment status.`)
  }
  if (expectedAmount !== undefined && Number(response.data.paid_amount) !== expectedAmount) {
    throw new Error('The database did not save the expected payment amount.')
  }
}

function RegistrationNameSuggestions({ records, query, organization, open, onSelect }) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!open || normalizedQuery.length < 2) return null

  const matches = records
    .filter(record => {
      const isOrganization = record.person === 'organization' || record.client_type === 'organization'
      return isOrganization === organization &&
        String(record.client_name || '').toLocaleLowerCase().includes(normalizedQuery)
    })
    .slice(0, 8)

  if (matches.length === 0) return null

  return (
    <div className="ebc-name-suggestions" role="listbox">
      {matches.map((record, index) => (
        <button
          key={record._id || record.id || `${record.client_name}-${index}`}
          type="button"
          className="ebc-name-suggestion"
          role="option"
          onMouseDown={event => event.preventDefault()}
          onClick={() => onSelect(record)}
        >
          <strong>{record.client_name}</strong>
          <span>{[record.client_phone, `Round ${record.round || 1}`].filter(Boolean).join(' · ')}</span>
        </button>
      ))}
    </div>
  )
}

function useSavedProjectTitleSettings(setProductTitles, setForm, setError) {
  useEffect(() => {
    let cancelled = false
    import('../../services/api.js').then(({ dataRegistrationAPI }) =>
      dataRegistrationAPI.getProjectTitleSettings()
    ).then(response => {
      if (cancelled) return
      const settings = response?.data || {}
      const titles = Array.isArray(settings.titles) ? settings.titles : []
      const defaultTitle = titles.includes(settings.defaultTitle) ? settings.defaultTitle : (titles[0] || '')
      setProductTitles(titles)
      setForm(previous => ({
        ...previous,
        projectTitle: titles.length === 0
          ? previous.projectTitle
          : (titles.includes(previous.projectTitle) ? previous.projectTitle : defaultTitle),
      }))
    }).catch(loadError => {
      console.error('Could not load project title settings for registration:', loadError)
      if (!cancelled) setError(`Could not load project titles: ${loadError.message}`)
    })
    return () => { cancelled = true }
  }, [setProductTitles, setForm, setError])
}

function EbcRegistrationTab({ searchResults = [], searchNoResult = false, searchQuery = '', searchError = '' }) {
  const emptyForm = {
    fullName: '',
    nationalId: '',
    kebele: '', kebeleCustom: '',
    city: 'Addis Ababa', address: '',
    houseNo: '', phoneNo: '',
    registeredStaff: '',
    payment: '',
    paymentYear: '', paymentYearCustom: '',
    projectTitle: '',
    bankReceiptPdf: '',
    ownerReceiptPdf: '',
  }

  /* ── Registration ID & Round ── */
  const [regNoAuto,  setRegNoAuto]  = useState(true)          // auto vs manual toggle
  const [regNo,      setRegNo]      = useState(() => generateNextReceiptNumber()) // current reg number
  const [round,      setRound]      = useState(() => readStoredRound('ebc_current_round', 'ebc_default_round'))
  const roundRef = useRef(round)
  const setSelectedRound = value => {
    const nextRound = typeof value === 'function' ? value(roundRef.current) : Number(value)
    roundRef.current = nextRound
    setRound(nextRound)
  }

  const [form,      setForm]      = useState(() => ({ ...emptyForm, projectTitle: readDefaultProjectTitle() }))
  const { staffOptions, selectedStaff } = useRegisteredStaff(setForm, form.registeredStaff)
  const [productTitles, setProductTitles] = useState(() => readProjectTitles())
  const [existingRecords, setExistingRecords] = useState([])
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [editMode,  setEditMode]  = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [recordId,  setRecordId]  = useState(null)
  const [paidDone,  setPaidDone]  = useState(false)

  /* ── Paid panel ── */
  const [paidPanelOpen, setPaidPanelOpen] = useState(false)
  const [paidAmount,    setPaidAmount]    = useState('')

  /* ── Tracks whether form was filled from a search result ── */
  const [filledFromSearch, setFilledFromSearch] = useState(false)

  useSavedProjectTitleSettings(setProductTitles, setForm, setError)

  useEffect(() => {
    let cancelled = false
    const loadRegistrations = async () => {
      try {
        const { dataRegistrationAPI } = await import('../../services/api.js')
        const response = await dataRegistrationAPI.getAllRegistrations()
        if (!cancelled) setExistingRecords(response?.data || response?.registrations || [])
      } catch (loadError) {
        if (!cancelled) setError(`Could not load name suggestions: ${loadError.message}`)
      }
    }
    loadRegistrations()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (regNoAuto && !saved) setRegNo(generateNextReceiptNumber(existingRecords, round))
  }, [existingRecords, round, regNoAuto, saved])

  useEffect(() => {
    writeStoredFilter('ebc_current_round', String(round))
  }, [round])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  /* ── Resolve kebele & year ── */
  const resolvedKebele = form.kebele === 'custom' ? form.kebeleCustom.trim() : form.kebele
  const resolvedYear   = form.paymentYear === 'custom' ? form.paymentYearCustom.trim() : form.paymentYear

  /* ── Duplicate check — receipt number or same phone + kebele + round ── */
  const findDuplicate = () => {
    const normalizedReceiptNumber = normalizeRegistrationId(regNo)
    const receiptDuplicate = normalizedReceiptNumber && existingRecords.find(record =>
      normalizeRegistrationId(record.receipt_no) === normalizedReceiptNumber &&
      Number(record.round || 1) === Number(roundRef.current)
    )
    if (receiptDuplicate) return { type: 'receipt', record: receiptDuplicate }

    if (!form.phoneNo.trim() || !resolvedKebele) return null
    const contactDuplicate = existingRecords.find(r =>
      r.client_phone?.trim() === form.phoneNo.trim() &&
      r.kebele?.trim()       === resolvedKebele &&
      Number(r.round || 1)   === Number(roundRef.current) &&
      r.person !== 'organization' &&
      r.client_type !== 'organization'
    )
    return contactDuplicate ? { type: 'contact', record: contactDuplicate } : null
  }

  /* ── Build DB payload ── */
  const buildPayload = (extra = {}, selectedRound = Number(roundRef.current)) => ({
    client_name:         form.fullName.trim(),
    national_id:         form.nationalId.trim() || null,
    project_title:       form.projectTitle || readDefaultProjectTitle() || null,
    bank_receipt_pdf:    form.bankReceiptPdf || null,
    owner_receipt_pdf:   form.ownerReceiptPdf || null,
    kebele:              resolvedKebele,
    city:                form.city.trim(),
    address:             form.address.trim(),
    house_no:            form.houseNo.trim()           || null,
    client_phone:        form.phoneNo.trim(),
    staff_id:            selectedStaff?.id || selectedStaff?._id || null,
    staff_username:      selectedStaff?.username || form.registeredStaff.trim() || 'EBC-Staff',
    staff_full_name:     selectedStaff?.full_name || selectedStaff?.fullName || form.registeredStaff.trim() || 'EBC Staff',
    staff_role:          selectedStaff?.role || getAccountAccessRole(),
    paid_amount:         form.payment ? parseFloat(form.payment) : null,
    payment_period_type: resolvedYear                  || null,
    receipt_no:          regNo.trim() || null,
    round:               selectedRound,
    work_type:           'EBC',
    condition:           'new',
    person:              'personal',
    sign:                'sign',
    gov_letter:          'accept',
    registered_at:       new Date().toISOString(),
    ...extra,
  })

  /* ── Validate required fields ── */
  const validate = () => {
    if (regNo.trim().length > 50) { setError('Receipt number must be 50 characters or fewer.'); return false }
    if (!form.fullName.trim())  { setError('Please enter the Full Name.'); return false }
    if (!form.phoneNo.trim())   { setError('Please enter the Phone No.'); return false }
    if (!resolvedKebele)        { setError('Please select or enter a Kebele.'); return false }
    if (!form.city.trim())      { setError('Please enter the City.'); return false }
    if (!form.address.trim())   { setError('Please enter the Address.'); return false }
    return true
  }

  /* ── SAVE (unpaid) ── */
  const handleSave = async () => {
    if (!validate()) return
    const selectedRound = Number(roundRef.current)
    setLoading(true); setError(null)
    try {
      const duplicate = findDuplicate()
      if (duplicate) {
        setError(duplicate.type === 'receipt'
          ? `⚠️ Duplicate: Receipt number "${regNo.trim()}" already exists in Round ${selectedRound}.`
          : `⚠️ Duplicate: A Round ${selectedRound} record with Phone "${form.phoneNo.trim()}" and Kebele "${resolvedKebele}" already exists.`)
        setLoading(false); return
      }
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const res = await dataRegistrationAPI.createRegistration(
        buildPayload({ payment_status: 'unpaid' }, selectedRound)
      )
      assertRegistrationRound(res, selectedRound)
      setRecordId(res?.data?.id ?? res?.data?._id ?? null)
      setExistingRecords(prev => [res?.data || buildPayload({ payment_status: 'unpaid' }), ...prev])
      setSaved(true); setEditMode(false); setConfirmed(false)
    } catch (err) {
      setError('Save failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  /* ── PAID SAVE (save + mark paid in one shot) ── */
  const handlePaidSave = async () => {
    if (!validate()) return
    const selectedRound = Number(roundRef.current)
    if (!paidAmount || isNaN(paidAmount) || Number(paidAmount) <= 0) {
      setError('Enter a valid payment amount before clicking Paid.')
      setPaidPanelOpen(true); return
    }
    setLoading(true); setError(null)
    try {
      const duplicate = findDuplicate()
      if (duplicate) {
        setError(duplicate.type === 'receipt'
          ? `⚠️ Duplicate: Receipt number "${regNo.trim()}" already exists in Round ${selectedRound}.`
          : `⚠️ Duplicate: A Round ${selectedRound} record with Phone "${form.phoneNo.trim()}" and Kebele "${resolvedKebele}" already exists.`)
        setLoading(false); return
      }
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const res = await dataRegistrationAPI.createRegistration(
        buildPayload({ payment_status: 'paid', paid_amount: parseFloat(paidAmount) }, selectedRound)
      )
      assertRegistrationRound(res, selectedRound)
      assertRegistrationPayment(res, 'paid', parseFloat(paidAmount))
      setRecordId(res?.data?.id ?? res?.data?._id ?? null)
      setExistingRecords(prev => [res?.data || buildPayload({ payment_status: 'paid', paid_amount: parseFloat(paidAmount) }), ...prev])
      setForm(prev => ({ ...prev, payment: paidAmount }))
      setSaved(true); setConfirmed(true); setPaidDone(true)
      setEditMode(false); setPaidPanelOpen(false)
    } catch (err) {
      setError('Paid Save failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  /* ── UPDATE ── */
  const handleUpdate = async () => {
    if (!validate()) return
    if (!recordId) { setError('No saved record to update.'); return }
    if (confirmed && (!form.payment || !Number.isFinite(Number(form.payment)) || Number(form.payment) <= 0)) {
      setError('Enter a valid payment amount before saving a paid record.')
      return
    }
    const selectedRound = Number(roundRef.current)
    const savedRecord = existingRecords.find(record =>
      String(record._id || record.id) === String(recordId)
    )
    const originalRegisteredAt = savedRecord?.registered_at || savedRecord?.created_at
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const result = await dataRegistrationAPI.updateRegistration(recordId,
        buildPayload({
          payment_status: confirmed ? 'paid' : 'unpaid',
          ...(originalRegisteredAt ? { registered_at: originalRegisteredAt } : {}),
        }, selectedRound)
      )
      assertRegistrationRound(result, selectedRound)
      assertRegistrationPayment(
        result,
        confirmed ? 'paid' : 'unpaid',
        confirmed ? Number(form.payment) : undefined
      )
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...result.data } : record
      ))
      setSaved(true); setEditMode(false)
      setPaidDone(confirmed)
    } catch (err) {
      setError('Update failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  /* ── CONFIRM PAID (on existing saved record) ── */
  const handleConfirmPaid = async () => {
    if (!recordId) { setError('Please save the record first.'); return }
    const amount = Number(form.payment)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount before confirming payment.')
      return
    }
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.updateRegistration(recordId, {
        payment_status: 'paid',
        paid_amount: amount,
      })
      assertRegistrationPayment(response, 'paid', amount)
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...response.data } : record
      ))
      setConfirmed(true); setPaidDone(true); setSaved(true); setEditMode(false)
    } catch (err) {
      setError('Confirm failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  /* ── MARK PAID from panel (existing saved record) ── */
  const handleMarkPaid = async () => {
    if (!recordId) { setError('Save the record first.'); return }
    if (!paidAmount || isNaN(paidAmount) || Number(paidAmount) <= 0) {
      setError('Enter a valid payment amount.'); return
    }
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const amount = parseFloat(paidAmount)
      const response = await dataRegistrationAPI.updateRegistration(recordId, {
        payment_status: 'paid',
        paid_amount: amount,
      })
      assertRegistrationPayment(response, 'paid', amount)
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...response.data } : record
      ))
      setForm(prev => ({ ...prev, payment: paidAmount }))
      setPaidDone(true); setConfirmed(true); setSaved(true); setPaidPanelOpen(false)
    } catch (err) {
      setError('Payment failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const handleEdit = () => { setEditMode(true); setSaved(false); setError(null); setFilledFromSearch(false) }

  /* ── MARK UNPAID (reverse a paid record back to unpaid) ── */
  const handleMarkUnpaid = async () => {
    if (!recordId) { setError('No record loaded.'); return }
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.updateRegistration(recordId, {
        payment_status: 'unpaid',
        paid_amount:    null,
      })
      assertRegistrationPayment(response, 'unpaid')
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...response.data } : record
      ))
      setPaidDone(false)
      setConfirmed(false)
      setForm(prev => ({ ...prev, payment: '' }))
      setSaved(true)
    } catch (err) {
      setError('Mark unpaid failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const handleClear = () => {
    setForm(prev => ({ ...prev, fullName: '', houseNo: '', phoneNo: '' }))
    setError(null)
  }

  const resetAll = () => {
    setForm({ ...emptyForm, projectTitle: readDefaultProjectTitle(),
              registeredStaff:'', payment:'', paymentYear:'', paymentYearCustom:'',
              bankReceiptPdf:'', ownerReceiptPdf:'' })
    setSaved(false); setEditMode(false); setConfirmed(false)
    setRecordId(null); setError(null); setPaidDone(false)
    setPaidPanelOpen(false); setPaidAmount('')
    setFilledFromSearch(false)
    setNameSuggestionsOpen(false)
    handleUseDefaults({ applyRound: false })
    if (regNoAuto) setRegNo(generateNextReceiptNumber(existingRecords, roundRef.current))
  }

  /* Load defaults from localStorage */
  const handleUseDefaults = ({ applyRound = true } = {}) => {
    try {
      const defaultStaff     = localStorage.getItem('ebc_default_staff')
      const defaultPayment   = localStorage.getItem('ebc_default_payment')
      const defaultYearRange = localStorage.getItem('ebc_default_year_range')
      const defaultRound     = localStorage.getItem('ebc_default_round')

      if (defaultStaff) {
        const staff = JSON.parse(defaultStaff)
        const desiredStaff = String(staff.username || staff.full_name || staff.fullName || staff.id || '').trim()
        const matchingStaff = staffOptions.find(option =>
          [option.username, option.full_name, option.fullName, option.id, option._id]
            .some(value => String(value || '').trim() === desiredStaff)
        )
        setForm(prev => ({ ...prev, registeredStaff: getStaffValue(matchingStaff) || desiredStaff }))
      }
      if (defaultPayment) {
        setForm(prev => ({ ...prev, payment: defaultPayment }))
      }
      if (defaultYearRange) {
        const knownRange = YEAR_RANGES.find(y => y.value === defaultYearRange)
        if (knownRange) {
          setForm(prev => ({ ...prev, paymentYear: knownRange.value, paymentYearCustom: '' }))
        } else {
          setForm(prev => ({ ...prev, paymentYear: 'custom', paymentYearCustom: defaultYearRange }))
        }
      }
      if (applyRound && defaultRound) {
        setSelectedRound(parseInt(defaultRound) || 1)
      }

      setError(null)
    } catch (e) {
      setError('Failed to load defaults. Please check Settings tab.')
    }
  }

  useEffect(() => {
    handleUseDefaults()
  }, [])

  /* Click a result row → auto-fill the form */
  const fillFormFromRecord = (r) => {
    const knownKebele = KEBELE_OPTIONS.find(o => o.value === r.kebele || o.label === r.kebele)
    const kebeleVal   = knownKebele ? knownKebele.value : (r.kebele ? 'custom' : '')
    const kebeleCustom= knownKebele ? '' : (r.kebele || '')
    const knownYear   = YEAR_RANGES.find(y => y.value === r.payment_period_type)
    const yearVal     = knownYear ? knownYear.value : (r.payment_period_type ? 'custom' : '')
    const yearCustom  = knownYear ? '' : (r.payment_period_type || '')

    const isPaid = r.payment_status === 'paid'

    setForm({
      fullName:         r.client_name        || '',
      nationalId:       r.national_id        || '',
      projectTitle:     r.project_title      || '',
      bankReceiptPdf:   r.bank_receipt_pdf   || '',
      ownerReceiptPdf:  '',
      city:             r.city               || 'Addis Ababa',
      address:          r.address            || '',
      kebele:           kebeleVal,
      kebeleCustom:     kebeleCustom,
      houseNo:          r.house_no           || '',
      phoneNo:          r.client_phone       || '',
      registeredStaff:  r.staff_username     || '',
      payment:          r.paid_amount        ? String(r.paid_amount) : '',
      paymentYear:      yearVal,
      paymentYearCustom:yearCustom,
    })
    setRegNo(r.receipt_no || '')
    setSelectedRound(Number(r.round) || 1)
    setRegNoAuto(false)
    setRecordId(r._id || r.id || null)
    setSaved(true)
    setEditMode(false)
    setPaidDone(isPaid)
    setConfirmed(isPaid)
    setFilledFromSearch(true)
    setNameSuggestionsOpen(false)
    setError(null)
    setPaidPanelOpen(false)
    setPaidAmount('')
    setTimeout(() => document.querySelector('.ebc-form-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const kebeleDisplay = form.kebele === 'custom'
    ? form.kebeleCustom
    : KEBELE_OPTIONS.find(k => k.value === form.kebele)?.label || ''
  const yearDisplay = form.paymentYear === 'custom'
    ? form.paymentYearCustom
    : YEAR_RANGES.find(y => y.value === form.paymentYear)?.label || ''
  const isReadOnly = saved && !editMode

  return (
    <div className="ebc-tab-content">

      {/* ── Header Banner ── */}
      <div className="ebc-tab-hero ebc-reg-hero">
        <span className="ebc-tab-hero-icon">📝</span>
        <div>
          <h2>Registration</h2>
          <p>የቴሌቪዥን ባለቤቶችን ምዝገባ ቅጽ / TV Owner Registration Form</p>
        </div>
      </div>

      {/* ══ SEARCH RESULTS — displayed below title, full width ══ */}
      {searchResults.length > 0 && (
        <div className="ebc-search-results-full">
          <div className="ebc-search-results-label">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found — click Fill ➜ to load into form below
          </div>
          <div className="ebc-search-table-wrap">
            <table className="ebc-search-table">
              <thead>
                <tr>
                  <th>Fill</th>
                  <th>Reg ID</th>
                  <th>Round</th>
                  <th>Full Name</th>
                  <th>Kebele</th>
                  <th>House No</th>
                  <th>Phone</th>
                  <th>Staff</th>
                  <th>Payment</th>
                  <th>Year</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((r, i) => (
                  <tr key={r._id || r.id || i} className={r.payment_status === 'paid' ? 'ebc-row-paid' : 'ebc-row-unpaid'}>
                    <td>
                      <button
                        className="ebc-btn ebc-fill-btn"
                        onClick={() => fillFormFromRecord(r)}
                        title="Auto-fill form with this record"
                      >
                        ➜ Fill
                      </button>
                    </td>
                    <td><span className="ebc-search-regid">{r.receipt_no || '—'}</span></td>
                    <td><span className="ebc-round-badge">R{r.round || 1}</span></td>
                    <td>{r.client_name || '—'}</td>
                    <td>{r.kebele || '—'}</td>
                    <td>{r.house_no || '—'}</td>
                    <td>{r.client_phone || '—'}</td>
                    <td>{r.staff_username || '—'}</td>
                    <td>{r.paid_amount ? `ETB ${r.paid_amount}` : '—'}</td>
                    <td>{r.payment_period_type || '—'}</td>
                    <td>
                      <span className={`ebc-status-dot ${r.payment_status === 'paid' ? 'paid' : 'unpaid'}`}>
                        {r.payment_status === 'paid' ? '✅ Paid' : '⏳ Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {searchNoResult && (
        <div className="ebc-search-empty-full">📭 No records found for "{searchQuery}"</div>
      )}

      {searchError && (
        <div className="ebc-status-pill error" role="alert">⚠️ Search failed: {searchError}</div>
      )}

      {/* ── Form Body ── */}
      <div className="ebc-form-wrap">

        {/* ── Status Pills ── */}
        {paidDone && (
          <div className="ebc-status-pill confirmed">💵 PAID ✅ — Saved to Database (Reg# {regNo})</div>
        )}
        {saved && !paidDone && (
          <div className="ebc-status-pill saved">
            💾 Saved (Reg# {regNo}{recordId ? ` · DB-ID: ${recordId}` : ''}) — click Edit to change
          </div>
        )}
        {error && <div className="ebc-status-pill error">⚠️ {error}</div>}

        {/* ══ REGISTRATION ID ROW + ROUND SELECTOR ══ */}
        <div className="ebc-regid-row">
          {/* Registration ID */}
          <div className="ebc-regid-badge">
            <span className="ebc-regid-label">Receipt No. (Optional)</span>
            {isReadOnly ? (
              <span className="ebc-regid-value">{regNo}</span>
            ) : (
              <input
                className="ebc-input ebc-regid-input"
                maxLength={50}
                placeholder="Optional receipt number"
                value={regNo}
                onChange={e => { setRegNo(e.target.value); setRegNoAuto(false); setError(null) }}
              />
            )}
          </div>
          <label className="ebc-regid-toggle">
            <input
              type="checkbox"
              checked={regNoAuto}
              disabled={isReadOnly || loading}
              onChange={e => {
                setRegNoAuto(e.target.checked)
                if (e.target.checked) setRegNo(generateNextReceiptNumber(existingRecords, roundRef.current))
              }}
            />
            <span>Auto-generate receipt number</span>
          </label>

          {/* Round Selector */}
          <div className="ebc-round-selector">
            <span className="ebc-round-label">Round:</span>
            <div className="ebc-round-buttons">
              {Array.from({ length: Math.max(5, round) }, (_, i) => i + 1).map(r => (
                <button
                  key={r}
                  type="button"
                  className={`ebc-round-btn ${round === r ? 'active' : ''}`}
                  onClick={() => { setSelectedRound(r); setError(null) }}
                  disabled={isReadOnly}
                >
                  {r}
                </button>
              ))}
              <button
                className="ebc-round-add-btn"
                type="button"
                onClick={() => { if (round < 20) setSelectedRound(prev => prev < 20 ? prev + 1 : prev); setError(null) }}
                disabled={isReadOnly || loading || round >= 20}
                title="Add new round"
              >
                + Add
              </button>
            </div>
            <span className="ebc-round-current">Currently: Round {round}</span>
          </div>{/* end ebc-round-selector */}
        </div>{/* end ebc-regid-row */}

        {/* ══ Project Title (default from Settings) ══ */}
        <div className="ebc-field-group" style={{ marginBottom: 14 }}>
          <label className="ebc-label">Project Title / የፕሮጀክት ርዕስ</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {productTitles.length > 0 ? (
              isReadOnly ? (
                <div className="ebc-readonly-value" style={{ flex: '1 1 220px' }}>{form.projectTitle || '—'}</div>
              ) : (
                <select className="ebc-select" style={{ flex: '1 1 220px' }} value={form.projectTitle} onChange={e => handleChange('projectTitle', e.target.value)}>
                  {form.projectTitle && !productTitles.includes(form.projectTitle) && <option value={form.projectTitle}>{form.projectTitle}</option>}
                  {productTitles.map(title => <option key={title} value={title}>{title}</option>)}
                </select>
              )
            ) : (
              <input className="ebc-input" style={{ flex: '1 1 220px' }} placeholder="No project titles set in Settings — set defaults there"
                value={form.projectTitle} readOnly={isReadOnly} onChange={e => handleChange('projectTitle', e.target.value)} />
            )}
            {form.projectTitle && readProjectLogoForTitle(form.projectTitle) && (
              <img src={readProjectLogoForTitle(form.projectTitle)} alt="Project logo" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid #dee2e6' }} />
            )}
          </div>
        </div>

        {/* ══ ROW 1 — Full Name · Kebele · House No ══ */}
        <div className="ebc-row-4">
          <div className="ebc-field-group">
            <label className="ebc-label">ሙሉ ስም / Full Name</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value ebc-fullname-display">{form.fullName || '—'}</div>
            ) : (
              <>
                <input className="ebc-input" placeholder="Enter full name / ሙሉ ስም ያስገቡ"
                  value={form.fullName}
                  onFocus={() => setNameSuggestionsOpen(true)}
                  onBlur={() => setNameSuggestionsOpen(false)}
                  onChange={e => handleChange('fullName', e.target.value)} />
                <RegistrationNameSuggestions
                  records={existingRecords}
                  query={form.fullName}
                  organization={false}
                  open={nameSuggestionsOpen}
                  onSelect={fillFormFromRecord}
                />
              </>
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">National ID <span className="ebc-label-optional">Optional</span></label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.nationalId || '—'}</div>
            ) : (
              <input className="ebc-input" maxLength={100} placeholder="Enter national ID"
                value={form.nationalId} onChange={e => handleChange('nationalId', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">ቀበሌ / Kebele</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{kebeleDisplay || '—'}</div>
            ) : (
              <>
                <select className="ebc-select" value={form.kebele}
                  onChange={e => handleChange('kebele', e.target.value)}>
                  <option value="">— Select Kebele —</option>
                  {KEBELE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {form.kebele === 'custom' && (
                  <input className="ebc-input ebc-custom-input" placeholder="Enter kebele name..."
                    value={form.kebeleCustom} onChange={e => handleChange('kebeleCustom', e.target.value)} />
                )}
              </>
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">
              የቤት ቁጥር / House No.
              <span className="ebc-label-optional">Optional</span>
            </label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.houseNo || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="e.g. 123/A"
                value={form.houseNo} onChange={e => handleChange('houseNo', e.target.value)} />
            )}
          </div>
        </div>

        {/* ══ ROW 2 — City · Address ══ */}
        <div className="ebc-row-2">
          <div className="ebc-field-group">
            <label className="ebc-label">City / ከተማ <span aria-hidden="true">*</span></label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.city || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="Enter city..." required aria-required="true"
                value={form.city} onChange={e => handleChange('city', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">Address / አድራሻ <span aria-hidden="true">*</span></label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.address || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="Building, Street..." required aria-required="true"
                value={form.address} onChange={e => handleChange('address', e.target.value)} />
            )}
          </div>
        </div>

        {/* ══ ROW 3 — Phone · Staff · Payment · Payment Year ══ */}
        <div className="ebc-row-4">
          <div className="ebc-field-group">
            <label className="ebc-label">ስልክ ቁጥር / Phone No.</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.phoneNo || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="+251 9XX XXX XXX"
                value={form.phoneNo} onChange={e => handleChange('phoneNo', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">ሰራተኛ / Staff</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.registeredStaff || '—'}</div>
            ) : (
              <select className="ebc-select" value={form.registeredStaff}
                disabled={getAccountAccessRole() === 'staff'}
                onChange={e => handleChange('registeredStaff', e.target.value)}>
                <option value="">Select registered staff</option>
                {form.registeredStaff && !staffOptions.some(option => getStaffValue(option) === form.registeredStaff) &&
                  <option value={form.registeredStaff}>{form.registeredStaff}</option>}
                {staffOptions.map(option => (
                  <option key={option.id || option._id || getStaffValue(option)} value={getStaffValue(option)}>
                    {option.username || getStaffValue(option)}{(option.full_name || option.fullName) ? ` — ${option.full_name || option.fullName}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">
              ክፍያ / Payment (ETB)
              <span className="ebc-label-optional">Optional</span>
            </label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.payment ? `ETB ${form.payment}` : '—'}</div>
            ) : (
              <input className="ebc-input" type="number" placeholder="0.00" min="0"
                value={form.payment} onChange={e => handleChange('payment', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">
              የክፍያ ዓመት / Payment Year
              <span className="ebc-label-optional">Optional</span>
            </label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{yearDisplay || '—'}</div>
            ) : (
              <>
                <select className="ebc-select" value={form.paymentYear}
                  onChange={e => handleChange('paymentYear', e.target.value)}>
                  <option value="">— Select Year Range —</option>
                  {YEAR_RANGES.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                </select>
                {form.paymentYear === 'custom' && (
                  <input className="ebc-input ebc-custom-input" placeholder="e.g. 2016-2020"
                    value={form.paymentYearCustom} onChange={e => handleChange('paymentYearCustom', e.target.value)} />
                )}
              </>
            )}
          </div>
        </div>

        <div className="ebc-receipt-attachments">
          <PdfAttachmentField
            label="Bank Receipt"
            value={form.bankReceiptPdf}
            disabled={isReadOnly}
            registrationId={recordId}
            onChange={pdf => handleChange('bankReceiptPdf', pdf)}
          />
          <PdfAttachmentField
            label="Project Owner Receipt"
            value={form.ownerReceiptPdf}
            disabled={isReadOnly}
            registrationId={recordId}
            documentType="owner-receipt"
            onChange={pdf => handleChange('ownerReceiptPdf', pdf)}
          />
        </div>

        {/* ══ PAID PANEL ══ */}
        {paidPanelOpen && (
          <div className="ebc-paid-panel">
            <div className="ebc-paid-panel-header">
              <span className="ebc-paid-panel-icon">💳</span>
              <div>
                <div className="ebc-paid-panel-title">Mark as Paid / ክፍያ ያስምዝግቡ</div>
                <div className="ebc-paid-panel-sub">
                  Customer: <strong>{form.fullName || '—'}</strong>
                  &nbsp;|&nbsp; Reg# <strong>{regNo}</strong>
                </div>
              </div>
            </div>
            <div className="ebc-paid-panel-row">
              <div className="ebc-field-group" style={{ flex: 1 }}>
                <label className="ebc-label">Payment Amount (ETB) / ክፍያ መጠን</label>
                <input className="ebc-input ebc-paid-amount-input" type="number" min="0"
                  placeholder="Enter amount..." value={paidAmount} autoFocus
                  onChange={e => setPaidAmount(e.target.value)} />
              </div>
              <div className="ebc-paid-panel-actions">
                {recordId ? (
                  <button className="ebc-btn paid-confirm" onClick={handleMarkPaid} disabled={loading}>
                    {loading ? '⏳ Processing...' : '✅ Confirm Payment'}
                  </button>
                ) : (
                  <button className="ebc-btn paid-confirm" onClick={handlePaidSave} disabled={loading}>
                    {loading ? '⏳ Saving & Paying...' : '💵 Save & Mark Paid'}
                  </button>
                )}
                <button className="ebc-btn clear"
                  onClick={() => { setPaidPanelOpen(false); setError(null) }} disabled={loading}>
                  ✕ Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ ACTION BUTTONS ══ */}
        <div className="ebc-form-actions">

          {/* ─── USE DEFAULTS ─── */}
          <button className="ebc-btn defaults" onClick={handleUseDefaults} title="Auto-fill Staff, Payment & Year from Settings">
            ⚡ Use Defaults
          </button>

          {/* ─── STATE A: Fresh new record (not from search) ─── */}
          {!saved && !editMode && !filledFromSearch && (
            <button className="ebc-btn save" onClick={handleSave} disabled={loading}>
              {loading ? '⏳ Saving...' : '💾 Save / አስቀምጥ'}
            </button>
          )}

          {/* ─── STATE B: Filled from search — UNPAID record ─── */}
          {filledFromSearch && saved && !paidDone && !editMode && (
            <>
              {/* Save shows as Update */}
              <button className="ebc-btn save" onClick={handleUpdate} disabled={loading}>
                {loading ? '⏳ Updating...' : '💾 Update / አዘምን'}
              </button>

              {/* Paid only */}
              {!paidPanelOpen && (
                <button className="ebc-btn paid"
                  onClick={() => { setPaidAmount(form.payment || ''); setPaidPanelOpen(true); setError(null) }}>
                  💵 Paid / ተከፍሏል
                </button>
              )}
            </>
          )}

          {/* ─── STATE C: Filled from search — PAID record ─── */}
          {filledFromSearch && paidDone && !editMode && (
            <>
              <span className="ebc-paid-badge">💵 PAID ✅</span>

              {/* New Unpaid — reverses payment */}
              <button className="ebc-btn unpaid" onClick={handleMarkUnpaid} disabled={loading}>
                {loading ? '⏳...' : '🔄 New Unpaid / ያልተከፈለ'}
              </button>

              {/* Edit to reopen fields */}
              <button className="ebc-btn edit" onClick={handleEdit} disabled={loading}>
                ✏️ Edit Record / አስተካክል
              </button>
            </>
          )}

          {/* ─── EDIT MODE (from any state) ─── */}
          {editMode && (
            <>
              <button className="ebc-btn save" onClick={handleUpdate} disabled={loading}>
                {loading ? '⏳ Updating...' : '💾 Update / አዘምን'}
              </button>
              <button className="ebc-btn confirm-paid" onClick={handleConfirmPaid} disabled={loading}>
                {loading ? '⏳...' : '✅ Confirm Paid / ክፍያ አረጋግጥ'}
              </button>
            </>
          )}

          {/* ─── FRESH SAVE done (not from search) — unpaid ─── */}
          {saved && !filledFromSearch && !editMode && !paidDone && (
            <>
              <button className="ebc-btn edit" onClick={handleEdit} disabled={loading}>
                ✏️ Edit / አስተካክል
              </button>
              <button className="ebc-btn confirm-paid" onClick={handleConfirmPaid} disabled={loading}>
                {loading ? '⏳...' : '✅ Confirm Paid / ክፍያ አረጋግጥ'}
              </button>
            </>
          )}

          {/* ─── FRESH SAVE done (not from search) — paid badge ─── */}
          {!filledFromSearch && paidDone && !editMode && (
            <>
              <span className="ebc-paid-badge">💵 PAID ✅</span>
              <button className="ebc-btn edit" onClick={handleEdit} disabled={loading}>
                ✏️ Edit Record
              </button>
            </>
          )}

          {/* ─── PAID button for fresh unsaved form ─── */}
          {!saved && !editMode && !paidDone && !paidPanelOpen && !loading && (
            <button className="ebc-btn paid"
              onClick={() => { setPaidAmount(form.payment || ''); setPaidPanelOpen(true); setError(null) }}>
              💵 Paid / ተከፍሏል
            </button>
          )}

          {/* ─── CLEAR (always, no loading) ─── */}
          {!loading && (
            <button className="ebc-btn clear" onClick={handleClear}
              title="Clears Full Name, House No and Phone No only">
              🗑️ Clear / አጽዳ
            </button>
          )}

          {/* ─── NEW ENTRY ─── */}
          {(saved || paidDone) && !editMode && (
            <button className="ebc-btn new-entry" onClick={resetAll} disabled={loading}>
              ➕ New Entry / አዲስ
            </button>
          )}

        </div>

      </div>{/* end ebc-form-wrap */}
    </div>
  )
}


/* Inline edit row component */
function ReportEditRow({ record, onSave, onCancel, colSpan = 16 }) {
  const [val, setVal] = useState({
    client_name: record.client_name || '',
    national_id: record.national_id || '',
    city: record.city || '',
    address: record.address || '',
    kebele: record.kebele || '',
    house_no: record.house_no || '',
    client_phone: record.client_phone || '',
    staff_username: record.staff_username || '',
    paid_amount: record.paid_amount != null ? String(record.paid_amount) : '',
    payment_period_type: record.payment_period_type || '',
    payment_status: record.payment_status || 'unpaid',
  })
  const f = (k) => (e) => setVal(p => ({ ...p, [k]: e.target.value }))
  return (
    <tr className="rpt-edit-row">
      <td colSpan={colSpan}>
        <div className="rpt-edit-grid">
          <div className="rpt-edit-field"><label>Name</label><input value={val.client_name} onChange={f('client_name')} /></div>
          <div className="rpt-edit-field"><label>National ID</label><input value={val.national_id} onChange={f('national_id')} /></div>
          <div className="rpt-edit-field"><label>City</label><input value={val.city} onChange={f('city')} /></div>
          <div className="rpt-edit-field"><label>Address</label><input value={val.address} onChange={f('address')} /></div>
          <div className="rpt-edit-field"><label>Kebele</label><input value={val.kebele} onChange={f('kebele')} /></div>
          <div className="rpt-edit-field"><label>House No</label><input value={val.house_no} onChange={f('house_no')} /></div>
          <div className="rpt-edit-field"><label>Phone</label><input value={val.client_phone} onChange={f('client_phone')} /></div>
          <div className="rpt-edit-field"><label>Staff</label><input value={val.staff_username} onChange={f('staff_username')} /></div>
          <div className="rpt-edit-field"><label>Amount (ETB)</label><input type="number" value={val.paid_amount} onChange={f('paid_amount')} /></div>
          <div className="rpt-edit-field"><label>Year</label><input value={val.payment_period_type} onChange={f('payment_period_type')} /></div>
          <div className="rpt-edit-field">
            <label>Status</label>
            <select value={val.payment_status} onChange={f('payment_status')}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
        <div className="rpt-edit-actions">
          <button className="ebc-btn save"    onClick={() => onSave(val)}>💾 Update</button>
          <button className="ebc-btn confirm-paid" onClick={() => onSave({ ...val, payment_status: 'paid' })}>✅ Mark Paid</button>
          <button className="ebc-btn unpaid"  onClick={() => onSave({ ...val, payment_status: 'unpaid' })}>🔄 Mark Unpaid</button>
          <button className="ebc-btn clear"   onClick={onCancel}>✕ Cancel</button>
        </div>
      </td>
    </tr>
  )
}

function EbcReportTab() {
  const siteContent = useSiteContent()
  const currentRole = getAccountAccessRole().trim().toLowerCase()
  const currentRoleRule = siteContent.accountAccessSettings?.rules?.find(
    rule => String(rule.role || '').trim().toLowerCase() === currentRole
  )
  const canDeleteRegistrations = typeof currentRoleRule?.actions?.deleteRegistrations === 'boolean'
    ? currentRoleRule.actions.deleteRegistrations
    : ['admin', 'root'].includes(currentRole)
  const [subTab,      setSubTab]      = useState(() => readStoredFilter('ebc_report_subtab', 'total'))
  const [records,     setRecords]     = useState([])
  const [projectTitles, setProjectTitles] = useState(readProjectTitles)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [query,       setQuery]       = useState(() => readStoredFilter('ebc_report_query'))
  const [sortKey,     setSortKey]     = useState('client_name')
  const [sortAsc,     setSortAsc]     = useState(true)
  const [editId,      setEditId]      = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [deletingId,  setDeletingId]  = useState(null)
  const [roundFilter, setRoundFilter] = useState(() => readStoredFilter('ebc_report_round_filter', 'all'))
  const [projectFilter, setProjectFilter] = useState(() => readStoredFilter('ebc_report_project_filter', 'all'))
  const [staffFilter, setStaffFilter] = useState(() => readStoredFilter('ebc_report_staff_filter', getStaffFilterDefault()))
  const [dateFilter, setDateFilter] = useState(() => readStoredFilter('ebc_report_date_filter', 'all'))
  const [startDate, setStartDate] = useState(() => readStoredFilter('ebc_report_start_date'))
  const [endDate, setEndDate] = useState(() => readStoredFilter('ebc_report_end_date'))
  const [reportPage, setReportPage] = useState(0)

  useEffect(() => {
    const options = getRegistrationStaffOptions(records)
    if (['staff', 'user'].includes(currentRole)) {
      const user = getCurrentUserProfile()
      const currentAliases = [user.staff_id, user.username, user.full_name, user.fullName, user.id, user._id, user.email]
        .map(value => String(value || '').trim().toLocaleLowerCase())
        .filter(Boolean)
      const ownOption = options.find(option => option.aliases.some(alias => currentAliases.includes(alias)))
      const nextFilter = ownOption?.value || getStaffFilterDefault()
      setStaffFilter(previous => previous === nextFilter ? previous : nextFilter)
      return
    }

    setStaffFilter(previous => {
      if (previous === 'all') return previous
      return options.some(option =>
        option.value.toLocaleLowerCase() === previous.toLocaleLowerCase() ||
        option.aliases.includes(previous.toLocaleLowerCase())
      ) ? previous : 'all'
    })
  }, [currentRole, records])

  useEffect(() => {
    writeStoredFilter('ebc_report_subtab', subTab)
  }, [subTab])

  useEffect(() => {
    writeStoredFilter('ebc_report_query', query)
  }, [query])

  useEffect(() => {
    writeStoredFilter('ebc_report_round_filter', roundFilter)
  }, [roundFilter])

  useEffect(() => {
    writeStoredFilter('ebc_report_project_filter', projectFilter)
  }, [projectFilter])

  useEffect(() => {
    writeStoredFilter('ebc_report_staff_filter', staffFilter)
  }, [staffFilter])

  useEffect(() => {
    writeStoredFilter('ebc_report_date_filter', dateFilter)
  }, [dateFilter])

  useEffect(() => {
    writeStoredFilter('ebc_report_start_date', startDate)
  }, [startDate])

  useEffect(() => {
    writeStoredFilter('ebc_report_end_date', endDate)
  }, [endDate])

  useEffect(() => {
    setReportPage(0)
  }, [subTab, query, roundFilter, projectFilter, staffFilter, dateFilter, startDate, endDate])

  /* Load saved registrations from the database whenever the report is opened or refreshed. */
  const [reloadToken, setReloadToken] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const { dataRegistrationAPI } = await import('../../services/api.js')
        const res  = await dataRegistrationAPI.getAllRegistrations()
        const registrations = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.registrations)
            ? res.registrations
            : null
        if (!registrations) throw new Error('The server returned registrations in an unexpected format.')
        if (!cancelled) setRecords(registrations.filter(record =>
          record.person !== 'organization' && record.client_type !== 'organization'
        ))
      } catch (e) { if (!cancelled) setError(e.message) }
      finally     { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [reloadToken])

  useEffect(() => {
    let cancelled = false
    import('../../services/api.js')
      .then(({ dataRegistrationAPI }) => dataRegistrationAPI.getProjectTitleSettings())
      .then(response => {
        if (cancelled) return
        const savedTitles = response?.data?.titles
        if (Array.isArray(savedTitles)) {
          setProjectTitles([...new Set(savedTitles.map(title => String(title || '').trim()).filter(Boolean))])
        }
      })
      .catch(loadError => {
        console.error('Could not load saved project titles for the report filter:', loadError)
        if (!cancelled) setError(previous => previous || `Could not load saved project titles: ${loadError.message}`)
      })
    return () => { cancelled = true }
  }, [])

  /* Apply the shared filters before splitting the report into status tabs. */
  let base = records
  const staffOptions = getRegistrationStaffOptions(records)
  if (roundFilter !== 'all') {
    base = base.filter(r => String(parseInt(r.round) || 1) === String(roundFilter))
  }
  if (projectFilter !== 'all') {
    const selectedTitle = normalizeProjectTitle(projectFilter)
    base = base.filter(r => normalizeProjectTitle(getRegistrationProjectTitle(r)) === selectedTitle)
  }
  if (staffFilter !== 'all') {
    base = base.filter(record => matchesRegistrationStaffFilter(record, staffFilter, currentRole, staffOptions))
  }
  base = base.filter(record => isWithinDateFilter(record, dateFilter, startDate, endDate))
  const q = query.trim().toLowerCase()
  if (q) {
    base = base.filter(r =>
      [r.client_name, r.national_id, r.client_phone, r.kebele, r.receipt_no,
       r.staff_username, r.staff_full_name, r.staff_role, r.house_no, r.payment_period_type,
       r.payment_status, r.paid_amount != null ? String(r.paid_amount) : '',
       getRegistrationProjectTitle(r), r.round ? `R${r.round}` : '']
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    )
  }
  const projectFilteredRecords = base
  const filtered = subTab === 'total'
    ? base
    : base.filter(r => isRegistrationPaid(r) === (subTab === 'paid'))

  /* sort */
  const sorted = [...filtered].sort((a, b) => {
    const va = String(a[sortKey] ?? '').toLowerCase()
    const vb = String(b[sortKey] ?? '').toLowerCase()
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })
  const safeReportPage = Math.min(reportPage, Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1))

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(p => !p)
    else { setSortKey(key); setSortAsc(true) }
  }
  const sortIcon = (key) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  /* totals — based on the currently filtered/sorted view so the summary
     section always matches what the user sees after filtering */
  const totalPaid   = projectFilteredRecords.filter(isRegistrationPaid).length
  const totalUnpaid = projectFilteredRecords.filter(r => !isRegistrationPaid(r)).length
  const totalAmount = projectFilteredRecords
    .filter(isRegistrationPaid)
    .reduce((s, r) => s + (parseFloat(String(r.paid_amount ?? '').replace(/,/g, '')) || 0), 0)
  const projectOptions = [...new Map(
    [...projectTitles, ...records.map(getRegistrationProjectTitle), ...(projectFilter === 'all' ? [] : [projectFilter])]
      .map(title => [normalizeProjectTitle(title), String(title || '').trim()])
      .filter(([key, title]) => key && title)
  ).values()].sort((left, right) => left.localeCompare(right))
  const selectedProjectTitle = projectFilter === 'all'
    ? 'All Projects'
    : projectOptions.find(title => normalizeProjectTitle(title) === normalizeProjectTitle(projectFilter)) || projectFilter
  const visibleStaffOptions = ['staff', 'user'].includes(currentRole)
    ? staffOptions.filter(option => {
      const user = getCurrentUserProfile()
      const currentAliases = [user.staff_id, user.username, user.full_name, user.fullName, user.id, user._id, user.email]
        .map(value => String(value || '').trim().toLocaleLowerCase())
        .filter(Boolean)
      return option.aliases.some(alias => currentAliases.includes(alias))
    })
    : staffOptions

  /* inline update */
  const handleUpdate = async (id, data) => {
    setSaving(true)
    try {
      const paymentStatus = String(data.payment_status || 'unpaid').trim().toLowerCase()
      const paidAmount = data.paid_amount === '' || data.paid_amount == null
        ? null
        : Number(data.paid_amount)
      if (paidAmount != null && (!Number.isFinite(paidAmount) || paidAmount < 0)) {
        throw new Error('Enter a valid non-negative payment amount.')
      }
      if (paymentStatus === 'paid' && (!Number.isFinite(paidAmount) || paidAmount <= 0)) {
        throw new Error('Enter a payment amount greater than zero before marking this registration paid.')
      }
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.updateRegistration(id, {
        client_name: data.client_name,
        national_id: data.national_id || null,
        city: data.city || null,
        address: data.address || null,
        kebele: data.kebele,
        house_no: data.house_no || null,
        client_phone: data.client_phone,
        staff_username: data.staff_username || null,
        paid_amount: paidAmount,
        payment_period_type: data.payment_period_type || null,
        payment_status: paymentStatus,
      })
      assertRegistrationPayment(response, paymentStatus, paymentStatus === 'paid' ? paidAmount : undefined)
      setRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(id)
          ? { ...record, ...response.data }
          : record
      ))
      setEditId(null)
      setError(null)
    } catch (e) {
      console.error('Could not update registration from the report:', e)
      setError(`Update failed: ${e.message}`)
    }
    finally { setSaving(false) }
  }

  const handleDeleteRegistration = async record => {
    const id = record._id || record.id
    if (!id) {
      setError('Cannot delete this registration because it has no database ID.')
      return
    }
    const receiptNumber = record.receipt_no || id
    if (!window.confirm(`Delete registration ${receiptNumber} (Round ${record.round || 1}) for ${record.client_name || 'this client'}? This permanently removes it from Neon.`)) {
      return
    }

    setDeletingId(id)
    setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.deleteRegistration(id)
      if (!response?.success) throw new Error(response?.message || 'The server did not confirm the deletion.')
      setRecords(previous => previous.filter(item => String(item._id || item.id) !== String(id)))
      setEditId(current => String(current) === String(id) ? null : current)
    } catch (deleteError) {
      console.error('Could not delete registration from the report:', deleteError)
      setError(`Could not delete registration: ${deleteError.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  /* PDF download using jsPDF + autoTable */
  const downloadPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf')
      await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'landscape' })
      const title = subTab === 'total' ? 'All Records'
                  : subTab === 'paid'  ? 'Paid Records' : 'Unpaid Records'
      const projectTitle = selectedProjectTitle
      const logo = readProjectLogoForTitle(projectFilter === 'all' ? '' : projectTitle)

      if (logo) {
        try {
          const format = logo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
          doc.addImage(logo, format, 14, 8, 18, 18)
        } catch (logoError) {
          console.error('Could not add the project logo to the report:', logoError)
        }
      }
      doc.setFontSize(14)
      doc.setTextColor(196, 30, 58)
      doc.text('EBC Registration Report', 36, 18)
      doc.setTextColor(0, 0, 0)
      doc.text(`— ${title}`, 14, 26)
      doc.setFontSize(10)
      doc.text(`Project: ${projectTitle} · Round: ${roundFilter === 'all' ? 'All rounds' : `Round ${roundFilter}`}`, 14, 33)
      doc.setFontSize(9)
      doc.setTextColor(90, 90, 90)
      doc.text(`Generated: ${new Date().toLocaleString()}   Total: ${sorted.length}`, 14, 40)
      doc.setTextColor(0, 0, 0)
      const reportRows = getRegistrationExportRows(sorted, records)
      const headers = Object.keys(reportRows[0] || getRegistrationExportRows([{}])[0])
      doc.autoTable({
        startY: 45,
        head: [headers],
        body: reportRows.map(row => headers.map(header => row[header])),
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: headers.slice(0, 3),
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [196, 30, 58], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      })
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.setFontSize(10)
        doc.setTextColor(196, 30, 58)
        doc.text('BEST REGARDS', 14, pageHeight - 20)
        doc.setFontSize(8)
        doc.setTextColor(120, 120, 120)
        doc.text('REDSEA — fixed and movable Commission Work & Brokerage Services', 14, pageHeight - 13)
      }
      doc.setTextColor(0, 0, 0)
      doc.save(buildReportFilename(title, projectTitle, roundFilter, 'pdf'))
    } catch (exportError) {
      console.error('Could not export the registration report as PDF:', exportError)
      setError(`Could not export the registration report as PDF: ${exportError.message}`)
    }
  }

  /* Excel download using XLSX */
  const downloadExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const title = subTab === 'total' ? 'All Records'
                  : subTab === 'paid'  ? 'Paid Records' : 'Unpaid Records'
      const reportRows = getRegistrationExportRows(sorted, records)
      const headers = Object.keys(reportRows[0] || getRegistrationExportRows([{}])[0])
      const worksheet = XLSX.utils.json_to_sheet(reportRows, { header: headers })
      worksheet['!cols'] = headers.map(header => ({
        wch: Math.min(32, Math.max(14, header.length + 2)),
      }))
      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: reportRows.length, c: headers.length - 1 },
        }),
      }
      const workbook = XLSX.utils.book_new()
      workbook.Props = {
        Title: 'EBC Registration Report',
        Subject: `${title} - ${selectedProjectTitle}`,
        CreatedDate: new Date(),
      }
      XLSX.utils.book_append_sheet(workbook, worksheet, 'EBC Report')
      XLSX.writeFile(workbook, buildReportFilename(title, selectedProjectTitle, roundFilter, 'xlsx'))
    } catch (exportError) {
      console.error('Could not export the registration report as Excel:', exportError)
      setError(`Could not export the registration report as Excel: ${exportError.message}`)
    }
  }

  /* Word download using docx */
  const downloadWord = async () => {
    const title = subTab === 'total' ? 'All Records'
                : subTab === 'paid'  ? 'Paid Records' : 'Unpaid Records'
    const projectTitle = selectedProjectTitle
    const logo = readProjectLogoForTitle(projectFilter === 'all' ? '' : projectTitle)
    const reportRows = getRegistrationExportRows(sorted, records)
    const headers = Object.keys(reportRows[0] || getRegistrationExportRows([{}])[0])

    try {
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>EBC Registration Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #c41e3a; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #c41e3a; color: white; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .meta { color: #666; font-size: 0.9em; margin-bottom: 10px; }
          .logo { height: 60px; }
          .regards { margin-top: 24px; color: #c41e3a; font-weight: bold; }
          .regards-sub { color: #888; font-size: 0.85em; }
        </style>
      </head>
      <body>
        ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="Logo" />` : ''}
        <h1>EBC Registration Report — ${escapeHtml(title)}</h1>
        <p class="meta"><strong>Project Title:</strong> ${escapeHtml(projectTitle)} · <strong>Round:</strong> ${escapeHtml(roundFilter === 'all' ? 'All rounds' : `Round ${roundFilter}`)}</p>
        <p class="meta">Generated: ${new Date().toLocaleString()} | Total Records: ${sorted.length}</p>
        <table>
          <thead>
            <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${reportRows.map(row => `
              <tr>
                ${headers.map(header => `<td>${escapeHtml(row[header])}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="regards">BEST REGARDS</p>
        <p class="regards-sub">REDSEA — fixed and movable Commission Work &amp; Brokerage Services</p>
      </body>
      </html>
    `
      downloadBlob(new Blob([htmlContent], { type: 'application/msword' }), buildReportFilename(title, projectTitle, roundFilter, 'doc'))
    } catch (exportError) {
      console.error('Could not export the registration report as Word:', exportError)
      setError(`Could not export the registration report as Word: ${exportError.message}`)
    }
  }

  const subColor = REPORT_SUB_TABS.find(t => t.id === subTab)?.color || '#1565c0'

  return (
    <div className="ebc-tab-content rpt-root">

      {/* Header */}
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#154360,#2980b9)' }}>
        <span className="ebc-tab-hero-icon">📊</span>
        <div>
          <h2>Report</h2>
          <p>Paid · Unpaid · Total registration records with search, edit and PDF export.</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="rpt-summary-row">
        <div className="rpt-summary-card green">
          <span className="rpt-summary-icon">✅</span>
          <div><div className="rpt-summary-num">{totalPaid}</div><div className="rpt-summary-lbl">Paid</div></div>
        </div>
        <div className="rpt-summary-card orange">
          <span className="rpt-summary-icon">⏳</span>
          <div><div className="rpt-summary-num">{totalUnpaid}</div><div className="rpt-summary-lbl">Unpaid</div></div>
        </div>
        <div className="rpt-summary-card blue">
          <span className="rpt-summary-icon">📊</span>
          <div><div className="rpt-summary-num">{projectFilteredRecords.length}</div><div className="rpt-summary-lbl">Total</div></div>
        </div>
        <div className="rpt-summary-card gold">
          <span className="rpt-summary-icon">💰</span>
          <div><div className="rpt-summary-num">ETB {totalAmount.toLocaleString()}</div><div className="rpt-summary-lbl">Collected</div></div>
        </div>
      </div>
      <div className="rpt-filter-summary" role="status">
        Filtered report: {selectedProjectTitle} · {roundFilter === 'all' ? 'All rounds' : `Round ${roundFilter}`} ·
        {' '}{sorted.length} {subTab} records shown of {projectFilteredRecords.length} matching registrations ·
        {' '}Collected ETB {totalAmount.toLocaleString()}
      </div>

      {/* Sub-tabs */}
      <div className="rpt-subtab-bar">
        {REPORT_SUB_TABS.map(t => (
          <button
            key={t.id}
            className={`rpt-subtab-btn ${subTab === t.id ? 'active' : ''}`}
            style={{ '--st-color': t.color }}
            onClick={() => { setSubTab(t.id); setQuery(''); setEditId(null) }}
          >
            <span>{t.icon}</span> {t.label} Tab
            <span className="rpt-subtab-count">
              {t.id === 'paid'   ? totalPaid :
               t.id === 'unpaid' ? totalUnpaid : projectFilteredRecords.length}
            </span>
          </button>
        ))}
      </div>

      {/* Search bar + Round filter + Project filter + PDF */}
      <div className="rpt-toolbar">
        {/* Round filter */}
        <div className="rpt-round-filter">
          <label>Round:</label>
          <select 
            className="ebc-select rpt-round-select" 
            value={roundFilter} 
            onChange={e => setRoundFilter(e.target.value)}
          >
            <option value="all">All Rounds</option>
            {[...new Set(records.map(r => parseInt(r.round) || 1))].filter(n => !isNaN(n)).sort((a, b) => a - b).map(r => (
              <option key={r} value={String(r)}>Round {r}</option>
            ))}
          </select>
        </div>

        {/* Project title filter */}
        <div className="rpt-round-filter">
          <label>Project:</label>
          <select
            className="ebc-select rpt-round-select"
            value={selectedProjectTitle === 'All Projects' && projectFilter === 'all' ? 'all' : selectedProjectTitle}
            onChange={e => setProjectFilter(e.target.value)}
          >
            <option value="all">All Projects</option>
            {projectOptions.map(title => (
              <option key={title} value={title}>{title}</option>
            ))}
          </select>
        </div>

        <div className="rpt-round-filter">
          <label htmlFor="individual-report-staff-filter">Staff / User:</label>
          <select id="individual-report-staff-filter" className="ebc-select rpt-round-select" value={staffFilter} onChange={event => setStaffFilter(event.target.value)}>
            {!['staff', 'user'].includes(currentRole) && <option value="all">All Staff &amp; Users</option>}
            {visibleStaffOptions.map(staff => <option key={staff.value} value={staff.value}>{staff.label}</option>)}
          </select>
        </div>
        <div className="rpt-round-filter">
          <label>Date:</label>
          <select className="ebc-select rpt-round-select" value={dateFilter} onChange={event => setDateFilter(event.target.value)}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Period</option>
          </select>
        </div>
        {dateFilter === 'custom' && (
          <>
            <label className="rpt-date-filter">From <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
            <label className="rpt-date-filter">To <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
          </>
        )}

        <input
          className="ebc-input rpt-search"
          placeholder="Search by Name / Phone / Kebele / Reg ID / Staff / Amount / Year / Round..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {/* Sort shortcuts */}
        <div className="rpt-sort-row">
          {[['receipt_no','ID'],['client_name','A–Z'],['staff_username','Staff'],['paid_amount','Amount']].map(([k,lbl]) => (
            <button key={k} className={`rpt-sort-btn ${sortKey===k?'active':''}`} onClick={() => toggleSort(k)}>
              {lbl}{sortIcon(k)}
            </button>
          ))}
        </div>
        <div className="rpt-export-btns">
          <button
            className="ebc-btn rpt-excel-btn"
            onClick={() => setReloadToken(token => token + 1)}
            disabled={loading}
            aria-label="Refresh report from database"
          >
            🔄 Refresh
          </button>
          <button className="ebc-btn rpt-pdf-btn" onClick={downloadPDF}>
            📄 PDF
          </button>
          <button className="ebc-btn rpt-word-btn" onClick={downloadWord}>
            📝 Word
          </button>
          <button className="ebc-btn rpt-excel-btn" onClick={downloadExcel}>
            📊 Excel
          </button>
        </div>
      </div>

      {/* Status */}
      {loading && <div className="rpt-loading">⏳ Loading records...</div>}
      {error   && <div className="ebc-status-pill error">⚠️ {error}</div>}
      {saving  && <div className="rpt-loading">⏳ Saving...</div>}

      {/* Table */}
      {!loading && (
        <div className="rpt-table-wrap">
          {sorted.length === 0 ? (
            <div className="ebc-search-empty" style={{ padding: '30px', textAlign:'center' }}>
              📭 No {subTab} records{q ? ` matching "${q}"` : ''}.
            </div>
          ) : (
            <table className="rpt-table">
              <thead>
                <tr style={{ '--th-accent': subColor }}>
                  <th onClick={() => toggleSort('receipt_no')}>Reg ID{sortIcon('receipt_no')}</th>
                  <th onClick={() => toggleSort('round')}>Round{sortIcon('round')}</th>
                  <th onClick={() => toggleSort('project_title')}>Project Title{sortIcon('project_title')}</th>
                  <th onClick={() => toggleSort('client_name')}>Name{sortIcon('client_name')}</th>
                  <th>National ID</th>
                  <th>City</th>
                  <th>Address</th>
                  <th onClick={() => toggleSort('kebele')}>Kebele{sortIcon('kebele')}</th>
                  <th>House No</th>
                  <th onClick={() => toggleSort('client_phone')}>Phone{sortIcon('client_phone')}</th>
                  <th onClick={() => toggleSort('staff_full_name')}>Registered By{sortIcon('staff_full_name')}</th>
                  <th onClick={() => toggleSort('paid_amount')}>Payment{sortIcon('paid_amount')}</th>
                  <th>Year</th>
                  <th onClick={() => toggleSort('payment_status')}>Status{sortIcon('payment_status')}</th>
                  <th>Registered At</th>
                  {canDeleteRegistrations && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {getPageItems(sorted, safeReportPage).map((r, index) => {
                  const rid = r._id || r.id
                  const isPaid = isRegistrationPaid(r)
                  return (
                    <>
                      <tr
                        key={rid}
                        className={`rpt-row ${index % 2 ? 'rpt-stripe-white' : 'rpt-stripe-silver'} ${isPaid ? 'rpt-paid' : 'rpt-unpaid'} ${editId === rid ? 'rpt-editing' : ''}`}
                        onClick={() => setEditId(editId === rid ? null : rid)}
                        title="Click to expand edit"
                      >
                        <td><span className="ebc-search-regid">{r.receipt_no || '—'}</span></td>
                        <td><span className="ebc-round-badge">R{r.round || 1}</span></td>
                        <td className="rpt-project">{getRegistrationProjectTitle(r) || '—'}</td>
                        <td className="rpt-name">{r.client_name || '—'}</td>
                        <td>{r.national_id || '—'}</td>
                        <td>{r.city || '—'}</td>
                        <td>{r.address || '—'}</td>
                        <td>{r.kebele || '—'}</td>
                        <td>{r.house_no || '—'}</td>
                        <td>{r.client_phone || '—'}</td>
                        <td>{getRegistrationStaffLabel(r)}</td>
                        <td>{r.paid_amount != null ? `ETB ${r.paid_amount}` : '—'}</td>
                        <td>{r.payment_period_type || '—'}</td>
                        <td>
                          <span className={`ebc-status-dot ${isPaid ? 'paid' : 'unpaid'}`}>
                            {isPaid ? '✅ Paid' : '⏳ Unpaid'}
                          </span>
                        </td>
                        <td>{r.registered_at || r.created_at || '—'}</td>
                        {canDeleteRegistrations && (
                          <td>
                            <button
                              type="button"
                              className="ebc-btn"
                              style={{ background: '#b42318', color: '#fff', padding: '6px 10px' }}
                              onClick={event => {
                                event.stopPropagation()
                                handleDeleteRegistration(r)
                              }}
                              disabled={deletingId === rid}
                              aria-label={`Delete registration ${r.receipt_no || rid}`}
                            >
                              {deletingId === rid ? 'Deleting…' : '🗑 Delete'}
                            </button>
                          </td>
                        )}
                      </tr>
                      {editId === rid && (
                        <ReportEditRow
                          key={`edit-${rid}`}
                          record={r}
                          colSpan={15 + (canDeleteRegistrations ? 1 : 0)}
                          onSave={(data) => handleUpdate(rid, data)}
                          onCancel={() => setEditId(null)}
                        />
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
          <Pagination page={safeReportPage} itemCount={sorted.length} onPageChange={setReportPage} label="registration reports" />
          <div className="rpt-footer">
            Showing {sorted.length ? safeReportPage * PAGE_SIZE + 1 : 0}–{Math.min((safeReportPage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} filtered records
            {q && ` · filtered by "${q}"`}
          </div>
        </div>
      )}
    </div>
  )
}

function EbcStaffTab() {
  const [staffList, setStaffList] = useState([])
  const [staffForm, setStaffForm] = useState({ fullName: '', idNo: '', phoneNo: '' })
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [defaultCategory, setDefaultCategory] = useState('both') // 'individual', 'organization', 'both'

  // Load staff from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ebc_staff_list')
    if (saved) {
      try {
        setStaffList(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load staff list:', e)
      }
    }
    
    // Load default category
    const savedCategory = localStorage.getItem('ebc_staff_default_category')
    if (savedCategory) {
      setDefaultCategory(savedCategory)
    }
  }, [])

  // Save staff to localStorage whenever it changes
  const saveStaffToStorage = (list) => {
    localStorage.setItem('ebc_staff_list', JSON.stringify(list))
  }

  const handleAddStaff = () => {
    if (!staffForm.fullName.trim() || !staffForm.idNo.trim()) {
      setError('Full Name and ID No are required')
      return
    }

    const newStaff = {
      id: Date.now(),
      fullName: staffForm.fullName.trim(),
      idNo: staffForm.idNo.trim(),
      phoneNo: staffForm.phoneNo.trim(),
      isDefault: staffList.length === 0, // First staff is default
    }

    const updated = [...staffList, newStaff]
    setStaffList(updated)
    saveStaffToStorage(updated)
    
    // If first staff, set as default
    if (staffList.length === 0) {
      handleSetDefault(newStaff.id, updated)
    }
    
    setStaffForm({ fullName: '', idNo: '', phoneNo: '' })
    setSuccess('✅ Staff added successfully!')
    setError(null)
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleSetDefault = (id, listToUse = staffList) => {
    const updated = listToUse.map(s => ({ ...s, isDefault: s.id === id }))
    setStaffList(updated)
    saveStaffToStorage(updated)
    
    const defaultStaff = updated.find(s => s.id === id)
    
    // Save based on category
    if (defaultCategory === 'both' || defaultCategory === 'individual') {
      localStorage.setItem('ebc_default_staff', JSON.stringify(defaultStaff))
    }
    if (defaultCategory === 'both' || defaultCategory === 'organization') {
      localStorage.setItem('ebc_org_default_staff', JSON.stringify(defaultStaff))
    }
    
    setSuccess(`✅ Default staff updated for ${defaultCategory === 'both' ? 'both forms' : defaultCategory === 'individual' ? 'Individual Registration' : 'Organization'}!`)
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleCategoryChange = (newCategory) => {
    setDefaultCategory(newCategory)
    localStorage.setItem('ebc_staff_default_category', newCategory)
    
    // Reapply current default to new category
    const currentDefault = staffList.find(s => s.isDefault)
    if (currentDefault) {
      handleSetDefault(currentDefault.id)
    }
  }

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to delete this staff member?')) return
    const updated = staffList.filter(s => s.id !== id)
    setStaffList(updated)
    saveStaffToStorage(updated)
    
    // Clear from localStorage if it was default
    const deletedStaff = staffList.find(s => s.id === id)
    if (deletedStaff?.isDefault) {
      localStorage.removeItem('ebc_default_staff')
      localStorage.removeItem('ebc_org_default_staff')
    }
    
    setSuccess('✅ Staff deleted')
    setTimeout(() => setSuccess(null), 3000)
  }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#4a235a,#8e44ad)' }}>
        <span className="ebc-tab-hero-icon">👥</span>
        <div>
          <h2>Staff Management</h2>
          <p>Register staff members and set default for auto-fill</p>
        </div>
      </div>

      <div className="staff-content">
        {/* Registration Form */}
        <div className="staff-form-card">
          <h3>📝 Register New Staff</h3>
          {error && <div className="ebc-status-pill error">⚠️ {error}</div>}
          {success && <div className="ebc-status-pill confirmed">{success}</div>}
          
          <div className="staff-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Full Name / ሙሉ ስም</label>
              <input
                className="ebc-input"
                placeholder="Enter staff full name..."
                value={staffForm.fullName}
                onChange={e => setStaffForm(prev => ({ ...prev, fullName: e.target.value }))}
              />
            </div>

            <div className="ebc-field-group">
              <label className="ebc-label">ID No / መታወቂያ ቁጥር</label>
              <input
                className="ebc-input"
                placeholder="Enter ID number..."
                value={staffForm.idNo}
                onChange={e => setStaffForm(prev => ({ ...prev, idNo: e.target.value }))}
              />
            </div>

            <div className="ebc-field-group">
              <label className="ebc-label">Phone No / ስልክ ቁጥር <span className="ebc-label-optional">Optional</span></label>
              <input
                className="ebc-input"
                placeholder="+251 9XX XXX XXX"
                value={staffForm.phoneNo}
                onChange={e => setStaffForm(prev => ({ ...prev, phoneNo: e.target.value }))}
              />
            </div>
          </div>

          <button className="ebc-btn save" onClick={handleAddStaff}>
            ➕ Add Staff
          </button>
        </div>

        {/* Staff List */}
        <div className="staff-list-card">
          <h3>📋 Registered Staff ({staffList.length})</h3>
          
          {staffList.length === 0 ? (
            <div className="ebc-search-empty">👥 No staff registered yet. Add your first staff member above.</div>
          ) : (
            <div className="staff-selector-wrap">
              {/* Category Chooser */}
              <div className="staff-category-card">
                <h4>🎯 Apply Default To:</h4>
                <div className="staff-category-options">
                  <label className={`staff-category-option ${defaultCategory === 'both' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="defaultCategory"
                      value="both"
                      checked={defaultCategory === 'both'}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                    />
                    <span className="category-icon">👥</span>
                    <span className="category-label">Both Forms</span>
                    <span className="category-desc">Individual & Organization</span>
                  </label>
                  
                  <label className={`staff-category-option ${defaultCategory === 'individual' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="defaultCategory"
                      value="individual"
                      checked={defaultCategory === 'individual'}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                    />
                    <span className="category-icon">👤</span>
                    <span className="category-label">Individual Only</span>
                    <span className="category-desc">Registration Form</span>
                  </label>
                  
                  <label className={`staff-category-option ${defaultCategory === 'organization' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="defaultCategory"
                      value="organization"
                      checked={defaultCategory === 'organization'}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                    />
                    <span className="category-icon">🏢</span>
                    <span className="category-label">Organization Only</span>
                    <span className="category-desc">Organization Form</span>
                  </label>
                </div>
              </div>

              <div className="ebc-field-group">
                <label className="ebc-label">Select Staff to Set as Default</label>
                <select 
                  className="ebc-select"
                  value={staffList.find(s => s.isDefault)?.id || ''}
                  onChange={(e) => handleSetDefault(parseInt(e.target.value))}
                >
                  {staffList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.fullName} - {staff.idNo} {staff.phoneNo ? `- ${staff.phoneNo}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="staff-default-preview">
                {staffList.find(s => s.isDefault) && (
                  <>
                    <div className="staff-default-label">
                      <span className="staff-badge-default">⭐ CURRENT DEFAULT</span>
                      <span className="staff-category-badge">
                        {defaultCategory === 'both' ? '👥 Both Forms' : 
                         defaultCategory === 'individual' ? '👤 Individual' : '🏢 Organization'}
                      </span>
                    </div>
                    <div className="staff-default-info">
                      <div className="staff-default-name">{staffList.find(s => s.isDefault)?.fullName}</div>
                      <div className="staff-default-details">
                        <span>🆔 {staffList.find(s => s.isDefault)?.idNo}</span>
                        {staffList.find(s => s.isDefault)?.phoneNo && (
                          <span>📞 {staffList.find(s => s.isDefault)?.phoneNo}</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="staff-list-all">
                <h4>All Registered Staff</h4>
                {staffList.map(staff => (
                  <div key={staff.id} className={`staff-item-mini ${staff.isDefault ? 'is-default' : ''}`}>
                    <div className="staff-item-mini-info">
                      <span className="staff-mini-name">
                        {staff.fullName}
                        {staff.isDefault && <span className="staff-mini-badge">⭐</span>}
                      </span>
                      <span className="staff-mini-details">{staff.idNo}</span>
                    </div>
                    <button
                      className="staff-btn-delete-mini"
                      onClick={() => handleDelete(staff.id)}
                      title="Delete staff"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EbcOrganizationTab() {
  const [subTab, setSubTab] = useState(() => readStoredFilter('ebc_org_subtab') === 'report' ? 'report' : 'registration')
  const [editRecord, setEditRecord] = useState(null)

  useEffect(() => {
    writeStoredFilter('ebc_org_subtab', subTab)
  }, [subTab])

  const handleEditFromReport = (record) => {
    setEditRecord(record)
    setSubTab('registration')
  }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#0b4f6c,#01baef)' }}>
        <span className="ebc-tab-hero-icon">🏛️</span>
        <div>
          <h2>Organization</h2>
          <p>Register and manage organizational clients</p>
        </div>
      </div>

      {/* Horizontal Sub-tabs */}
      <div className="org-subtab-bar">
        <button
          className={`org-subtab-btn ${subTab === 'registration' ? 'active' : ''}`}
          onClick={() => setSubTab('registration')}
        >
          📝 Registration
        </button>
        <button
          className={`org-subtab-btn ${subTab === 'report' ? 'active' : ''}`}
          onClick={() => setSubTab('report')}
        >
          📊 Report
        </button>
      </div>

      {/* Sub-tab Content */}
      {subTab === 'registration' ? (
        <OrgRegistrationContent editRecord={editRecord} onClearEdit={() => setEditRecord(null)} />
      ) : (
        <OrgReportContent onEdit={handleEditFromReport} />
      )}
    </div>
  )
}

/* Organization Registration Form */
function OrgRegistrationContent({ editRecord, onClearEdit }) {
  const emptyForm = {
    orgName: '', orgType: '', orgTypeCustom: '',
    nationalId: '',
    contactPerson: '', contactPhone: '', contactEmail: '',
    city: 'Addis Ababa', address: '', kebele: '', kebeleCustom: '',
    registeredStaff: '', payment: '', paymentYear: '', paymentYearCustom: '',
    projectTitle: '',
    bankReceiptPdf: '',
    ownerReceiptPdf: '',
  }

  const [regNoAuto, setRegNoAuto] = useState(true)
  const [regNo, setRegNo] = useState(() => generateNextReceiptNumber())
  const [round, setRound] = useState(() => readStoredRound('ebc_org_current_round', 'ebc_org_default_round'))
  const roundRef = useRef(round)
  const setSelectedRound = value => {
    const nextRound = typeof value === 'function' ? value(roundRef.current) : Number(value)
    roundRef.current = nextRound
    setRound(nextRound)
  }
  const [form, setForm] = useState(() => ({ ...emptyForm, projectTitle: readDefaultProjectTitle() }))
  const { staffOptions, selectedStaff } = useRegisteredStaff(setForm, form.registeredStaff, 'ebc_org_default_staff')
  const [productTitles, setProductTitles] = useState(() => readProjectTitles())
  const [existingRecords, setExistingRecords] = useState([])
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recordId, setRecordId] = useState(null)
  const [paidDone, setPaidDone] = useState(false)
  const [paidPanelOpen, setPaidPanelOpen] = useState(false)
  const [paidAmount, setPaidAmount] = useState('')

  const findReceiptDuplicate = () => {
    const receiptNumber = normalizeRegistrationId(regNo)
    if (!receiptNumber) return null
    return existingRecords.find(record =>
      normalizeRegistrationId(record.receipt_no) === receiptNumber &&
      Number(record.round || 1) === Number(roundRef.current)
    )
  }

  useSavedProjectTitleSettings(setProductTitles, setForm, setError)

  useEffect(() => {
    let cancelled = false
    const loadRegistrations = async () => {
      try {
        const { dataRegistrationAPI } = await import('../../services/api.js')
        const response = await dataRegistrationAPI.getAllRegistrations()
        const registrations = response?.data || response?.registrations || []
        if (!cancelled) {
          setExistingRecords(registrations)
        }
      } catch (loadError) {
        if (!cancelled) setError(`Could not load organization name suggestions: ${loadError.message}`)
      }
    }
    loadRegistrations()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (regNoAuto && !saved) setRegNo(generateNextReceiptNumber(existingRecords, round))
  }, [existingRecords, round, regNoAuto, saved])

  useEffect(() => {
    writeStoredFilter('ebc_org_current_round', String(round))
  }, [round])

  // Load edit record when passed from Report tab
  useEffect(() => {
    if (editRecord) {
      setRegNo(editRecord.receipt_no || '')
      setRegNoAuto(false)
      setSelectedRound(Number(editRecord.round) || 1)
      setForm({
        orgName: editRecord.client_name || '',
        nationalId: editRecord.national_id || '',
        orgType: editRecord.org_type || '',
        orgTypeCustom: '',
        contactPerson: editRecord.contact_person || '',
        contactPhone: editRecord.client_phone || '',
        contactEmail: editRecord.client_email || '',
        city: editRecord.city || 'Addis Ababa',
        address: editRecord.address || '',
        kebele: editRecord.kebele || '',
        kebeleCustom: '',
        registeredStaff: editRecord.staff_username || '',
        payment: editRecord.paid_amount || '',
        paymentYear: editRecord.payment_period_type || '',
        paymentYearCustom: '',
        projectTitle: editRecord.project_title || '',
        bankReceiptPdf: editRecord.bank_receipt_pdf || '',
        ownerReceiptPdf: '',
      })
      setRecordId(editRecord._id || editRecord.id)
      setEditMode(true)
      setSaved(true)
      setConfirmed(editRecord.payment_status === 'paid')
      setPaidDone(editRecord.payment_status === 'paid')
      if (onClearEdit) onClearEdit()
    }
  }, [editRecord, onClearEdit])

  const ORG_TYPES = [
    { value: 'company', label: 'Company / ኩባንያ' },
    { value: 'ngo', label: 'NGO / መንግሥታዊ ያልሆነ ድርጅት' },
    { value: 'government', label: 'Government / መንግሥት' },
    { value: 'school', label: 'School / ትምህርት ቤት' },
    { value: 'hospital', label: 'Hospital / ሆስፒታል' },
    { value: 'hotel', label: 'Hotel / ሆቴል' },
    { value: 'restaurant', label: 'Restaurant / ምግብ ቤት' },
    { value: 'custom', label: '✏️ Other (Custom)...' },
  ]

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const fillFormFromRecord = record => {
    const knownType = ORG_TYPES.find(type => type.value === record.org_type)
    const knownKebele = KEBELE_OPTIONS.find(option => option.value === record.kebele || option.label === record.kebele)
    const knownYear = YEAR_RANGES.find(year => year.value === record.payment_period_type)
    const isPaid = record.payment_status === 'paid'

    setRegNo(record.receipt_no || '')
    setSelectedRound(Number(record.round) || 1)
    setRegNoAuto(false)
    setForm({
      orgName: record.client_name || '',
      nationalId: record.national_id || '',
      orgType: knownType ? knownType.value : (record.org_type ? 'custom' : ''),
      orgTypeCustom: knownType ? '' : (record.org_type || ''),
      contactPerson: record.contact_person || '',
      contactPhone: record.client_phone || '',
      contactEmail: record.client_email || '',
      city: record.city || 'Addis Ababa',
      address: record.address || '',
      kebele: knownKebele ? knownKebele.value : (record.kebele ? 'custom' : ''),
      kebeleCustom: knownKebele ? '' : (record.kebele || ''),
      registeredStaff: record.staff_username || '',
      payment: record.paid_amount != null ? String(record.paid_amount) : '',
      paymentYear: knownYear ? knownYear.value : (record.payment_period_type ? 'custom' : ''),
      paymentYearCustom: knownYear ? '' : (record.payment_period_type || ''),
      projectTitle: record.project_title || '',
      bankReceiptPdf: record.bank_receipt_pdf || '',
      ownerReceiptPdf: '',
    })
    setRecordId(record._id || record.id || null)
    setSaved(true)
    setEditMode(true)
    setConfirmed(isPaid)
    setPaidDone(isPaid)
    setNameSuggestionsOpen(false)
    setError(null)
  }

  const resolvedOrgType = form.orgType === 'custom' ? form.orgTypeCustom.trim() : form.orgType
  const resolvedKebele = form.kebele === 'custom' ? form.kebeleCustom.trim() : form.kebele
  const resolvedYear = form.paymentYear === 'custom' ? form.paymentYearCustom.trim() : form.paymentYear

  const buildPayload = (extra = {}, selectedRound = Number(roundRef.current)) => ({
    client_name: form.orgName.trim(),
    national_id: form.nationalId.trim() || null,
    client_type: 'organization',
    project_title: form.projectTitle || readDefaultProjectTitle() || null,
    bank_receipt_pdf: form.bankReceiptPdf || null,
    owner_receipt_pdf:   form.ownerReceiptPdf || null,
    org_type: resolvedOrgType,
    contact_person: form.contactPerson.trim(),
    client_phone: form.contactPhone.trim(),
    client_email: form.contactEmail.trim() || null,
    city: form.city.trim(),
    address: form.address.trim() || null,
    kebele: resolvedKebele,
    staff_id: selectedStaff?.id || selectedStaff?._id || null,
    staff_username: selectedStaff?.username || form.registeredStaff.trim() || 'EBC-Staff',
    staff_full_name: selectedStaff?.full_name || selectedStaff?.fullName || form.registeredStaff.trim() || 'EBC Staff',
    staff_role: selectedStaff?.role || getAccountAccessRole(),
    paid_amount: form.payment ? parseFloat(form.payment) : null,
    payment_period_type: resolvedYear || null,
    receipt_no: regNo.trim() || null,
    round: selectedRound,
    work_type: 'EBC',
    condition: 'new',
    person: 'organization',
    sign: 'sign',
    gov_letter: 'accept',
    registered_at: new Date().toISOString(),
    ...extra,
  })

  const validate = () => {
    if (regNo.trim().length > 50) { setError('Receipt number must be 50 characters or fewer.'); return false }
    if (!form.orgName.trim()) { setError('Please enter the Organization Name.'); return false }
    if (!resolvedOrgType) { setError('Please select Organization Type.'); return false }
    if (!form.contactPhone.trim()) { setError('Please enter Contact Phone.'); return false }
    if (!resolvedKebele) { setError('Please select or enter Kebele.'); return false }
    if (!form.city.trim()) { setError('Please enter the City.'); return false }
    if (!form.address.trim()) { setError('Please enter the Address.'); return false }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    const selectedRound = Number(roundRef.current)
    setLoading(true); setError(null)
    try {
      if (findReceiptDuplicate()) {
        setError(`⚠️ Duplicate: Receipt number "${regNo.trim()}" already exists in Round ${selectedRound}.`)
        setLoading(false); return
      }
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const res = await dataRegistrationAPI.createRegistration(
        buildPayload({ payment_status: 'unpaid' }, selectedRound)
      )
      assertRegistrationRound(res, selectedRound)
      setRecordId(res?.data?.id ?? res?.data?._id ?? null)
      setExistingRecords(previous => [res.data, ...previous])
      setSaved(true); setEditMode(false); setConfirmed(false)
    } catch (err) {
      setError('Save failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const handlePaidSave = async () => {
    if (!validate()) return
    const selectedRound = Number(roundRef.current)
    if (!paidAmount || isNaN(paidAmount) || Number(paidAmount) <= 0) {
      setError('Enter a valid payment amount.')
      setPaidPanelOpen(true); return
    }
    setLoading(true); setError(null)
    try {
      if (findReceiptDuplicate()) {
        setError(`⚠️ Duplicate: Receipt number "${regNo.trim()}" already exists in Round ${selectedRound}.`)
        setLoading(false); return
      }
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const res = await dataRegistrationAPI.createRegistration(
        buildPayload({ payment_status: 'paid', paid_amount: parseFloat(paidAmount) }, selectedRound)
      )
      assertRegistrationRound(res, selectedRound)
      assertRegistrationPayment(res, 'paid', parseFloat(paidAmount))
      setRecordId(res?.data?.id ?? res?.data?._id ?? null)
      setExistingRecords(previous => [res.data, ...previous])
      setForm(prev => ({ ...prev, payment: paidAmount }))
      setSaved(true); setConfirmed(true); setPaidDone(true)
      setEditMode(false); setPaidPanelOpen(false)
    } catch (err) {
      setError('Paid Save failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const handleUpdate = async () => {
    if (!validate()) return
    if (!recordId) { setError('No saved record to update.'); return }
    if (confirmed && (!form.payment || !Number.isFinite(Number(form.payment)) || Number(form.payment) <= 0)) {
      setError('Enter a valid payment amount before saving a paid record.')
      return
    }
    const selectedRound = Number(roundRef.current)
    const savedRecord = existingRecords.find(record =>
      String(record._id || record.id) === String(recordId)
    )
    const originalRegisteredAt = savedRecord?.registered_at || savedRecord?.created_at
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const result = await dataRegistrationAPI.updateRegistration(recordId,
        buildPayload({
          payment_status: confirmed ? 'paid' : 'unpaid',
          ...(originalRegisteredAt ? { registered_at: originalRegisteredAt } : {}),
        }, selectedRound)
      )
      assertRegistrationRound(result, selectedRound)
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...result.data } : record
      ))
      setSaved(true); setEditMode(false)
    } catch (err) {
      setError('Update failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const handleConfirmPaid = async () => {
    if (!recordId) { setError('Please save the record first.'); return }
    const amount = Number(form.payment)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount before confirming payment.')
      return
    }
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.updateRegistration(recordId, {
        payment_status: 'paid',
        paid_amount: amount,
      })
      assertRegistrationPayment(response, 'paid', amount)
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...response.data } : record
      ))
      setConfirmed(true); setSaved(true); setEditMode(false)
    } catch (err) {
      setError('Confirm failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const handleMarkPaid = async () => {
    if (!recordId) { setError('Save the record first.'); return }
    if (!paidAmount || isNaN(paidAmount) || Number(paidAmount) <= 0) {
      setError('Enter a valid payment amount.'); return
    }
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const amount = parseFloat(paidAmount)
      const response = await dataRegistrationAPI.updateRegistration(recordId, {
        payment_status: 'paid',
        paid_amount: amount,
      })
      assertRegistrationPayment(response, 'paid', amount)
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...response.data } : record
      ))
      setForm(prev => ({ ...prev, payment: paidAmount }))
      setPaidDone(true); setConfirmed(true); setSaved(true); setPaidPanelOpen(false)
    } catch (err) {
      setError('Payment failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const handleEdit = () => { setEditMode(true); setSaved(false); setError(null) }

  const handleMarkUnpaid = async () => {
    if (!recordId) { setError('No record loaded.'); return }
    setLoading(true); setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.updateRegistration(recordId, {
        payment_status: 'unpaid',
        paid_amount: null,
      })
      assertRegistrationPayment(response, 'unpaid')
      setExistingRecords(previous => previous.map(record =>
        String(record._id || record.id) === String(recordId) ? { ...record, ...response.data } : record
      ))
      setPaidDone(false)
      setConfirmed(false)
      setForm(prev => ({ ...prev, payment: '' }))
      setSaved(true)
    } catch (err) {
      setError('Mark unpaid failed: ' + (err.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  const resetAll = () => {
    setForm(emptyForm)
    setSaved(false); setEditMode(false); setConfirmed(false)
    setRecordId(null); setError(null); setPaidDone(false)
    setPaidPanelOpen(false); setPaidAmount('')
    setNameSuggestionsOpen(false)
    handleUseDefaults({ applyRound: false })
    if (regNoAuto) setRegNo(generateNextReceiptNumber(existingRecords, roundRef.current))
  }

  /* Load defaults from localStorage */
  const handleUseDefaults = ({ applyRound = true } = {}) => {
    try {
      const defaultStaff     = localStorage.getItem('ebc_org_default_staff') || localStorage.getItem('ebc_default_staff')
      const defaultPayment   = localStorage.getItem('ebc_org_default_payment')
      const defaultYearRange = localStorage.getItem('ebc_org_default_year_range')
      const defaultRound     = localStorage.getItem('ebc_org_default_round')

      if (defaultStaff) {
        const staff = JSON.parse(defaultStaff)
        const desiredStaff = String(staff.username || staff.full_name || staff.fullName || staff.id || '').trim()
        const matchingStaff = staffOptions.find(option =>
          [option.username, option.full_name, option.fullName, option.id, option._id]
            .some(value => String(value || '').trim() === desiredStaff)
        )
        setForm(prev => ({ ...prev, registeredStaff: getStaffValue(matchingStaff) || desiredStaff }))
      }
      if (defaultPayment) {
        setForm(prev => ({ ...prev, payment: defaultPayment }))
      }
      if (defaultYearRange) {
        const knownRange = YEAR_RANGES.find(y => y.value === defaultYearRange)
        if (knownRange) {
          setForm(prev => ({ ...prev, paymentYear: knownRange.value, paymentYearCustom: '' }))
        } else {
          setForm(prev => ({ ...prev, paymentYear: 'custom', paymentYearCustom: defaultYearRange }))
        }
      }
      if (applyRound && defaultRound) {
        setSelectedRound(parseInt(defaultRound) || 1)
      }

      // Default project title (first from Settings list)
      const defaultProjectTitle = readDefaultProjectTitle()
      if (defaultProjectTitle) {
        setForm(prev => ({ ...prev, projectTitle: prev.projectTitle || defaultProjectTitle }))
        setProductTitles(readProjectTitles())
      }

      setError(null)
    } catch (e) {
      setError('Failed to load defaults. Please check Settings tab.')
    }
  }

  useEffect(() => {
    handleUseDefaults()
  }, [])

  const orgTypeDisplay = form.orgType === 'custom' ? form.orgTypeCustom : ORG_TYPES.find(t => t.value === form.orgType)?.label || ''
  const kebeleDisplay = form.kebele === 'custom' ? form.kebeleCustom : KEBELE_OPTIONS.find(k => k.value === form.kebele)?.label || ''
  const yearDisplay = form.paymentYear === 'custom' ? form.paymentYearCustom : YEAR_RANGES.find(y => y.value === form.paymentYear)?.label || ''
  const isReadOnly = saved && !editMode

  return (
    <div className="org-reg-content">
      <div className="ebc-form-wrap">
        {paidDone && (
          <div className="ebc-status-pill confirmed">💵 PAID ✅ — Saved (Reg# {regNo})</div>
        )}
        {saved && !paidDone && (
          <div className="ebc-status-pill saved">💾 Saved (Reg# {regNo}) — click Edit to change</div>
        )}
        {error && <div className="ebc-status-pill error">⚠️ {error}</div>}

        {/* ID + Round */}
        <div className="ebc-regid-row">
          <div className="ebc-regid-badge">
            <span className="ebc-regid-label">Receipt No. (Optional)</span>
            {isReadOnly ? (
              <span className="ebc-regid-value">{regNo || '—'}</span>
            ) : (
              <input
                className="ebc-input ebc-regid-input"
                maxLength={50}
                placeholder="Optional receipt number"
                value={regNo}
                onChange={e => { setRegNo(e.target.value); setRegNoAuto(false); setError(null) }}
              />
            )}
          </div>
          <label className="ebc-regid-toggle">
            <input
              type="checkbox"
              checked={regNoAuto}
              disabled={isReadOnly || loading}
              onChange={e => {
                setRegNoAuto(e.target.checked)
                if (e.target.checked) setRegNo(generateNextReceiptNumber(existingRecords, roundRef.current))
              }}
            />
            <span>Auto-generate receipt number</span>
          </label>

          <div className="ebc-round-selector">
            <span className="ebc-round-label">Round:</span>
            <div className="ebc-round-buttons">
              {Array.from({ length: Math.max(5, round) }, (_, i) => i + 1).map(r => (
                <button
                  key={r}
                  type="button"
                  className={`ebc-round-btn ${round === r ? 'active' : ''}`}
                  onClick={() => { setSelectedRound(r); setError(null) }}
                  disabled={isReadOnly}
                >
                  {r}
                </button>
              ))}
              <button
                className="ebc-round-add-btn"
                type="button"
                onClick={() => { if (round < 20) setSelectedRound(prev => prev < 20 ? prev + 1 : prev); setError(null) }}
                disabled={isReadOnly || loading || round >= 20}
              >
                + Add
              </button>
            </div>
            <span className="ebc-round-current">Currently: Round {round}</span>
          </div>
        </div>

        {/* Project Title (default from Settings) */}
        <div className="ebc-field-group" style={{ marginBottom: 14 }}>
          <label className="ebc-label">Project Title / የፕሮጀክት ርዕስ</label>
          {productTitles.length > 0 ? (
            isReadOnly ? (
              <div className="ebc-readonly-value">{form.projectTitle || '—'}</div>
            ) : (
              <select className="ebc-input" value={form.projectTitle} onChange={e => handleChange('projectTitle', e.target.value)}>
                {form.projectTitle && !productTitles.includes(form.projectTitle) && <option value={form.projectTitle}>{form.projectTitle}</option>}
                {productTitles.map(title => <option key={title} value={title}>{title}</option>)}
              </select>
            )
          ) : (
            <input className="ebc-input" placeholder="No project titles set in Settings — type one or set defaults"
              value={form.projectTitle} readOnly={isReadOnly} onChange={e => handleChange('projectTitle', e.target.value)} />
          )}
        </div>

        {/* ROW 1: Org Name · Org Type · Contact Person */}
        <div className="ebc-row-4">
          <div className="ebc-field-group">
            <label className="ebc-label">Organization Name / የድርጅት ስም</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.orgName || '—'}</div>
            ) : (
              <>
                <input className="ebc-input" placeholder="Enter organization name..."
                  value={form.orgName}
                  onFocus={() => setNameSuggestionsOpen(true)}
                  onBlur={() => setNameSuggestionsOpen(false)}
                  onChange={e => handleChange('orgName', e.target.value)} />
                <RegistrationNameSuggestions
                  records={existingRecords}
                  query={form.orgName}
                  organization
                  open={nameSuggestionsOpen}
                  onSelect={fillFormFromRecord}
                />
              </>
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">National ID <span className="ebc-label-optional">Optional</span></label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.nationalId || '—'}</div>
            ) : (
              <input className="ebc-input" maxLength={100} placeholder="Enter national ID"
                value={form.nationalId} onChange={e => handleChange('nationalId', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">Organization Type / አይነት</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{orgTypeDisplay || '—'}</div>
            ) : (
              <>
                <select className="ebc-select" value={form.orgType}
                  onChange={e => handleChange('orgType', e.target.value)}>
                  <option value="">— Select Type —</option>
                  {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {form.orgType === 'custom' && (
                  <input className="ebc-input ebc-custom-input" placeholder="Enter type..."
                    value={form.orgTypeCustom} onChange={e => handleChange('orgTypeCustom', e.target.value)} />
                )}
              </>
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">Contact Person / ግንኙነት ሰው</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.contactPerson || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="Contact person name..."
                value={form.contactPerson} onChange={e => handleChange('contactPerson', e.target.value)} />
            )}
          </div>
        </div>

        {/* ROW 2: Phone · Email · Kebele · City */}
        <div className="ebc-row-4">
          <div className="ebc-field-group">
            <label className="ebc-label">Contact Phone / ስልክ</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.contactPhone || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="+251 9XX XXX XXX"
                value={form.contactPhone} onChange={e => handleChange('contactPhone', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">
              Email / ኢሜይል
              <span className="ebc-label-optional">Optional</span>
            </label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.contactEmail || '—'}</div>
            ) : (
              <input className="ebc-input" type="email" placeholder="email@example.com"
                value={form.contactEmail} onChange={e => handleChange('contactEmail', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">Kebele / ቀበሌ</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{kebeleDisplay || '—'}</div>
            ) : (
              <>
                <select className="ebc-select" value={form.kebele}
                  onChange={e => handleChange('kebele', e.target.value)}>
                  <option value="">— Select Kebele —</option>
                  {KEBELE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {form.kebele === 'custom' && (
                  <input className="ebc-input ebc-custom-input" placeholder="Enter kebele..."
                    value={form.kebeleCustom} onChange={e => handleChange('kebeleCustom', e.target.value)} />
                )}
              </>
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">City / ከተማ <span aria-hidden="true">*</span></label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.city || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="Enter city..." required aria-required="true"
                value={form.city} onChange={e => handleChange('city', e.target.value)} />
            )}
          </div>
        </div>

        {/* ROW 3: Address · Staff · Payment · Year */}
        <div className="ebc-row-4">
          <div className="ebc-field-group">
            <label className="ebc-label">Address / አድራሻ <span aria-hidden="true">*</span></label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.address || '—'}</div>
            ) : (
              <input className="ebc-input" placeholder="Building, Street..." required aria-required="true"
                value={form.address} onChange={e => handleChange('address', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">Staff / ሰራተኛ</label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.registeredStaff || '—'}</div>
            ) : (
              <select className="ebc-select" value={form.registeredStaff}
                disabled={getAccountAccessRole() === 'staff'}
                onChange={e => handleChange('registeredStaff', e.target.value)}>
                <option value="">Select registered staff</option>
                {form.registeredStaff && !staffOptions.some(option => getStaffValue(option) === form.registeredStaff) &&
                  <option value={form.registeredStaff}>{form.registeredStaff}</option>}
                {staffOptions.map(option => (
                  <option key={option.id || option._id || getStaffValue(option)} value={getStaffValue(option)}>
                    {option.username || getStaffValue(option)}{(option.full_name || option.fullName) ? ` — ${option.full_name || option.fullName}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">
              Payment (ETB) / ክፍያ
              <span className="ebc-label-optional">Optional</span>
            </label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{form.payment ? `ETB ${form.payment}` : '—'}</div>
            ) : (
              <input className="ebc-input" type="number" placeholder="0.00" min="0"
                value={form.payment} onChange={e => handleChange('payment', e.target.value)} />
            )}
          </div>

          <div className="ebc-field-group">
            <label className="ebc-label">
              Payment Year / ዓመት
              <span className="ebc-label-optional">Optional</span>
            </label>
            {isReadOnly ? (
              <div className="ebc-readonly-value">{yearDisplay || '—'}</div>
            ) : (
              <>
                <select className="ebc-select" value={form.paymentYear}
                  onChange={e => handleChange('paymentYear', e.target.value)}>
                  <option value="">— Select Year —</option>
                  {YEAR_RANGES.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                </select>
                {form.paymentYear === 'custom' && (
                  <input className="ebc-input ebc-custom-input" placeholder="e.g. 2016-2020"
                    value={form.paymentYearCustom} onChange={e => handleChange('paymentYearCustom', e.target.value)} />
                )}
              </>
            )}
          </div>
        </div>

        <PdfAttachmentField
          label="Bank Receipt"
          value={form.bankReceiptPdf}
          disabled={isReadOnly}
          registrationId={recordId}
          onChange={pdf => handleChange('bankReceiptPdf', pdf)}
        />
        <PdfAttachmentField
          label="Project Owner Receipt"
          value={form.ownerReceiptPdf}
          disabled={isReadOnly}
          registrationId={recordId}
          documentType="owner-receipt"
          onChange={pdf => handleChange('ownerReceiptPdf', pdf)}
        />

        {/* Paid Panel */}
        {paidPanelOpen && (
          <div className="ebc-paid-panel">
            <div className="ebc-paid-panel-header">
              <span className="ebc-paid-panel-icon">💳</span>
              <div>
                <div className="ebc-paid-panel-title">Mark as Paid / ክፍያ ያስምዝግቡ</div>
                <div className="ebc-paid-panel-sub">
                  Organization: <strong>{form.orgName || '—'}</strong> · Reg# <strong>{regNo}</strong>
                </div>
              </div>
            </div>
            <div className="ebc-paid-panel-row">
              <div className="ebc-field-group" style={{ flex: 1 }}>
                <label className="ebc-label">Payment Amount (ETB)</label>
                <input className="ebc-input ebc-paid-amount-input" type="number" min="0"
                  placeholder="Enter amount..." value={paidAmount} autoFocus
                  onChange={e => setPaidAmount(e.target.value)} />
              </div>
              <div className="ebc-paid-panel-actions">
                {recordId ? (
                  <button className="ebc-btn paid-confirm" onClick={handleMarkPaid} disabled={loading}>
                    {loading ? '⏳ Processing...' : '✅ Confirm Payment'}
                  </button>
                ) : (
                  <button className="ebc-btn paid-confirm" onClick={handlePaidSave} disabled={loading}>
                    {loading ? '⏳ Saving...' : '💵 Save & Mark Paid'}
                  </button>
                )}
                <button className="ebc-btn clear"
                  onClick={() => { setPaidPanelOpen(false); setError(null) }} disabled={loading}>
                  ✕ Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="ebc-form-actions">

          {/* ─── USE DEFAULTS ─── */}
          <button className="ebc-btn defaults" onClick={handleUseDefaults} title="Auto-fill Staff, Payment & Year from Settings">
            ⚡ Use Defaults
          </button>

          {!saved && !editMode && (
            <button className="ebc-btn save" onClick={handleSave} disabled={loading}>
              {loading ? '⏳ Saving...' : '💾 Save / አስቀምጥ'}
            </button>
          )}

          {saved && !paidDone && !editMode && (
            <>
              <button className="ebc-btn save" onClick={handleUpdate} disabled={loading}>
                {loading ? '⏳ Updating...' : '💾 Update / አዘምን'}
              </button>
              {!paidPanelOpen && (
                <button className="ebc-btn paid"
                  onClick={() => { setPaidAmount(form.payment || ''); setPaidPanelOpen(true); setError(null) }}>
                  💵 Paid / ተከፍሏል
                </button>
              )}
            </>
          )}

          {paidDone && !editMode && (
            <>
              <span className="ebc-paid-badge">💵 PAID ✅</span>
              <button className="ebc-btn unpaid" onClick={handleMarkUnpaid} disabled={loading}>
                {loading ? '⏳...' : '🔄 New Unpaid / ያልተከፈለ'}
              </button>
              <button className="ebc-btn edit" onClick={handleEdit} disabled={loading}>
                ✏️ Edit / አስተካክል
              </button>
            </>
          )}

          {editMode && (
            <>
              <button className="ebc-btn save" onClick={handleUpdate} disabled={loading}>
                {loading ? '⏳ Updating...' : '💾 Update / አዘምን'}
              </button>
              <button className="ebc-btn confirm-paid" onClick={handleConfirmPaid} disabled={loading}>
                {loading ? '⏳...' : '✅ Confirm Paid'}
              </button>
              <button className="ebc-btn cancel" onClick={() => { setEditMode(false); setSaved(true); setError(null) }}>
                ✕ Cancel
              </button>
            </>
          )}

          <button className="ebc-btn defaults" onClick={handleUseDefaults} title="Load default staff and payment from Settings">
            ⚡ Use Defaults
          </button>
          <button className="ebc-btn reset" onClick={resetAll}>🔄 Reset All</button>
        </div>
      </div>
    </div>
  )
}

/* Organization Report Content */
function OrgReportContent({ onEdit }) {
  const currentRole = getAccountAccessRole().trim().toLowerCase()
  const siteContent = useSiteContent()
  const currentRoleRule = siteContent.accountAccessSettings?.rules?.find(
    rule => String(rule.role || '').trim().toLowerCase() === currentRole.trim().toLowerCase()
  )
  const canDeleteRegistrations = typeof currentRoleRule?.actions?.deleteRegistrations === 'boolean'
    ? currentRoleRule.actions.deleteRegistrations
    : ['admin', 'root'].includes(currentRole.trim().toLowerCase())
  const [records, setRecords] = useState([])
  const [projectTitles, setProjectTitles] = useState(readProjectTitles)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState(() => readStoredFilter('ebc_org_report_query'))
  const [roundFilter, setRoundFilter] = useState(() => readStoredFilter('ebc_org_report_round_filter', 'all'))
  const [statusFilter, setStatusFilter] = useState(() => readStoredFilter('ebc_org_report_status_filter', 'all'))
  const [projectFilter, setProjectFilter] = useState(() => readStoredFilter('ebc_org_report_project_filter', 'all'))
  const [staffFilter, setStaffFilter] = useState(() => readStoredFilter('ebc_org_report_staff_filter', getStaffFilterDefault()))
  const [dateFilter, setDateFilter] = useState(() => readStoredFilter('ebc_org_report_date_filter', 'all'))
  const [startDate, setStartDate] = useState(() => readStoredFilter('ebc_org_report_start_date'))
  const [endDate, setEndDate] = useState(() => readStoredFilter('ebc_org_report_end_date'))
  const [reportPage, setReportPage] = useState(0)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    const options = getRegistrationStaffOptions(records)
    if (['staff', 'user'].includes(currentRole)) {
      const user = getCurrentUserProfile()
      const currentAliases = [user.staff_id, user.username, user.full_name, user.fullName, user.id, user._id, user.email]
        .map(value => String(value || '').trim().toLocaleLowerCase())
        .filter(Boolean)
      const ownOption = options.find(option => option.aliases.some(alias => currentAliases.includes(alias)))
      const nextFilter = ownOption?.value || getStaffFilterDefault()
      setStaffFilter(previous => previous === nextFilter ? previous : nextFilter)
      return
    }

    setStaffFilter(previous => {
      if (previous === 'all') return previous
      return options.some(option =>
        option.value.toLocaleLowerCase() === previous.toLocaleLowerCase() ||
        option.aliases.includes(previous.toLocaleLowerCase())
      ) ? previous : 'all'
    })
  }, [currentRole, records])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_query', query)
  }, [query])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_round_filter', roundFilter)
  }, [roundFilter])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_status_filter', statusFilter)
  }, [statusFilter])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_project_filter', projectFilter)
  }, [projectFilter])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_staff_filter', staffFilter)
  }, [staffFilter])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_date_filter', dateFilter)
  }, [dateFilter])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_start_date', startDate)
  }, [startDate])

  useEffect(() => {
    writeStoredFilter('ebc_org_report_end_date', endDate)
  }, [endDate])

  useEffect(() => {
    setReportPage(0)
  }, [query, roundFilter, statusFilter, projectFilter, staffFilter, dateFilter, startDate, endDate])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const { dataRegistrationAPI } = await import('../../services/api.js')
        const res = await dataRegistrationAPI.getAllRegistrations()
        const list = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.registrations)
            ? res.registrations
            : null
        if (!list) throw new Error('The server returned registrations in an unexpected format.')
        if (!cancelled) setRecords(list.filter(r => r.person === 'organization' || r.client_type === 'organization'))
      } catch (e) { if (!cancelled) setError(e.message) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleDeleteOrganization = async record => {
    const id = record._id || record.id
    if (!id) {
      setError('Cannot delete this organization because it has no database ID.')
      return
    }
    if (!window.confirm(`Delete organization registration ${record.receipt_no || id} (Round ${record.round || 1})? This permanently removes it from Neon.`)) {
      return
    }
    setDeletingId(id)
    setError(null)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.deleteRegistration(id)
      if (!response?.success) throw new Error(response?.message || 'The server did not confirm the deletion.')
      setRecords(previous => previous.filter(item => String(item._id || item.id) !== String(id)))
    } catch (deleteError) {
      console.error('Could not delete organization registration from the report:', deleteError)
      setError(`Could not delete organization registration: ${deleteError.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    import('../../services/api.js')
      .then(({ dataRegistrationAPI }) => dataRegistrationAPI.getProjectTitleSettings())
      .then(response => {
        if (cancelled || !Array.isArray(response?.data?.titles)) return
        setProjectTitles([...new Set(response.data.titles.map(title => String(title || '').trim()).filter(Boolean))])
      })
      .catch(loadError => {
        console.error('Could not load saved project titles for the organization report filter:', loadError)
        if (!cancelled) setError(previous => previous || `Could not load saved project titles: ${loadError.message}`)
      })
    return () => { cancelled = true }
  }, [])

  let filtered = records
  const staffOptions = getRegistrationStaffOptions(records)

  // Round filter
  if (roundFilter !== 'all') {
    filtered = filtered.filter(r => String(parseInt(r.round) || 1) === String(roundFilter))
  }

  if (projectFilter !== 'all') {
    const selectedTitle = normalizeProjectTitle(projectFilter)
    filtered = filtered.filter(r => normalizeProjectTitle(getRegistrationProjectTitle(r)) === selectedTitle)
  }
  if (staffFilter !== 'all') {
    filtered = filtered.filter(record => matchesRegistrationStaffFilter(record, staffFilter, currentRole, staffOptions))
  }
  filtered = filtered.filter(record => isWithinDateFilter(record, dateFilter, startDate, endDate))

  // Search
  const q = query.trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(r =>
      [r.client_name, r.org_type, r.contact_person, r.client_phone,
       r.national_id, r.client_email, r.city, r.address, r.kebele, r.receipt_no,
       r.staff_username, r.staff_full_name, r.staff_role,
       r.paid_amount != null ? String(r.paid_amount) : '',
       r.payment_period_type, r.payment_status, getRegistrationProjectTitle(r), r.round ? `R${r.round}` : '']
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    )
  }

  const projectFilteredRecords = filtered
  if (statusFilter !== 'all') {
    filtered = filtered.filter(r => isRegistrationPaid(r) === (statusFilter === 'paid'))
  }
  const safeReportPage = Math.min(reportPage, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1))

  const totalPaid = projectFilteredRecords.filter(isRegistrationPaid).length
  const totalUnpaid = projectFilteredRecords.filter(r => !isRegistrationPaid(r)).length
  const totalAmount = projectFilteredRecords
    .filter(isRegistrationPaid)
    .reduce((s, r) => s + (parseFloat(String(r.paid_amount ?? '').replace(/,/g, '')) || 0), 0)
  const projectOptions = [...new Map(
    [...projectTitles, ...records.map(getRegistrationProjectTitle), ...(projectFilter === 'all' ? [] : [projectFilter])]
      .map(title => [normalizeProjectTitle(title), String(title || '').trim()])
      .filter(([key, title]) => key && title)
  ).values()].sort((left, right) => left.localeCompare(right))
  const selectedProjectTitle = projectFilter === 'all'
    ? 'All Projects'
    : projectOptions.find(title => normalizeProjectTitle(title) === normalizeProjectTitle(projectFilter)) || projectFilter
  const visibleStaffOptions = ['staff', 'user'].includes(currentRole)
    ? staffOptions.filter(option => {
      const user = getCurrentUserProfile()
      const currentAliases = [user.staff_id, user.username, user.full_name, user.fullName, user.id, user._id, user.email]
        .map(value => String(value || '').trim().toLocaleLowerCase())
        .filter(Boolean)
      return option.aliases.some(alias => currentAliases.includes(alias))
    })
    : staffOptions

  const exportTitle = `Organizations_${statusFilter === 'all' ? 'All_Statuses' : statusFilter}`
  const exportRows = getRegistrationExportRows(filtered, records)

  const downloadOrganizationPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf')
      await import('jspdf-autotable')
      const doc = new jsPDF({ orientation: 'landscape' })
      const logo = readProjectLogoForTitle(projectFilter === 'all' ? '' : selectedProjectTitle)

      if (logo) {
        try {
          const format = logo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
          doc.addImage(logo, format, 14, 8, 18, 18)
        } catch (logoError) {
          console.error('Could not add the project logo to the organization report:', logoError)
        }
      }
      doc.setFontSize(14)
      doc.setTextColor(11, 79, 108)
      doc.text('Organization Registration Report', 36, 18)
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text(`Project: ${selectedProjectTitle} · Round: ${roundFilter === 'all' ? 'All rounds' : roundFilter}`, 14, 32)
      doc.text(`Status: ${statusFilter === 'all' ? 'All statuses' : statusFilter} · Generated: ${new Date().toLocaleString()} · Total: ${filtered.length}`, 14, 39)
      const headers = Object.keys(exportRows[0] || getRegistrationExportRows([{}])[0])
      doc.autoTable({
        startY: 45,
        head: [headers],
        body: exportRows.map(row => headers.map(header => row[header])),
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: headers.slice(0, 3),
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [11, 79, 108], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      })
      doc.save(buildReportFilename(exportTitle, selectedProjectTitle, roundFilter, 'pdf'))
    } catch (exportError) {
      console.error('Could not export the organization report as PDF:', exportError)
      setError(`Could not export the organization report as PDF: ${exportError.message}`)
    }
  }

  const downloadOrganizationExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const headers = Object.keys(exportRows[0] || getRegistrationExportRows([{}])[0])
      const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers })
      worksheet['!cols'] = headers.map(header => ({
        wch: Math.min(32, Math.max(14, header.length + 2)),
      }))
      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: exportRows.length, c: headers.length - 1 },
        }),
      }
      const workbook = XLSX.utils.book_new()
      workbook.Props = {
        Title: 'Organization Registration Report',
        Subject: `${exportTitle} - ${selectedProjectTitle}`,
        CreatedDate: new Date(),
      }
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Organizations')
      XLSX.writeFile(workbook, buildReportFilename(exportTitle, selectedProjectTitle, roundFilter, 'xlsx'))
    } catch (exportError) {
      console.error('Could not export the organization report as Excel:', exportError)
      setError(`Could not export the organization report as Excel: ${exportError.message}`)
    }
  }

  const downloadOrganizationWord = () => {
    try {
      const headers = Object.keys(exportRows[0] || getRegistrationExportRows([{}])[0])
      const htmlContent = `<!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Organization Registration Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #0b4f6c; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #0b4f6c; color: white; }
          tr:nth-child(even) { background-color: #f5f5f5; }
          .meta { color: #666; }
        </style></head><body>
        <h1>Organization Registration Report</h1>
        <p class="meta">Project: ${escapeHtml(selectedProjectTitle)} · Round: ${escapeHtml(roundFilter === 'all' ? 'All rounds' : roundFilter)}</p>
        <p class="meta">Status: ${escapeHtml(statusFilter === 'all' ? 'All statuses' : statusFilter)} · Generated: ${escapeHtml(new Date().toLocaleString())} · Total: ${filtered.length}</p>
        <table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${exportRows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></body></html>`
      downloadBlob(
        new Blob([htmlContent], { type: 'application/msword' }),
        buildReportFilename(exportTitle, selectedProjectTitle, roundFilter, 'doc')
      )
    } catch (exportError) {
      console.error('Could not export the organization report as Word:', exportError)
      setError(`Could not export the organization report as Word: ${exportError.message}`)
    }
  }

  return (
    <div className="org-report-content">
      {/* Summary */}
      <div className="rpt-summary-row">
        <div className="rpt-summary-card green">
          <span className="rpt-summary-icon">✅</span>
          <div><div className="rpt-summary-num">{totalPaid}</div><div className="rpt-summary-lbl">Paid</div></div>
        </div>
        <div className="rpt-summary-card orange">
          <span className="rpt-summary-icon">⏳</span>
          <div><div className="rpt-summary-num">{totalUnpaid}</div><div className="rpt-summary-lbl">Unpaid</div></div>
        </div>
        <div className="rpt-summary-card blue">
          <span className="rpt-summary-icon">📊</span>
          <div><div className="rpt-summary-num">{projectFilteredRecords.length}</div><div className="rpt-summary-lbl">Total</div></div>
        </div>
        <div className="rpt-summary-card gold">
          <span className="rpt-summary-icon">💰</span>
          <div><div className="rpt-summary-num">ETB {totalAmount.toLocaleString()}</div><div className="rpt-summary-lbl">Collected</div></div>
        </div>
      </div>
      <div className="rpt-filter-summary" role="status">
        Filtered report: {selectedProjectTitle} · {roundFilter === 'all' ? 'All rounds' : `Round ${roundFilter}`} ·
        {' '}{filtered.length} {statusFilter === 'all' ? 'organization' : statusFilter} records ·
        {' '}Collected ETB {totalAmount.toLocaleString()}
      </div>

      {/* Filters */}
      <div className="rpt-toolbar">
        <div className="rpt-round-filter">
          <label>Round:</label>
          <select className="ebc-select rpt-round-select" value={roundFilter} onChange={e => setRoundFilter(e.target.value)}>
            <option value="all">All Rounds</option>
            {[...new Set(records.map(r => parseInt(r.round) || 1))].filter(n => !isNaN(n)).sort((a, b) => a - b).map(r => (
              <option key={r} value={String(r)}>Round {r}</option>
            ))}
          </select>
        </div>

        <div className="rpt-round-filter">
          <label>Status:</label>
          <select className="ebc-select rpt-round-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>

        <div className="rpt-round-filter">
          <label>Project:</label>
          <select className="ebc-select rpt-round-select" value={projectFilter === 'all' ? 'all' : selectedProjectTitle} onChange={e => setProjectFilter(e.target.value)}>
            <option value="all">All Projects</option>
            {projectOptions.map(title => (
              <option key={title} value={title}>{title}</option>
            ))}
          </select>
        </div>

        <div className="rpt-round-filter">
          <label htmlFor="organization-report-staff-filter">Staff / User:</label>
          <select id="organization-report-staff-filter" className="ebc-select rpt-round-select" value={staffFilter} onChange={event => setStaffFilter(event.target.value)}>
            {!['staff', 'user'].includes(currentRole) && <option value="all">All Staff &amp; Users</option>}
            {visibleStaffOptions.map(staff => <option key={staff.value} value={staff.value}>{staff.label}</option>)}
          </select>
        </div>
        <div className="rpt-round-filter">
          <label>Date:</label>
          <select className="ebc-select rpt-round-select" value={dateFilter} onChange={event => setDateFilter(event.target.value)}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Period</option>
          </select>
        </div>
        {dateFilter === 'custom' && (
          <>
            <label className="rpt-date-filter">From <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
            <label className="rpt-date-filter">To <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
          </>
        )}

        <input
          className="ebc-input rpt-search"
          placeholder="Search organizations..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="rpt-export-btns">
          <button className="ebc-btn rpt-pdf-btn" onClick={downloadOrganizationPDF} disabled={loading || filtered.length === 0}>
            📄 PDF
          </button>
          <button className="ebc-btn rpt-word-btn" onClick={downloadOrganizationWord} disabled={loading || filtered.length === 0}>
            📝 Word
          </button>
          <button className="ebc-btn rpt-excel-btn" onClick={downloadOrganizationExcel} disabled={loading || filtered.length === 0}>
            📊 Excel
          </button>
        </div>
      </div>

      {loading && <div className="rpt-loading">⏳ Loading...</div>}
      {error && <div className="ebc-status-pill error">⚠️ {error}</div>}

      {/* Table */}
      {!loading && (
        <div className="rpt-table-wrap">
          {filtered.length === 0 ? (
            <div className="ebc-search-empty">📭 No organizations found</div>
          ) : (
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Reg ID</th>
                  <th>Round</th>
                  <th>Project Title</th>
                  <th>Organization Name</th>
                  <th>National ID</th>
                  <th>Type</th>
                  <th>Contact Person</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>City</th>
                  <th>Address</th>
                  <th>Kebele</th>
                  <th>House No</th>
                  <th>Staff</th>
                  <th>Payment</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th>Registered At</th>
                  {canDeleteRegistrations && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {getPageItems(filtered, safeReportPage).map((r, i) => {
                  const isPaid = isRegistrationPaid(r)
                  return (
                    <tr 
                      key={r._id || r.id || i} 
                      className={`rpt-row ${i % 2 ? 'rpt-stripe-white' : 'rpt-stripe-silver'} ${isPaid ? 'rpt-paid' : 'rpt-unpaid'} ${onEdit ? 'rpt-clickable' : ''}`}
                      onClick={onEdit ? () => onEdit(r) : undefined}
                      title={onEdit ? 'Click to edit this organization' : undefined}
                    >
                      <td><span className="ebc-search-regid">{r.receipt_no || '—'}</span></td>
                      <td><span className="ebc-round-badge">R{r.round || 1}</span></td>
                      <td className="rpt-project">{getRegistrationProjectTitle(r) || '—'}</td>
                      <td className="rpt-name">{r.client_name || '—'}</td>
                      <td>{r.national_id || '—'}</td>
                      <td>{r.org_type || '—'}</td>
                      <td>{r.contact_person || '—'}</td>
                      <td>{r.client_phone || '—'}</td>
                      <td>{r.client_email || '—'}</td>
                      <td>{r.city || '—'}</td>
                      <td>{r.address || '—'}</td>
                      <td>{r.kebele || '—'}</td>
                      <td>{r.house_no || '—'}</td>
                      <td>{getRegistrationStaffLabel(r)}</td>
                      <td>{r.paid_amount != null ? `ETB ${r.paid_amount}` : '—'}</td>
                      <td>{r.payment_period_type || '—'}</td>
                      <td>
                        <span className={`ebc-status-dot ${isPaid ? 'paid' : 'unpaid'}`}>
                          {isPaid ? '✅ Paid' : '⏳ Unpaid'}
                        </span>
                      </td>
                      <td>{r.registered_at || r.created_at || '—'}</td>
                      {canDeleteRegistrations && (
                        <td>
                          <button
                            type="button"
                            className="ebc-btn"
                            style={{ background: '#b42318', color: '#fff', padding: '6px 10px' }}
                            onClick={event => {
                              event.stopPropagation()
                              handleDeleteOrganization(r)
                            }}
                            disabled={deletingId === (r._id || r.id)}
                          >
                            {deletingId === (r._id || r.id) ? 'Deleting…' : '🗑 Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <Pagination page={safeReportPage} itemCount={filtered.length} onPageChange={setReportPage} label="organization reports" />
          <div className="rpt-footer">
            Showing {filtered.length ? safeReportPage * PAGE_SIZE + 1 : 0}–{Math.min((safeReportPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} filtered organizations
          </div>
        </div>
      )}
    </div>
  )
}

function EbcResultsTab() {
  const [resultType, setResultType] = useState(() =>
    readStoredFilter('ebc_result_type', 'individual') === 'organization'
      ? 'organization'
      : 'individual'
  )

  useEffect(() => {
    writeStoredFilter('ebc_result_type', resultType)
  }, [resultType])

  return (
    <div className="ebc-results-tab">
      <div className="ebc-results-toolbar">
        <label htmlFor="ebc-result-type">Result type</label>
        <select
          id="ebc-result-type"
          className="ebc-select"
          value={resultType}
          onChange={event => setResultType(event.target.value)}
        >
          <option value="individual">Individual Results</option>
          <option value="organization">Organization Results</option>
        </select>
      </div>
      {resultType === 'organization' ? <OrgReportContent /> : <EbcReportTab />}
    </div>
  )
}

function EbcSettingTab() {
  // Individual Registration defaults
  const [indivPayment, setIndivPayment] = useState('')
  const [indivYearFrom, setIndivYearFrom] = useState('')
  const [indivYearTo, setIndivYearTo] = useState('')
  const [indivRound, setIndivRound] = useState(1)

  // Organization defaults
  const [orgPayment, setOrgPayment] = useState('')
  const [orgYearFrom, setOrgYearFrom] = useState('')
  const [orgYearTo, setOrgYearTo] = useState('')
  const [orgRound, setOrgRound] = useState(1)

  // Product titles (shared list used as defaults on registration forms)
  const [productTitles, setProductTitles] = useState([])
  const [productTitleInput, setProductTitleInput] = useState('')
  const [defaultProductTitle, setDefaultProductTitle] = useState('')
  const [productLogo, setProductLogo] = useState('')
  const [projectDocuments, setProjectDocuments] = useState({})

  const [success, setSuccess] = useState(null)
  const [titleSaving, setTitleSaving] = useState(false)

  // Load defaults on mount
  useEffect(() => {
    // Individual defaults
    const savedIndivPayment   = localStorage.getItem('ebc_default_payment')
    const savedIndivYearRange = localStorage.getItem('ebc_default_year_range')
    const savedIndivRound     = localStorage.getItem('ebc_default_round')
    if (savedIndivPayment)   setIndivPayment(savedIndivPayment)
    if (savedIndivYearRange) {
      const [from, to] = savedIndivYearRange.split('-')
      setIndivYearFrom(from || '')
      setIndivYearTo(to || '')
    }
    if (savedIndivRound) setIndivRound(parseInt(savedIndivRound) || 1)

    // Organization defaults
    const savedOrgPayment   = localStorage.getItem('ebc_org_default_payment')
    const savedOrgYearRange = localStorage.getItem('ebc_org_default_year_range')
    const savedOrgRound     = localStorage.getItem('ebc_org_default_round')
    if (savedOrgPayment)   setOrgPayment(savedOrgPayment)
    if (savedOrgYearRange) {
      const [from, to] = savedOrgYearRange.split('-')
      setOrgYearFrom(from || '')
      setOrgYearTo(to || '')
    }
    if (savedOrgRound) setOrgRound(parseInt(savedOrgRound) || 1)

    // Product titles + logo are hydrated from the API below. Keep the local
    // values visible while loading so the settings panel opens immediately.
    const savedTitles = localStorage.getItem('ebc_product_titles')
    if (savedTitles) {
      try {
        const parsed = JSON.parse(savedTitles)
        if (Array.isArray(parsed)) {
          setProductTitles(parsed)
          setDefaultProductTitle(readDefaultProjectTitle())
        }
      } catch { /* ignore malformed */ }
    }
    const savedLogo = localStorage.getItem('ebc_product_logo')
    if (savedLogo) setProductLogo(savedLogo)

    let cancelled = false
    import('../../services/api.js').then(({ dataRegistrationAPI }) =>
      dataRegistrationAPI.getProjectTitleSettings()
    ).then(response => {
      if (cancelled) return
      const settings = response?.data || {}
      const titles = Array.isArray(settings.titles) ? settings.titles : []
      const selected = titles.includes(settings.defaultTitle) ? settings.defaultTitle : (titles[0] || '')
      setProductTitles(titles)
      setDefaultProductTitle(selected)
      localStorage.setItem('ebc_product_titles', JSON.stringify(titles))
      if (selected) localStorage.setItem('ebc_default_product_title', selected)
      else localStorage.removeItem('ebc_default_product_title')
    }).catch(loadError => {
      console.error('Could not load project title settings from the database:', loadError)
      if (!cancelled) {
        setSuccess(`⚠️ Could not load project titles from the database: ${loadError.message}`)
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    import('../../services/api.js').then(({ dataRegistrationAPI }) =>
      dataRegistrationAPI.getProjectDocuments()
    ).then(response => {
      if (cancelled) return
      const documents = response?.data || []
      setProjectDocuments(Object.fromEntries(documents.map(document => [document.project_title, document.pdf_data])))
    }).catch(loadError => {
      console.error('Could not load project PDF documents:', loadError)
      if (!cancelled) setSuccess(`⚠️ Could not load project PDF documents: ${loadError.message}`)
    })
    return () => { cancelled = true }
  }, [])

  const handleSaveIndividual = () => {
    localStorage.setItem('ebc_default_payment', indivPayment)
    localStorage.setItem('ebc_default_round', String(indivRound))
    writeStoredFilter('ebc_current_round', String(indivRound))
    if (indivYearFrom && indivYearTo) {
      localStorage.setItem('ebc_default_year_range', `${indivYearFrom}-${indivYearTo}`)
    } else {
      localStorage.removeItem('ebc_default_year_range')
    }
    setSuccess('✅ Individual Registration defaults saved!')
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleClearIndividual = () => {
    if (!window.confirm('Clear Individual Registration defaults?')) return
    localStorage.removeItem('ebc_default_payment')
    localStorage.removeItem('ebc_default_year_range')
    localStorage.removeItem('ebc_default_round')
    localStorage.removeItem('ebc_current_round')
    setIndivPayment('')
    setIndivYearFrom('')
    setIndivYearTo('')
    setIndivRound(1)
    setSuccess('✅ Individual defaults cleared')
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleSaveOrganization = () => {
    localStorage.setItem('ebc_org_default_payment', orgPayment)
    localStorage.setItem('ebc_org_default_round', String(orgRound))
    writeStoredFilter('ebc_org_current_round', String(orgRound))
    if (orgYearFrom && orgYearTo) {
      localStorage.setItem('ebc_org_default_year_range', `${orgYearFrom}-${orgYearTo}`)
    } else {
      localStorage.removeItem('ebc_org_default_year_range')
    }
    setSuccess('✅ Organization defaults saved!')
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleClearOrganization = () => {
    if (!window.confirm('Clear Organization defaults?')) return
    localStorage.removeItem('ebc_org_default_payment')
    localStorage.removeItem('ebc_org_default_year_range')
    localStorage.removeItem('ebc_org_default_round')
    localStorage.removeItem('ebc_org_current_round')
    setOrgPayment('')
    setOrgYearFrom('')
    setOrgYearTo('')
    setOrgRound(1)
    setSuccess('✅ Organization defaults cleared')
    setTimeout(() => setSuccess(null), 3000)
  }

  const persistProductTitles = async (list, selectedDefault = defaultProductTitle) => {
    setTitleSaving(true)
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const response = await dataRegistrationAPI.saveProjectTitleSettings({
        titles: list,
        defaultTitle: list.includes(selectedDefault) ? selectedDefault : (list[0] || ''),
      })
      const savedSettings = response?.data || {}
      const savedTitles = Array.isArray(savedSettings.titles) ? savedSettings.titles : list
      const savedDefault = savedTitles.includes(savedSettings.defaultTitle)
        ? savedSettings.defaultTitle
        : (savedTitles[0] || '')
      setProductTitles(savedTitles)
      setDefaultProductTitle(savedDefault)
      localStorage.setItem('ebc_product_titles', JSON.stringify(savedTitles))
      if (savedDefault) localStorage.setItem('ebc_default_product_title', savedDefault)
      else localStorage.removeItem('ebc_default_product_title')
      return true
    } catch (saveError) {
      console.error('Could not save project title settings to the database:', saveError)
      setSuccess(`⚠️ Could not save project titles to the database: ${saveError.message}`)
      return false
    } finally {
      setTitleSaving(false)
    }
  }

  const handleAddProductTitle = async () => {
    const title = productTitleInput.trim()
    if (!title) return
    if (productTitles.includes(title)) {
      setSuccess('⚠️ That project title already exists')
      setTimeout(() => setSuccess(null), 3000)
      return
    }
    const saved = await persistProductTitles([...productTitles, title], defaultProductTitle || title)
    if (!saved) return
    setProductTitleInput('')
    setSuccess('✅ Project title added')
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleRemoveProductTitle = async title => {
    const titles = productTitles.filter(item => item !== title)
    const saved = await persistProductTitles(titles, defaultProductTitle === title ? (titles[0] || '') : defaultProductTitle)
    if (!saved) return
    setProjectDocuments(current => {
      const next = { ...current }
      delete next[title]
      return next
    })
    setSuccess('✅ Project title removed')
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleProjectDocumentChange = async (title, pdfData) => {
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      if (pdfData) await dataRegistrationAPI.saveProjectDocument(title, pdfData)
      else await dataRegistrationAPI.deleteProjectDocument(title)
      setProjectDocuments(current => {
        const next = { ...current }
        if (pdfData) next[title] = pdfData
        else delete next[title]
        return next
      })
      setSuccess(pdfData ? `✅ Project PDF saved for "${title}"` : `✅ Project PDF removed for "${title}"`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (saveError) {
      console.error('Could not save project PDF document:', saveError)
      throw new Error(`Could not save project PDF: ${saveError.message}`)
    }
  }

  const handleSaveDefaultProductTitle = async () => {
    if (!defaultProductTitle || !productTitles.includes(defaultProductTitle)) {
      setSuccess('⚠️ Select a project title first')
      return
    }
    const saved = await persistProductTitles(productTitles, defaultProductTitle)
    if (saved) {
      setSuccess('✅ Default project title saved to the database')
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  const handleLogoUpload = event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setSuccess('⚠️ Choose an image file for the logo')
      setTimeout(() => setSuccess(null), 3000)
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setProductLogo(dataUrl)
      localStorage.setItem('ebc_product_logo', dataUrl)
      setSuccess('✅ Product logo saved')
      setTimeout(() => setSuccess(null), 3000)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleTitleLogoUpload = (title, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setSuccess('⚠️ Choose an image file for the logo')
      setTimeout(() => setSuccess(null), 3000)
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      writeProjectTitleLogo(title, String(reader.result))
      setSuccess(`✅ Logo saved for "${title}"`)
      setTimeout(() => setSuccess(null), 3000)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleRemoveTitleLogo = title => {
    writeProjectTitleLogo(title, '')
    setSuccess(`🗑️ Logo removed for "${title}"`)
    setTimeout(() => setSuccess(null), 3000)
  }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#212121,#424242)' }}>
        <span className="ebc-tab-hero-icon">⚙️</span>
        <div>
          <h2>Settings</h2>
          <p>Configure default values for registration forms</p>
        </div>
      </div>

      <div className="settings-content">
        {success && <div className="ebc-status-pill confirmed" style={{ marginBottom: '20px' }}>{success}</div>}

        {/* Individual Registration Defaults */}
        <div className="settings-card">
          <h3>👤 Individual Registration Defaults</h3>
          <p className="settings-description">
            Set default payment and date for Individual Registration form
          </p>

          <div className="settings-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Payment Amount (ETB) / የክፍያ መጠን</label>
              <input
                className="ebc-input"
                type="number"
                placeholder="Enter payment amount..."
                value={indivPayment}
                onChange={e => setIndivPayment(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>

            <div className="ebc-field-group">
              <label className="ebc-label">Payment Year Range / የክፍያ ዓመት</label>
              <div className="year-range-inputs">
                <input
                  className="ebc-input year-input"
                  type="number"
                  placeholder="From (e.g. 2014)"
                  value={indivYearFrom}
                  onChange={e => setIndivYearFrom(e.target.value)}
                  min="2000"
                  max="2100"
                />
                <span className="year-separator">—</span>
                <input
                  className="ebc-input year-input"
                  type="number"
                  placeholder="To (e.g. 2018)"
                  value={indivYearTo}
                  onChange={e => setIndivYearTo(e.target.value)}
                  min="2000"
                  max="2100"
                />
              </div>
            </div>

            <div className="ebc-field-group settings-full">
              <label className="ebc-label">Default Round / ነባሪ ዙር</label>
              <div className="settings-round-selector">
                {Array.from({ length: Math.max(5, indivRound) }, (_, i) => i + 1).map(r => (
                  <button
                    key={r}
                    className={`settings-round-btn ${indivRound === r ? 'active' : ''}`}
                    onClick={() => setIndivRound(r)}
                  >
                    {r}
                  </button>
                ))}
                <button
                  className="settings-round-add-btn"
                  onClick={() => setIndivRound(p => p < 20 ? p + 1 : p)}
                  disabled={indivRound >= 20}
                  title="Add round"
                >
                  + Add
                </button>
              </div>
              <small className="settings-round-hint">Selected: <strong>Round {indivRound}</strong> — forms will open at this round by default</small>
            </div>
          </div>

          <div className="settings-actions">
            <button className="ebc-btn save" onClick={handleSaveIndividual}>
              💾 Save Individual Defaults
            </button>
            <button className="ebc-btn clear" onClick={handleClearIndividual}>
              🗑️ Clear
            </button>
          </div>

          {(indivPayment || (indivYearFrom && indivYearTo) || indivRound > 1) && (
            <div className="settings-preview">
              <h4>Current Individual Defaults:</h4>
              <div className="settings-preview-grid">
                {indivPayment && (
                  <div className="settings-preview-item">
                    <span className="settings-preview-label">💰 Payment:</span>
                    <span className="settings-preview-value">ETB {indivPayment}</span>
                  </div>
                )}
                {indivYearFrom && indivYearTo && (
                  <div className="settings-preview-item">
                    <span className="settings-preview-label">📅 Year Range:</span>
                    <span className="settings-preview-value">{indivYearFrom}-{indivYearTo}</span>
                  </div>
                )}
                <div className="settings-preview-item">
                  <span className="settings-preview-label">🔢 Round:</span>
                  <span className="settings-preview-value">Round {indivRound}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Organization Defaults */}
        <div className="settings-card">
          <h3>🏢 Organization Registration Defaults</h3>
          <p className="settings-description">
            Set default payment and date for Organization Registration form
          </p>

          <div className="settings-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Payment Amount (ETB) / የክፍያ መጠን</label>
              <input
                className="ebc-input"
                type="number"
                placeholder="Enter payment amount..."
                value={orgPayment}
                onChange={e => setOrgPayment(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>

            <div className="ebc-field-group">
              <label className="ebc-label">Payment Year Range / የክፍያ ዓመት</label>
              <div className="year-range-inputs">
                <input
                  className="ebc-input year-input"
                  type="number"
                  placeholder="From (e.g. 2014)"
                  value={orgYearFrom}
                  onChange={e => setOrgYearFrom(e.target.value)}
                  min="2000"
                  max="2100"
                />
                <span className="year-separator">—</span>
                <input
                  className="ebc-input year-input"
                  type="number"
                  placeholder="To (e.g. 2018)"
                  value={orgYearTo}
                  onChange={e => setOrgYearTo(e.target.value)}
                  min="2000"
                  max="2100"
                />
              </div>
            </div>

            <div className="ebc-field-group settings-full">
              <label className="ebc-label">Default Round / ነባሪ ዙር</label>
              <div className="settings-round-selector">
                {Array.from({ length: Math.max(5, orgRound) }, (_, i) => i + 1).map(r => (
                  <button
                    key={r}
                    className={`settings-round-btn ${orgRound === r ? 'active' : ''}`}
                    onClick={() => setOrgRound(r)}
                  >
                    {r}
                  </button>
                ))}
                <button
                  className="settings-round-add-btn"
                  onClick={() => setOrgRound(p => p < 20 ? p + 1 : p)}
                  disabled={orgRound >= 20}
                  title="Add round"
                >
                  + Add
                </button>
              </div>
              <small className="settings-round-hint">Selected: <strong>Round {orgRound}</strong> — forms will open at this round by default</small>
            </div>
          </div>

          <div className="settings-actions">
            <button className="ebc-btn save" onClick={handleSaveOrganization}>
              💾 Save Organization Defaults
            </button>
            <button className="ebc-btn clear" onClick={handleClearOrganization}>
              🗑️ Clear
            </button>
          </div>

          {(orgPayment || (orgYearFrom && orgYearTo) || orgRound > 1) && (
            <div className="settings-preview">
              <h4>Current Organization Defaults:</h4>
              <div className="settings-preview-grid">
                {orgPayment && (
                  <div className="settings-preview-item">
                    <span className="settings-preview-label">💰 Payment:</span>
                    <span className="settings-preview-value">ETB {orgPayment}</span>
                  </div>
                )}
                {orgYearFrom && orgYearTo && (
                  <div className="settings-preview-item">
                    <span className="settings-preview-label">📅 Year Range:</span>
                    <span className="settings-preview-value">{orgYearFrom}-{orgYearTo}</span>
                  </div>
                )}
                <div className="settings-preview-item">
                  <span className="settings-preview-label">🔢 Round:</span>
                  <span className="settings-preview-value">Round {orgRound}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Project Titles + Logo Defaults */}
        <div className="settings-card">
          <h3>🏷️ Project Title Defaults</h3>
          <p className="settings-description">
            Add one or more project titles. The first title becomes the default on the Registration and Organization forms, and every title is included in reports and downloads.
          </p>

          <div className="settings-form-grid">
            <div className="ebc-field-group settings-full">
              <label className="ebc-label" htmlFor="default-project-title">Default Project Title / ነባሪ የፕሮጀክት ርዕስ</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  id="default-project-title"
                  className="ebc-select"
                  style={{ flex: '1 1 220px' }}
                  value={defaultProductTitle}
                  onChange={event => setDefaultProductTitle(event.target.value)}
                  disabled={productTitles.length === 0 || titleSaving}
                >
                  <option value="">Select a project title</option>
                  {productTitles.map(title => <option key={title} value={title}>{title}</option>)}
                </select>
                <button type="button" className="ebc-btn save" onClick={handleSaveDefaultProductTitle} disabled={titleSaving || !productTitles.length}>
                  {titleSaving ? 'Saving...' : '💾 Save as Default'}
                </button>
              </div>
            </div>
            <div className="ebc-field-group settings-full">
              <label className="ebc-label">Add Project Title / የፕሮጀክት ርዕስ</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="ebc-input"
                  style={{ flex: '1 1 220px' }}
                  placeholder="Type a project title and press Add..."
                  value={productTitleInput}
                  onChange={e => setProductTitleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddProductTitle() } }}
                />
                <button type="button" className="ebc-btn save" onClick={handleAddProductTitle} disabled={titleSaving}>{titleSaving ? 'Saving...' : '➕ Add Title'}</button>
              </div>
            </div>

            <div className="ebc-field-group settings-full">
              <label className="ebc-label">Project Logo (used in downloads) / ሎጎ</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {productLogo
                  ? <img src={productLogo} alt="Project logo" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #dee2e6' }} />
                  : <div style={{ width: 56, height: 56, display: 'grid', placeItems: 'center', borderRadius: 8, background: '#f1f5f9', fontSize: '1.4rem' }}>🖼️</div>}
                <input type="file" accept="image/*" onChange={handleLogoUpload} />
                {productLogo && (
                  <button type="button" className="ebc-btn clear" onClick={() => { setProductLogo(''); localStorage.removeItem('ebc_product_logo') }}>Remove Logo</button>
                )}
              </div>
            </div>
          </div>

          {productTitles.length > 0 && (
            <div className="settings-preview">
              <h4>Project Titles ({productTitles.length}):</h4>
              <ul style={{ display: 'grid', gap: 8, margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                {productTitles.map((title, index) => {
                  const titleLogo = readProjectTitleLogos()[title]
                  return (
                    <li key={title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#fff', boxShadow: '0 1px 4px rgba(20,35,55,.08)', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {index === 0 && <span style={{ color: '#27ae60' }}>★ default</span>}
                        {titleLogo
                          ? <img src={titleLogo} alt={title} style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 6, border: '1px solid #dee2e6' }} />
                          : <span style={{ fontSize: '1.1rem' }}>🏷️</span>}
                        {title}
                      </span>
                      <PdfAttachmentField
                        label={`${title} project document`}
                        value={projectDocuments[title] || ''}
                        onChange={pdf => handleProjectDocumentChange(title, pdf)}
                      />
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <label className="ebc-btn" style={{ padding: '4px 10px', cursor: 'pointer', background: '#e3f2fd', color: '#1565c0' }}>
                          {titleLogo ? 'Change Logo' : 'Add Logo'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleTitleLogoUpload(title, e)} />
                        </label>
                        {titleLogo && (
                          <button type="button" className="ebc-btn clear" style={{ padding: '4px 10px' }} onClick={() => handleRemoveTitleLogo(title)}>Remove Logo</button>
                        )}
                        <button type="button" className="ebc-btn clear" style={{ padding: '4px 10px' }} onClick={() => handleRemoveProductTitle(title)}>🗑️ Remove</button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Usage Instructions */}
        <div className="settings-info-card">
          <h4>ℹ️ How to Use</h4>
          <ol className="settings-info-list">
            <li><strong>Individual Registration:</strong> Set defaults above, then use "⚡ Use Defaults" button in Individual Registration form</li>
            <li><strong>Organization Registration:</strong> Set defaults above, then use "⚡ Use Defaults" button in Organization form</li>
            <li>Each form type has separate default values</li>
            <li>Default staff is shared between both forms (set in Staff Management tab)</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   EBC HOME TAB
───────────────────────────────────────────────── */
function EbcHomeTab() {
  const stats = [
    { icon: '📝', label: 'Registrations', value: '—', color: '#c41e3a' },
    { icon: '💰', label: 'Commissions',   value: '—', color: '#f39c12' },
    { icon: '🏠', label: 'Room Bookings', value: '—', color: '#27ae60' },
    { icon: '🚗', label: 'Car Rentals',   value: '—', color: '#2980b9' },
  ]
  const quickLinks = [
    { icon: '📝', label: 'New Registration',    color: '#c41e3a', desc: 'Register individual client' },
    { icon: '🏢', label: 'New Organization',    color: '#01baef', desc: 'Register organization client' },
    { icon: '📊', label: 'View Reports',        color: '#2980b9', desc: 'View all payment reports' },
    { icon: '💼', label: 'Fixed Commission',    color: '#f39c12', desc: 'Manage fixed commissions' },
    { icon: '📈', label: 'Movable Commission',  color: '#e67e22', desc: 'Manage variable commissions' },
    { icon: '🤝', label: 'Brokerage',           color: '#8e44ad', desc: 'Manage brokerage contracts' },
    { icon: '🛏️', label: 'Room Booking',        color: '#27ae60', desc: 'Reserve and manage rooms' },
    { icon: '🚗', label: 'Logistics / Car Rent',color: '#16a085', desc: 'Vehicle rental management' },
  ]
  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)' }}>
        <span className="ebc-tab-hero-icon">🏦</span>
        <div><h2>Project Data Dashboard</h2><p>Overview of all project operations and quick access</p></div>
      </div>
      <div className="home-content">
        {/* Stats Row */}
        <div className="home-stats-grid">
          {stats.map((s, i) => (
            <div key={i} className="home-stat-card" style={{ borderTop: `4px solid ${s.color}` }}>
              <div className="home-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <div className="home-stat-value">{s.value}</div>
              <div className="home-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        {/* Quick Access */}
        <div className="home-section">
          <h3 className="home-section-title">⚡ Quick Access</h3>
          <div className="home-quick-grid">
            {quickLinks.map((q, i) => (
              <div key={i} className="home-quick-card" style={{ '--qcolor': q.color }}>
                <div className="home-quick-icon">{q.icon}</div>
                <div className="home-quick-label">{q.label}</div>
                <div className="home-quick-desc">{q.desc}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Info */}
        <div className="home-info-card">
          <div className="home-info-icon">ℹ️</div>
          <div>
            <strong>EBC DATA Management System</strong>
            <p>Use the sidebar tabs to navigate between Registration, Reports, Staff, Commission, Room Booking, and Logistics sections.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   FIXED COMMISSION TAB
───────────────────────────────────────────────── */
function EbcFixedCommissionTab() {
  const emptyForm = { clientName: '', propertyType: '', propertyAddress: '', propertyValue: '', commissionRate: '', commissionAmount: '', paymentDate: '', staffName: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [records, setRecords] = useState([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const PROPERTY_TYPES = ['Apartment', 'Villa', 'Office', 'Warehouse', 'Shop', 'Land', 'Other']

  const handleChange = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const handleCalc = () => {
    if (form.propertyValue && form.commissionRate) {
      const amt = (parseFloat(form.propertyValue) * parseFloat(form.commissionRate) / 100).toFixed(2)
      setForm(p => ({ ...p, commissionAmount: amt }))
    }
  }

  const handleSave = () => {
    if (!form.clientName.trim() || !form.propertyAddress.trim()) { setError('Client Name and Property Address are required'); return }
    const rec = { ...form, id: Date.now(), date: new Date().toLocaleDateString() }
    setRecords(p => [rec, ...p])
    setForm(emptyForm)
    setSaved(true)
    setError(null)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#f39c12,#e67e22)' }}>
        <span className="ebc-tab-hero-icon">💼</span>
        <div><h2>Fixed Commission</h2><p>Manage fixed-rate property commission contracts</p></div>
      </div>
      <div className="comm-content">
        <div className="comm-form-card">
          <h3>📋 New Fixed Commission Entry</h3>
          {error && <div className="ebc-status-pill error">⚠️ {error}</div>}
          {saved && <div className="ebc-status-pill confirmed">✅ Commission record saved!</div>}
          <div className="comm-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Client Name / ደንበኛ ስም</label>
              <input className="ebc-input" placeholder="Full name..." value={form.clientName} onChange={e => handleChange('clientName', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Property Type</label>
              <select className="ebc-select" value={form.propertyType} onChange={e => handleChange('propertyType', e.target.value)}>
                <option value="">— Select Type —</option>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ebc-field-group comm-full">
              <label className="ebc-label">Property Address / አድራሻ</label>
              <input className="ebc-input" placeholder="Property address..." value={form.propertyAddress} onChange={e => handleChange('propertyAddress', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Property Value (ETB)</label>
              <input className="ebc-input" type="number" placeholder="0.00" value={form.propertyValue} onChange={e => handleChange('propertyValue', e.target.value)} onBlur={handleCalc} min="0" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Commission Rate (%)</label>
              <input className="ebc-input" type="number" placeholder="e.g. 2.5" value={form.commissionRate} onChange={e => handleChange('commissionRate', e.target.value)} onBlur={handleCalc} min="0" max="100" step="0.1" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Commission Amount (ETB)</label>
              <input className="ebc-input" type="number" placeholder="Auto-calculated" value={form.commissionAmount} onChange={e => handleChange('commissionAmount', e.target.value)} style={{ background: '#fffde7', borderColor: '#f39c12', fontWeight: 700 }} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Payment Date</label>
              <input className="ebc-input" type="date" value={form.paymentDate} onChange={e => handleChange('paymentDate', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Staff / ሠራተኛ</label>
              <input className="ebc-input" placeholder="Staff name..." value={form.staffName} onChange={e => handleChange('staffName', e.target.value)} />
            </div>
            <div className="ebc-field-group comm-full">
              <label className="ebc-label">Notes <span className="ebc-label-optional">Optional</span></label>
              <textarea className="ebc-input" rows={2} placeholder="Additional notes..." value={form.notes} onChange={e => handleChange('notes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div className="ebc-form-actions">
            <button className="ebc-btn save" onClick={handleSave}>💾 Save Commission</button>
            <button className="ebc-btn clear" onClick={() => { setForm(emptyForm); setError(null) }}>🗑️ Clear</button>
          </div>
        </div>

        {/* Records List */}
        {records.length > 0 && (
          <div className="comm-list-card">
            <h3>📊 Commission Records ({records.length})</h3>
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead><tr><th>Client</th><th>Type</th><th>Value (ETB)</th><th>Rate</th><th>Commission</th><th>Date</th><th>Staff</th></tr></thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td>{r.clientName}</td><td>{r.propertyType || '—'}</td>
                      <td>{r.propertyValue ? `ETB ${parseFloat(r.propertyValue).toLocaleString()}` : '—'}</td>
                      <td>{r.commissionRate ? `${r.commissionRate}%` : '—'}</td>
                      <td className="comm-amount">ETB {parseFloat(r.commissionAmount || 0).toLocaleString()}</td>
                      <td>{r.paymentDate || r.date}</td><td>{r.staffName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MOVABLE COMMISSION TAB
───────────────────────────────────────────────── */
function EbcMovableCommissionTab() {
  const emptyForm = { clientName: '', propertyType: '', fromAddress: '', toAddress: '', distance: '', baseRate: '', extraRate: '', totalAmount: '', moveDate: '', staffName: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [records, setRecords] = useState([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const handleCalc = () => {
    if (form.distance && form.baseRate) {
      const total = (parseFloat(form.distance) * parseFloat(form.baseRate) + parseFloat(form.extraRate || 0)).toFixed(2)
      setForm(p => ({ ...p, totalAmount: total }))
    }
  }

  const handleSave = () => {
    if (!form.clientName.trim() || !form.fromAddress.trim()) { setError('Client Name and From Address are required'); return }
    setRecords(p => [{ ...form, id: Date.now(), date: new Date().toLocaleDateString() }, ...p])
    setForm(emptyForm); setSaved(true); setError(null)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#e67e22,#d35400)' }}>
        <span className="ebc-tab-hero-icon">📈</span>
        <div><h2>Movable Commission</h2><p>Track variable/movable property commission transactions</p></div>
      </div>
      <div className="comm-content">
        <div className="comm-form-card">
          <h3>🔄 New Movable Commission Entry</h3>
          {error && <div className="ebc-status-pill error">⚠️ {error}</div>}
          {saved && <div className="ebc-status-pill confirmed">✅ Record saved!</div>}
          <div className="comm-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Client Name / ደንበኛ ስም</label>
              <input className="ebc-input" placeholder="Full name..." value={form.clientName} onChange={e => handleChange('clientName', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Property Type</label>
              <input className="ebc-input" placeholder="e.g. Furniture, Equipment..." value={form.propertyType} onChange={e => handleChange('propertyType', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">From Address / ከ</label>
              <input className="ebc-input" placeholder="Origin address..." value={form.fromAddress} onChange={e => handleChange('fromAddress', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">To Address / ወደ</label>
              <input className="ebc-input" placeholder="Destination address..." value={form.toAddress} onChange={e => handleChange('toAddress', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Distance (km)</label>
              <input className="ebc-input" type="number" placeholder="0" value={form.distance} onChange={e => handleChange('distance', e.target.value)} onBlur={handleCalc} min="0" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Base Rate (ETB/km)</label>
              <input className="ebc-input" type="number" placeholder="0.00" value={form.baseRate} onChange={e => handleChange('baseRate', e.target.value)} onBlur={handleCalc} min="0" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Extra Charges (ETB) <span className="ebc-label-optional">Optional</span></label>
              <input className="ebc-input" type="number" placeholder="0.00" value={form.extraRate} onChange={e => handleChange('extraRate', e.target.value)} onBlur={handleCalc} min="0" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Total Amount (ETB)</label>
              <input className="ebc-input" type="number" placeholder="Auto-calculated" value={form.totalAmount} onChange={e => handleChange('totalAmount', e.target.value)} style={{ background: '#fff3e0', borderColor: '#e67e22', fontWeight: 700 }} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Move Date</label>
              <input className="ebc-input" type="date" value={form.moveDate} onChange={e => handleChange('moveDate', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Staff / ሠራተኛ</label>
              <input className="ebc-input" placeholder="Staff name..." value={form.staffName} onChange={e => handleChange('staffName', e.target.value)} />
            </div>
          </div>
          <div className="ebc-form-actions">
            <button className="ebc-btn new-entry" onClick={handleSave}>💾 Save Record</button>
            <button className="ebc-btn clear" onClick={() => { setForm(emptyForm); setError(null) }}>🗑️ Clear</button>
          </div>
        </div>
        {records.length > 0 && (
          <div className="comm-list-card">
            <h3>📊 Movable Commission Records ({records.length})</h3>
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead><tr><th>Client</th><th>From</th><th>To</th><th>Dist (km)</th><th>Total (ETB)</th><th>Date</th><th>Staff</th></tr></thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td>{r.clientName}</td><td>{r.fromAddress}</td><td>{r.toAddress}</td>
                      <td>{r.distance || '—'}</td>
                      <td className="comm-amount">ETB {parseFloat(r.totalAmount || 0).toLocaleString()}</td>
                      <td>{r.moveDate || r.date}</td><td>{r.staffName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   BROKERAGE TAB
───────────────────────────────────────────────── */
function EbcBrokerageTab() {
  const emptyForm = { contractNo: '', sellerName: '', buyerName: '', propertyAddress: '', propertyType: '', salePrice: '', brokerageRate: '', brokerageAmount: '', contractDate: '', status: 'pending', staffName: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [records, setRecords] = useState([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const PROPERTY_TYPES = ['Apartment', 'Villa', 'Office', 'Warehouse', 'Shop', 'Land', 'Other']
  const STATUS_OPTIONS = [{ value: 'pending', label: '⏳ Pending' }, { value: 'active', label: '✅ Active' }, { value: 'completed', label: '🎉 Completed' }, { value: 'cancelled', label: '❌ Cancelled' }]

  const handleChange = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const handleCalc = () => {
    if (form.salePrice && form.brokerageRate) {
      const amt = (parseFloat(form.salePrice) * parseFloat(form.brokerageRate) / 100).toFixed(2)
      setForm(p => ({ ...p, brokerageAmount: amt }))
    }
  }

  const handleSave = () => {
    if (!form.sellerName.trim() || !form.buyerName.trim()) { setError('Seller and Buyer names are required'); return }
    const no = form.contractNo || `BRK-${Date.now().toString().slice(-6)}`
    setRecords(p => [{ ...form, contractNo: no, id: Date.now(), date: new Date().toLocaleDateString() }, ...p])
    setForm({ ...emptyForm, contractNo: '' }); setSaved(true); setError(null)
    setTimeout(() => setSaved(false), 3000)
  }

  const statusColor = { pending: '#f39c12', active: '#27ae60', completed: '#2980b9', cancelled: '#e74c3c' }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#8e44ad,#6c3483)' }}>
        <span className="ebc-tab-hero-icon">🤝</span>
        <div><h2>Brokerage</h2><p>Manage property brokerage contracts between buyers and sellers</p></div>
      </div>
      <div className="comm-content">
        <div className="comm-form-card">
          <h3>📄 New Brokerage Contract</h3>
          {error && <div className="ebc-status-pill error">⚠️ {error}</div>}
          {saved && <div className="ebc-status-pill confirmed">✅ Contract saved!</div>}
          <div className="comm-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Contract No <span className="ebc-label-optional">Auto</span></label>
              <input className="ebc-input" placeholder="Auto-generated..." value={form.contractNo} onChange={e => handleChange('contractNo', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Status</label>
              <select className="ebc-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Seller Name / ሻጭ</label>
              <input className="ebc-input" placeholder="Seller full name..." value={form.sellerName} onChange={e => handleChange('sellerName', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Buyer Name / ገዢ</label>
              <input className="ebc-input" placeholder="Buyer full name..." value={form.buyerName} onChange={e => handleChange('buyerName', e.target.value)} />
            </div>
            <div className="ebc-field-group comm-full">
              <label className="ebc-label">Property Address / አድራሻ</label>
              <input className="ebc-input" placeholder="Property address..." value={form.propertyAddress} onChange={e => handleChange('propertyAddress', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Property Type</label>
              <select className="ebc-select" value={form.propertyType} onChange={e => handleChange('propertyType', e.target.value)}>
                <option value="">— Select —</option>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Sale Price (ETB)</label>
              <input className="ebc-input" type="number" placeholder="0.00" value={form.salePrice} onChange={e => handleChange('salePrice', e.target.value)} onBlur={handleCalc} min="0" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Brokerage Rate (%)</label>
              <input className="ebc-input" type="number" placeholder="e.g. 3" value={form.brokerageRate} onChange={e => handleChange('brokerageRate', e.target.value)} onBlur={handleCalc} min="0" max="100" step="0.1" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Brokerage Amount (ETB)</label>
              <input className="ebc-input" type="number" placeholder="Auto-calculated" value={form.brokerageAmount} onChange={e => handleChange('brokerageAmount', e.target.value)} style={{ background: '#f3e5f5', borderColor: '#8e44ad', fontWeight: 700 }} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Contract Date</label>
              <input className="ebc-input" type="date" value={form.contractDate} onChange={e => handleChange('contractDate', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Staff / ሠራተኛ</label>
              <input className="ebc-input" placeholder="Staff name..." value={form.staffName} onChange={e => handleChange('staffName', e.target.value)} />
            </div>
            <div className="ebc-field-group comm-full">
              <label className="ebc-label">Notes <span className="ebc-label-optional">Optional</span></label>
              <textarea className="ebc-input" rows={2} placeholder="Additional notes..." value={form.notes} onChange={e => handleChange('notes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div className="ebc-form-actions">
            <button className="ebc-btn edit" onClick={handleSave}>💾 Save Contract</button>
            <button className="ebc-btn clear" onClick={() => { setForm(emptyForm); setError(null) }}>🗑️ Clear</button>
          </div>
        </div>
        {records.length > 0 && (
          <div className="comm-list-card">
            <h3>📊 Brokerage Contracts ({records.length})</h3>
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead><tr><th>Contract No</th><th>Seller</th><th>Buyer</th><th>Sale Price</th><th>Brokerage</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td><span className="ebc-search-regid">{r.contractNo}</span></td>
                      <td>{r.sellerName}</td><td>{r.buyerName}</td>
                      <td>ETB {parseFloat(r.salePrice || 0).toLocaleString()}</td>
                      <td className="comm-amount">ETB {parseFloat(r.brokerageAmount || 0).toLocaleString()}</td>
                      <td>{r.contractDate || r.date}</td>
                      <td><span className="ebc-status-dot" style={{ background: statusColor[r.status], color: '#fff', padding: '3px 10px', borderRadius: 20, fontSize: '.78rem' }}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   ROOM BOOKING TAB
───────────────────────────────────────────────── */
function EbcRoomBookingTab() {
  const emptyForm = { guestName: '', guestPhone: '', roomNo: '', roomType: '', checkIn: '', checkOut: '', nights: '', ratePerNight: '', totalAmount: '', status: 'reserved', staffName: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [records, setRecords] = useState([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const ROOM_TYPES = ['Single', 'Double', 'Twin', 'Suite', 'Deluxe', 'Family', 'Conference']
  const STATUS_OPTIONS = [{ value: 'reserved', label: '📅 Reserved' }, { value: 'checked_in', label: '✅ Checked In' }, { value: 'checked_out', label: '🚪 Checked Out' }, { value: 'cancelled', label: '❌ Cancelled' }]

  const handleChange = (f, v) => {
    setForm(p => {
      const next = { ...p, [f]: v }
      if ((f === 'checkIn' || f === 'checkOut') && next.checkIn && next.checkOut) {
        const diff = Math.ceil((new Date(next.checkOut) - new Date(next.checkIn)) / 86400000)
        next.nights = diff > 0 ? diff : ''
        if (next.ratePerNight) next.totalAmount = (diff * parseFloat(next.ratePerNight)).toFixed(2)
      }
      if (f === 'ratePerNight' && next.nights) {
        next.totalAmount = (parseFloat(v || 0) * parseInt(next.nights)).toFixed(2)
      }
      return next
    })
  }

  const handleSave = () => {
    if (!form.guestName.trim() || !form.roomNo.trim()) { setError('Guest Name and Room No are required'); return }
    setRecords(p => [{ ...form, id: Date.now(), bookingDate: new Date().toLocaleDateString() }, ...p])
    setForm(emptyForm); setSaved(true); setError(null)
    setTimeout(() => setSaved(false), 3000)
  }

  const statusColor = { reserved: '#f39c12', checked_in: '#27ae60', checked_out: '#2980b9', cancelled: '#e74c3c' }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#27ae60,#1e8449)' }}>
        <span className="ebc-tab-hero-icon">🛏️</span>
        <div><h2>Room Booking</h2><p>Reserve and manage room bookings for guests</p></div>
      </div>
      <div className="comm-content">
        <div className="comm-form-card">
          <h3>🛏️ New Room Booking</h3>
          {error && <div className="ebc-status-pill error">⚠️ {error}</div>}
          {saved && <div className="ebc-status-pill confirmed">✅ Booking saved!</div>}
          <div className="comm-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Guest Name / እንግዳ ስም</label>
              <input className="ebc-input" placeholder="Guest full name..." value={form.guestName} onChange={e => handleChange('guestName', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Guest Phone</label>
              <input className="ebc-input" placeholder="+251 9XX XXX XXX" value={form.guestPhone} onChange={e => handleChange('guestPhone', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Room No / ክፍል ቁጥር</label>
              <input className="ebc-input" placeholder="e.g. 101" value={form.roomNo} onChange={e => handleChange('roomNo', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Room Type</label>
              <select className="ebc-select" value={form.roomType} onChange={e => handleChange('roomType', e.target.value)}>
                <option value="">— Select Type —</option>
                {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Check-In Date</label>
              <input className="ebc-input" type="date" value={form.checkIn} onChange={e => handleChange('checkIn', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Check-Out Date</label>
              <input className="ebc-input" type="date" value={form.checkOut} onChange={e => handleChange('checkOut', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Nights</label>
              <input className="ebc-input" type="number" placeholder="Auto-calc" value={form.nights} readOnly style={{ background: '#f0f4f8' }} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Rate / Night (ETB)</label>
              <input className="ebc-input" type="number" placeholder="0.00" value={form.ratePerNight} onChange={e => handleChange('ratePerNight', e.target.value)} min="0" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Total Amount (ETB)</label>
              <input className="ebc-input" type="number" placeholder="Auto-calculated" value={form.totalAmount} onChange={e => handleChange('totalAmount', e.target.value)} style={{ background: '#e8f5e9', borderColor: '#27ae60', fontWeight: 700 }} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Status</label>
              <select className="ebc-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Staff / ሠራተኛ</label>
              <input className="ebc-input" placeholder="Staff name..." value={form.staffName} onChange={e => handleChange('staffName', e.target.value)} />
            </div>
            <div className="ebc-field-group comm-full">
              <label className="ebc-label">Notes <span className="ebc-label-optional">Optional</span></label>
              <textarea className="ebc-input" rows={2} placeholder="Special requests..." value={form.notes} onChange={e => handleChange('notes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div className="ebc-form-actions">
            <button className="ebc-btn confirm-paid" onClick={handleSave}>💾 Save Booking</button>
            <button className="ebc-btn clear" onClick={() => { setForm(emptyForm); setError(null) }}>🗑️ Clear</button>
          </div>
        </div>
        {records.length > 0 && (
          <div className="comm-list-card">
            <h3>📊 Room Bookings ({records.length})</h3>
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead><tr><th>Guest</th><th>Room</th><th>Type</th><th>Check-In</th><th>Check-Out</th><th>Nights</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td>{r.guestName}</td><td>{r.roomNo}</td><td>{r.roomType || '—'}</td>
                      <td>{r.checkIn || '—'}</td><td>{r.checkOut || '—'}</td>
                      <td>{r.nights || '—'}</td>
                      <td className="comm-amount">ETB {parseFloat(r.totalAmount || 0).toLocaleString()}</td>
                      <td><span style={{ background: statusColor[r.status], color: '#fff', padding: '3px 10px', borderRadius: 20, fontSize: '.78rem', whiteSpace: 'nowrap' }}>{r.status.replace('_', ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   LOGISTICS / CAR RENT TAB
───────────────────────────────────────────────── */
function EbcLogisticsTab() {
  const emptyForm = { clientName: '', clientPhone: '', vehicleType: '', plateNo: '', driverName: '', driverPhone: '', fromLocation: '', toLocation: '', rentalDays: '', dailyRate: '', fuelIncluded: 'yes', totalAmount: '', startDate: '', endDate: '', status: 'booked', staffName: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [records, setRecords] = useState([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const VEHICLE_TYPES = ['Sedan', 'SUV', 'Minibus', 'Bus', 'Truck', 'Pickup', 'Van', 'Motorcycle']
  const STATUS_OPTIONS = [{ value: 'booked', label: '📅 Booked' }, { value: 'active', label: '🚗 Active' }, { value: 'returned', label: '✅ Returned' }, { value: 'cancelled', label: '❌ Cancelled' }]

  const handleChange = (f, v) => {
    setForm(p => {
      const next = { ...p, [f]: v }
      if ((f === 'startDate' || f === 'endDate') && next.startDate && next.endDate) {
        const diff = Math.ceil((new Date(next.endDate) - new Date(next.startDate)) / 86400000)
        next.rentalDays = diff > 0 ? diff : ''
        if (next.dailyRate) next.totalAmount = (diff * parseFloat(next.dailyRate)).toFixed(2)
      }
      if (f === 'dailyRate' && next.rentalDays) {
        next.totalAmount = (parseFloat(v || 0) * parseInt(next.rentalDays)).toFixed(2)
      }
      return next
    })
  }

  const handleSave = () => {
    if (!form.clientName.trim() || !form.vehicleType) { setError('Client Name and Vehicle Type are required'); return }
    setRecords(p => [{ ...form, id: Date.now(), bookingDate: new Date().toLocaleDateString() }, ...p])
    setForm(emptyForm); setSaved(true); setError(null)
    setTimeout(() => setSaved(false), 3000)
  }

  const statusColor = { booked: '#f39c12', active: '#27ae60', returned: '#2980b9', cancelled: '#e74c3c' }

  return (
    <div className="ebc-tab-content">
      <div className="ebc-tab-hero" style={{ background: 'linear-gradient(135deg,#16a085,#0e6655)' }}>
        <span className="ebc-tab-hero-icon">🚗</span>
        <div><h2>Logistics / Car Rent</h2><p>Vehicle rental and logistics management</p></div>
      </div>
      <div className="comm-content">
        <div className="comm-form-card">
          <h3>🚗 New Vehicle Rental</h3>
          {error && <div className="ebc-status-pill error">⚠️ {error}</div>}
          {saved && <div className="ebc-status-pill confirmed">✅ Rental saved!</div>}
          <div className="comm-form-grid">
            <div className="ebc-field-group">
              <label className="ebc-label">Client Name / ደንበኛ</label>
              <input className="ebc-input" placeholder="Client full name..." value={form.clientName} onChange={e => handleChange('clientName', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Client Phone</label>
              <input className="ebc-input" placeholder="+251 9XX XXX XXX" value={form.clientPhone} onChange={e => handleChange('clientPhone', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Vehicle Type</label>
              <select className="ebc-select" value={form.vehicleType} onChange={e => handleChange('vehicleType', e.target.value)}>
                <option value="">— Select Vehicle —</option>
                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Plate No / ሰሌዳ</label>
              <input className="ebc-input" placeholder="e.g. AA-12345" value={form.plateNo} onChange={e => handleChange('plateNo', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Driver Name <span className="ebc-label-optional">Optional</span></label>
              <input className="ebc-input" placeholder="Driver full name..." value={form.driverName} onChange={e => handleChange('driverName', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Driver Phone</label>
              <input className="ebc-input" placeholder="+251 9XX XXX XXX" value={form.driverPhone} onChange={e => handleChange('driverPhone', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">From / ከ</label>
              <input className="ebc-input" placeholder="Pickup location..." value={form.fromLocation} onChange={e => handleChange('fromLocation', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">To / ወደ</label>
              <input className="ebc-input" placeholder="Drop-off location..." value={form.toLocation} onChange={e => handleChange('toLocation', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Start Date</label>
              <input className="ebc-input" type="date" value={form.startDate} onChange={e => handleChange('startDate', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">End Date</label>
              <input className="ebc-input" type="date" value={form.endDate} onChange={e => handleChange('endDate', e.target.value)} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Rental Days</label>
              <input className="ebc-input" type="number" placeholder="Auto-calc" value={form.rentalDays} readOnly style={{ background: '#f0f4f8' }} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Daily Rate (ETB)</label>
              <input className="ebc-input" type="number" placeholder="0.00" value={form.dailyRate} onChange={e => handleChange('dailyRate', e.target.value)} min="0" />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Fuel Included?</label>
              <select className="ebc-select" value={form.fuelIncluded} onChange={e => handleChange('fuelIncluded', e.target.value)}>
                <option value="yes">✅ Yes</option>
                <option value="no">❌ No</option>
              </select>
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Total Amount (ETB)</label>
              <input className="ebc-input" type="number" placeholder="Auto-calculated" value={form.totalAmount} onChange={e => handleChange('totalAmount', e.target.value)} style={{ background: '#e0f2f1', borderColor: '#16a085', fontWeight: 700 }} />
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Status</label>
              <select className="ebc-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="ebc-field-group">
              <label className="ebc-label">Staff / ሠራተኛ</label>
              <input className="ebc-input" placeholder="Staff name..." value={form.staffName} onChange={e => handleChange('staffName', e.target.value)} />
            </div>
            <div className="ebc-field-group comm-full">
              <label className="ebc-label">Notes <span className="ebc-label-optional">Optional</span></label>
              <textarea className="ebc-input" rows={2} placeholder="Additional notes..." value={form.notes} onChange={e => handleChange('notes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div className="ebc-form-actions">
            <button className="ebc-btn save" style={{ background: 'linear-gradient(135deg,#16a085,#0e6655)' }} onClick={handleSave}>💾 Save Rental</button>
            <button className="ebc-btn clear" onClick={() => { setForm(emptyForm); setError(null) }}>🗑️ Clear</button>
          </div>
        </div>
        {records.length > 0 && (
          <div className="comm-list-card">
            <h3>📊 Vehicle Rentals ({records.length})</h3>
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead><tr><th>Client</th><th>Vehicle</th><th>Plate</th><th>From</th><th>To</th><th>Days</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td>{r.clientName}</td><td>{r.vehicleType}</td><td>{r.plateNo || '—'}</td>
                      <td>{r.fromLocation || '—'}</td><td>{r.toLocation || '—'}</td>
                      <td>{r.rentalDays || '—'}</td>
                      <td className="comm-amount">ETB {parseFloat(r.totalAmount || 0).toLocaleString()}</td>
                      <td><span style={{ background: statusColor[r.status], color: '#fff', padding: '3px 10px', borderRadius: 20, fontSize: '.78rem', whiteSpace: 'nowrap' }}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────── */
function DataCollect({ openDataMenuRequest = 0 }) {
  const { t } = useTranslation()

  // ── Data Menu modal
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [activeTab,   setActiveTab]   = useState(null)

  // ── EBC DATA modal
  const [ebcOpen,     setEbcOpen]     = useState(() => readStoredFilter('ebc_modal_open') === 'true')
  const [ebcTab,      setEbcTab]      = useState(() => {
    const savedTab = readStoredFilter('ebc_modal_tab', 'registration')
    if (savedTab === 'report') return 'results'
    return ['registration', 'results', 'staff', 'organization', 'setting'].includes(savedTab)
      ? savedTab
      : 'registration'
  })

  // ── EBC Registration search state (hoisted to main for header access)
  const [searchQuery,   setSearchQuery]   = useState(() => readStoredFilter('ebc_search_query'))
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchNoResult,setSearchNoResult]= useState(false)
  const [searchError, setSearchError] = useState('')
  const searchRequestRef = useRef(0)

  useEffect(() => {
    writeStoredFilter('ebc_modal_open', String(ebcOpen))
  }, [ebcOpen])

  useEffect(() => {
    writeStoredFilter('ebc_modal_tab', ebcTab)
  }, [ebcTab])

  useEffect(() => {
    writeStoredFilter('ebc_search_query', searchQuery)
  }, [searchQuery])

  const handleSearch = async () => {
    const requestId = ++searchRequestRef.current
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      setSearchResults([])
      setSearchNoResult(false)
      setSearchError('')
      setSearchLoading(false)
      return
    }
    setSearchLoading(true); setSearchNoResult(false); setSearchError('')
    try {
      const { dataRegistrationAPI } = await import('../../services/api.js')
      const res  = await dataRegistrationAPI.getAllRegistrations()
      const list = res?.data || res?.registrations || []
      const hits = list.filter(r =>
        [
          r.client_name,
          r.client_phone,
          r.kebele,
          r.receipt_no,
          r.staff_username,
          r.staff_full_name,
          r.house_no,
          r.paid_amount != null ? String(r.paid_amount) : '',
          r.payment_period_type,
          r.payment_status,
          r.city,
          r.work_type,
          r.client_email,
        ]
        .filter(Boolean)
        .some(val => String(val).toLowerCase().includes(q))
      )
      if (requestId === searchRequestRef.current) {
        setSearchResults(hits)
        setSearchNoResult(hits.length === 0)
      }
    } catch (err) { 
      if (requestId === searchRequestRef.current) {
        setSearchResults([])
        setSearchNoResult(false)
        setSearchError(err.message || 'Could not load registrations.')
      }
    }
    finally  {
      if (requestId === searchRequestRef.current) setSearchLoading(false)
    }
  }

  // Auto-search on query change (debounced)
  useEffect(() => {
    searchRequestRef.current += 1
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch()
      } else {
        searchRequestRef.current += 1
        setSearchResults([])
        setSearchNoResult(false)
        setSearchError('')
        setSearchLoading(false)
      }
    }, 300) // 300ms debounce
    return () => clearTimeout(timer)
  }, [searchQuery])

  // EBC_TABS - moved inside component to pass search props
  const EBC_TABS = [
    { id: 'registration',    icon: '📝',  label: 'Registration',      color: '#c41e3a', component: <EbcRegistrationTab searchResults={searchResults} searchNoResult={searchNoResult} searchQuery={searchQuery} searchError={searchError} /> },
    { id: 'results',         icon: '📊',  label: 'Results',           color: '#2980b9', component: <EbcResultsTab /> },
    { id: 'staff',           icon: '👥',  label: 'Staff',             color: '#8e44ad', component: <EbcStaffTab /> },
    { id: 'organization',    icon: '🏛️', label: 'Organization',      color: '#01baef', component: <EbcOrganizationTab /> },
    { id: 'setting',         icon: '⚙️',  label: 'Setting',           color: '#424242', component: <EbcSettingTab /> },
  ]

  /* ── Data Menu tabs from permissions */
  const tabs = [
    canAccessTab('dataRegistration') && {
      id: 'dataRegistration', icon: '📝',
      label: t('pages.dataCollect.startRegistration'),
      component: <DataRegistration />, color: '#c41e3a',
    },
    canAccessTab('randomPiadRegister') && {
      id: 'randomPiadRegister', icon: '🎲',
      label: t('pages.dataCollect.randomPiadRegister'),
      component: <RandomPiadRegister />, color: '#e67e22',
    },
    canAccessTab('randomPayer') && {
      id: 'randomPayer', icon: '💳',
      label: t('pages.dataCollect.randomPayerVoucher'),
      component: <RandomPayer />, color: '#27ae60',
    },
    canAccessTab('scanner') && {
      id: 'scanner', icon: '📷',
      label: t('pages.dataCollect.scanner'),
      component: <Scanner />, color: '#2980b9',
    },
    canAccessTab('payRegistration') && {
      id: 'payRegistration', icon: '💰',
      label: t('pages.dataCollect.payRegistration'),
      component: <PayRegistration />, color: '#8e44ad',
    },
    canAccessTab('registered') && {
      id: 'registered', icon: '📋',
      label: t('pages.dataCollect.registeredData'),
      component: <Registered />, color: '#16a085',
    },
    canAccessTab('needApproval') && {
      id: 'needApproval', icon: '⚠️',
      label: t('pages.dataCollect.needApproval'),
      component: <NeedApproval />, color: '#d35400',
    },
    canAccessTab('result') && {
      id: 'result', icon: '📊',
      label: t('pages.dataCollect.viewResults'),
      component: <Result />, color: '#667eea',
    },
    canAccessTab('paidRandomDataForm') && {
      id: 'paidRandomDataForm', icon: '📋',
      label: t('pages.dataCollect.paidRandomDataForm'),
      component: <PaidRandomDataForm />, color: '#1abc9c',
    },
  ].filter(Boolean)

  const openMenu = () => {
    if (!activeTab && tabs.length > 0) setActiveTab(tabs[0].id)
    setMenuOpen(true)
  }
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const openEbc = () => setEbcOpen(true)
  const closeEbc  = useCallback(() => setEbcOpen(false), [])

  useEffect(() => {
    if (openDataMenuRequest > 0) {
      if (!activeTab && tabs.length > 0) setActiveTab(tabs[0].id)
      setMenuOpen(true)
    }
  }, [openDataMenuRequest])

  /* Escape key — closes whichever modal is open */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { closeMenu(); closeEbc() }
    }
    if (menuOpen || ebcOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen, ebcOpen, closeMenu, closeEbc])

  /* Body scroll lock */
  useEffect(() => {
    document.body.style.overflow = (menuOpen || ebcOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen, ebcOpen])

  const currentMenuTab = tabs.find((tb) => tb.id === activeTab)
  const currentEbcTab  = EBC_TABS.find((tb) => tb.id === ebcTab)

  return (
    <div className="data-collect-page">

      {/* ══════════════════════════════════════
          HERO
      ══════════════════════════════════════ */}
      <section className="data-hero">
        <div className="hero-overlay" />
        <div className="container hero-content">
          <div className="hero-badge">
            <span className="badge-icon">📊</span>
            <span className="badge-text">{t('pages.dataCollect.title')}</span>
          </div>
          <h1 className="hero-title">{t('pages.dataCollect.title')}</h1>
          <p className="hero-subtitle">{t('pages.dataCollect.subtitle')}</p>

          {/* Project data remains available from the Data Collector page. */}
          <div className="hero-action-row">
            <button className="ebc-open-btn" onClick={openEbc}>
              <span className="ebc-open-icon">🗂️</span>
              <span>PROJECT DATA</span>
              <span className="ebc-open-arrow">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          DATA MENU MODAL
      ══════════════════════════════════════ */}
      {menuOpen && (
        <div
          className="dc-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeMenu() }}
          role="dialog"
          aria-modal="true"
          aria-label="Data Collection Menu"
        >
          <div className="dc-modal">
            <aside className="dc-sidebar">
              <div className="dc-sidebar-header">
                <span className="dc-sidebar-logo">📊</span>
                <div>
                  <div className="dc-sidebar-title">Data Menu</div>
                  <div className="dc-sidebar-sub">{tabs.length} sections</div>
                </div>
              </div>
              <nav className="dc-sidebar-nav">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`dc-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{ '--tab-color': tab.color }}
                  >
                    <span className="dc-tab-icon">{tab.icon}</span>
                    <span className="dc-tab-label">{tab.label}</span>
                    {activeTab === tab.id && <span className="dc-tab-indicator" />}
                  </button>
                ))}
              </nav>
            </aside>

            <div className="dc-content-pane">
              <div className="dc-pane-header">
                <div className="dc-pane-title">
                  <span>{currentMenuTab?.icon}</span>
                  <span>{currentMenuTab?.label}</span>
                </div>
                <button className="dc-close-btn" onClick={closeMenu} aria-label="Close">✕</button>
              </div>
              <div className="dc-pane-body" key={activeTab}>
                {currentMenuTab ? currentMenuTab.component : (
                  <div className="dc-empty-state">
                    <span>📂</span>
                    <p>Select a section from the left to get started.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          EBC DATA MODAL
      ══════════════════════════════════════ */}
      {ebcOpen && (
        <div
          className={`dc-modal-overlay ebc-overlay ${ebcTab === 'results' ? 'ebc-results-overlay' : ''}`}
          onClick={(e) => { if (e.target === e.currentTarget) closeEbc() }}
          role="dialog"
          aria-modal="true"
          aria-label="EBC Data"
        >
          <div className={`dc-modal ebc-modal ${ebcTab === 'results' ? 'ebc-results-open' : ''}`}>

            {/* ── EBC Left Sidebar ── */}
            <aside className="dc-sidebar ebc-sidebar">
              <div className="dc-sidebar-header ebc-sidebar-header">
                <div className="ebc-logo-wrap">
                  <span className="ebc-logo-icon">🏦</span>
                </div>
                <div>
                  <div className="dc-sidebar-title">PROJECT DATA</div>
                  <div className="dc-sidebar-sub">{EBC_TABS.length} Sections</div>
                </div>
              </div>

              <nav className="dc-sidebar-nav ebc-tabs-nav">
                {EBC_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className={`dc-tab-btn ebc-tab-btn ${ebcTab === tab.id ? 'active' : ''}`}
                    onClick={() => setEbcTab(tab.id)}
                    style={{ '--tab-color': tab.color }}
                    title={tab.label}
                  >
                    <span className="dc-tab-icon">{tab.icon}</span>
                    <span className="dc-tab-label">{tab.label}</span>
                    {ebcTab === tab.id && <span className="dc-tab-indicator" />}
                  </button>
                ))}
              </nav>
            </aside>

            {/* ── EBC Content Pane ── */}
            <div className="dc-content-pane ebc-content-pane">
              <div className="dc-pane-header ebc-pane-header"
                   style={{ borderBottom: `3px solid ${currentEbcTab?.color}` }}>
                <div className="dc-pane-title">
                  <span>{currentEbcTab?.icon}</span>
                  <span>{currentEbcTab?.label}</span>
                </div>
                <div className="ebc-header-right">
                  {/* Search engine - only show on Registration tab */}
                  {ebcTab === 'registration' && (
                    <div className="ebc-header-search">
                      <div className="ebc-header-search-input-wrap">
                        <input
                          className="ebc-header-search-input"
                          placeholder="Type to search..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        />
                        {searchLoading && <span className="ebc-header-search-spinner">⏳</span>}
                      </div>
                      {(searchResults.length > 0 || searchQuery.trim() || searchError) && (
                        <button className="ebc-header-search-clear" onClick={() => { searchRequestRef.current += 1; setSearchResults([]); setSearchQuery(''); setSearchNoResult(false); setSearchError(''); setSearchLoading(false) }}>
                          ✕ Clear
                        </button>
                      )}
                    </div>
                  )}
                  <span className="ebc-header-badge" style={{ background: currentEbcTab?.color }}>
                    EBC
                  </span>
                  <button className="dc-close-btn" onClick={closeEbc} aria-label="Close">✕</button>
                </div>
              </div>

              <div className="dc-pane-body" key={ebcTab}>
                {currentEbcTab ? currentEbcTab.component : (
                  <div className="dc-empty-state">
                    <span>📂</span>
                    <p>Select a tab from the left.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MAIN PAGE CONTENT
      ══════════════════════════════════════ */}
      <section className="data-content">
        <div className="container">

          <div className="intro-card">
            <div className="intro-icon"><span>💡</span></div>
            <div className="intro-text">
              <h2>{t('pages.dataCollect.efficientDataManagement')}</h2>
              <p>{t('pages.dataCollect.efficientDataDescription')}</p>
            </div>
          </div>

          <div className="features-section">
            <div className="section-header">
              <h2 className="section-title">{t('pages.dataCollect.ourServices')}</h2>
              <p className="section-subtitle">{t('pages.dataCollect.comprehensiveSolutions')}</p>
            </div>
            <div className="features-grid">
              {[
                { icon: '📊', title: t('pages.dataCollect.marketData'),        desc: t('pages.dataCollect.marketDataDesc'),        badge: 'Real-time' },
                { icon: '👥', title: t('pages.dataCollect.clientInformation'),  desc: t('pages.dataCollect.clientInformationDesc'),  badge: 'Secure'    },
                { icon: '📈', title: t('pages.dataCollect.performanceMetrics'), desc: t('pages.dataCollect.performanceMetricsDesc'), badge: 'Analytics' },
                { icon: '🔍', title: t('pages.dataCollect.researchData'),       desc: t('pages.dataCollect.researchDataDesc'),       badge: 'Insights'  },
                { icon: '💼', title: t('pages.dataCollect.transactionRecords'), desc: t('pages.dataCollect.transactionRecordsDesc'), badge: 'Detailed'  },
                { icon: '🔒', title: t('pages.dataCollect.secureStorage'),      desc: t('pages.dataCollect.secureStorageDesc'),      badge: 'Protected' },
              ].map((f, i) => (
                <div key={i} className="feature-card">
                  <div className="feature-icon-wrapper"><span className="feature-icon">{f.icon}</span></div>
                  <h3 className="feature-title">{f.title}</h3>
                  <p className="feature-description">{f.desc}</p>
                  <div className="feature-badge">{f.badge}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="benefits-section">
            <div className="benefits-content">
              <div className="benefits-header">
                <h2 className="section-title">{t('pages.dataCollect.whyChooseUs')}</h2>
                <p className="section-subtitle">{t('pages.dataCollect.industryLeading')}</p>
              </div>
              <div className="benefits-grid">
                {[
                  { icon: '⚡',  text: t('pages.dataCollect.automatedProcesses') },
                  { icon: '🔄',  text: t('pages.dataCollect.realTimeSync')       },
                  { icon: '🛡️', text: t('pages.dataCollect.secureHandling')     },
                  { icon: '🎨',  text: t('pages.dataCollect.customizableForms')  },
                  { icon: '📊',  text: t('pages.dataCollect.advancedAnalytics')  },
                  { icon: '🔗',  text: t('pages.dataCollect.systemIntegration')  },
                  { icon: '🌐',  text: t('pages.dataCollect.dataAccess')         },
                  { icon: '👨‍💼', text: t('pages.dataCollect.professionalSupport') },
                ].map((b, i) => (
                  <div key={i} className="benefit-item">
                    <span className="benefit-icon">{b.icon}</span>
                    <span className="benefit-text">{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="cta-section">
            <div className="cta-card">
              <div className="cta-content">
                <h2 className="cta-title">{t('pages.dataCollect.readyToStart')}</h2>
                <p className="cta-description">{t('pages.dataCollect.joinHundreds')}</p>
                <div className="cta-buttons">
                  <button className="cta-btn secondary" onClick={openEbc}>
                    <span>🗂️</span>PROJECT DATA
                  </button>
                </div>
              </div>
              <div className="cta-decoration">
                <div className="decoration-circle" />
                <div className="decoration-circle" />
                <div className="decoration-circle" />
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  )
}

export default DataCollect
