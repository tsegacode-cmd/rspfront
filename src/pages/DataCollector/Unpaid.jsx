import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataRegistrationAPI, userAPI } from '../../services/api'
import { getIconVisibility } from '../../utils/permissions'
import { usePermissions } from '../../hooks/usePermissions'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import './Unpaid.css'

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

function Unpaid() {
  const navigate = useNavigate()
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingRegistration, setEditingRegistration] = useState(null)
  const [staffList, setStaffList] = useState([])
  
  // SMS Modal states
  const [showSmsModal, setShowSmsModal] = useState(false)
  const [smsRegistration, setSmsRegistration] = useState(null)
  const [smsMessageType, setSmsMessageType] = useState('default')
  const [customSmsMessage, setCustomSmsMessage] = useState('')
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  
  // Period filter states
  const [periodFilter, setPeriodFilter] = useState('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  
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
    payment_status: 'unpaid'
  })

  useEffect(() => {
    loadRegistrations()
    loadStaffList()
  }, [])

  const loadRegistrations = async () => {
    try {
      const response = await dataRegistrationAPI.getAllRegistrations()
      if (response.success) {
        // Filter for unpaid registrations EXCLUDING UNAPPROVED STAFF
        // UNAPPROVED STAFF registrations should NOT show on Unpaid page
        const unpaidRegs = response.data.filter(reg => 
          reg.payment_status === 'unpaid' && reg.staff_username !== 'Unapproval Staff'
        )
        setRegistrations(unpaidRegs)
      }
    } catch (error) {
      console.error('Failed to load registrations:', error)
      showNotification('Failed to load registrations', 'error')
    } finally {
      setLoading(false)
    }
  }
  
  // Filter registrations by period
  const getFilteredByPeriod = () => {
    if (periodFilter === 'all') return registrations
    
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    return registrations.filter(reg => {
      const regDate = new Date(reg.created_at || reg.registered_at)
      
      switch (periodFilter) {
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
      payment_status: registration.payment_status
    })
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setEditingRegistration(null)
  }

  const handleEditInputChange = (e) => {
    const { name, value } = e.target
    
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
        payment_status: editFormData.payment_status
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
      showNotification(error.message || 'Failed to update payment status', 'error')
    }
  }

  // SMS Handler Functions
  const handleSmsClick = (registration) => {
    setSmsRegistration(registration)
    setSmsMessageType('default')
    setCustomSmsMessage('')
    setShowSmsModal(true)
  }

  const handleCloseSmsModal = () => {
    setShowSmsModal(false)
    setSmsRegistration(null)
    setSmsMessageType('default')
    setCustomSmsMessage('')
  }

  const handleSendSms = () => {
    if (!smsRegistration) return

    let message = ''
    
    if (smsMessageType === 'default') {
      // Default message in Amharic and English
      message = 'ኢትዮጵያ ብሮድካስት ኮርፖሬሽን የአመታዊ የቴሌቪዥን ግብር እና ፍቃድ ክፍያዎን በወቅቱ እንዲከፍሉ እናስታውስዎታለን\n\nEthiopia Broadcast Corporation we remind you to pay annual television tax and license fees to Ethiopian Broadcasting Corporation on time'
    } else if (smsMessageType === 'custom') {
      message = customSmsMessage.trim()
      if (!message) {
        showNotification('⚠️ Please enter a custom message', 'error')
        return
      }
    }

    // Open device SMS application with phone number and message
    const phoneNumber = smsRegistration.client_phone
    const smsUrl = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`
    
    // Open SMS app
    window.location.href = smsUrl
    
    // Close modal
    handleCloseSmsModal()
    showNotification('📱 Opening SMS application...', 'success')
  }

  const downloadExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      registrations.map((reg, index) => ({
        '#': index + 1,
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
        'Registered': formatDate(reg.registered_at)
      }))
    )
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Incomplete Unpaid Report')
    XLSX.writeFile(workbook, 'Incomplete_Unpaid_Report_TV_Revenue_EBC_Corporation.xlsx')
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
    doc.text('Incomplete Unpaid Report TV Revenue for EBC Corporation', 14, 32)
    
    const tableData = registrations.map((reg, index) => [
      index + 1,
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
      formatDate(reg.registered_at)
    ])
    
    doc.autoTable({
      startY: 38,
      head: [['#', 'Staff', 'Full Name', 'Work Type', 'Client', 'Kebele', 'House', 'Phone', 'TV', 'Person', 'Email', 'Condition', 'Sign', 'Gov Letter', 'Payment', 'Date']],
      body: tableData,
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [196, 30, 58], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 38 }
    })
    
    doc.save('Incomplete_Unpaid_Report_TV_Revenue_EBC_Corporation.pdf')
    showNotification('✓ PDF file downloaded!', 'success')
  }

  const handlePrint = () => {
    window.print()
    showNotification('✓ Print dialog opened!', 'success')
  }

  return (
    <div className="unpaid-page">
      <div className="unpaid-container">
        <div className="unpaid-header">
          <div className="header-content">
            <h1 className="page-title">Unpaid Registrations</h1>
            <p className="page-subtitle">TV Revenue Request Letter Receive List</p>
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

        {/* Period Filter */}
        <div className="period-filter-section">
          <div className="filter-group">
            <label htmlFor="periodFilter">
              <span className="label-icon">📅</span>
              Filter by Period
            </label>
            <select
              id="periodFilter"
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="filter-select"
            >
              <option value="all">📅 All Time</option>
              <option value="today">📅 Today</option>
              <option value="thisweek">📅 This Week</option>
              <option value="lastweek">📅 Last Week</option>
              <option value="last10days">📅 Last 10 Days</option>
              <option value="thismonth">📅 This Month</option>
              <option value="lastmonth">📅 Last Month</option>
              <option value="yearly">📅 This Year</option>
              <option value="custom">📅 Custom Range</option>
            </select>
          </div>
          
          {periodFilter === 'custom' && (
            <div className="custom-date-range">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="date-input"
                placeholder="Start Date"
              />
              <span className="date-separator">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="date-input"
                placeholder="End Date"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading registrations...</p>
          </div>
        ) : registrations.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <h3>No Registrations Yet</h3>
            <p>Start by creating your first registration</p>
            <button className="btn-primary" onClick={handleNewRegistration}>
              Create Registration
            </button>
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
                  <th>Paid Amount</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredByPeriod()
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((registration, index) => {
                    const globalIndex = (currentPage - 1) * itemsPerPage + index
                    return (
                  <tr key={getRegistrationId(registration) || index}>
                    <td>{globalIndex + 1}</td>
                    <td>
                      <span className="unpaid-badge">UNPAID</span>
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
                      {registration.paid_amount ? (
                        <span className="badge-amount">
                          {registration.paid_amount} Birr
                        </span>
                      ) : (
                        <span className="badge-no-amount">N/A</span>
                      )}
                    </td>
                    <td>{formatDate(registration.registered_at)}</td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="btn-action btn-sms" 
                          title="Send SMS"
                          onClick={() => handleSmsClick(registration)}
                        >
                          📱
                        </button>
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
                          title="Mark as Paid"
                          onClick={() => handleTogglePaymentStatus(registration)}
                        >
                          💰
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
        {getFilteredByPeriod().length > itemsPerPage && (
          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            <span className="pagination-info">
              Page {currentPage} of {Math.ceil(getFilteredByPeriod().length / itemsPerPage)} 
              ({getFilteredByPeriod().length} total items)
            </span>
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(getFilteredByPeriod().length / itemsPerPage), prev + 1))}
              disabled={currentPage >= Math.ceil(getFilteredByPeriod().length / itemsPerPage)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal - Same as Registered page */}
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
                  <select id="work_type" name="work_type" value={editFormData.work_type} onChange={handleEditInputChange} required>
                    <option value="redsea-ebc">1. REDSEA with EBC Work</option>
                    <option value="sells-product">2. Sells Product Work</option>
                    <option value="other">3. Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="staff_id">Assigned Staff *</label>
                  <select id="staff_id" name="staff_id" value={editFormData.staff_id || (editFormData.staff_username === 'UNAPPROVED STAFF' ? 'unapproved' : editFormData.staff_username === 'Other' ? 'other' : editFormData.staff_username === 'All' ? 'all' : '')} onChange={handleEditInputChange} required>
                    <option value="">-- Select Staff --</option>
                    <option value="unapproved">UNAPPROVED STAFF</option>
                    {staffList.map(staff => (
                      <option key={staff.id} value={staff.id}>{staff.username} - {staff.full_name || 'N/A'} - {staff.phone || 'No Phone'}</option>
                    ))}
                    <option value="other">Other</option>
                    <option value="all">All</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="client_name">Client Name *</label>
                  <input type="text" id="client_name" name="client_name" value={editFormData.client_name} onChange={handleEditInputChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="kebele">Kebele *</label>
                  <select id="kebele" name="kebele" value={editFormData.kebele} onChange={handleEditInputChange} required>
                    <option value="">-- Select Kebele --</option>
                    <option value="All Woreda">All Woreda</option>
                    {[...Array(19)].map((_, i) => (<option key={i + 1} value={String(i + 1).padStart(2, '0')}>{String(i + 1).padStart(2, '0')}</option>))}
                    <option value="Sofi GM">Sofi GM</option>
                    <option value="Dire T GM">Dire T GM</option>
                    <option value="Erorr">Erorr</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="house_no">House No</label>
                  <input type="text" id="house_no" name="house_no" value={editFormData.house_no} onChange={handleEditInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="client_phone">Client Phone *</label>
                  <input type="tel" id="client_phone" name="client_phone" value={editFormData.client_phone} onChange={handleEditInputChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="tv_no">TV No *</label>
                  <select id="tv_no" name="tv_no" value={editFormData.tv_no} onChange={handleEditInputChange} required>
                    {[...Array(50)].map((_, i) => (<option key={i + 1} value={i + 1}>{i + 1} TV</option>))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="person">Person *</label>
                  <select id="person" name="person" value={editFormData.person} onChange={handleEditInputChange} required>
                    <option value="personal">Personal</option>
                    <option value="organization">Organization</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="client_email">Client Email</label>
                  <input type="email" id="client_email" name="client_email" value={editFormData.client_email} onChange={handleEditInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="condition">Condition *</label>
                  <select id="condition" name="condition" value={editFormData.condition} onChange={handleEditInputChange} required>
                    <option value="new">New</option>
                    <option value="old">Old</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="sign">Sign *</label>
                  <select id="sign" name="sign" value={editFormData.sign} onChange={handleEditInputChange} required>
                    <option value="sign">Sign</option>
                    <option value="unsign">Unsign</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="gov_letter">Gov Letter *</label>
                  <select id="gov_letter" name="gov_letter" value={editFormData.gov_letter} onChange={handleEditInputChange} required>
                    <option value="accept">Accept</option>
                    <option value="unaccept">Unaccept</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="paid_amount">Paid Amount</label>
                  <input type="number" id="paid_amount" name="paid_amount" value={editFormData.paid_amount} onChange={handleEditInputChange} min="0" step="0.01" />
                </div>
                <div className="form-group">
                  <label htmlFor="payment_status">Payment Status *</label>
                  <select id="payment_status" name="payment_status" value={editFormData.payment_status} onChange={handleEditInputChange} required>
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseEditModal}>Cancel</button>
                <button type="submit" className="btn-submit"><span className="btn-icon">✓</span>Update Registration</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMS Modal */}
      {showSmsModal && smsRegistration && (
        <div className="modal-overlay" onClick={handleCloseSmsModal}>
          <div className="modal-content sms-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📱 Send SMS Message</h2>
              <button className="modal-close" onClick={handleCloseSmsModal}>✕</button>
            </div>
            
            <div className="sms-modal-body">
              <div className="sms-client-info">
                <h3>Client Information</h3>
                <p><strong>Name:</strong> {smsRegistration.client_name}</p>
                <p><strong>Phone:</strong> {smsRegistration.client_phone}</p>
                <p><strong>Kebele:</strong> {smsRegistration.kebele}</p>
              </div>

              <div className="sms-message-section">
                <h3>Select Message Type</h3>
                
                <div className="sms-radio-group">
                  <label className="sms-radio-label">
                    <input
                      type="radio"
                      name="messageType"
                      value="default"
                      checked={smsMessageType === 'default'}
                      onChange={(e) => setSmsMessageType(e.target.value)}
                    />
                    <span className="radio-text">
                      <strong>Default Message (Amharic & English)</strong>
                      <p className="message-preview">
                        ኢትዮጵያ ብሮድካስት ኮርፖሬሽን የአመታዊ የቴሌቪዥን ግብር እና ፍቃድ ክፍያዎን በወቅቱ እንዲከፍሉ እናስታውስዎታለን
                        <br/><br/>
                        Ethiopia Broadcast Corporation we remind you to pay annual television tax and license fees to Ethiopian Broadcasting Corporation on time
                      </p>
                    </span>
                  </label>

                  <label className="sms-radio-label">
                    <input
                      type="radio"
                      name="messageType"
                      value="custom"
                      checked={smsMessageType === 'custom'}
                      onChange={(e) => setSmsMessageType(e.target.value)}
                    />
                    <span className="radio-text">
                      <strong>Custom Message</strong>
                    </span>
                  </label>
                </div>

                {smsMessageType === 'custom' && (
                  <div className="custom-message-input">
                    <label htmlFor="customMessage">Enter your custom message:</label>
                    <textarea
                      id="customMessage"
                      value={customSmsMessage}
                      onChange={(e) => setCustomSmsMessage(e.target.value)}
                      placeholder="Type your custom SMS message here..."
                      rows="4"
                    />
                  </div>
                )}
              </div>

              <div className="sms-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseSmsModal}>
                  Cancel
                </button>
                <button type="button" className="btn-send-sms" onClick={handleSendSms}>
                  <span className="btn-icon">📱</span>
                  Send SMS
                </button>
              </div>
            </div>
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

export default Unpaid
