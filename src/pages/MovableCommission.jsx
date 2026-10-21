import { useState, useEffect } from 'react'
import ServiceProductSection from '../components/ServiceProductSection'
import ServiceProductAdderModal from '../components/ServiceProductAdderModal'
import BookingPaymentModal from '../components/BookingPaymentModal'
import { marketplaceAPI } from '../services/api'
import { saveServiceBookingRequest } from '../utils/serviceBookingRequests'
import './CommissionPages.css'

const TYPES = ['Furniture','Electronics','Equipment','Machinery','Vehicles','Goods','Other']
function MovableCommission() {
  const E = { clientName:'',clientPhone:'',propertyType:'',fromAddress:'',toAddress:'',distance:'',baseRate:'',extraCharges:'',totalAmount:'',moveDate:'',staffName:'',notes:'',status:'pending' }
  const [form,setForm]=useState(E); const [records,setRecords]=useState([]); const [msg,setMsg]=useState(null); const [error,setError]=useState(null)
  const [editId,setEditId]=useState(null); const [showForm,setShowForm]=useState(false)
  const [bookingRecord,setBookingRecord]=useState(null)
  const [productEditor,setProductEditor]=useState(undefined)
  const canAddDigitalProduct=Boolean(localStorage.getItem('authToken') && !localStorage.getItem('rootToken') && !localStorage.getItem('authToken').startsWith('guest-'))
  const accountOwnerName=(()=>{
    try {
      const account=JSON.parse(localStorage.getItem('userData')||'{}')
      return account.full_name||account.fullName||account.username||''
    } catch {
      return ''
    }
  })()

  useEffect(()=>{ const s=localStorage.getItem('mc_records'); if(s) setRecords(JSON.parse(s)) },[])
  const save=(list)=>{ setRecords(list); localStorage.setItem('mc_records',JSON.stringify(list)) }

  const hc=(f,v)=>{ setForm(p=>{ const n={...p,[f]:v}; if(['distance','baseRate','extraCharges'].includes(f)&&n.distance&&n.baseRate) n.totalAmount=(parseFloat(n.distance)*parseFloat(n.baseRate)+parseFloat(n.extraCharges||0)).toFixed(2); return n }); setError(null) }
  const submit=()=>{ if(!form.clientName.trim()||!form.fromAddress.trim()){setError('Client name and From address required');return} if(editId){save(records.map(r=>r.id===editId?{...form,id:editId}:r));setMsg('✅ Updated!');setEditId(null)}else{save([{...form,id:Date.now(),createdAt:new Date().toLocaleDateString()},...records]);setMsg('✅ Saved!')} setForm(E);setShowForm(false);setTimeout(()=>setMsg(null),3000) }
  const edit=(r)=>{setForm({...E,...r});setEditId(r.id);setShowForm(true);window.scrollTo(0,0)}
  const confirmBooking=async (paymentMethod, paymentSelection, customer)=>{
    if (bookingRecord.catalog || bookingRecord.serviceProduct) {
      try {
        await saveServiceBookingRequest(bookingRecord, paymentMethod, paymentSelection, customer)
        setBookingRecord(null)
        setMsg(paymentMethod === 'REDSEA Wallet'
          ? '✅ Service successfully booked and paid from your REDSEA real wallet.'
          : `✅ Service and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
        return true
      } catch (saveError) {
        setError(saveError.message)
        return saveError.message
      }
    }
    try {
      await saveServiceBookingRequest({
        ...bookingRecord,
        title: `${bookingRecord.propertyType||'Moving service'} — ${bookingRecord.clientName}`,
        category: 'Big Service',
        price: `ETB ${parseFloat(bookingRecord.totalAmount||0).toLocaleString()}`,
      }, paymentMethod, paymentSelection, customer)
    } catch (saveError) {
      setError(saveError.message)
      return saveError.message
    }
    save(records.map(r=>r.id===bookingRecord.id?{
      ...r,
      paymentMethod,
      paymentStatus:'submitted',
      transactionReference:customer.transactionReference,
      status:'pending_approval',
      paymentRequestedAt:new Date().toISOString(),
    }:r))
    setBookingRecord(null)
    setMsg(`✅ Service and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
    return true
  }
  const saveDigitalProduct=async product=>{
    await marketplaceAPI.createProduct('movable-services',{
      ...product,
      category:product.category||'Other category',
      ownerName:product.ownerName||accountOwnerName,
    })
    setProductEditor(undefined)
    setMsg('✅ Digital product posted and now visible to everyone.')
    setTimeout(()=>setMsg(null),5000)
  }
  const del=(id)=>{if(window.confirm('Delete?'))save(records.filter(r=>r.id!==id))}
  const SC={pending:'#f39c12',completed:'#27ae60',cancelled:'#e74c3c'}

  return (
    <div className="cp-page">
      <div className="cp-container">
        <div className="cp-titlebar" style={{background:'linear-gradient(135deg,#e67e22,#d35400)'}}>
          <span className="cp-titlebar-icon">📦</span>
          <div className="cp-titlebar-text"><h1>Big Service</h1><p>Moving and movable-property services</p></div>
          {canAddDigitalProduct&&<button type="button" className="cp-titlebar-btn" onClick={()=>setProductEditor(null)}>＋ Add digital product</button>}
        </div>
        {showForm&&(
          <div className="cp-form-card">
            <div className="cp-form-header"><h2>{editId?'✏️ Edit':'🔄 New'} Movable Commission</h2><button className="cp-close-btn" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>✕</button></div>
            {error&&<div className="cp-alert error">⚠️ {error}</div>}{msg&&<div className="cp-alert success">{msg}</div>}
            <div className="cp-form-grid">
              <div className="cp-field"><label>Client Name *</label><input className="cp-input" placeholder="Full name..." value={form.clientName} onChange={e=>hc('clientName',e.target.value)}/></div>
              <div className="cp-field"><label>Client Phone</label><input className="cp-input" placeholder="+251 9XX XXX XXX" value={form.clientPhone} onChange={e=>hc('clientPhone',e.target.value)}/></div>
              <div className="cp-field"><label>Property Type</label><select className="cp-select" value={form.propertyType} onChange={e=>hc('propertyType',e.target.value)}><option value="">— Select —</option>{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="cp-field"><label>Status</label><select className="cp-select" value={form.status} onChange={e=>hc('status',e.target.value)}><option value="pending">⏳ Pending</option><option value="completed">✅ Completed</option><option value="cancelled">❌ Cancelled</option></select></div>
              <div className="cp-field"><label>From Address *</label><input className="cp-input" placeholder="Origin..." value={form.fromAddress} onChange={e=>hc('fromAddress',e.target.value)}/></div>
              <div className="cp-field"><label>To Address</label><input className="cp-input" placeholder="Destination..." value={form.toAddress} onChange={e=>hc('toAddress',e.target.value)}/></div>
              <div className="cp-field"><label>Distance (km)</label><input className="cp-input" type="number" min="0" placeholder="0" value={form.distance} onChange={e=>hc('distance',e.target.value)}/></div>
              <div className="cp-field"><label>Base Rate (ETB/km)</label><input className="cp-input" type="number" min="0" placeholder="0.00" value={form.baseRate} onChange={e=>hc('baseRate',e.target.value)}/></div>
              <div className="cp-field"><label>Extra Charges (ETB)</label><input className="cp-input" type="number" min="0" placeholder="0.00" value={form.extraCharges} onChange={e=>hc('extraCharges',e.target.value)}/></div>
              <div className="cp-field"><label>Total Amount (ETB)</label><input className="cp-input cp-highlight" type="number" placeholder="Auto-calc" value={form.totalAmount} onChange={e=>hc('totalAmount',e.target.value)}/></div>
              <div className="cp-field"><label>Move Date</label><input className="cp-input" type="date" value={form.moveDate} onChange={e=>hc('moveDate',e.target.value)}/></div>
              <div className="cp-field"><label>Staff</label><input className="cp-input" placeholder="Staff name..." value={form.staffName} onChange={e=>hc('staffName',e.target.value)}/></div>
              <div className="cp-field cp-full"><label>Notes</label><textarea className="cp-input" rows={2} value={form.notes} onChange={e=>hc('notes',e.target.value)} style={{resize:'vertical'}}/></div>
            </div>
            <div className="cp-form-actions"><button className="cp-btn primary" style={{background:'linear-gradient(135deg,#e67e22,#d35400)'}} onClick={submit}>💾 {editId?'Update':'Save'}</button><button className="cp-btn secondary" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>Cancel</button></div>
          </div>
        )}
        {msg&&!showForm&&<div className="cp-alert success">{msg}</div>}
        <ServiceProductSection
          serviceKey="movable-services"
          items={[
            ...records.map(r=>({
              id:r.id, icon:'📦', title:r.propertyType||'Moving service', subtitle:r.clientName,
              statusLabel:r.status, price:`ETB ${parseFloat(r.totalAmount||0).toLocaleString()}`,
              priceLabel:`${r.distance||'—'} km`, paymentMethod:r.paymentMethod,
              details:[`${r.fromAddress||'—'} → ${r.toAddress||'—'}`,`Move date: ${r.moveDate||'—'}`,r.clientPhone||'Phone not set',r.staffName&&`Staff: ${r.staffName}`],
            })),
          ]}
          emptyMessage={`📭 No records found. ${records.length===0?'Add the first entry above.':''}`}
          accent="#e67e22"
          onBook={item=>setBookingRecord(item.catalog || item.serviceProduct ? item : records.find(r=>r.id===item.id))}
          onEdit={item=>edit(records.find(r=>r.id===item.id))}
          onDelete={del}
        />
        {bookingRecord&&<BookingPaymentModal
          itemName={bookingRecord.title || `${bookingRecord.propertyType||'Moving service'} — ${bookingRecord.clientName}`}
          amount={bookingRecord.serviceProduct
            ? `ETB ${Number(bookingRecord.price).toLocaleString()}`
            : `ETB ${parseFloat(bookingRecord.totalAmount||0).toLocaleString()}`}
          paymentOptions={bookingRecord.paymentOptions}
          itemId={bookingRecord.catalog || bookingRecord.serviceProduct ? bookingRecord.id : ''}
          deliveryEnabled={Boolean(bookingRecord.deliveryEnabled)}
          deliveryFee={bookingRecord.deliveryFee || 0}
          platformFeePercent={bookingRecord.platformFeePercent || 0}
          onClose={()=>setBookingRecord(null)}
          onConfirm={confirmBooking}
        />}
        {productEditor!==undefined&&<ServiceProductAdderModal
          initialValues={{ownerName:accountOwnerName,digitalProduct:true}}
          onClose={()=>setProductEditor(undefined)}
          onSave={saveDigitalProduct}
        />}
      </div>
    </div>
  )
}
export default MovableCommission
