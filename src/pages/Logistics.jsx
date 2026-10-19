import { useState, useEffect } from 'react'
import ServiceProductSection from '../components/ServiceProductSection'
import BookingPaymentModal from '../components/BookingPaymentModal'
import { saveServiceBookingRequest } from '../utils/serviceBookingRequests'
import './CommissionPages.css'

const VTYPES = ['Sedan','SUV','Minibus','Bus','Truck','Pickup','Van','Motorcycle']
const SL = { booked:'📅 Booked', active:'🚗 Active', returned:'✅ Returned', cancelled:'❌ Cancelled' }
const SC = { booked:'#f39c12', active:'#27ae60', returned:'#2980b9', cancelled:'#e74c3c' }
function Logistics() {
  const E = { clientName:'',clientPhone:'',vehicleType:'',plateNo:'',driverName:'',driverPhone:'',fromLocation:'',toLocation:'',startDate:'',endDate:'',rentalDays:'',dailyRate:'',totalAmount:'',fuelIncluded:'yes',status:'booked',staffName:'',notes:'' }
  const [form,setForm]=useState(E),[records,setRecords]=useState([]),[msg,setMsg]=useState(null),[error,setError]=useState(null)
  const [editId,setEditId]=useState(null),[showForm,setShowForm]=useState(false)
  const [bookingRecord,setBookingRecord]=useState(null)

  useEffect(()=>{const s=localStorage.getItem('log_records');if(s)setRecords(JSON.parse(s))},[])
  const save=(list)=>{setRecords(list);localStorage.setItem('log_records',JSON.stringify(list))}

  const hc=(f,v)=>{setForm(p=>{const n={...p,[f]:v};if((f==='startDate'||f==='endDate')&&n.startDate&&n.endDate){const d=Math.ceil((new Date(n.endDate)-new Date(n.startDate))/86400000);n.rentalDays=d>0?String(d):'';if(n.dailyRate&&d>0)n.totalAmount=(d*parseFloat(n.dailyRate)).toFixed(2)}if(f==='dailyRate'&&n.rentalDays)n.totalAmount=(parseFloat(v||0)*parseInt(n.rentalDays)).toFixed(2);return n});setError(null)}
  const submit=()=>{if(!form.clientName.trim()||!form.vehicleType){setError('Client name and vehicle type required');return}if(editId){save(records.map(r=>r.id===editId?{...form,id:editId}:r));setMsg('✅ Updated!');setEditId(null)}else{save([{...form,id:Date.now(),createdAt:new Date().toLocaleDateString()},...records]);setMsg('✅ Saved!')}setForm(E);setShowForm(false);setTimeout(()=>setMsg(null),3000)}
  const edit=(r)=>{setForm({...E,...r});setEditId(r.id);setShowForm(true);window.scrollTo(0,0)}
  const confirmBooking=async (paymentMethod, paymentSelection, customer)=>{
    if (bookingRecord.catalog || bookingRecord.serviceProduct) {
      try {
        await saveServiceBookingRequest(bookingRecord, paymentMethod, paymentSelection, customer)
        setBookingRecord(null)
        setMsg(paymentMethod === 'REDSEA Wallet'
          ? '✅ Rental successfully booked and paid from your REDSEA real wallet.'
          : `✅ Rental and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
        return true
      } catch (saveError) {
        setError(saveError.message)
        return saveError.message
      }
    }
    try {
      await saveServiceBookingRequest({
        ...bookingRecord,
        title: `${bookingRecord.vehicleType} rental — ${bookingRecord.clientName}`,
        category: 'Logistics / Vehicle Rental',
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
    setMsg(`✅ Rental and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
    return true
  }
  const del=(id)=>{if(window.confirm('Delete?'))save(records.filter(r=>r.id!==id))}
  return (
    <div className="cp-page">
      <div className="cp-container">
        <div className="cp-titlebar" style={{background:'linear-gradient(135deg,#16a085,#0e6655)'}}>
          <span className="cp-titlebar-icon">🚗</span>
          <div className="cp-titlebar-text"><h1>Logistics / Car Rent</h1><p>Vehicle rental and logistics management</p></div>
        </div>
        {showForm&&(
          <div className="cp-form-card" style={{borderTopColor:'#16a085'}}>
            <div className="cp-form-header"><h2>{editId?'✏️ Edit':'🚗 New'} Vehicle Rental</h2><button className="cp-close-btn" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>✕</button></div>
            {error&&<div className="cp-alert error">⚠️ {error}</div>}{msg&&<div className="cp-alert success">{msg}</div>}
            <div className="cp-form-grid">
              <div className="cp-field"><label>Client Name *</label><input className="cp-input" placeholder="Client full name..." value={form.clientName} onChange={e=>hc('clientName',e.target.value)}/></div>
              <div className="cp-field"><label>Client Phone</label><input className="cp-input" placeholder="+251 9XX XXX XXX" value={form.clientPhone} onChange={e=>hc('clientPhone',e.target.value)}/></div>
              <div className="cp-field"><label>Vehicle Type *</label><select className="cp-select" value={form.vehicleType} onChange={e=>hc('vehicleType',e.target.value)}><option value="">— Select —</option>{VTYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="cp-field"><label>Plate No</label><input className="cp-input" placeholder="e.g. AA-12345" value={form.plateNo} onChange={e=>hc('plateNo',e.target.value)}/></div>
              <div className="cp-field"><label>Driver Name</label><input className="cp-input" placeholder="Driver full name..." value={form.driverName} onChange={e=>hc('driverName',e.target.value)}/></div>
              <div className="cp-field"><label>Driver Phone</label><input className="cp-input" placeholder="+251 9XX XXX XXX" value={form.driverPhone} onChange={e=>hc('driverPhone',e.target.value)}/></div>
              <div className="cp-field"><label>From / ከ</label><input className="cp-input" placeholder="Pickup location..." value={form.fromLocation} onChange={e=>hc('fromLocation',e.target.value)}/></div>
              <div className="cp-field"><label>To / ወደ</label><input className="cp-input" placeholder="Drop-off location..." value={form.toLocation} onChange={e=>hc('toLocation',e.target.value)}/></div>
              <div className="cp-field"><label>Start Date</label><input className="cp-input" type="date" value={form.startDate} onChange={e=>hc('startDate',e.target.value)}/></div>
              <div className="cp-field"><label>End Date</label><input className="cp-input" type="date" value={form.endDate} onChange={e=>hc('endDate',e.target.value)}/></div>
              <div className="cp-field"><label>Rental Days</label><input className="cp-input" type="number" placeholder="Auto-calc" value={form.rentalDays} readOnly style={{background:'#f0f4f8'}}/></div>
              <div className="cp-field"><label>Daily Rate (ETB)</label><input className="cp-input" type="number" min="0" placeholder="0.00" value={form.dailyRate} onChange={e=>hc('dailyRate',e.target.value)}/></div>
              <div className="cp-field"><label>Total Amount (ETB)</label><input className="cp-input cp-highlight" style={{borderColor:'#16a085'}} type="number" placeholder="Auto-calc" value={form.totalAmount} onChange={e=>hc('totalAmount',e.target.value)}/></div>
              <div className="cp-field"><label>Fuel Included?</label><select className="cp-select" value={form.fuelIncluded} onChange={e=>hc('fuelIncluded',e.target.value)}><option value="yes">✅ Yes</option><option value="no">❌ No</option></select></div>
              <div className="cp-field"><label>Status</label><select className="cp-select" value={form.status} onChange={e=>hc('status',e.target.value)}>{Object.entries(SL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              <div className="cp-field"><label>Staff</label><input className="cp-input" placeholder="Staff name..." value={form.staffName} onChange={e=>hc('staffName',e.target.value)}/></div>
              <div className="cp-field cp-full"><label>Notes</label><textarea className="cp-input" rows={2} value={form.notes} onChange={e=>hc('notes',e.target.value)} style={{resize:'vertical'}}/></div>
            </div>
            <div className="cp-form-actions"><button className="cp-btn primary" style={{background:'linear-gradient(135deg,#16a085,#0e6655)'}} onClick={submit}>💾 {editId?'Update':'Save'} Rental</button><button className="cp-btn secondary" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>Cancel</button></div>
          </div>
        )}
        {msg&&!showForm&&<div className="cp-alert success">{msg}</div>}
        <ServiceProductSection
          serviceKey="logistics"
          items={[
            ...records.map(r=>({
              id:r.id, icon:'🚗', title:r.vehicleType, subtitle:r.clientName,
              statusLabel:SL[r.status]||r.status, price:`ETB ${parseFloat(r.totalAmount||0).toLocaleString()}`,
              priceLabel:`${r.rentalDays||'—'} day(s)`, paymentMethod:r.paymentMethod,
              details:[r.plateNo||'Plate not set',`${r.fromLocation||'—'} → ${r.toLocation||'—'}`,`Dates: ${r.startDate||'—'} to ${r.endDate||'—'}`,`Fuel: ${r.fuelIncluded==='yes'?'Included':'Not included'}`],
            })),
          ]}
          emptyMessage={`📭 No rentals found. ${records.length===0?'Add the first rental above.':''}`}
          accent="#16a085"
          onBook={item=>setBookingRecord(item.catalog || item.serviceProduct ? item : records.find(r=>r.id===item.id))}
          onEdit={item=>edit(records.find(r=>r.id===item.id))}
          onDelete={del}
        />
        {bookingRecord&&<BookingPaymentModal
          itemName={bookingRecord.title || `${bookingRecord.vehicleType} rental — ${bookingRecord.clientName}`}
          amount={bookingRecord.serviceProduct
            ? `ETB ${Number(bookingRecord.price).toLocaleString()}`
            : `ETB ${parseFloat(bookingRecord.totalAmount||0).toLocaleString()}`}
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
export default Logistics
