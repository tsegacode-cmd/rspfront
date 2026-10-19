import { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import './EthiopianDateInput.css'

// Ethiopian calendar conversion functions
const gregorianToEthiopian = (gregorianDate) => {
  if (!gregorianDate) return null
  
  const date = new Date(gregorianDate)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  // Ethiopian calendar is 7-8 years behind Gregorian
  let ethiopianYear = year - 8
  let ethiopianMonth = month
  let ethiopianDay = day

  // Adjust for Ethiopian New Year (September 11)
  if (month < 9 || (month === 9 && day < 11)) {
    ethiopianYear -= 1
  }

  // Adjust month (Ethiopian months start from September)
  if (month >= 9) {
    ethiopianMonth = month - 8
  } else {
    ethiopianMonth = month + 4
  }

  return {
    year: ethiopianYear,
    month: ethiopianMonth,
    day: ethiopianDay,
    formatted: `${ethiopianDay}/${ethiopianMonth}/${ethiopianYear}`
  }
}

const ethiopianToGregorian = (ethiopianYear, ethiopianMonth, ethiopianDay) => {
  // Convert Ethiopian date to Gregorian
  let gregorianYear = ethiopianYear + 8
  let gregorianMonth = ethiopianMonth + 8
  let gregorianDay = ethiopianDay

  if (gregorianMonth > 12) {
    gregorianMonth -= 12
    gregorianYear += 1
  }

  // Create date object
  const date = new Date(gregorianYear, gregorianMonth - 1, gregorianDay)
  return date.toISOString().split('T')[0]
}

const EthiopianDateInput = ({ value, onChange, placeholder = 'Select Date' }) => {
  const { language } = useLanguage()
  const [displayValue, setDisplayValue] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [inputMode, setInputMode] = useState('gregorian') // 'gregorian' or 'ethiopian'

  const isEthiopian = language === 'am'

  useEffect(() => {
    setInputMode(isEthiopian ? 'ethiopian' : 'gregorian')
    
    if (value) {
      if (isEthiopian) {
        const ethiopian = gregorianToEthiopian(value)
        setDisplayValue(ethiopian.formatted)
      } else {
        const date = new Date(value)
        setDisplayValue(date.toISOString().split('T')[0])
      }
    } else {
      setDisplayValue('')
    }
  }, [value, isEthiopian])

  const handleDateChange = (e) => {
    const newValue = e.target.value
    setDisplayValue(newValue)

    if (isEthiopian) {
      // Parse Ethiopian date format (day/month/year)
      const parts = newValue.split('/')
      if (parts.length === 3) {
        const day = parseInt(parts[0])
        const month = parseInt(parts[1])
        const year = parseInt(parts[2])
        
        if (day && month && year) {
          const gregorianDate = ethiopianToGregorian(year, month, day)
          onChange(gregorianDate)
        }
      }
    } else {
      // Gregorian date (YYYY-MM-DD format from input)
      onChange(newValue)
    }
  }

  const handleInputChange = (e) => {
    setDisplayValue(e.target.value)
  }

  const handleInputBlur = () => {
    if (isEthiopian) {
      const parts = displayValue.split('/')
      if (parts.length === 3) {
        const day = parseInt(parts[0])
        const month = parseInt(parts[1])
        const year = parseInt(parts[2])
        
        if (day && month && year && day > 0 && day <= 30 && month > 0 && month <= 13) {
          const gregorianDate = ethiopianToGregorian(year, month, day)
          onChange(gregorianDate)
        }
      }
    }
  }

  return (
    <div className="ethiopian-date-input-wrapper">
      {isEthiopian ? (
        <input
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="ethiopian-date-input"
          pattern="\d{1,2}/\d{1,2}/\d{4}"
          title="Format: ቀን/ወር/ዓመት (Day/Month/Year)"
        />
      ) : (
        <input
          type="date"
          value={displayValue}
          onChange={handleDateChange}
          className="ethiopian-date-input"
        />
      )}
    </div>
  )
}

export default EthiopianDateInput
