import { useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import { downloadPromoCodesPdf } from '../utils/promoCodePdf'
import { filterUnexpiredPromoCodes, getNextPromoCodeExpiryDelay } from '../utils/promoCodes'
import PromoCodeListModal from './PromoCodeListModal'

const EXPIRATION_UNITS = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const allocateRewards = (budget, count, rewardType) => {
  const scale = rewardType === 'coin' ? 1 : 100
  const totalUnits = Math.round(Number(budget) * scale)
  const baseUnits = Math.floor(totalUnits / count)
  const remainder = totalUnits % count
  return Array.from({ length: count }, (_, index) => (
    (baseUnits + (index < remainder ? 1 : 0)) / scale
  ))
}

const createCodeSuffix = () => {
  const values = new Uint32Array(8)
  window.crypto.getRandomValues(values)
  return Array.from(values, value => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('')
}

function PromoCodeManager() {
  const [count, setCount] = useState('10')
  const [prefix, setPrefix] = useState('REDSEA')
  const [totalBudget, setTotalBudget] = useState('100')
  const [rewardType, setRewardType] = useState('coin')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hasExpiry, setHasExpiry] = useState(true)
  const [expiryValue, setExpiryValue] = useState('1')
  const [expiryUnit, setExpiryUnit] = useState('days')
  const [codes, setCodes] = useState([])
  const [allCodes, setAllCodes] = useState([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [published, setPublished] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCodesModal, setShowCodesModal] = useState(false)

  const loadAllCodes = async () => {
    setCodesLoading(true)
    setError('')
    try {
      const response = await rootAPI.getPromoCodes()
      const loadedCodes = response.data?.codes
      if (!Array.isArray(loadedCodes)) throw new Error('The server returned an invalid promo-code list.')
      setAllCodes(filterUnexpiredPromoCodes(loadedCodes))
    } catch (loadError) {
      setError(`Could not load promo codes: ${loadError.message}`)
    } finally {
      setCodesLoading(false)
    }
  }

  useEffect(() => {
    loadAllCodes()
  }, [])

  useEffect(() => {
    const delay = getNextPromoCodeExpiryDelay([...codes, ...allCodes])
    if (delay === null) return undefined
    const timer = window.setTimeout(() => {
      setCodes(current => filterUnexpiredPromoCodes(current))
      setAllCodes(current => filterUnexpiredPromoCodes(current))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [codes, allCodes])

  const clearGenerated = () => {
    setCodes([])
    setPublished(false)
    setError('')
    setNotice('')
  }

  const generateCodes = event => {
    event.preventDefault()
    setError('')
    setNotice('')
    const amountOfCodes = Number(count)
    const normalizedPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'REDSEA'
    const budget = Number(totalBudget)
    if (!Number.isInteger(amountOfCodes) || amountOfCodes < 1 || amountOfCodes > 100) {
      setError('Choose a number of codes from 1 to 100.')
      return
    }
    if (normalizedPrefix.length > 30) {
      setError('The code prefix must be 30 characters or fewer.')
      return
    }
    if (!Number.isFinite(budget) || budget <= 0 || (rewardType === 'coin' && !Number.isSafeInteger(budget))) {
      setError(rewardType === 'coin' ? 'Enter a positive whole-number coin budget.' : 'Enter a positive reward budget.')
      return
    }
    const rewardAmounts = allocateRewards(budget, amountOfCodes, rewardType)
    if (rewardAmounts.some(amount => amount <= 0)) {
      setError(`The total budget must provide at least ${rewardType === 'coin' ? 'one coin' : 'ETB 0.01'} per code.`)
      return
    }
    const durationSeconds = Number(expiryValue) * EXPIRATION_UNITS[expiryUnit]
    if (hasExpiry && (!Number.isSafeInteger(Number(expiryValue)) || Number(expiryValue) < 1 || durationSeconds > 31536000)) {
      setError('Expiration must be at least 1 and no longer than 365 days.')
      return
    }

    const generated = []
    const seen = new Set()
    while (generated.length < amountOfCodes) {
      const code = `${normalizedPrefix}-${createCodeSuffix()}`
      if (code.length > 40) {
        setError('The generated promo code would exceed 40 characters. Use a shorter prefix.')
        return
      }
      if (seen.has(code)) continue
      seen.add(code)
      generated.push({ code, amount: rewardAmounts[generated.length] })
    }
    setPrefix(normalizedPrefix)
    setCodes(generated)
    setPublished(false)
    setNotice(`${generated.length} codes are ready to review and publish.`)
  }

  const publishCodes = async () => {
    if (!codes.length || published) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const durationSeconds = hasExpiry ? Number(expiryValue) * EXPIRATION_UNITS[expiryUnit] : null
      const response = await rootAPI.createPromoCodeBatch({
        codes,
        title: title.trim() || 'Promo reward',
        description: description.trim(),
        rewardType,
        expiresInSeconds: durationSeconds,
        broadcastToAll: true,
        maxClaims: 1,
      })
      const createdCodes = response.data?.codes
      if (!Array.isArray(createdCodes) || createdCodes.length !== codes.length) {
        throw new Error('The server did not confirm every promo code in this batch.')
      }
      setPublished(true)
      setCodes(createdCodes)
      setAllCodes(current => filterUnexpiredPromoCodes([
        ...createdCodes,
        ...current.filter(existing => !createdCodes.some(item => item.id === existing.id)),
      ]))
      setNotice(`${createdCodes.length} promo codes were published and broadcast to all users.`)
    } catch (publishError) {
      setError(`Could not publish promo codes: ${publishError.message}`)
    } finally {
      setBusy(false)
    }
  }

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.map(item => item.code).join('\n'))
      setNotice('All generated codes copied to the clipboard.')
      setError('')
    } catch (copyError) {
      setError(`Could not copy promo codes: ${copyError.message}`)
    }
  }

  const downloadCodes = async (list, filename) => {
    try {
      await downloadPromoCodesPdf(list, filename)
      setNotice('The promo-code PDF was downloaded.')
      setError('')
    } catch (downloadError) {
      setError(`Could not download the promo-code PDF: ${downloadError.message}`)
    }
  }

  const formatReward = (amount, type = rewardType) => type === 'coin' ? `${amount.toLocaleString()} coins` : `ETB ${amount.toFixed(2)}`
  const expirationLabel = hasExpiry
    ? `${expiryValue} ${expiryUnit}${Number(expiryValue) === 1 ? '' : 's'} after publishing`
    : 'No expiry'

  return (
    <section className="root-promo-code-manager">
      {showCodesModal && (
        <PromoCodeListModal
          codes={allCodes}
          title="All generated promo codes"
          loading={codesLoading}
          onClose={() => setShowCodesModal(false)}
        />
      )}
      <h3>Promo code generator</h3>
      <p className="root-promotion-muted">Generate up to 100 unique, single-claim codes, review the reward split, then broadcast the batch to all users.</p>
      {error && <p className="root-promotion-message error" role="alert">{error}</p>}
      {notice && <p className="root-promotion-message success" role="status">{notice}</p>}
      <form className="root-promotion-form" onSubmit={generateCodes}>
        <div className="root-promotion-form-grid">
          <label>Number of codes (1–100)
            <input type="number" min="1" max="100" step="1" value={count} onChange={event => { setCount(event.target.value); clearGenerated() }} />
          </label>
          <label>Code prefix
            <input maxLength={30} value={prefix} onChange={event => { setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')); clearGenerated() }} placeholder="REDSEA" />
          </label>
          <label>Total reward budget
            <input type="number" min="1" step={rewardType === 'coin' ? '1' : '0.01'} value={totalBudget} onChange={event => { setTotalBudget(event.target.value); clearGenerated() }} />
          </label>
          <label>Reward type
            <select value={rewardType} onChange={event => { setRewardType(event.target.value); clearGenerated() }}>
              <option value="coin">Coins</option>
              <option value="bonus">Bonus wallet (ETB)</option>
              <option value="real">Real wallet (ETB)</option>
            </select>
          </label>
          <label>Promotion title (optional)
            <input maxLength={100} value={title} onChange={event => { setTitle(event.target.value); clearGenerated() }} placeholder="Promo reward" />
          </label>
          <label>Reward description (optional)
            <input maxLength={500} value={description} onChange={event => { setDescription(event.target.value); clearGenerated() }} />
          </label>
          <label className="root-promotion-toggle">
            <input type="checkbox" checked={hasExpiry} onChange={event => { setHasExpiry(event.target.checked); clearGenerated() }} />
            Set relative expiration
          </label>
          {hasExpiry && <>
            <label>Expire after
              <input type="number" min="1" step="1" value={expiryValue} onChange={event => { setExpiryValue(event.target.value); clearGenerated() }} />
            </label>
            <label>Duration unit
              <select value={expiryUnit} onChange={event => { setExpiryUnit(event.target.value); clearGenerated() }}>
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </label>
          </>}
        </div>
        <div className="root-promotion-form-actions">
          <button type="submit">Generate codes</button>
        </div>
      </form>
      {codes.length > 0 && (
        <section className="root-promotion-list" aria-label="Promo codes ready to publish">
          <div className="root-promotions-heading">
            <div>
              <h3>{published ? 'Published promo codes' : 'Ready to publish'}</h3>
              <p>{codes.length} codes · Total {formatReward(codes.reduce((sum, item) => sum + item.amount, 0))} · Expires: {expirationLabel}</p>
            </div>
            <div className="root-promotion-form-actions">
              <button type="button" className="secondary" onClick={copyCodes}>Copy all codes</button>
              <button type="button" className="secondary" onClick={() => downloadCodes(codes, 'redsea-promo-code-batch.pdf')}>Download batch PDF</button>
              <button type="button" disabled={busy || published} onClick={publishCodes}>
                {busy ? 'Publishing…' : published ? 'Broadcast complete' : 'Publish and broadcast'}
              </button>
            </div>
          </div>
          <div className="root-promo-code-table-wrap">
            <table className="root-promo-code-table">
              <thead><tr><th>Code</th><th>Reward</th><th>Claims</th></tr></thead>
              <tbody>{codes.map(item => (
                <tr key={item.code}><td><code>{item.code}</code></td><td>{formatReward(item.amount)}</td><td>1 user</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      <section className="root-promotion-list" aria-label="All generated promo codes">
        <div className="root-promotions-heading">
          <div>
            <h3>All generated promo codes</h3>
            <p>{codesLoading ? 'Loading codes…' : `${allCodes.length} code${allCodes.length === 1 ? '' : 's'} in the manager`}</p>
          </div>
          <div className="root-promotion-form-actions">
            <button type="button" className="secondary" disabled={codesLoading} onClick={() => setShowCodesModal(true)}>See promo codes</button>
            <button type="button" className="secondary" disabled={!allCodes.length || codesLoading} onClick={() => downloadCodes(allCodes, 'redsea-all-promo-codes.pdf')}>
              Download all codes PDF
            </button>
          </div>
        </div>
        {!codesLoading && allCodes.length > 0 && (
          <div className="root-promo-code-table-wrap">
            <table className="root-promo-code-table">
              <thead><tr><th>Code</th><th>Reward</th><th>Status</th><th>Expires</th></tr></thead>
              <tbody>{allCodes.map(item => (
                <tr key={item.id}>
                  <td><code>{item.code}</code></td>
                  <td>{formatReward(Number(item.amount || 0), item.rewardType)}</td>
                  <td>{item.status || (item.claimedByMe ? 'Claimed' : 'Active')}</td>
                  <td>{item.expiresAt ? new Date(item.expiresAt).toLocaleString() : 'No expiry'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

export default PromoCodeManager
