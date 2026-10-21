import { useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import './PlatformFinanceOverview.css'

const money = value => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatDateTime = value => {
  if (!value) return '—'
  const dateTime = String(value).replace(' ', 'T')
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(dateTime)
  return new Date(hasTimezone ? dateTime : `${dateTime}Z`).toLocaleString()
}

const metrics = [
  ['revenue', 'Service charges collected by platform'],
  ['platformPayouts', 'Rewards & commissions paid to users'],
  ['profit', 'Platform net after rewards & commissions'],
  ['serviceChargeBalance', 'Current platform balance'],
  ['agentBalance', 'Agent wallet balance'],
  ['earnedBalance', 'Agent earned balance'],
  ['agentPackageBalance', 'Agent package balance'],
  ['userBalance', 'User balance'],
  ['totalDeposits', 'Total deposits'],
  ['totalWithdrawals', 'Total withdrawals'],
  ['virtualCoinBalance', 'Virtual coin balance', 'coins'],
  ['giftBalance', 'Gift balance', 'coins'],
  ['totalCoinsGifted', 'Total coins gifted', 'coins'],
]

function PlatformFinanceOverview() {
  const [period, setPeriod] = useState('all')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [coinActivityPage, setCoinActivityPage] = useState(0)
  const [userPage, setUserPage] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const response = await rootAPI.getAgentAnalytics(
          period, search, coinActivityPage, fromDate, toDate, role, selectedUserId, userPage
        )
        if (active) setData(response.data)
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not load platform finance analytics.')
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [period, search, role, selectedUserId, coinActivityPage, userPage, fromDate, toDate])

  const setDateRange = (setter, value) => {
    setter(value)
    setPeriod('custom')
    setCoinActivityPage(0)
    setUserPage(0)
  }

  return (
    <section className="agent-platform-finance" aria-labelledby="platform-finance-heading">
      <div className="agent-platform-finance-heading">
        <div>
          <h3 id="platform-finance-heading">Platform finance overview</h3>
          <p>Service charges go to the platform; user rewards and commissions are paid from the platform. Wallet and platform balances are current; activity totals use the selected period.</p>
        </div>
        <div className="agent-platform-finance-filters">
          <label>Period
            <select value={period} onChange={event => {
              setPeriod(event.target.value)
              setFromDate('')
              setToDate('')
              setCoinActivityPage(0)
              setUserPage(0)
            }}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          <label>Search user
            <input
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setSelectedUserId('')
                setCoinActivityPage(0)
                setUserPage(0)
              }}
              placeholder="Name, username or ID"
            />
          </label>
          <label>Role
            <select value={role} onChange={event => {
              setRole(event.target.value)
              setSelectedUserId('')
              setCoinActivityPage(0)
              setUserPage(0)
            }}>
              <option value="">All roles</option>
              {(data?.roles || []).map(roleOption => (
                <option key={roleOption} value={roleOption}>{roleOption}</option>
              ))}
            </select>
          </label>
          <label>From
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={event => setDateRange(setFromDate, event.target.value)}
            />
          </label>
          <label>To
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={event => setDateRange(setToDate, event.target.value)}
            />
          </label>
        </div>
      </div>
      {error && <p className="agent-platform-finance-error" role="alert">{error}</p>}
      {loading && <p className="agent-platform-finance-muted">Loading financial analysis…</p>}
      {data && (
        <>
          <p className="agent-platform-finance-count">{data.userCount} matching users · {data.agentCount} agents · Amounts in ETB</p>
          <div className="agent-platform-finance-grid">
            {metrics.map(([key, label, unit = 'ETB']) => (
              <article key={key}>
                <span>{label}</span>
                <strong>{money(data[key])} {unit}</strong>
              </article>
            ))}
          </div>
          <section className="agent-operations-overview" aria-labelledby="agent-operations-heading">
            <h4 id="agent-operations-heading">Agent packages &amp; operations</h4>
            <div className="agent-role-finance-list">
              <div><strong>Agents</strong><span>{Number(data.agentCount || 0).toLocaleString()}</span></div>
              <div><strong>Package pool</strong><span>{money(data.package_pool_balance)} ETB</span></div>
              <div><strong>Packages assigned</strong><span>{money(data.agentPackageBalance)} ETB</span></div>
              <div><strong>Pending package requests</strong><span>{Number(data.pending_package_requests || 0).toLocaleString()}</span></div>
              <div><strong>Agent products</strong><span>{Number(data.products || 0).toLocaleString()}</span></div>
              <div><strong>Wallet requests</strong><span>{Number(data.wallet_requests || 0).toLocaleString()}</span></div>
              <div><strong>Agent rewards</strong><span>{money(data.agent_rewards)} ETB</span></div>
            </div>
            <div className="agent-operations-requests">
              <h5>Recent package requests</h5>
              {!data.recent_package_requests?.length ? (
                <p className="agent-platform-finance-muted">No package requests for the selected users.</p>
              ) : (
                <div className="agent-user-finance-table-wrap">
                  <table className="agent-user-finance-table">
                    <thead>
                      <tr><th>Agent</th><th>Amount</th><th>Status</th><th>Requested</th><th>Note</th></tr>
                    </thead>
                    <tbody>
                      {data.recent_package_requests.map(request => (
                        <tr key={request.id}>
                          <td>
                            <strong>{request.agent_name || request.agent_username || 'Agent'}</strong>
                            {request.agent_username && <small>@{request.agent_username}</small>}
                          </td>
                          <td>{money(request.amount)} ETB</td>
                          <td>{request.status}</td>
                          <td>{new Date(`${request.created_at.replace(' ', 'T')}Z`).toLocaleString()}</td>
                          <td>{request.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="agent-operations-requests">
              <h5>Deposit &amp; withdrawal request and approval history</h5>
              {!data.recent_wallet_activity?.length ? (
                <p className="agent-platform-finance-muted">No deposit or withdrawal requests match these filters.</p>
              ) : (
                <div className="agent-user-finance-table-wrap">
                  <table className="agent-user-finance-table agent-wallet-history-table">
                    <thead>
                      <tr>
                        <th>Request</th><th>User / account</th><th>Agent</th><th>Amount</th>
                        <th>Status</th><th>Requested</th><th>Reviewed / approved</th><th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_wallet_activity.map(request => (
                        <tr key={`${request.type}:${request.id}`}>
                          <td>{request.type}</td>
                          <td>
                            <strong>{request.account_name || 'User'}</strong>
                            {request.username && <small>@{request.username}</small>}
                          </td>
                          <td>{request.agent_name || '—'}</td>
                          <td>{money(request.amount)} ETB</td>
                          <td>
                            <span className={`agent-wallet-history-status ${String(request.status).toLowerCase()}`}>
                              {request.status}
                            </span>
                          </td>
                          <td>{formatDateTime(request.created_at)}</td>
                          <td>{formatDateTime(request.reviewed_at)}</td>
                          <td className="agent-wallet-history-details">{request.details || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.recent_wallet_activity?.length > 0 && (
                <p className="agent-platform-finance-muted">Showing up to 100 latest requests matching the selected user, role, and date filters.</p>
              )}
            </div>
          </section>
          <section className="agent-user-finance" aria-labelledby="agent-user-finance-heading">
            <div className="agent-user-finance-heading">
              <div>
                <h4 id="agent-user-finance-heading">User finance analysis</h4>
                <p>Wallet, coin, earnings, deposits and withdrawals by account role.</p>
              </div>
              {selectedUserId && (
                <button type="button" onClick={() => {
                  setSelectedUserId('')
                  setCoinActivityPage(0)
                  setUserPage(0)
                }}>
                  Show all matching users
                </button>
              )}
            </div>
            {data.roleSummary?.length > 0 && (
              <div className="agent-role-finance-list">
                {data.roleSummary.map(item => (
                  <div key={item.role}>
                    <strong>{item.role}</strong>
                    <span>{item.user_count} accounts</span>
                    <span>{money(item.real_balance)} ETB real</span>
                    <span>{money(item.bonus_balance)} ETB bonus</span>
                    <span>{money(item.coin_balance)} coins</span>
                  </div>
                ))}
              </div>
            )}
            <div className="agent-user-finance-table-wrap">
              <table className="agent-user-finance-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Real balance</th>
                    <th>Bonus balance</th>
                    <th>Coin balance</th>
                    <th>Earned</th>
                    <th>Deposits</th>
                    <th>Withdrawals</th>
                    <th>Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.userFinance?.map(user => (
                    <tr key={user.user_id}>
                      <td>
                        <strong>{user.full_name}</strong>
                        <small>@{user.username}</small>
                      </td>
                      <td>{user.role}</td>
                      <td>{money(user.real_balance)} ETB</td>
                      <td>{money(user.bonus_balance)} ETB</td>
                      <td>{money(user.coin_balance)} coins</td>
                      <td>{money(user.earned_balance)} ETB</td>
                      <td>{money(user.total_deposits)} ETB</td>
                      <td>{money(user.total_withdrawals)} ETB</td>
                      <td>
                        <button type="button" onClick={() => {
                          setSelectedUserId(user.user_id)
                          setCoinActivityPage(0)
                          setUserPage(0)
                        }}>
                          View user
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!data.userFinance?.length && (
                    <tr><td colSpan="9" className="agent-platform-finance-muted">No users match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="agent-user-finance-pagination">
              <span>{data.userCount} users · Page {userPage + 1} · 100 users per page</span>
              <div>
                <button type="button" disabled={loading || userPage === 0} onClick={() => setUserPage(page => Math.max(0, page - 1))}>Previous</button>
                <button type="button" disabled={loading || (userPage + 1) * data.userPageSize >= data.userCount} onClick={() => setUserPage(page => page + 1)}>Next</button>
              </div>
            </div>
          </section>
          <section className="agent-coin-activity" aria-labelledby="agent-coin-activity-heading">
            <h4 id="agent-coin-activity-heading">Virtual coin activity</h4>
            <p className="agent-platform-finance-muted">
              Showing coin transactions for all matching roles and users{selectedUserId ? ' (selected user)' : ''}.
            </p>
            {!data.coinActivity?.length ? (
              <p className="agent-platform-finance-muted">No coin activity in this period.</p>
            ) : (
              <div className="agent-coin-activity-list">
                {data.coinActivity.map(item => (
                  <article key={item.entry_id}>
                    <div>
                      <strong>{item.full_name}</strong>
                      {item.username && <small>@{item.username} · {item.role}</small>}
                    </div>
                    <div className="agent-coin-activity-details">
                      <strong className={Number(item.amount) < 0 ? 'debit' : 'credit'}>
                        {Number(item.amount) > 0 ? '+' : ''}{Number(item.amount).toLocaleString()} coins
                      </strong>
                      <small>{item.entry_type.replaceAll('_', ' ')} · {item.description}</small>
                      <small>{new Date(`${item.created_at.replace(' ', 'T')}Z`).toLocaleString()}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="agent-coin-activity-pagination">
              <span>{data.coinActivityCount} entries · Page {coinActivityPage + 1} · 100 entries per page</span>
              <div>
                <button
                  type="button"
                  disabled={loading || coinActivityPage === 0}
                  onClick={() => setCoinActivityPage(page => Math.max(0, page - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={loading || (coinActivityPage + 1) * data.coinActivityPageSize >= data.coinActivityCount}
                  onClick={() => setCoinActivityPage(page => page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
          <p className="agent-platform-finance-note">ETB service charges are platform income; wallet rewards and commissions are platform payouts. Coin rewards and gifts remain on the separate coin ledger. Gift balance is 0 because gift coins are not tracked as a separate spendable balance.</p>
        </>
      )}
    </section>
  )
}

export default PlatformFinanceOverview
