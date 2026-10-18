import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataRegistrationAPI, userAPI } from '../../services/api'
import { getIconVisibility } from '../../utils/permissions'
import { usePermissions } from '../../hooks/usePermissions'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import './Registered.css'

// Helper function to safely format dates
const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  
  try {
    const date = new Date(dateString)
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'N/A'
    }
    return date.toLocaleDateString()
  } catch (error) {
    return 'N/A'
  }
}

// Helper function to safely get registration ID (MongoDB compatible)
const getRegistrationId = (registration) => {
  console.log('🔍 GET REGISTRATION ID');
  console.log('Registration object:', registration);
  
  let id = null;
  
  // Handle MongoDB ObjectId format
  if (registration._id) {
    id = registration._id;
    console.log('Found _id:', id, 'Type:', typeof id);
  }
  // Handle regular id format
  else if (registration.id) {
    id = registration.id;
    console.log('Found id:', id, 'Type:', typeof id);
  }
  
  // If id is an object, convert to string
  if (id && typeof id === 'object') {
    if (id.$oid) {
      // MongoDB extended JSON format
      id = id.$oid;
      console.log('Extracted $oid:', id);
    } else if (id.toString) {
      id = id.toString();
      console.log('Converted object to string:', id);
    }
  }
  
  // Convert to string and trim
  if (id) {
    id = String(id).trim();
    console.log('Final ID:', id, 'Length:', id.length);
  } else {
    console.error('❌ NO ID FOUND IN REGISTRATION');
  }
  
  return id;
}

function Registered() {
  const navigate = useNavigate()
  const [registrations, setRegistrations] = useState([])
  const [filteredRegistrations, setFilteredRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingRegistration, setEditingRegistration] = useState(null)
  const [registrationImagePreview, setRegistrationImagePreview] = useState('')
  const [staffList, setStaffList] = useState([])
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  
  // Voice search states
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  
  // Use permission polling hook
  const { permissions } = usePermissions(true, 30000)
  
  // Permission states (derived from permissions hook)
  const editIconVisibility = permissions.icons?.editIcon || 'visible'
  const deleteIconVisibility = permissions.icons?.deleteIcon || 'visible'
  
  const [editFormData, setEditFormData] = useState({
    work_type: '',
    staff_id: '',
    staff_username: '',
    staff_full_name: '',
    client_name: '',
    kebele: '',
    house_no: '',
    client_phone: '',
    tv_no: '1',
    person: 'personal',
    client_email: '',
    condition: 'new',
    sign: 'sign',
    gov_letter: 'accept',
    paid_amount: '',
    payment_status: 'unpaid',
    transaction_number: ''
  })

  useEffect(() => {
    loadRegistrations()
    loadStaffList()
    
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'en-US'
      
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        console.log('Voice search transcript:', transcript)
        setSearchQuery(transcript)
        setIsListening(false)
        showNotification(`🎤 Heard: "${transcript}"`, 'success')
      }
      
      recognitionRef.current.onerror = (event) => {
        console.error('Voice search error:', event.error)
        setIsListening(false)
        if (event.error === 'no-speech') {
          showNotification('❌ No speech detected. Please try again.', 'error')
        } else if (event.error === 'not-allowed') {
          showNotification('❌ Microphone access denied. Please enable microphone permissions.', 'error')
        } else {
          showNotification(`❌ Voice search error: ${event.error}`, 'error')
        }
      }
      
      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {}
      }
    }
  }, [])

  useEffect(() => {
    applyFilters()
  }, [registrations, searchQuery, selectedStaff, selectedPeriod, customStartDate, customEndDate])

  const startVoiceSearch = () => {
    if (!recognitionRef.current) {
      showNotification('❌ Voice search not supported in this browser', 'error')
      return
    }
    
    try {
      recognitionRef.current.start()
      setIsListening(true)
      showNotification('🎤 Listening... Speak your search query', 'info')
    } catch (error) {
      console.error('Failed to start voice search:', error)
      setIsListening(false)
    }
  }

  const loadRegistrations = async () => {
    try {
      const response = await dataRegistrationAPI.getAllRegistrations()
      if (response.success) {
        // Show all registrations
        setRegistrations(response.data)
      }
    } catch (error) {
      console.error('Failed to load registrations:', error)
      showNotification('Failed to load registrations', 'error')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...registrations]

    // Search filter (by client name, phone, kebele)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(reg =>
        reg.client_name?.toLowerCase().includes(query) ||
        reg.client_phone?.toLowerCase().includes(query) ||
        reg.kebele?.toLowerCase().includes(query) ||
        reg.house_no?.toLowerCase().includes(query) ||
        reg.transaction_number?.toLowerCase().includes(query)
      )
    }

    // Staff filter
    if (selectedStaff && selectedStaff !== 'all') {
      filtered = filtered.filter(reg => {
        if (selectedStaff === 'unapproved') {
          return reg.staff_username === 'Unapproval Staff'
        }
        return reg.staff_id?.toString() === selectedStaff
      })
    }

    // Period filter
    if (selectedPeriod && selectedPeriod !== 'all') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
      filtered = filtered.filter(reg => {
        const regDate = new Date(reg.created_at || reg.registered_at)
        
        switch (selectedPeriod) {
          case 'today':
            return regDate >= today
          case 'thisweek': {
            const weekStart = new Date(today)
            weekStart.setDate(today.getDate() - today.getDay())
            return regDate >= weekStart
          }
          case 'lastweek': {
            const lastWeekStart = new Date(today)
            lastWeekStart.setDate(today.getDate() - today.getDay() - 7)
            const lastWeekEnd = new Date(lastWeekStart)
            lastWeekEnd.setDate(lastWeekStart.getDate() + 7)
            return regDate >= lastWeekStart && regDate < lastWeekEnd
          }
          case 'last10days': {
            const tenDaysAgo = new Date(today)
            tenDaysAgo.setDate(today.getDate() - 10)
            return regDate >= tenDaysAgo
          }
          case 'thismonth': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
            return regDate >= monthStart
          }
          case 'lastmonth': {
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)
            return regDate >= lastMonthStart && regDate < lastMonthEnd
          }
          case 'yearly': {
            const yearStart = new Date(now.getFullYear(), 0, 1)
            return regDate >= yearStart
          }
          case 'custom': {
            if (customStartDate && customEndDate) {
              const start = new Date(customStartDate)
              const end = new Date(customEndDate)
              end.setHours(23, 59, 59, 999)
              return regDate >= start && regDate <= end
            }
            return true
          }
          default:
            return true
        }
      })
    }

    setFilteredRegistrations(filtered)
  }

  const loadStaffList = async () => {
    try {
      const response = await userAPI.getAllUsers()
      if (response.success) {
        setStaffList(response.data)
      }
    } catch (error) {
      console.error('Failed to load staff list:', error)
      setStaffList([])
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const handleNewRegistration = () => {
    navigate('/data-registration')
  }

  const handleEditClick = (registration) => {
    setEditingRegistration(registration)
    setEditFormData({
      work_type: registration.work_type,
      staff_id: registration.staff_id || '',
      staff_username: registration.staff_username,
      staff_full_name: registration.staff_full_name || '',
      client_name: registration.client_name,
      kebele: registration.kebele,
      house_no: registration.house_no || '',
      client_phone: registration.client_phone,
      tv_no: registration.tv_no,
      person: registration.person,
      client_email: registration.client_email || '',
      condition: registration.condition,
      sign: registration.sign,
      gov_letter: registration.gov_letter || 'accept',
      paid_amount: registration.paid_amount || '',
      payment_status: registration.payment_status,
      transaction_number: registration.transaction_number || ''
    })
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setEditingRegistration(null)
  }

  const handleEditInputChange = (e) => {
    const { name, value } = e.target
    
    // If staff is being changed, update staff info
    if (name === 'staff_id') {
      const selectedStaff = staffList.find(s => s.id.toString() === value)
      if (selectedStaff) {
        setEditFormData({
          ...editFormData,
          staff_id: selectedStaff.id,
          staff_username: selectedStaff.username,
          staff_full_name: selectedStaff.full_name || ''
        })
      } else if (value === 'unapproved') {
        setEditFormData({
          ...editFormData,
          staff_id: null,
          staff_username: 'UNAPPROVED STAFF',
          staff_full_name: 'UNAPPROVED STAFF'
        })
      } else if (value === 'other') {
        setEditFormData({
          ...editFormData,
          staff_id: null,
          staff_username: 'Other',
          staff_full_name: 'Other'
        })
      } else if (value === 'all') {
        setEditFormData({
          ...editFormData,
          staff_id: null,
          staff_username: 'All',
          staff_full_name: 'All'
        })
      }
    } else {
      setEditFormData({
        ...editFormData,
        [name]: value
      })
    }
  }

  const handleUpdateRegistration = async (e) => {
    e.preventDefault()
    
    try {
      const updateData = {
        work_type: editFormData.work_type,
        staff_id: editFormData.staff_id || null,
        staff_username: editFormData.staff_username,
        staff_full_name: editFormData.staff_full_name || null,
        client_name: editFormData.client_name,
        kebele: editFormData.kebele,
        house_no: editFormData.house_no || null,
        client_phone: editFormData.client_phone,
        tv_no: editFormData.tv_no,
        person: editFormData.person,
        client_email: editFormData.client_email || null,
        condition: editFormData.condition,
        sign: editFormData.sign,
        gov_letter: editFormData.gov_letter,
        paid_amount: editFormData.paid_amount ? parseFloat(editFormData.paid_amount) : null,
        payment_status: editFormData.payment_status,
        transaction_number: editFormData.transaction_number.trim() || null
      }

      const response = await dataRegistrationAPI.updateRegistration(getRegistrationId(editingRegistration), updateData)
      
      if (response.success) {
        showNotification('✓ Registration updated successfully!', 'success')
        handleCloseEditModal()
        
        // Reload to get fresh data from database
        await loadRegistrations()
      } else {
        showNotification(response.message || 'Failed to update registration', 'error')
      }
    } catch (error) {
      console.error('Failed to update registration:', error)
      showNotification(error.message || 'Failed to update registration', 'error')
    }
  }

  const handleViewRegistrationImage = async registration => {
    try {
      const response = await dataRegistrationAPI.getRegistrationImage(getRegistrationId(registration))
      setRegistrationImagePreview(response.data)
    } catch (error) {
      console.error('Could not load registration image:', error)
      showNotification(error.message || 'Could not load the registration image.', 'error')
    }
  }

  const handleDeleteClick = async (registration) => {
    if (window.confirm(`Are you sure you want to delete registration for ${registration.client_name}?`)) {
      try {
        const response = await dataRegistrationAPI.deleteRegistration(getRegistrationId(registration))
        
        if (response.success) {
          showNotification('🗑️ Registration deleted successfully!', 'success')
          
          // Reload to get fresh data from database
          await loadRegistrations()
        } else {
          showNotification(response.message || 'Failed to delete registration', 'error')
        }
      } catch (error) {
        console.error('Failed to delete registration:', error)
        showNotification(error.message || 'Failed to delete registration', 'error')
      }
    }
  }

  const handleTogglePaymentStatus = async (registration) => {
    const newStatus = registration.payment_status === 'paid' ? 'unpaid' : 'paid'
    
    // Ask for confirmation before changing payment status
    const confirmChange = window.confirm(
      `⚠️ CONFIRM PAYMENT STATUS CHANGE\n\n` +
      `Client: ${registration.client_name}\n` +
      `Phone: ${registration.client_phone}\n` +
      `Current Status: ${registration.payment_status.toUpperCase()}\n` +
      `New Status: ${newStatus.toUpperCase()}\n\n` +
      `Do you want to change the payment status?`
    )
    
    if (!confirmChange) {
      showNotification('❌ Payment status change cancelled', 'error')
      return // Stop if user cancels
    }
    
    try {
      const response = await dataRegistrationAPI.updateRegistration(getRegistrationId(registration), {
        payment_status: newStatus
      })
      
      if (response.success) {
        showNotification(`✓ Status changed to ${newStatus.toUpperCase()}!`, 'success')
        
        // Reload to get fresh data from database
        await loadRegistrations()
      } else {
        showNotification(response.message || 'Failed to update payment status', 'error')
      }
    } catch (error) {
      console.error('Failed to update payment status:', error)
      showNotification('Failed to update payment status', 'error')
    }
  }

  const downloadExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredRegistrations.map((reg, index) => ({
        '#': index + 1,
        'Status': reg.payment_status === 'paid' ? 'PAID' : 'UNPAID',
        'Staff Name': reg.staff_username || 'N/A',
        'Full Name': reg.staff_full_name || 'N/A',
        'Work Type': reg.work_type,
        'Client Name': reg.client_name,
        'Kebele': reg.kebele,
        'House No': reg.house_no || 'N/A',
        'Phone': reg.client_phone,
        'TV No': reg.tv_no,
        'Person': reg.person,
        'Email': reg.client_email || 'N/A',
        'Condition': reg.condition,
        'Sign': reg.sign,
        'Gov Letter': reg.gov_letter || 'N/A',
        'Paid Amount': reg.paid_amount ? `${reg.paid_amount} Birr` : 'N/A',
        'Transaction Number': reg.transaction_number || 'N/A',
        'Registered': formatDate(reg.registered_at)
      }))
    )
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registered Data')
    XLSX.writeFile(workbook, 'Registered_Data.xlsx')
    showNotification('✓ Excel file downloaded!', 'success')
  }

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' })
    
    // Add logo and header
    doc.setFontSize(18)
    doc.setTextColor(196, 30, 58)
    doc.text('REDSEA', 14, 15)
    
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text('fixed and movable Commission Work & Brokerage Services', 14, 22)
    
    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text('Registered Data - Filtered Registrations', 14, 32)
    
    const tableData = filteredRegistrations.map((reg, index) => [
      index + 1,
      reg.payment_status === 'paid' ? 'PAID' : 'UNPAID',
      reg.staff_username || 'N/A',
      reg.staff_full_name || 'N/A',
      reg.work_type,
      reg.client_name,
      reg.kebele,
      reg.house_no || 'N/A',
      reg.client_phone,
      reg.tv_no,
      reg.person,
      reg.client_email || 'N/A',
      reg.condition,
      reg.sign,
      reg.gov_letter || 'N/A',
      reg.paid_amount ? `${reg.paid_amount} Birr` : 'N/A',
      reg.transaction_number || 'N/A',
      formatDate(reg.registered_at)
    ])
    
    doc.autoTable({
      startY: 38,
      head: [['#', 'Status', 'Staff', 'Full Name', 'Work Type', 'Client', 'Kebele', 'House', 'Phone', 'TV', 'Person', 'Email', 'Condition', 'Sign', 'Gov Letter', 'Payment', 'Transaction #', 'Date']],
      body: tableData,
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [196, 30, 58], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 38 }
    })
    
    doc.save('Registered_Data.pdf')
    showNotification('✓ PDF file downloaded!', 'success')
  }

  const handlePrint = () => {
    window.print()
    showNotification('✓ Print dialog opened!', 'success')
  }

  return (
    <div className="registered-page">
      <div className="registered-container">
        <div className="registered-header">
          <div className="header-content">
            <h1 className="page-title">Registered Data</h1>
            <p className="page-subtitle">All TV Revenue Request Letter Registrations</p>
          </div>
          <div className="header-buttons">
            <button className="btn-download btn-excel" onClick={downloadExcel}>
              <span className="btn-icon">📊</span>
              <span className="btn-text">Excel</span>
            </button>
            <button className="btn-download btn-pdf" onClick={downloadPDF}>
              <span className="btn-icon">📄</span>
              <span className="btn-text">PDF</span>
            </button>
            <button className="btn-download btn-print" onClick={handlePrint}>
              <span className="btn-icon">🖨️</span>
              <span className="btn-text">Print</span>
            </button>
            <button className="btn-need-approval" onClick={() => navigate('/need-approval')}>
              <span className="btn-icon">⚠️</span>
              <span className="btn-text">Need Approval</span>
            </button>
            <button className="btn-paid" onClick={() => navigate('/paid')}>
              <span className="btn-icon">💰</span>
              <span className="btn-text">Paid</span>
            </button>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="filters-section">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by client name, phone, kebele, house no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button
              type="button"
              className={`voice-search-btn ${isListening ? 'listening' : ''}`}
              onClick={startVoiceSearch}
              title="Voice search"
            >
              🎤
            </button>
          </div>
          
          <div className="filter-controls">
            <div className="filter-group">
              <label htmlFor="staffFilter">
                <span className="filter-icon">👤</span>
                Staff/User
              </label>
              <select
                id="staffFilter"
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Staff</option>
                <option value="unapproved">UNAPPROVED STAFF</option>
                {staffList.map(staff => (
                  <option key={staff.id} value={staff.id}>
                    {staff.username} - {staff.full_name || 'N/A'}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="periodFilter">
                <span className="filter-icon">📅</span>
                Period
              </label>
              <select
                id="periodFilter"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="thisweek">This Week</option>
                <option value="lastweek">Last Week</option>
                <option value="last10days">Last 10 Days</option>
                <option value="thismonth">This Month</option>
                <option value="lastmonth">Last Month</option>
                <option value="yearly">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {selectedPeriod === 'custom' && (
              <>
                <div className="filter-group">
                  <label htmlFor="startDate">From</label>
                  <input
                    type="date"
                    id="startDate"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="filter-date"
                  />
                </div>
                <div className="filter-group">
                  <label htmlFor="endDate">To</label>
                  <input
                    type="date"
                    id="endDate"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="filter-date"
                  />
                </div>
              </>
            )}

            <div className="filter-results">
              <span className="results-count">
                {filteredRegistrations.length} of {registrations.length} records
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading registrations...</p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <h3>No Results Found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="registrations-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Staff Name</th>
                  <th>Full Name</th>
                  <th>Work Type</th>
                  <th>Client Name</th>
                  <th>Kebele</th>
                  <th>House No</th>
                  <th>Phone</th>
                  <th>TV No</th>
                  <th>Person</th>
                  <th>Email</th>
                  <th>Condition</th>
                  <th>Sign</th>
                  <th>Gov Letter</th>
                  <th>Paid Amount</th>
                  <th>Valid Date</th>
                  <th>Registered</th>
                  <th>Transaction Number</th>
                  <th>Photo</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((registration, index) => {
                    const globalIndex = (currentPage - 1) * itemsPerPage + index
                    return (
                  <tr key={getRegistrationId(registration) || index}>
                    <td>{globalIndex + 1}</td>
                    <td>
                      <span className={`status-badge ${registration.payment_status === 'paid' ? 'paid' : 'unpaid'}`}>
                        {registration.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                      </span>
                    </td>
                    <td>{registration.staff_username || 'N/A'}</td>
                    <td>{registration.staff_full_name || 'N/A'}</td>
                    <td>
                      <span className="badge-work">{registration.work_type}</span>
                    </td>
                    <td>{registration.client_name}</td>
                    <td>{registration.kebele}</td>
                    <td>{registration.house_no || 'N/A'}</td>
                    <td>
                      <a href={`tel:${registration.client_phone}`} className="phone-link">
                        {registration.client_phone}
                      </a>
                    </td>
                    <td>
                      <span className="badge-tv">{registration.tv_no} TV</span>
                    </td>
                    <td>{registration.person}</td>
                    <td>{registration.client_email || 'N/A'}</td>
                    <td>
                      <span className="badge-condition">{registration.condition}</span>
                    </td>
                    <td>
                      <span className={`badge-sign ${registration.sign === 'sign' ? 'signed' : 'unsigned'}`}>
                        {registration.sign}
                      </span>
                    </td>
                    <td>
                      <span className={`badge-gov ${registration.gov_letter === 'accept' ? 'accepted' : 'unaccepted'}`}>
                        {registration.gov_letter || 'N/A'}
                      </span>
                    </td>
                    <td>
                      {registration.paid_amount ? (
                        <span className="badge-amount">
                          {registration.paid_amount} Birr
                        </span>
                      ) : (
                        <span className="badge-no-amount">N/A</span>
                      )}
                    </td>
                    <td>
                      {registration.registration_datetime ? (
                        <span className="badge-date">
                          {formatDate(registration.registration_datetime)}
                        </span>
                      ) : (
                        <span className="badge-no-date">N/A</span>
                      )}
                    </td>
                    <td>{formatDate(registration.registered_at)}</td>
                    <td>{registration.transaction_number || 'N/A'}</td>
                    <td>
                      {registration.has_registration_image ? (
                        <button
                          type="button"
                          className="btn-action btn-view-image"
                          onClick={() => handleViewRegistrationImage(registration)}
                        >
                          View photo
                        </button>
                      ) : 'N/A'}
                    </td>
                    <td>
                      <div className="action-buttons">
                        {editIconVisibility !== 'invisible' && (
                          <button 
                            className="btn-action btn-edit" 
                            title="Edit"
                            onClick={() => handleEditClick(registration)}
                            disabled={editIconVisibility === 'disabled'}
                            style={editIconVisibility === 'disabled' ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                          >
                            ✏️
                          </button>
                        )}
                        <button 
                          className="btn-action btn-pay" 
                          title={registration.payment_status === 'paid' ? 'Mark as Unpaid' : 'Mark as Paid'}
                          onClick={() => handleTogglePaymentStatus(registration)}
                        >
                          {registration.payment_status === 'paid' ? '💳' : '💰'}
                        </button>
                        {deleteIconVisibility !== 'invisible' && (
                          <button 
                            className="btn-action btn-delete" 
                            title="Delete"
                            onClick={() => handleDeleteClick(registration)}
                            disabled={deleteIconVisibility === 'disabled'}
                            style={deleteIconVisibility === 'disabled' ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination Controls */}
        {filteredRegistrations.length > itemsPerPage && (
          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            <span className="pagination-info">
              Page {currentPage} of {Math.ceil(filteredRegistrations.length / itemsPerPage)} 
              ({filteredRegistrations.length} total items)
            </span>
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredRegistrations.length / itemsPerPage), prev + 1))}
              disabled={currentPage >= Math.ceil(filteredRegistrations.length / itemsPerPage)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {registrationImagePreview && (
        <div className="modal-overlay" onClick={() => setRegistrationImagePreview('')}>
          <div className="registration-image-modal" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setRegistrationImagePreview('')}
              aria-label="Close registration image"
            >
              ✕
            </button>
            <img src={registrationImagePreview} alt="Registration attachment" />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={handleCloseEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Registration</h2>
              <button className="modal-close" onClick={handleCloseEditModal}>✕</button>
            </div>
            
            <form onSubmit={handleUpdateRegistration} className="edit-form">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="work_type">Work Type *</label>
                  <select
                    id="work_type"
                    name="work_type"
                    value={editFormData.work_type}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="redsea-ebc">1. REDSEA with EBC Work</option>
                    <option value="sells-product">2. Sells Product Work</option>
                    <option value="other">3. Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="staff_id">Assigned Staff *</label>
                  <select
                    id="staff_id"
                    name="staff_id"
                    value={editFormData.staff_id || (editFormData.staff_username === 'UNAPPROVED STAFF' ? 'unapproved' : editFormData.staff_username === 'Other' ? 'other' : editFormData.staff_username === 'All' ? 'all' : '')}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="">-- Select Staff --</option>
                    <option value="unapproved">UNAPPROVED STAFF</option>
                    {staffList.map(staff => (
                      <option key={staff.id} value={staff.id}>
                        {staff.username} - {staff.full_name || 'N/A'} - {staff.phone || 'No Phone'}
                      </option>
                    ))}
                    <option value="other">Other</option>
                    <option value="all">All</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="client_name">Client Name *</label>
                  <input
                    type="text"
                    id="client_name"
                    name="client_name"
                    value={editFormData.client_name}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="transaction_number">Transaction Number</label>
                  <input
                    type="text"
                    id="transaction_number"
                    name="transaction_number"
                    value={editFormData.transaction_number}
                    onChange={handleEditInputChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="kebele">Kebele *</label>
                  <select
                    id="kebele"
                    name="kebele"
                    value={editFormData.kebele}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="">-- Select Kebele --</option>
                    <option value="All Woreda">All Woreda</option>
                    {[...Array(19)].map((_, i) => (
                      <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                        {String(i + 1).padStart(2, '0')}
                      </option>
                    ))}
                    <option value="Sofi GM">Sofi GM</option>
                    <option value="Dire T GM">Dire T GM</option>
                    <option value="Erorr">Erorr</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="house_no">House No</label>
                  <input
                    type="text"
                    id="house_no"
                    name="house_no"
                    value={editFormData.house_no}
                    onChange={handleEditInputChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="client_phone">Client Phone *</label>
                  <input
                    type="tel"
                    id="client_phone"
                    name="client_phone"
                    value={editFormData.client_phone}
                    onChange={handleEditInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="tv_no">TV No *</label>
                  <select
                    id="tv_no"
                    name="tv_no"
                    value={editFormData.tv_no}
                    onChange={handleEditInputChange}
                    required
                  >
                    {[...Array(50)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1} TV
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="person">Person *</label>
                  <select
                    id="person"
                    name="person"
                    value={editFormData.person}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="personal">Personal</option>
                    <option value="organization">Organization</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="client_email">Client Email</label>
                  <input
                    type="email"
                    id="client_email"
                    name="client_email"
                    value={editFormData.client_email}
                    onChange={handleEditInputChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="condition">Condition *</label>
                  <select
                    id="condition"
                    name="condition"
                    value={editFormData.condition}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="new">New</option>
                    <option value="old">Old</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="sign">Sign *</label>
                  <select
                    id="sign"
                    name="sign"
                    value={editFormData.sign}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="sign">Sign</option>
                    <option value="unsign">Unsign</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="gov_letter">Gov Letter *</label>
                  <select
                    id="gov_letter"
                    name="gov_letter"
                    value={editFormData.gov_letter}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="accept">Accept</option>
                    <option value="unaccept">Unaccept</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="paid_amount">Paid Amount</label>
                  <input
                    type="number"
                    id="paid_amount"
                    name="paid_amount"
                    value={editFormData.paid_amount}
                    onChange={handleEditInputChange}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="payment_status">Payment Status *</label>
                  <select
                    id="payment_status"
                    name="payment_status"
                    value={editFormData.payment_status}
                    onChange={handleEditInputChange}
                    required
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseEditModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  <span className="btn-icon">✓</span>
                  Update Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className={`toast-notification ${notification.type}`}>
          <span className="toast-message">{notification.message}</span>
        </div>
      )}
    </div>
  )
}

export default Registered
