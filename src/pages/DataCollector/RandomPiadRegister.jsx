import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { userAPI, dataRegistrationAPI } from '../../services/api'
import { useTranslation } from '../../hooks/useTranslation'
import { useStaffList } from '../../hooks/useStaffList'
import EthiopianDateInput from '../../components/EthiopianDateInput'
import './RandomPiadRegister.css'

function RandomPiadRegister() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [workType, setWorkType] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [paidFilter, setPaidFilter] = useState('')
  const [notification, setNotification] = useState(null)
  const [registrationList, setRegistrationList] = useState([])
  const [filteredList, setFilteredList] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showSuggestions, setShowSuggestions] = useState({})
  const [activeSuggestionField, setActiveSuggestionField] = useState(null)
  const [currentRecordId, setCurrentRecordId] = useState(null)
  const [isUpdateMode, setIsUpdateMode] = useState(false)
  
  // Use staff list hook for mobile-optimized loading
  const { staffList, loading: staffLoading, error: staffError, refresh: refreshStaff, hasStaff } = useStaffList(true)
  
  const [formData, setFormData] = useState({
    payerName: '',
    city: 'Harar',
    kebele: '',
    houseNo: '',
    receiptNo: '',
    paymentPeriod: '2015-2018',
    paymentFrom: '2015',
    paymentTo: '2018',
    periodAmount: '120',
    fee: '320',
    total: '440',
    collectedAmount: '440',
    clientPhone: '',
    tvNo: '1',
    person: 'personal',
    condition: 'new',
    sign: 'sign',
    govLetter: 'accept',
    paidAmount: '',
    validDate: '',
    registrationDateTime: ''
  })

  // Form is always enabled - no dependencies
  const registrationEnabled = true

  // Load registration data on component mount
  useEffect(() => {
    loadRegistrationData()
  }, [])

  // Filter registration list based on filters, search term, and form inputs
  useEffect(() => {
    filterRegistrationList()
  }, [registrationList, periodFilter, paidFilter, searchTerm, formData])

  const loadRegistrationData = async () => {
    try {
      const response = await dataRegistrationAPI.getAllRegistrations()
      if (response.success) {
        setRegistrationList(response.data || [])
      }
    } catch (error) {
      console.error('Failed to load registration data:', error)
    }
  }

  const filterRegistrationList = () => {
    let filtered = [...registrationList]

    // Filter by period
    if (periodFilter) {
      filtered = filtered.filter(item => {
        const itemYear = new Date(item.registered_at).getFullYear().toString()
        return itemYear === periodFilter
      })
    }

    // Filter by payment status
    if (paidFilter) {
      filtered = filtered.filter(item => item.payment_status === paidFilter)
    }

    // Filter by search term (search in multiple fields)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(item => 
        (item.client_name && item.client_name.toLowerCase().includes(term)) ||
        (item.client_phone && item.client_phone.toLowerCase().includes(term)) ||
        (item.kebele && item.kebele.toLowerCase().includes(term)) ||
        (item.city && item.city.toLowerCase().includes(term)) ||
        (item.receipt_no && item.receipt_no.toLowerCase().includes(term))
      )
    }

    // Filter by form inputs (real-time filtering as user types)
    if (formData.payerName) {
      const name = formData.payerName.toLowerCase()
      filtered = filtered.filter(item => 
        item.client_name && item.client_name.toLowerCase().includes(name)
      )
    }

    if (formData.clientPhone) {
      const phone = formData.clientPhone.toLowerCase()
      filtered = filtered.filter(item => 
        item.client_phone && item.client_phone.toLowerCase().includes(phone)
      )
    }

    if (formData.city && formData.city !== 'Harar') {
      filtered = filtered.filter(item => 
        item.city && item.city.toLowerCase() === formData.city.toLowerCase()
      )
    }

    if (formData.kebele) {
      filtered = filtered.filter(item => 
        item.kebele && item.kebele.toLowerCase() === formData.kebele.toLowerCase()
      )
    }

    if (formData.receiptNo) {
      const receipt = formData.receiptNo.toLowerCase()
      filtered = filtered.filter(item => 
        item.receipt_no && item.receipt_no.toLowerCase().includes(receipt)
      )
    }

    if (formData.condition && formData.condition !== 'new') {
      filtered = filtered.filter(item => 
        item.condition && item.condition.toLowerCase() === formData.condition.toLowerCase()
      )
    }

    setFilteredList(filtered)
  }

  // Highlight matching text in list items
  const highlightText = (text, searchTerms) => {
    if (!text || !searchTerms.length) return text
    
    let highlightedText = text
    searchTerms.forEach(term => {
      if (term) {
        const regex = new RegExp(`(${term})`, 'gi')
        highlightedText = highlightedText.replace(regex, '<mark>$1</mark>')
      }
    })
    
    return highlightedText
  }

  // Get search terms from form inputs and search box
  const getSearchTerms = () => {
    const terms = []
    if (searchTerm) terms.push(searchTerm)
    if (formData.payerName) terms.push(formData.payerName)
    if (formData.clientPhone) terms.push(formData.clientPhone)
    if (formData.receiptNo) terms.push(formData.receiptNo)
    return terms
  }

  const handleAutoFill = (item) => {
    setFormData({
      payerName: item.client_name || '',
      city: item.city || 'Harar',
      kebele: item.kebele || '',
      houseNo: item.house_no || '',
      receiptNo: item.receipt_no || '',
      paymentPeriod: item.payment_period || '2014-2018',
      paymentFrom: item.payment_from || '2014',
      paymentTo: item.payment_to || '2018',
      periodAmount: item.period_amount || '120',
      fee: item.fee || '320',
      total: item.total || '440',
      collectedAmount: item.collected_amount || '440',
      clientPhone: item.client_phone || '',
      tvNo: item.tv_no || '1',
      person: item.person || 'personal',
      condition: item.condition || 'new',
      sign: item.sign || 'sign',
      govLetter: item.gov_letter || 'accept',
      paidAmount: item.paid_amount || '',
      validDate: item.valid_date || '',
      registrationDateTime: item.registration_datetime || ''
    })
    
    // Set record ID and update mode based on payment status
    setCurrentRecordId(item.id)
    setIsUpdateMode(item.payment_status === 'paid')
    
    // Also set the work type and staff if available
    if (item.work_type) setWorkType(item.work_type)
    if (item.staff_id) setSelectedStaff(item.staff_id.toString())
    
    showNotification('✓ Form auto-filled with selected data!', 'success')
  }

  // Manual staff refresh function
  const handleRefreshStaff = async () => {
    try {
      const result = await refreshStaff()
      if (result.success) {
        showNotification(`✅ Loaded ${result.data.length} staff members`, 'success')
      } else {
        showNotification(`❌ ${result.message}`, 'error')
      }
    } catch (error) {
      showNotification('❌ Failed to refresh staff: ' + error.message, 'error')
    }
  }

  const handleWorkTypeChange = (e) => {
    setWorkType(e.target.value)
  }

  const handleStaffChange = (e) => {
    setSelectedStaff(e.target.value)
  }

  const handlePeriodFilterChange = (e) => {
    setPeriodFilter(e.target.value)
  }

  const handlePaidFilterChange = (e) => {
    setPaidFilter(e.target.value)
  }

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    
    // Handle payment period change with auto-fill
    if (name === 'paymentPeriod') {
      if (value === '2015-2018') {
        // Auto-fill for 2015 to 2018 period
        setFormData({
          ...formData,
          [name]: value,
          paymentFrom: '2015',
          paymentTo: '2018',
          periodAmount: '120',
          fee: '320',
          total: '440',
          collectedAmount: '440'
        })
      } else if (value === 'custom') {
        // Clear all auto-filled values and make them editable
        setFormData({
          ...formData,
          [name]: value,
          paymentFrom: '',
          paymentTo: '',
          periodAmount: '',
          fee: '',
          total: '',
          collectedAmount: ''
        })
      }
    } else {
      setFormData({
        ...formData,
        [name]: value
      })
      
      // Show suggestions for specific fields when typing
      if (['payerName', 'clientPhone', 'receiptNo'].includes(name) && value.length > 0) {
        setActiveSuggestionField(name)
        setShowSuggestions({
          ...showSuggestions,
          [name]: true
        })
      } else {
        setShowSuggestions({
          ...showSuggestions,
          [name]: false
        })
        if (activeSuggestionField === name) {
          setActiveSuggestionField(null)
        }
      }
    }
  }

  const handleInputFocus = (fieldName) => {
    if (['payerName', 'clientPhone', 'receiptNo'].includes(fieldName)) {
      const fieldValue = formData[fieldName]
      if (fieldValue && fieldValue.length > 0) {
        setActiveSuggestionField(fieldName)
        setShowSuggestions({
          ...showSuggestions,
          [fieldName]: true
        })
      }
    }
  }

  const handleInputBlur = (fieldName) => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      setShowSuggestions({
        ...showSuggestions,
        [fieldName]: false
      })
      if (activeSuggestionField === fieldName) {
        setActiveSuggestionField(null)
      }
    }, 200)
  }

  const getSuggestionsForField = (fieldName) => {
    const fieldValue = formData[fieldName]
    if (!fieldValue || fieldValue.length === 0) return []

    const suggestions = registrationList.filter(item => {
      switch (fieldName) {
        case 'payerName':
          return item.client_name && item.client_name.toLowerCase().includes(fieldValue.toLowerCase())
        case 'clientPhone':
          return item.client_phone && item.client_phone.toLowerCase().includes(fieldValue.toLowerCase())
        case 'receiptNo':
          return item.receipt_no && item.receipt_no.toLowerCase().includes(fieldValue.toLowerCase())
        default:
          return false
      }
    })

    // Remove duplicates and limit to 5 items for scrolling
    const uniqueSuggestions = suggestions.filter((item, index, self) => {
      const fieldToCheck = fieldName === 'payerName' ? 'client_name' : 
                          fieldName === 'clientPhone' ? 'client_phone' : 'receipt_no'
      return index === self.findIndex(t => t[fieldToCheck] === item[fieldToCheck])
    })

    return uniqueSuggestions.slice(0, 5)
  }

  // Check if fields should be readonly based on payment period selection
  const isAutoFillMode = formData.paymentPeriod === '2015-2018'

  const handleClearForm = () => {
    setFormData({
      payerName: '',
      city: 'Harar',
      kebele: '',
      houseNo: '',
      receiptNo: '',
      paymentPeriod: '2015-2018',
      paymentFrom: '2015',
      paymentTo: '2018',
      periodAmount: '120',
      fee: '320',
      total: '440',
      collectedAmount: '440',
      clientPhone: '',
      tvNo: '1',
      person: 'personal',
      condition: 'new',
      sign: 'sign',
      govLetter: 'accept',
      paidAmount: '',
      validDate: '',
      registrationDateTime: ''
    })
    setCurrentRecordId(null)
    setIsUpdateMode(false)
    setWorkType('')
    setSelectedStaff('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const selectedStaffInfo = getSelectedStaffInfo()
      
      if (isUpdateMode && currentRecordId) {
        // Update existing record
        const updateData = {
          work_type: workType || 'other',
          staff_id: selectedStaff === 'other' || selectedStaff === 'all' || selectedStaff === 'unapproval' || !selectedStaff ? null : parseInt(selectedStaff),
          staff_username: selectedStaffInfo ? selectedStaffInfo.username : (selectedStaff === 'other' ? 'Other' : selectedStaff === 'all' ? 'All' : selectedStaff === 'unapproval' ? 'Unapproval Staff' : 'Unassigned'),
          staff_full_name: selectedStaffInfo ? selectedStaffInfo.full_name : (selectedStaff === 'other' ? 'Other' : selectedStaff === 'all' ? 'All' : selectedStaff === 'unapproval' ? 'Unapproval Staff' : 'Unassigned'),
          client_name: formData.payerName,
          city: formData.city,
          kebele: formData.kebele,
          house_no: formData.houseNo,
          receipt_no: formData.receiptNo,
          payment_period: formData.paymentPeriod,
          payment_from: formData.paymentFrom || '2015',
          payment_to: formData.paymentTo || '2018',
          commission_amount: null,
          period_amount: formData.periodAmount ? parseFloat(formData.periodAmount) : 120,
          fee: formData.fee ? parseFloat(formData.fee) : 320,
          total: formData.total ? parseFloat(formData.total) : 440,
          collected_amount: formData.collectedAmount ? parseFloat(formData.collectedAmount) : 440,
          client_phone: formData.clientPhone,
          tv_no: formData.tvNo,
          person: formData.person,
          client_email: null,
          condition: formData.condition,
          sign: formData.sign,
          gov_letter: formData.govLetter,
          paid_amount: formData.paidAmount ? parseFloat(formData.paidAmount) : null,
          valid_date: formData.validDate,
          payment_status: 'paid',
          approval_status: selectedStaff === 'unapproval' ? 'pending' : 'approved',
          registered_at: formData.registrationDateTime || new Date().toISOString(),
          registration_datetime: formData.registrationDateTime || null
        }

        console.log('💾 UPDATING REGISTRATION DATA:', updateData)
        console.log('💾 Form Data Values:', {
          payerName: formData.payerName,
          city: formData.city,
          kebele: formData.kebele,
          houseNo: formData.houseNo,
          receiptNo: formData.receiptNo,
          paymentPeriod: formData.paymentPeriod,
          paymentFrom: formData.paymentFrom,
          paymentTo: formData.paymentTo,
          periodAmount: formData.periodAmount,
          fee: formData.fee,
          total: formData.total,
          collectedAmount: formData.collectedAmount,
          clientPhone: formData.clientPhone,
          tvNo: formData.tvNo,
          person: formData.person,
          condition: formData.condition,
          sign: formData.sign,
          govLetter: formData.govLetter,
          paidAmount: formData.paidAmount,
          validDate: formData.validDate,
          registrationDateTime: formData.registrationDateTime
        })

        const response = await dataRegistrationAPI.updateRegistration(currentRecordId, updateData)
        
        if (response.success) {
          const approvalMessage = selectedStaff === 'unapproval' 
            ? ' Record updated and will appear in Registered, Paid, and Need Approval pages.'
            : ' Record updated and will appear in Registered and Paid pages.'
          showNotification('✓ Record updated successfully!' + approvalMessage, 'success')
          loadRegistrationData()
        }
      } else {
        // Check for duplicate registration (same client phone and name)
        const existingRegistrations = await dataRegistrationAPI.getAllRegistrations()
        if (existingRegistrations.success) {
          const duplicate = existingRegistrations.data.find(reg => 
            reg.client_phone === formData.clientPhone && 
            reg.client_name.toLowerCase() === formData.payerName.toLowerCase()
          )
          
          if (duplicate) {
            if (duplicate.payment_status === 'paid') {
              showNotification('⚠️ This record is already paid! Duplicate payment ignored.', 'error')
              return
            } else {
              // Update existing unpaid record to paid
              const updateData = {
                ...duplicate,
                payment_from: formData.paymentFrom || '2015',
                payment_to: formData.paymentTo || '2018',
                period_amount: formData.periodAmount ? parseFloat(formData.periodAmount) : 120,
                fee: formData.fee ? parseFloat(formData.fee) : 320,
                total: formData.total ? parseFloat(formData.total) : 440,
                collected_amount: formData.collectedAmount ? parseFloat(formData.collectedAmount) : 440,
                payment_status: 'paid',
                approval_status: selectedStaff === 'unapproval' ? 'pending' : 'approved',
                paid_amount: formData.paidAmount ? parseFloat(formData.paidAmount) : duplicate.paid_amount
              }
              
              const response = await dataRegistrationAPI.updateRegistration(duplicate.id, updateData)
              
              if (response.success) {
                const approvalMessage = selectedStaff === 'unapproval' 
                  ? ' Record moved from unpaid to paid and will appear in Registered, Paid, and Need Approval pages.'
                  : ' Record moved from unpaid to paid and will appear in Registered and Paid pages.'
                showNotification('✓ Existing record marked as paid!' + approvalMessage, 'success')
                setCurrentRecordId(duplicate.id)
                setIsUpdateMode(true)
                loadRegistrationData()
                return
              }
            }
          }
        }
        
        // Create new registration
        const registrationData = {
          work_type: workType || 'other',
          staff_id: selectedStaff === 'other' || selectedStaff === 'all' || selectedStaff === 'unapproval' || !selectedStaff ? null : parseInt(selectedStaff),
          staff_username: selectedStaffInfo ? selectedStaffInfo.username : (selectedStaff === 'other' ? 'Other' : selectedStaff === 'all' ? 'All' : selectedStaff === 'unapproval' ? 'Unapproval Staff' : 'Unassigned'),
          staff_full_name: selectedStaffInfo ? selectedStaffInfo.full_name : (selectedStaff === 'other' ? 'Other' : selectedStaff === 'all' ? 'All' : selectedStaff === 'unapproval' ? 'Unapproval Staff' : 'Unassigned'),
          client_name: formData.payerName,
          city: formData.city,
          kebele: formData.kebele,
          house_no: formData.houseNo,
          receipt_no: formData.receiptNo,
          payment_period: formData.paymentPeriod,
          payment_from: formData.paymentFrom || '2015',
          payment_to: formData.paymentTo || '2018',
          commission_amount: null,
          period_amount: formData.periodAmount ? parseFloat(formData.periodAmount) : 120,
          fee: formData.fee ? parseFloat(formData.fee) : 320,
          total: formData.total ? parseFloat(formData.total) : 440,
          collected_amount: formData.collectedAmount ? parseFloat(formData.collectedAmount) : 440,
          client_phone: formData.clientPhone,
          tv_no: formData.tvNo,
          person: formData.person,
          client_email: null,
          condition: formData.condition,
          sign: formData.sign,
          gov_letter: formData.govLetter,
          paid_amount: formData.paidAmount ? parseFloat(formData.paidAmount) : null,
          valid_date: formData.validDate,
          payment_status: 'paid',
          approval_status: selectedStaff === 'unapproval' ? 'pending' : 'approved',
          registered_at: formData.registrationDateTime || new Date().toISOString(),
          registration_datetime: formData.registrationDateTime || null
        }

        console.log('💾 SAVING REGISTRATION DATA:', registrationData)
        console.log('💾 Form Data Values:', {
          payerName: formData.payerName,
          city: formData.city,
          kebele: formData.kebele,
          houseNo: formData.houseNo,
          receiptNo: formData.receiptNo,
          paymentPeriod: formData.paymentPeriod,
          paymentFrom: formData.paymentFrom,
          paymentTo: formData.paymentTo,
          periodAmount: formData.periodAmount,
          fee: formData.fee,
          total: formData.total,
          collectedAmount: formData.collectedAmount,
          clientPhone: formData.clientPhone,
          tvNo: formData.tvNo,
          person: formData.person,
          condition: formData.condition,
          sign: formData.sign,
          govLetter: formData.govLetter,
          paidAmount: formData.paidAmount,
          validDate: formData.validDate,
          registrationDateTime: formData.registrationDateTime
        })

        const response = await dataRegistrationAPI.createRegistration(registrationData)
        
        if (response.success) {
          const approvalMessage = selectedStaff === 'unapproval' 
            ? ' Record will appear in Registered, Paid, and Need Approval pages.'
            : ' Record will appear in Registered and Paid pages.'
          showNotification('✓ Payment recorded successfully!' + approvalMessage, 'success')
          setCurrentRecordId(response.data.id)
          setIsUpdateMode(true)
          loadRegistrationData()
        }
      }
    } catch (error) {
      console.error('Failed to process payment:', error)
      showNotification(error.message || 'Payment processing failed', 'error')
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const getSelectedStaffInfo = () => {
    if (selectedStaff === 'other' || selectedStaff === 'all') {
      return null
    }
    return staffList.find(staff => staff.id.toString() === selectedStaff)
  }

  return (
    <div className="random-piad-register-page">
      {/* Left Sidebar - Registration List */}
      <div className="left-sidebar">
        <div className="sidebar-header">
          <h3>📋 Registration List</h3>
          <div className="search-box">
            <input
              type="text"
              placeholder="Search registrations..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="search-input"
            />
          </div>
          <div className="list-count">
            {filteredList.length} records found
            {(formData.payerName || formData.clientPhone || formData.receiptNo || searchTerm) && (
              <span className="filter-active"> (filtered)</span>
            )}
          </div>
        </div>
        <div className="sidebar-list">
          {filteredList.map((item, index) => {
            const searchTerms = getSearchTerms()
            return (
              <div 
                key={item.id || index} 
                className="list-item"
                onClick={() => handleAutoFill(item)}
              >
                <div className="item-header">
                  <span 
                    className="item-name"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(item.client_name, searchTerms)
                    }}
                  />
                  <span className={`item-status ${item.payment_status}`}>
                    {item.payment_status}
                  </span>
                </div>
                <div className="item-details">
                  <div 
                    dangerouslySetInnerHTML={{
                      __html: '📞 ' + highlightText(item.client_phone, searchTerms)
                    }}
                  />
                  <div 
                    dangerouslySetInnerHTML={{
                      __html: '📍 ' + highlightText(`${item.kebele}, ${item.city}`, searchTerms)
                    }}
                  />
                  <div>📅 {new Date(item.registered_at).getFullYear()}</div>
                  {item.receipt_no && (
                    <div 
                      dangerouslySetInnerHTML={{
                        __html: '🧾 ' + highlightText(item.receipt_no, searchTerms)
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
          {filteredList.length === 0 && (
            <div className="no-results">
              {formData.payerName || formData.clientPhone || formData.receiptNo || searchTerm
                ? 'No matching registrations found'
                : 'No registrations found'
              }
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
      <div className="compact-container">
        {/* Compact Header */}
        <div className="compact-header">
          <div className="header-content">
            <div className="header-left">
              <h1 className="compact-title">📝 Random Piad Register</h1>
              <p className="compact-subtitle">Quick registration form</p>
            </div>
            <div className="header-buttons">
              <button
                type="button"
                className="header-btn btn-cancel"
                onClick={() => window.history.back()}
              >
                ✕ Cancel
              </button>
              <button
                type="button"
                className="header-btn btn-clear"
                onClick={handleClearForm}
              >
                🗑️ Clear
              </button>
              <button
                type="submit"
                form="payment-form"
                className={`header-btn ${isUpdateMode ? 'btn-update' : 'btn-pay'}`}
              >
                {isUpdateMode ? '✏️ Update' : '💰 Pay'}
              </button>
            </div>
          </div>
        </div>

        {/* Compact Dropdowns */}
        <div className="compact-dropdowns">
          <div className="dropdown-row">
            <div className="compact-dropdown">
              <label>📅 Period Filter</label>
              <select
                value={periodFilter}
                onChange={handlePeriodFilterChange}
                className="compact-select"
              >
                <option value="">All Periods</option>
                <option value="2014">2014</option>
                <option value="2015">2015</option>
                <option value="2016">2016</option>
                <option value="2017">2017</option>
                <option value="2018">2018</option>
                <option value="2019">2019</option>
                <option value="2020">2020</option>
                <option value="2021">2021</option>
                <option value="2022">2022</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
              </select>
            </div>

            <div className="compact-dropdown">
              <label>💰 Payment Status</label>
              <select
                value={paidFilter}
                onChange={handlePaidFilterChange}
                className="compact-select"
              >
                <option value="">All Status</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>

            <div className="compact-dropdown">
              <label>📋 Work Type *</label>
              <select
                value={workType}
                onChange={handleWorkTypeChange}
                className="compact-select"
              >
                <option value="">Select Work Type</option>
                <option value="redsea-ebc">Redsea EBC</option>
                <option value="sells-product">Sells Product</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="compact-dropdown">
              <label>
                👤 Staff *
                {!hasStaff && (
                  <span className="loading-text">
                    {staffLoading ? ' (Loading...)' : staffError ? ' (Error)' : ' (No staff)'}
                  </span>
                )}
              </label>
              <div className="staff-select-container">
                <select
                  value={selectedStaff}
                  onChange={handleStaffChange}
                  className="compact-select"
                  disabled={!hasStaff}
                >
                  <option value="">
                    {!hasStaff 
                      ? (staffLoading ? 'Loading staff...' : staffError ? 'Failed to load staff' : 'No staff loaded')
                      : 'Select Staff'
                    }
                  </option>
                  <option value="unapproval">Unapproval Staff</option>
                  {staffList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.username} - {staff.full_name || 'N/A'}
                    </option>
                  ))}
                  <option value="other">Other</option>
                  <option value="all">All</option>
                </select>
                <button 
                  type="button"
                  className="refresh-btn"
                  onClick={handleRefreshStaff}
                  disabled={staffLoading}
                  title="Refresh staff list"
                >
                  {staffLoading ? '⏳' : '🔄'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Form */}
        <div className="compact-form-container">
          <form onSubmit={handleSubmit} className="compact-form" id="payment-form">
            <div className="form-grid-compact">
              <div className="form-field">
                <label>👤 Payer Name *</label>
                <div className="input-with-suggestions">
                  <input
                    type="text"
                    name="payerName"
                    value={formData.payerName}
                    onChange={handleInputChange}
                    onFocus={() => handleInputFocus('payerName')}
                    onBlur={() => handleInputBlur('payerName')}
                    required
                    placeholder="Enter payer name"
                    className="compact-input"
                  />
                  {showSuggestions.payerName && (
                    <div className="suggestions-dropdown">
                      {getSuggestionsForField('payerName').map((item, index) => (
                        <div
                          key={item.id || index}
                          className="suggestion-item"
                          onClick={() => handleAutoFill(item)}
                        >
                          <div className="suggestion-main">
                            <span 
                              dangerouslySetInnerHTML={{
                                __html: highlightText(item.client_name, [formData.payerName])
                              }}
                            />
                          </div>
                          <div className="suggestion-details">
                            📞 {item.client_phone} • 📍 {item.kebele}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>🏙️ City *</label>
                <select
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  <option value="Harar">Harar</option>
                  <option value="Addis Ababa">Addis Ababa</option>
                  <option value="Dire Dawa">Dire Dawa</option>
                  <option value="Bahir Dar">Bahir Dar</option>
                  <option value="Gondar">Gondar</option>
                  <option value="Hawassa">Hawassa</option>
                  <option value="Mekelle">Mekelle</option>
                  <option value="Jimma">Jimma</option>
                  <option value="Adama">Adama</option>
                  <option value="Dessie">Dessie</option>
                  <option value="Nekemte">Nekemte</option>
                  <option value="Debre Markos">Debre Markos</option>
                  <option value="Arba Minch">Arba Minch</option>
                  <option value="Gambela">Gambela</option>
                  <option value="Jijiga">Jijiga</option>
                  <option value="Assosa">Assosa</option>
                  <option value="Semera">Semera</option>
                </select>
              </div>

              <div className="form-field">
                <label>📍 Kebele *</label>
                <select
                  name="kebele"
                  value={formData.kebele}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  <option value="">Select Kebele</option>
                  <option value="All Woreda">All Woreda</option>
                  <option value="01">01</option>
                  <option value="02">02</option>
                  <option value="03">03</option>
                  <option value="04">04</option>
                  <option value="05">05</option>
                  <option value="06">06</option>
                  <option value="07">07</option>
                  <option value="08">08</option>
                  <option value="09">09</option>
                  <option value="10">10</option>
                  <option value="11">11</option>
                  <option value="12">12</option>
                  <option value="13">13</option>
                  <option value="14">14</option>
                  <option value="15">15</option>
                  <option value="16">16</option>
                  <option value="17">17</option>
                  <option value="18">18</option>
                  <option value="19">19</option>
                  <option value="Sofi GM">Sofi GM</option>
                  <option value="Dire T GM">Dire T GM</option>
                  <option value="Erorr">Erorr</option>
                </select>
              </div>

              <div className="form-field">
                <label>🏠 House No</label>
                <input
                  type="text"
                  name="houseNo"
                  value={formData.houseNo}
                  onChange={handleInputChange}
                  placeholder="Enter house number"
                  className="compact-input"
                />
              </div>

              <div className="form-field">
                <label>🧾 Receipt No</label>
                <div className="input-with-suggestions">
                  <input
                    type="text"
                    name="receiptNo"
                    value={formData.receiptNo}
                    onChange={handleInputChange}
                    onFocus={() => handleInputFocus('receiptNo')}
                    onBlur={() => handleInputBlur('receiptNo')}
                    placeholder="Enter receipt number"
                    className="compact-input"
                  />
                  {showSuggestions.receiptNo && (
                    <div className="suggestions-dropdown">
                      {getSuggestionsForField('receiptNo').map((item, index) => (
                        <div
                          key={item.id || index}
                          className="suggestion-item"
                          onClick={() => handleAutoFill(item)}
                        >
                          <div className="suggestion-main">
                            🧾 <span 
                              dangerouslySetInnerHTML={{
                                __html: highlightText(item.receipt_no, [formData.receiptNo])
                              }}
                            />
                          </div>
                          <div className="suggestion-details">
                            👤 {item.client_name} • 📞 {item.client_phone}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>📅 Payment Period *</label>
                <select
                  name="paymentPeriod"
                  value={formData.paymentPeriod}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  <option value="2015-2018">2015 - 2018</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="form-field">
                <label>📅 From</label>
                <input
                  type="number"
                  name="paymentFrom"
                  value={formData.paymentFrom}
                  onChange={handleInputChange}
                  placeholder="2014"
                  className="compact-input"
                  min="1900"
                  max="2100"
                  readOnly={isAutoFillMode}
                />
              </div>

              <div className="form-field">
                <label>📅 To</label>
                <input
                  type="number"
                  name="paymentTo"
                  value={formData.paymentTo}
                  onChange={handleInputChange}
                  placeholder="2018"
                  className="compact-input"
                  min="1900"
                  max="2100"
                  readOnly={isAutoFillMode}
                />
              </div>

              {/* Commission Amount Section - Title spanning full width */}
              <div className="commission-section" style={{ gridColumn: '1 / -1' }}>
                <div className="section-title" style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  color: '#2c3e50',
                  marginBottom: '15px',
                  paddingBottom: '8px',
                  borderBottom: '2px solid #3498db',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  💰 Commission Amount
                </div>
              </div>
                
              {/* Sub-inputs under Commission Amount - using grid columns */}
              <div className="form-field">
                <label>💵 Period Amount</label>
                <input
                  type="number"
                  name="periodAmount"
                  value={formData.periodAmount}
                  onChange={handleInputChange}
                  className="compact-input"
                  placeholder="Period amount"
                  min="0"
                  step="0.01"
                  readOnly={isAutoFillMode}
                />
              </div>

              <div className="form-field">
                <label>💸 Fee</label>
                <input
                  type="number"
                  name="fee"
                  value={formData.fee}
                  onChange={handleInputChange}
                  className="compact-input"
                  placeholder="Fee amount"
                  min="0"
                  step="0.01"
                  readOnly={isAutoFillMode}
                />
              </div>

              <div className="form-field">
                <label>💯 Total</label>
                <input
                  type="number"
                  name="total"
                  value={formData.total}
                  onChange={handleInputChange}
                  className="compact-input"
                  placeholder="Total amount"
                  min="0"
                  step="0.01"
                  readOnly={isAutoFillMode}
                />
              </div>

              <div className="form-field">
                <label>💰 Collected Amount</label>
                <input
                  type="number"
                  name="collectedAmount"
                  value={formData.collectedAmount}
                  onChange={handleInputChange}
                  className="compact-input"
                  placeholder="Collected amount"
                  min="0"
                  step="0.01"
                  readOnly={isAutoFillMode}
                />
              </div>

              <div className="form-field">
                <label>📞 Phone *</label>
                <div className="input-with-suggestions">
                  <input
                    type="tel"
                    name="clientPhone"
                    value={formData.clientPhone}
                    onChange={handleInputChange}
                    onFocus={() => handleInputFocus('clientPhone')}
                    onBlur={() => handleInputBlur('clientPhone')}
                    required
                    placeholder="Enter phone number"
                    className="compact-input"
                  />
                  {showSuggestions.clientPhone && (
                    <div className="suggestions-dropdown">
                      {getSuggestionsForField('clientPhone').map((item, index) => (
                        <div
                          key={item.id || index}
                          className="suggestion-item"
                          onClick={() => handleAutoFill(item)}
                        >
                          <div className="suggestion-main">
                            📞 <span 
                              dangerouslySetInnerHTML={{
                                __html: highlightText(item.client_phone, [formData.clientPhone])
                              }}
                            />
                          </div>
                          <div className="suggestion-details">
                            👤 {item.client_name} • 📍 {item.kebele}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>📺 TV No *</label>
                <select
                  name="tvNo"
                  value={formData.tvNo}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  {[...Array(20)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} TV
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>👥 Person *</label>
                <select
                  name="person"
                  value={formData.person}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  <option value="personal">Personal</option>
                  <option value="organization">Organization</option>
                </select>
              </div>

              <div className="form-field">
                <label>🔄 Condition *</label>
                <select
                  name="condition"
                  value={formData.condition}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  <option value="new">New</option>
                  <option value="old">Old</option>
                </select>
              </div>

              <div className="form-field">
                <label>✍️ Sign *</label>
                <select
                  name="sign"
                  value={formData.sign}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  <option value="sign">Sign</option>
                  <option value="unsign">Unsign</option>
                </select>
              </div>

              <div className="form-field">
                <label>📄 Gov Letter *</label>
                <select
                  name="govLetter"
                  value={formData.govLetter}
                  onChange={handleInputChange}
                  required
                  className="compact-select"
                >
                  <option value="accept">Accept</option>
                  <option value="notaccept">Not Accept</option>
                </select>
              </div>

              <div className="form-field">
                <label>💰 Paid Amount</label>
                <input
                  type="number"
                  name="paidAmount"
                  value={formData.paidAmount}
                  onChange={handleInputChange}
                  className="compact-input"
                  placeholder="Enter amount"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="form-field">
                <label>📅 Valid Date</label>
                <input
                  type="text"
                  name="validDate"
                  value={formData.validDate}
                  onChange={handleInputChange}
                  className="compact-input"
                  placeholder="Enter valid date"
                />
              </div>

              <div className="form-field">
                <label>📅 Registration Date</label>
                <EthiopianDateInput
                  value={formData.registrationDateTime}
                  onChange={(date) => setFormData({ ...formData, registrationDateTime: date })}
                />
              </div>
            </div>
          </form>
        </div>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className={`toast-notification ${notification.type}`}>
          <span className="toast-message">{notification.message}</span>
        </div>
      )}
    </div>
  )
}

export default RandomPiadRegister