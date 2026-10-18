// Translation utility for PayRegistration and RandomPiadRegister pages

export const translations = {
  en: {
    // Page titles
    payRegistration: 'Pay Registration',
    randomPaidRegister: 'Random Paid Register',
    
    // Section headers
    registrationDetails: 'Registration Details',
    registrations: 'Registrations',
    needApproval: 'Need Approval',
    
    // Form labels
    payerName: 'Payer Name',
    city: 'City',
    kebele: 'Kebele',
    houseNo: 'House No',
    receiptNo: 'Receipt No',
    paymentPeriod: 'Payment Period',
    fromYear: 'From Year',
    toYear: 'To Year',
    periodAmount: 'Period Amount',
    fee: 'Fee',
    total: 'Total',
    collectedAmount: 'Collected Amount',
    clientPhone: 'Client Phone',
    tvNo: 'TV No',
    person: 'Person',
    clientEmail: 'Client Email',
    condition: 'Condition',
    sign: 'Sign',
    govLetter: 'Gov Letter',
    validDateOfficialLetter: 'VALID DATE OFFICIAL LETTER',
    workType: 'Work Type',
    dataCollectedWorkedStaff: 'Data Collected / Worked Staff',
    paymentStatusFilter: 'Payment Status Filter',
    filterByKebele: 'Filter by Kebele',
    assignedStaff: 'Assigned Staff',
    clientName: 'Client Name',
    paidAmount: 'Paid Amount',
    editRegistration: 'Edit Registration',
    updateRegistration: 'Update Registration',
    selectedRegistrationInformation: 'Selected Registration Information',
    selectedStaffInformation: 'Selected Staff Information',
    username: 'Username',
    fullName: 'Full Name',
    position: 'Position',
    phone: 'Phone',
    role: 'Role',
    found: 'Found',
    tv: 'TV',
    organization: 'Organization',
    startDate: 'Start Date',
    endDate: 'End Date',
    deleteConfirm: 'Are you sure you want to delete registration for',
    paymentStatus: 'Payment Status',
    
    // Placeholders
    enterPayerName: 'Enter payer name',
    enterHouseNo: 'Enter house number',
    enterReceiptNo: 'Enter receipt number',
    enterFromYear: 'Enter from year',
    enterToYear: 'Enter to year',
    enterPeriodAmount: 'Enter period amount',
    enterFee: 'Enter fee',
    enterTotal: 'Enter total',
    enterCollectedAmount: 'Enter collected amount',
    phonePlaceholder: '+251-11-123-4567',
    emailPlaceholder: 'user@example.com',
    
    // Dropdown options
    selectKebele: '-- Select Kebele --',
    allWoreda: 'All Woreda',
    selectWorkType: '-- Select Work Type --',
    selectStaff: '-- Select Staff --',
    unapprovedStaff: 'UNAPPROVED STAFF',
    other: 'Other',
    all: 'All',
    allPaidUnpaid: 'All (Paid + Unpaid)',
    paidOnly: 'Paid Only',
    unpaidOnly: 'Unpaid Only',
    noStaffAccountsFound: 'No staff accounts found - Please create users first',
    
    // Work Type options
    redseaEbc: '1. REDSEA with EBC Work',
    sellsProduct: '2. Sells Product Work',
    otherWork: '3. Other',
    
    // Person options
    personal: 'Personal',
    company: 'Company',
    
    // Condition options
    new: 'New',
    old: 'Old',
    
    // Sign options
    signOption: 'Sign',
    unsign: 'Unsign',
    
    // Gov Letter options
    accept: 'Accept',
    unaccept: 'Unaccept',
    
    // Payment Period options
    period2014to2018: '2014 to 2018',
    custom: 'Custom',
    
    // Buttons
    clear: 'Clear',
    cancel: 'Cancel',
    pay: 'PAY',
    update: 'UPDATE',
    
    // Search and filters
    searchPlaceholder: '🔍 Search by name, phone, kebele...',
    allTime: '📅 All Time',
    today: '📅 Today',
    thisWeek: '📅 This Week',
    lastWeek: '📅 Last Week',
    last10Days: '📅 Last 10 Days',
    thisMonth: '📅 This Month',
    lastMonth: '📅 Last Month',
    thisYear: '📅 This Year',
    customRange: '📅 Custom Range',
    
    // Payment status
    paymentStatus: 'Payment Status',
    allStatus: 'All',
    paid: 'Paid',
    unpaid: 'Unpaid',
    
    // Status badges
    unpaidBadge: '⏳',
    paidBadge: '✓',
    
    // Notifications
    registrationUpdatedToPaid: '✓ Registration updated to PAID successfully!',
    payRegistrationCompleted: '✓ Pay registration completed successfully!',
    registrationUpdated: '✓ Registration updated successfully!',
    alreadyPaid: '⚠️ This registration is already PAID!',
    cannotRegisterPaymentAgain: '⚠️ This registration is already PAID! Cannot register payment again.',
    failedToRegisterPayment: 'Failed to register payment',
    failedToUpdateRegistration: 'Failed to update registration',
    
    // Currency
    etb: 'ETB',
    birr: 'Birr',
    
    // List columns
    name: 'Name',
    phone: 'Phone',
    status: 'Status',
    amount: 'Amount',
    date: 'Date',
    
    // Language
    language: 'Language',
    english: '🇬🇧 English',
    amharic: '🇪🇹 አማርኛ',
    
    // Random Payer specific
    loadedFromDatabase: 'Loaded from Database',
    records: 'records',
    manualEntry: 'Manual Entry',
    refresh: 'Refresh',
    noDataFound: 'No records found with both Receipt No and Collected Amount filled.',
    fillBothFields: 'Please fill both Receipt No and Collected Amount in PayRegistration page to see data here.',
    previousPage: 'Previous Page',
    nextPage: 'Next Page',
    page: 'Page',
    of: 'of',
    downloadOptions: 'Download Options',
    downloadQuestion: 'Do you want to download the current page only or all pages?',
    currentPageOnly: 'Current Page Only',
    allPages: 'All Pages'
  },
  am: {
    // Page titles
    payRegistration: 'የክፍያ ምዝገባ',
    randomPaidRegister: 'ዘፈቀደ የተከፈለ ምዝገባ',
    
    // Section headers
    registrationDetails: 'የምዝገባ ዝርዝሮች',
    registrations: 'ምዝገባዎች',
    needApproval: 'ማጽደቅ ያስፈልጋል',
    
    // Form labels
    payerName: 'የከፋይ ስም',
    city: 'ከተማ',
    kebele: 'ቀበሌ',
    houseNo: 'የቤት ቁጥር',
    receiptNo: 'የደረሰኝ ቁጥር',
    paymentPeriod: 'የክፍያ ጊዜ',
    fromYear: 'ከዓመት',
    toYear: 'እስከ ዓመት',
    periodAmount: 'የጊዜ መጠን',
    fee: 'ክፍያ',
    total: 'ጠቅላላ',
    collectedAmount: 'የተሰበሰበ መጠን',
    clientPhone: 'የደንበኛ ስልክ',
    tvNo: 'የቲቪ ቁጥር',
    person: 'ሰው',
    clientEmail: 'የደንበኛ ኢሜይል',
    condition: 'ሁኔታ',
    sign: 'ፊርማ',
    govLetter: 'የመንግስት ደብዳቤ',
    validDateOfficialLetter: 'የይፋዊ ደብዳቤ ትክክለኛ ቀን',
    workType: 'የስራ አይነት',
    dataCollectedWorkedStaff: 'መረጃ የሰበሰበ / የሰራ ሰራተኛ',
    paymentStatusFilter: 'የክፍያ ሁኔታ ማጣሪያ',
    filterByKebele: 'በቀበሌ ማጣሪያ',
    assignedStaff: 'የተመደበ ሰራተኛ',
    clientName: 'የደንበኛ ስም',
    paidAmount: 'የተከፈለ መጠን',
    editRegistration: 'ምዝገባ አርትዕ',
    updateRegistration: 'ምዝገባ አዘምን',
    selectedRegistrationInformation: 'የተመረጠ ምዝገባ መረጃ',
    selectedStaffInformation: 'የተመረጠ ሰራተኛ መረጃ',
    username: 'የተጠቃሚ ስም',
    fullName: 'ሙሉ ስም',
    position: 'ቦታ',
    phone: 'ስልክ',
    role: 'ሚና',
    found: 'ተገኝቷል',
    tv: 'ቲቪ',
    organization: 'ድርጅት',
    startDate: 'መጀመሪያ ቀን',
    endDate: 'መጨረሻ ቀን',
    deleteConfirm: 'ለ ምዝገባ መሰረዝ እርግጠኛ ነዎት',
    paymentStatus: 'የክፍያ ሁኔታ',
    
    // Placeholders
    enterPayerName: 'የከፋይ ስም ያስገቡ',
    enterHouseNo: 'የቤት ቁጥር ያስገቡ',
    enterReceiptNo: 'የደረሰኝ ቁጥር ያስገቡ',
    enterFromYear: 'ከዓመት ያስገቡ',
    enterToYear: 'እስከ ዓመት ያስገቡ',
    enterPeriodAmount: 'የጊዜ መጠን ያስገቡ',
    enterFee: 'ክፍያ ያስገቡ',
    enterTotal: 'ጠቅላላ ያስገቡ',
    enterCollectedAmount: 'የተሰበሰበ መጠን ያስገቡ',
    phonePlaceholder: '+251-11-123-4567',
    emailPlaceholder: 'user@example.com',
    
    // Dropdown options
    selectKebele: '-- ቀበሌ ይምረጡ --',
    allWoreda: 'ሁሉም ወረዳ',
    selectWorkType: '-- የስራ አይነት ይምረጡ --',
    selectStaff: '-- ሰራተኛ ይምረጡ --',
    unapprovedStaff: 'ያልተፈቀደ ሰራተኛ',
    other: 'ሌላ',
    all: 'ሁሉም',
    allPaidUnpaid: 'ሁሉም (ተከፍሏል + አልተከፈለም)',
    paidOnly: 'ተከፍሏል ብቻ',
    unpaidOnly: 'አልተከፈለም ብቻ',
    noStaffAccountsFound: 'ምንም የሰራተኛ መለያዎች አልተገኙም - እባክዎ መጀመሪያ ተጠቃሚዎችን ይፍጠሩ',
    
    // Work Type options
    redseaEbc: '1. ሬድሲ ከኢቢሲ ጋር ስራ',
    sellsProduct: '2. ምርት መሸጫ ስራ',
    otherWork: '3. ሌላ',
    
    // Person options
    personal: 'ግል',
    company: 'ኩባንያ',
    
    // Condition options
    new: 'አዲስ',
    old: 'አሮጌ',
    
    // Sign options
    signOption: 'ፊርማ',
    unsign: 'ያልተፈረመ',
    
    // Gov Letter options
    accept: 'ተቀባይነት',
    unaccept: 'ያልተቀበለ',
    
    // Payment Period options
    period2014to2018: '2014 እስከ 2018',
    custom: 'ብጁ',
    
    // Buttons
    clear: 'አጽዳ',
    cancel: 'ሰርዝ',
    pay: 'ክፈል',
    update: 'አዘምን',
    
    // Search and filters
    searchPlaceholder: '🔍 በስም፣ ስልክ፣ ቀበሌ ይፈልጉ...',
    allTime: '📅 ሁሉም ጊዜ',
    today: '📅 ዛሬ',
    thisWeek: '📅 በዚህ ሳምንት',
    lastWeek: '📅 ባለፈው ሳምንት',
    last10Days: '📅 ባለፉት 10 ቀናት',
    thisMonth: '📅 በዚህ ወር',
    lastMonth: '📅 ባለፈው ወር',
    thisYear: '📅 በዚህ ዓመት',
    customRange: '📅 ብጁ ክልል',
    
    // Payment status
    paymentStatus: 'የክፍያ ሁኔታ',
    allStatus: 'ሁሉም',
    paid: 'ተከፍሏል',
    unpaid: 'አልተከፈለም',
    
    // Status badges
    unpaidBadge: '⏳',
    paidBadge: '✓',
    
    // Notifications
    registrationUpdatedToPaid: '✓ ምዝገባ ወደ ተከፍሏል በተሳካ ሁኔታ ተዘምኗል!',
    payRegistrationCompleted: '✓ የክፍያ ምዝገባ በተሳካ ሁኔታ ተጠናቋል!',
    registrationUpdated: '✓ ምዝገባ በተሳካ ሁኔታ ተዘምኗል!',
    alreadyPaid: '⚠️ ይህ ምዝገባ አስቀድሞ ተከፍሏል!',
    cannotRegisterPaymentAgain: '⚠️ ይህ ምዝገባ አስቀድሞ ተከፍሏል! እንደገና ክፍያ መመዝገብ አይቻልም።',
    failedToRegisterPayment: 'ክፍያ መመዝገብ አልተሳካም',
    failedToUpdateRegistration: 'ምዝገባ ማዘመን አልተሳካም',
    
    // Currency
    etb: 'ብር',
    birr: 'ብር',
    
    // List columns
    name: 'ስም',
    phone: 'ስልክ',
    status: 'ሁኔታ',
    amount: 'መጠን',
    date: 'ቀን',
    
    // Language
    language: 'ቋንቋ',
    english: '🇬🇧 English',
    amharic: '🇪🇹 አማርኛ',
    
    // Random Payer specific
    loadedFromDatabase: 'ከዳታቤዝ የተጫነ',
    records: 'መዝገቦች',
    manualEntry: 'በእጅ ማስገባት',
    refresh: 'አድስ',
    noDataFound: 'የደረሰኝ ቁጥር እና የተሰበሰበ መጠን ሁለቱም የተሞሉ መዝገቦች አልተገኙም።',
    fillBothFields: 'እዚህ መረጃ ለማየት እባክዎ በክፍያ ምዝገባ ገጽ ላይ የደረሰኝ ቁጥር እና የተሰበሰበ መጠን ሁለቱንም ይሙሉ።',
    previousPage: 'ቀዳሚ ገጽ',
    nextPage: 'ቀጣይ ገጽ',
    page: 'ገጽ',
    of: 'ከ',
    downloadOptions: 'የማውረድ አማራጮች',
    downloadQuestion: 'የአሁኑን ገጽ ብቻ ወይስ ሁሉንም ገጾች ማውረድ ይፈልጋሉ?',
    currentPageOnly: 'የአሁኑን ገጽ ብቻ',
    allPages: 'ሁሉንም ገጾች'
  }
};

// Helper function to get translation
export const t = (key, lang = 'en') => {
  return translations[lang][key] || translations['en'][key] || key;
};
