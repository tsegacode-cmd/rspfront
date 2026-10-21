import { useState, useEffect, useRef } from 'react'
import { dataRegistrationAPI, userAPI } from '../../services/api'
import './NeedApproval.css'

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

function NeedApproval() {
  const [registrations, setRegistrations] = useState([])
  const [filteredRegistrations, setFilteredRegistrations] = useState([])
  const [allRegistrationsForSearch, setAllRegistrationsForSearch] = useState([]) // ALL data for sidebar search
  const [sidebarFilteredList, setSidebarFilteredList] = useState([]) // Sidebar filtered results
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState(null)
  
  // Refs for click-outside detection
  const detailPanelRef = useRef(null)
  const sidebarRef = useRef(null)
  
  // Inline editing
  const [editingRowId, setEditingRowId] = useState(null)
  const [tempStaffSelection, setTempStaffSelection] = useState({})
  
  // Filters - ALL in top header
  const [searchQuery, setSearchQuery] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedKebele, setSelectedKebele] = useState('')
  const [selectedWorkType, setSelectedWorkType] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('')
  
  // Pagination - 25 items per page
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 25
  
  // Selected item in sidebar
  const [selectedItemId, setSelectedItemId] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    applyFilters()
    applySidebarFilters() // Apply filters to sidebar separately
  }, [registrations, allRegistrationsForSearch, searchQuery, periodFilter, customStartDate, customEndDate, selectedKebele, selectedWorkType, selectedStaff])

  // Click outside to close detail panel
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        selectedItemId &&
        detailPanelRef.current &&
        sidebarRef.current &&
        !detailPanelRef.current.contains(event.target) &&
        !sidebarRef.current.contains(event.target)
      ) {
        setSelectedItemId('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [selectedItemId])

  const applySidebarFilters = () => {
    // Filter ALL registrations for sidebar based on search criteria
    let sidebarFiltered = [...allRegistrationsForSearch]

    // Search filter - PRIORITIZE: Phone No, Kebele, House No, Name, Staff Name
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      sidebarFiltered = sidebarFiltered.filter(reg =>
        // PRIMARY SEARCH FIELDS (Phone, Kebele, House No, Name, Staff Name)
        reg.client_phone?.toLowerCase().includes(query) ||
        reg.kebele?.toLowerCase().includes(query) ||
        reg.house_no?.toLowerCase().includes(query) ||
        reg.client_name?.toLowerCase().includes(query) ||
        reg.staff_username?.toLowerCase().includes(query) ||
        reg.staff_full_name?.toLowerCase().includes(query)
      )
    }

    // Kebele filter
    if (selectedKebele) {
      sidebarFiltered = sidebarFiltered.filter(reg => reg.kebele === selectedKebele)
    }

    // Work Type filter
    if (selectedWorkType) {
      sidebarFiltered = sidebarFiltered.filter(reg => reg.work_type === selectedWorkType)
    }

    // Staff filter
    if (selectedStaff) {
      sidebarFiltered = sidebarFiltered.filter(reg => reg.staff_username === selectedStaff)
    }
    
    // Period filter
    if (periodFilter !== 'all') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      
      sidebarFiltered = sidebarFiltered.filter(reg => {
        const regDate = new Date(reg.created_at || reg.registered_at)
        
        switch (periodFilter) {
          case 'today':
            return regDate >= today
          case 'week': {
            const weekStart = new Date(today)
            weekStart.setDate(today.getDate() - today.getDay())
            return regDate >= weekStart
          }
          case 'month': {
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

    setSidebarFilteredList(sidebarFiltered)
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [regResponse, staffResponse] = await Promise.all([
        dataRegistrationAPI.getAllRegistrations(),
        userAPI.getAllUsers()
      ])
      
      if (regResponse.success) {
        // Store ALL registrations for sidebar filtering
        const allRegs = regResponse.data || []
        
        // Filter only UNAPPROVED STAFF for the main Need Approval list
        const unapprovedRegs = allRegs.filter(
          reg => reg.staff_username === 'Unapproval Staff' || reg.approval_status === 'pending'
        )
        
        // Set registrations to UNAPPROVED STAFF only
        setRegistrations(unapprovedRegs.length > 0 ? unapprovedRegs : [])
        setFilteredRegistrations(unapprovedRegs.length > 0 ? unapprovedRegs : [])
        
        // Store all registrations separately for sidebar search
        setAllRegistrationsForSearch(allRegs)
      }
      
      if (staffResponse.success) {
        setStaffList(staffResponse.data)
      }
    } catch (error) {
      showNotification('Failed to load data: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...registrations]

    // Search filter ONLY - PRIORITIZE: Phone No, Kebele, House No, Name, Staff Name
    // Dropdown filters (Kebele, Work Type, Staff, Period) do NOT affect main list
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(reg =>
        // PRIMARY SEARCH FIELDS (Phone, Kebele, House No, Name, Staff Name)
        reg.client_phone?.toLowerCase().includes(query) ||
        reg.kebele?.toLowerCase().includes(query) ||
        reg.house_no?.toLowerCase().includes(query) ||
        reg.client_name?.toLowerCase().includes(query) ||
        reg.staff_username?.toLowerCase().includes(query) ||
        reg.staff_full_name?.toLowerCase().includes(query)
      )
    }

    // NOTE: Kebele, Work Type, Staff, and Period filters are NOT applied to main list
    // They only affect the sidebar filtered list

    setFilteredRegistrations(filtered)
    setCurrentPage(1)
  }

  const handleInlineApprove = async (registration) => {
    const regId = getRegistrationId(registration)
    if (!regId || !tempStaffSelection[regId]) {
      showNotification('Please select a staff member', 'error')
      return
    }

    try {
      const selectedStaffInfo = staffList.find(
        staff => String(staff.id || staff._id) === String(tempStaffSelection[regId])
      )

      if (!selectedStaffInfo) {
        showNotification('Invalid staff selection', 'error')
        return
      }

      const updateData = {
        staff_id: selectedStaffInfo.id || selectedStaffInfo._id,
        staff_username: selectedStaffInfo.username,
        staff_full_name: selectedStaffInfo.full_name || 'N/A'
      }

      const response = await dataRegistrationAPI.updateRegistration(regId, updateData)
      
      if (response.success) {
        showNotification('✓ Staff assigned successfully!', 'success')
        setEditingRowId(null)
        setTempStaffSelection({})
        await loadData()
      }
    } catch (error) {
      showNotification(error.message || 'Failed to update registration', 'error')
    }
  }

  const clearAllFilters = () => {
    setSearchQuery('')
    setPeriodFilter('all')
    setCustomStartDate('')
    setCustomEndDate('')
    setSelectedKebele('')
    setSelectedWorkType('')
    setSelectedStaff('')
    setCurrentPage(1)
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Get unique kebeles and work types from ALL registrations for filters
  const uniqueKebeles = [...new Set(allRegistrationsForSearch.map(r => r.kebele).filter(Boolean))]
  const uniqueWorkTypes = [...new Set(allRegistrationsForSearch.map(r => r.work_type).filter(Boolean))]

  // Pagination for sidebar filtered list
  const sidebarTotalPages = Math.ceil(sidebarFilteredList.length / itemsPerPage)
  const sidebarStartIndex = (currentPage - 1) * itemsPerPage
  const sidebarCurrentPageData = sidebarFilteredList.slice(sidebarStartIndex, sidebarStartIndex + itemsPerPage)
  
  // Pagination for Need Approval list (main content) - 25 rows per page
  const totalPages = Math.ceil(filteredRegistrations.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const currentPageData = filteredRegistrations.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="need-approval-redesign">
      {/* Compact Top Header with ALL Filters */}
      <div className="compact-top-header">
        <h2>Need Approval</h2>
        
        <div className="compact-filters">
          <input
            type="text"
            placeholder="Search by Phone, Kebele, House No, Name, Staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="filter-input"
          />
          
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="filter-select">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom</option>
          </select>
          
          {periodFilter === 'custom' && (
            <>
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="filter-date" />
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="filter-date" />
            </>
          )}
          
          <select value={selectedKebele} onChange={(e) => setSelectedKebele(e.target.value)} className="filter-select">
            <option value="">All Kebeles</option>
            {uniqueKebeles.map(k => <option key={k} value={k}>Kebele {k}</option>)}
          </select>
          
          <select value={selectedWorkType} onChange={(e) => setSelectedWorkType(e.target.value)} className="filter-select">
            <option value="">All Work Types</option>
            {uniqueWorkTypes.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          
          <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} className="filter-select">
            <option value="">All Staff</option>
            {staffList.map(s => <option key={s.id || s._id} value={s.username}>{s.full_name || s.username}</option>)}
          </select>
          
          <button onClick={clearAllFilters} className="clear-btn">Clear</button>
          
          <span className="results-count">
            Sidebar: {sidebarFilteredList.length} | Need Approval: {filteredRegistrations.length} | Page {currentPage}/{sidebarTotalPages}
          </span>
        </div>
      </div>

      {/* Main Layout: Sidebar + Detail Panel + Content */}
      <div className="main-layout">
        {/* Left Sidebar - Auto-filtered List from ALL registrations */}
        <div className="sidebar-list" ref={sidebarRef}>
          <div className="sidebar-header">
            <h3>List ({sidebarFilteredList.length})</h3>
          </div>
          
          <div className="sidebar-items">
            {sidebarCurrentPageData.map((reg) => {
              const regId = getRegistrationId(reg)
              const isUnapproved = reg.staff_username === 'UNAPPROVED STAFF'
              return (
                <div 
                  key={regId} 
                  className={`sidebar-item ${selectedItemId === regId ? 'active' : ''} ${isUnapproved ? 'unapproved' : ''}`}
                  onClick={() => setSelectedItemId(regId)}
                >
                  <div className="item-name">{reg.client_name}</div>
                  <div className="item-info">
                    <span>K:{reg.kebele}</span>
                    <span>H:{reg.house_no}</span>
                  </div>
                  <div className="item-staff">
                    <span className={isUnapproved ? 'badge-unapproved' : 'badge-approved'}>
                      {reg.staff_username}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          
          {sidebarTotalPages > 1 && (
            <div className="sidebar-pagination">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                ←
              </button>
              <span>{currentPage}/{sidebarTotalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(sidebarTotalPages, p + 1))} disabled={currentPage === sidebarTotalPages}>
                →
              </button>
            </div>
          )}
        </div>

        {/* Detail Panel - Shows info when clicking sidebar item */}
        <div className="detail-panel" ref={detailPanelRef}>
          {selectedItemId ? (
            (() => {
              const selectedReg = sidebarFilteredList.find(r => getRegistrationId(r) === selectedItemId)
              if (!selectedReg) return <div className="no-detail">Item not found</div>
              
              return (
                <>
                  <h3>Registration Details</h3>
                  <div className="detail-row">
                    <span className="detail-label">Client Name:</span>
                    <span className="detail-value">{selectedReg.client_name || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Phone:</span>
                    <span className="detail-value">{selectedReg.client_phone || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Kebele:</span>
                    <span className="detail-value">{selectedReg.kebele || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">House No:</span>
                    <span className="detail-value">{selectedReg.house_no || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Work Type:</span>
                    <span className="detail-value">{selectedReg.work_type || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">TV No:</span>
                    <span className="detail-value">{selectedReg.tv_no || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Staff:</span>
                    <span className="detail-value">{selectedReg.staff_username || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Staff Name:</span>
                    <span className="detail-value">{selectedReg.staff_full_name || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Registered:</span>
                    <span className="detail-value">{formatDate(selectedReg.registered_at)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Person Type:</span>
                    <span className="detail-value">{selectedReg.person_type || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Payment Period:</span>
                    <span className="detail-value">{selectedReg.payment_period || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Amount:</span>
                    <span className="detail-value">{selectedReg.amount || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Receipt Status:</span>
                    <span className="detail-value">{selectedReg.receipt_status || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Amount Status:</span>
                    <span className="detail-value">{selectedReg.amount_status || 'N/A'}</span>
                  </div>
                </>
              )
            })()
          ) : (
            <div className="no-detail">Click an item to view details</div>
          )}
        </div>

        {/* Right Content - Need Approval Table (25 rows per page) */}
        <div className="content-area">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : filteredRegistrations.length === 0 ? (
            <div className="empty">No UNAPPROVED STAFF registrations found</div>
          ) : (
            <>
              <div className="table-header">
                <h3>Need Approval List ({filteredRegistrations.length} total)</h3>
                <div className="table-pagination">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    ← Prev
                  </button>
                  <span>Page {currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    Next →
                  </button>
                </div>
              </div>
              
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Client Name</th>
                    <th>Phone</th>
                    <th>Kebele</th>
                    <th>House No</th>
                    <th>Work Type</th>
                    <th>TV</th>
                    <th>Registered</th>
                    <th>Staff</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPageData.map((reg, index) => {
                    const regId = getRegistrationId(reg)
                    const isEditing = editingRowId === regId
                    const rowNumber = startIndex + index + 1
                    
                    return (
                      <tr key={regId} className={selectedItemId === regId ? 'selected' : ''}>
                        <td>{rowNumber}</td>
                        <td>{reg.client_name}</td>
                        <td>{reg.client_phone}</td>
                        <td>{reg.kebele}</td>
                        <td>{reg.house_no}</td>
                        <td>{reg.work_type}</td>
                        <td>{reg.tv_no}</td>
                        <td>{formatDate(reg.registered_at)}</td>
                        <td>
                          {isEditing ? (
                            <select
                              value={tempStaffSelection[regId] || ''}
                              onChange={(e) => setTempStaffSelection({...tempStaffSelection, [regId]: e.target.value})}
                              className="staff-select"
                            >
                              <option value="">Select Staff...</option>
                              {staffList.map(s => (
                                <option key={s.id || s._id} value={s.id || s._id}>
                                  {s.full_name || s.username}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="staff-badge">{reg.staff_username}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="action-btns">
                              <button onClick={() => handleInlineApprove(reg)} className="save-btn" disabled={!tempStaffSelection[regId]}>
                                ✓
                              </button>
                              <button onClick={() => { setEditingRowId(null); setTempStaffSelection({}) }} className="cancel-btn">
                                ✗
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingRowId(regId); setTempStaffSelection({[regId]: ''}) }} className="approve-btn">
                              Approve
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  )
}

export default NeedApproval
