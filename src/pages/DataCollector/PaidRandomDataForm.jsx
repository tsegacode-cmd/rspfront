import { useState, useEffect } from 'react';
import { userAPI, dataRegistrationAPI, rootAPI } from '../../services/api';
import './PaidRandomDataForm.css';

// Helper function to safely get registration ID (MongoDB compatible)
const getRegistrationId = (registration) => {
  let id = null;
  
  if (registration._id) {
    id = registration._id;
  } else if (registration.id) {
    id = registration.id;
  }
  
  if (id && typeof id === 'object') {
    if (id.$oid) {
      id = id.$oid;
    } else if (id.toString) {
      id = id.toString();
    }
  }
  
  if (id) {
    id = String(id).trim();
  }
  
  return id;
}

function PaidRandomDataForm() {
  const [workType, setWorkType] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [allRegistrations, setAllRegistrations] = useState([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState([]);
  const [selectedRegistration, setSelectedRegistration] = useState('');
  const [selectedKebele, setSelectedKebele] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('unpaid');
  const [notification, setNotification] = useState(null);
  
  const [formData, setFormData] = useState({
    clientName: '',
    kebele: '',
    houseNo: '',
    clientPhone: '',
    tvNo: '1',
    person: 'personal',
    clientEmail: '',
    condition: 'new',
    sign: 'sign',
    govLetter: 'accept',
    paidAmount: '',
    registrationDateTime: ''
  });
  
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Sidebar state
  const [sidebarCurrentPage, setSidebarCurrentPage] = useState(1);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [sidebarPeriodFilter, setSidebarPeriodFilter] = useState('all');
  const [sidebarCustomStartDate, setSidebarCustomStartDate] = useState('');
  const [sidebarCustomEndDate, setSidebarCustomEndDate] = useState('');
  const itemsPerPage = 13;
  
  // Edit/Delete modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState(null);
  
  const editIconVisibility = 'visible';
  const deleteIconVisibility = 'visible';
  
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
  });

  useEffect(() => {
    loadAllRegistrations();
  }, []);

  const loadAllRegistrations = async () => {
    try {
      const response = await dataRegistrationAPI.getAllRegistrations();
      
      if (response.success) {
        setAllRegistrations(response.data);
        applyFilters('', 'paid', response.data);
      }
    } catch (error) {
      console.error('Failed to load registrations:', error);
      setAllRegistrations([]);
      setFilteredRegistrations([]);
    }
  };

  const applyFilters = (kebele, paymentStatus, registrations = allRegistrations) => {
    let filtered = [...registrations];

    // Filter by Payment Status
    if (paymentStatus && paymentStatus !== 'all') {
      filtered = filtered.filter(reg => reg.payment_status === paymentStatus);
    }

    // Filter by Kebele
    if (kebele && kebele !== '' && kebele !== 'all') {
      filtered = filtered.filter(reg => 
        reg.kebele?.toLowerCase() === kebele.toLowerCase()
      );
    }

    setFilteredRegistrations(filtered);
  };

  const handleKebeleFilter = (e) => {
    const kebele = e.target.value;
    setSelectedKebele(kebele);
    applyFilters(kebele, paymentStatusFilter);
  };

  const handlePaymentStatusFilter = (e) => {
    const status = e.target.value;
    setPaymentStatusFilter(status);
    applyFilters(selectedKebele, status);
  };

  const handleRegistrationClick = (registration) => {
    setSelectedRegistration(registration);
    // Auto-fill first row with selected registration data
    const newData = [...formData];
    newData[0] = {
      no: 1,
      clientPayerName: registration.client_name || '',
      harar: '',
      kebele: registration.kebele || '',
      houseNo: registration.house_no || '',
      voucherNo: '',
      paidYear: new Date().getFullYear().toString(),
      commissionFeeAmount: registration.paid_amount || '',
      collectedAmount: registration.paid_amount || ''
    };
    setFormData(newData);
  };

  const handleInputChange = (index, field, value) => {
    const newData = [...formData];
    newData[index][field] = value;
    setFormData(newData);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    alert('ውሂቡ ተቀምጧል! (Data saved!)');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    alert('PDF ማውጫ ተግባር በማያትክ ላይ ነው (PDF export functionality is in development)');
  };

  const handleExportExcel = () => {
    alert('Excel ማውጫ ተግባር በማያትክ ላይ ነው (Excel export functionality is in development)');
  };

  const totalPages = 4; // Assuming 100 total records with 25 per page

  // Calculate unpaid and paid counts
  const unpaidCount = filteredRegistrations?.filter(r => r.payment_status === 'unpaid').length || 0;
  const paidCount = filteredRegistrations?.filter(r => r.payment_status === 'paid').length || 0;

  return (
    <div className="paid-random-data-form">
      <div className="page-layout">
        {/* Left Sidebar - Registration List */}
        <div className="left-sidebar">
          <div className="sidebar-header">
            <div>
              <h3>Registrations</h3>
              <div className="status-indicators">
                <span className="status-badge unpaid">⏳ {unpaidCount}</span>
                <span className="status-badge paid">✓ {paidCount}</span>
              </div>
            </div>
          </div>
          
          {/* Sidebar Search */}
          <div className="sidebar-search">
            <input
              type="text"
              placeholder="🔍 Search by name, phone, kebele..."
              value={sidebarSearchQuery}
              onChange={(e) => {
                setSidebarSearchQuery(e.target.value);
                setSidebarCurrentPage(1);
              }}
              className="sidebar-search-input"
            />
          </div>
          
          {/* Sidebar Period Filter */}
          <div className="sidebar-filter">
            <select
              value={sidebarPeriodFilter}
              onChange={(e) => {
                setSidebarPeriodFilter(e.target.value);
                setSidebarCurrentPage(1);
              }}
              className="sidebar-filter-select"
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
            
            {sidebarPeriodFilter === 'custom' && (
              <div className="sidebar-custom-dates">
                <input
                  type="date"
                  value={sidebarCustomStartDate}
                  onChange={(e) => setSidebarCustomStartDate(e.target.value)}
                  className="sidebar-date-input"
                  placeholder="Start Date"
                />
                <input
                  type="date"
                  value={sidebarCustomEndDate}
                  onChange={(e) => setSidebarCustomEndDate(e.target.value)}
                  className="sidebar-date-input"
                  placeholder="End Date"
                />
              </div>
            )}
          </div>
          
          <div className="registration-list">
            {(() => {
              let displayRegistrations = Array.isArray(filteredRegistrations) ? filteredRegistrations : [];
              
              // Apply search filter
              if (sidebarSearchQuery) {
                const query = sidebarSearchQuery.toLowerCase();
                displayRegistrations = displayRegistrations.filter(reg =>
                  reg.client_name?.toLowerCase().includes(query) ||
                  reg.client_phone?.toLowerCase().includes(query) ||
                  reg.kebele?.toLowerCase().includes(query)
                );
              }
              
              // Apply period filter
              if (sidebarPeriodFilter && sidebarPeriodFilter !== 'all') {
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                
                displayRegistrations = displayRegistrations.filter(reg => {
                  const regDate = new Date(reg.created_at || reg.registered_at);
                  
                  switch (sidebarPeriodFilter) {
                    case 'today':
                      return regDate >= today;
                    case 'thisweek': {
                      const weekStart = new Date(today);
                      weekStart.setDate(today.getDate() - today.getDay());
                      return regDate >= weekStart;
                    }
                    case 'lastweek': {
                      const lastWeekStart = new Date(today);
                      lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
                      const lastWeekEnd = new Date(lastWeekStart);
                      lastWeekEnd.setDate(lastWeekStart.getDate() + 7);
                      return regDate >= lastWeekStart && regDate < lastWeekEnd;
                    }
                    case 'last10days': {
                      const tenDaysAgo = new Date(today);
                      tenDaysAgo.setDate(today.getDate() - 10);
                      return regDate >= tenDaysAgo;
                    }
                    case 'thismonth': {
                      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                      return regDate >= monthStart;
                    }
                    case 'lastmonth': {
                      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
                      return regDate >= lastMonthStart && regDate < lastMonthEnd;
                    }
                    case 'yearly': {
                      const yearStart = new Date(now.getFullYear(), 0, 1);
                      return regDate >= yearStart;
                    }
                    case 'custom': {
                      if (sidebarCustomStartDate && sidebarCustomEndDate) {
                        const start = new Date(sidebarCustomStartDate);
                        const end = new Date(sidebarCustomEndDate);
                        end.setHours(23, 59, 59, 999);
                        return regDate >= start && regDate <= end;
                      }
                      return true;
                    }
                    default:
                      return true;
                  }
                });
              }
              
              // Apply pagination
              const startIndex = (sidebarCurrentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedRegistrations = displayRegistrations.slice(startIndex, endIndex);
              
              return paginatedRegistrations.map(reg => {
                const regId = (reg.id || reg._id)?.toString();
                const isActive = selectedRegistration?.id === reg.id;
                return (
                  <div 
                    key={regId} 
                    className={`registration-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleRegistrationClick(reg)}
                  >
                    <div className="item-header">
                      <span className={`status-dot ${reg.payment_status}`}></span>
                      <span className="client-name">{reg.client_name}</span>
                    </div>
                    <div className="item-details">
                      <span className="kebele">📍 {reg.kebele}</span>
                      <span className="phone">📞 {reg.client_phone}</span>
                    </div>
                    <div className="item-footer">
                      <span className="tv-count">📺 {reg.tv_no} TV</span>
                      <span className={`payment-badge ${reg.payment_status}`}>
                        {reg.payment_status === 'paid' ? '✓ PAID' : '⏳ UNPAID'}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          
          {/* Sidebar Pagination */}
          {(() => {
            let displayRegistrations = Array.isArray(filteredRegistrations) ? filteredRegistrations : [];
            
            if (sidebarSearchQuery) {
              const query = sidebarSearchQuery.toLowerCase();
              displayRegistrations = displayRegistrations.filter(reg =>
                reg.client_name?.toLowerCase().includes(query) ||
                reg.client_phone?.toLowerCase().includes(query) ||
                reg.kebele?.toLowerCase().includes(query)
              );
            }
            
            const totalPages = Math.ceil(displayRegistrations.length / itemsPerPage);
            
            if (displayRegistrations.length > itemsPerPage) {
              return (
                <div className="sidebar-pagination">
                  <button
                    className="pagination-btn-small"
                    onClick={() => setSidebarCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={sidebarCurrentPage === 1}
                  >
                    ←
                  </button>
                  <span className="pagination-info-small">
                    {sidebarCurrentPage}/{totalPages}
                  </span>
                  <button
                    className="pagination-btn-small"
                    onClick={() => setSidebarCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={sidebarCurrentPage === totalPages}
                  >
                    →
                  </button>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Filter Section */}
          <div className="filter-section">
            <div className="dropdown-group">
              <label htmlFor="paymentStatusFilter">
                <span className="label-icon">💰</span>
                Payment Status Filter
              </label>
              <select
                id="paymentStatusFilter"
                value={paymentStatusFilter}
                onChange={handlePaymentStatusFilter}
                className="dropdown-select"
              >
                <option value="all">All (Paid + Unpaid)</option>
                <option value="paid">Paid Only</option>
                <option value="unpaid">Unpaid Only</option>
              </select>
            </div>

            <div className="dropdown-group">
              <label htmlFor="kebeleFilter">
                <span className="label-icon">📍</span>
                Filter by Kebele
              </label>
              <select
                id="kebeleFilter"
                value={selectedKebele}
                onChange={handleKebeleFilter}
                className="dropdown-select"
              >
                <option value="">All Woreda</option>
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
                <option value="sofi gm">Sofi GM</option>
                <option value="dire t gm">Dire T GM</option>
                <option value="erorr">Erorr</option>
              </select>
            </div>
          </div>

      {/* Header Section */}
      <div className="form-header">
        <div className="header-logo">
          <div className="logo-circle">
            <span className="logo-text">EBC</span>
          </div>
        </div>
        <div className="header-content">
          <h1 className="page-title">ETHIOPIA BRODCAST CORPORATION</h1>
          <h2 className="page-subtitle">
            YE TELEVISION MZGEBA ASAMNO LEMASKEFEL YE BET LEBET QSKESA BEKOMISHN LEMISERU MAHBERAT YEKFYA METEYEQIYA QTS
          </h2>
        </div>
        <div className="header-date">
          <div className="date-box">
            <span className="date-label">ቀን</span>
            <span className="date-value">{new Date().toLocaleDateString('am-ET')}</span>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="data-form">
        <div className="form-container">
          {/* Table Header */}
          <div className="table-header">
            <div className="table-header-left">
              <div className="header-column">NO</div>
              <div className="header-column">CLIENT PAYER NAME</div>
              <div className="header-column">HARAR</div>
              <div className="header-column">KEBELE</div>
              <div className="header-column">HOUSE NO</div>
            </div>
            <div className="table-header-right">
              <div className="header-column">VOUCHER NO</div>
              <div className="header-column">PAID YEAR</div>
              <div className="header-column">COMMISSION FEE AMOUNT</div>
              <div className="header-column">COLLECTED AMOUNT</div>
            </div>
          </div>

          {/* Table Rows */}
          <div className="table-rows">
            {formData.map((row, index) => (
              <div key={index} className="table-row">
                <div className="row-left">
                  <input
                    type="text"
                    value={row.teraQutr}
                    onChange={(e) => handleInputChange(index, 'teraQutr', e.target.value)}
                    className="form-input"
                    placeholder="TERA QUTR"
                  />
                  <input
                    type="text"
                    value={row.yeDebegnaKefaySm}
                    onChange={(e) => handleInputChange(index, 'yeDebegnaKefaySm', e.target.value)}
                    className="form-input"
                    placeholder="YE DEBEGNA KEFAY SM"
                  />
                  <input
                    type="text"
                    value={row.harar}
                    onChange={(e) => handleInputChange(index, 'harar', e.target.value)}
                    className="form-input"
                    placeholder="HARAR"
                  />
                  <input
                    type="text"
                    value={row.kebele}
                    onChange={(e) => handleInputChange(index, 'kebele', e.target.value)}
                    className="form-input"
                    placeholder="KEBELE"
                  />
                  <input
                    type="text"
                    value={row.yeBetKutr}
                    onChange={(e) => handleInputChange(index, 'yeBetKutr', e.target.value)}
                    className="form-input"
                    placeholder="YEBET KUTR"
                  />
                  <input
                    type="text"
                    value={row.yeKefelubetDeresegnKutr}
                    onChange={(e) => handleInputChange(index, 'yeKefelubetDeresegnKutr', e.target.value)}
                    className="form-input"
                    placeholder="YEKEFELUBET DERESEGN KUTR"
                  />
                  <input
                    type="text"
                    value={row.yeKefelebetZemen}
                    onChange={(e) => handleInputChange(index, 'yeKefelebetZemen', e.target.value)}
                    className="form-input"
                    placeholder="YEKEFELEBET ZEMEN"
                  />
                </div>
                <div className="row-right">
                  <input
                    type="text"
                    value={row.yeKomishnKfyaMeten}
                    onChange={(e) => handleInputChange(index, 'yeKomishnKfyaMeten', e.target.value)}
                    className="form-input"
                    placeholder="YE KOMISHN KFYA METEN"
                  />
                  <input
                    type="text"
                    value={row.yeZemenu}
                    onChange={(e) => handleInputChange(index, 'yeZemenu', e.target.value)}
                    className="form-input"
                    placeholder="YEZEMENU"
                  />
                  <input
                    type="text"
                    value={row.wzf}
                    onChange={(e) => handleInputChange(index, 'wzf', e.target.value)}
                    className="form-input"
                    placeholder="WZF"
                  />
                  <input
                    type="text"
                    value={row.teqlalaDmr}
                    onChange={(e) => handleInputChange(index, 'teqlalaDmr', e.target.value)}
                    className="form-input"
                    placeholder="TEQLALA DMR"
                  />
                  <input
                    type="text"
                    value={row.yeTesesebebeBr}
                    onChange={(e) => handleInputChange(index, 'yeTesesebebeBr', e.target.value)}
                    className="form-input"
                    placeholder="YETESEBESEBE BR"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            ቀዳሚ
          </button>
          
          <div className="page-numbers">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              if (pageNum > totalPages) return null;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`page-number ${currentPage === pageNum ? 'active' : ''}`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            ቀጣይ
          </button>
          
          <div className="page-info">
            ገጽ {currentPage} ከ {totalPages}
          </div>
        </div>

        {/* Footer Section */}
        <div className="form-footer">
          <div className="footer-line"></div>
          
          <div className="footer-items">
            <div className="footer-item">
              <span className="footer-label">YAZEGAJEW SM</span>
              <span className="footer-dash">________________</span>
            </div>
            <div className="footer-item">
              <span className="footer-label">YESAYNS HALAFI SM</span>
              <span className="footer-dash">________________</span>
            </div>
            <div className="footer-item">
              <span className="footer-label">YE FAYNANS HALAFI SM</span>
              <span className="footer-dash">________________</span>
            </div>
          </div>
          
          <div className="firma-section">
            <div className="firma-item">
              <span className="firma-label">FIRMA</span>
              <span className="firma-dash">________________</span>
            </div>
            <div className="firma-item">
              <span className="firma-label">FIRMA</span>
              <span className="firma-dash">________________</span>
            </div>
            <div className="firma-item">
              <span className="firma-label">FIRMA</span>
              <span className="firma-dash">________________</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button type="submit" className="btn btn-save">
            ውሂቡን አስቀምጥ
          </button>
          <button type="button" onClick={handlePrint} className="btn btn-print">
            አትም
          </button>
          <button type="button" onClick={handleExportPDF} className="btn btn-pdf">
            PDF አውጣ
          </button>
          <button type="button" onClick={handleExportExcel} className="btn btn-excel">
            Excel አውጣ
          </button>
          <button type="button" onClick={() => setFormData(Array.from({ length: 25 }, (_, i) => ({
            no: i + 1,
            clientPayerName: '',
            harar: '',
            kebele: '',
            houseNo: '',
            voucherNo: '',
            paidYear: '',
            commissionFeeAmount: '',
            collectedAmount: ''
          })))} className="btn btn-clear">
            አጽዳ
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>
  );
}

export default PaidRandomDataForm;