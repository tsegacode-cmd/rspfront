import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { userAPI, dataRegistrationAPI } from '../../services/api'
import Tesseract from 'tesseract.js'
import './Scanner.css'

function Scanner() {
  const navigate = useNavigate()
  const [workType, setWorkType] = useState('')
  const [selectedStaff, setSelectedStaff] = useState('')
  const [staffList, setStaffList] = useState([])
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [notification, setNotification] = useState(null)
  const [language, setLanguage] = useState('english') // 'english' or 'amharic'
  const [scannedList, setScannedList] = useState([]) // List of scanned items
  const [editingIndex, setEditingIndex] = useState(null) // Index of item being edited
  const [isScanning, setIsScanning] = useState(false) // Scanning state
  const [ocrProgress, setOcrProgress] = useState(0) // OCR progress percentage
  const [isListening, setIsListening] = useState(false) // Voice recognition state
  const [voiceField, setVoiceField] = useState(null) // Which field is being voice-typed
  const [voiceTypingEnabled, setVoiceTypingEnabled] = useState(false) // Voice typing ON/OFF (default OFF to request permission)
  const [voiceMode, setVoiceMode] = useState('none') // 'none', 'desktop', 'mobile'
  const [extractionMode, setExtractionMode] = useState('auto') // 'auto' or 'raw'
  const [showPermissionDialog, setShowPermissionDialog] = useState(false) // Show permission dialog
  const [showScanOptions, setShowScanOptions] = useState(false) // Show scan options dialog
  const cameraInputRef = useRef(null) // Reference to camera input
  const galleryInputRef = useRef(null) // Reference to gallery input
  const recognitionRef = useRef(null) // Reference to speech recognition
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
  })

  useEffect(() => {
    loadStaffList()
    
    // Restore voice mode from localStorage
    const savedVoiceMode = localStorage.getItem('voiceMode')
    if (savedVoiceMode === 'mobile') {
      setVoiceMode('mobile')
      console.log('Mobile voice mode restored from localStorage')
    }
    
    // Check if microphone permission is already granted
    const checkMicrophonePermission = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' })
          
          console.log('Microphone permission status:', permissionStatus.state)
          
          if (permissionStatus.state === 'granted') {
            // Permission already granted - auto-enable voice typing
            console.log('Microphone permission already granted, auto-enabling voice typing')
            setVoiceTypingEnabled(true)
            
            // Initialize and start voice recognition
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start()
                setIsListening(true)
                showNotification('🎤 Voice typing auto-enabled - Microphone ready', 'success')
              } catch (error) {
                console.log('Recognition will start on field focus')
              }
            }
          }
          
          // Listen for permission changes
          permissionStatus.onchange = () => {
            console.log('Microphone permission changed to:', permissionStatus.state)
            if (permissionStatus.state === 'granted' && !voiceTypingEnabled) {
              setVoiceTypingEnabled(true)
              showNotification('🎤 Microphone access granted', 'success')
            } else if (permissionStatus.state === 'denied') {
              setVoiceTypingEnabled(false)
              setIsListening(false)
              showNotification('🔇 Microphone access denied', 'error')
            }
          }
        }
      } catch (error) {
        console.log('Permission API not supported or error:', error)
      }
    }
    
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      
      const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
      
      // Mobile needs different settings
      recognitionRef.current.continuous = !isMobile // Continuous only on desktop
      recognitionRef.current.interimResults = !isMobile // Interim results only on desktop
      recognitionRef.current.maxAlternatives = 1
      recognitionRef.current.lang = language === 'amharic' ? 'am-ET' : 'en-US'
      
      console.log('Speech recognition initialized for:', isMobile ? 'Mobile' : 'Desktop')
      console.log('Settings:', {
        continuous: recognitionRef.current.continuous,
        interimResults: recognitionRef.current.interimResults,
        lang: recognitionRef.current.lang
      })
      
      recognitionRef.current.onresult = (event) => {
        const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
        const lastResultIndex = event.results.length - 1
        const result = event.results[lastResultIndex]
        
        // Only process final results on mobile, interim or final on desktop
        if (isMobile && !result.isFinal) {
          console.log('Mobile: Waiting for final result...')
          return
        }
        
        const transcript = result[0].transcript
        
        console.log('Voice detected:', transcript)
        console.log('Is final:', result.isFinal)
        console.log('Current field:', voiceField)
        console.log('Editing index:', editingIndex)
        
        if (editingIndex !== null && voiceField) {
          // Auto-type the spoken text into the active field
          handleScanFieldChange(editingIndex, voiceField, transcript)
          console.log('Text inserted into field:', voiceField)
          
          // On mobile, stop after successful input
          if (isMobile && result.isFinal) {
            try {
              recognitionRef.current.stop()
              console.log('Mobile: Stopped after final result')
            } catch (e) {
              console.log('Already stopped')
            }
          }
        } else {
          console.warn('No active field for voice input')
          showNotification('⚠️ Please click on a field first', 'error')
        }
      }
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        
        if (event.error === 'no-speech') {
          // Restart if no speech detected
          if (voiceTypingEnabled && recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch (e) {
              console.log('Recognition already started')
            }
          }
        } else if (event.error === 'audio-capture') {
          // Microphone capture error - try to restart
          console.error('Audio capture error - microphone may be blocked or in use')
          setIsListening(false)
          showNotification('❌ Microphone capture failed. Click field again to retry.', 'error')
          
          // Try to restart after a delay
          setTimeout(() => {
            if (voiceTypingEnabled && voiceField && recognitionRef.current) {
              try {
                recognitionRef.current.start()
                setIsListening(true)
                console.log('Retrying microphone capture...')
              } catch (e) {
                console.log('Retry failed:', e)
              }
            }
          }, 1000)
        } else if (event.error === 'not-allowed') {
          showNotification('❌ Microphone permission denied. Enable in browser settings.', 'error')
          setVoiceTypingEnabled(false)
          setIsListening(false)
        } else if (event.error === 'network') {
          showNotification('❌ Network error. Check your internet connection.', 'error')
        } else {
          showNotification(`❌ Voice error: ${event.error}`, 'error')
        }
      }
      
      recognitionRef.current.onend = () => {
        console.log('Recognition ended')
        const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
        
        // Mobile: always stop and wait for next field focus
        // Desktop: auto-restart only if field is still active
        if (isMobile) {
          console.log('Mobile: Recognition stopped, waiting for next field focus')
          setIsListening(false)
        } else if (voiceTypingEnabled && voiceField && editingIndex !== null) {
          // Desktop: auto-restart
          try {
            setTimeout(() => {
              if (recognitionRef.current && voiceTypingEnabled) {
                recognitionRef.current.start()
                console.log('Voice recognition restarted (desktop)')
              }
            }, 100)
          } catch (error) {
            console.log('Recognition restart failed:', error)
            setIsListening(false)
          }
        } else {
          console.log('Recognition stopped (no active field)')
          setIsListening(false)
        }
      }
      
      // Check microphone permission after recognition is initialized
      checkMicrophonePermission()
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
          console.log('Recognition cleanup')
        } catch (error) {
          console.log('Recognition cleanup error')
        }
      }
    }
  }, [])

  useEffect(() => {
    // Update speech recognition language when language changes
    if (recognitionRef.current) {
      recognitionRef.current.lang = language === 'amharic' ? 'am-ET' : 'en-US'
    }
  }, [language])

  useEffect(() => {
    // Enable registration only when both dropdowns are selected
    setRegistrationEnabled(workType !== '' && selectedStaff !== '')
  }, [workType, selectedStaff])

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
      registrationDateTime: ''
    })
  }

  // Random data generators for English
  const englishNames = [
    'John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'David Wilson',
    'Jessica Martinez', 'James Anderson', 'Jennifer Taylor', 'Robert Thomas', 'Mary Jackson'
  ]

  // Random data generators for Amharic
  const amharicNames = [
    'አበበ ተስፋዬ', 'ብርሃኑ መኮንን', 'ሄለን ገብረመድህን', 'ዳዊት አለማየሁ', 'ሳራ ተክለ',
    'ሙሉጌታ ወልደ', 'ትርሃስ በቀለ', 'ሰለሞን ታደሰ', 'ፍቅርተ ሃይሉ', 'ገብረ ስላሴ'
  ]

  // Amharic to English name conversion map
  const amharicToEnglishNames = {
    'አበበ ተስፋዬ': 'Abebe Tesfaye',
    'ብርሃኑ መኮንን': 'Birhanu Mekonnen',
    'ሄለን ገብረመድህን': 'Helen Gebremedhin',
    'ዳዊት አለማየሁ': 'Dawit Alemayehu',
    'ሳራ ተክለ': 'Sara Tekle',
    'ሙሉጌታ ወልደ': 'Mulugeta Wolde',
    'ትርሃስ በቀለ': 'Tirhas Bekele',
    'ሰለሞን ታደሰ': 'Selemon Tadesse',
    'ፍቅርተ ሃይሉ': 'Fikerte Hailu',
    'ገብረ ስላሴ': 'Gebre Silassie'
  }

  const kebeleOptions = [
    'All Woreda', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
    '11', '12', '13', '14', '15', '16', '17', '18', '19', 'Sofi GM', 'Dire T GM'
  ]

  const getRandomElement = (array) => {
    return array[Math.floor(Math.random() * array.length)]
  }

  const getRandomNumber = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  const generateRandomPhone = () => {
    const prefixes = ['+251-91', '+251-92', '+251-93', '+251-94', '+251-11']
    const prefix = getRandomElement(prefixes)
    const number = getRandomNumber(1000000, 9999999)
    return `${prefix}-${number.toString().substring(0, 3)}-${number.toString().substring(3)}`
  }

  const handleScanPaper = () => {
    if (!registrationEnabled) {
      showNotification('⚠️ Please select Work Type and Staff first', 'error')
      return
    }

    // Show scan options dialog
    setShowScanOptions(true)
  }

  const handleScanFromCamera = () => {
    setShowScanOptions(false)
    
    // Detect if desktop or mobile
    const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
    
    if (isMobile) {
      // Mobile: use camera input with capture
      if (cameraInputRef.current) {
        cameraInputRef.current.click()
      }
    } else {
      // Desktop: use camera input (will open webcam)
      if (cameraInputRef.current) {
        cameraInputRef.current.click()
      }
    }
  }

  const handleScanFromGallery = () => {
    setShowScanOptions(false)
    // Trigger gallery input
    if (galleryInputRef.current) {
      galleryInputRef.current.click()
    }
  }

  const handleCancelScan = () => {
    setShowScanOptions(false)
  }

  const parseExtractedText = (text) => {
    console.log('Raw OCR text:', text)
    
    // Split text into lines
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    
    const extractedRows = []
    
    // Try to detect if this is a table format
    const hasTableHeaders = lines.some(line => 
      line.match(/client.*name|phone|kebele|house/i)
    )
    
    console.log('Is table format:', hasTableHeaders)
    
    // Process each line as a potential data row
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Skip empty lines and header lines
      if (!line || line.match(/client.*name|phone|kebele|house|staff|gov.*letter|payment|valid|date|tv.*no/i)) {
        continue
      }
      
      console.log(`Processing line ${i}:`, line)
      
      const rowData = {}
      
      // Extract phone number (10 digits starting with 09 or 07)
      const phoneMatch = line.match(/\b(09\d{8}|07\d{8})\b/)
      if (phoneMatch) {
        rowData.clientPhone = phoneMatch[0]
        console.log('Found phone:', phoneMatch[0])
      }
      
      // Extract kebele (usually 2 digits, common values: 14, 17, etc.)
      const kebeleMatch = line.match(/\b(0[1-9]|1[0-9])\b/)
      if (kebeleMatch) {
        rowData.kebele = kebeleMatch[0]
        console.log('Found kebele:', kebeleMatch[0])
      }
      
      // Extract house number (numbers like 750, 78, 780, 821, 215, or "NEW")
      const houseMatch = line.match(/\b(\d{2,4}|NEW|new)\b/)
      if (houseMatch && houseMatch[0] !== rowData.kebele && houseMatch[0] !== rowData.clientPhone) {
        rowData.houseNo = houseMatch[0]
        console.log('Found house:', houseMatch[0])
      }
      
      // Extract name - look for words at the beginning (before phone number)
      // Names can be: "Mekan gebremariyam", "Askale kirose", etc.
      const nameMatch = line.match(/^([A-Za-z\u1200-\u137F\s]+?)(?=\s*\d|$)/)
      if (nameMatch) {
        const name = nameMatch[1].trim()
        // Filter out common non-name words
        if (name.length >= 3 && !name.match(/client|phone|kebele|house|staff|accept|payment/i)) {
          rowData.clientName = name
          console.log('Found name:', name)
        }
      }
      
      // Only create a row if we have at least a name OR phone
      if (rowData.clientName || rowData.clientPhone) {
        console.log('Creating row with data:', rowData)
        extractedRows.push({
          id: Date.now() + extractedRows.length + Math.random(),
          clientName: rowData.clientName || '',
          kebele: rowData.kebele || '',
          houseNo: rowData.houseNo || '',
          clientPhone: rowData.clientPhone || '',
          tvNo: '1',
          person: 'personal',
          clientEmail: '',
          condition: 'new',
          sign: 'sign',
          govLetter: 'accept',
          paidAmount: '',
          registrationDateTime: '',
          rowNumber: extractedRows.length + 1
        })
      }
    }
    
    // If no rows found, try alternative parsing
    if (extractedRows.length === 0) {
      console.log('No rows found with table parsing, trying line-by-line')
      
      let currentRow = {}
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        
        // Skip headers
        if (line.match(/client.*name|phone|kebele|house|staff|gov.*letter|payment|valid|date|tv.*no/i)) {
          continue
        }
        
        // Look for phone numbers
        const phoneMatch = line.match(/\b(09\d{8}|07\d{8}|\+?251\d{9})\b/)
        if (phoneMatch) {
          currentRow.clientPhone = phoneMatch[0]
        }
        
        // Look for kebele
        const kebeleMatch = line.match(/\b(0[1-9]|1[0-9])\b/)
        if (kebeleMatch) {
          currentRow.kebele = kebeleMatch[0]
        }
        
        // Look for house number
        const houseMatch = line.match(/\b(\d{2,4}|NEW|new)\b/)
        if (houseMatch && houseMatch[0] !== currentRow.kebele) {
          currentRow.houseNo = houseMatch[0]
        }
        
        // Look for names
        const nameMatch = line.match(/^([A-Za-z\u1200-\u137F\s]{3,50})/)
        if (nameMatch && !line.match(/\d/)) {
          currentRow.clientName = nameMatch[1].trim()
        }
        
        // If we have some data, save the row
        if (Object.keys(currentRow).length >= 1) {
          extractedRows.push({
            id: Date.now() + extractedRows.length + Math.random(),
            clientName: currentRow.clientName || '',
            kebele: currentRow.kebele || '',
            houseNo: currentRow.houseNo || '',
            clientPhone: currentRow.clientPhone || '',
            tvNo: '1',
            person: 'personal',
            clientEmail: '',
            condition: 'new',
            sign: 'sign',
            govLetter: 'accept',
            paidAmount: '',
            registrationDateTime: '',
            rowNumber: extractedRows.length + 1
          })
          currentRow = {}
        }
      }
    }
    
    // If still no data found, create one empty row for manual entry
    if (extractedRows.length === 0) {
      console.log('No structured data found, creating empty row')
      extractedRows.push({
        id: Date.now(),
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
        rowNumber: 1,
        rawText: text
      })
    }
    
    console.log('Final extracted rows:', extractedRows)
    return extractedRows
  }

  const preprocessImage = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          // Create canvas for image preprocessing
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          // Set canvas size to image size
          canvas.width = img.width
          canvas.height = img.height
          
          // Draw image
          ctx.drawImage(img, 0, 0)
          
          // Get image data
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imageData.data
          
          // Convert to grayscale and increase contrast
          for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
            // Increase contrast
            const contrast = 1.5
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
            let value = factor * (avg - 128) + 128
            value = Math.max(0, Math.min(255, value))
            
            // Apply threshold for better text recognition
            value = value > 128 ? 255 : 0
            
            data[i] = value     // Red
            data[i + 1] = value // Green
            data[i + 2] = value // Blue
          }
          
          ctx.putImageData(imageData, 0, 0)
          
          // Convert canvas to blob
          canvas.toBlob((blob) => {
            resolve(URL.createObjectURL(blob))
          }, 'image/png')
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = async (event) => {
    const file = event.target.files[0]
    
    if (!file) {
      return
    }

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      showNotification('⚠️ Please select an image file', 'error')
      return
    }

    setIsScanning(true)
    setOcrProgress(0)
    showNotification('📄 Preprocessing image for better accuracy...', 'info')

    try {
      // Preprocess image for better OCR
      const preprocessedImageUrl = await preprocessImage(file)
      const originalImageUrl = URL.createObjectURL(file)
      
      showNotification('📄 Reading text from image...', 'info')
      
      // Determine OCR language based on selected language
      const ocrLang = language === 'amharic' ? 'amh+eng' : 'eng'
      
      console.log('Starting OCR with language:', ocrLang)
      console.log('Using preprocessed image for better accuracy')
      
      // Perform OCR on the preprocessed image
      const result = await Tesseract.recognize(
        preprocessedImageUrl,
        ocrLang,
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.round(m.progress * 100))
            }
            console.log('OCR Progress:', m)
          },
          // Improved OCR settings for table recognition
          tessedit_pageseg_mode: Tesseract.PSM.AUTO,
          preserve_interword_spaces: '1',
        }
      )
      
      const extractedText = result.data.text
      console.log('=== RAW OCR TEXT ===')
      console.log(extractedText)
      console.log('=== END RAW TEXT ===')
      console.log('OCR Confidence:', result.data.confidence + '%')
      
      let extractedRows = []
      
      if (extractionMode === 'raw') {
        // Raw mode: Show exact OCR text without parsing
        console.log('Using RAW extraction mode - showing exact OCR text')
        const lines = extractedText.split('\n').filter(line => line.trim().length > 0)
        
        lines.forEach((line, index) => {
          extractedRows.push({
            id: Date.now() + index + Math.random(),
            clientName: line.trim(), // Put entire line in client name
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
            rowNumber: index + 1,
            rawText: line.trim()
          })
        })
      } else {
        // Auto mode: Parse and extract structured data
        console.log('Using AUTO extraction mode - parsing structured data')
        extractedRows = parseExtractedText(extractedText)
      }
      
      // Add original scanned image to all rows (not preprocessed)
      extractedRows.forEach(row => {
        row.scannedImage = originalImageUrl
        row.fileName = file.name
        row.extractedText = extractedText
      })
      
      // Add all extracted rows to scanned list
      setScannedList(prev => [...prev, ...extractedRows])

      showNotification(`✓ Scanning Finished! Extracted ${extractedRows.length} row(s) from image.`, 'success')
      
      setIsScanning(false)
      setOcrProgress(0)
      
      // Clean up preprocessed image
      URL.revokeObjectURL(preprocessedImageUrl)
      
      // Reset both file inputs
      if (cameraInputRef.current) {
        cameraInputRef.current.value = ''
      }
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ''
      }
    } catch (error) {
      console.error('OCR Error:', error)
      showNotification('❌ Failed to read text from image', 'error')
      setIsScanning(false)
      setOcrProgress(0)
    }
  }

  const handleEditScan = (index) => {
    setEditingIndex(index)
  }

  const handleScanFieldChange = (index, field, value) => {
    setScannedList(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleDeleteScan = (index) => {
    if (window.confirm('Are you sure you want to delete this scanned item?')) {
      setScannedList(prev => prev.filter((_, i) => i !== index))
      showNotification('🗑️ Scanned item deleted', 'info')
    }
  }

  const handleSaveAllScans = async () => {
    if (scannedList.length === 0) {
      showNotification('⚠️ No scanned items to save', 'error')
      return
    }

    try {
      showNotification('💾 Saving all scanned items...', 'info')
      
      const selectedStaffInfo = getSelectedStaffInfo()
      
      // Prepare all registration data
      const allRegistrations = scannedList.map(scan => ({
        work_type: workType,
        staff_id: selectedStaff === 'other' || selectedStaff === 'all' ? null : parseInt(selectedStaff),
        staff_username: selectedStaffInfo ? selectedStaffInfo.username : (selectedStaff === 'other' ? 'Other' : 'All'),
        staff_full_name: selectedStaffInfo ? selectedStaffInfo.full_name : (selectedStaff === 'other' ? 'Other' : 'All'),
        client_name: scan.clientName,
        kebele: scan.kebele,
        house_no: scan.houseNo || null,
        client_phone: scan.clientPhone,
        tv_no: scan.tvNo,
        person: scan.person,
        client_email: scan.clientEmail || null,
        condition: scan.condition,
        sign: scan.sign,
        gov_letter: scan.govLetter,
        paid_amount: scan.paidAmount ? parseFloat(scan.paidAmount) : null,
        payment_status: 'unpaid',
        registered_at: scan.registrationDateTime || new Date().toISOString(),
        registration_datetime: scan.registrationDateTime || null
      }))

      // Save all at once using Promise.all for batch operation
      const savePromises = allRegistrations.map(registrationData => 
        dataRegistrationAPI.createRegistration(registrationData)
      )
      
      const results = await Promise.all(savePromises)
      
      // Count successes and failures
      const successCount = results.filter(r => r.success).length
      const failCount = results.length - successCount

      if (successCount > 0) {
        showNotification(`✓ Successfully saved all ${successCount} scanned item(s) to database!`, 'success')
        setScannedList([]) // Clear the list after successful save
        setEditingIndex(null)
      }

      if (failCount > 0) {
        showNotification(`⚠️ Failed to save ${failCount} item(s)`, 'error')
      }
    } catch (error) {
      console.error('Failed to save scans:', error)
      showNotification(error.message || 'Failed to save scanned items', 'error')
    }
  }

  const handleClearAllScans = () => {
    if (window.confirm('Are you sure you want to clear all scanned items?')) {
      setScannedList([])
      setEditingIndex(null)
      showNotification('🗑️ All scanned items cleared', 'info')
    }
  }

  const startVoiceInput = (index, fieldName) => {
    if (!voiceTypingEnabled) {
      showNotification('⚠️ Voice typing is disabled. Turn it ON first.', 'error')
      return
    }
    
    if (!recognitionRef.current) {
      showNotification('❌ Voice input not supported in this browser', 'error')
      return
    }
    
    // Set the field and index
    setVoiceField(fieldName)
    setEditingIndex(index)
    
    // Stop any existing recognition
    try {
      recognitionRef.current.stop()
    } catch (e) {
      console.log('No recognition to stop')
    }
    
    // Start fresh recognition
    setTimeout(() => {
      try {
        recognitionRef.current.start()
        setIsListening(true)
        showNotification(`🎤 Listening for ${fieldName}... Speak now`, 'info')
        console.log('Voice input started for:', fieldName)
      } catch (error) {
        console.error('Failed to start voice recognition:', error)
        showNotification('❌ Failed to start voice input', 'error')
        setIsListening(false)
        setVoiceField(null)
      }
    }, 200)
  }

  const toggleVoiceDesktop = async () => {
    if (voiceMode === 'desktop') {
      // Turning OFF desktop voice
      setVoiceMode('none')
      setVoiceTypingEnabled(false)
      showNotification('🔇 Desktop voice typing disabled', 'info')
      
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop()
        } catch (error) {
          console.log('Recognition already stopped')
        }
        setIsListening(false)
        setVoiceField(null)
      }
    } else {
      // Turning ON desktop voice - show permission dialog
      setShowPermissionDialog(true)
    }
  }

  const toggleVoiceMobile = () => {
    if (voiceMode === 'mobile') {
      // Turning OFF mobile voice
      setVoiceMode('none')
      
      // Remove from localStorage
      localStorage.removeItem('voiceMode')
      
      showNotification('🔇 Mobile keyboard voice disabled', 'info')
    } else {
      // Turning ON mobile voice - enable permanently
      setVoiceMode('mobile')
      
      // Save to localStorage to persist across page reloads
      localStorage.setItem('voiceMode', 'mobile')
      
      showNotification('🎤 Mobile keyboard voice enabled permanently - Tap 🎤 buttons to use', 'success')
      
      // Auto-focus first editable field if available to show keyboard
      setTimeout(() => {
        const firstInput = document.querySelector('.edit-input')
        if (firstInput) {
          firstInput.focus()
          firstInput.click()
          showNotification('📱 Keyboard opened - Use keyboard mic button to speak', 'info')
        }
      }, 500)
    }
  }

  const toggleVoiceTyping = async () => {
    if (!voiceTypingEnabled) {
      // Show permission dialog first
      setShowPermissionDialog(true)
    } else {
      // Turning OFF - stop listening
      setVoiceTypingEnabled(false)
      showNotification('🔇 Voice typing disabled', 'info')
      
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop()
        } catch (error) {
          console.log('Recognition already stopped')
        }
        setIsListening(false)
        setVoiceField(null)
      }
    }
  }

  const handleEnableMicrophone = async () => {
    setShowPermissionDialog(false)
    
    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('❌ Your browser does not support microphone access.\n\nPlease use:\n• Chrome\n• Edge\n• Firefox\n• Safari (latest version)')
      return
    }
    
    try {
      showNotification('📱 Requesting microphone permission...', 'info')
      
      let stream = null
      
      // Try with advanced settings first
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
      } catch (advancedError) {
        console.log('Advanced audio settings failed, trying basic settings:', advancedError)
        // Fallback to basic audio settings
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      
      // Permission granted - stop the stream (we just needed permission)
      stream.getTracks().forEach(track => track.stop())
      
      setVoiceMode('desktop')
      setVoiceTypingEnabled(true)
      showNotification('✓ Desktop microphone enabled successfully!', 'success')
      
      // Start continuous voice recognition with a delay
      if (recognitionRef.current) {
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        
        // Add delay before starting recognition to ensure microphone is ready
        setTimeout(() => {
          try {
            recognitionRef.current.start()
            setIsListening(true)
            showNotification('🎤 Desktop voice typing active - Click any field and speak', 'success')
          } catch (error) {
            console.error('Failed to start voice recognition:', error)
            if (error.message && error.message.includes('already started')) {
              setIsListening(true)
              showNotification('🎤 Desktop voice typing active - Click any field and speak', 'success')
            } else {
              showNotification('❌ Failed to start voice recognition', 'error')
            }
          }
        }, 500) // 500ms delay
      } else {
        alert('❌ Voice recognition not supported in this browser.\n\nPlease use:\n• Chrome\n• Edge\n• Safari (iOS 14.5+)')
      }
    } catch (error) {
      console.error('Microphone permission error:', error)
      
      // Provide detailed error messages and solutions
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        // Automatically show settings instructions without asking
        handleGoToSettings()
      } else if (error.name === 'NotFoundError') {
        alert('❌ No microphone found!\n\nPlease:\n1. Connect a microphone to your device\n2. Make sure it\'s properly plugged in\n3. Try again')
      } else if (error.name === 'NotReadableError' || error.name === 'AbortError') {
        alert('❌ Microphone is busy or blocked!\n\nAnother application is using your microphone.\n\nPlease:\n1. Close other apps using microphone (Zoom, Teams, etc)\n2. Try again')
      } else if (error.name === 'OverconstrainedError') {
        alert('❌ Microphone settings error!\n\nYour microphone doesn\'t support the requested settings.\n\nTrying with basic settings...')
        
        // Retry with basic settings
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach(track => track.stop())
          setVoiceMode('desktop')
          setVoiceTypingEnabled(true)
          showNotification('✓ Microphone enabled with basic settings', 'success')
          
          // Start recognition with delay
          if (recognitionRef.current) {
            setTimeout(() => {
              try {
                recognitionRef.current.start()
                setIsListening(true)
                showNotification('🎤 Voice typing active', 'success')
              } catch (e) {
                console.log('Recognition start error:', e)
              }
            }, 500)
          }
        } catch (retryError) {
          alert('❌ Still failed. Please check your microphone.')
          setVoiceTypingEnabled(false)
          setVoiceMode('none')
        }
      } else {
        alert(`❌ Microphone error: ${error.message}\n\nPlease:\n1. Check your microphone is connected\n2. Try refreshing the page\n3. Check browser permissions`)
        setVoiceTypingEnabled(false)
        setVoiceMode('none')
      }
    }
  }

  const handleDisableMicrophone = () => {
    setShowPermissionDialog(false)
    showNotification('Voice typing remains disabled', 'info')
  }

  const handleGoToSettings = () => {
    setShowPermissionDialog(false)
    
    // Detect platform and browser
    const isAndroid = /Android/.test(navigator.userAgent)
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)
    const isEdge = /Edg/.test(navigator.userAgent)
    const isFirefox = /Firefox/.test(navigator.userAgent)
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
    
    if (isAndroid) {
      // Android - try multiple methods to open settings
      showNotification('📱 Opening Android settings...', 'info')
      
      // Method 1: Try to open app-specific settings
      setTimeout(() => {
        try {
          // Try Chrome app settings
          if (isChrome) {
            window.location.href = 'intent://settings#Intent;scheme=android-app;package=com.android.chrome;end'
          } else if (isFirefox) {
            window.location.href = 'intent://settings#Intent;scheme=android-app;package=org.mozilla.firefox;end'
          } else {
            // Generic browser settings
            window.location.href = 'intent://settings#Intent;action=android.settings.APPLICATION_SETTINGS;end'
          }
        } catch (e) {
          console.log('Intent failed, showing instructions')
        }
      }, 100)
      
      // Method 2: Show instructions as fallback
      setTimeout(() => {
        alert('📱 Android Settings:\n\n1. Open device Settings\n2. Tap "Apps" or "Applications"\n3. Find your browser (Chrome/Firefox/etc)\n4. Tap "Permissions"\n5. Enable "Microphone"\n6. Return here and click "Enable Microphone"')
      }, 1000)
      
    } else if (isIOS) {
      // iOS - show detailed instructions (can't directly open settings)
      showNotification('📱 Follow instructions to enable microphone', 'info')
      
      alert('📱 iPhone/iPad Settings:\n\n1. Close this browser\n2. Open Settings app on your device\n3. Scroll down and find "Safari" (or "Chrome")\n4. Tap on it\n5. Find "Microphone" and toggle it ON\n6. Return to this page\n7. Refresh the page\n8. Click "Enable Microphone" button')
      
    } else if (isChrome || isEdge) {
      // Desktop Chrome/Edge - open site settings
      try {
        const currentUrl = window.location.origin
        window.open(`chrome://settings/content/siteDetails?site=${encodeURIComponent(currentUrl)}`, '_blank')
        showNotification('📱 Opening browser settings... Enable microphone and return here', 'info')
      } catch (e) {
        alert('Chrome/Edge:\n\n1. Click the lock icon 🔒 in the address bar\n2. Click "Site settings"\n3. Find "Microphone" and change to "Allow"\n4. Refresh this page\n5. Click "Enable Microphone"')
      }
      
    } else if (isFirefox) {
      // Firefox - show instructions
      alert('Firefox:\n\n1. Click the lock icon 🔒 in the address bar\n2. Click the arrow next to "Connection secure"\n3. Click "More information"\n4. Go to "Permissions" tab\n5. Find "Use the Microphone" and uncheck "Use Default"\n6. Select "Allow"\n7. Refresh this page and click "Enable Microphone"')
      
    } else if (isSafari) {
      // Safari - show instructions
      alert('Safari:\n\n1. Go to Safari menu → Settings (or Preferences)\n2. Click "Websites" tab\n3. Click "Microphone" in the left sidebar\n4. Find this website in the list\n5. Change dropdown to "Allow"\n6. Refresh this page and click "Enable Microphone"')
      
    } else {
      // Generic instructions
      alert('To enable microphone:\n\n1. Click the lock icon 🔒 in the address bar\n2. Look for microphone permissions\n3. Change to "Allow"\n4. Refresh this page\n5. Click "Enable Microphone"')
    }
  }

  const handleInputFocus = (index, fieldName) => {
    console.log('Field focused:', fieldName, 'at index:', index)
    const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
    console.log('Is mobile:', isMobile)
    
    if (voiceTypingEnabled && recognitionRef.current) {
      setVoiceField(fieldName)
      setEditingIndex(index)
      
      console.log('Voice field set to:', fieldName)
      console.log('Voice typing enabled:', voiceTypingEnabled)
      console.log('Recognition available:', !!recognitionRef.current)
      
      // Stop any existing recognition first
      try {
        recognitionRef.current.stop()
        console.log('Stopped existing recognition')
      } catch (e) {
        console.log('No recognition to stop')
      }
      
      // For mobile, we need fresh start each time
      // Wait a moment then start fresh
      const delay = isMobile ? 500 : 200 // Longer delay for mobile
      
      setTimeout(() => {
        if (!recognitionRef.current) {
          console.error('Recognition lost')
          showNotification('❌ Voice recognition not available', 'error')
          return
        }
        
        try {
          // Re-configure for mobile if needed
          if (isMobile) {
            recognitionRef.current.continuous = false
            recognitionRef.current.interimResults = false
          }
          
          recognitionRef.current.start()
          setIsListening(true)
          console.log('Voice recognition started for', fieldName)
          showNotification(`🎤 Speak now for ${fieldName}`, 'info')
        } catch (error) {
          console.error('Recognition start error:', error)
          
          if (error.message && error.message.includes('already started')) {
            console.log('Recognition already running')
            setIsListening(true)
            showNotification(`🎤 Speak now for ${fieldName}`, 'info')
          } else {
            console.error('Failed to start:', error.message)
            showNotification('❌ Click field again to retry', 'error')
            setIsListening(false)
          }
        }
      }, delay)
    } else {
      if (!voiceTypingEnabled) {
        console.log('Voice typing is disabled')
      } else {
        console.error('Recognition not initialized')
      }
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
          showNotification('⚠️ Duplicate registration! This client is already registered.', 'error')
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
        showNotification('✓ Data scanned and registered successfully!', 'success')
        
        // Keep form enabled with current values
        console.log('Registration saved successfully. Form remains enabled with current values.')
      }
    } catch (error) {
      console.error('Failed to register data:', error)
      showNotification(error.message || 'Failed to register data', 'error')
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
    <div className="scanner-page">
      <div className="scanner-container">
        <div className="title-section">
          <div className="title-content">
            <h1 className="page-title">Scanner Registration</h1>
            <p className="page-subtitle">Scan and register work data with staff assignment</p>
          </div>
          <div className="language-scanner-controls">
            <div className="language-toggle">
              <button
                type="button"
                className={`lang-btn ${language === 'english' ? 'active' : ''}`}
                onClick={() => setLanguage('english')}
              >
                🇬🇧 English
              </button>
              <button
                type="button"
                className={`lang-btn ${language === 'amharic' ? 'active' : ''}`}
                onClick={() => setLanguage('amharic')}
              >
                🇪🇹 አማርኛ
              </button>
            </div>
            <button
              type="button"
              className={`voice-toggle-btn ${voiceMode === 'desktop' ? 'enabled' : 'disabled'} ${isListening ? 'listening-active' : ''}`}
              onClick={toggleVoiceDesktop}
              title={voiceMode === 'desktop' ? 'Desktop voice: ON (Browser microphone)' : 'Desktop voice: OFF'}
            >
              <span className="voice-icon">🖥️</span>
              <span className="voice-status">
                {voiceMode === 'desktop' ? (isListening ? 'Desktop Voice ON' : 'Desktop Voice ON') : 'Desktop Voice OFF'}
              </span>
            </button>
            <button
              type="button"
              className={`voice-toggle-btn ${voiceMode === 'mobile' ? 'enabled' : 'disabled'}`}
              onClick={toggleVoiceMobile}
              title={voiceMode === 'mobile' ? 'Mobile voice: ON (Keyboard microphone)' : 'Mobile voice: OFF'}
            >
              <span className="voice-icon">📱</span>
              <span className="voice-status">
                {voiceMode === 'mobile' ? 'Mobile Voice ON' : 'Mobile Voice OFF'}
              </span>
            </button>
            <button
              type="button"
              className={`voice-toggle-btn ${extractionMode === 'raw' ? 'enabled' : 'disabled'}`}
              onClick={() => {
                const newMode = extractionMode === 'auto' ? 'raw' : 'auto'
                setExtractionMode(newMode)
                showNotification(
                  newMode === 'raw' 
                    ? '📝 Raw Mode: Shows exact OCR text' 
                    : '🤖 Auto Mode: Parses structured data',
                  'info'
                )
              }}
              title={extractionMode === 'raw' ? 'Raw extraction: Shows exact text' : 'Auto extraction: Parses data'}
            >
              <span className="voice-icon">{extractionMode === 'raw' ? '📝' : '🤖'}</span>
              <span className="voice-status">
                {extractionMode === 'raw' ? 'Raw Text' : 'Auto Parse'}
              </span>
            </button>
            <button
              type="button"
              className="scan-paper-btn"
              onClick={handleScanPaper}
              disabled={!registrationEnabled || isScanning}
            >
              <span className="scan-icon">📄</span>
              <span className="scan-text">
                {isScanning ? `Scanning... ${ocrProgress}%` : 'Scan Paper'}
              </span>
            </button>
            {/* Hidden file inputs for camera and gallery */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Header Section - Dropdowns */}
        <div className="scanner-header">
          <div className="dropdown-section">
            <div className="dropdown-group">
              <label htmlFor="workType">
                <span className="label-icon">📋</span>
                Work Type *
              </label>
              <select
                id="workType"
                value={workType}
                onChange={handleWorkTypeChange}
                className="dropdown-select"
              >
                <option value="">-- Select Work Type --</option>
                <option value="redsea-ebc">1. REDSEA with EBC Work</option>
                <option value="sells-product">2. Sells Product Work</option>
                <option value="other">3. Other</option>
              </select>
            </div>

            <div className="dropdown-group">
              <label htmlFor="staff">
                <span className="label-icon">👤</span>
                Data Collected / Worked Staff *
              </label>
              <select
                id="staff"
                value={selectedStaff}
                onChange={handleStaffChange}
                className="dropdown-select"
              >
                <option value="">-- Select Staff --</option>
                {staffList.map(staff => (
                  <option key={staff.id} value={staff.id}>
                    {staff.username} - {staff.full_name || 'N/A'} - {staff.position || 'No Position'} - {staff.phone || 'No Phone'}
                  </option>
                ))}
                <option value="other">Other</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          {/* Selected Staff Info Display */}
          {selectedStaffInfo && (
            <div className="staff-info-card">
              <h3>Selected Staff Information</h3>
              <div className="staff-details">
                <div className="detail-item">
                  <span className="detail-label">Username:</span>
                  <span className="detail-value">{selectedStaffInfo.username}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Full Name:</span>
                  <span className="detail-value">{selectedStaffInfo.full_name || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Position:</span>
                  <span className="detail-value">{selectedStaffInfo.position || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Phone:</span>
                  <span className="detail-value">{selectedStaffInfo.phone || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Role:</span>
                  <span className="detail-value badge">{selectedStaffInfo.role}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Body Section - Scanner Form */}
        <div className={`scanner-body ${!registrationEnabled ? 'disabled' : ''}`}>
          {!registrationEnabled && (
            <div className="disabled-overlay">
              <div className="disabled-message">
                <span className="icon">🔒</span>
                <p>Please select both Work Type and Staff to enable scanner</p>
              </div>
            </div>
          )}

          {/* Scanned Items List */}
          {scannedList.length > 0 && (
            <div className="scanned-list-section">
              <div className="scanned-list-header">
                <h3>📋 Scanned Items ({scannedList.length})</h3>
                <div className="scanned-list-actions">
                  {voiceTypingEnabled && isListening && voiceField && (
                    <div className="listening-indicator">
                      <span className="listening-pulse">🎤</span>
                      <span className="listening-text">Listening for {voiceField}...</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-save-all"
                    onClick={handleSaveAllScans}
                  >
                    <span className="btn-icon">💾</span>
                    Save All ({scannedList.length})
                  </button>
                  <button
                    type="button"
                    className="btn-clear-all"
                    onClick={handleClearAllScans}
                  >
                    <span className="btn-icon">🗑️</span>
                    Clear All
                  </button>
                </div>
              </div>

              <div className="scanned-table-wrapper">
                <table className="scanned-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Image</th>
                      <th>Row</th>
                      <th>Client Name</th>
                      <th>Kebele</th>
                      <th>House No</th>
                      <th>Phone</th>
                      <th>TV No</th>
                      <th>Person</th>
                      <th>Condition</th>
                      <th>Sign</th>
                      <th>Gov Letter</th>
                      <th>Paid Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedList.map((scan, index) => (
                      <tr key={scan.id} className={editingIndex === index ? 'editing' : ''}>
                        <td>{index + 1}</td>
                        <td>
                          {scan.scannedImage && (
                            <img 
                              src={scan.scannedImage} 
                              alt="Scanned document" 
                              className="scanned-image-preview"
                              onClick={() => window.open(scan.scannedImage, '_blank')}
                              title="Click to view full size"
                            />
                          )}
                        </td>
                        <td>
                          <span className="row-badge">Row {scan.rowNumber || 1}</span>
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <div className="voice-input-wrapper">
                              <input
                                type="text"
                                value={scan.clientName}
                                onChange={(e) => handleScanFieldChange(index, 'clientName', e.target.value)}
                                onFocus={() => handleInputFocus(index, 'clientName')}
                                className="edit-input"
                                placeholder="Enter name or speak"
                                autoFocus
                                inputMode="text"
                                id={`clientName-${index}`}
                              />
                              <button
                                type="button"
                                className={`voice-btn ${isListening && voiceField === 'clientName' ? 'listening' : ''}`}
                                onClick={() => {
                                  if (voiceMode === 'desktop') {
                                    startVoiceInput(index, 'clientName')
                                  } else {
                                    const input = document.getElementById(`clientName-${index}`)
                                    if (input) {
                                      input.focus()
                                      input.click()
                                    }
                                  }
                                }}
                                title={voiceMode === 'desktop' ? 'Use desktop microphone' : 'Open keyboard to use voice typing'}
                              >
                                🎤
                              </button>
                            </div>
                          ) : (
                            scan.clientName || <span style={{color: '#adb5bd', fontStyle: 'italic'}}>Not filled</span>
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <select
                              value={scan.kebele}
                              onChange={(e) => handleScanFieldChange(index, 'kebele', e.target.value)}
                              className="edit-select"
                            >
                              {kebeleOptions.map(k => (
                                <option key={k} value={k}>{k}</option>
                              ))}
                            </select>
                          ) : (
                            scan.kebele
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <div className="voice-input-wrapper">
                              <input
                                type="text"
                                value={scan.houseNo}
                                onChange={(e) => handleScanFieldChange(index, 'houseNo', e.target.value)}
                                onFocus={() => handleInputFocus(index, 'houseNo')}
                                className="edit-input"
                                placeholder="House no or speak"
                                inputMode="text"
                                id={`houseNo-${index}`}
                              />
                              <button
                                type="button"
                                className={`voice-btn ${isListening && voiceField === 'houseNo' ? 'listening' : ''}`}
                                onClick={() => {
                                  if (voiceMode === 'desktop') {
                                    startVoiceInput(index, 'houseNo')
                                  } else {
                                    const input = document.getElementById(`houseNo-${index}`)
                                    if (input) {
                                      input.focus()
                                      input.click()
                                    }
                                  }
                                }}
                                title={voiceMode === 'desktop' ? 'Use desktop microphone' : 'Open keyboard to use voice typing'}
                              >
                                🎤
                              </button>
                            </div>
                          ) : (
                            scan.houseNo || <span style={{color: '#adb5bd', fontStyle: 'italic'}}>-</span>
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <div className="voice-input-wrapper">
                              <input
                                type="tel"
                                value={scan.clientPhone}
                                onChange={(e) => handleScanFieldChange(index, 'clientPhone', e.target.value)}
                                onFocus={() => handleInputFocus(index, 'clientPhone')}
                                className="edit-input"
                                placeholder="Phone or speak"
                                inputMode="tel"
                                id={`clientPhone-${index}`}
                              />
                              <button
                                type="button"
                                className={`voice-btn ${isListening && voiceField === 'clientPhone' ? 'listening' : ''}`}
                                onClick={() => {
                                  if (voiceMode === 'desktop') {
                                    startVoiceInput(index, 'clientPhone')
                                  } else {
                                    const input = document.getElementById(`clientPhone-${index}`)
                                    if (input) {
                                      input.focus()
                                      input.click()
                                    }
                                  }
                                }}
                                title={voiceMode === 'desktop' ? 'Use desktop microphone' : 'Open keyboard to use voice typing'}
                              >
                                🎤
                              </button>
                            </div>
                          ) : (
                            scan.clientPhone || <span style={{color: '#adb5bd', fontStyle: 'italic'}}>Not filled</span>
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <input
                              type="text"
                              value={scan.tvNo}
                              onChange={(e) => handleScanFieldChange(index, 'tvNo', e.target.value)}
                              className="edit-input small"
                            />
                          ) : (
                            scan.tvNo
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <select
                              value={scan.person}
                              onChange={(e) => handleScanFieldChange(index, 'person', e.target.value)}
                              className="edit-select"
                            >
                              <option value="personal">Personal</option>
                              <option value="organization">Organization</option>
                            </select>
                          ) : (
                            scan.person
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <select
                              value={scan.condition}
                              onChange={(e) => handleScanFieldChange(index, 'condition', e.target.value)}
                              className="edit-select"
                            >
                              <option value="new">New</option>
                              <option value="old">Old</option>
                            </select>
                          ) : (
                            scan.condition
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <select
                              value={scan.sign}
                              onChange={(e) => handleScanFieldChange(index, 'sign', e.target.value)}
                              className="edit-select"
                            >
                              <option value="sign">Sign</option>
                              <option value="unsign">Unsign</option>
                            </select>
                          ) : (
                            scan.sign
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <select
                              value={scan.govLetter}
                              onChange={(e) => handleScanFieldChange(index, 'govLetter', e.target.value)}
                              className="edit-select"
                            >
                              <option value="accept">Accept</option>
                              <option value="unaccept">Unaccept</option>
                            </select>
                          ) : (
                            scan.govLetter
                          )}
                        </td>
                        <td>
                          {editingIndex === index ? (
                            <div className="voice-input-wrapper">
                              <input
                                type="number"
                                value={scan.paidAmount}
                                onChange={(e) => handleScanFieldChange(index, 'paidAmount', e.target.value)}
                                onFocus={() => handleInputFocus(index, 'paidAmount')}
                                className="edit-input small"
                                placeholder="Amount or speak"
                                inputMode="numeric"
                                id={`paidAmount-${index}`}
                              />
                              <button
                                type="button"
                                className={`voice-btn ${isListening && voiceField === 'paidAmount' ? 'listening' : ''}`}
                                onClick={() => {
                                  if (voiceMode === 'desktop') {
                                    startVoiceInput(index, 'paidAmount')
                                  } else {
                                    const input = document.getElementById(`paidAmount-${index}`)
                                    if (input) {
                                      input.focus()
                                      input.click()
                                    }
                                  }
                                }}
                                title={voiceMode === 'desktop' ? 'Use desktop microphone' : 'Open keyboard to use voice typing'}
                              >
                                🎤
                              </button>
                            </div>
                          ) : (
                            scan.paidAmount || <span style={{color: '#adb5bd', fontStyle: 'italic'}}>-</span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            {editingIndex === index ? (
                              <button
                                type="button"
                                className="btn-done"
                                onClick={() => setEditingIndex(null)}
                                title="Done Editing"
                              >
                                ✓
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-edit"
                                onClick={() => handleEditScan(index)}
                                title="Edit"
                              >
                                ✏️
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-delete"
                              onClick={() => handleDeleteScan(index)}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="scanner-form">
            <h2 className="section-title">Scanner Registration Details</h2>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="clientName">Client Name *</label>
                <input
                  type="text"
                  id="clientName"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  placeholder="Enter client name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="kebele">Kebele *</label>
                <select
                  id="kebele"
                  name="kebele"
                  value={formData.kebele}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="">-- Select Kebele --</option>
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
                <label htmlFor="houseNo">House No</label>
                <input
                  type="text"
                  id="houseNo"
                  name="houseNo"
                  value={formData.houseNo}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  placeholder="Enter house number"
                />
              </div>

              <div className="form-group">
                <label htmlFor="clientPhone">Client Phone *</label>
                <input
                  type="tel"
                  id="clientPhone"
                  name="clientPhone"
                  value={formData.clientPhone}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  placeholder="+251-11-123-4567"
                />
              </div>

              <div className="form-group">
                <label htmlFor="tvNo">TV No *</label>
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
                <label htmlFor="person">Person *</label>
                <select
                  id="person"
                  name="person"
                  value={formData.person}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="personal">Personal</option>
                  <option value="organization">Organization</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="clientEmail">Client Email</label>
                <input
                  type="email"
                  id="clientEmail"
                  name="clientEmail"
                  value={formData.clientEmail}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  placeholder="client@example.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="condition">Condition *</label>
                <select
                  id="condition"
                  name="condition"
                  value={formData.condition}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
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
                  value={formData.sign}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="sign">Sign</option>
                  <option value="unsign">Unsign</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="govLetter">Gov Letter *</label>
                <select
                  id="govLetter"
                  name="govLetter"
                  value={formData.govLetter}
                  onChange={handleInputChange}
                  required
                  disabled={!registrationEnabled}
                  className="form-select"
                >
                  <option value="accept">Accept</option>
                  <option value="unaccept">Unaccept</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="paidAmount">Paid Amount (Birr)</label>
                <input
                  type="number"
                  id="paidAmount"
                  name="paidAmount"
                  value={formData.paidAmount}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  className="form-input"
                  placeholder="Enter paid amount"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="form-group">
                <label htmlFor="registrationDateTime">VALID DATE OFFICIAL LETTER</label>
                <input
                  type="datetime-local"
                  id="registrationDateTime"
                  name="registrationDateTime"
                  value={formData.registrationDateTime}
                  onChange={handleInputChange}
                  disabled={!registrationEnabled}
                  className="form-input"
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
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-clear"
                    onClick={handleClearForm}
                    disabled={!registrationEnabled}
                  >
                    <span className="btn-icon">🗑️</span>
                    Clear
                  </button>
                  <button
                    type="submit"
                    className="btn-submit"
                    disabled={!registrationEnabled}
                  >
                    <span className="btn-icon">📷</span>
                    Scan & Register
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

      {/* Scan Options Dialog */}
      {showScanOptions && (
        <div className="permission-dialog-overlay">
          <div className="permission-dialog">
            <div className="permission-dialog-header">
              <span className="permission-icon">📷</span>
              <h2>Choose Scan Source</h2>
            </div>
            <div className="permission-dialog-body">
              <p>Select where you want to scan the document from:</p>
            </div>
            <div className="permission-dialog-actions">
              <button
                type="button"
                className="permission-btn enable"
                onClick={handleScanFromCamera}
              >
                <span>📷</span>
                Open Camera
              </button>
              <button
                type="button"
                className="permission-btn settings"
                onClick={handleScanFromGallery}
              >
                <span>🖼️</span>
                Choose from Gallery
              </button>
              <button
                type="button"
                className="permission-btn disable"
                onClick={handleCancelScan}
              >
                <span>✕</span>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microphone Permission Dialog */}
      {showPermissionDialog && (
        <div className="permission-dialog-overlay">
          <div className="permission-dialog">
            <div className="permission-dialog-header">
              <span className="permission-icon">🎤</span>
              <h2>Enable Voice Typing?</h2>
            </div>
            <div className="permission-dialog-body">
              <p>Voice typing allows you to speak and automatically fill in data fields.</p>
              <p><strong>This requires microphone access.</strong></p>
              <ul>
                <li>✓ Hands-free data entry</li>
                <li>✓ Faster than typing</li>
                <li>✓ Works in English and Amharic</li>
              </ul>
            </div>
            <div className="permission-dialog-actions">
              <button
                type="button"
                className="permission-btn enable"
                onClick={handleEnableMicrophone}
              >
                <span>🎤</span>
                Enable Microphone
              </button>
              <button
                type="button"
                className="permission-btn settings"
                onClick={handleGoToSettings}
              >
                <span>⚙️</span>
                Go to Settings
              </button>
              <button
                type="button"
                className="permission-btn disable"
                onClick={handleDisableMicrophone}
              >
                <span>✕</span>
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Scanner
