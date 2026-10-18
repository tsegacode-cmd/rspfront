import { useCallback, useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import './LinkCampaignManagement.css'

const DURATION_TIERS = [
  { id: '1-3', label: '1–3 days' },
  { id: '4-7', label: '4–7 days' },
  { id: '8-15', label: '8–15 days' },
  { id: '16-30', label: '16–30 days' },
  { id: '31-60', label: '31–60 days' },
  { id: '61-180', label: '2–6 months' },
  { id: '181-365', label: '6–12 months' },
]

const formatMoney = amount => `ETB ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function LinkCampaignManagement() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await rootAPI.getLinkCampaigns()
      setCampaigns(response.data.campaigns || [])
    } catch (loadError) {
      setError(`Could not load link campaigns: ${loadError.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const reviewCampaign = async (campaign, status) => {
    setReviewingId(campaign.campaign_id)
    setError('')
    setNotice('')
    try {
      await rootAPI.reviewLinkCampaign(campaign.campaign_id, status)
      setNotice(status === 'approved'
        ? `“${campaign.title}” approved, published, and its viewers notified.`
        : campaign.payment_method === 'REDSEA Wallet'
          ? `“${campaign.title}” rejected. ${formatMoney(campaign.payment_amount)} was returned to the creator’s real wallet.`
          : `“${campaign.title}” rejected.`)
      await load()
    } catch (reviewError) {
      setError(`Could not review campaign: ${reviewError.message}`)
    } finally {
      setReviewingId('')
    }
  }

  return (
    <section className="link-campaign-management">
      <header className="link-campaign-heading">
        <div>
          <h2>Link campaign management</h2>
          <p>Review paid submissions and track published campaign views. Set prices and rewards in Promotions → Reward rules.</p>
        </div>
        <button type="button" className="link-campaign-secondary" onClick={load} disabled={loading}>Refresh</button>
      </header>
      {error && <p className="link-campaign-alert error" role="alert">{error}</p>}
      {notice && <p className="link-campaign-alert success" role="status">{notice}</p>}

      <div className="link-campaign-list-heading">
        <h3>Submission review and campaign history</h3>
        <span>{campaigns.filter(campaign => campaign.status === 'pending').length} pending</span>
      </div>
      {loading && !campaigns.length ? <p className="link-campaign-muted">Loading campaigns…</p> : campaigns.length ? (
        <div className="link-campaign-list">
          {campaigns.map(campaign => {
            const tier = DURATION_TIERS.find(item => item.id === campaign.duration_tier)
            return (
              <article className="link-campaign-card" key={campaign.campaign_id}>
                {campaign.images?.[0] && <img className="link-campaign-card-image" src={campaign.images[0]} alt="" />}
                <div className="link-campaign-card-main">
                  <div className="link-campaign-card-title">
                    <div><span className="link-campaign-app-badge">{campaign.app_name}</span><h4>{campaign.title}</h4></div>
                    <span className={`link-campaign-status ${campaign.status}`}>{campaign.status}</span>
                  </div>
                  <p>{campaign.description || 'No description provided.'}</p>
                  <a href={campaign.url} target="_blank" rel="noreferrer">{campaign.url}</a>
                  <small>
                    {campaign.full_name || campaign.username || `Account ${campaign.user_id}`}
                    {' · '}{tier?.label || campaign.duration_tier}
                    {' · '}{formatMoney(campaign.payment_amount)}
                    {' · '}{Number(campaign.qualified_views || 0).toLocaleString()} qualified views
                  </small>
                  <small>{campaign.payment_method === 'REDSEA Wallet'
                    ? `Paid from REDSEA Wallet · ${formatMoney(campaign.payment_amount)} charged on submission`
                    : `Payment: ${campaign.payment_method} · Reference: ${campaign.payment_reference}`}</small>
                  {campaign.payment_proof && <a className="link-campaign-proof" href={campaign.payment_proof} target="_blank" rel="noreferrer">View payment proof</a>}
                  {campaign.expires_at && <small>Expires: {new Date(`${campaign.expires_at}Z`).toLocaleString()}</small>}
                  {campaign.status === 'pending' && (
                    <div className="link-campaign-actions">
                      <button type="button" disabled={Boolean(reviewingId)} onClick={() => reviewCampaign(campaign, 'approved')}>
                        {reviewingId === campaign.campaign_id ? 'Saving…' : 'Approve and publish'}
                      </button>
                      <button type="button" className="link-campaign-reject" disabled={Boolean(reviewingId)} onClick={() => reviewCampaign(campaign, 'rejected')}>Reject</button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : !loading ? <p className="link-campaign-muted">No link campaigns have been submitted yet.</p> : null}
    </section>
  )
}

export default LinkCampaignManagement
