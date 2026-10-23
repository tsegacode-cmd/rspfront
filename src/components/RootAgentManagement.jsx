import { useCallback, useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import ReceiptPreviewModal from './ReceiptPreviewModal'
import './RootAgentManagement.css'

const emptySettings = {
  service_charge_percent: 0,
  reward_percent: 0,
  payment_details: '',
}

const formatMoney = value => `${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})} ETB`

const formatDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

function RootAgentManagement() {
  const [data, setData] = useState({ agents: [], package_requests: [], package_pool_balance: 0 })
  const [analytics, setAnalytics] = useState(null)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [details, setDetails] = useState(null)
  const [settings, setSettings] = useState(emptySettings)
  const [funding, setFunding] = useState({ agentId: '', amount: '', description: '' })
  const [adjustment, setAdjustment] = useState({ amount: '', description: '' })
  const [walletAdjustment, setWalletAdjustment] = useState({
    asset: 'real',
    direction: 'credit',
    amount: '',
    description: '',
  })
  const [view, setView] = useState('agents')
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [analyticsError, setAnalyticsError] = useState('')
  const [notice, setNotice] = useState('')
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await rootAPI.getAgentManagement()
      const result = response.data || {}
      const agentsList = Array.isArray(result.agents) ? result.agents : []
      const packageRequestsList = Array.isArray(result.package_requests) ? result.package_requests : []

      setData({
        agents: agentsList,
        package_requests: packageRequestsList,
        package_pool_balance: Number(result.package_pool_balance || 0),
      })

      setSelectedAgentId(current => current || agentsList[0]?.id || '')
      setFunding(current => ({ ...current, agentId: current.agentId || '' }))

      try {
        const analyticsResponse = await rootAPI.getAgentAnalytics()
        setAnalytics(analyticsResponse.data || null)
        setAnalyticsError('')
      } catch (analyticsLoadError) {
        setAnalyticsError(analyticsLoadError.message || 'Could not load agent analytics.')
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load agent management data.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetails = useCallback(async agentId => {
    if (!agentId) {
      setDetails(null)
      return
    }
    setDetailsLoading(true)
    setError('')
    try {
      const response = await rootAPI.getAgentDetails(agentId)
      const detailsData = response.data || {}
      setDetails(detailsData)
      setSettings({
        service_charge_percent: detailsData.settings?.service_charge_percent ?? 0,
        reward_percent: detailsData.settings?.reward_percent ?? 0,
        payment_details: detailsData.settings?.payment_details || '',
      })
    } catch (loadError) {
      setDetails(null)
      setError(loadError.message || 'Could not load this agent’s details.')
    } finally {
      setDetailsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    loadDetails(selectedAgentId)
  }, [selectedAgentId, loadDetails])

  useEffect(() => {
    if (!selectedAgentId) return undefined
    let active = true
    let refreshing = false
    let loggedRefreshError = false
    const refreshStatuses = async () => {
      if (!active || refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        const response = await rootAPI.getAgentDetailsStatus(selectedAgentId)
        if (!response.success || !response.data) {
          throw new Error(response.message || 'The agent status response was invalid.')
        }
        loggedRefreshError = false
        setDetails(current => current ? ({
          ...current,
          created_accounts: (current.created_accounts || []).map(account => ({
            ...account,
            ...((response.data.created_accounts || []).find(item => item.id === account.id) || {}),
          })),
          products: (current.products || []).map(product => ({
            ...product,
            ...((response.data.products || []).find(item => item.id === product.id) || {}),
          })),
          service_products: (current.service_products || []).map(product => ({
            ...product,
            ...((response.data.service_products || []).find(item => item.id === product.id) || {}),
          })),
          package_requests: (current.package_requests || []).map(request => ({
            ...request,
            ...((response.data.package_requests || []).find(item => item.id === request.id) || {}),
          })),
          wallet_requests: (current.wallet_requests || []).map(request => ({
            ...request,
            ...((response.data.wallet_requests || []).find(item => item.id === request.id) || {}),
          })),
        }) : current)
      } catch (refreshError) {
        if (active && !loggedRefreshError) {
          console.error('Could not refresh selected agent statuses:', refreshError)
          loggedRefreshError = true
        }
      } finally {
        refreshing = false
      }
    }
    refreshStatuses()
    const timer = window.setInterval(refreshStatuses, 500)
    document.addEventListener('visibilitychange', refreshStatuses)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshStatuses)
    }
  }, [selectedAgentId])

  const runAction = async (key, action, successMessage) => {
    setBusyAction(key)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
      await load()
      if (selectedAgentId) await loadDetails(selectedAgentId)
      return true
    } catch (actionError) {
      setError(actionError.message || 'Could not complete this agent management action.')
      return false
    } finally {
      setBusyAction('')
    }
  }

  const saveSettings = async event => {
    event.preventDefault()
    setBusy(true)
    await runAction('settings', () => rootAPI.updateAgentSettings(selectedAgentId, {
      service_charge_percent: Number(settings.service_charge_percent),
      reward_percent: Number(settings.reward_percent),
      payment_details: settings.payment_details,
    }), 'Agent settings saved.')
    setBusy(false)
  }

  const submitFunding = async event => {
    event.preventDefault()
    setBusy(true)
    await runAction('funding', () => rootAPI.fundAgentPackagePool({
      amount: Number(funding.amount),
      agentId: funding.agentId || null,
      description: funding.description.trim(),
    }), funding.agentId ? 'Agent package balance funded.' : 'Platform package pool funded.')
    setFunding(current => ({ ...current, amount: '', description: '' }))
    setBusy(false)
  }

  const submitAdjustment = async event => {
    event.preventDefault()
    setBusy(true)
    await runAction('adjustment', () => rootAPI.adjustAgentPackageBalance(selectedAgentId, {
      amount: Number(adjustment.amount),
      description: adjustment.description.trim(),
    }), 'Agent package balance adjusted.')
    setAdjustment({ amount: '', description: '' })
    setBusy(false)
  }

  const submitWalletAdjustment = async event => {
    event.preventDefault()
    setBusy(true)
    const succeeded = await runAction('wallet-adjustment', () => rootAPI.adjustAgentWalletBalance(selectedAgentId, {
      asset: walletAdjustment.asset,
      direction: walletAdjustment.direction,
      amount: Number(walletAdjustment.amount),
      description: walletAdjustment.description.trim(),
    }), `Agent ${walletAdjustment.asset} balance ${walletAdjustment.direction === 'credit' ? 'funded' : 'deducted'}.`)
    if (succeeded) setWalletAdjustment(current => ({ ...current, amount: '', description: '' }))
    setBusy(false)
  }

  const viewWalletRequestReceipt = async request => {
    setReceiptPreview({ title: `${request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} receipt` })
    setReceiptLoading(true)
    setReceiptError('')
    try {
      const response = await rootAPI.getAgentWalletRequestReceipt(request.id)
      setReceiptPreview({
        title: `${request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} receipt`,
        file: response.data?.receiptFile || response.data?.receiptImage,
      })
    } catch (loadError) {
      setReceiptError(loadError.message || 'Could not load the receipt.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const reviewPackageRequest = (request, status) => runAction(
    `${request.id}-${status}`,
    () => rootAPI.reviewAgentPackageRequest(request.id, status),
    `Package request ${status}.`,
  )

  const reviewProduct = (product, status) => runAction(
    `${product.id}-${status}`,
    () => rootAPI.reviewAgentProduct(product.id, status),
    `Product ${status}.`,
  )

  const safeAgents = Array.isArray(data.agents) ? data.agents : []
  const selectedAgent = safeAgents.find(agent => agent.id === selectedAgentId)
  const pendingRequests = (Array.isArray(data.package_requests) ? data.package_requests : []).filter(request => request.status === 'pending')
  const pendingProducts = (details?.products || []).filter(product => product.approval_status === 'pending')
  const pendingServiceProducts = (details?.service_products || []).filter(product => product.approval_status === 'pending')
  const createdChildAgents = (details?.created_accounts || []).filter(account => String(account.role || '').toLowerCase() === 'agent')
  const createdCustomers = (details?.created_accounts || []).filter(account => String(account.role || '').toLowerCase() === 'user')

  return (
    <section className="root-agent-management">
      <header className="root-agent-heading">
        <div>
          <h2>Agent Management</h2>
          <p>Manage agent accounts, package balances, product approvals, and wallet activity.</p>
        </div>
        <button type="button" className="root-agent-button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && <p className="root-agent-error" role="alert">{error}</p>}
      {notice && <p className="root-agent-notice" role="status">{notice}</p>}

      <div className="root-agent-metrics" aria-label="Agent platform summary">
        <article><span>Agents</span><strong>{analytics?.agents ?? safeAgents.length}</strong></article>
        <article><span>Products</span><strong>{analytics?.products ?? '—'}</strong></article>
        <article><span>Pending package requests</span><strong>{analytics?.pending_package_requests ?? pendingRequests.length}</strong></article>
        <article><span>Package pool balance</span><strong>{formatMoney(data.package_pool_balance)}</strong></article>
      </div>

      {analyticsError && <p className="root-agent-error" role="alert">{analyticsError}</p>}

      <nav className="root-agent-tabs" aria-label="Agent management sections">
        <button type="button" className={view === 'agents' ? 'active' : ''} onClick={() => setView('agents')}>Agents</button>
        <button type="button" className={view === 'requests' ? 'active' : ''} onClick={() => setView('requests')}>
          Package requests <span>{pendingRequests.length}</span>
        </button>
        <button type="button" className={view === 'activity' ? 'active' : ''} onClick={() => setView('activity')}>Platform activity</button>
      </nav>

      {loading ? (
        <p className="root-agent-empty">Loading agent management…</p>
      ) : view === 'agents' ? (
        <>
          {safeAgents.length ? (
            <div className="root-agent-layout">
              <div className="root-agent-list">
                {safeAgents.map(agent => (
                  <button
                    type="button"
                    key={agent.id}
                    className={`root-agent-card ${selectedAgentId === agent.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <strong>{agent.full_name || agent.username}</strong>
                    <span>@{agent.username} · {agent.is_active ? 'Active' : 'Inactive'}</span>
                    <span>{agent.product_count} products · {agent.pending_package_requests} pending requests</span>
                    <b>{formatMoney(agent.package_balance)}</b>
                    <small>Real {formatMoney(agent.real_balance)} · Bonus {formatMoney(agent.bonus_balance)} · {Number(agent.coin_balance || 0).toLocaleString()} coins</small>
                  </button>
                ))}
              </div>
              <div className="root-agent-detail">
                {detailsLoading ? <p className="root-agent-empty">Loading agent details…</p> : details && selectedAgent ? (
                  <>
                    <section className="root-agent-panel">
                      <h3>{selectedAgent.full_name || selectedAgent.username}</h3>
                      <p>@{selectedAgent.username}{selectedAgent.email ? ` · ${selectedAgent.email}` : ''}{selectedAgent.phone ? ` · ${selectedAgent.phone}` : ''}</p>
                      <p>Package balance: <strong>{formatMoney(details.package_balance)}</strong></p>
                      <div className="root-agent-wallet-balances" aria-label="Agent wallet balances">
                        <article><span>Real balance</span><strong>{formatMoney(details.wallet_balances?.real_balance)}</strong></article>
                        <article><span>Bonus balance</span><strong>{formatMoney(details.wallet_balances?.bonus_balance)}</strong></article>
                        <article><span>Coins</span><strong>{Number(details.wallet_balances?.coin_balance || 0).toLocaleString()}</strong></article>
                      </div>
                      <form className="root-agent-form" onSubmit={saveSettings}>
                        <label>Service charge (%)
                          <input type="number" min="0" max="100" step="0.01" required value={settings.service_charge_percent}
                            onChange={event => setSettings(current => ({ ...current, service_charge_percent: event.target.value }))} />
                        </label>
                        <label>Agent reward (%)
                          <input type="number" min="0" max="100" step="0.01" required value={settings.reward_percent}
                            onChange={event => setSettings(current => ({ ...current, reward_percent: event.target.value }))} />
                        </label>
                        <label className="full-width">Payment details
                          <textarea maxLength="2000" value={settings.payment_details}
                            onChange={event => setSettings(current => ({ ...current, payment_details: event.target.value }))} />
                        </label>
                        <button className="root-agent-button" type="submit" disabled={busy || !selectedAgentId}>
                          {busyAction === 'settings' ? 'Saving…' : 'Save settings'}
                        </button>
                      </form>
                    </section>

                    <section className="root-agent-panel">
                      <h3>Fund or withdraw from agent wallet</h3>
                      <p>Credit adds to the selected balance. Debit withdraws from it and cannot exceed funds available after pending withdrawals.</p>
                      <form className="root-agent-form" onSubmit={submitWalletAdjustment}>
                        <label>Wallet balance
                          <select value={walletAdjustment.asset} onChange={event => setWalletAdjustment(current => ({ ...current, asset: event.target.value }))}>
                            <option value="real">Real balance (ETB)</option>
                            <option value="bonus">Bonus balance (ETB)</option>
                            <option value="coin">Coins</option>
                          </select>
                        </label>
                        <label>Action
                          <select value={walletAdjustment.direction} onChange={event => setWalletAdjustment(current => ({ ...current, direction: event.target.value }))}>
                            <option value="credit">Fund / add</option>
                            <option value="debit">Withdraw / deduct</option>
                          </select>
                        </label>
                        <label>Amount ({walletAdjustment.asset === 'coin' ? 'coins' : 'ETB'})
                          <input type="number" min={walletAdjustment.asset === 'coin' ? '1' : '0.01'} step={walletAdjustment.asset === 'coin' ? '1' : '0.01'} required value={walletAdjustment.amount}
                            onChange={event => setWalletAdjustment(current => ({ ...current, amount: event.target.value }))} />
                        </label>
                        <label className="full-width">Reason
                          <input required maxLength="500" value={walletAdjustment.description}
                            onChange={event => setWalletAdjustment(current => ({ ...current, description: event.target.value }))} />
                        </label>
                        <button className="root-agent-button" type="submit" disabled={busy || !selectedAgentId}>
                          {busyAction === 'wallet-adjustment' ? 'Applying…' : `${walletAdjustment.direction === 'credit' ? 'Fund' : 'Withdraw'} balance`}
                        </button>
                      </form>
                    </section>

                    <section className="root-agent-panel">
                      <h3>Adjust package balance</h3>
                      <p>Use a positive amount to add funds or a negative amount to deduct funds.</p>
                      <form className="root-agent-form" onSubmit={submitAdjustment}>
                        <label>Amount (ETB)
                          <input type="number" step="0.01" required value={adjustment.amount}
                            onChange={event => setAdjustment(current => ({ ...current, amount: event.target.value }))} />
                        </label>
                        <label className="full-width">Reason
                          <input required maxLength="500" value={adjustment.description}
                            onChange={event => setAdjustment(current => ({ ...current, description: event.target.value }))} />
                        </label>
                        <button className="root-agent-button" type="submit" disabled={busy}>
                          {busyAction === 'adjustment' ? 'Applying…' : 'Apply adjustment'}
                        </button>
                      </form>
                    </section>

                    <section className="root-agent-panel">
                      <h3>Fund package pool or agent</h3>
                      <form className="root-agent-form" onSubmit={submitFunding}>
                        <label>Destination
                          <select value={funding.agentId} onChange={event => setFunding(current => ({ ...current, agentId: event.target.value }))}>
                            <option value="">Platform package pool</option>
                            {safeAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name || agent.username}</option>)}
                          </select>
                        </label>
                        <label>Amount (ETB)
                          <input type="number" min="0.01" step="0.01" required value={funding.amount}
                            onChange={event => setFunding(current => ({ ...current, amount: event.target.value }))} />
                        </label>
                        <label className="full-width">Description
                          <input required maxLength="500" value={funding.description}
                            onChange={event => setFunding(current => ({ ...current, description: event.target.value }))} />
                        </label>
                        <button className="root-agent-button" type="submit" disabled={busy}>
                          {busyAction === 'funding' ? 'Funding…' : 'Add funding'}
                        </button>
                      </form>
                    </section>

                    <section className="root-agent-panel">
                      <h3>Products {pendingProducts.length > 0 && <span className="root-agent-count">{pendingProducts.length} pending</span>}</h3>
                      {(details.products || []).length ? (details.products || []).map(product => (
                        <article className="root-agent-row" key={product.id}>
                          <div>
                            <strong>{product.title}</strong>
                            <span>{formatMoney(product.price)} · {product.approval_status || product.status} · {formatDate(product.updated_at || product.created_at)}</span>
                            {product.description && <p>{product.description}</p>}
                          </div>
                          {product.approval_status === 'pending' && (
                            <div className="root-agent-actions">
                              <button type="button" onClick={() => reviewProduct(product, 'approved')} disabled={Boolean(busyAction)}>
                                {busyAction === `${product.id}-approved` ? 'Approving…' : 'Approve'}
                              </button>
                              <button type="button" className="secondary" onClick={() => reviewProduct(product, 'rejected')} disabled={Boolean(busyAction)}>
                                Reject
                              </button>
                            </div>
                          )}
                        </article>
                      )) : <p className="root-agent-empty">No agent products.</p>}
                    </section>

                    <section className="root-agent-panel">
                      <h3>Service and digital product approvals {pendingServiceProducts.length > 0 && <span className="root-agent-count">{pendingServiceProducts.length} pending</span>}</h3>
                      {(details.service_products || []).length ? (details.service_products || []).map(product => (
                        <article className="root-agent-row" key={product.id}>
                          <div>
                            <strong>{product.title || product.name}</strong>
                            <span>{product.service_key} · {formatMoney(product.price)} · {product.approval_status || 'approved'} · {formatDate(product.updated_at)}</span>
                            {product.description && <p>{product.description}</p>}
                            {product.digitalProduct && <span>Digital download product</span>}
                          </div>
                          {product.approval_status === 'pending' && (
                            <div className="root-agent-actions">
                              <button type="button" onClick={() => runAction(
                                `${product.id}-catalog-approved`,
                                () => rootAPI.reviewAgentCatalogProduct(product.id, 'approved'),
                                'Service product approved and published.',
                              )} disabled={Boolean(busyAction)}>
                                {busyAction === `${product.id}-catalog-approved` ? 'Approving…' : 'Approve & publish'}
                              </button>
                              <button type="button" className="secondary" onClick={() => runAction(
                                `${product.id}-catalog-rejected`,
                                () => rootAPI.reviewAgentCatalogProduct(product.id, 'rejected'),
                                'Service product rejected.',
                              )} disabled={Boolean(busyAction)}>
                                Reject
                              </button>
                            </div>
                          )}
                        </article>
                      )) : <p className="root-agent-empty">No service or digital product submissions.</p>}
                    </section>

                    <section className="root-agent-panel">
                      <h3>Child agent accounts ({createdChildAgents.length})</h3>
                      {createdChildAgents.length ? createdChildAgents.map(account => (
                        <article className="root-agent-row" key={account.id}>
                          <div>
                            <strong>{account.full_name || account.username}</strong>
                            <span>@{account.username} · {account.is_active ? 'Active' : 'Inactive'} · {account.is_online ? 'Online' : 'Offline'}</span>
                            <p>Balance: <strong>{formatMoney(account.real_balance)}</strong> · Activity: {Number(account.activity_count || 0).toLocaleString()} · Earnings: <strong>{formatMoney(account.total_earned)}</strong></p>
                            {account.email && <p>{account.email}</p>}
                          </div>
                        </article>
                      )) : <p className="root-agent-empty">No child agent accounts created by this agent yet.</p>}
                    </section>

                    <section className="root-agent-panel">
                      <h3>Customer accounts ({createdCustomers.length})</h3>
                      {createdCustomers.length ? createdCustomers.map(account => (
                        <article className="root-agent-row" key={account.id}>
                          <div>
                            <strong>{account.full_name || account.username}</strong>
                            <span>@{account.username} · {account.is_active ? 'Active' : 'Inactive'} · {account.is_online ? 'Online' : 'Offline'}</span>
                            <p>Balance: <strong>{formatMoney(account.real_balance)}</strong> · Activity: {Number(account.activity_count || 0).toLocaleString()} · Earnings: <strong>{formatMoney(account.total_earned)}</strong></p>
                            {account.email && <p>{account.email}</p>}
                          </div>
                        </article>
                      )) : <p className="root-agent-empty">No customer accounts created by this agent yet.</p>}
                    </section>

                    <section className="root-agent-panel">
                      <h3>Wallet requests for this agent</h3>
                      {(details.wallet_requests || []).length ? (
                        <div className="root-agent-request-list">
                          {(details.wallet_requests || []).map(request => (
                            <article className="root-agent-row" key={request.id}>
                              <div>
                                <strong>{request.user_username || 'Customer'} · {request.type} · {formatMoney(request.amount)}</strong>
                                <span>{request.status} · {formatDate(request.created_at)}</span>
                                <p>Transaction ID: {request.payment_reference}</p>
                                {request.payout_details && <p>Payout details: {request.payout_details}</p>}
                              </div>
                              {Boolean(request.receipt_available) && (
                                <button className="root-agent-button" type="button" onClick={() => viewWalletRequestReceipt(request)}>View receipt</button>
                              )}
                            </article>
                          ))}
                        </div>
                      ) : <p className="root-agent-empty">No customer wallet requests for this agent.</p>}
                    </section>

                    <section className="root-agent-panel">
                      <h3>Transaction history</h3>
                      {(details.transaction_history || []).length ? (details.transaction_history || []).map(transaction => (
                        <article className="root-agent-row" key={`${transaction.type}-${transaction.id}`}>
                          <div>
                            <strong>{String(transaction.type || '').replace(/_/g, ' ')} · {formatMoney(transaction.amount)}</strong>
                            <span>{transaction.status} · {formatDate(transaction.created_at)}</span>
                            {transaction.description && <p>{transaction.description}</p>}
                          </div>
                        </article>
                      )) : <p className="root-agent-empty">No transactions recorded for this agent.</p>}
                    </section>
                  </>
                ) : <p className="root-agent-empty">Select an agent to manage their settings and activity.</p>}
              </div>
            </div>
          ) : <p className="root-agent-empty">No agent accounts found.</p>}
        </>
      ) : view === 'requests' ? (
        (Array.isArray(data.package_requests) ? data.package_requests : []).length ? (
          <div className="root-agent-panel">
            {(Array.isArray(data.package_requests) ? data.package_requests : []).map(request => (
              <article className="root-agent-row" key={request.id}>
                <div>
                  <strong>{request.agent_name || request.agent_username || 'Agent'} · {formatMoney(request.amount)}</strong>
                  <span>{formatDate(request.created_at)} · {request.status}</span>
                  {request.note && <p>{request.note}</p>}
                </div>
                {request.status === 'pending' && (
                  <div className="root-agent-actions">
                    <button type="button" onClick={() => reviewPackageRequest(request, 'approved')} disabled={Boolean(busyAction)}>
                      {busyAction === `${request.id}-approved` ? 'Approving…' : 'Approve'}
                    </button>
                    <button type="button" className="secondary" onClick={() => reviewPackageRequest(request, 'rejected')} disabled={Boolean(busyAction)}>
                      {busyAction === `${request.id}-rejected` ? 'Rejecting…' : 'Reject'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : <p className="root-agent-empty">No package requests.</p>
      ) : analytics?.recent_wallet_requests?.length ? (
        <div className="root-agent-panel">
          <h3>Recent wallet requests</h3>
          {analytics.recent_wallet_requests.map(request => (
            <article className="root-agent-row" key={request.id}>
              <div>
                <strong>{request.user_name || 'User'} → {request.agent_name || 'Agent'} · {formatMoney(request.amount)}</strong>
                <span>{request.type} · {request.status} · {formatDate(request.created_at)}</span>
              </div>
            </article>
          ))}
          <p className="root-agent-totals">
            {analytics.wallet_requests} total wallet requests · {formatMoney(analytics.service_charges)} service charges · {formatMoney(analytics.agent_rewards)} agent rewards
          </p>
        </div>
      ) : <p className="root-agent-empty">No wallet activity found.</p>}
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

export default RootAgentManagement
