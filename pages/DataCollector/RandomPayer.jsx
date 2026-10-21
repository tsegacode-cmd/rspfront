import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { userAPI, dataRegistrationAPI } from '../../services/api'
import { useTranslation } from '../../hooks/useTranslation'
import EthiopianDateInput from '../../components/EthiopianDateInput'
import './RandomPayer.css'

function RandomPayer() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { language } = useTranslation()
  const [workType, setWorkType] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('')
  const [staffList, setStaffList] = useState([])
  const [notification, setNotification] = useState(null)
  const [loadedData, setLoadedData] = useState([]) // Data loaded from database
  const [originalData, setOriginalData] = useState([]) // Original unfiltered data
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 25
  
  // Download dialog state
  const [showDownloadDialog, setShowDownloadDialog] = useState(false)
  
  const [dateFilter, setDateFilter] = useState('all')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  
  // Editing state
  const [editingRows, setEditingRows] = useState({}) // Track which rows are being edited
  const [editedData, setEditedData] = useState({}) // Store edited values
  
  const [tableData, setTableData] = useState(
    Array(25).fill(null).map(() => ({
      rowNo: '',
      payerName: '',
      city: 'harar',
      kebele: '',
      houseNo: '',
      receiptNo: '',
      periodFrom: '',
      periodTo: '',
      commissionAmount: '',
      commissionFee: '',
      commissionTotal: '',
      collectedAmount: ''
    }))
  )

  const ethiopianCities = [
    'Harar',
    'Addis Ababa',
    'Dire Dawa',
    'Adama',
    'Mekelle',
    'Hawassa',
    'Bahir Dar',
    'Jimma',
    'Arba Minch',
    'Jijiga',
    'Dessie',
    'Gondar',
    'Aksum',
    'Dilla',
    'Shashamane'
  ]

  // Date filtering function
  const filterByDate = (data, filterType, fromDate = '', toDate = '') => {
    if (filterType === 'all') return data
    
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    return data.filter(reg => {
      const regDate = new Date(reg.registered_at || reg.created_at)
      
      switch (filterType) {
        case 'today':
          return regDate.toDateString() === today.toDateString()
        case 'yesterday':
          return regDate.toDateString() === yesterday.toDateString()
        case 'weekly': {
          const weekStart = new Date(today)
          weekStart.setDate(today.getDate() - today.getDay()) // Start of current week (Sunday)
          weekStart.setHours(0, 0, 0, 0)
          return regDate >= weekStart
        }
        case 'monthly': {
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
          monthStart.setHours(0, 0, 0, 0)
          return regDate >= monthStart
        }
        case 'lastmonth': {
          const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1)
          lastMonthStart.setHours(0, 0, 0, 0)
          lastMonthEnd.setHours(0, 0, 0, 0)
          return regDate >= lastMonthStart && regDate < lastMonthEnd
        }
        case 'last15days': {
          const fifteenDaysAgo = new Date(today)
          fifteenDaysAgo.setDate(today.getDate() - 15)
          fifteenDaysAgo.setHours(0, 0, 0, 0)
          return regDate >= fifteenDaysAgo
        }
        case 'custom':
          if (!fromDate && !toDate) return true
          const from = fromDate ? new Date(fromDate) : new Date('1900-01-01')
          const to = toDate ? new Date(toDate) : new Date('2100-12-31')
          return regDate >= from && regDate <= to
        default:
          return true
      }
    })
  }

  useEffect(() => {
    loadStaffList()
    loadRandomPayerData() // Load data from database
  }, [])

  const loadStaffList = async () => {
    try {
      console.log('📋 Loading staff list for RandomPayer...')
      const response = await userAPI.getAllUsers()
      console.log('📋 Staff list response:', response)
      
      if (response.success && response.data) {
        console.log('✅ Staff list loaded successfully:', response.data)
        setStaffList(response.data)
      } else {
        console.warn('⚠️ No staff data in response:', response)
        setStaffList([])
      }
    } catch (error) {
      console.error('❌ Failed to load staff list:', error)
      setStaffList([])
    }
  }

  const loadRandomPayerData = async () => {
    try {
      console.log('📋 Loading random payer data from database...')
      console.log('🌐 API URL:', 'http://localhost:5000/api/v1/data-registrations')
      
      const response = await dataRegistrationAPI.getAllRegistrations()
      console.log('🌐 Full API Response:', response)
      
      if (response.success && response.data) {
        console.log('🔍 RAW DATABASE RESPONSE:', response.data.length, 'total records')
        console.log('🔍 First 3 records:', response.data.slice(0, 3))
        
        // Check what fields exist in the data
        if (response.data.length > 0) {
          console.log('🔍 Available fields in first record:', Object.keys(response.data[0]))
          
          // Show detailed info about first few records
          response.data.slice(0, 5).forEach((record, index) => {
            console.log(`🔍 Record ${index + 1} FULL DATA:`, record)
          })
        } else {
          console.log('⚠️ NO RECORDS FOUND IN DATABASE')
        }
        
        // Filter for records with payment_status = 'paid'
        const filteredData = response.data.filter(reg => {
          const isPaid = reg.payment_status === 'paid'
          
          console.log('🔍 Checking record:', {
            id: reg.id || reg._id,
            client_name: reg.client_name,
            receipt_no: reg.receipt_no,
            // Payment period fields
            payment_from: reg.payment_from,
            payment_to: reg.payment_to,
            period_from: reg.period_from, // fallback
            period_to: reg.period_to, // fallback
            // Commission amount fields  
            period_amount: reg.period_amount,
            fee: reg.fee,
            total: reg.total,
            commission_period_amount: reg.commission_period_amount, // fallback
            commission_fee: reg.commission_fee, // fallback
            commission_total: reg.commission_total, // fallback
            // Other fields
            collected_amount: reg.collected_amount,
            payment_status: reg.payment_status,
            city: reg.city,
            kebele: reg.kebele,
            house_no: reg.house_no,
            isPaid
          })
          
          return isPaid
        })
        
        console.log('✅ After filtering - Found:', filteredData.length, 'paid records')
        
        // Sort by created_at or registered_at (newest first)
        filteredData.sort((a, b) => {
          const dateA = new Date(a.registered_at || a.created_at || 0)
          const dateB = new Date(b.registered_at || b.created_at || 0)
          return dateB - dateA // Newest first
        })
        
        console.log('✅ Final filtered data:', filteredData.length, 'records')
        if (filteredData.length > 0) {
          console.log('📊 Sample filtered record with all fields:', filteredData[0])
        }
        setLoadedData(filteredData)
        setOriginalData(filteredData) // Store original data for filtering
      } else {
        console.warn('⚠️ No registration data in response:', response)
        setLoadedData([])
        setOriginalData([])
      }
    } catch (error) {
      console.error('❌ Failed to load random payer data:', error)
      console.error('❌ Error details:', error.message)
      console.error('❌ Error stack:', error.stack)
      setLoadedData([])
      setOriginalData([])
    }
  }

  const handleWorkTypeChange = (e) => {
    setWorkType(e.target.value)
  }

  const handleStaffChange = (e) => {
    setSelectedStaff(e.target.value)
  }

  const handleCellChange = (rowIndex, field, value) => {
    const newData = [...tableData]
    newData[rowIndex] = {
      ...newData[rowIndex],
      [field]: value
    }
    setTableData(newData)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!workType || !selectedStaff) {
      showNotification(`⚠️ ${t('pages.randomPayer.selectBoth')}`, 'error')
      return
    }

    try {
      const selectedStaffInfo = getSelectedStaffInfo()
      
      // Filter out empty rows
      const filledRows = tableData.filter(row => row.payerName && row.receiptNo)
      
      if (filledRows.length === 0) {
        showNotification(`⚠️ ${t('pages.randomPayer.enterRecord')}`, 'error')
        return
      }

      // Submit each row
      let successCount = 0
      for (const row of filledRows) {
        try {
          const registrationData = {
            work_type: workType,
            staff_id: selectedStaff === 'other' || selectedStaff === 'all' ? null : parseInt(selectedStaff),
            staff_username: selectedStaffInfo ? selectedStaffInfo.username : (selectedStaff === 'other' ? 'Other' : 'All'),
            staff_full_name: selectedStaffInfo ? selectedStaffInfo.full_name : (selectedStaff === 'other' ? 'Other' : 'All'),
            client_name: row.payerName,
            kebele: row.kebele,
            house_no: row.houseNo || null,
            client_phone: row.city || null,
            tv_no: row.receiptNo || null,
            person: 'personal',
            condition: 'new',
            sign: 'sign',
            gov_letter: 'accept',
            paid_amount: row.collectedAmount ? parseFloat(row.collectedAmount) : null,
            payment_status: 'paid',
            registered_at: new Date().toISOString(),
            registration_datetime: null,
            period_from: row.periodFrom || null,
            period_to: row.periodTo || null,
            commission_amount: row.commissionAmount ? parseFloat(row.commissionAmount) : null,
            period_amount: row.periodAmount ? parseFloat(row.periodAmount) : null,
            fee: row.fee ? parseFloat(row.fee) : null,
            total: row.total ? parseFloat(row.total) : null
          }

          const response = await dataRegistrationAPI.createRegistration(registrationData)
          if (response.success) {
            successCount++
          }
        } catch (error) {
          console.error('Error submitting row:', error)
        }
      }

      if (successCount > 0) {
        showNotification(`✓ ${successCount} ${t('pages.randomPayer.recordsSuccess')}`, 'success')
        // Clear the table
        setTableData(Array(25).fill(null).map(() => ({
          rowNo: '',
          payerName: '',
          city: 'harar',
          kebele: '',
          houseNo: '',
          receiptNo: '',
          periodFrom: '',
          periodTo: '',
          commissionAmount: '',
          commissionFee: '',
          commissionTotal: '',
          collectedAmount: ''
        })))
      } else {
        showNotification(`❌ ${t('pages.randomPayer.recordsError')}`, 'error')
      }
    } catch (error) {
      console.error('Failed to register data:', error)
      showNotification(error.message || t('pages.randomPayer.recordsError'), 'error')
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

  // Check if multiple pages exist and show dialog
  const handleDownloadClick = (downloadType) => {
    const totalPages = Math.ceil(loadedData.length / rowsPerPage);
    if (totalPages > 1) {
      // Show dialog to ask: current page or all pages
      setShowDownloadDialog(downloadType);
    } else {
      // Only one page, download directly
      executeDownload(downloadType, 'all');
    }
  };

  // Execute the actual download
  const executeDownload = (downloadType, scope) => {
    setShowDownloadDialog(false);
    
    // Temporarily store the data to download
    const originalData = [...loadedData];
    
    if (scope === 'current') {
      // Set loadedData to only current page data
      const currentPageData = loadedData.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
      );
      setLoadedData(currentPageData);
    }
    
    // Execute download after a short delay to ensure state is updated
    setTimeout(() => {
      switch(downloadType) {
        case 'word':
          handleDownloadWord();
          break;
        case 'pdf':
          handleDownloadPDF();
          break;
        case 'excel':
          handleDownloadExcel();
          break;
        case 'print':
          handlePrint();
          break;
      }
      
      // Restore original data if we filtered it
      if (scope === 'current') {
        setTimeout(() => setLoadedData(originalData), 100);
      }
    }, 100);
  };

  const handleDownloadWord = () => {
    try {
      console.log('Starting Word download...')
      
      // Create proper Word document content with HTML formatting
      const documentContent = generateWordDocumentContent()
      
      if (!documentContent) {
        throw new Error('Failed to generate document content')
      }
      
      console.log('Document content generated, length:', documentContent.length)
      
      const blob = new Blob(['\ufeff' + documentContent], { 
        type: 'application/msword;charset=utf-8' 
      })
      
      console.log('Blob created, size:', blob.size)
      
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const languageSuffix = language === 'am' ? 'amharic' : 'english'
      const filename = `final-finance-request-${languageSuffix}-${new Date().toISOString().split('T')[0]}.doc`
      link.download = filename
      link.style.display = 'none'
      
      console.log('Downloading:', filename)
      
      document.body.appendChild(link)
      link.click()
      
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)
      
      showNotification(`✓ ${t('pages.randomPayer.downloadWord')} ${t('common.success')}!`, 'success')
    } catch (error) {
      console.error('Error downloading Word document:', error)
      showNotification(`❌ ${t('pages.randomPayer.downloadWord')} ${t('common.error')}: ${error.message}`, 'error')
    }
  }

  const handleDownloadPDF = () => {
    try {
      // Create a new window with the content for PDF generation
      const printWindow = window.open('', '_blank')
      
      if (!printWindow) {
        showNotification(`❌ Please allow pop-ups for PDF download`, 'error')
        return
      }
      
      const pdfContent = generatePDFContent()
      
      printWindow.document.write(pdfContent)
      printWindow.document.close()
      
      // Wait for content to load then print
      setTimeout(() => {
        try {
          printWindow.print()
        } catch (err) {
          console.error('Print error:', err)
        }
      }, 500)
      
      showNotification(`✓ ${t('pages.randomPayer.downloadPDF')} ${t('common.success')}`, 'success')
    } catch (error) {
      console.error('Error opening PDF print dialog:', error)
      showNotification(`❌ ${t('pages.randomPayer.downloadPDF')} ${t('common.error')}`, 'error')
    }
  }

  const handlePrint = () => {
    try {
      // Create a new window for printing to avoid affecting the main page
      const printWindow = window.open('', '_blank', 'width=1200,height=800')
      
      // Calculate total pages
      const totalPages = Math.ceil(loadedData.length / rowsPerPage)
      
      // Get exactly 25 rows for current page, fill with empty rows if needed
      const currentPageData = loadedData.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
      )
      
      // Fill remaining rows with empty data to make exactly 25 rows
      const pageData = [...currentPageData]
      while (pageData.length < 25) {
        pageData.push({
          client_name: '',
          city: '',
          kebele: '',
          house_no: '',
          receipt_no: '',
          payment_from: '',
          payment_to: '',
          period_amount: '',
          fee: '',
          total: '',
          collected_amount: ''
        })
      }
      
      // Generate print content optimized for A4 landscape
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Final Finance Request</title>
          <style>
            @page { 
              size: A4 landscape; 
              margin: 5mm 5mm; 
            }
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 5mm;
              font-size: 8px;
              line-height: 1.0;
            }
            .header { 
              text-align: center; 
              margin-bottom: 2px;
            }
            .title { 
              font-size: 12px; 
              font-weight: bold; 
              margin-bottom: 1px; 
            }
            .subtitle { 
              font-size: 9px;
              font-weight: bold;
              margin-bottom: 2px; 
            }
            .page-number {
              text-align: right;
              font-size: 7px;
              font-weight: bold;
              margin-bottom: 2px;
              color: #555;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              font-size: 6.5px;
              margin-bottom: 2px;
            }
            th, td { 
              border: 1px solid black; 
              padding: 1px 0.5px; 
              text-align: center; 
              vertical-align: middle;
              font-weight: bold;
            }
            th { 
              background-color: #f0f0f0; 
              font-weight: bold;
              font-size: 6px;
              height: 16px;
            }
            td {
              height: 13px;
              font-size: 6px;
            }
            .row-number { width: 3%; }
            .payer-name { width: 17%; }
            .city { width: 7%; }
            .kebele { width: 7%; }
            .house-no { width: 5%; }
            .receipt-no { width: 9%; }
            .period-from { width: 5%; }
            .period-to { width: 5%; }
            .period-amount { width: 7%; }
            .fee { width: 7%; }
            .total { width: 7%; }
            .collected { width: 9%; }
            
            .content-wrapper {
              page-break-inside: avoid;
            }
            .signature-section { 
              margin-top: 3px;
              page-break-inside: avoid;
              page-break-before: avoid;
            }
            .signature-table {
              width: 100%;
              border-collapse: collapse;
            }
            .signature-table td {
              border: none;
              padding: 2px 1px;
              width: 33%;
              text-align: left;
              font-weight: bold;
              font-size: 7px;
            }
            .signature-table .signature-row td {
              padding: 1px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${t('pages.randomPayer.documentTitle')}</div>
            <div class="subtitle">${t('pages.randomPayer.documentSubtitle')}</div>
          </div>
          
          <div class="page-number">Page ${currentPage} of ${totalPages}</div>
          
          <table>
            <thead>
              <tr>
                <th rowspan="2" class="row-number">${t('pages.randomPayer.rowNo')}</th>
                <th rowspan="2" class="payer-name">${t('pages.randomPayer.payerName')}</th>
                <th rowspan="2" class="city">${t('pages.randomPayer.city')}</th>
                <th rowspan="2" class="kebele">${t('pages.randomPayer.kebele')}</th>
                <th rowspan="2" class="house-no">${t('pages.randomPayer.houseNo')}</th>
                <th rowspan="2" class="receipt-no">${t('pages.randomPayer.receiptNo')}</th>
                <th colspan="2">${t('pages.randomPayer.paymentPeriod')}</th>
                <th colspan="3">${t('pages.randomPayer.commissionAmount')}</th>
                <th rowspan="2" class="collected">${t('pages.randomPayer.collectedAmount')}</th>
              </tr>
              <tr>
                <th class="period-from">${t('pages.randomPayer.from')}</th>
                <th class="period-to">${t('pages.randomPayer.to')}</th>
                <th class="period-amount">${t('pages.randomPayer.periodAmount')}</th>
                <th class="fee">${t('pages.randomPayer.fee')}</th>
                <th class="total">${t('pages.randomPayer.total')}</th>
              </tr>
            </thead>
            <tbody>
              ${pageData.map((reg, index) => {
                const globalRowNumber = (currentPage - 1) * rowsPerPage + index + 1
                return `
                  <tr>
                    <td class="row-number">${globalRowNumber}</td>
                    <td class="payer-name">${translateClientName(reg.client_name) || '&nbsp;'}</td>
                    <td class="city">${translateCityName(reg.city) || '&nbsp;'}</td>
                    <td class="kebele">${reg.kebele || '&nbsp;'}</td>
                    <td class="house-no">${reg.house_no || '&nbsp;'}</td>
                    <td class="receipt-no">${reg.receipt_no || '&nbsp;'}</td>
                    <td class="period-from">${reg.payment_from || '&nbsp;'}</td>
                    <td class="period-to">${reg.payment_to || '&nbsp;'}</td>
                    <td class="period-amount">${reg.period_amount || '&nbsp;'}</td>
                    <td class="fee">${reg.fee || '&nbsp;'}</td>
                    <td class="total">${reg.total || '&nbsp;'}</td>
                    <td class="collected">${reg.collected_amount || '&nbsp;'}</td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
          
          <div class="signature-section">
            <table class="signature-table">
              <tr>
                <td>${t('pages.randomPayer.collectorName')} _______________</td>
                <td>${t('pages.randomPayer.scienceHead')} _____________</td>
                <td>${t('pages.randomPayer.financeHead')} _____________</td>
              </tr>
              <tr class="signature-row">
                <td>${t('pages.randomPayer.signature')} _______________</td>
                <td>${t('pages.randomPayer.signature')} _______________</td>
                <td>${t('pages.randomPayer.signature')} _______________</td>
              </tr>
            </table>
          </div>
        </body>
        </html>
      `
      
      // Write content to print window
      printWindow.document.write(printContent)
      printWindow.document.close()
      
      // Wait for content to load then print and close
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
          printWindow.close()
        }, 500)
      }
      
      showNotification(`✓ ${t('pages.randomPayer.print')} ${t('common.success')}`, 'success')
    } catch (error) {
      console.error('Error opening print dialog:', error)
      showNotification(`❌ ${t('pages.randomPayer.print')} ${t('common.error')}`, 'error')
    }
  }

  const handleDownloadExcel = () => {
    try {
      console.log('Starting Excel download...')
      
      // Create Excel content
      const excelContent = generateExcelContent()
      
      if (!excelContent) {
        throw new Error('Failed to generate Excel content')
      }
      
      console.log('Excel content generated, length:', excelContent.length)
      
      // Add BOM for UTF-8 encoding
      const blob = new Blob(['\ufeff' + excelContent], { 
        type: 'text/csv;charset=utf-8' 
      })
      
      console.log('Blob created, size:', blob.size)
      
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const languageSuffix = language === 'am' ? 'amharic' : 'english'
      const filename = `final-finance-request-${languageSuffix}-${new Date().toISOString().split('T')[0]}.csv`
      link.download = filename
      link.style.display = 'none'
      
      console.log('Downloading:', filename)
      
      document.body.appendChild(link)
      link.click()
      
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)
      
      showNotification(`✓ ${t('pages.randomPayer.downloadExcel')} ${t('common.success')}!`, 'success')
    } catch (error) {
      console.error('Error downloading Excel file:', error)
      showNotification(`❌ ${t('pages.randomPayer.downloadExcel')} ${t('common.error')}: ${error.message}`, 'error')
    }
  }

  const getWorkTypeDisplayName = () => {
    switch(workType) {
      case 'redsea-ebc':
        return t('pages.dataRegistration.redsea')
      case 'sells-product':
        return t('pages.dataRegistration.sellsProduct')
      case 'other':
        return t('pages.dataRegistration.other')
      default:
        return workType || t('pages.dataRegistration.selectWorkType')
    }
  }

  // Translation helpers for names and cities
  const translateClientName = (name) => {
    if (!name) return ''
    
    // First check exact matches
    const nameTranslations = {
      'am': {
        'Ahmed': 'አህመድ', 'Mohammed': 'መሐመድ', 'Fatima': 'ፋጢማ', 'Hassan': 'ሐሰን',
        'Aisha': 'ዓይሻ', 'Ibrahim': 'ኢብራሂም', 'Khadija': 'ኸዲጃ', 'Omar': 'ዑመር',
        'Zeinab': 'ዘይነብ', 'Ali': 'ዓሊ',
        // Add more common Ethiopian names
        'kassa kassa': 'ካሳ ካሳ',
        'kassa': 'ካሳ',
        'Kassa': 'ካሳ',
        'KASSA': 'ካሳ',
        'Abebe': 'አበበ',
        'Almaz': 'አልማዝ',
        'Bekele': 'በቀለ',
        'Desta': 'ደስታ',
        'Girma': 'ግርማ',
        'Haile': 'ኃይሌ',
        'Kebede': 'ከበደ',
        'Lemma': 'ለማ',
        'Marta': 'ማርታ',
        'Negash': 'ነጋሽ',
        'Tadesse': 'ታደሰ',
        'Tesfaye': 'ተስፋዬ',
        'Worku': 'ወርቁ',
        'Yohannes': 'ዮሐንስ',
        'Zenebe': 'ዘነበ',
        // Add the specific names from your database
        'ewegggggg': 'እወግግግግግ',
        'ddrdrttrsersr': 'ድድርድርትርሰርስር'
      }
    }
    
    // Return exact translation if found (case-insensitive)
    const lowerName = name.toLowerCase()
    for (const [key, value] of Object.entries(nameTranslations[language] || {})) {
      if (key.toLowerCase() === lowerName) {
        return value
      }
    }
    
    // For Amharic mode, if no exact match, use improved syllable-based translation
    if (language === 'am') {
      // Better syllable mapping for Ethiopian names
      const syllableMap = {
        'ka': 'ካ', 'ke': 'ከ', 'ki': 'ኪ', 'ko': 'ኮ', 'ku': 'ኩ',
        'sa': 'ሳ', 'se': 'ሰ', 'si': 'ሲ', 'so': 'ሶ', 'su': 'ሱ',
        'ta': 'ታ', 'te': 'ተ', 'ti': 'ቲ', 'to': 'ቶ', 'tu': 'ቱ',
        'ba': 'ባ', 'be': 'በ', 'bi': 'ቢ', 'bo': 'ቦ', 'bu': 'ቡ',
        'da': 'ዳ', 'de': 'ደ', 'di': 'ዲ', 'do': 'ዶ', 'du': 'ዱ',
        'ga': 'ጋ', 'ge': 'ገ', 'gi': 'ጊ', 'go': 'ጎ', 'gu': 'ጉ',
        'ha': 'ሃ', 'he': 'ሄ', 'hi': 'ሂ', 'ho': 'ሆ', 'hu': 'ሁ',
        'la': 'ላ', 'le': 'ለ', 'li': 'ሊ', 'lo': 'ሎ', 'lu': 'ሉ',
        'ma': 'ማ', 'me': 'መ', 'mi': 'ሚ', 'mo': 'ሞ', 'mu': 'ሙ',
        'na': 'ና', 'ne': 'ነ', 'ni': 'ኒ', 'no': 'ኖ', 'nu': 'ኑ',
        'ra': 'ራ', 're': 'ረ', 'ri': 'ሪ', 'ro': 'ሮ', 'ru': 'ሩ',
        'wa': 'ዋ', 'we': 'ወ', 'wi': 'ዊ', 'wo': 'ዎ', 'wu': 'ዉ',
        'ya': 'ያ', 'ye': 'የ', 'yi': 'ዪ', 'yo': 'ዮ', 'yu': 'ዩ',
        'za': 'ዛ', 'ze': 'ዘ', 'zi': 'ዚ', 'zo': 'ዞ', 'zu': 'ዙ'
      }
      
      // Try to match syllables first
      let result = name.toLowerCase()
      for (const [syllable, amharic] of Object.entries(syllableMap)) {
        result = result.replace(new RegExp(syllable, 'g'), amharic)
      }
      
      // If we got some translation, return it
      if (result !== name.toLowerCase()) {
        return result
      }
    }
    
    // Return original name if no translation available
    return name
  }

  const translateCityName = (city) => {
    if (!city) return ''
    const cityTranslations = {
      'am': {
        'Harar': 'ሐረር', 'Addis Ababa': 'አዲስ አበባ', 'Dire Dawa': 'ድሬዳዋ',
        'Adama': 'አዳማ', 'Mekelle': 'መቀሌ', 'Hawassa': 'ሐዋሳ', 'Bahir Dar': 'ባሕር ዳር',
        'Jimma': 'ጅማ', 'Arba Minch': 'አርባ ምንጭ', 'Jijiga': 'ጅጅጋ', 'Dessie': 'ደሴ',
        'Gondar': 'ጎንደር', 'Aksum': 'አክሱም', 'Dilla': 'ዲላ', 'Shashamane': 'ሻሸመኔ'
      }
    }
    return cityTranslations[language]?.[city] || city
  }

  // Editing functions
  const handleEditRow = (rowId) => {
    setEditingRows(prev => ({ ...prev, [rowId]: true }))
    // Initialize edited data with current values
    const currentRow = loadedData.find(row => (row.id || row._id) === rowId)
    if (currentRow) {
      setEditedData(prev => ({ ...prev, [rowId]: { ...currentRow } }))
    }
  }

  const handleSaveRow = async (rowId) => {
    try {
      const editedRow = editedData[rowId]
      if (!editedRow) return

      // Update the record in the database
      const response = await dataRegistrationAPI.updateRegistration(rowId, editedRow)
      
      if (response.success) {
        // Update local data
        setLoadedData(prev => prev.map(row => 
          (row.id || row._id) === rowId ? { ...row, ...editedRow } : row
        ))
        setOriginalData(prev => prev.map(row => 
          (row.id || row._id) === rowId ? { ...row, ...editedRow } : row
        ))
        
        // Exit edit mode
        setEditingRows(prev => ({ ...prev, [rowId]: false }))
        setEditedData(prev => {
          const newData = { ...prev }
          delete newData[rowId]
          return newData
        })
        
        showNotification('✓ Record updated successfully!', 'success')
      } else {
        showNotification('❌ Failed to update record', 'error')
      }
    } catch (error) {
      console.error('Error updating record:', error)
      showNotification('❌ Error updating record', 'error')
    }
  }

  const handleCancelEdit = (rowId) => {
    setEditingRows(prev => ({ ...prev, [rowId]: false }))
    setEditedData(prev => {
      const newData = { ...prev }
      delete newData[rowId]
      return newData
    })
  }

  const handleFieldChange = (rowId, field, value) => {
    setEditedData(prev => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        [field]: value
      }
    }))
  }

  const handleToggleReceived = async (rowId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'received' ? 'paid' : 'received'
      const response = await dataRegistrationAPI.updateRegistration(rowId, {
        payment_status: newStatus
      })
      
      if (response.success) {
        // Update local data
        setLoadedData(prev => prev.map(row => 
          (row.id || row._id) === rowId ? { ...row, payment_status: newStatus } : row
        ))
        setOriginalData(prev => prev.map(row => 
          (row.id || row._id) === rowId ? { ...row, payment_status: newStatus } : row
        ))
        
        showNotification(`✓ Status changed to ${newStatus}`, 'success')
      } else {
        showNotification('❌ Failed to update status', 'error')
      }
    } catch (error) {
      console.error('Error updating status:', error)
      showNotification('❌ Error updating status', 'error')
    }
  }

  const handleBulkReceived = async (scope) => {
    try {
      const recordsToUpdate = scope === 'current' 
        ? loadedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
        : loadedData

      let successCount = 0
      for (const record of recordsToUpdate) {
        try {
          const response = await dataRegistrationAPI.updateRegistration(record.id || record._id, {
            payment_status: 'received'
          })
          if (response.success) successCount++
        } catch (error) {
          console.error('Error updating record:', error)
        }
      }

      if (successCount > 0) {
        // Reload data to reflect changes
        await loadRandomPayerData()
        showNotification(`✓ ${successCount} records marked as received`, 'success')
      }
    } catch (error) {
      console.error('Error in bulk update:', error)
      showNotification('❌ Error in bulk update', 'error')
    }
  }

  const handleBulkUnreceived = async (scope) => {
    try {
      const recordsToUpdate = scope === 'current' 
        ? loadedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
        : loadedData

      let successCount = 0
      for (const record of recordsToUpdate) {
        try {
          const response = await dataRegistrationAPI.updateRegistration(record.id || record._id, {
            payment_status: 'paid'
          })
          if (response.success) successCount++
        } catch (error) {
          console.error('Error updating record:', error)
        }
      }

      if (successCount > 0) {
        // Reload data to reflect changes
        await loadRandomPayerData()
        showNotification(`✓ ${successCount} records marked as unreceived`, 'success')
      }
    } catch (error) {
      console.error('Error in bulk update:', error)
      showNotification('❌ Error in bulk update', 'error')
    }
  }

  const generateWordDocumentContent = () => {
    // Use loadedData instead of tableData
    let dataToExport = loadedData;
    
    // Calculate total pages
    const totalPages = Math.ceil(dataToExport.length / 25);
    let htmlContent = '';
    
    // Generate content for each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const startIndex = (pageNum - 1) * 25;
      const endIndex = Math.min(startIndex + 25, dataToExport.length);
      let pageData = dataToExport.slice(startIndex, endIndex);
      
      // Fill remaining rows with empty data to make exactly 25 rows per page
      if (pageData.length < 25) {
        const emptyRows = Array(25 - pageData.length).fill({
          client_name: '',
          city: '',
          kebele: '',
          house_no: '',
          receipt_no: '',
          payment_from: '',
          payment_to: '',
          period_amount: '',
          fee: '',
          total: '',
          collected_amount: ''
        });
        pageData = [...pageData, ...emptyRows];
      }
      
      const selectedStaffInfo = getSelectedStaffInfo()
      
      // Add page break before each page except the first
      if (pageNum > 1) {
        htmlContent += '<div style="page-break-before: always;"></div>';
      }
      
      htmlContent += `
        ${pageNum === 1 ? '<html><head><meta charset="UTF-8"><style>' : ''}
        ${pageNum === 1 ? `
          @page { 
            size: A4 landscape; 
            margin: 5mm 5mm 5mm 5mm; 
          }
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 5mm;
            font-size: 9px;
            line-height: 1.0;
            box-sizing: border-box;
          }
          .page-container {
            min-height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .header { 
            text-align: center; 
            margin-bottom: 3px; 
          }
          .title { 
            font-size: 13px; 
            font-weight: bold; 
            margin-bottom: 1px; 
          }
          .subtitle { 
            font-size: 10px;
            font-weight: bold;
            margin-bottom: 3px; 
          }
          .info { 
            margin-bottom: 3px; 
            font-size: 9px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
          }
          .page-number {
            text-align: right;
            font-size: 8px;
            font-weight: bold;
            margin-bottom: 2px;
            color: #555;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 3px; 
            font-size: 7px;
          }
          th, td { 
            border: 1px solid black; 
            padding: 1px 0.5px; 
            text-align: center; 
            vertical-align: middle;
            font-weight: bold;
          }
          th { 
            background-color: #f0f0f0; 
            font-weight: bold; 
            font-size: 6.5px;
            height: 18px;
          }
          td {
            font-size: 6.5px;
            height: 14px;
          }
          .row-number { width: 3%; }
          .payer-name { width: 16%; }
          .city { width: 7%; }
          .kebele { width: 7%; }
          .house-no { width: 5%; }
          .receipt-no { width: 9%; }
          .period-from { width: 5%; }
          .period-to { width: 5%; }
          .period-amount { width: 7%; }
          .fee { width: 7%; }
          .total { width: 7%; }
          .collected { width: 9%; }
          .table-signature-wrapper {
            page-break-inside: avoid;
          }
          .signature-section { 
            margin-top: 4px; 
            font-size: 8px;
            font-weight: bold;
            page-break-inside: avoid;
            page-break-before: avoid;
          }
        </style></head><body>` : ''}
        
        <div class="page-container">
          <div>
            <div class="header">
              <div class="title">${t('pages.randomPayer.documentTitle')}</div>
              <div class="subtitle">${t('pages.randomPayer.documentSubtitle')}</div>
            </div>`
      
      // Only add work info if both are properly selected
      if (workType && workType !== '' && selectedStaff && selectedStaff !== '') {
        htmlContent += `
            <div class="info">
              <span>${t('pages.randomPayer.workType')}: ${getWorkTypeDisplayName()}</span>
              <span>${t('pages.randomPayer.staff')}: ${selectedStaffInfo?.full_name || selectedStaff}</span>
            </div>`
      }
      
      // Add page number with total pages
      htmlContent += `
            <div class="page-number">Page ${pageNum} of ${totalPages}</div>
            
            <table>
              <thead>
                <tr>
                  <th rowspan="2" class="row-number">${t('pages.randomPayer.rowNo')}</th>
                  <th rowspan="2" class="payer-name">${t('pages.randomPayer.payerName')}</th>
                  <th rowspan="2" class="city">${t('pages.randomPayer.city')}</th>
                  <th rowspan="2" class="kebele">${t('pages.randomPayer.kebele')}</th>
                  <th rowspan="2" class="house-no">${t('pages.randomPayer.houseNo')}</th>
                  <th rowspan="2" class="receipt-no">${t('pages.randomPayer.receiptNo')}</th>
                  <th colspan="2">${t('pages.randomPayer.paymentPeriod')}</th>
                  <th colspan="3">${t('pages.randomPayer.commissionAmount')}</th>
                  <th rowspan="2" class="collected">${t('pages.randomPayer.collectedAmount')}</th>
                </tr>
                <tr>
                  <th class="period-from">${t('pages.randomPayer.from')}</th>
                  <th class="period-to">${t('pages.randomPayer.to')}</th>
                  <th class="period-amount">${t('pages.randomPayer.periodAmount')}</th>
                  <th class="fee">${t('pages.randomPayer.fee')}</th>
                  <th class="total">${t('pages.randomPayer.total')}</th>
                </tr>
              </thead>
              <tbody>`
      
      // Add data rows (exactly 25 rows per page)
      pageData.forEach((reg, index) => {
        const rowNumber = startIndex + index + 1;
        htmlContent += `
                <tr>
                  <td class="row-number">${rowNumber}</td>
                  <td class="payer-name">${translateClientName(reg.client_name) || '&nbsp;'}</td>
                  <td class="city">${translateCityName(reg.city) || '&nbsp;'}</td>
                  <td class="kebele">${reg.kebele || '&nbsp;'}</td>
                  <td class="house-no">${reg.house_no || '&nbsp;'}</td>
                  <td class="receipt-no">${reg.receipt_no || '&nbsp;'}</td>
                  <td class="period-from">${reg.payment_from || '&nbsp;'}</td>
                  <td class="period-to">${reg.payment_to || '&nbsp;'}</td>
                  <td class="period-amount">${reg.period_amount || '&nbsp;'}</td>
                  <td class="fee">${reg.fee || '&nbsp;'}</td>
                  <td class="total">${reg.total || '&nbsp;'}</td>
                  <td class="collected">${reg.collected_amount || '&nbsp;'}</td>
                </tr>`
      })
      
      htmlContent += `
              </tbody>
            </table>
            
            <div class="signature-section">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="border: none; padding: 10px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.collectorName')} ______________________
                  </td>
                  <td style="border: none; padding: 10px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.scienceHead')} __________________
                  </td>
                  <td style="border: none; padding: 10px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.financeHead')} __________________
                  </td>
                </tr>
                <tr>
                  <td style="border: none; padding: 5px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.signature')} ______________________
                  </td>
                  <td style="border: none; padding: 5px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.signature')} ______________________
                  </td>
                  <td style="border: none; padding: 5px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.signature')} ______________________
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </div>`
    }
    
    htmlContent += '</body></html>'
    return htmlContent
  }

  const generatePDFContent = () => {
    // Use loadedData instead of tableData
    let dataToExport = loadedData;
    
    // Calculate total pages
    const totalPages = Math.ceil(dataToExport.length / 25);
    let pdfContent = '';
    
    // Generate content for each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const startIndex = (pageNum - 1) * 25;
      const endIndex = Math.min(startIndex + 25, dataToExport.length);
      let pageData = dataToExport.slice(startIndex, endIndex);
      
      // Fill remaining rows with empty data to make exactly 25 rows per page
      if (pageData.length < 25) {
        const emptyRows = Array(25 - pageData.length).fill({
          client_name: '',
          city: '',
          kebele: '',
          house_no: '',
          receipt_no: '',
          payment_from: '',
          payment_to: '',
          period_amount: '',
          fee: '',
          total: '',
          collected_amount: ''
        });
        pageData = [...pageData, ...emptyRows];
      }
      
      const selectedStaffInfo = getSelectedStaffInfo()
      
      // Add page break before each page except the first
      if (pageNum > 1) {
        pdfContent += '<div style="page-break-before: always;"></div>';
      }
      
      pdfContent += `
        ${pageNum === 1 ? '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + t('pages.randomPayer.documentTitle') + '</title><style>' : ''}
        ${pageNum === 1 ? `
          @page { 
            size: A4 landscape; 
            margin: 5mm 5mm 5mm 5mm; 
          }
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 5mm;
            font-size: 9px;
            line-height: 1.0;
            box-sizing: border-box;
          }
          .page-container {
            min-height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .header { 
            text-align: center; 
            margin-bottom: 3px; 
          }
          .title { 
            font-size: 13px; 
            font-weight: bold; 
            margin-bottom: 1px; 
          }
          .subtitle { 
            font-size: 10px;
            font-weight: bold;
            margin-bottom: 3px; 
          }
          .info { 
            margin-bottom: 3px; 
            font-size: 9px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
          }
          .page-number {
            text-align: right;
            font-size: 8px;
            font-weight: bold;
            margin-bottom: 2px;
            color: #555;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 3px; 
            font-size: 7px;
          }
          th, td { 
            border: 1px solid black; 
            padding: 1px 0.5px; 
            text-align: center; 
            vertical-align: middle;
            font-weight: bold;
          }
          th { 
            background-color: #f0f0f0; 
            font-weight: bold; 
            font-size: 6.5px;
            height: 18px;
          }
          td {
            font-size: 6.5px;
            height: 14px;
          }
          .row-number { width: 3%; }
          .payer-name { width: 16%; }
          .city { width: 7%; }
          .kebele { width: 7%; }
          .house-no { width: 5%; }
          .receipt-no { width: 9%; }
          .period-from { width: 5%; }
          .period-to { width: 5%; }
          .period-amount { width: 7%; }
          .fee { width: 7%; }
          .total { width: 7%; }
          .collected { width: 9%; }
          .table-signature-wrapper {
            page-break-inside: avoid;
          }
          .signature-section { 
            margin-top: 4px; 
            font-size: 8px;
            font-weight: bold;
            page-break-inside: avoid;
            page-break-before: avoid;
          }
        </style></head><body>` : ''}
        
        <div class="page-container">
          <div>
            <div class="header">
              <div class="title">${t('pages.randomPayer.documentTitle')}</div>
              <div class="subtitle">${t('pages.randomPayer.documentSubtitle')}</div>
            </div>`
      
      // Only add work info if both are properly selected
      if (workType && workType !== '' && selectedStaff && selectedStaff !== '') {
        pdfContent += `
            <div class="info">
              <span>${t('pages.randomPayer.workType')}: ${getWorkTypeDisplayName()}</span>
              <span>${t('pages.randomPayer.staff')}: ${selectedStaffInfo?.full_name || selectedStaff}</span>
            </div>`
      }
      
      // Add page number with total pages
      pdfContent += `
            <div class="page-number">Page ${pageNum} of ${totalPages}</div>
            
            <table>
              <thead>
                <tr>
                  <th rowspan="2" class="row-number">${t('pages.randomPayer.rowNo')}</th>
                  <th rowspan="2" class="payer-name">${t('pages.randomPayer.payerName')}</th>
                  <th rowspan="2" class="city">${t('pages.randomPayer.city')}</th>
                  <th rowspan="2" class="kebele">${t('pages.randomPayer.kebele')}</th>
                  <th rowspan="2" class="house-no">${t('pages.randomPayer.houseNo')}</th>
                  <th rowspan="2" class="receipt-no">${t('pages.randomPayer.receiptNo')}</th>
                  <th colspan="2">${t('pages.randomPayer.paymentPeriod')}</th>
                  <th colspan="3">${t('pages.randomPayer.commissionAmount')}</th>
                  <th rowspan="2" class="collected">${t('pages.randomPayer.collectedAmount')}</th>
                </tr>
                <tr>
                  <th class="period-from">${t('pages.randomPayer.from')}</th>
                  <th class="period-to">${t('pages.randomPayer.to')}</th>
                  <th class="period-amount">${t('pages.randomPayer.periodAmount')}</th>
                  <th class="fee">${t('pages.randomPayer.fee')}</th>
                  <th class="total">${t('pages.randomPayer.total')}</th>
                </tr>
              </thead>
              <tbody>`
      
      // Add data rows (exactly 25 rows per page)
      pageData.forEach((reg, index) => {
        const rowNumber = startIndex + index + 1;
        pdfContent += `
                <tr>
                  <td class="row-number">${rowNumber}</td>
                  <td class="payer-name">${translateClientName(reg.client_name) || '&nbsp;'}</td>
                  <td class="city">${translateCityName(reg.city) || '&nbsp;'}</td>
                  <td class="kebele">${reg.kebele || '&nbsp;'}</td>
                  <td class="house-no">${reg.house_no || '&nbsp;'}</td>
                  <td class="receipt-no">${reg.receipt_no || '&nbsp;'}</td>
                  <td class="period-from">${reg.payment_from || '&nbsp;'}</td>
                  <td class="period-to">${reg.payment_to || '&nbsp;'}</td>
                  <td class="period-amount">${reg.period_amount || '&nbsp;'}</td>
                  <td class="fee">${reg.fee || '&nbsp;'}</td>
                  <td class="total">${reg.total || '&nbsp;'}</td>
                  <td class="collected">${reg.collected_amount || '&nbsp;'}</td>
                </tr>`
      })
      
      pdfContent += `
              </tbody>
            </table>
            
            <div class="signature-section">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="border: none; padding: 10px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.collectorName')} ______________________
                  </td>
                  <td style="border: none; padding: 10px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.scienceHead')} __________________
                  </td>
                  <td style="border: none; padding: 10px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.financeHead')} __________________
                  </td>
                </tr>
                <tr>
                  <td style="border: none; padding: 5px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.signature')} ______________________
                  </td>
                  <td style="border: none; padding: 5px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.signature')} ______________________
                  </td>
                  <td style="border: none; padding: 5px 5px; width: 33%; text-align: left; font-weight: bold;">
                    ${t('pages.randomPayer.signature')} ______________________
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </div>`
    }
    
    pdfContent += '</body></html>'
    return pdfContent
  }

  const generateExcelContent = () => {
    // Use loadedData instead of tableData
    const dataToExport = loadedData;
    
    // CSV headers based on current language
    let csvContent = ""
    if (language === 'am') {
      csvContent = "ተ.ቁ,የደንበግኛው ከፋይ ስም,ከተማ,ቀበሌ,የቤት ቁጥር,የከፈለበት ደረሰኝ ቁጥር,ከ,እስከ,የዘመኑ,ውዝፍ,ጠቅላላ ድምር,የተሰበሰበ ብር\n"
    } else {
      csvContent = "Row No,Payer Name,City,Kebele,House No,Receipt No,From,To,Period Amount,Fee,Total,Collected Amount\n"
    }
    
    dataToExport.forEach((reg, index) => {
      csvContent += `${index + 1},"${translateClientName(reg.client_name) || ''}","${translateCityName(reg.city) || ''}","${reg.kebele || ''}","${reg.house_no || ''}","${reg.receipt_no || ''}","${reg.payment_from || ''}","${reg.payment_to || ''}","${reg.period_amount || ''}","${reg.fee || ''}","${reg.total || ''}","${reg.collected_amount || ''}"\n`
    })
    
    return csvContent
  }

  return (
    <div className="random-payer-page">
      <div className="payer-container">
        <div className="page-header-section">
          <div className="title-section">
            <h1 className="page-title">{t('pages.randomPayer.title')}</h1>
            <p className="page-subtitle">{t('pages.randomPayer.subtitle')}</p>
          </div>
          
          {/* Small Action Buttons */}
          <div className="action-buttons-small">
            <button
              type="button"
              className="btn-small btn-word-small"
              onClick={() => handleDownloadClick('word')}
              title={t('pages.randomPayer.downloadWord')}
            >
              📄
            </button>
            <button
              type="button"
              className="btn-small btn-pdf-small"
              onClick={() => handleDownloadClick('pdf')}
              title={t('pages.randomPayer.downloadPDF')}
            >
              📋
            </button>
            <button
              type="button"
              className="btn-small btn-excel-small"
              onClick={() => handleDownloadClick('excel')}
              title={t('pages.randomPayer.downloadExcel')}
            >
              📊
            </button>
            <button
              type="button"
              className="btn-small btn-print-small"
              onClick={() => handleDownloadClick('print')}
              title={t('pages.randomPayer.print')}
            >
              🖨️
            </button>
          </div>
        </div>

        {/* Header Section - Remove staff dropdown, keep only work type */}
        <div className="payer-header">
          <div className="header-controls">
            <div className="control-group">
              <label htmlFor="workType">{t('pages.randomPayer.workType')} *</label>
              <select
                id="workType"
                value={workType}
                onChange={handleWorkTypeChange}
                className="control-select"
              >
                <option value="">-- {t('pages.dataRegistration.selectWorkType')} --</option>
                <option value="redsea-ebc">{t('pages.dataRegistration.redsea')}</option>
                <option value="sells-product">{t('pages.dataRegistration.sellsProduct')}</option>
                <option value="other">{t('pages.dataRegistration.other')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Document Title Section */}
        <div className="document-header">
          <h2 className="document-title">{t('pages.randomPayer.documentTitle')}</h2>
          <h3 className="document-subtitle">
            {t('pages.randomPayer.documentSubtitle')}
          </h3>
        </div>

        {/* Loaded Data from Database Section */}
        <div className="loaded-data-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              {t('pages.randomPayer.loadedFromDatabase')} ({loadedData.length} {t('pages.randomPayer.records')})
            </h3>
          </div>
          
          {/* Data Summary Statistics - Always Visible */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '8px',
            marginBottom: '15px',
            padding: '10px',
            background: '#f8f9fa',
            borderRadius: '4px',
            border: '1px solid #dee2e6'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c41e3a' }}>
                {originalData.length}
              </div>
              <div style={{ fontSize: '10px', color: '#6c757d' }}>
                Total Registered
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>
                {originalData.filter(reg => reg.payment_status === 'received').length}
              </div>
              <div style={{ fontSize: '10px', color: '#6c757d' }}>
                Total Received
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffc107' }}>
                {originalData.filter(reg => reg.payment_status === 'paid').length}
              </div>
              <div style={{ fontSize: '10px', color: '#6c757d' }}>
                Total Unreceived
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#17a2b8' }}>
                {originalData.filter(reg => reg.payment_status === 'need_approval').length}
              </div>
              <div style={{ fontSize: '10px', color: '#6c757d' }}>
                Need Approval
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6f42c1' }}>
                {originalData.filter(reg => reg.payment_status === 'approved').length}
              </div>
              <div style={{ fontSize: '10px', color: '#6c757d' }}>
                Approved
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>
                {originalData.reduce((sum, reg) => sum + (parseFloat(reg.collected_amount) || 0), 0).toLocaleString()}
              </div>
              <div style={{ fontSize: '10px', color: '#6c757d' }}>
                Total Amount (ETB)
              </div>
            </div>
          </div>
          
          {/* Enhanced Quick Filters - Always Visible */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '8px',
            marginBottom: '15px',
            padding: '10px',
            background: '#fff',
            borderRadius: '4px',
            border: '1px solid #dee2e6',
            alignItems: 'end'
          }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Staff:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                value={selectedStaff}
                onChange={(e) => {
                  setSelectedStaff(e.target.value)
                  if (e.target.value === 'all') {
                    setLoadedData(originalData)
                  } else if (e.target.value === '') {
                    setLoadedData(originalData)
                  } else {
                    const filtered = originalData.filter(reg => 
                      reg.staff_id?.toString() === e.target.value || 
                      reg.staff_username === e.target.value
                    )
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              >
                <option value="">All Staff</option>
                {staffList.map(staff => (
                  <option key={staff.id} value={staff.id}>
                    {staff.username}
                  </option>
                ))}
                <option value="other">Other</option>
              </select>
            </div>
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Kebele:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setLoadedData(originalData)
                  } else {
                    const filtered = originalData.filter(reg => reg.kebele === e.target.value)
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              >
                <option value="all">All Kebeles</option>
                {[...new Set(originalData.map(reg => reg.kebele))].filter(kebele => kebele).sort().map(kebele => (
                  <option key={kebele} value={kebele}>{kebele}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>TV Number:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setLoadedData(originalData)
                  } else {
                    const filtered = originalData.filter(reg => reg.tv_no === e.target.value)
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              >
                <option value="all">All TV Numbers</option>
                {Array.from({length: 20}, (_, i) => i + 1).map(num => (
                  <option key={num} value={num.toString()}>{`TV ${num}`}</option>
                ))}
                {[...new Set(originalData.map(reg => reg.tv_no))].filter(tv => tv && !Array.from({length: 20}, (_, i) => (i + 1).toString()).includes(tv)).sort().map(tv => (
                  <option key={tv} value={tv}>{tv}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Type:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setLoadedData(originalData)
                  } else {
                    const filtered = originalData.filter(reg => reg.person === e.target.value)
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              >
                <option value="all">All Types</option>
                <option value="personal">Personal</option>
                <option value="organization">Organization</option>
              </select>
            </div>
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Status:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setLoadedData(originalData)
                  } else {
                    const filtered = originalData.filter(reg => reg.payment_status === e.target.value)
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              >
                <option value="all">All Status</option>
                <option value="received">Received</option>
                <option value="paid">Unreceived</option>
                <option value="need_approval">Need Approval</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Period:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setLoadedData(originalData)
                  } else {
                    const filtered = originalData.filter(reg => reg.payment_period_type === e.target.value)
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              >
                <option value="all">All Periods</option>
                <option value="2014-2018">2014-2018</option>
                <option value="custom">Custom Period</option>
              </select>
            </div>
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Date Filter:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value)
                  const filtered = filterByDate(originalData, e.target.value, customDateFrom, customDateTo)
                  setLoadedData(filtered)
                  setCurrentPage(1)
                }}
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="lastmonth">Last Month</option>
                <option value="last15days">Last 15 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            
            {dateFilter === 'custom' && (
              <>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>From Date:</label>
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => {
                      setCustomDateFrom(e.target.value)
                      const filtered = filterByDate(originalData, 'custom', e.target.value, customDateTo)
                      setLoadedData(filtered)
                      setCurrentPage(1)
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      border: '1px solid #ced4da',
                      borderRadius: '3px',
                      fontSize: '11px'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>To Date:</label>
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => {
                      setCustomDateTo(e.target.value)
                      const filtered = filterByDate(originalData, 'custom', customDateFrom, e.target.value)
                      setLoadedData(filtered)
                      setCurrentPage(1)
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      border: '1px solid #ced4da',
                      borderRadius: '3px',
                      fontSize: '11px'
                    }}
                  />
                </div>
              </>
            )}
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Approval Status:</label>
              <select 
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                onChange={(e) => {
                  if (e.target.value === 'all') {
                    setLoadedData(originalData)
                  } else if (e.target.value === 'need_approve') {
                    const filtered = originalData.filter(reg => reg.payment_status === 'need_approval' || reg.approval_status === 'pending')
                    setLoadedData(filtered)
                  } else if (e.target.value === 'approved') {
                    const filtered = originalData.filter(reg => reg.payment_status === 'approved' || reg.approval_status === 'approved')
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              >
                <option value="all">All Approval Status</option>
                <option value="need_approve">Need Approval</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            
            <div>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#495057', display: 'block', marginBottom: '2px' }}>Search:</label>
              <input
                type="text"
                placeholder="Name, Receipt..."
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  border: '1px solid #ced4da',
                  borderRadius: '3px',
                  fontSize: '11px'
                }}
                onChange={(e) => {
                  const searchTerm = e.target.value.toLowerCase()
                  if (searchTerm === '') {
                    setLoadedData(originalData)
                  } else {
                    const filtered = originalData.filter(reg => 
                      reg.client_name?.toLowerCase().includes(searchTerm) ||
                      reg.receipt_no?.toLowerCase().includes(searchTerm) ||
                      reg.kebele?.toLowerCase().includes(searchTerm)
                    )
                    setLoadedData(filtered)
                  }
                  setCurrentPage(1)
                }}
              />
            </div>
            
            <div>
              <button
                onClick={() => {
                  setLoadedData(originalData)
                  setSelectedStaff('')
                  setDateFilter('all')
                  setCustomDateFrom('')
                  setCustomDateTo('')
                  setCurrentPage(1)
                  // Reset all filter dropdowns
                  document.querySelectorAll('select').forEach(select => {
                    if (select.id !== 'workType') select.selectedIndex = 0
                  })
                  // Reset search input
                  const searchInput = document.querySelector('input[placeholder="Name, Receipt..."]')
                  if (searchInput) searchInput.value = ''
                  // Reset date inputs
                  document.querySelectorAll('input[type="date"]').forEach(input => {
                    input.value = ''
                  })
                }}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              >
                Reset All
              </button>
            </div>
          </div>
          
          {/* Bulk Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '15px',
            padding: '15px',
            background: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #dee2e6',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: 'bold', color: '#495057' }}>Bulk Actions:</span>
            <button
              onClick={() => handleBulkReceived('current')}
              style={{
                padding: '8px 16px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✓ Mark Current Page as Received
            </button>
            <button
              onClick={() => handleBulkReceived('all')}
              style={{
                padding: '8px 16px',
                background: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✓ Mark All Pages as Received
            </button>
            <button
              onClick={() => handleBulkUnreceived('current')}
              style={{
                padding: '8px 16px',
                background: '#ffc107',
                color: 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✗ Mark Current Page as Unreceived
            </button>
            <button
              onClick={() => handleBulkUnreceived('all')}
              style={{
                padding: '8px 16px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✗ Mark All Pages as Unreceived
            </button>
          </div>
          
          {loadedData.length > 0 ? (
            <>
              <div className="table-wrapper">
                <table className="data-table loaded-data-table">
                  <thead>
                    <tr>
                      <th>{t('pages.randomPayer.rowNo')}</th>
                      <th>{t('pages.randomPayer.payerName')}</th>
                      <th>{t('pages.randomPayer.city')}</th>
                      <th>{t('pages.randomPayer.kebele')}</th>
                      <th>{t('pages.randomPayer.houseNo')}</th>
                      <th>{t('pages.randomPayer.receiptNo')}</th>
                      <th colSpan="2">{t('pages.randomPayer.paymentPeriod')}</th>
                      <th colSpan="3">{t('pages.randomPayer.commissionAmount')}</th>
                      <th>{t('pages.randomPayer.collectedAmount')}</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                    <tr>
                      <th colSpan="6"></th>
                      <th>{t('pages.randomPayer.from')}</th>
                      <th>{t('pages.randomPayer.to')}</th>
                      <th>{t('pages.randomPayer.periodAmount')}</th>
                      <th>{t('pages.randomPayer.fee')}</th>
                      <th>{t('pages.randomPayer.total')}</th>
                      <th></th>
                      <th></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadedData
                      .slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
                      .map((reg, index) => {
                        const globalRowNumber = (currentPage - 1) * rowsPerPage + index + 1
                        const rowId = reg.id || reg._id
                        const isEditing = editingRows[rowId]
                        const editData = editedData[rowId] || reg
                        
                        return (
                          <tr key={rowId || index}>
                            <td className="row-number">{globalRowNumber}</td>
                            
                            {/* Editable Payer Name */}
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editData.client_name || ''}
                                  onChange={(e) => handleFieldChange(rowId, 'client_name', e.target.value)}
                                  style={{ width: '100%', padding: '4px', border: '1px solid #ccc' }}
                                />
                              ) : (
                                translateClientName(reg.client_name) || ''
                              )}
                            </td>
                            
                            {/* Editable City */}
                            <td>
                              {isEditing ? (
                                <select
                                  value={editData.city || ''}
                                  onChange={(e) => handleFieldChange(rowId, 'city', e.target.value)}
                                  style={{ width: '100%', padding: '4px', border: '1px solid #ccc' }}
                                >
                                  <option value="Harar">Harar</option>
                                  <option value="Addis Ababa">Addis Ababa</option>
                                  <option value="Dire Dawa">Dire Dawa</option>
                                  <option value="Adama">Adama</option>
                                  <option value="Mekelle">Mekelle</option>
                                  <option value="Hawassa">Hawassa</option>
                                  <option value="Bahir Dar">Bahir Dar</option>
                                  <option value="Jimma">Jimma</option>
                                  <option value="Arba Minch">Arba Minch</option>
                                  <option value="Jijiga">Jijiga</option>
                                  <option value="Dessie">Dessie</option>
                                  <option value="Gondar">Gondar</option>
                                  <option value="Aksum">Aksum</option>
                                  <option value="Dilla">Dilla</option>
                                  <option value="Shashamane">Shashamane</option>
                                </select>
                              ) : (
                                translateCityName(reg.city) || ''
                              )}
                            </td>
                            
                            {/* Editable Kebele */}
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editData.kebele || ''}
                                  onChange={(e) => handleFieldChange(rowId, 'kebele', e.target.value)}
                                  style={{ width: '100%', padding: '4px', border: '1px solid #ccc' }}
                                />
                              ) : (
                                reg.kebele || ''
                              )}
                            </td>
                            
                            {/* Editable House No */}
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editData.house_no || ''}
                                  onChange={(e) => handleFieldChange(rowId, 'house_no', e.target.value)}
                                  style={{ width: '100%', padding: '4px', border: '1px solid #ccc' }}
                                />
                              ) : (
                                reg.house_no || ''
                              )}
                            </td>
                            
                            {/* Editable Receipt No */}
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editData.receipt_no || ''}
                                  onChange={(e) => handleFieldChange(rowId, 'receipt_no', e.target.value)}
                                  style={{ width: '100%', padding: '4px', border: '1px solid #ccc' }}
                                />
                              ) : (
                                reg.receipt_no || ''
                              )}
                            </td>
                            
                            {/* Read-only fields - Payment Period and Commission Amount */}
                            <td>{reg.payment_from || reg.period_from || (reg.payment_from === null ? 'NULL' : 'EMPTY')}</td>
                            <td>{reg.payment_to || reg.period_to || (reg.payment_to === null ? 'NULL' : 'EMPTY')}</td>
                            <td>{reg.period_amount || reg.commission_period_amount || (reg.period_amount === null ? 'NULL' : 'EMPTY')}</td>
                            <td>{reg.fee || reg.commission_fee || (reg.fee === null ? 'NULL' : 'EMPTY')}</td>
                            <td>{reg.total || reg.commission_total || (reg.total === null ? 'NULL' : 'EMPTY')}</td>
                            <td>{reg.collected_amount || '-'}</td>
                            
                            {/* Status */}
                            <td>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                background: reg.payment_status === 'received' ? '#d4edda' : '#fff3cd',
                                color: reg.payment_status === 'received' ? '#155724' : '#856404'
                              }}>
                                {reg.payment_status === 'received' ? 'Received' : 'Unreceived'}
                              </span>
                            </td>
                            
                            {/* Actions */}
                            <td>
                              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveRow(rowId)}
                                      style={{
                                        padding: '4px 8px',
                                        background: '#28a745',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                      }}
                                      title="Save"
                                    >
                                      💾
                                    </button>
                                    <button
                                      onClick={() => handleCancelEdit(rowId)}
                                      style={{
                                        padding: '4px 8px',
                                        background: '#dc3545',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                      }}
                                      title="Cancel"
                                    >
                                      ✖️
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleEditRow(rowId)}
                                    style={{
                                      padding: '4px 8px',
                                      background: '#007bff',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                    title="Edit"
                                  >
                                    ✏️
                                  </button>
                                )}
                                
                                <button
                                  onClick={() => handleToggleReceived(rowId, reg.payment_status)}
                                  style={{
                                    padding: '4px 8px',
                                    background: reg.payment_status === 'received' ? '#ffc107' : '#28a745',
                                    color: reg.payment_status === 'received' ? 'black' : 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                  }}
                                  title={reg.payment_status === 'received' ? 'Mark as Unreceived' : 'Mark as Received'}
                                >
                                  {reg.payment_status === 'received' ? '✗' : '✓'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {loadedData.length > rowsPerPage && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '20px',
                  marginTop: '20px',
                  padding: '15px',
                  background: '#f8f9fa',
                  borderRadius: '4px'
                }}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: '10px 20px',
                      background: currentPage === 1 ? '#ccc' : '#c41e3a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    ← {t('pages.randomPayer.previousPage') || 'Previous Page'}
                  </button>
                  
                  <span style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#2c3e50'
                  }}>
                    {t('pages.randomPayer.page') || 'Page'} {currentPage} {t('pages.randomPayer.of') || 'of'} {Math.ceil(loadedData.length / rowsPerPage)}
                  </span>
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(loadedData.length / rowsPerPage), prev + 1))}
                    disabled={currentPage >= Math.ceil(loadedData.length / rowsPerPage)}
                    style={{
                      padding: '10px 20px',
                      background: currentPage >= Math.ceil(loadedData.length / rowsPerPage) ? '#ccc' : '#c41e3a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: currentPage >= Math.ceil(loadedData.length / rowsPerPage) ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    {t('pages.randomPayer.nextPage') || 'Next Page'} →
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              background: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              color: '#6c757d'
            }}>
              <p style={{ margin: 0, fontSize: '16px' }}>
                📋 {t('pages.randomPayer.noDataFound') || 'No paid records found.'}
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: '14px' }}>
                {t('pages.randomPayer.fillBothFields') || 'Make payments through RandomPiadRegister page to see data here.'}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="form-actions" style={{ marginTop: '30px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button 
            type="button" 
            onClick={() => navigate('/data-collector/dashboard')}
            className="btn-back"
            style={{
              padding: '12px 30px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ← {t('pages.randomPayer.back') || 'Back to Dashboard'}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className={`toast-notification ${notification.type}`}>
          <span className="toast-message">{notification.message}</span>
        </div>
      )}

      {/* Download Dialog Modal */}
      {showDownloadDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '35px 40px',
            maxWidth: '550px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{
              margin: '0 0 15px 0',
              color: '#2c3e50',
              fontSize: '22px',
              textAlign: 'center',
              fontWeight: 'bold',
              lineHeight: '1.4'
            }}>
              {t('pages.randomPayer.downloadOptions') || 'Download Options'}
            </h3>
            
            <p style={{
              margin: '0 0 30px 0',
              color: '#555',
              fontSize: '15px',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              {t('pages.randomPayer.downloadQuestion') || 'Do you want to download the current page only or all pages?'}
            </p>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '15px'
            }}>
              <button
                onClick={() => executeDownload(showDownloadDialog, 'current')}
                style={{
                  padding: '14px 20px',
                  background: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  width: '100%',
                  transition: 'background 0.2s',
                  textAlign: 'center'
                }}
                onMouseOver={(e) => e.target.style.background = '#138496'}
                onMouseOut={(e) => e.target.style.background = '#17a2b8'}
              >
                {t('pages.randomPayer.currentPageOnly') || 'Current Page Only'}
              </button>
              
              <button
                onClick={() => executeDownload(showDownloadDialog, 'all')}
                style={{
                  padding: '14px 20px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  width: '100%',
                  transition: 'background 0.2s',
                  textAlign: 'center'
                }}
                onMouseOver={(e) => e.target.style.background = '#218838'}
                onMouseOut={(e) => e.target.style.background = '#28a745'}
              >
                {t('pages.randomPayer.allPages') || 'All Pages'}
              </button>
            </div>
            
            <button
              onClick={() => setShowDownloadDialog(false)}
              style={{
                padding: '12px 20px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                width: '100%',
                transition: 'background 0.2s',
                textAlign: 'center'
              }}
              onMouseOver={(e) => e.target.style.background = '#5a6268'}
              onMouseOut={(e) => e.target.style.background = '#6c757d'}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RandomPayer
