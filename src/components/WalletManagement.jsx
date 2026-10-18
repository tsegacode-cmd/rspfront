import { useCallback, useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import ReceiptPreviewModal from './ReceiptPreviewModal'
import Pagination, { getPageItems, PAGE_SIZE } from './Pagination'
import '../pages/SocialFeatures.css'

const BLANK_SETTINGS = {
  role: '',
  signup_bonus: 0,
  invite_reward: 0,
  share_reward: 0,
  product_sale_percent: 0,
  currency: 'ETB',
  invite_reward_trigger: 'first_approved_purchase',
  coin_login_reward: 0,
  coin_share_reward: 0,
  coin_invite_reward: 0,
  coin_purchase_reward: 0,
  coin_gift_receive_reward: 0,
  coin_gift_bonus_percent: 0,
  coin_per_etb: 100,
  min_coin_conversion: 100,
  max_coin_conversion: 1000000,
  min_deposit: 0.01,
  max_deposit: 100000,
  min_withdrawal: 0.01,
  max_withdrawal: 100000,
  min_bonus_withdrawal: 0.01,
  max_bonus_withdrawal: 100000,
  bonus_to_real_rate: 0,
}
const ALL_ACCOUNTS = '__all_accounts__'

function WalletManagement() {
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(BLANK_SETTINGS)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adjustment, setAdjustment] = useState({ userId: '', amount: '', reason: '', balanceType: 'real' })
  const [listPages, setListPages] = useState({})
  const [activityFilters, setActivityFilters] = useState({ search: '', role: '', asset: 'all', from: '', to: '' })
  const [activityForm, setActivityForm] = useState({ search: '', role: '', asset: 'all', from: '', to: '' })
  const [activityPage, setActivityPage] = useState(1)
  const [activityData, setActivityData] = useState(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityRefresh, setActivityRefresh] = useState(0)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState('')

  const visibleItems = (items, key) => {
    const page = Math.min(listPages[key] || 0, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1))
    return getPageItems(items, page)
  }

  const renderPagination = (items, key, label) => (
    <Pagination
      page={Math.min(listPages[key] || 0, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1))}
      itemCount={items.length}
      onPageChange={page => setListPages(current => ({ ...current, [key]: page }))}
      label={label}
    />
  )

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await rootAPI.getWalletManagement()
      setData(response.data)
      if (response.data.settings.length) {
        setSettings(current => current.role === ALL_ACCOUNTS
          ? current
          : response.data.settings.find(item => item.role === current.role) || response.data.settings[0])
      }
      if (response.data.users.length) setAdjustment(current => (
        current.userId ? current : { ...current, userId: response.data.users[0].user_id }
      ))
      setActivityRefresh(current => current + 1)
      return true
    } catch (loadError) {
      setError(loadError.message || 'Could not load wallet management data.')
      return false
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let active = true
    const loadActivity = async () => {
      setActivityLoading(true)
      setActivityError('')
      try {
        const response = await rootAPI.getWalletActivity({ ...activityFilters, page: activityPage })
        if (active) setActivityData(response.data)
      } catch (loadError) {
        if (active) setActivityError(loadError.message || 'Could not load wallet activity.')
      } finally {
        if (active) setActivityLoading(false)
      }
    }
    loadActivity()
    return () => { active = false }
  }, [activityFilters, activityPage, activityRefresh])

  const selectRole = role => {
    if (role === ALL_ACCOUNTS) {
      const firstRole = data?.settings[0]
      if (firstRole) setSettings({ ...firstRole, role: ALL_ACCOUNTS })
      return
    }
    const selected = data?.settings.find(item => item.role === role)
    if (selected) setSettings(selected)
  }

  const saveSettings = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const roles = settings.role === ALL_ACCOUNTS
        ? data.settings
        : [settings]
      const results = await Promise.allSettled(roles.map(roleSettings => rootAPI.updateWalletSettings({
        role: roleSettings.role,
        signupBonus: settings.signup_bonus,
        inviteReward: settings.invite_reward,
        shareReward: settings.share_reward,
        productSalePercent: settings.product_sale_percent,
        currency: roleSettings.currency,
        inviteRewardTrigger: settings.invite_reward_trigger,
        coinLoginReward: settings.coin_login_reward,
        coinShareReward: settings.coin_share_reward,
        coinInviteReward: settings.coin_invite_reward,
        coinPurchaseReward: settings.coin_purchase_reward,
        coinGiftReceiveReward: settings.coin_gift_receive_reward,
        coinGiftBonusPercent: settings.coin_gift_bonus_percent,
        coinPerEtb: settings.coin_per_etb,
        minCoinConversion: settings.min_coin_conversion,
        maxCoinConversion: settings.max_coin_conversion,
        minDeposit: settings.min_deposit,
        maxDeposit: settings.max_deposit,
        minWithdrawal: settings.min_withdrawal,
        maxWithdrawal: settings.max_withdrawal,
        minBonusWithdrawal: settings.min_bonus_withdrawal,
        maxBonusWithdrawal: settings.max_bonus_withdrawal,
        bonusToRealRate: settings.bonus_to_real_rate,
      })))
      const refreshed = await load()
      if (!refreshed) return
      const failedRoles = results
        .map((result, index) => result.status === 'rejected' ? roles[index].role : null)
        .filter(Boolean)
      if (failedRoles.length) {
        const savedCount = roles.length - failedRoles.length
        setError(`Reward rules saved for ${savedCount} role(s), but failed for: ${failedRoles.join(', ')}. Review those roles and try again.`)
      } else {
        setMessage(settings.role === ALL_ACCOUNTS
          ? `Reward rules saved for all ${roles.length} account roles.`
          : `Reward rules saved for ${settings.role}.`)
      }
    } catch (saveError) {
      setError(saveError.message || 'Could not save wallet rules.')
    } finally {
      setBusy(false)
    }
  }

  const decideWithdrawal = async (id, status) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await rootAPI.updateWithdrawal(id, status)
      setMessage(`Withdrawal marked ${status}.`)
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Could not update withdrawal.')
    } finally {
      setBusy(false)
    }
  }

  const viewWithdrawalReceipt = async withdrawal => {
    setReceiptPreview({ title: 'Withdrawal receipt' })
    setReceiptLoading(true)
    setReceiptError('')
    try {
      const response = await rootAPI.getWithdrawalReceipt(withdrawal.withdrawal_id)
      setReceiptPreview({ title: 'Withdrawal receipt', file: response.data.receiptFile })
    } catch (loadError) {
      setReceiptError(loadError.message || 'Could not load the withdrawal receipt.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const decideDeposit = async (id, status) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await rootAPI.updateDeposit(id, status)
      setMessage(`Deposit marked ${status}; the account balance has been refreshed.`)
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Could not update deposit.')
    } finally {
      setBusy(false)
    }
  }

  const saveAdjustment = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await rootAPI.adjustWalletBalance(adjustment)
      const selectedUser = data.users.find(user => user.user_id === adjustment.userId)
      const balanceLabel = adjustment.balanceType === 'coin'
        ? 'virtual coins'
        : adjustment.balanceType === 'bonus' ? 'bonus/reward balance' : 'real balance'
      setMessage(`${balanceLabel} adjustment saved for ${selectedUser?.username || 'the selected account'}.`)
      setAdjustment(current => ({ ...current, amount: '', reason: '' }))
      await load()
    } catch (adjustError) {
      setError(adjustError.message || 'Could not adjust wallet balance.')
    } finally {
      setBusy(false)
    }
  }

  const changeSetting = (key, value) => setSettings(current => ({ ...current, [key]: value }))
  const applyActivityFilters = event => {
    event.preventDefault()
    setActivityPage(1)
    setActivityFilters(activityForm)
  }
  const clearActivityFilters = () => {
    const emptyFilters = { search: '', role: '', asset: 'all', from: '', to: '' }
    setActivityForm(emptyFilters)
    setActivityFilters(emptyFilters)
    setActivityPage(1)
  }
  const activitySummary = activityData?.summary
  const activityPages = Math.max(1, Math.ceil((activityData?.total || 0) / (activityData?.pageSize || 50)))

  return (
    <section className="wallet-management">
      <div className="social-page-heading"><div><p className="social-kicker">ROOT CONTROLS</p><h2>Wallet Management</h2><p>Configure account-role rewards, review balances, and approve deposits or withdrawals.</p></div></div>
      <p className="social-status">Reward defaults are zero. No real-money rewards are issued until you configure rates. Payouts are manual; connect a verified payment provider before automating transfers.</p>
      {error && <p className="social-status" role="alert">{error}</p>}
      {message && <p className="social-status" role="status">{message}</p>}
      {!data ? <p className="social-muted">Loading wallet records…</p> : (
        <>
          <form className="social-composer" onSubmit={saveSettings}>
            <h3>Wallet and virtual coin rules by account role</h3>
            <p className="social-muted">Set the coins-per-ETB exchange rate for buying coins with ETB and converting coins back to ETB. Rates and conversion limits are applied per role.</p>
            <label className="wallet-admin-field">Account role
              <select value={settings.role} onChange={event => selectRole(event.target.value)}>
                <option value={ALL_ACCOUNTS}>All accounts</option>
                {data.settings.map(item => <option value={item.role} key={item.role}>{item.role}</option>)}
              </select>
            </label>
            {settings.role === ALL_ACCOUNTS && <p className="social-muted">The reward amounts below will be applied to every account role. Each role keeps its existing currency.</p>}
            <div className="wallet-admin-grid">
              <label>Signup bonus<input type="number" min="0" step="0.01" value={settings.signup_bonus} onChange={event => changeSetting('signup_bonus', event.target.value)} /></label>
              <label>Successful invite reward (ETB bonus)<input type="number" min="0" step="0.01" value={settings.invite_reward} onChange={event => changeSetting('invite_reward', event.target.value)} /></label>
              <label>Invite reward trigger
                <select value={settings.invite_reward_trigger} onChange={event => changeSetting('invite_reward_trigger', event.target.value)}>
                  <option value="first_approved_purchase">After first approved booking or product purchase</option>
                  <option value="registration">When the invited account is created</option>
                  <option value="both">At registration and after first approved purchase</option>
                </select>
              </label>
              <label>Share reward (once per post/account)<input type="number" min="0" step="0.01" value={settings.share_reward} onChange={event => changeSetting('share_reward', event.target.value)} /></label>
              <label>Referred sale commission (%)<input type="number" min="0" max="100" step="0.01" value={settings.product_sale_percent} onChange={event => changeSetting('product_sale_percent', event.target.value)} /></label>
              <label>Daily active login (coins)<input type="number" min="0" step="1" value={settings.coin_login_reward} onChange={event => changeSetting('coin_login_reward', event.target.value)} /></label>
              <label>Share reward (coins)<input type="number" min="0" step="1" value={settings.coin_share_reward} onChange={event => changeSetting('coin_share_reward', event.target.value)} /></label>
              <label>Successful invite reward (coins)<input type="number" min="0" step="1" value={settings.coin_invite_reward} onChange={event => changeSetting('coin_invite_reward', event.target.value)} /></label>
              <label>Approved purchase reward (coins)<input type="number" min="0" step="1" value={settings.coin_purchase_reward} onChange={event => changeSetting('coin_purchase_reward', event.target.value)} /></label>
              <label>Gift received platform reward (coins)<input type="number" min="0" step="1" value={settings.coin_gift_receive_reward} onChange={event => changeSetting('coin_gift_receive_reward', event.target.value)} /></label>
              <label>Gift bonus (% of gifted coins)<input type="number" min="0" max="100" step="0.01" value={settings.coin_gift_bonus_percent} onChange={event => changeSetting('coin_gift_bonus_percent', event.target.value)} /></label>
              <label>Coins per 1 ETB (both directions)<input type="number" min="1" step="1" value={settings.coin_per_etb} onChange={event => changeSetting('coin_per_etb', event.target.value)} /></label>
              <label>Minimum coin conversion<input type="number" min="0" step="1" value={settings.min_coin_conversion} onChange={event => changeSetting('min_coin_conversion', event.target.value)} /></label>
              <label>Maximum coin conversion<input type="number" min="1" step="1" value={settings.max_coin_conversion} onChange={event => changeSetting('max_coin_conversion', event.target.value)} /></label>
              <label>Minimum deposit (ETB)<input type="number" min="0" step="0.01" value={settings.min_deposit} onChange={event => changeSetting('min_deposit', event.target.value)} /></label>
              <label>Maximum deposit (ETB)<input type="number" min="0" step="0.01" value={settings.max_deposit} onChange={event => changeSetting('max_deposit', event.target.value)} /></label>
              <label>Minimum withdrawal (ETB)<input type="number" min="0" step="0.01" value={settings.min_withdrawal} onChange={event => changeSetting('min_withdrawal', event.target.value)} /></label>
              <label>Maximum withdrawal (ETB)<input type="number" min="0" step="0.01" value={settings.max_withdrawal} onChange={event => changeSetting('max_withdrawal', event.target.value)} /></label>
              <label>Minimum bonus withdrawal (ETB)<input type="number" min="0" step="0.01" value={settings.min_bonus_withdrawal} onChange={event => changeSetting('min_bonus_withdrawal', event.target.value)} /></label>
              <label>Maximum bonus withdrawal (ETB)<input type="number" min="0" step="0.01" value={settings.max_bonus_withdrawal} onChange={event => changeSetting('max_bonus_withdrawal', event.target.value)} /></label>
              <label>Bonus to real conversion rate (real {settings.currency} per bonus {settings.currency}; 0 disables)<input type="number" min="0" max="100" step="0.0001" value={settings.bonus_to_real_rate} onChange={event => changeSetting('bonus_to_real_rate', event.target.value)} /></label>
              {settings.role !== ALL_ACCOUNTS && <label>Currency code<input maxLength="8" value={settings.currency} onChange={event => changeSetting('currency', event.target.value.toUpperCase())} /></label>}
            </div>
            <button disabled={busy || !data.settings.length}>{busy ? 'Saving…' : settings.role === ALL_ACCOUNTS ? 'Save rules for all accounts' : 'Save role rules'}</button>
          </form>

          <form className="social-composer" onSubmit={saveAdjustment}>
            <h3>Manual wallet / virtual coin adjustment</h3>
            <p>Use a positive amount to credit and a negative amount to deduct. Bonus and reward credits use the same bonus/reward balance; virtual coins use their own ledger. Every change is recorded in the transaction history.</p>
            <div className="wallet-admin-grid">
              <label>Account
                <select value={adjustment.userId} onChange={event => setAdjustment(current => ({ ...current, userId: event.target.value }))}>
                  {data.users.map(user => <option value={user.user_id} key={user.user_id}>{user.full_name} (@{user.username})</option>)}
                </select>
              </label>
              <label>Amount (+ credit / − deduct)<input type="number" step={adjustment.balanceType === 'coin' ? '1' : '0.01'} value={adjustment.amount} onChange={event => setAdjustment(current => ({ ...current, amount: event.target.value }))} required /></label>
              <label>Balance type<select value={adjustment.balanceType} onChange={event => setAdjustment(current => ({ ...current, balanceType: event.target.value, amount: '' }))}><option value="real">Real balance ({data.users.find(user => user.user_id === adjustment.userId)?.currency || 'ETB'})</option><option value="bonus">Bonus / reward balance ({data.users.find(user => user.user_id === adjustment.userId)?.currency || 'ETB'})</option><option value="coin">Virtual coins (whole numbers)</option></select></label>
              <label>Reason<input maxLength="250" value={adjustment.reason} onChange={event => setAdjustment(current => ({ ...current, reason: event.target.value }))} required /></label>
            </div>
            <button disabled={busy}>Apply adjustment</button>
          </form>

          <section className="wallet-list-card wallet-activity-section">
            <h3>Wallet activity analysis</h3>
            <p className="social-muted">Search and review ETB and virtual coin ledger activity across all accounts.</p>
            <form className="wallet-activity-filters" onSubmit={applyActivityFilters}>
              <label>Search accounts and activity
                <input type="search" value={activityForm.search} onChange={event => setActivityForm(current => ({ ...current, search: event.target.value }))} placeholder="Name, username, user ID, role, or description" />
              </label>
              <label>Account role
                <select value={activityForm.role} onChange={event => setActivityForm(current => ({ ...current, role: event.target.value }))}>
                  <option value="">All roles</option>
                  {data.settings.map(item => <option value={item.role} key={item.role}>{item.role}</option>)}
                </select>
              </label>
              <label>Activity type
                <select value={activityForm.asset} onChange={event => setActivityForm(current => ({ ...current, asset: event.target.value }))}>
                  <option value="all">All real, bonus &amp; coins</option>
                  <option value="real">Real balance</option>
                  <option value="bonus">Bonus rewards</option>
                  <option value="ETB">All ETB balances</option>
                  <option value="coin">Virtual coins</option>
                </select>
              </label>
              <label>From date<input type="date" value={activityForm.from} onChange={event => setActivityForm(current => ({ ...current, from: event.target.value }))} /></label>
              <label>To date<input type="date" value={activityForm.to} onChange={event => setActivityForm(current => ({ ...current, to: event.target.value }))} /></label>
              <div className="wallet-activity-actions"><button type="submit" disabled={activityLoading}>Apply filters</button><button type="button" className="wallet-activity-reset" onClick={clearActivityFilters}>Reset</button></div>
            </form>
            {activityError && <p className="social-status" role="alert">{activityError}</p>}
            <div className="wallet-activity-summary">
              <article><small>Matching transactions</small><strong>{activitySummary?.transaction_count ?? '—'}</strong></article>
              <article><small>Coins credited</small><strong>{Number(activitySummary?.coins_credited || 0).toLocaleString()}</strong></article>
              <article><small>Coins deducted</small><strong>{Number(activitySummary?.coins_debited || 0).toLocaleString()}</strong></article>
              <article><small>ETB credited</small><strong>{Number(activitySummary?.etb_credited || 0).toFixed(2)}</strong></article>
              <article><small>Real credited</small><strong>{Number(activitySummary?.real_credited || 0).toFixed(2)}</strong></article>
              <article><small>Bonus / rewards credited</small><strong>{Number(activitySummary?.bonus_credited || 0).toFixed(2)}</strong></article>
              <article><small>ETB deducted</small><strong>{Number(activitySummary?.etb_debited || 0).toFixed(2)}</strong></article>
            </div>
            {activityLoading && <p className="social-muted">Loading wallet activity…</p>}
            {!activityLoading && activityData && activityData.entries.length === 0 && <p className="social-muted">No activity matches these filters.</p>}
            {!!activityData?.entries.length && (
              <div className="wallet-activity-table-wrap">
                <table className="wallet-activity-table">
                  <thead><tr><th>Date</th><th>Account</th><th>Role</th><th>Activity</th><th>Type</th><th>Amount</th></tr></thead>
                  <tbody>{activityData.entries.map(item => (
                    <tr key={`${item.asset}-${item.id}`}>
                      <td>{new Date(`${item.created_at}${item.created_at?.includes('Z') ? '' : 'Z'}`).toLocaleString()}</td>
                      <td>{item.full_name}<small>@{item.username} · ID {item.user_id}</small></td>
                      <td>{item.role}</td>
                      <td>{item.description}<small>{item.entry_type.replaceAll('_', ' ')}</small></td>
                      <td>{item.asset === 'coin' ? 'Virtual coins' : `${item.bucket} ${item.currency}`}</td>
                      <td className={Number(item.amount) >= 0 ? 'wallet-activity-credit' : 'wallet-activity-debit'}>{Number(item.amount) > 0 ? '+' : ''}{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: item.asset === 'coin' ? 0 : 2, maximumFractionDigits: item.asset === 'coin' ? 0 : 2 })}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {!!activityData?.total && <div className="wallet-activity-pagination">
              <span>Page {activityData.page} of {activityPages} · {activityData.total.toLocaleString()} records</span>
              <div><button type="button" disabled={activityLoading || activityPage <= 1} onClick={() => setActivityPage(page => page - 1)}>Previous</button><button type="button" disabled={activityLoading || activityPage >= activityPages} onClick={() => setActivityPage(page => page + 1)}>Next</button></div>
            </div>}
          </section>

          <section className="wallet-list-card">
            <h3>Deposit requests</h3>
            {!data.deposits.length && <p className="social-muted">No deposit requests.</p>}
            {visibleItems(data.deposits, 'deposits').map(item => (
              <div className="wallet-row wallet-admin-row" key={item.deposit_id}>
                <span><strong>{item.username || item.user_id} · {Number(item.amount).toFixed(2)}</strong><small>{item.payment_method} · Reference: {item.payment_reference}</small><small>{new Date(item.created_at).toLocaleString()}</small></span>
                <span className={`wallet-status ${item.status}`}>{item.status}</span>
                {item.status === 'pending' && <div className="wallet-decision">
                  <button disabled={busy} onClick={() => decideDeposit(item.deposit_id, 'approved')}>Approve &amp; credit</button>
                  <button disabled={busy} onClick={() => decideDeposit(item.deposit_id, 'rejected')}>Reject</button>
                </div>}
              </div>
            ))}
            {renderPagination(data.deposits, 'deposits', 'deposit requests')}
          </section>

          <section className="wallet-list-card">
            <h3>Withdrawal requests</h3>
            {!data.withdrawals.length && <p className="social-muted">No payout requests.</p>}
            {visibleItems(data.withdrawals, 'withdrawals').map(item => (
              <div className="wallet-row wallet-admin-row" key={item.withdrawal_id}>
                <span>
                  <strong>{item.username || item.user_id} · {Number(item.amount).toFixed(2)} {item.balance_type === 'bonus' ? '(bonus balance)' : '(real balance)'}</strong>
                  <small>{item.payout_details}</small>
                  <small>Transaction ID: {item.transaction_reference || 'Not provided'}</small>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </span>
                <span className={`wallet-status ${item.status}`}>{item.status}</span>
                {Boolean(item.receipt_available) && <button type="button" className="wallet-secondary-button" onClick={() => viewWithdrawalReceipt(item)}>View receipt</button>}
                {item.status === 'pending' && <div className="wallet-decision">
                  <button disabled={busy} onClick={() => decideWithdrawal(item.withdrawal_id, 'paid')}>Approve &amp; mark paid</button>
                  <button disabled={busy} onClick={() => decideWithdrawal(item.withdrawal_id, 'rejected')}>Reject</button>
                </div>}
              </div>
            ))}
            {renderPagination(data.withdrawals, 'withdrawals', 'withdrawal requests')}
          </section>

          <section className="wallet-list-card">
            <h3>Account balances</h3>
            <div className="wallet-admin-row wallet-table-head"><span>Account</span><span>Role</span><span>Balance</span></div>
            {visibleItems(data.users, 'wallet-balances').map(user => (
              <div className="wallet-admin-row" key={user.user_id}>
                <span>{user.full_name} <small>@{user.username}</small></span>
                <span>{user.role}</span>
                <strong className="wallet-admin-balance-detail">
                  <span>{Number(user.real_balance).toFixed(2)} {user.currency} real</span>
                  <span>{Number(user.bonus_balance).toFixed(2)} {user.currency} bonus / rewards</span>
                  <span>{Number(user.coin_balance).toLocaleString()} virtual coins</span>
                </strong>
              </div>
            ))}
            {renderPagination(data.users, 'wallet-balances', 'wallet balances')}
          </section>
        </>
      )}
      {receiptPreview && (
        <ReceiptPreviewModal
          title={receiptPreview.title}
          file={receiptPreview.file}
          loading={receiptLoading}
          error={receiptError}
          onClose={() => { setReceiptPreview(null); setReceiptError('') }}
        />
      )}
    </section>
  )
}

export default WalletManagement
