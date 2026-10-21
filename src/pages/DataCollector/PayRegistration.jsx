import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { userAPI, dataRegistrationAPI, rootAPI } from '../../services/api'
import { useLanguage } from '../../contexts/LanguageContext'
import { t } from '../../utils/translations'
import { getIconVisibility } from '../../utils/permissions'
import { usePermissions } from '../../hooks/usePermissions'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import './PayRegistration.css'

// Helper function to safely get registration ID (MongoDB compatible)
const getRegistrationId = (registration) => {
  if (!registration) return null
  if (registration._id) {
    if (typeof registration._id === 'object' && registration._id.$oid) {
      return registration._id.$oid
    }
    return String(registration._id)
  }
  if (registration.id) return String(registration.id)
  return null
}

// Helper function to safely format dates
const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString()
  } catch (error) {
    return 'N/A'
  }
}

function PayRegistration() {
  const navigate = useNavigate()
  const { language } = useLanguage()
  const [workType, setWorkType] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('')
  const [staffList, setStaffList] = useState([])
  const [allRegistrations, setAllRegistrations] = useState([])
  const [filteredRegistrations, setFilteredRegistrations] = useState([])
  const [selectedRegistration, setSelectedRegistration] = useState('')
  const [selectedKebele, setSelectedKebele] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('unpaid')
  const [notification, setNotification] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25
  
  // Period filter
  const [periodFilter, setPeriodFilter] = useState('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  
  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingRegistration, setEditingRegistration] = useState(null)
  
  // Form data
  const [formData, setFormData] = useState({
    payerName: '',
    city: 'Harar',
    kebele: '',
    houseNo: '',
    receiptNo: '',
    clientPhone: '',
    tvNo: '1',
    person: 'personal',
    clientEmail: '',
    condition: 'new',
    sign: 'sign',
    govLetter: 'accept',
    paymentPeriodType: '2014-2018',
    paymentPeriodFrom: '2014',
    paymentPeriodTo: '2018',
    commissionPeriodAmount: '120',
    commissionFee: '320',
    commissionTotal: '440',
    collectedAmount: '440',
    registrationDateTime: ''
  })
  
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
    payment_status: 'paid'
  })

  // Use permission polling hook
  const { permissions } = usePermissions(true, 30000)
  const editIconVisibility = permissions.icons?.editIcon || 'visible'
  const deleteIconVisibility = permissions.icons?.deleteIcon || 'visible'

  useEffect(() => {
    loadStaffList()
    loadAllRegistrations()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [allRegistrations, selectedKebele, selectedStaff, paymentStatusFilter, periodFilter, customStartDate, customEndDate])

  const loadStaffList = async () => {
    try {
      let response = null
      try {
        response = await rootAPI.getUsers()
      } catch (rootError) {
        try {
          response = await userAPI.getAllUsers()
        } catch (userError) {
          console.error('Failed to load staff list:', userError)
          setStaffList([])
          return
        }
      }
      
      if (response && response.success && response.data && Array.isArray(response.data)) {
        setStaffList(response.data)
      } else {
        setStaffList([])
      }
    } catch (error) {
      console.error('Failed to load staff list:', error)
      setStaffList([])
    }
  }

  const loadAllRegistrations = async () => {
    try {
      const response = await dataRegistrationAPI.getAllRegistrations()
      if (response.success) {
        setAllRegistrations(response.data)
      }
    } catch (error) {
      console.error('Failed to load registrations:', error)
      setAllRegistrations([])
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...allRegistrations]

    // Filter by kebele
    if (selectedKebele) {
      filtered = filtered.filter(reg => reg.kebele === selectedKebele)
    }

    // Filter by staff
    if (selectedStaff) {
      filtered = filtered.filter(reg => reg.staff_username === selectedStaff)
    }

    // Filter by payment status
    if (paymentStatusFilter !== 'all') {
      filtered = filtered.filter(reg => reg.payment_status === paymentStatusFilter)
    }

    // Filter by period
    if (periodFilter !== 'all') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
      filtered = filtered.filter(reg => {
        const regDate = new Date(reg.created_at || reg.registered_at)
        
        switch (periodFilter) {
          case 'today':
            return regDate >= today
          case 'thisweek': {
            const weekStart = new Date(today)
            weekStart.setDate(today.getDate() - today.getDay())
            return regDate >= weekStart
          }
          case 'thismonth': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
            return regDate >= monthStart
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
    setCurrentPage(1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!workType || !selectedStaff) {
      showNotification('Please select both work type and staff', 'error')
      return
    }

    if (!formData.payerName || !formData.receiptNo) {
      showNotification('Please fill in required fields', 'error')
      return
    }

    try {
      const selectedStaffInfo = staffList.find(staff => staff.id.toString() === selectedStaff)
      
      const registrationData = {
        work_type: workType,
        staff_id: selectedStaff === 'other' ? null : parseInt(selectedStaff),
        staff_username: selectedStaffInfo ? selectedStaffInfo.username : 'Other',
        staff_full_name: selectedStaffInfo ? selectedStaffInfo.full_name : 'Other',
        client_name: formData.payerName,
        kebele: formData.kebele,
        house_no: formData.houseNo || null,
        client_phone: formData.clientPhone || null,
        tv_no: formData.tvNo || '1',
        person: formData.person,
        client_email: formData.clientEmail || null,
        condition: formData.condition,
        sign: formData.sign,
        gov_letter: formData.govLetter,
        paid_amount: formData.collectedAmount ? parseFloat(formData.collectedAmount) : null,
        payment_status: 'paid',
        registered_at: new Date().toISOString(),
        receipt_no: formData.receiptNo,
        payment_period_from: formData.paymentPeriodFrom,
        payment_period_to: formData.paymentPeriodTo,
        commission_period_amount: formData.commissionPeriodAmount ? parseFloat(formData.commissionPeriodAmount) : null,
        commission_fee: formData.commissionFee ? parseFloat(formData.commissionFee) : null,
        commission_total: formData.commissionTotal ? parseFloat(formData.commissionTotal) : null,
        collected_amount: formData.collectedAmount ? parseFloat(formData.collectedAmount) : null
      }

      const response = await dataRegistrationAPI.createRegistration(registrationData)
      
      if (response.success) {
        showNotification('Registration created successfully!', 'success')
        // Clear form
        setFormData({
          payerName: '',
          city: 'Harar',
          kebele: '',
          houseNo: '',
          receiptNo: '',
          clientPhone: '',
          tvNo: '1',
          person: 'personal',
          clientEmail: '',
          condition: 'new',
          sign: 'sign',
          govLetter: 'accept',
          paymentPeriodType: '2014-2018',
          paymentPeriodFrom: '2014',
          paymentPeriodTo: '2018',
          commissionPeriodAmount: '120',
          commissionFee: '320',
          commissionTotal: '440',
          collectedAmount: '440',
          registrationDateTime: ''
        })
        // Reload data
        await loadAllRegistrations()
      }
    } catch (error) {
      console.error('Failed to create registration:', error)
      showNotification(error.message || 'Failed to create registration', 'error')
    }
  }

  const handleEdit = (registration) => {
    setEditingRegistration(registration)
    setEditFormData({
      work_type: registration.work_type || '',
      staff_id: registration.staff_id || '',
      staff_username: registration.staff_username || '',
      staff_full_name: registration.staff_full_name || '',
      client_name: registration.client_name || '',
      kebele: registration.kebele || '',
      house_no: registration.house_no || '',
      client_phone: registration.client_phone || '',
      tv_no: registration.tv_no || '1',
      person: registration.person || 'personal',
      client_email: registration.client_email || '',
      condition: registration.condition || 'new',
      sign: registration.sign || 'sign',
      gov_letter: registration.gov_letter || 'accept',
      paid_amount: registration.paid_amount || '',
      payment_status: registration.payment_status || 'paid'
    })
    setShowEditModal(true)
  }

  const handleUpdateRegistration = async () => {
    try {
      const regId = getRegistrationId(editingRegistration)
      const response = await dataRegistrationAPI.updateRegistration(regId, editFormData)
      
      if (response.success) {
        showNotification('Registration updated successfully!', 'success')
        setShowEditModal(false)
        setEditingRegistration(null)
        await loadAllRegistrations()
      }
    } catch (error) {
      console.error('Failed to update registration:', error)
      showNotification(error.message || 'Failed to update registration', 'error')
    }
  }

  const handleDelete = async (registration) => {
    if (window.confirm('Are you sure you want to delete this registration?')) {
      try {
        const regId = getRegistrationId(registration)
        const response = await dataRegistrationAPI.deleteRegistration(regId)
        
        if (response.success) {
          showNotification('Registration deleted successfully!', 'success')
          await loadAllRegistrations()
        }
      } catch (error) {
        console.error('Failed to delete registration:', error)
        showNotification(error.message || 'Failed to delete registration', 'error')
      }
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Get unique kebeles for filter
  const uniqueKebeles = [...new Set(allRegistrations.map(r => r.kebele).filter(Boolean))]

  // Pagination
  const totalPages = Math.ceil(filteredRegistrations.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentPageData = filteredRegistrations.slice(startIndex, startIndex + itemsPerPage)

  const unpaidCount = filteredRegistrations?.filter(r => r.payment_status === 'unpaid').length || 0
  const paidCount = filteredRegistrations?.filter(r => r.payment_status === 'paid').length || 0

  return (
    <div className="pay-registration-page">
      <div className="page-layout">
        {/* Header */}
        <div className="page-header">
          <h1>{t('payRegistration', language)}</h1>
          <div className="header-actions">
            <button className="btn-need-approval" onClick={() => navigate('/need-approval')}>
              <span className="btn-icon">⚠️</span>
              <span className="btn-text">{t('needApproval', language)}</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-group">
            <label>Work Type:</label>
            <select value={workType} onChange={(e) => setWorkType(e.target.value)}>
              <option value="">Select Work Type</option>
              <option value="redsea-ebc">Red Sea EBC</option>
              <option value="sells-product">Sells Product</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Staff:</label>
            <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
              <option value="">Select Staff</option>
              {staffList.map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.full_name || staff.username}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Kebele:</label>
            <select value={selectedKebele} onChange={(e) => setSelectedKebele(e.target.value)}>
              <option value="">All Kebeles</option>
              {uniqueKebeles.map(kebele => (
                <option key={kebele} value={kebele}>Kebele {kebele}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Payment Status:</label>
            <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="paid">Paid ({paidCount})</option>
              <option value="unpaid">Unpaid ({unpaidCount})</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Period:</label>
            <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="thisweek">This Week</option>
              <option value="thismonth">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {periodFilter === 'custom' && (
            <>
              <div className="filter-group">
                <label>From:</label>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)} 
                />
              </div>
              <div className="filter-group">
                <label>To:</label>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)} 
                />
              </div>
            </>
          )}
        </div>

        {/* Registration Form */}
        {workType && selectedStaff && (
          <div className="registration-form">
            <h3>New Payment Registration</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Payer Name *</label>
                  <input 
                    type="text" 
                    value={formData.payerName}
                    onChange={(e) => setFormData({...formData, payerName: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <select 
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                  >
                    <option value="Harar">Harar</option>
                    <option value="Addis Ababa">Addis Ababa</option>
                    <option value="Dire Dawa">Dire Dawa</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Kebele</label>
                  <input 
                    type="text" 
                    value={formData.kebele}
                    onChange={(e) => setFormData({...formData, kebele: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>House No</label>
                  <input 
                    type="text" 
                    value={formData.houseNo}
                    onChange={(e) => setFormData({...formData, houseNo: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Receipt No *</label>
                  <input 
                    type="text" 
                    value={formData.receiptNo}
                    onChange={(e) => setFormData({...formData, receiptNo: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Client Phone</label>
                  <input 
                    type="text" 
                    value={formData.clientPhone}
                    onChange={(e) => setFormData({...formData, clientPhone: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Collected Amount</label>
                  <input 
                    type="number" 
                    value={formData.collectedAmount}
                    onChange={(e) => setFormData({...formData, collectedAmount: e.target.value})}
                  />
                </div>
              </div>
              <button type="submit" className="btn-submit">Create Registration</button>
            </form>
          </div>
        )}

        {/* Data Table */}
        <div className="data-section">
          <div className="table-header">
            <h3>Registrations ({filteredRegistrations.length})</h3>
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Client Name</th>
                    <th>Kebele</th>
                    <th>Phone</th>
                    <th>Receipt No</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Staff</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPageData.map((reg, index) => (
                    <tr key={getRegistrationId(reg)}>
                      <td>{startIndex + index + 1}</td>
                      <td>{reg.client_name}</td>
                      <td>{reg.kebele}</td>
                      <td>{reg.client_phone}</td>
                      <td>{reg.receipt_no}</td>
                      <td>{reg.paid_amount}</td>
                      <td>
                        <span className={`badge ${reg.payment_status}`}>
                          {reg.payment_status}
                        </span>
                      </td>
                      <td>{reg.staff_username}</td>
                      <td>{formatDate(reg.registered_at)}</td>
                      <td>
                        <div className="action-buttons">
                          {editIconVisibility === 'visible' && (
                            <button 
                              className="btn-edit" 
                              onClick={() => handleEdit(reg)}
                              title="Edit"
                            >
                              ✏️
                            </button>
                          )}
                          {deleteIconVisibility === 'visible' && (
                            <button 
                              className="btn-delete" 
                              onClick={() => handleDelete(reg)}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Edit Registration</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Client Name</label>
                <input 
                  type="text" 
                  value={editFormData.client_name}
                  onChange={(e) => setEditFormData({...editFormData, client_name: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Kebele</label>
                <input 
                  type="text" 
                  value={editFormData.kebele}
                  onChange={(e) => setEditFormData({...editFormData, kebele: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input 
                  type="text" 
                  value={editFormData.client_phone}
                  onChange={(e) => setEditFormData({...editFormData, client_phone: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input 
                  type="number" 
                  value={editFormData.paid_amount}
                  onChange={(e) => setEditFormData({...editFormData, paid_amount: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Payment Status</label>
                <select 
                  value={editFormData.payment_status}
                  onChange={(e) => setEditFormData({...editFormData, payment_status: e.target.value})}
                >
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={handleUpdateRegistration} className="btn-save">Save</button>
              <button onClick={() => setShowEditModal(false)} className="btn-cancel">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  )
}

export default PayRegistration