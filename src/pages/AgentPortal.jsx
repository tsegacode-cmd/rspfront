import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Wallet from './Wallet'
import ReceiptPreviewModal from '../components/ReceiptPreviewModal'
import ServiceProductAdderModal from '../components/ServiceProductAdderModal'
import { agentAPI, marketplaceAPI } from '../services/api'
import './AgentPortal.css'

const SERVICE_CATEGORIES = [
  { key: 'broker-house', label: 'Broker & House' },
  { key: 'create-partnership', label: 'Create Partnership' },
  { key: 'room-booking', label: 'Room Booking' },
  { key: 'logistics', label: 'Logistics / Vehicle Rental' },
  { key: 'movable-services', label: 'Big Service' },
]

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'products', label: 'Products' },
  { id: 'payouts', label: 'Wallet requests' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'team', label: 'Team & funding' },
]

const emptyDashboard = {
  agent: {},
  settings: {},
  package_balance: 0,
  summary: {},
  products: [],
  wallet_requests: [],
  package_requests: [],
  team_members: [],
  earnings: [],
  commission_records: [],
  service_products: [],
}

const money = value => `${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})} ETB`

const dateLabel = value => {
  if (!value) return 'Date unavailable'
  const normalized = typeof value === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString()
}

const getStoredAccount = () => {
  try {
    const raw = localStorage.getItem('userData')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function AgentPortal() {
  const token = localStorage.getItem('authToken')
  const account = getStoredAccount()
  const isAgent = Boolean(token && !token.startsWith('guest-') && String(account?.role || '').toLowerCase() === 'agent')
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboard, setDashboard] = useState(emptyDashboard)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [search, setSearch] = useState('')
  const [productStatuses, setProductStatuses] = useState({})
  const [serviceProductCategory, setServiceProductCategory] = useState('movable-services')
  const [showProductModal, setShowProductModal] = useState(false)
  const [productModalError, setProductModalError] = useState('')
  const [showServiceProductModal, setShowServiceProductModal] = useState(false)
  const [showCommissionModal, setShowCommissionModal] = useState(false)
  const [commissionType, setCommissionType] = useState('fixed')
  const [commissionForm, setCommissionForm] = useState({
    clientName: '', clientPhone: '', assetDescription: '', location: '',
    amount: '', commissionRate: '', commissionAmount: '', status: 'pending', notes: '',
  })
  const [commissionModalError, setCommissionModalError] = useState('')
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState('')
  const [teamActivity, setTeamActivity] = useState(null)
  const [teamActivityLoading, setTeamActivityLoading] = useState(false)
  const [teamActivityError, setTeamActivityError] = useState('')
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [teamWalletForm, setTeamWalletForm] = useState({
    type: 'deposit', amount: '', paymentMethod: '', paymentReference: '',
    payoutDetails: '', receiptImage: '',
  })
  const [productForm, setProductForm] = useState({ title: '', description: '', price: '', status: 'selling' })
  const [packageForm, setPackageForm] = useState({ amount: '', note: '' })
  const [childForm, setChildForm] = useState({
    role: 'agent',
    username: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
  })

  const loadDashboard = useCallback(async () => {
    setError('')
    try {
      const response = await agentAPI.getDashboard()
      setDashboard({ ...emptyDashboard, ...response.data })
    } catch (loadError) {
      setError(loadError.message || 'Could not load your agent dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAgent) loadDashboard()
  }, [isAgent, loadDashboard])

  useEffect(() => {
    if (!isAgent) return undefined
    let active = true
    let refreshing = false
    let loggedRefreshError = false
    const refreshStatuses = async () => {
      if (!active || refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        const response = await agentAPI.getDashboardStatus()
        if (!response.success || !response.data) {
          throw new Error(response.message || 'The agent status response was invalid.')
        }
        loggedRefreshError = false
        const updated = response.data
        setDashboard(current => ({
          ...current,
          summary: { ...current.summary, ...updated.summary },
          products: current.products.map(product => ({
            ...product,
            ...(updated.products.find(item => item.id === product.id) || {}),
          })),
          service_products: current.service_products.map(product => ({
            ...product,
            ...(updated.service_products.find(item => item.id === product.id) || {}),
          })),
          wallet_requests: current.wallet_requests.map(request => ({
            ...request,
            ...(updated.wallet_requests.find(item => item.id === request.id) || {}),
          })),
          package_requests: current.package_requests.map(request => ({
            ...request,
            ...(updated.package_requests.find(item => item.id === request.id) || {}),
          })),
        }))
      } catch (refreshError) {
        if (active && !loggedRefreshError) {
          console.error('Could not refresh agent portal statuses:', refreshError)
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
  }, [isAgent])

  useEffect(() => {
    if (!isAgent) return undefined
    const previousTitle = document.title
    let robots = document.querySelector('meta[name="robots"]')
    const createdRobots = !robots
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    const previousRobots = robots.getAttribute('content')
    robots.setAttribute('content', 'noindex, nofollow, noarchive')
    document.title = 'Agent Portal | REDSEA'
    return () => {
      document.title = previousTitle
      if (createdRobots) robots.remove()
      else if (previousRobots == null) robots.removeAttribute('content')
      else robots.setAttribute('content', previousRobots)
    }
  }, [isAgent])

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return dashboard.products
    return dashboard.products.filter(product =>
      [product.title, product.description, product.status, product.approval_status]
        .some(value => String(value || '').toLowerCase().includes(query)))
  }, [dashboard.products, search])

  const filteredWalletRequests = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return dashboard.wallet_requests
    return dashboard.wallet_requests.filter(request =>
      [request.type, request.status, request.user_id, request.user_name, request.user_username, request.payment_method, request.payment_reference, request.amount]
        .some(value => String(value || '').toLowerCase().includes(query)))
  }, [dashboard.wallet_requests, search])

  const filteredPackageRequests = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return dashboard.package_requests
    return dashboard.package_requests.filter(request =>
      [request.note, request.status, request.amount]
        .some(value => String(value || '').toLowerCase().includes(query)))
  }, [dashboard.package_requests, search])

  const filteredTeamMembers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return dashboard.team_members
    return dashboard.team_members.filter(member =>
      [member.full_name, member.username, member.email, member.phone, member.role, member.is_active ? 'active' : 'inactive']
        .some(value => String(value || '').toLowerCase().includes(query)))
  }, [dashboard.team_members, search])

  const filteredChildAgents = useMemo(
    () => filteredTeamMembers.filter(member => String(member.role).toLowerCase() === 'agent'),
    [filteredTeamMembers],
  )

  const filteredCustomerAccounts = useMemo(
    () => filteredTeamMembers.filter(member => String(member.role).toLowerCase() === 'user'),
    [filteredTeamMembers],
  )

  const filteredEarnings = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return dashboard.earnings
    return dashboard.earnings.filter(earning =>
      [earning.source, earning.description, earning.amount]
        .some(value => String(value || '').toLowerCase().includes(query)))
  }, [dashboard.earnings, search])

  const filteredCommissionRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return dashboard.commission_records
    return dashboard.commission_records.filter(record =>
      [record.type, record.client_name, record.client_phone, record.asset_description, record.location, record.status, record.notes]
        .some(value => String(value || '').toLowerCase().includes(query)))
  }, [dashboard.commission_records, search])

  const loadTeamActivity = async memberId => {
    setSelectedTeamMemberId(memberId)
    setTeamActivity(null)
    setTeamActivityError('')
    setTeamActivityLoading(true)
    try {
      const response = await agentAPI.getTeamMemberActivity(memberId)
      setTeamActivity(response.data)
    } catch (loadError) {
      setTeamActivityError(loadError.message || 'Could not load this customer’s wallet activity.')
    } finally {
      setTeamActivityLoading(false)
    }
  }

  const viewWalletRequestReceipt = async request => {
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

  const updateCommissionField = (field, value) => {
    setCommissionForm(current => {
      const updated = { ...current, [field]: value }
      if (field === 'amount' || field === 'commissionRate') {
        const amount = Number(field === 'amount' ? value : updated.amount)
        const rate = Number(field === 'commissionRate' ? value : updated.commissionRate)
        updated.commissionAmount = Number.isFinite(amount * rate / 100) ? (amount * rate / 100).toFixed(2) : ''
      }
      return updated
    })
  }

  const readReceiptImage = file => new Promise((resolve, reject) => {
    if (!file?.type.match(/^image\/(?:png|jpeg|webp)$/)) {
      reject(new Error('Choose a PNG, JPEG, or WebP receipt image.'))
      return
    }
    if (file.size > 5_000_000) {
      reject(new Error('Receipt images must be 5 MB or smaller.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the receipt image.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })

  const saveServiceProduct = async product => {
    setError('')
    setNotice('')
    try {
      await marketplaceAPI.createProduct(serviceProductCategory, {
        ...product,
        ownerName: product.ownerName || dashboard.agent.full_name || dashboard.agent.username,
      })
      setShowServiceProductModal(false)
      setNotice(product.digitalProduct
        ? 'Digital product submitted for Root approval. It will be published after approval.'
        : 'Service product submitted for Root approval. It will be published after approval.')
      await loadDashboard()
    } catch (saveError) {
      throw new Error(saveError.message || 'Could not post this service product.')
    }
  }

  const saveAgentProduct = async event => {
    event.preventDefault()
    setBusyAction('create-product')
    setProductModalError('')
    setError('')
    setNotice('')
    try {
      await agentAPI.createProduct({ ...productForm, price: Number(productForm.price) })
      setProductForm({ title: '', description: '', price: '', status: 'selling' })
      setShowProductModal(false)
      setNotice('Product submitted for review.')
      await loadDashboard()
    } catch (saveError) {
      setProductModalError(saveError.message || 'Could not submit this product.')
    } finally {
      setBusyAction('')
    }
  }

  const saveCommissionRecord = async event => {
    event.preventDefault()
    setBusyAction('commission-record')
    setCommissionModalError('')
    setError('')
    setNotice('')
    try {
      await agentAPI.createCommissionRecord({
        ...commissionForm,
        type: commissionType,
        amount: Number(commissionForm.amount),
        commissionRate: Number(commissionForm.commissionRate),
        commissionAmount: Number(commissionForm.commissionAmount),
      })
      setNotice('Commission record saved.')
      setShowCommissionModal(false)
      setCommissionForm({ clientName: '', clientPhone: '', assetDescription: '', location: '', amount: '', commissionRate: '', commissionAmount: '', status: 'pending', notes: '' })
      await loadDashboard()
    } catch (saveError) {
      setCommissionModalError(saveError.message || 'Could not save the commission record.')
    } finally {
      setBusyAction('')
    }
  }

  const runAction = async (event, key, action, successMessage, onSuccess) => {
    event?.preventDefault()
    setBusyAction(key)
    setError('')
    setNotice('')
    try {
      await action()
      await onSuccess?.()
      setNotice(successMessage)
      await loadDashboard()
    } catch (actionError) {
      setError(actionError.message || 'The requested action could not be completed.')
    } finally {
      setBusyAction('')
    }
  }

  if (!isAgent) return <Navigate to={token ? '/' : '/login'} replace />

  const summary = dashboard.summary || {}

  return (
    <div className="agent-portal">
      <header className="agent-heading">
        <p className="agent-kicker">AGENT PORTAL</p>
        <h1>Welcome{dashboard.agent.full_name ? `, ${dashboard.agent.full_name}` : ''}</h1>
        <p>Manage your agent account, products, wallet requests, and team.</p>
        <div className="agent-toolbar">
          <label>
            <span className="agent-visually-hidden">Search portal records</span>
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search products, requests, team, and earnings"
            />
          </label>
          <button type="button" onClick={loadDashboard} disabled={loading || Boolean(busyAction)}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="agent-tabs" role="tablist" aria-label="Agent portal sections">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`agent-tab-${tab.id}`}
            aria-controls={`agent-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="agent-alert error" role="alert">{error}</p>}
      {notice && <p className="agent-alert success" role="status">{notice}</p>}

      {loading ? (
        <section className="agent-panel" aria-busy="true"><p>Loading your agent account…</p></section>
      ) : (
        <>
          {activeTab === 'overview' && (
            <section id="agent-panel-overview" role="tabpanel" aria-labelledby="agent-tab-overview">
              <div className="agent-balance-grid" aria-label="Agent account summary">
                <article><span>Package balance</span><strong>{money(dashboard.package_balance)}</strong><small>Available agent package funds</small></article>
                <article><span>Products</span><strong>{Number(summary.product_count || 0).toLocaleString()}</strong><small>{Number(summary.pending_products || 0)} awaiting review</small></article>
                <article><span>Pending wallet requests</span><strong>{Number(summary.pending_wallet_requests || 0).toLocaleString()}</strong><small>Requests assigned to your account</small></article>
                <article><span>Pending funding requests</span><strong>{Number(summary.pending_package_requests || 0).toLocaleString()}</strong><small>Package balance requests</small></article>
                <article><span>Team accounts</span><strong>{Number(summary.team_member_count || 0).toLocaleString()}</strong><small>{Number(summary.active_team_member_count || 0)} active · {Number(summary.online_team_member_count || 0)} online</small></article>
                <article><span>Total earned</span><strong>{money(summary.total_earned)}</strong><small>Posted sale earnings and wallet rewards</small></article>
                <article><span>Completed commission records</span><strong>{money(summary.completed_commission_amount)}</strong><small>{Number(summary.completed_commission_count || 0)} recorded · not a wallet credit</small></article>
              </div>
              <div className="agent-dashboard-grid">
                <section className="agent-panel">
                  <h2>Recent wallet requests</h2>
                  <RequestList requests={filteredWalletRequests.slice(0, 5)} />
                  <button type="button" onClick={() => setActiveTab('payouts')}>View all wallet requests</button>
                </section>
                <section className="agent-panel">
                  <h2>Agent account</h2>
                  <dl className="agent-account-details">
                    <div><dt>Name</dt><dd>{dashboard.agent.full_name || '—'}</dd></div>
                    <div><dt>Username</dt><dd>{dashboard.agent.username ? `@${dashboard.agent.username}` : '—'}</dd></div>
                    <div><dt>Service charge</dt><dd>{Number(dashboard.settings.service_charge_percent || 0)}%</dd></div>
                    <div><dt>Agent reward</dt><dd>{Number(dashboard.settings.reward_percent || 0)}%</dd></div>
                  </dl>
                  {dashboard.settings.payment_details && (
                    <p className="agent-payment-details"><strong>Payment details</strong><br />{dashboard.settings.payment_details}</p>
                  )}
                  <button type="button" onClick={() => setActiveTab('team')}>Manage team & funding</button>
                </section>
              </div>
            </section>
          )}

          {activeTab === 'performance' && (
            <section id="agent-panel-performance" className="agent-panel" role="tabpanel" aria-labelledby="agent-tab-performance">
              <h2>Activity and earnings</h2>
              <p>Activity counts come from recorded account, wallet, and product actions. Earnings include posted service-product sales, sale commissions, and wallet-request rewards.</p>
              <div className="agent-balance-grid compact" aria-label="Agent activity">
                <article><span>All products</span><strong>{Number(summary.product_count || 0).toLocaleString()}</strong><small>Submitted by your account</small></article>
                <article><span>Pending product reviews</span><strong>{Number(summary.pending_products || 0).toLocaleString()}</strong><small>Awaiting root approval</small></article>
                <article><span>Wallet requests</span><strong>{dashboard.wallet_requests.length.toLocaleString()}</strong><small>{Number(summary.pending_wallet_requests || 0)} pending</small></article>
                <article><span>Package requests</span><strong>{dashboard.package_requests.length.toLocaleString()}</strong><small>{Number(summary.pending_package_requests || 0)} pending</small></article>
                <article><span>Sale commissions</span><strong>{money(summary.sale_commission_earned)}</strong><small>Approved referred sales credited to your wallet</small></article>
                <article><span>Service product sales</span><strong>{money(summary.service_product_sales_earned)}</strong><small>Approved sales credited to your wallet</small></article>
                <article><span>Wallet request rewards</span><strong>{money(summary.wallet_request_rewards_earned)}</strong><small>Rewards recorded for approved requests</small></article>
                <article><span>Total earned</span><strong>{money(summary.total_earned)}</strong><small>Recorded agent earnings</small></article>
                <article><span>Completed commission records</span><strong>{money(summary.completed_commission_amount)}</strong><small>{Number(summary.completed_commission_count || 0)} completed · not a wallet credit</small></article>
                <article><span>Team accounts</span><strong>{Number(summary.team_member_count || 0).toLocaleString()}</strong><small>{Number(summary.active_team_member_count || 0)} active · {Number(summary.online_team_member_count || 0)} online</small></article>
              </div>
              <h3 className="agent-subheading">Earnings history</h3>
              {filteredEarnings.length ? (
                <div className="agent-record-list">
                  {filteredEarnings.map(earning => (
                    <article key={earning.id}>
                      <span><strong>{earning.source} · {money(earning.amount)}</strong><small>{earning.description} · {dateLabel(earning.created_at)}</small></span>
                    </article>
                  ))}
                </div>
              ) : <p className="agent-empty">{search ? 'No earnings match your search.' : 'No earnings have been recorded yet.'}</p>}
              <button type="button" disabled={Boolean(busyAction)} onClick={() => { setCommissionModalError(''); setShowCommissionModal(true) }}>
                Add fixed / movable commission
              </button>
            </section>
          )}

          {activeTab === 'products' && (
            <section id="agent-panel-products" className="agent-panel" role="tabpanel" aria-labelledby="agent-tab-products">
              <h2>Your agent products</h2>
              <p>Submit product and digital-product listings for Root approval. Approved catalog items are then published publicly.</p>
              <div className="agent-product-entry-actions">
                <label>Digital product service page
                  <select value={serviceProductCategory} onChange={event => setServiceProductCategory(event.target.value)}>
                    {SERVICE_CATEGORIES.map(category => <option key={category.key} value={category.key}>{category.label}</option>)}
                  </select>
                </label>
                <button type="button" disabled={Boolean(busyAction)} onClick={() => { setProductModalError(''); setShowProductModal(true) }}>Add Product</button>
                <button type="button" disabled={Boolean(busyAction)} onClick={() => setShowServiceProductModal(true)}>Add Digital Product</button>
              </div>
              <h3 className="agent-subheading">Submitted products</h3>
              {filteredProducts.length ? (
                <div className="agent-product-list">
                  {filteredProducts.map(product => {
                    const status = productStatuses[product.id] || product.status
                    return (
                      <article key={product.id}>
                        <div>
                          <h3>{product.title}</h3>
                          <p>{product.description || 'No description provided.'}</p>
                          <small>{money(product.price)} · {dateLabel(product.updated_at || product.created_at)}</small>
                          <small>Review: <span className={`agent-status ${product.approval_status}`}>{product.approval_status}</span></small>
                        </div>
                        <div className="agent-product-controls">
                          <label>Listing status
                            <select value={status} onChange={event => setProductStatuses({ ...productStatuses, [product.id]: event.target.value })}>
                              {['selling', 'buying', 'sold', 'bought'].map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                          <button type="button" disabled={Boolean(busyAction) || status === product.status} onClick={event => runAction(
                            event,
                            `product-${product.id}`,
                            () => agentAPI.updateProduct(product.id, status),
                            'Product status updated.',
                          )}>
                            {busyAction === `product-${product.id}` ? 'Saving…' : 'Save status'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : <p className="agent-empty">{search ? 'No products match your search.' : 'You have not submitted any products yet.'}</p>}
              <h3 className="agent-subheading">Posted service and digital products</h3>
              {dashboard.service_products.length ? (
                <div className="agent-product-list">
                  {dashboard.service_products.map(product => (
                    <article key={product.id}>
                      <div>
                        <h3>{product.title || product.name}</h3>
                        <p>{SERVICE_CATEGORIES.find(category => category.key === product.serviceKey)?.label || product.serviceKey}{product.digitalProduct ? ' · Digital download' : ''}</p>
                        <small>{money(product.price)} · {dateLabel(product.updatedAt)}</small>
                        <small>Review: <span className={`agent-status ${product.approvalStatus || 'approved'}`}>{product.approvalStatus || 'approved'}</span></small>
                        {product.published && <small>Published to public service catalog</small>}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="agent-empty">No service-catalog products posted yet.</p>}
              <h3 className="agent-subheading">Commission record history</h3>
              {filteredCommissionRecords.length ? (
                <div className="agent-record-list">
                  {filteredCommissionRecords.map(record => (
                    <article key={record.id}>
                      <span>
                        <strong>{record.type === 'fixed' ? 'Fixed' : 'Movable'} commission · {money(record.commission_amount)}</strong>
                        <small>{record.client_name} · {record.asset_description}{record.location ? ` · ${record.location}` : ''} · {dateLabel(record.created_at)}</small>
                        <small>{money(record.amount)} deal value · {Number(record.commission_rate || 0)}% · {record.status}{record.notes ? ` · ${record.notes}` : ''}</small>
                      </span>
                    </article>
                  ))}
                </div>
              ) : <p className="agent-empty">{search ? 'No commission records match your search.' : 'No commission records have been added yet.'}</p>}
            </section>
          )}

          {activeTab === 'payouts' && (
            <section id="agent-panel-payouts" className="agent-panel" role="tabpanel" aria-labelledby="agent-tab-payouts">
              <h2>Wallet requests assigned to you</h2>
              <p>Review customer requests. Approving a request applies the configured wallet and agent-package ledger entries.</p>
              <RequestList
                requests={filteredWalletRequests}
                onViewReceipt={viewWalletRequestReceipt}
                onReview={(requestId, status) => runAction(
                  null,
                  `request-${requestId}`,
                  () => agentAPI.reviewWalletRequest(requestId, status),
                  `Wallet request ${status}.`,
                )}
                busyAction={busyAction}
              />
              <h3 className="agent-subheading">Package funding request history</h3>
              {filteredPackageRequests.length ? (
                <div className="agent-record-list">
                  {filteredPackageRequests.map(request => (
                    <article key={request.id}>
                      <span><strong>{money(request.amount)}</strong><small>{request.note || 'No note'} · {dateLabel(request.created_at)}</small></span>
                      <small className={`agent-status ${request.status}`}>{request.status}</small>
                    </article>
                  ))}
                </div>
              ) : <p className="agent-empty">{search ? 'No funding requests match your search.' : 'No package funding requests yet.'}</p>}
            </section>
          )}

          {activeTab === 'wallet' && (
            <section id="agent-panel-wallet" role="tabpanel" aria-labelledby="agent-tab-wallet">
              <Wallet compact />
            </section>
          )}

          {activeTab === 'team' && (
            <section id="agent-panel-team" className="agent-dashboard-grid" role="tabpanel" aria-labelledby="agent-tab-team">
              <div>
                <section className="agent-panel">
                  <h2>Request package funds</h2>
                  <p>Send a funding request to Root. Your package balance updates after the request is approved.</p>
                  <form className="agent-form-grid" onSubmit={event => runAction(
                    event,
                    'package-funds',
                    () => agentAPI.requestPackageFunds({ amount: Number(packageForm.amount), note: packageForm.note }),
                    'Package funding request submitted.',
                    () => setPackageForm({ amount: '', note: '' }),
                  )}>
                    <label>Amount (ETB)
                      <input required type="number" min="0.01" step="0.01" value={packageForm.amount} onChange={event => setPackageForm({ ...packageForm, amount: event.target.value })} />
                    </label>
                    <label className="agent-wide-field">Note
                      <textarea maxLength={1000} value={packageForm.note} onChange={event => setPackageForm({ ...packageForm, note: event.target.value })} />
                    </label>
                    <button type="submit" disabled={Boolean(busyAction)}>{busyAction === 'package-funds' ? 'Sending…' : 'Request funds'}</button>
                  </form>
                </section>
                <section className="agent-panel">
                  <h2>Add a team account</h2>
                  <p>Create an ordinary customer account or a child agent account owned by your agent account.</p>
                  <form className="agent-form-grid" onSubmit={event => runAction(
                    event,
                    'child-account',
                    () => agentAPI.createChildAccount(childForm),
                    `${childForm.role === 'agent' ? 'Child agent' : 'Customer'} account created.`,
                    () => setChildForm({ role: 'agent', username: '', fullName: '', email: '', phone: '', password: '' }),
                  )}>
                    <label>Account type
                      <select value={childForm.role} onChange={event => setChildForm({ ...childForm, role: event.target.value })}>
                        <option value="agent">Child agent</option>
                        <option value="user">Customer account</option>
                      </select>
                    </label>
                    <label>Username
                      <input required minLength={3} maxLength={50} pattern="[A-Za-z0-9_.-]+" value={childForm.username} onChange={event => setChildForm({ ...childForm, username: event.target.value })} />
                    </label>
                    <label>Full name
                      <input required maxLength={100} value={childForm.fullName} onChange={event => setChildForm({ ...childForm, fullName: event.target.value })} />
                    </label>
                    <label>Email
                      <input type="email" maxLength={100} value={childForm.email} onChange={event => setChildForm({ ...childForm, email: event.target.value })} />
                    </label>
                    <label>Phone
                      <input type="tel" maxLength={30} value={childForm.phone} onChange={event => setChildForm({ ...childForm, phone: event.target.value })} />
                    </label>
                    <label className="agent-wide-field">Initial password
                      <input required type="password" minLength={8} autoComplete="new-password" value={childForm.password} onChange={event => setChildForm({ ...childForm, password: event.target.value })} />
                    </label>
                    <button type="submit" disabled={Boolean(busyAction)}>{busyAction === 'child-account' ? 'Creating…' : `Create ${childForm.role === 'agent' ? 'child agent' : 'customer'}`}</button>
                  </form>
                </section>
              </div>
              <section className="agent-panel">
                <h2>Accounts created by you</h2>
                <p>{Number(summary.team_member_count || 0)} accounts created by you · {Number(summary.active_team_member_count || 0)} active · {Number(summary.online_team_member_count || 0)} online</p>
                <h3 className="agent-subheading">Child agent accounts ({filteredChildAgents.length})</h3>
                {filteredChildAgents.length ? (
                  <div className="agent-team-list">
                    {filteredChildAgents.map(member => (
                      <article key={member.id}>
                        <div className="agent-team-identity">
                          <strong>{member.full_name || member.username}</strong>
                          <span>@{member.username} · {member.role}</span>
                          {member.email && <span>{member.email}</span>}
                          {member.phone && <span>{member.phone}</span>}
                        </div>
                        <div className="agent-team-activity">
                          <span className={`agent-status ${member.is_active ? 'active' : 'inactive'}`}>{member.is_active ? 'Active' : 'Inactive'}</span>
                          <span className={`agent-status ${member.is_online ? 'approved' : ''}`}>{member.is_online ? 'Online' : 'Offline'}</span>
                          <small>{Number(member.activity_count || 0).toLocaleString()} recorded actions</small>
                          <small>Real wallet balance: {money(member.real_balance)}</small>
                          <small>Earnings from created account: {money(member.total_earned)}</small>
                          <small>Last login: {dateLabel(member.last_login)}</small>
                          <small>Last activity: {dateLabel(member.last_activity_at)}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <p className="agent-empty">{search ? 'No child agent accounts match your search.' : 'You have not created any child agent accounts yet.'}</p>}
                <h3 className="agent-subheading">Customer accounts ({filteredCustomerAccounts.length})</h3>
                {filteredCustomerAccounts.length ? (
                  <div className="agent-team-list">
                    {filteredCustomerAccounts.map(member => (
                      <article key={member.id}>
                        <div className="agent-team-identity">
                          <strong>{member.full_name || member.username}</strong>
                          <span>@{member.username} · Customer</span>
                          {member.email && <span>{member.email}</span>}
                          {member.phone && <span>{member.phone}</span>}
                        </div>
                        <div className="agent-team-activity">
                          <span className={`agent-status ${member.is_active ? 'active' : 'inactive'}`}>{member.is_active ? 'Active' : 'Inactive'}</span>
                          <span className={`agent-status ${member.is_online ? 'approved' : ''}`}>{member.is_online ? 'Online' : 'Offline'}</span>
                          <small>{Number(member.activity_count || 0).toLocaleString()} recorded actions</small>
                          <small>Real wallet balance: {money(member.real_balance)}</small>
                          <small>Earnings from created account: {money(member.total_earned)}</small>
                          <small>Last login: {dateLabel(member.last_login)}</small>
                          <small>Last activity: {dateLabel(member.last_activity_at)}</small>
                          <button type="button" onClick={() => loadTeamActivity(member.id)}>
                            {selectedTeamMemberId === member.id ? 'Refresh wallet & activity' : 'Open wallet & activity'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <p className="agent-empty">{search ? 'No customer accounts match your search.' : 'You have not created any customer accounts yet.'}</p>}
                {selectedTeamMemberId && (
                  <div className="agent-customer-wallet">
                    <h3 className="agent-subheading">Customer wallet by agent</h3>
                    {teamActivityLoading && <p className="agent-empty">Loading customer wallet and transaction history…</p>}
                    {teamActivityError && <p className="agent-alert error" role="alert">{teamActivityError}</p>}
                    {teamActivity && (
                      <>
                        <p>
                          {teamActivity.member.full_name || teamActivity.member.username} ·
                          {' '}{teamActivity.member.is_active ? 'Active' : 'Inactive'} ·
                          {' '}{teamActivity.member.is_online ? 'Online' : 'Offline'} ·
                          {' '}Real wallet balance: {money(teamActivity.member.real_balance)}
                        </p>
                        <form className="agent-form-grid" onSubmit={event => runAction(
                          event,
                          `customer-wallet-${selectedTeamMemberId}`,
                          () => {
                            const { receiptImage, ...requestForm } = teamWalletForm
                            return agentAPI.createWalletRequest({
                              ...requestForm,
                              ...(teamWalletForm.type === 'deposit' ? { receiptImage } : {}),
                              agentId: dashboard.agent.id,
                              customerUserId: selectedTeamMemberId,
                              amount: Number(teamWalletForm.amount),
                            })
                          },
                          `${teamWalletForm.type === 'deposit' ? 'Deposit' : 'Withdrawal'} request submitted for agent review.`,
                          async () => {
                            setTeamWalletForm({ type: 'deposit', amount: '', paymentMethod: '', paymentReference: '', payoutDetails: '', receiptImage: '' })
                            await loadTeamActivity(selectedTeamMemberId)
                          },
                        )}>
                          <label>Transaction type
                            <select value={teamWalletForm.type} onChange={event => {
                              const type = event.target.value
                              setTeamWalletForm(current => ({
                                ...current,
                                type,
                                ...(type === 'withdrawal' ? { receiptImage: '' } : {}),
                              }))
                            }}>
                              <option value="deposit">Deposit request</option>
                              <option value="withdrawal">Withdrawal request</option>
                            </select>
                          </label>
                          <label>Amount (ETB)
                            <input required type="number" min="0.01" step="0.01" value={teamWalletForm.amount} onChange={event => setTeamWalletForm({ ...teamWalletForm, amount: event.target.value })} />
                          </label>
                          <label>Payment method
                            <input required maxLength={80} value={teamWalletForm.paymentMethod} onChange={event => setTeamWalletForm({ ...teamWalletForm, paymentMethod: event.target.value })} />
                          </label>
                          <label>Payment transaction reference
                            <input required maxLength={250} value={teamWalletForm.paymentReference} onChange={event => setTeamWalletForm({ ...teamWalletForm, paymentReference: event.target.value })} />
                          </label>
                          {teamWalletForm.type === 'withdrawal' && (
                            <label className="agent-wide-field">Customer payout details
                              <textarea required maxLength={500} value={teamWalletForm.payoutDetails} onChange={event => setTeamWalletForm({ ...teamWalletForm, payoutDetails: event.target.value })} />
                            </label>
                          )}
                          {teamWalletForm.type === 'deposit' && (
                            <label className="agent-wide-field">Payment receipt (PNG, JPEG, or WebP; max 5 MB)
                              <input required type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
                                try {
                                  const receiptImage = await readReceiptImage(event.target.files?.[0])
                                  setTeamWalletForm(current => ({ ...current, receiptImage }))
                                  setTeamActivityError('')
                                } catch (receiptError) {
                                  setTeamActivityError(receiptError.message)
                                  event.target.value = ''
                                }
                              }} />
                            </label>
                          )}
                          <button type="submit" disabled={Boolean(busyAction) || (teamWalletForm.type === 'deposit' && !teamWalletForm.receiptImage)}>
                            {busyAction === `customer-wallet-${selectedTeamMemberId}` ? 'Submitting…' : 'Submit customer wallet request'}
                          </button>
                        </form>
                        <h4>Customer transaction history</h4>
                        {teamActivity.activity.length ? (
                          <div className="agent-record-list">
                            {teamActivity.activity.map(transaction => (
                              <article key={`${transaction.type}-${transaction.id}`}>
                                <span>
                                  <strong>{String(transaction.type).replace(/_/g, ' ')} · {money(transaction.amount)}</strong>
                                  <small>{transaction.status} · {transaction.description || 'No details'} · {dateLabel(transaction.created_at)}</small>
                                  {transaction.receipt_available && (
                                    <button type="button" className="secondary" onClick={() => viewWalletRequestReceipt({ id: transaction.id, type: 'deposit' })}>View receipt</button>
                                  )}
                                </span>
                              </article>
                            ))}
                          </div>
                        ) : <p className="agent-empty">No wallet transactions recorded for this customer.</p>}
                      </>
                    )}
                  </div>
                )}
              </section>
              <section className="agent-panel">
                <h2>Package balance</h2>
                <p className="agent-package-balance">{money(dashboard.package_balance)}</p>
                <p>Package balance is used to fund approved agent withdrawal requests.</p>
                <h3 className="agent-subheading">Funding requests</h3>
                {filteredPackageRequests.length ? (
                  <div className="agent-record-list">
                    {filteredPackageRequests.map(request => (
                      <article key={request.id}>
                        <span><strong>{money(request.amount)}</strong><small>{request.note || 'No note'} · {dateLabel(request.created_at)}</small></span>
                        <small className={`agent-status ${request.status}`}>{request.status}</small>
                      </article>
                    ))}
                  </div>
                ) : <p className="agent-empty">No funding requests yet.</p>}
              </section>
            </section>
          )}
        </>
      )}

      {showProductModal && (
        <div className="service-product-modal-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget) setShowProductModal(false)
        }}>
          <section className="service-product-modal" role="dialog" aria-modal="true" aria-labelledby="agent-product-title">
            <header className="service-product-modal-header">
              <div>
                <span className="service-product-modal-kicker">AGENT PRODUCT</span>
                <h2 id="agent-product-title">Add Product</h2>
              </div>
              <button type="button" className="service-product-modal-close" aria-label="Close" onClick={() => setShowProductModal(false)}>×</button>
            </header>
            {productModalError && <p className="service-product-modal-error" role="alert">{productModalError}</p>}
            <form onSubmit={saveAgentProduct}>
              <div className="service-product-form-fields agent-product-form-fields">
                <label>Product title
                  <input required maxLength={200} value={productForm.title} onChange={event => setProductForm({ ...productForm, title: event.target.value })} />
                </label>
                <label>Price (ETB)
                  <input required type="number" min="0.01" step="0.01" value={productForm.price} onChange={event => setProductForm({ ...productForm, price: event.target.value })} />
                </label>
                <label>Listing type
                  <select value={productForm.status} onChange={event => setProductForm({ ...productForm, status: event.target.value })}>
                    <option value="selling">Selling</option><option value="buying">Buying</option>
                  </select>
                </label>
                <label>Description
                  <textarea maxLength={5000} value={productForm.description} onChange={event => setProductForm({ ...productForm, description: event.target.value })} />
                </label>
              </div>
              <div className="service-product-modal-actions">
                <button type="button" className="service-product-cancel" disabled={Boolean(busyAction)} onClick={() => setShowProductModal(false)}>Cancel</button>
                <button type="submit" className="service-product-submit" disabled={Boolean(busyAction)}>{busyAction === 'create-product' ? 'Submitting…' : 'Add Product'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showServiceProductModal && (
        <ServiceProductAdderModal
          initialDigitalProduct
          initialValues={{ ownerName: dashboard.agent.full_name || dashboard.agent.username || '', category: 'Digital file' }}
          onClose={() => setShowServiceProductModal(false)}
          onSave={saveServiceProduct}
        />
      )}

      {showCommissionModal && (
        <div className="agent-modal-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget) setShowCommissionModal(false)
        }}>
          <section className="agent-commission-modal" role="dialog" aria-modal="true" aria-labelledby="agent-commission-title">
            <header>
              <div>
                <p className="agent-kicker">AGENT COMMISSION</p>
                <h2 id="agent-commission-title">Add commission record</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setShowCommissionModal(false)}>×</button>
            </header>
            <div className="agent-commission-type" role="group" aria-label="Commission type">
              <button type="button" className={commissionType === 'fixed' ? 'active' : ''} onClick={() => setCommissionType('fixed')}>Fixed commission</button>
              <button type="button" className={commissionType === 'movable' ? 'active' : ''} onClick={() => setCommissionType('movable')}>Movable commission</button>
            </div>
            <p className="agent-commission-disclaimer">Commission entries are saved as business records. They do not create a wallet payout; posted earnings are shown separately.</p>
            {commissionModalError && <p className="agent-alert error" role="alert">{commissionModalError}</p>}
            <form className="agent-form-grid" onSubmit={saveCommissionRecord}>
              <label>Client name
                <input required maxLength={160} value={commissionForm.clientName} onChange={event => updateCommissionField('clientName', event.target.value)} />
              </label>
              <label>Client phone
                <input maxLength={30} value={commissionForm.clientPhone} onChange={event => updateCommissionField('clientPhone', event.target.value)} />
              </label>
              <label className="agent-wide-field">{commissionType === 'fixed' ? 'Property / contract details' : 'Item / moving route details'}
                <input required maxLength={500} value={commissionForm.assetDescription} onChange={event => updateCommissionField('assetDescription', event.target.value)} />
              </label>
              <label>Address / location
                <input maxLength={300} value={commissionForm.location} onChange={event => updateCommissionField('location', event.target.value)} />
              </label>
              <label>{commissionType === 'fixed' ? 'Property / contract value (ETB)' : 'Movable service value (ETB)'}
                <input required type="number" min="0" step="0.01" value={commissionForm.amount} onChange={event => updateCommissionField('amount', event.target.value)} />
              </label>
              <label>Commission rate (%)
                <input required type="number" min="0" max="100" step="0.01" value={commissionForm.commissionRate} onChange={event => updateCommissionField('commissionRate', event.target.value)} />
              </label>
              <label>Commission amount (ETB)
                <input required type="number" min="0" step="0.01" value={commissionForm.commissionAmount} onChange={event => updateCommissionField('commissionAmount', event.target.value)} />
              </label>
              <label>Status
                <select value={commissionForm.status} onChange={event => updateCommissionField('status', event.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label className="agent-wide-field">Notes
                <textarea maxLength={2000} value={commissionForm.notes} onChange={event => updateCommissionField('notes', event.target.value)} />
              </label>
              <button type="submit" disabled={Boolean(busyAction)}>{busyAction === 'commission-record' ? 'Saving…' : 'Save commission record'}</button>
            </form>
          </section>
        </div>
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
    </div>
  )
}

function RequestList({ requests, onReview, onViewReceipt, busyAction = '' }) {
  if (!requests.length) return <p className="agent-empty">No matching wallet requests.</p>
  return (
    <div className="agent-record-list">
      {requests.map(request => (
        <article key={request.id}>
          <span>
            <strong>{request.type} · {money(request.amount)}</strong>
            <small>{request.user_name || request.user_username || `Account ${request.user_id}`} · {request.payment_method || 'Payment method unavailable'} · {dateLabel(request.created_at)}</small>
            {request.payment_reference && <small>Reference: {request.payment_reference}</small>}
            {request.reviewed_at && <small>Reviewed: {dateLabel(request.reviewed_at)}</small>}
          </span>
          <div className="agent-request-actions">
            <small className={`agent-status ${request.status}`}>{request.status}</small>
            {request.type === 'deposit' && request.receipt_available && (
              <button type="button" className="secondary" onClick={() => onViewReceipt?.(request)}>View receipt</button>
            )}
            {onReview && request.status === 'pending' && (
              <div className="agent-actions">
                <button type="button" disabled={Boolean(busyAction)} onClick={() => onReview(request.id, 'approved')}>Approve</button>
                <button type="button" className="secondary" disabled={Boolean(busyAction)} onClick={() => onReview(request.id, 'rejected')}>Reject</button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

export default AgentPortal
