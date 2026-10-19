import { useCallback, useEffect, useMemo, useState } from 'react'
import { agentAPI, socialAPI } from '../services/api'
import { getServicePaymentProviders } from '../utils/servicePaymentSettings'
import { playRewardCelebrationSound } from '../utils/rewardCelebrationSound'
import ReceiptPreviewModal from '../components/ReceiptPreviewModal'
import './Wallet.css'

const emptyWallet = {
  realBalance: 0,
  bonusBalance: 0,
  coinBalance: 0,
  availableBalance: 0,
  availableBonusBalance: 0,
  currency: 'ETB',
  settings: {},
  deposits: [],
  withdrawals: [],
  coinSavings: [],
  referralCode: '',
}

const COIN_SAVINGS_TERMS = [
  { days: 1, label: 'Daily (1 day)' },
  { days: 7, label: 'Weekly (7 days)' },
  { days: 30, label: 'Monthly (30 days)' },
  { days: 90, label: 'Quarterly (90 days)' },
  { days: 180, label: '6 months (180 days)' },
  { days: 365, label: 'Yearly (365 days)' },
]

const money = (value, currency = 'ETB') => `${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})} ${currency}`

const formatDate = value => {
  const normalized = typeof value === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

const paymentAccountName = account => account.bankName
  ? `${account.bankName} · ${account.accountName}`
  : `${account.accountName}${account.phone ? ` · ${account.phone}` : ''}`

const readWithdrawalReceipt = file => new Promise((resolve, reject) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  if (!allowedTypes.includes(file.type) || file.size > 6 * 1024 * 1024) {
    reject(new Error('Choose a PNG, JPEG, WebP, or PDF receipt no larger than 6 MB.'))
    return
  }
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Could not read the receipt file.'))
  reader.onload = () => resolve(String(reader.result || ''))
  reader.readAsDataURL(file)
})

function Wallet({ compact = false, title, showAgentRequests = true }) {
  const authToken = localStorage.getItem('authToken') || ''
  const [wallet, setWallet] = useState(emptyWallet)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState([])
  const [providerError, setProviderError] = useState('')
  const [depositProvider, setDepositProvider] = useState('')
  const [withdrawalProvider, setWithdrawalProvider] = useState('')
  const [deposit, setDeposit] = useState({ amount: '', paymentReference: '' })
  const [withdrawal, setWithdrawal] = useState({
    amount: '', payoutDetails: '', balanceType: 'real', transactionReference: '', receiptFile: '',
  })
  const [coinsToEtb, setCoinsToEtb] = useState('')
  const [etbToCoins, setEtbToCoins] = useState('')
  const [coinSavingsAmount, setCoinSavingsAmount] = useState('')
  const [coinSavingsTerm, setCoinSavingsTerm] = useState('1')
  const [bonusToReal, setBonusToReal] = useState('')
  const [activity, setActivity] = useState({ entries: [], total: 0, page: 1, pageSize: 25, summary: {} })
  const [activityAsset, setActivityAsset] = useState('all')
  const [activitySearch, setActivitySearch] = useState('')
  const [activitySearchDraft, setActivitySearchDraft] = useState('')
  const [activityPage, setActivityPage] = useState(1)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [agentRequests, setAgentRequests] = useState([])
  const [agentRequestsLoading, setAgentRequestsLoading] = useState(false)
  const [agentRequestsError, setAgentRequestsError] = useState('')
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState('')

  const loadWallet = useCallback(async () => {
    setError('')
    try {
      const response = await socialAPI.getWallet()
      setWallet(response.data)
    } catch (loadError) {
      setError(loadError.message || 'Could not load your wallet details.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProviders = useCallback(async () => {
    setProviderError('')
    try {
      setProviders(await getServicePaymentProviders())
    } catch (loadError) {
      setProviderError(loadError.message || 'Could not load payment provider settings.')
    }
  }, [])

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    setActivityError('')
    try {
      const response = await socialAPI.getWalletActivity({
        asset: activityAsset,
        search: activitySearch,
        page: activityPage,
      })
      setActivity(response.data)
    } catch (loadError) {
      setActivityError(loadError.message || 'Could not load wallet history.')
    } finally {
      setActivityLoading(false)
    }
  }, [activityAsset, activityPage, activitySearch])

  const loadAgentRequests = useCallback(async () => {
    if (!showAgentRequests || !authToken || authToken.startsWith('guest-')) {
      setAgentRequests([])
      return
    }
    setAgentRequestsLoading(true)
    setAgentRequestsError('')
    try {
      const response = await agentAPI.getMyWalletRequests()
      setAgentRequests(response.data)
    } catch (loadError) {
      setAgentRequestsError(loadError.message || 'Could not load agent deposit and withdrawal requests.')
    } finally {
      setAgentRequestsLoading(false)
    }
  }, [authToken, showAgentRequests])

  useEffect(() => {
    loadWallet()
    loadProviders()
  }, [loadProviders, loadWallet])

  useEffect(() => { loadActivity() }, [loadActivity])
  useEffect(() => { loadAgentRequests() }, [loadAgentRequests])

  const availablePaymentAccounts = useMemo(() => providers
    .filter(provider => provider.id !== 'Chapa')
    .flatMap(provider => (provider.accounts || [])
      .filter(account => account.enabled !== false && account.walletEnabled === true)
      .map(account => ({
        key: `${provider.id}:${account.id}`,
        provider,
        account,
        label: `${provider.name} · ${paymentAccountName(account)}`,
      }))), [providers])

  useEffect(() => {
    const firstAvailable = availablePaymentAccounts[0]?.key || ''
    if (!availablePaymentAccounts.some(option => option.key === depositProvider)) setDepositProvider(firstAvailable)
    if (!availablePaymentAccounts.some(option => option.key === withdrawalProvider)) setWithdrawalProvider(firstAvailable)
  }, [availablePaymentAccounts, depositProvider, withdrawalProvider])

  const selectedDepositAccount = availablePaymentAccounts.find(option => option.key === depositProvider)
  const selectedWithdrawalAccount = availablePaymentAccounts.find(option => option.key === withdrawalProvider)
  const coinPerEtb = Number(wallet.settings?.coin_per_etb || 0)
  const bonusToRealRate = Number(wallet.settings?.bonus_to_real_rate || 0)
  const pendingEntries = [
    ...(wallet.deposits || []).map(entry => ({ ...entry, kind: 'Deposit', id: entry.deposit_id })),
    ...(wallet.withdrawals || []).map(entry => ({ ...entry, kind: 'Withdrawal', id: entry.withdrawal_id })),
    ...agentRequests.map(entry => ({
      ...entry,
      kind: `Agent ${entry.type === 'deposit' ? 'deposit' : 'withdrawal'}`,
      agentRequest: true,
    })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const refreshWallet = async () => {
    await Promise.all([loadWallet(), loadActivity(), loadAgentRequests()])
  }

  const viewReceipt = async entry => {
    setReceiptPreview({ title: `${entry.kind} receipt` })
    setReceiptLoading(true)
    setReceiptError('')
    try {
      const response = await agentAPI.getWalletRequestReceipt(entry.id)
      setReceiptPreview({ title: `${entry.kind} receipt`, image: response.data.receiptImage })
    } catch (receiptLoadError) {
      setReceiptError(receiptLoadError.message || 'Could not load the receipt photo.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const submitAction = async (event, action, successMessage, reset) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      playRewardCelebrationSound()
      setNotice(successMessage)
      reset?.()
      await refreshWallet()
    } catch (actionError) {
      setError(actionError.message || 'Could not complete this wallet transaction.')
    } finally {
      setBusy(false)
    }
  }

  const submitDeposit = event => submitAction(
    event,
    () => {
      if (!selectedDepositAccount) throw new Error('No payment provider is enabled for wallet deposits. Contact an administrator.')
      return socialAPI.deposit(
        Number(deposit.amount),
        `${selectedDepositAccount.provider.name} · ${paymentAccountName(selectedDepositAccount.account)}`.slice(0, 80),
        deposit.paymentReference.trim(),
      )
    },
    'Deposit request submitted. It will be added to your real balance after verification.',
    () => setDeposit({ amount: '', paymentReference: '' }),
  )

  const submitWithdrawal = event => submitAction(
    event,
    () => {
      if (!selectedWithdrawalAccount) throw new Error('No payout provider is enabled for wallet withdrawals. Contact an administrator.')
      const payoutDetails = `${selectedWithdrawalAccount.provider.name} · ${paymentAccountName(selectedWithdrawalAccount.account)}; payout details: ${withdrawal.payoutDetails.trim()}`
      return socialAPI.withdraw(
        Number(withdrawal.amount),
        payoutDetails,
        withdrawal.balanceType,
        withdrawal.transactionReference.trim(),
        withdrawal.receiptFile,
      )
    },
    `${withdrawal.balanceType === 'bonus' ? 'Bonus' : 'Real'} balance withdrawal request submitted.`,
    () => setWithdrawal(current => ({ ...current, amount: '', payoutDetails: '', transactionReference: '', receiptFile: '' })),
  )

  const changeWithdrawalReceipt = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const receiptFile = await readWithdrawalReceipt(file)
      setWithdrawal(current => ({ ...current, receiptFile }))
      setError('')
    } catch (fileError) {
      setWithdrawal(current => ({ ...current, receiptFile: '' }))
      setError(fileError.message)
    }
    event.target.value = ''
  }

  const submitCoinToEtb = event => submitAction(
    event,
    () => socialAPI.convertCoinsToEtb(Number(coinsToEtb)),
    'Coins converted to your real wallet balance.',
    () => setCoinsToEtb(''),
  )

  const submitEtbToCoin = event => submitAction(
    event,
    () => socialAPI.buyCoins(Number(etbToCoins)),
    'Real wallet balance converted to coins.',
    () => setEtbToCoins(''),
  )

  const submitCoinSavings = event => submitAction(
    event,
    () => socialAPI.createCoinSavings(Number(coinSavingsAmount), Number(coinSavingsTerm)),
    'Coin savings deposit opened. Your coins are locked until the maturity date.',
    () => setCoinSavingsAmount(''),
  )

  const submitBonusToReal = event => submitAction(
    event,
    () => socialAPI.convertBonusToReal(Number(bonusToReal)),
    'Bonus balance converted to real balance at the configured rate.',
    () => setBonusToReal(''),
  )

  const applyActivitySearch = event => {
    event.preventDefault()
    setActivityPage(1)
    setActivitySearch(activitySearchDraft.trim())
  }

  const maxActivityPage = Math.max(1, Math.ceil(activity.total / activity.pageSize))
  const minDeposit = Number(wallet.settings?.min_deposit ?? 0.01)
  const maxDeposit = Number(wallet.settings?.max_deposit ?? 100000)
  const minEtbForCoinPurchase = Math.ceil(
    Number(wallet.settings?.min_coin_conversion || 1) / (coinPerEtb || 1) * 100
  ) / 100
  const maxEtbForCoinPurchase = Math.floor(
    Math.min(Number(wallet.settings?.max_coin_conversion || 1000000), Number(wallet.availableBalance || 0) * (coinPerEtb || 1)) /
    (coinPerEtb || 1) * 100
  ) / 100
  const withdrawalMinimum = withdrawal.balanceType === 'bonus'
    ? Number(wallet.settings?.min_bonus_withdrawal ?? 0.01)
    : Number(wallet.settings?.min_withdrawal ?? 0.01)
  const withdrawalMaximum = withdrawal.balanceType === 'bonus'
    ? Number(wallet.settings?.max_bonus_withdrawal ?? 100000)
    : Number(wallet.settings?.max_withdrawal ?? 100000)
  const availableWithdrawalBalance = withdrawal.balanceType === 'bonus'
    ? Number(wallet.availableBonusBalance || 0)
    : Number(wallet.availableBalance || 0)
  const savingsDailyRate = Number(wallet.settings?.coin_savings_daily_rate || 0)
  const minCoinSavingsDeposit = Number(wallet.settings?.min_coin_savings_deposit || 1)
  const maxCoinSavingsDeposit = Number(wallet.settings?.max_coin_savings_deposit || 1000000)
  const savingsDurationDays = Number(coinSavingsTerm)
  const expectedSavingsInterest = Math.floor(
    Number(coinSavingsAmount || 0) * savingsDailyRate / 100 * savingsDurationDays + Number.EPSILON
  )
  const WalletContainer = compact ? 'div' : 'main'

  return (
    <WalletContainer className={`wallet-page${compact ? ' wallet-page-compact' : ''}`}>
      <header className="wallet-heading">
        <div>
          {!compact && <p className="wallet-kicker">ACCOUNT</p>}
          <h1>{title || (compact ? 'Agent wallet' : 'Wallet')}</h1>
          <p>Manage your real and bonus balances, payment requests, and virtual coins.</p>
        </div>
        <button type="button" className="wallet-secondary-button" onClick={refreshWallet} disabled={loading || busy}>
          Refresh
        </button>
      </header>

      {error && <p className="wallet-feedback error" role="alert">{error}</p>}
      {notice && <p className="wallet-feedback success" role="status">{notice}</p>}
      {loading ? <p className="wallet-empty">Loading wallet…</p> : (
        <>
          <section className="wallet-user-balance-grid" aria-label="Wallet balances">
            <article><span>Available real balance</span><strong>{money(wallet.availableBalance, wallet.currency)}</strong></article>
            <article><span>Real balance</span><strong>{money(wallet.realBalance, wallet.currency)}</strong></article>
            <article><span>Bonus / reward balance</span><strong>{money(wallet.bonusBalance, wallet.currency)}</strong></article>
            <article><span>Available bonus balance</span><strong>{money(wallet.availableBonusBalance, wallet.currency)}</strong></article>
            <article><span>Virtual coins</span><strong>{Number(wallet.coinBalance || 0).toLocaleString()} coins</strong></article>
          </section>

          <section className="wallet-panel">
            <div className="wallet-section-heading">
              <div><h2>Payment providers</h2><p>Configured by Root. Deposit instructions show where to send funds; withdrawals are manually paid to the payout details you provide.</p></div>
            </div>
            {providerError && <p className="wallet-feedback error" role="alert">{providerError}</p>}
            {availablePaymentAccounts.length ? (
              <div className="wallet-provider-grid">
                {availablePaymentAccounts.map(option => (
                  <article className="wallet-provider-card" key={option.key}>
                    {option.provider.logo && <img src={option.provider.logo} alt="" />}
                    <div><strong>{option.label}</strong>
                      <span>Account holder: {option.account.accountName || 'Not specified'}</span>
                      {option.account.phone && <span>Wallet phone: {option.account.phone}</span>}
                      {option.account.bankName && <span>Bank: {option.account.bankName}</span>}
                      {option.account.accountNumber && <span>Account number: {option.account.accountNumber}</span>}
                    </div>
                  </article>
                ))}
              </div>
            ) : !providerError ? (
              <p className="wallet-empty">No provider accounts are enabled for wallet deposits. Ask Root to enable one under Payment providers.</p>
            ) : null}
          </section>

          <section className="wallet-form-grid">
            <form className="wallet-panel wallet-form" onSubmit={submitDeposit}>
              <h2>Deposit to real balance</h2>
              <p>Pay using one of the enabled provider accounts, then submit the transfer reference for Root approval.</p>
              <label>Payment provider
                <select required value={depositProvider} onChange={event => setDepositProvider(event.target.value)} disabled={!availablePaymentAccounts.length}>
                  {availablePaymentAccounts.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}
                  {!availablePaymentAccounts.length && <option value="">No wallet provider enabled</option>}
                </select>
              </label>
              {selectedDepositAccount && (
                <div className="wallet-provider-instructions">
                  <strong>Pay to {selectedDepositAccount.account.accountName}</strong>
                  {selectedDepositAccount.account.phone && <span>Wallet phone: {selectedDepositAccount.account.phone}</span>}
                  {selectedDepositAccount.account.bankName && <span>Bank: {selectedDepositAccount.account.bankName}</span>}
                  {selectedDepositAccount.account.accountNumber && <span>Account number: {selectedDepositAccount.account.accountNumber}</span>}
                </div>
              )}
              <label>Amount ({wallet.currency})
                <input type="number" min={minDeposit} max={maxDeposit} step="0.01" required value={deposit.amount}
                  onChange={event => setDeposit(current => ({ ...current, amount: event.target.value }))} />
              </label>
              <small>Deposit limits: {money(minDeposit, wallet.currency)}–{money(maxDeposit, wallet.currency)}. Approved deposits are credited to real balance only.</small>
              <label>Transfer reference
                <input required maxLength="250" value={deposit.paymentReference}
                  onChange={event => setDeposit(current => ({ ...current, paymentReference: event.target.value }))} />
              </label>
              <button className="wallet-primary-button" type="submit" disabled={busy || !selectedDepositAccount}>
                {busy ? 'Submitting…' : 'Request deposit'}
              </button>
            </form>

            <form className="wallet-panel wallet-form" onSubmit={submitWithdrawal}>
              <h2>Withdraw balance</h2>
              <p>Choose which balance to withdraw. Pending withdrawals are reserved so they cannot be spent twice.</p>
              <label>Balance to withdraw
                <select value={withdrawal.balanceType} onChange={event => setWithdrawal(current => ({ ...current, balanceType: event.target.value, amount: '' }))}>
                  <option value="real">Real balance · {money(wallet.availableBalance, wallet.currency)} available</option>
                  <option value="bonus">Bonus balance · {money(wallet.availableBonusBalance, wallet.currency)} available</option>
                </select>
              </label>
              <label>Payout provider
                <select required value={withdrawalProvider} onChange={event => setWithdrawalProvider(event.target.value)} disabled={!availablePaymentAccounts.length}>
                  {availablePaymentAccounts.map(option => <option value={option.key} key={option.key}>{option.label}</option>)}
                  {!availablePaymentAccounts.length && <option value="">No wallet provider enabled</option>}
                </select>
              </label>
              <label>Amount ({wallet.currency})
                <input type="number" min={withdrawalMinimum} max={Math.min(withdrawalMaximum, availableWithdrawalBalance)}
                  step="0.01" required value={withdrawal.amount}
                  onChange={event => setWithdrawal(current => ({ ...current, amount: event.target.value }))} />
              </label>
              <small>Withdrawal limits: {money(withdrawalMinimum, wallet.currency)}–{money(withdrawalMaximum, wallet.currency)}.</small>
              {availableWithdrawalBalance < withdrawalMinimum && <small>Available balance is below the minimum withdrawal amount.</small>}
              {Number(withdrawal.amount) > availableWithdrawalBalance && <p className="wallet-validation-error" role="alert">Not enough available {withdrawal.balanceType} balance for this withdrawal.</p>}
              <label>Your payout account details
                <textarea required maxLength="500" rows="3" value={withdrawal.payoutDetails}
                  onChange={event => setWithdrawal(current => ({ ...current, payoutDetails: event.target.value }))} />
              </label>
              <label>Transaction ID
                <input required maxLength="250" value={withdrawal.transactionReference}
                  onChange={event => setWithdrawal(current => ({ ...current, transactionReference: event.target.value }))} />
              </label>
              <label>Receipt photo or PDF (optional)
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={changeWithdrawalReceipt} />
              </label>
              {withdrawal.receiptFile && <small>Receipt attached and will be sent with your withdrawal request.</small>}
              <button className="wallet-primary-button" type="submit" disabled={busy || !selectedWithdrawalAccount || availableWithdrawalBalance < withdrawalMinimum || Number(withdrawal.amount) > availableWithdrawalBalance}>
                {busy ? 'Submitting…' : 'Request withdrawal'}
              </button>
            </form>
          </section>

          <section className="wallet-conversion-grid">
            <form className="wallet-panel wallet-form" onSubmit={submitCoinToEtb}>
              <h2>Coins to {wallet.currency}</h2>
              <p>Rate: {Number(coinPerEtb || 0).toLocaleString()} coins = 1 {wallet.currency}. Converted funds go to your real balance.</p>
              <label>Coins to convert
                <input type="number" min={wallet.settings?.min_coin_conversion || 1} max={Math.min(Number(wallet.settings?.max_coin_conversion || 1000000), Number(wallet.coinBalance || 0))}
                  step="1" required value={coinsToEtb} onChange={event => setCoinsToEtb(event.target.value)} />
              </label>
              <small>Available: {Number(wallet.coinBalance || 0).toLocaleString()} coins.</small>
              {Number(coinsToEtb) > Number(wallet.coinBalance || 0) && <p className="wallet-validation-error" role="alert">Not enough coins for this conversion.</p>}
              {coinsToEtb && <p className="wallet-conversion-preview">You receive: {money(Number(coinsToEtb) / (coinPerEtb || 1), wallet.currency)}</p>}
              <button className="wallet-primary-button" type="submit" disabled={busy || !coinsToEtb || Number(coinsToEtb) > Number(wallet.coinBalance || 0)}>
                {busy ? 'Converting…' : 'Convert coins to balance'}
              </button>
            </form>

            <form className="wallet-panel wallet-form" onSubmit={submitEtbToCoin}>
              <h2>{wallet.currency} to coins</h2>
              <p>Buy virtual coins from your available real balance at the configured role rate.</p>
              <label>Amount ({wallet.currency})
                <input type="number" min={minEtbForCoinPurchase} step="0.01" max={maxEtbForCoinPurchase} required value={etbToCoins}
                  onChange={event => setEtbToCoins(event.target.value)} />
              </label>
              <small>Available real balance: {money(wallet.availableBalance, wallet.currency)}.</small>
              {Number(etbToCoins) > maxEtbForCoinPurchase && <p className="wallet-validation-error" role="alert">Not enough available real balance or the requested amount exceeds the configured coin conversion limit.</p>}
              {etbToCoins && <p className="wallet-conversion-preview">You receive: {Math.round(Number(etbToCoins) * coinPerEtb).toLocaleString()} coins</p>}
              <button className="wallet-primary-button" type="submit" disabled={busy || !etbToCoins || Number(etbToCoins) > maxEtbForCoinPurchase}>
                {busy ? 'Converting…' : 'Convert balance to coins'}
              </button>
            </form>

            <form className="wallet-panel wallet-form" onSubmit={submitBonusToReal}>
              <h2>Bonus to real balance</h2>
              {bonusToRealRate > 0 ? (
                <>
                  <p>Conversion rate: 1 bonus {wallet.currency} = {bonusToRealRate} real {wallet.currency}. Available bonus: {money(wallet.availableBonusBalance, wallet.currency)}.</p>
                  <label>Bonus amount to convert ({wallet.currency})
                    <input type="number" min="0.01" max={wallet.availableBonusBalance} step="0.01" required value={bonusToReal}
                      onChange={event => setBonusToReal(event.target.value)} />
                  </label>
                  {Number(bonusToReal) > Number(wallet.availableBonusBalance || 0) && <p className="wallet-validation-error" role="alert">Not enough available bonus balance for this conversion.</p>}
                  {bonusToReal && <p className="wallet-conversion-preview">You receive: {money(Number(bonusToReal) * bonusToRealRate, wallet.currency)}</p>}
                  <button className="wallet-primary-button" type="submit" disabled={busy || !bonusToReal || Number(bonusToReal) > Number(wallet.availableBonusBalance || 0)}>
                    {busy ? 'Converting…' : 'Convert bonus to real'}
                  </button>
                </>
              ) : <p className="wallet-empty">Bonus conversion is disabled for your account role. Root can configure its rate in Wallet Management.</p>}
            </form>
          </section>

          <section className="wallet-panel wallet-coin-savings">
            <div className="wallet-section-heading">
              <div><h2>Coin savings</h2><p>Lock platform coins for a fixed term and earn simple daily interest. At or after maturity, your principal and interest are credited when your wallet is opened or refreshed.</p></div>
            </div>
            {savingsDailyRate > 0 ? (
              <form className="wallet-form wallet-coin-savings-form" onSubmit={submitCoinSavings}>
                <p>Daily interest rate: {savingsDailyRate}% · Deposit limits: {minCoinSavingsDeposit.toLocaleString()}–{maxCoinSavingsDeposit.toLocaleString()} coins. Deposits cannot be withdrawn early.</p>
                <label>Term
                  <select value={coinSavingsTerm} onChange={event => setCoinSavingsTerm(event.target.value)}>
                    {COIN_SAVINGS_TERMS.map(term => <option key={term.days} value={term.days}>{term.label}</option>)}
                  </select>
                </label>
                <label>Coins to deposit
                  <input type="number" min={minCoinSavingsDeposit} max={Math.min(maxCoinSavingsDeposit, Number(wallet.coinBalance || 0))}
                    step="1" required value={coinSavingsAmount} onChange={event => setCoinSavingsAmount(event.target.value)} />
                </label>
                <small>Available coins: {Number(wallet.coinBalance || 0).toLocaleString()}.</small>
                {coinSavingsAmount && <p className="wallet-conversion-preview">Estimated interest: {expectedSavingsInterest.toLocaleString()} coins · Total at maturity: {(Number(coinSavingsAmount || 0) + expectedSavingsInterest).toLocaleString()} coins</p>}
                {Number(coinSavingsAmount) > Number(wallet.coinBalance || 0) && <p className="wallet-validation-error" role="alert">Not enough available coins for this savings deposit.</p>}
                <button className="wallet-primary-button" type="submit" disabled={busy || !coinSavingsAmount ||
                  Number(coinSavingsAmount) < minCoinSavingsDeposit || Number(coinSavingsAmount) > maxCoinSavingsDeposit ||
                  Number(coinSavingsAmount) > Number(wallet.coinBalance || 0)}>
                  {busy ? 'Submitting…' : 'Deposit coins'}
                </button>
              </form>
            ) : <p className="wallet-empty">Coin savings is not enabled for your account role. Check back after Root configures the daily rate.</p>}
            {wallet.coinSavings?.length ? (
              <div className="wallet-activity-list">
                {wallet.coinSavings.map(saving => (
                  <article key={saving.deposit_id}>
                    <div>
                      <strong>{Number(saving.principal).toLocaleString()} coins · {COIN_SAVINGS_TERMS.find(term => term.days === Number(saving.duration_days))?.label || `${saving.duration_days} days`}</strong>
                      <span>{saving.daily_rate_percent}% daily · Estimated interest {Number(saving.expected_interest).toLocaleString()} coins · Matures {formatDate(saving.maturity_at)}</span>
                      {saving.settled_at && <span>Settled {formatDate(saving.settled_at)}</span>}
                    </div>
                    <b className={`wallet-request-status ${saving.status}`}>{saving.status}</b>
                  </article>
                ))}
              </div>
            ) : <p className="wallet-empty">You have no coin savings deposits yet.</p>}
          </section>

          <section className="wallet-panel">
            <div className="wallet-section-heading">
              <div><h2>Wallet activity</h2><p>Search and filter all real, bonus, and coin ledger transactions.</p></div>
              <span>{activity.total.toLocaleString()} records</span>
            </div>
            <div className="wallet-user-activity-summary">
              <article><span>Real credited</span><strong>{money(activity.summary.real_credited, wallet.currency)}</strong></article>
              <article><span>Bonus rewards credited</span><strong>{money(activity.summary.bonus_earned, wallet.currency)}</strong></article>
              <article><span>ETB debited</span><strong>{money(activity.summary.etb_debited, wallet.currency)}</strong></article>
              <article><span>Coins earned / spent</span><strong>{Number(activity.summary.coins_earned || 0).toLocaleString()} / {Number(activity.summary.coins_spent || 0).toLocaleString()}</strong></article>
            </div>
            <form className="wallet-user-activity-filters" onSubmit={applyActivitySearch}>
              <label>Activity type
                <select value={activityAsset} onChange={event => { setActivityPage(1); setActivityAsset(event.target.value) }}>
                  <option value="all">All real, bonus &amp; coins</option>
                  <option value="real">Real balance</option>
                  <option value="bonus">Bonus balance &amp; rewards</option>
                  <option value="coin">Virtual coins</option>
                </select>
              </label>
              <label>Search history
                <input value={activitySearchDraft} maxLength="120" placeholder="Search descriptions or activity type"
                  onChange={event => setActivitySearchDraft(event.target.value)} />
              </label>
              <button className="wallet-secondary-button" type="submit">Search</button>
            </form>
            {activityError && <p className="wallet-feedback error" role="alert">{activityError}</p>}
            {activityLoading ? <p className="wallet-empty">Loading activity…</p> : activity.entries.length ? (
              <>
                <div className="wallet-activity-list">
                  {activity.entries.map(entry => (
                    <article key={`${entry.asset}-${entry.id}`}>
                      <div>
                        <strong>{entry.description || entry.entry_type.replaceAll('_', ' ')}</strong>
                        <span>{formatDate(entry.created_at)} · {entry.asset === 'coin' ? 'Virtual coins' : `${entry.bucket} balance`} · {entry.entry_type.replaceAll('_', ' ')}</span>
                      </div>
                      <b className={Number(entry.amount) >= 0 ? 'credit' : 'debit'}>
                        {Number(entry.amount) > 0 ? '+' : ''}{entry.asset === 'coin' ? Number(entry.amount).toLocaleString() : money(entry.amount, entry.currency || wallet.currency)}
                      </b>
                    </article>
                  ))}
                </div>
                <div className="wallet-pagination">
                  <button type="button" className="wallet-secondary-button" onClick={() => setActivityPage(page => Math.max(1, page - 1))} disabled={activityPage <= 1}>Previous</button>
                  <span>Page {activityPage} of {maxActivityPage}</span>
                  <button type="button" className="wallet-secondary-button" onClick={() => setActivityPage(page => Math.min(maxActivityPage, page + 1))} disabled={activityPage >= maxActivityPage}>Next</button>
                </div>
              </>
            ) : <p className="wallet-empty">No transactions match your search.</p>}
          </section>

          <section className="wallet-panel">
            <div className="wallet-section-heading">
              <div><h2>Deposit &amp; withdrawal requests</h2><p>Request status updates after Root reviews your payment or payout.</p></div>
            </div>
            {pendingEntries.length ? (
              <div className="wallet-activity-list">
                {pendingEntries.map(entry => (
                  <article key={entry.id}>
                    <div>
                      <strong>{entry.kind} · {money(entry.amount, wallet.currency)}{entry.kind === 'Withdrawal' ? ` · ${entry.balance_type || 'real'} balance` : ''}</strong>
                      <span>{formatDate(entry.created_at)} · {entry.agentRequest
                        ? `${entry.agent_name || 'Agent'} · ${entry.payment_method || 'Payment method unavailable'} · Reference: ${entry.payment_reference || 'Not provided'}`
                        : entry.kind === 'Deposit'
                          ? `${entry.payment_method} · Reference: ${entry.payment_reference}`
                          : `${entry.payout_details} · Transaction ID: ${entry.transaction_reference || 'Not provided'}`}</span>
                      {entry.agentRequest && entry.reviewed_at && <span>Reviewed: {formatDate(entry.reviewed_at)}</span>}
                    </div>
                    <div className="wallet-request-actions">
                      <b className={`wallet-request-status ${entry.status}`}>{entry.status}</b>
                      {entry.agentRequest && entry.receipt_available && (
                        <button type="button" className="wallet-receipt-button" onClick={() => viewReceipt(entry)}>View receipt</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="wallet-empty">No deposit or withdrawal requests yet.</p>}
            {showAgentRequests && agentRequestsLoading && <p className="wallet-empty">Loading agent transfer history…</p>}
            {showAgentRequests && agentRequestsError && <p className="wallet-feedback error" role="alert">{agentRequestsError}</p>}
            {wallet.referralCode && <p className="wallet-referral">Referral code: <strong>{wallet.referralCode}</strong></p>}
          </section>
        </>
      )}
      {receiptPreview && (
        <ReceiptPreviewModal
          title={receiptPreview.title}
          image={receiptPreview.image}
          loading={receiptLoading}
          error={receiptError}
          onClose={() => { setReceiptPreview(null); setReceiptError('') }}
        />
      )}
    </WalletContainer>
  )
}

export default Wallet
