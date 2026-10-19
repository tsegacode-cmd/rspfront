import { useState, useEffect } from 'react'
import './Pages.css'
import './CommissionPages.css'

const PROPERTY_TYPES = ['Apartment','Villa','Office','Warehouse','Shop','Land','Building','Other']
const YEAR_OPTIONS   = Array.from({length:10},(_,i)=>(new Date().getFullYear()-i).toString())

function FixedCommission() {
  const emptyForm = {
    clientName:'', clientPhone:'', propertyType:'', propertyAddress:'',
    propertyValue:'', commissionRate:'', commissionAmount:'',
    paymentDate:'', staffName:'', notes:'', status:'pending'
  }
  const [form,    setForm]    = useState(emptyForm)
  const [records, setRecords] = useState([])
  const [msg,     setMsg]     = useState(null)
  const [error,   setError]   = useState(null)
  const [search,  setSearch]  = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editId,  setEditId]  = useState(null)
  const [showForm, setShowForm] = useState(false)

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fc_records')
    if (saved) setRecords(JSON.parse(saved))
  }, [])

  const save = (list) => {
    setRecords(list)
    localStorage.setItem('fc_records', JSON.stringify(list))
  }

  const handleChange = (f, v) => {
    setForm(p => {
      const next = { ...p, [f]: v }
      if ((f === 'propertyValue' || f === 'commissionRate') && next.propertyValue && next.commissionRate) {
        next.commissionAmount = (parseFloat(next.propertyValue) * parseFloat(next.commissionRate) / 100).toFixed(2)
      }
      return next
    })
    setError(null)
  }

  const handleSubmit = () => {
    if (!form.clientName.trim() || !form.propertyAddress.trim()) { setError('Client name and property address are required'); return }
    if (editId) {
      save(records.map(r => r.id === editId ? { ...form, id: editId } : r))
      setMsg('✅ Record updated!'); setEditId(null)
    } else {
      save([{ ...form, id: Date.now(), createdAt: new Date().toLocaleDateString() }, ...records])
      setMsg('✅ Commission record saved!')
    }
    setForm(emptyForm); setShowForm(false)
    setTimeout(() => setMsg(null), 3000)
  }

  const handleEdit = (r) => { setForm(r); setEditId(r.id); setShowForm(true); window.scrollTo(0,0) }
  const handleDelete = (id) => { if(window.confirm('Delete this record?')) save(records.filter(r=>r.id!==id)) }

  const filtered = records.filter(r => {
    const q = search.toLowerCase()
    const matchQ = !q || [r.clientName,r.propertyAddress,r.propertyType,r.staffName].some(v=>v?.toLowerCase().includes(q))
    const matchS = filterStatus === 'all' || r.status === filterStatus
    return matchQ && matchS
  })

  const totalCommission = filtered.reduce((s,r)=>s+parseFloat(r.commissionAmount||0),0)
  const STATUS_COLORS = { pending:'#f39c12', completed:'#27ae60', cancelled:'#e74c3c' }

  return (
    <div className="cp-page">
      {/* Hero */}
      <div className="cp-hero" style={{background:'linear-gradient(135deg,#f39c12,#e67e22)'}}>
        <div className="cp-hero-inner">
          <div className="cp-hero-icon">💼</div>
          <div>
            <h1>Fixed Commission</h1>
            <p>Manage fixed-rate property commission contracts</p>
          </div>
          <button className="cp-hero-btn" onClick={()=>{setForm(emptyForm);setEditId(null);setShowForm(true)}}>
            ➕ New Entry
          </button>
        </div>
      </div>

      <div className="cp-container">
        {/* Stats */}
        <div className="cp-stats-row">
          <div className="cp-stat" style={{borderColor:'#f39c12'}}>
            <span className="cp-stat-num">{records.length}</span>
            <span className="cp-stat-lbl">Total Records</span>
          </div>
          <div className="cp-stat" style={{borderColor:'#27ae60'}}>
            <span className="cp-stat-num">{records.filter(r=>r.status==='completed').length}</span>
            <span className="cp-stat-lbl">Completed</span>
          </div>
          <div className="cp-stat" style={{borderColor:'#f39c12'}}>
            <span className="cp-stat-num">{records.filter(r=>r.status==='pending').length}</span>
            <span className="cp-stat-lbl">Pending</span>
          </div>
          <div className="cp-stat" style={{borderColor:'#2980b9'}}>
            <span className="cp-stat-num">ETB {totalCommission.toLocaleString()}</span>
            <span className="cp-stat-lbl">Total Commission</span>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="cp-form-card">
            <div className="cp-form-header">
              <h2>{editId ? '✏️ Edit Record' : '📋 New Fixed Commission Entry'}</h2>
              <button className="cp-close-btn" onClick={()=>{setShowForm(false);setEditId(null);setForm(emptyForm)}}>✕</button>
            </div>
            {error && <div className="cp-alert error">⚠️ {error}</div>}
            {msg   && <div className="cp-alert success">{msg}</div>}
            <div className="cp-form-grid">
              <div className="cp-field">
                <label>Client Name / ደንበኛ ስም *</label>
                <input className="cp-input" placeholder="Full name..." value={form.clientName} onChange={e=>handleChange('clientName',e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Client Phone / ስልክ</label>
                <input className="cp-input" placeholder="+251 9XX XXX XXX" value={form.clientPhone} onChange={e=>handleChange('clientPhone',e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Property Type</label>
                <select className="cp-select" value={form.propertyType} onChange={e=>handleChange('propertyType',e.target.value)}>
                  <option value="">— Select —</option>
                  {PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="cp-field">
                <label>Status</label>
                <select className="cp-select" value={form.status} onChange={e=>handleChange('status',e.target.value)}>
                  <option value="pending">⏳ Pending</option>
                  <option value="completed">✅ Completed</option>
                  <option value="cancelled">❌ Cancelled</option>
                </select>
              </div>
              <div className="cp-field cp-full">
                <label>Property Address / አድራሻ *</label>
                <input className="cp-input" placeholder="Full property address..." value={form.propertyAddress} onChange={e=>handleChange('propertyAddress',e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Property Value (ETB)</label>
                <input className="cp-input" type="number" placeholder="0.00" value={form.propertyValue} onChange={e=>handleChange('propertyValue',e.target.value)} min="0" />
              </div>
              <div className="cp-field">
                <label>Commission Rate (%)</label>
                <input className="cp-input" type="number" placeholder="e.g. 2.5" value={form.commissionRate} onChange={e=>handleChange('commissionRate',e.target.value)} min="0" max="100" step="0.1" />
              </div>
              <div className="cp-field">
                <label>Commission Amount (ETB)</label>
                <input className="cp-input cp-highlight" type="number" placeholder="Auto-calculated" value={form.commissionAmount} onChange={e=>handleChange('commissionAmount',e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Payment Date</label>
                <input className="cp-input" type="date" value={form.paymentDate} onChange={e=>handleChange('paymentDate',e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Staff / ሠራተኛ</label>
                <input className="cp-input" placeholder="Staff name..." value={form.staffName} onChange={e=>handleChange('staffName',e.target.value)} />
              </div>
              <div className="cp-field cp-full">
                <label>Notes</label>
                <textarea className="cp-input" rows={2} placeholder="Additional notes..." value={form.notes} onChange={e=>handleChange('notes',e.target.value)} style={{resize:'vertical'}} />
              </div>
            </div>
            <div className="cp-form-actions">
              <button className="cp-btn primary" onClick={handleSubmit}>💾 {editId?'Update':'Save'} Record</button>
              <button className="cp-btn secondary" onClick={()=>{setShowForm(false);setEditId(null);setForm(emptyForm)}}>Cancel</button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="cp-toolbar">
          <input className="cp-search" placeholder="🔍 Search by client, address, staff..." value={search} onChange={e=>setSearch(e.target.value)} />
          <select className="cp-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="completed">✅ Completed</option>
            <option value="cancelled">❌ Cancelled</option>
          </select>
        </div>

        {msg && !showForm && <div className="cp-alert success">{msg}</div>}

        {/* Table */}
        <div className="cp-table-card">
          <div className="cp-table-header">
            <h3>📊 Records ({filtered.length})</h3>
          </div>
          {filtered.length === 0 ? (
            <div className="cp-empty">📭 No records found. {records.length===0?'Add your first entry above.':''}</div>
          ) : (
            <div className="cp-table-wrap">
              <table className="cp-table">
                <thead>
                  <tr><th>Client</th><th>Phone</th><th>Type</th><th>Address</th><th>Value (ETB)</th><th>Rate</th><th>Commission</th><th>Date</th><th>Staff</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filtered.map(r=>(
                    <tr key={r.id}>
                      <td><strong>{r.clientName}</strong></td>
                      <td>{r.clientPhone||'—'}</td>
                      <td>{r.propertyType||'—'}</td>
                      <td className="cp-address">{r.propertyAddress}</td>
                      <td>{r.propertyValue?`ETB ${parseFloat(r.propertyValue).toLocaleString()}`:'—'}</td>
                      <td>{r.commissionRate?`${r.commissionRate}%`:'—'}</td>
                      <td className="cp-amount">ETB {parseFloat(r.commissionAmount||0).toLocaleString()}</td>
                      <td>{r.paymentDate||r.createdAt||'—'}</td>
                      <td>{r.staffName||'—'}</td>
                      <td><span className="cp-status-badge" style={{background:STATUS_COLORS[r.status]}}>{r.status}</span></td>
                      <td>
                        <div className="cp-row-actions">
                          <button className="cp-act-btn edit" onClick={()=>handleEdit(r)} title="Edit">✏️</button>
                          <button className="cp-act-btn delete" onClick={()=>handleDelete(r.id)} title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FixedCommission
