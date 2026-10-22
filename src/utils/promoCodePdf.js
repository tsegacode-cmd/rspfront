const rewardLabel = item => {
  const amount = Number(item.amount || 0)
  if (item.rewardType === 'coin') return `${amount.toLocaleString()} coins`
  const wallet = item.rewardType === 'real' ? 'real wallet' : 'bonus wallet'
  return `ETB ${amount.toFixed(2)} (${wallet})`
}

export const downloadPromoCodesPdf = async (codes, filename = 'redsea-promo-codes.pdf') => {
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new Error('There are no promo codes to include in the PDF.')
  }
  const { jsPDF } = await import('jspdf')
  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageHeight = document.internal.pageSize.getHeight()
  const margin = 16
  const lineHeight = 7
  let y = 22

  document.setFontSize(16)
  document.text('REDSEA promo codes', margin, y)
  y += 10
  document.setFontSize(9)
  document.text(`Generated: ${new Date().toLocaleString()} · ${codes.length} code${codes.length === 1 ? '' : 's'}`, margin, y)
  y += 10
  document.setFontSize(10)

  codes.forEach((item, index) => {
    const expiry = item.expiresAt ? new Date(item.expiresAt).toLocaleString() : 'No expiry'
    const lines = [
      `${index + 1}. ${String(item.code || '')}`,
      `Reward: ${rewardLabel(item)} · ${item.claimedByMe ? 'Claimed by you' : item.status || 'Available'}`,
      `Expires: ${expiry}`,
    ]
    const blockHeight = lines.length * lineHeight + 3
    if (y + blockHeight > pageHeight - margin) {
      document.addPage()
      y = margin
    }
    document.setFont('helvetica', 'bold')
    document.text(lines[0], margin, y)
    document.setFont('helvetica', 'normal')
    document.text(lines[1], margin + 3, y + lineHeight)
    document.text(lines[2], margin + 3, y + lineHeight * 2)
    y += blockHeight
  })

  document.save(filename)
}
