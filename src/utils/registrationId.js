const normalizeReceiptNumber = value => {
  const receiptNumber = String(value ?? '').trim()
  if (!receiptNumber) return ''
  if (/^\d+$/.test(receiptNumber)) {
    return `number:${receiptNumber.replace(/^0+(?=\d)/, '')}`
  }
  return `text:${receiptNumber.toLocaleLowerCase()}`
}

const compareNumericStrings = (left, right) =>
  left.length === right.length ? left.localeCompare(right) : left.length - right.length

const incrementNumericString = value => {
  const digits = value.split('')
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== '9') {
      digits[index] = String(Number(digits[index]) + 1)
      return digits.join('')
    }
    digits[index] = '0'
  }
  return `1${digits.join('')}`
}

export const generateNextReceiptNumber = (records = [], selectedRound = 1) => {
  const roundRecords = (Array.isArray(records) ? records : []).filter(
    record => Number(record.round || 1) === Number(selectedRound)
  )
  const numericNumbers = roundRecords
    .map(record => String(record.receipt_no || '').trim())
    .filter(value => /^\d+$/.test(value))
  const usedNumbers = new Set(
    roundRecords.map(record => normalizeReceiptNumber(record.receipt_no)).filter(Boolean)
  )

  const nextNumber = numericNumbers.length
    ? incrementNumericString(numericNumbers.reduce(
      (highest, value) => {
        const canonicalValue = value.replace(/^0+(?=\d)/, '')
        return compareNumericStrings(canonicalValue, highest) > 0 ? canonicalValue : highest
      },
      '0'
    ))
    : '111'
  const zeroPrefixLength = numericNumbers.length
    ? Math.max(...numericNumbers.map(value => value.match(/^0*/)[0].length))
    : 3

  let candidateNumber = nextNumber
  let candidate = `${'0'.repeat(zeroPrefixLength)}${candidateNumber}`
  while (usedNumbers.has(normalizeReceiptNumber(candidate))) {
    candidateNumber = incrementNumericString(candidateNumber)
    candidate = `${'0'.repeat(zeroPrefixLength)}${candidateNumber}`
  }
  return candidate
}

export const normalizeRegistrationId = normalizeReceiptNumber
