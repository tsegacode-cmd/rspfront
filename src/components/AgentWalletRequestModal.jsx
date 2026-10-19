import { useCallback, useEffect, useState } from 'react'
import { agentAPI, socialAPI } from '../services/api'
import { getServicePaymentProviders } from '../utils/servicePaymentSettings'
import ReceiptPreviewModal from './ReceiptPreviewModal'
import './AgentWalletRequestModal.css'

const money = value => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const readReceiptFile = file => new Promise((resolve, reject) => {
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)
    || file.size > 6 * 1024 * 1024) {
    reject(new Error('Choose a PNG, JPEG, WebP, or PDF receipt no larger than 6 MB.'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(new Error('Could not read the receipt file.'))
  reader.readAsDataURL(file)
})

function AgentWalletRequestModal({ onClose }) {
  const [agents, setAgents] = useState([])
  const [requests, setRequests] = useState([])
  const [walletSettings, setWalletSettings] = useState(null)
  const [paymentAccounts, setPaymentAccounts] = useState([])
  const [providerError, setProviderError] = useState('')
  const [agentId, setAgentId] = useState('')
  const [type, setType] = useState('deposit')
  const [form, setForm] = useState({
    amount: '',
    paymentMethod: '',
    paymentReference: '',
    payoutDetails: '',
    receiptImage: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState('')

  useEffect(() => {
    let active = true
    let refreshingAgents = false
    let loggedRefreshError = false
    const refreshAgents = async () => {
      if (!active || refreshingAgents || document.visibilityState !== 'visible') return
      refreshingAgents = true
      try {
        const response = await agentAPI.getActiveAgents()
        loggedRefreshError = false
        if (active) {
          setAgents(response.data)
          setAgentId(current => response.data.some(item => item.id === current)
            ? current
            : response.data[0]?.id || '')
        }
      } catch (refreshError) {
        if (active && !loggedRefreshError) {
          console.error('Could not refresh agent availability:', refreshError)
          loggedRefreshError = true
        }
      } finally {
        refreshingAgents = false
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshAgents()
    }
    const timer = window.setInterval(refreshWhenVisible, 500)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  const load = useCallback(async () => {
    setError('')
    try {
      const [agentResponse, requestResponse, walletResponse] = await Promise.all([
        agentAPI.getActiveAgents(),
        agentAPI.getMyWalletRequests(),
        socialAPI.getWallet(),
      ])
      setAgents(agentResponse.data)
      setRequests(requestResponse.data)
      setWalletSettings(walletResponse.data.settings)
      setAgentId(current => current || agentResponse.data[0]?.id || '')
      try {
        const providers = await getServicePaymentProviders()
        setPaymentAccounts(providers
          .filter(provider => provider.id !== 'Chapa' && (provider.accounts || [])
            .some(account => account.enabled !== false && account.walletEnabled === true))
          .map(provider => ({ value: provider.name.slice(0, 80), label: provider.name })))
        setProviderError('')
      } catch (providerLoadError) {
        setProviderError(providerLoadError.message || 'Could not load payment provider settings.')
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load active agents and transfer history.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const agent = agents.find(item => item.id === agentId)
  const amount = Number(form.amount)
  const minimumAmount = type === 'deposit' ? walletSettings?.min_deposit ?? 0.01 : walletSettings?.min_withdrawal ?? 0.01
  const maximumAmount = type === 'deposit' ? walletSettings?.max_deposit ?? 100000 : walletSettings?.max_withdrawal ?? 100000
  const fee = Number.isFinite(amount) && amount > 0
    ? Math.round(amount * Number(agent?.service_charge_percent || 0)) / 100
    : 0
  const net = Math.max(0, amount - fee)

  const changeReceipt = async event => {
    const file = event.target.files?.[0]
    setError('')
    setForm(current => ({ ...current, receiptImage: '' }))
    if (!file) return
    try {
      const receiptImage = await readReceiptFile(file)
      setForm(current => ({ ...current, receiptImage }))
      setError('')
    } catch (imageError) {
      setError(imageError.message)
    }
  }

  const changeType = nextType => {
    setType(nextType)
    if (nextType === 'withdrawal') setForm(current => ({ ...current, receiptImage: '' }))
  }

  const viewReceipt = async request => {
    setReceiptPreview({ title: `${request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} receipt` })
    setReceiptLoading(true)
    setReceiptError('')
    try {
      const response = await agentAPI.getWalletRequestReceipt(request.id)
      setReceiptPreview({
        title: `${request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} receipt`,
        image: response.data.receiptImage,
      })
    } catch (receiptLoadError) {
      setReceiptError(receiptLoadError.message || 'Could not load the receipt photo.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const viewUploadedReceipt = () => {
    if (!form.receiptImage) return
    setReceiptPreview({
      title: `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} receipt`,
      image: form.receiptImage,
    })
    setReceiptLoading(false)
    setReceiptError('')
  }

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { receiptImage, ...requestForm } = form
      await agentAPI.createWalletRequest({
        agentId,
        type,
        ...requestForm,
        receiptImage,
      })
      setForm({ amount: '', paymentMethod: '', paymentReference: '', payoutDetails: '', receiptImage: '' })
      setMessage('Your transfer request was sent to the agent for approval.')
      await load()
    } catch (requestError) {
      setError(requestError.message || 'Could not submit this transfer request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="agent-wallet-modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="agent-wallet-modal" role="dialog" aria-modal="true" aria-labelledby="agent-wallet-title">
        <header>
          <div><p>WALLET TRANSFER</p><h2 id="agent-wallet-title">Agent deposit / withdrawal</h2></div>
          <button type="button" className="agent-wallet-close" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="agent-wallet-modal-body">
          {error && <p className="agent-wallet-feedback error" role="alert">{error}</p>}
          {message && <p className="agent-wallet-feedback success" role="status">{message}</p>}
          <form onSubmit={submit}>
            <label>Active agent
              <select required value={agentId} onChange={event => setAgentId(event.target.value)} disabled={!agents.length}>
                {!agents.length && <option value="">No active agents available</option>}
                {agents.map(item => <option key={item.id} value={item.id}>
                  {item.full_name} · @{item.username} · {item.is_online ? 'Online' : 'On road / waiting'}
                </option>)}
              </select>
            </label>
            {agent && (
              <div className="agent-wallet-agent-status" aria-live="polite">
                <span className={`agent-wallet-presence ${agent.is_online ? 'online' : 'offline'}`}>
                  <span aria-hidden="true" />
                  {agent.is_online ? 'Online' : 'On road / waiting'}
                </span>
                <span className={`agent-wallet-account-status ${agent.account_active ? 'active' : 'inactive'}`}>
                  {agent.account_active ? 'Account active' : 'Account inactive'}
                </span>
              </div>
            )}
            {agent?.payment_details && (
              <div className="agent-wallet-destination">
                <strong>Agent payment details</strong>
                <p>{agent.payment_details}</p>
              </div>
            )}
            <fieldset>
              <legend>Transfer type</legend>
              <label><input type="radio" checked={type === 'deposit'} onChange={() => changeType('deposit')} /> Deposit to my wallet</label>
              <label><input type="radio" checked={type === 'withdrawal'} onChange={() => changeType('withdrawal')} /> Withdraw to my bank / wallet</label>
            </fieldset>
            <label>Amount (ETB)
              <input required type="number" min={minimumAmount} step="0.01" max={maximumAmount} value={form.amount}
                onChange={event => setForm({ ...form, amount: event.target.value })} />
            </label>
            <small>Configured limits: {money(minimumAmount)}–{money(maximumAmount)} ETB</small>
            <p className="agent-wallet-fee">Service charge: {money(fee)} ETB · {type === 'deposit' ? 'You receive' : 'Agent package receives'}: {money(net)} ETB</p>
            {type === 'withdrawal' && (
              <label>My payout bank / wallet details
                <textarea required maxLength={500} value={form.payoutDetails}
                  onChange={event => setForm({ ...form, payoutDetails: event.target.value })} />
              </label>
            )}
            <label>Payment channel
              {paymentAccounts.length ? (
                <select required value={form.paymentMethod} onChange={event => setForm({ ...form, paymentMethod: event.target.value })}>
                  <option value="">Choose a Root-enabled provider</option>
                  {paymentAccounts.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input required maxLength={80} placeholder="Bank, mobile money, or agent wallet" value={form.paymentMethod}
                  onChange={event => setForm({ ...form, paymentMethod: event.target.value })} />
              )}
            </label>
            {providerError && <p className="agent-wallet-feedback error" role="alert">{providerError}</p>}
            {!providerError && paymentAccounts.length === 0 && <p className="agent-wallet-feedback">No Root-enabled wallet provider is available. Enter your payment method manually or ask Root to enable one.</p>}
            <label>Transaction ID (required)
              <input required maxLength={250} value={form.paymentReference}
                onChange={event => setForm({ ...form, paymentReference: event.target.value })} />
            </label>
            {type === 'deposit' ? (
              <>
                <label>Payment / transaction receipt (required)
                  <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required onChange={changeReceipt} />
                </label>
                {form.receiptImage && (form.receiptImage.startsWith('data:application/pdf')
                  ? <button type="button" className="agent-wallet-view-receipt" onClick={viewUploadedReceipt}>View attached PDF receipt</button>
                  : <img className="agent-wallet-receipt-preview" src={form.receiptImage} alt="Receipt preview" />)}
              </>
            ) : (
              <>
                <label>Receipt photo or PDF (optional)
                  <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={changeReceipt} />
                </label>
                {form.receiptImage && (form.receiptImage.startsWith('data:application/pdf')
                  ? <button type="button" className="agent-wallet-view-receipt" onClick={viewUploadedReceipt}>View attached PDF receipt</button>
                  : <img className="agent-wallet-receipt-preview" src={form.receiptImage} alt="Receipt preview" />)}
              </>
            )}
            <button type="submit" disabled={busy || !agentId}>{busy ? 'Sending…' : 'Send approval request'}</button>
          </form>
          <section className="agent-wallet-request-history">
            <h3>My agent transfer requests</h3>
            {!requests.length ? <p>No agent transfer history yet.</p> : requests.map(request => (
              <article key={request.id}>
                <span><strong>{request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} · {money(request.amount)} ETB</strong>
                  <small>{request.agent_name} · {new Date(request.created_at).toLocaleString()}</small>
                  <small>Reference: {request.payment_reference} · Net: {money(request.net_amount)} ETB</small>
                </span>
                <span>
                  <b className={`agent-wallet-status ${request.status}`}>{request.status}</b>
                  {request.receipt_available && <button type="button" className="agent-wallet-view-receipt" onClick={() => viewReceipt(request)}>View receipt</button>}
                </span>
              </article>
            ))}
          </section>
        </div>
      </section>
      {receiptPreview && (
        <ReceiptPreviewModal
          title={receiptPreview.title}
          image={receiptPreview.image}
          loading={receiptLoading}
          error={receiptError}
          onClose={() => { setReceiptPreview(null); setReceiptError('') }}
        />
      )}
    </div>
  )
}

export default AgentWalletRequestModal
