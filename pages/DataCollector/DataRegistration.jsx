import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { userAPI, dataRegistrationAPI } from '../../services/api'
import { useTranslation } from '../../hooks/useTranslation'
import { useStaffList } from '../../hooks/useStaffList'
import EthiopianDateInput from '../../components/EthiopianDateInput'
import PdfAttachmentField from './PdfAttachmentField'
import './DataRegistration.css'

function DataRegistration() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [workType, setWorkType] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('')
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [notification, setNotification] = useState(null)
  
  // Use staff list hook for mobile-optimized loading
  const { staffList, loading: staffLoading, error: staffError, refresh: refreshStaff, hasStaff } = useStaffList(true)
  
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
    registrationDateTime: '',
    receiptNo: '',
    transactionNumber: '',
    projectTitle: '',
    bankReceiptPdf: '',
    ownerReceiptPdf: '',
    registrationImage: ''
  })
  const [projectTitles, setProjectTitles] = useState([])

  useEffect(() => {
    let cancelled = false
    dataRegistrationAPI.getProjectTitleSettings().then(response => {
      if (cancelled) return
      const settings = response?.data || {}
      const titles = Array.isArray(settings.titles) ? settings.titles : []
      const defaultTitle = titles.includes(settings.defaultTitle) ? settings.defaultTitle : (titles[0] || '')
      setProjectTitles(titles)
      setFormData(current => ({ ...current, projectTitle: current.projectTitle || defaultTitle }))
    }).catch(error => {
      console.error('Could not load project titles for registration:', error)
      if (!cancelled) showNotification(`Could not load project titles: ${error.message}`, 'error')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handleQrScan = event => {
      const text = String(event.detail?.text || '').trim()
      if (!text) return
      setFormData(current => ({ ...current, transactionNumber: text }))
      showNotification('QR text added to transaction number.', 'success')
    }
    window.addEventListener('redsea:qr-code-scanned', handleQrScan)
    return () => window.removeEventListener('redsea:qr-code-scanned', handleQrScan)
  }, [])

  useEffect(() => {
    // Enable registration only when both dropdowns are selected and staff is loaded
    setRegistrationEnabled(workType !== '' && selectedStaff !== '' && hasStaff)
  }, [workType, selectedStaff, hasStaff])

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

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleClearForm = () => {
    setFormData({
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
      registrationDateTime: '',
      receiptNo: '',
      transactionNumber: '',
      projectTitle: formData.projectTitle,
      bankReceiptPdf: '',
      ownerReceiptPdf: '',
      registrationImage: ''
    })
  }

  const handleRegistrationImageChange = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showNotification('Choose a supported image file.', 'error')
      event.target.value = ''
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      showNotification('Choose an image smaller than 20 MB.', 'error')
      event.target.value = ''
      return
    }

    let bitmap
    try {
      bitmap = await createImageBitmap(file)
      const maxBytes = 2 * 1024 * 1024
      let width = bitmap.width
      let height = bitmap.height
      const scale = Math.min(1, 1600 / Math.max(width, height))
      width = Math.max(1, Math.round(width * scale))
      height = Math.max(1, Math.round(height * scale))

      let imageData = ''
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
        const quality = Math.max(0.45, 0.82 - attempt * 0.06)
        imageData = canvas.toDataURL('image/jpeg', quality)
        if (Math.floor((imageData.length - imageData.indexOf(',') - 1) * 0.75) <= maxBytes) break
        width = Math.max(1, Math.round(width * 0.8))
        height = Math.max(1, Math.round(height * 0.8))
      }
      if (Math.floor((imageData.length - imageData.indexOf(',') - 1) * 0.75) > maxBytes) {
        throw new Error('Image is too large to attach. Choose a smaller image.')
      }
      setFormData(current => ({ ...current, registrationImage: imageData }))
    } catch (error) {
      console.error('Could not prepare the registration image:', error)
      showNotification(error.message || 'Could not prepare the selected image.', 'error')
    } finally {
      bitmap?.close()
      event.target.value = ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const selectedStaffInfo = getSelectedStaffInfo()
      
      // Check for duplicate registration (same client phone)
      const existingRegistrations = await dataRegistrationAPI.getAllRegistrations()
      if (existingRegistrations.success) {
        const duplicate = existingRegistrations.data.find(reg => 
          reg.client_phone === formData.clientPhone && 
          reg.client_name.toLowerCase() === formData.clientName.toLowerCase()
        )
        
        if (duplicate) {
          showNotification('⚠️ ' + t('pages.dataRegistration.duplicateWarning'), 'error')
          console.log('Duplicate found:', duplicate)
          return // Stop registration
        }
      }
      
      const registrationData = {
        work_type: workType,
        staff_id: selectedStaff === 'other' || selectedStaff === 'all' ? null : parseInt(selectedStaff),
        staff_username: selectedStaffInfo ? selectedStaffInfo.username : (selectedStaff === 'other' ? 'Other' : 'All'),
        staff_full_name: selectedStaffInfo ? selectedStaffInfo.full_name : (selectedStaff === 'other' ? 'Other' : 'All'),
        client_name: formData.clientName,
        project_title: formData.projectTitle || null,
        receipt_no: formData.receiptNo.trim() || null,
        transaction_number: formData.transactionNumber.trim() || null,
        bank_receipt_pdf: formData.bankReceiptPdf || null,
        owner_receipt_pdf: formData.ownerReceiptPdf || null,
        registration_image: formData.registrationImage || null,
        kebele: formData.kebele,
        house_no: formData.houseNo || null,
        client_phone: formData.clientPhone,
        tv_no: formData.tvNo,
        person: formData.person,
        client_email: formData.clientEmail || null,
        condition: formData.condition,
        sign: formData.sign,
        gov_letter: formData.govLetter,
        paid_amount: formData.paidAmount ? parseFloat(formData.paidAmount) : null,
        payment_status: 'unpaid',
        registered_at: formData.registrationDateTime || new Date().toISOString(),
        registration_datetime: formData.registrationDateTime || null
      }

      const response = await dataRegistrationAPI.createRegistration(registrationData)
      
      if (response.success) {
        showNotification('✓ ' + t('pages.dataRegistration.registerSuccess'), 'success')
        
        // Keep form enabled with current values - do not reset
        // User can continue registering more data with same settings
        console.log('Registration saved successfully. Form remains enabled with current values.')
      }
    } catch (error) {
      console.error('Failed to register data:', error)
      showNotification(error.message || t('pages.dataRegistration.registerError'), 'error')
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

  const selectedStaffInfo = getSelectedStaffInfo()

  return (
    <div className="data-registration-page">
      <div className="registration-container">
        <div className="page-header">
          <div className="page-title-section">
            <h1 className="page-title">{t('pages.dataRegistration.title')}</h1>
            <p className="page-subtitle">{t('pages.dataRegistration.subtitle')}</p>
          </div>
          <div className="page-status">
            <div className="staff-status-indicator">
              Staff: {hasStaff ? `${staffList.length} loaded` : staffLoading ? 'Loading...' : 'Not loaded'}
              {staffError && <span className="error-text"> (Error)</span>}
            </div>
          </div>
        </div>

        {/* Header Section - Dropdowns */}
        <div className="registration-header">
          <div className="dropdown-section">
            <div className="dropdown-group">
              <label htmlFor="workType">
                <span className="label-icon">📋</span>
                {t('pages.dataRegistration.workType')} *
              </label>
              <select
                id="workType"
                value={workType}
                onChange={handleWorkTypeChange}
                className="dropdown-select"
              >
                <option value="">{t('pages.dataRegistration.selectWorkType')}</option>
                <option value="redsea-ebc">{t('pages.dataRegistration.redsea')}</option>
                <option value="sells-product">{t('pages.dataRegistration.sellsProduct')}</option>
                <option value="other">{t('pages.dataRegistration.other')}</option>
              </select>
            </div>

            <div className="dropdown-group">
              <label htmlFor="staff">
                <span className="label-icon">👤</span>
                {t('pages.dataRegistration.staff')} *
                {!hasStaff && (
                  <span className="loading-indicator">
                    {staffLoading ? ' (Loading...)' : staffError ? ' (Error)' : ' (No staff)'}
                  </span>
                )}
              </label>
              <div className="staff-dropdown-container">
                <select
                  id="staff"
                  value={selectedStaff}
                  onChange={handleStaffChange}
                  className="dropdown-select"
                  disabled={!hasStaff}
                >
                  <option value="">
                    {!hasStaff 
                      ? (staffLoading ? 'Loading staff...' : staffError ? 'Failed to load staff' : 'No staff loaded')
                      : t('pages.dataRegistration.selectStaff')
                    }
                  </option>
                  {staffList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.username} - {staff.full_name || 'N/A'} - {staff.position || 'No Position'} - {staff.phone || 'No Phone'}
                    </option>
                  ))}
                  <option value="other">Other</option>
                  <option value="all">All</option>
                </select>
                <button 
                  type="button"
                  className="refresh-staff-btn"
                  onClick={handleRefreshStaff}
                  disabled={staffLoading}
                  title="Refresh staff list"
                >
                  {staffLoading ? '⏳' : '🔄'}
                </button>
              </div>
              {staffError && (
                <div className="error-message">
                  ❌ {staffError}
                </div>
              )}
            </div>
          </div>

          {/* Selected Staff Info Display */}
          {selectedStaffInfo && (
            <div className="staff-info-card">
              <h3>{t('pages.dataRegistration.selectedStaffInfo')}</h3>
              <div className="staff-details">
                <div className="detail-item">
                  <span className="detail-label">{t('pages.dataRegistration.username')}:</span>
                  <span className="detail-value">{selectedStaffInfo.username}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t('pages.dataRegistration.fullName')}:</span>
                  <span className="detail-value">{selectedStaffInfo.full_name || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t('pages.dataRegistration.position')}:</span>
                  <span className="detail-value">{selectedStaffInfo.position || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t('pages.dataRegistration.phone')}:</span>
                  <span className="detail-value">{selectedStaffInfo.phone || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t('pages.dataRegistration.role')}:</span>
                  <span className="detail-value badge">{selectedStaffInfo.role}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Body Section - Registration Form */}
        <div className={`registration-body ${!registrationEnabled ? 'disabled' : ''}`}>
          {!registrationEnabled && (
            <div className="disabled-overlay">
              <div className="disabled-message">
                <span className="icon">🔒</span>
                <p>
                  {!hasStaff 
                    ? (staffLoading 
                        ? 'Loading staff list...' 
                        : staffError 
                          ? 'Failed to load staff list. Please refresh.' 
                          : 'No staff loaded. Please refresh.')
                    : t('pages.dataRegistration.selectBoth')
                  }
                </p>
                {!hasStaff && !staffLoading && (
                  <button 
                    type="button" 
                    className="retry-btn"
                    onClick={handleRefreshStaff}
                  >
                    🔄 Retry Loading Staff
                  </button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="registration-form">
            <h2 className="section-title">{t('pages.dataRegistration.registrationDetails')}</h2>

            <div className="form-grid">
              {projectTitles.length > 0 && (
                <div className="form-group project-title-field">
                  <label htmlFor="projectTitle">Project Title</label>
                  <select
                    id="projectTitle"
                    name="projectTitle"
                    value={formData.projectTitle}
                    onChange={handleInputChange}
                    disabled={!registrationEnabled}
                    className="form-select"
                  >
                    <option value="">— Select Project —</option>
                    {projectTitles.map(title => <option key={title} value={title}>{title}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group receipt-number-field">
                <label htmlFor="receiptNo">Receipt Number (Optional)</label>
                <input
                  type="text"
                  id="receiptNo"
                  name="receiptNo"
                  value={formData.receiptNo}
                  onChange={handleInputChange}
                  maxLength={50}
                  disabled={!registrationEnabled}
                  placeholder="Enter receipt number if available"
                />
              </div>
              <div className="form-group receipt-number-field">
                <label htmlFor="transactionNumber">Transaction Number (Optional)</label>
                <input
                  type="text"
                  id="transactionNumber"
                  name="transactionNumber"
                  value={formData.transactionNumber}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  placeholder="Enter or scan transaction number"
                />
              </div>
              <PdfAttachmentField
                label="Bank Receipt"
                value={formData.bankReceiptPdf}
                disabled={!registrationEnabled}
                onChange={pdf => setFormData(current => ({ ...current, bankReceiptPdf: pdf }))}
              />
              <PdfAttachmentField
                label="Project Owner Receipt"
                value={formData.ownerReceiptPdf}
                disabled={!registrationEnabled}
                documentType="owner-receipt"
                onChange={pdf => setFormData(current => ({ ...current, ownerReceiptPdf: pdf }))}
              />
              <div className="form-group registration-image-field">
                <label htmlFor="registrationImage">Photo Attachment (Optional)</label>
                <input
                  type="file"
                  id="registrationImage"
                  accept="image/*"
                  capture="environment"
                  onChange={handleRegistrationImageChange}
                  disabled={!registrationEnabled}
                />
                <small>Choose a photo or capture one with your camera. Photos are resized to a maximum of 2 MB.</small>
                {formData.registrationImage && (
                  <div className="registration-image-preview">
                    <img src={formData.registrationImage} alt="Registration attachment preview" />
                    <button
                      type="button"
                      onClick={() => setFormData(current => ({ ...current, registrationImage: '' }))}
                      disabled={!registrationEnabled}
                    >
                      Remove photo
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="clientName">{t('pages.dataRegistration.clientName')} *</label>
                <input
                  type="text"
                  id="clientName"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  placeholder={t('pages.dataRegistration.enterClientName')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="kebele">{t('pages.dataRegistration.kebele')} *</label>
                <select
                  id="kebele"
                  name="kebele"
                  value={formData.kebele}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="">{t('pages.dataRegistration.selectKebele')}</option>
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

              <div className="form-group">
                <label htmlFor="houseNo">{t('pages.dataRegistration.houseNo')}</label>
                <input
                  type="text"
                  id="houseNo"
                  name="houseNo"
                  value={formData.houseNo}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  placeholder={t('pages.dataRegistration.enterHouseNo')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="clientPhone">{t('pages.dataRegistration.clientPhone')} *</label>
                <input
                  type="tel"
                  id="clientPhone"
                  name="clientPhone"
                  value={formData.clientPhone}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  placeholder={t('pages.dataRegistration.enterPhone')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="tvNo">{t('pages.dataRegistration.tvNo')} *</label>
                <select
                  id="tvNo"
                  name="tvNo"
                  value={formData.tvNo}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  {[...Array(50)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} TV
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="person">{t('pages.dataRegistration.person')} *</label>
                <select
                  id="person"
                  name="person"
                  value={formData.person}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="personal">{t('pages.dataRegistration.personal')}</option>
                  <option value="organization">{t('pages.dataRegistration.organization')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="clientEmail">{t('pages.dataRegistration.clientEmail')}</label>
                <input
                  type="email"
                  id="clientEmail"
                  name="clientEmail"
                  value={formData.clientEmail}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  placeholder={t('pages.dataRegistration.enterEmail')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="condition">{t('pages.dataRegistration.condition')} *</label>
                <select
                  id="condition"
                  name="condition"
                  value={formData.condition}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="new">{t('pages.dataRegistration.new')}</option>
                  <option value="old">{t('pages.dataRegistration.old')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="sign">{t('pages.dataRegistration.sign')} *</label>
                <select
                  id="sign"
                  name="sign"
                  value={formData.sign}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="sign">{t('pages.dataRegistration.signed')}</option>
                  <option value="unsign">{t('pages.dataRegistration.unsigned')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="govLetter">{t('pages.dataRegistration.govLetter')} *</label>
                <select
                  id="govLetter"
                  name="govLetter"
                  value={formData.govLetter}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="accept">{t('pages.dataRegistration.accept')}</option>
                  <option value="unaccept">{t('pages.dataRegistration.unaccept')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="paidAmount">{t('pages.dataRegistration.paidAmount')}</label>
                <input
                  type="number"
                  id="paidAmount"
                  name="paidAmount"
                  value={formData.paidAmount}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  className="form-input"
                  placeholder={t('pages.dataRegistration.enterAmount')}
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="form-group">
                <label htmlFor="registrationDateTime">{t('pages.dataRegistration.validDate')}</label>
                <EthiopianDateInput
                  value={formData.registrationDateTime}
                  onChange={(date) => setFormData({ ...formData, registrationDateTime: date })}
                />
              </div>

              <div className="form-group form-actions-inline">
                <label>&nbsp;</label>
                <div className="inline-buttons">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => window.history.back()}
                  >
                    {t('pages.dataRegistration.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-clear"
                    onClick={handleClearForm}
                    disabled={!registrationEnabled}
                  >
                    <span className="btn-icon">🗑️</span>
                    {t('pages.dataRegistration.clear')}
                  </button>
                  <button
                    type="submit"
                    className="btn-submit"
                    disabled={!registrationEnabled}
                  >
                    <span className="btn-icon">✓</span>
                    {t('pages.dataRegistration.registerData')}
                  </button>
                </div>
              </div>
            </div>
          </form>
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

export default DataRegistration
