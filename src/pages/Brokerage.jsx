import { useState, useEffect } from 'react'
import ServiceProductSection from '../components/ServiceProductSection'
import BookingPaymentModal from '../components/BookingPaymentModal'
import { saveServiceBookingRequest } from '../utils/serviceBookingRequests'
import './CommissionPages.css'

const PTYPES = ['Apartment','Villa','Office','Warehouse','Shop','Land','Building','Other']
function Brokerage() {
  const E = { contractNo:'',sellerName:'',sellerPhone:'',buyerName:'',buyerPhone:'',propertyType:'',propertyAddress:'',salePrice:'',brokerageRate:'',brokerageAmount:'',contractDate:'',staffName:'',notes:'',status:'pending' }
  const [form,setForm]=useState(E),[records,setRecords]=useState([]),[msg,setMsg]=useState(null),[error,setError]=useState(null)
  const [editId,setEditId]=useState(null),[showForm,setShowForm]=useState(false)
  const [bookingRecord,setBookingRecord]=useState(null)

  useEffect(()=>{const s=localStorage.getItem('brk_records');if(s)setRecords(JSON.parse(s))},[])
  const save=(list)=>{setRecords(list);localStorage.setItem('brk_records',JSON.stringify(list))}
  const hc=(f,v)=>{setForm(p=>{const n={...p,[f]:v};if(['salePrice','brokerageRate'].includes(f)&&n.salePrice&&n.brokerageRate)n.brokerageAmount=(parseFloat(n.salePrice)*parseFloat(n.brokerageRate)/100).toFixed(2);return n});setError(null)}
  const submit=()=>{
    if(!form.sellerName.trim()||!form.buyerName.trim()){setError('Seller and Buyer names required');return}
    const no=form.contractNo||`BRK-${Date.now().toString().slice(-6)}`
    if(editId){save(records.map(r=>r.id===editId?{...form,contractNo:no,id:editId}:r));setMsg('✅ Updated!');setEditId(null)}
    else{save([{...form,contractNo:no,id:Date.now(),createdAt:new Date().toLocaleDateString()},...records]);setMsg('✅ Saved!')}
    setForm(E);setShowForm(false);setTimeout(()=>setMsg(null),3000)
  }
  const edit=(r)=>{setForm({...E,...r});setEditId(r.id);setShowForm(true);window.scrollTo(0,0)}
  const confirmBooking=async (paymentMethod, paymentSelection, customer)=>{
    if (bookingRecord.catalog || bookingRecord.serviceProduct) {
      try {
        await saveServiceBookingRequest(bookingRecord, paymentMethod, paymentSelection, customer)
        setBookingRecord(null)
        setMsg(paymentMethod === 'REDSEA Wallet'
          ? '✅ Partnership successfully booked and paid from your REDSEA real wallet.'
          : `✅ Partnership and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
        return true
      } catch (saveError) {
        setError(saveError.message)
        return saveError.message
      }
    }
    try {
      await saveServiceBookingRequest({
        ...bookingRecord,
        title: `${bookingRecord.propertyType||'Partnership'} — ${bookingRecord.sellerName} and ${bookingRecord.buyerName}`,
        category: 'Create Partnership',
        price: `ETB ${parseFloat(bookingRecord.brokerageAmount||0).toLocaleString()}`,
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
    setMsg(`✅ Partnership and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
    return true
  }
  const del=(id)=>{if(window.confirm('Delete?'))save(records.filter(r=>r.id!==id))}
  const SC={pending:'#f39c12',active:'#2980b9',completed:'#27ae60',cancelled:'#e74c3c'}

  return (
    <div className="cp-page">
      <div className="cp-container">
        <div className="cp-titlebar" style={{background:'linear-gradient(135deg,#8e44ad,#6c3483)'}}>
          <span className="cp-titlebar-icon">🤝</span>
          <div className="cp-titlebar-text"><h1>Brokerage</h1><p>Manage property brokerage contracts between buyers and sellers</p></div>
        </div>
        {showForm&&(
          <div className="cp-form-card" style={{borderTopColor:'#8e44ad'}}>
            <div className="cp-form-header"><h2>{editId?'✏️ Edit':'📄 New'} Brokerage Contract</h2><button className="cp-close-btn" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>✕</button></div>
            {error&&<div className="cp-alert error">⚠️ {error}</div>}{msg&&<div className="cp-alert success">{msg}</div>}
            <div className="cp-form-grid">
              <div className="cp-field"><label>Contract No <span className="cp-optional">Auto</span></label><input className="cp-input" placeholder="Auto-generated..." value={form.contractNo} onChange={e=>hc('contractNo',e.target.value)}/></div>
              <div className="cp-field"><label>Status</label><select className="cp-select" value={form.status} onChange={e=>hc('status',e.target.value)}><option value="pending">⏳ Pending</option><option value="active">✅ Active</option><option value="completed">🎉 Completed</option><option value="cancelled">❌ Cancelled</option></select></div>
              <div className="cp-field"><label>Seller Name *</label><input className="cp-input" placeholder="Seller full name..." value={form.sellerName} onChange={e=>hc('sellerName',e.target.value)}/></div>
              <div className="cp-field"><label>Seller Phone</label><input className="cp-input" placeholder="+251 9XX XXX XXX" value={form.sellerPhone} onChange={e=>hc('sellerPhone',e.target.value)}/></div>
              <div className="cp-field"><label>Buyer Name *</label><input className="cp-input" placeholder="Buyer full name..." value={form.buyerName} onChange={e=>hc('buyerName',e.target.value)}/></div>
              <div className="cp-field"><label>Buyer Phone</label><input className="cp-input" placeholder="+251 9XX XXX XXX" value={form.buyerPhone} onChange={e=>hc('buyerPhone',e.target.value)}/></div>
              <div className="cp-field cp-full"><label>Property Address</label><input className="cp-input" placeholder="Full property address..." value={form.propertyAddress} onChange={e=>hc('propertyAddress',e.target.value)}/></div>
              <div className="cp-field"><label>Property Type</label><select className="cp-select" value={form.propertyType} onChange={e=>hc('propertyType',e.target.value)}><option value="">— Select —</option>{PTYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="cp-field"><label>Sale Price (ETB)</label><input className="cp-input" type="number" min="0" placeholder="0.00" value={form.salePrice} onChange={e=>hc('salePrice',e.target.value)}/></div>
              <div className="cp-field"><label>Brokerage Rate (%)</label><input className="cp-input" type="number" min="0" max="100" step="0.1" placeholder="e.g. 3" value={form.brokerageRate} onChange={e=>hc('brokerageRate',e.target.value)}/></div>
              <div className="cp-field"><label>Brokerage Amount (ETB)</label><input className="cp-input cp-highlight" style={{borderColor:'#8e44ad'}} type="number" placeholder="Auto-calc" value={form.brokerageAmount} onChange={e=>hc('brokerageAmount',e.target.value)}/></div>
              <div className="cp-field"><label>Contract Date</label><input className="cp-input" type="date" value={form.contractDate} onChange={e=>hc('contractDate',e.target.value)}/></div>
              <div className="cp-field"><label>Staff</label><input className="cp-input" placeholder="Staff name..." value={form.staffName} onChange={e=>hc('staffName',e.target.value)}/></div>
              <div className="cp-field cp-full"><label>Notes</label><textarea className="cp-input" rows={2} value={form.notes} onChange={e=>hc('notes',e.target.value)} style={{resize:'vertical'}}/></div>
            </div>
            <div className="cp-form-actions"><button className="cp-btn primary" style={{background:'linear-gradient(135deg,#8e44ad,#6c3483)'}} onClick={submit}>💾 {editId?'Update':'Save'} Contract</button><button className="cp-btn secondary" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>Cancel</button></div>
          </div>
        )}
        {msg&&!showForm&&<div className="cp-alert success">{msg}</div>}
        <ServiceProductSection
          serviceKey="create-partnership"
          items={[
            ...records.map(r=>({
              id:r.id, icon:'🤝', title:r.propertyType||'Partnership', subtitle:`${r.sellerName} ↔ ${r.buyerName}`,
              statusLabel:r.status, price:`ETB ${parseFloat(r.brokerageAmount||0).toLocaleString()}`,
              priceLabel:`Brokerage · ${r.brokerageRate||0}%`, paymentMethod:r.paymentMethod,
              details:[r.propertyAddress||'Property address not set',`Sale price: ${r.salePrice?`ETB ${parseFloat(r.salePrice).toLocaleString()}`:'Not set'}`,`Contract: ${r.contractNo}`,`Date: ${r.contractDate||r.createdAt||'—'}`],
            })),
          ]}
          emptyMessage={`📭 No contracts found. ${records.length===0?'Add the first contract above.':''}`}
          accent="#8e44ad"
          onBook={item=>setBookingRecord(item.catalog || item.serviceProduct ? item : records.find(r=>r.id===item.id))}
          onEdit={item=>edit(records.find(r=>r.id===item.id))}
          onDelete={del}
        />
        {bookingRecord&&<BookingPaymentModal
          itemName={bookingRecord.title || `${bookingRecord.propertyType||'Partnership'} — ${bookingRecord.sellerName} and ${bookingRecord.buyerName}`}
          amount={bookingRecord.serviceProduct
            ? `ETB ${Number(bookingRecord.price).toLocaleString()}`
            : `ETB ${parseFloat(bookingRecord.brokerageAmount||0).toLocaleString()}`}
          paymentOptions={bookingRecord.paymentOptions}
          itemId={bookingRecord.catalog || bookingRecord.serviceProduct ? bookingRecord.id : ''}
          deliveryEnabled={Boolean(bookingRecord.deliveryEnabled)}
          deliveryFee={bookingRecord.deliveryFee || 0}
          onClose={()=>setBookingRecord(null)}
          onConfirm={confirmBooking}
        />}
      </div>
    </div>
  )
}
export default Brokerage
