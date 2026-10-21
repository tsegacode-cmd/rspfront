import { useState, useEffect } from 'react'
import ServiceProductSection from '../components/ServiceProductSection'
import BookingPaymentModal from '../components/BookingPaymentModal'
import LoginRequiredModal from '../components/LoginRequiredModal'
import { saveServiceBookingRequest } from '../utils/serviceBookingRequests'
import './CommissionPages.css'

const ROOM_TYPES = ['Single','Double','Twin','Suite','Deluxe','Family','Conference']
const SL = { reserved:'📅 Reserved', checked_in:'✅ Checked In', checked_out:'🚪 Checked Out', cancelled:'❌ Cancelled' }
const SC = { reserved:'#f39c12', checked_in:'#27ae60', checked_out:'#2980b9', cancelled:'#e74c3c' }
function RoomBooking() {
  const [loginPrompt, setLoginPrompt] = useState({ open: false, message: '' })

  const requireLogin = () => {
    const loggedIn = Boolean(localStorage.getItem('authToken') && localStorage.getItem('userData'))
    if (!loggedIn) {
      setLoginPrompt({ open: true, message: 'Please log in to book a room.' })
      return false
    }
    return true
  }

  const E = { guestName:'',guestPhone:'',guestEmail:'',roomNo:'',roomType:'',checkIn:'',checkOut:'',nights:'',ratePerNight:'',totalAmount:'',status:'reserved',staffName:'',notes:'' }
  const [form,setForm]=useState(E),[records,setRecords]=useState([]),[msg,setMsg]=useState(null),[error,setError]=useState(null)
  const [editId,setEditId]=useState(null),[showForm,setShowForm]=useState(false)
  const [bookingRecord,setBookingRecord]=useState(null)

  useEffect(()=>{const s=localStorage.getItem('rb_records');if(s)setRecords(JSON.parse(s))},[])
  const save=(list)=>{setRecords(list);localStorage.setItem('rb_records',JSON.stringify(list))}

  const hc=(f,v)=>{setForm(p=>{const n={...p,[f]:v};if((f==='checkIn'||f==='checkOut')&&n.checkIn&&n.checkOut){const d=Math.ceil((new Date(n.checkOut)-new Date(n.checkIn))/86400000);n.nights=d>0?String(d):'';if(n.ratePerNight&&d>0)n.totalAmount=(d*parseFloat(n.ratePerNight)).toFixed(2)}if(f==='ratePerNight'&&n.nights)n.totalAmount=(parseFloat(v||0)*parseInt(n.nights)).toFixed(2);return n});setError(null)}
  const submit=()=>{if(!requireLogin()) return;if(!form.guestName.trim()||!form.roomNo.trim()){setError('Guest name and Room No required');return}if(editId){save(records.map(r=>r.id===editId?{...form,id:editId}:r));setMsg('✅ Updated!');setEditId(null)}else{save([{...form,id:Date.now(),createdAt:new Date().toLocaleDateString()},...records]);setMsg('✅ Saved!')}setForm(E);setShowForm(false);setTimeout(()=>setMsg(null),3000)}
  const edit=(r)=>{setForm({...E,...r});setEditId(r.id);setShowForm(true);window.scrollTo(0,0)}
  const confirmBooking=async (paymentMethod, paymentSelection, customer)=>{
    if (!requireLogin()) return false
    if (bookingRecord.catalog || bookingRecord.serviceProduct) {
      try {
        await saveServiceBookingRequest(bookingRecord, paymentMethod, paymentSelection, customer)
        setBookingRecord(null)
        setMsg(paymentMethod === 'REDSEA Wallet'
          ? '✅ Room successfully booked and paid from your REDSEA real wallet.'
          : `✅ Booking and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
        return true
      } catch (saveError) {
        setError(saveError.message)
        return saveError.message
      }
    }
    try {
      await saveServiceBookingRequest({
        ...bookingRecord,
        title: `Room ${bookingRecord.roomNo} — ${bookingRecord.guestName}`,
        category: 'Room Booking',
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
    setMsg(`✅ Booking and payment request sent using ${paymentMethod}. Waiting for payment approval.`)
    return true
  }
  const del=(id)=>{if(window.confirm('Delete?'))save(records.filter(r=>r.id!==id))}

  return (
    <div className="cp-page">
      <div className="cp-container">
        <div className="cp-titlebar" style={{background:'linear-gradient(135deg,#27ae60,#1e8449)'}}>
          <span className="cp-titlebar-icon">🛏️</span>
          <div className="cp-titlebar-text"><h1>Room Booking</h1><p>Reserve and manage room bookings for guests</p></div>
        </div>
        {showForm&&(
          <div className="cp-form-card" style={{borderTopColor:'#27ae60'}}>
            <div className="cp-form-header"><h2>{editId?'✏️ Edit':'🛏️ New'} Room Booking</h2><button className="cp-close-btn" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>✕</button></div>
            {error&&<div className="cp-alert error">⚠️ {error}</div>}{msg&&<div className="cp-alert success">{msg}</div>}
            <div className="cp-form-grid">
              <div className="cp-field"><label>Guest Name *</label><input className="cp-input" placeholder="Full name..." value={form.guestName} onChange={e=>hc('guestName',e.target.value)}/></div>
              <div className="cp-field"><label>Guest Phone</label><input className="cp-input" placeholder="+251 9XX XXX XXX" value={form.guestPhone} onChange={e=>hc('guestPhone',e.target.value)}/></div>
              <div className="cp-field"><label>Guest Email</label><input className="cp-input" type="email" placeholder="email@example.com" value={form.guestEmail} onChange={e=>hc('guestEmail',e.target.value)}/></div>
              <div className="cp-field"><label>Status</label><select className="cp-select" value={form.status} onChange={e=>hc('status',e.target.value)}>{Object.entries(SL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              <div className="cp-field"><label>Room No *</label><input className="cp-input" placeholder="e.g. 101" value={form.roomNo} onChange={e=>hc('roomNo',e.target.value)}/></div>
              <div className="cp-field"><label>Room Type</label><select className="cp-select" value={form.roomType} onChange={e=>hc('roomType',e.target.value)}><option value="">— Select —</option>{ROOM_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="cp-field"><label>Check-In Date</label><input className="cp-input" type="date" value={form.checkIn} onChange={e=>hc('checkIn',e.target.value)}/></div>
              <div className="cp-field"><label>Check-Out Date</label><input className="cp-input" type="date" value={form.checkOut} onChange={e=>hc('checkOut',e.target.value)}/></div>
              <div className="cp-field"><label>Nights</label><input className="cp-input" type="number" placeholder="Auto-calc" value={form.nights} readOnly style={{background:'#f0f4f8'}}/></div>
              <div className="cp-field"><label>Rate / Night (ETB)</label><input className="cp-input" type="number" min="0" placeholder="0.00" value={form.ratePerNight} onChange={e=>hc('ratePerNight',e.target.value)}/></div>
              <div className="cp-field"><label>Total Amount (ETB)</label><input className="cp-input cp-highlight" style={{borderColor:'#27ae60'}} type="number" placeholder="Auto-calc" value={form.totalAmount} onChange={e=>hc('totalAmount',e.target.value)}/></div>
              <div className="cp-field"><label>Staff</label><input className="cp-input" placeholder="Staff name..." value={form.staffName} onChange={e=>hc('staffName',e.target.value)}/></div>
              <div className="cp-field cp-full"><label>Notes / Special Requests</label><textarea className="cp-input" rows={2} value={form.notes} onChange={e=>hc('notes',e.target.value)} style={{resize:'vertical'}}/></div>
            </div>
            <div className="cp-form-actions"><button className="cp-btn primary" style={{background:'linear-gradient(135deg,#27ae60,#1e8449)'}} onClick={submit}>💾 {editId?'Update':'Save'} Booking</button><button className="cp-btn secondary" onClick={()=>{setShowForm(false);setEditId(null);setForm(E)}}>Cancel</button></div>
          </div>
        )}
        {msg&&!showForm&&<div className="cp-alert success">{msg}</div>}
        <LoginRequiredModal
          isOpen={loginPrompt.open}
          message={loginPrompt.message}
          onClose={() => setLoginPrompt({ open: false, message: '' })}
        />
        <ServiceProductSection
          serviceKey="room-booking"
          items={[
            ...records.map(r=>({
              id:r.id, icon:'🛏️', title:`Room ${r.roomNo}`, subtitle:r.guestName,
              statusLabel:SL[r.status]||r.status, price:`ETB ${parseFloat(r.totalAmount||0).toLocaleString()}`,
              priceLabel:`${r.nights||'—'} night(s)`, paymentMethod:r.paymentMethod,
              details:[r.roomType||'Room type not set',`Stay: ${r.checkIn||'—'} to ${r.checkOut||'—'}`,r.guestPhone||'Phone not set',r.staffName&&`Staff: ${r.staffName}`],
            })),
          ]}
          emptyMessage={`📭 No bookings found. ${records.length===0?'Add the first booking above.':''}`}
          accent="#27ae60"
          onBook={item=>setBookingRecord(item.catalog || item.serviceProduct ? item : records.find(r=>r.id===item.id))}
          onEdit={item=>edit(records.find(r=>r.id===item.id))}
          onDelete={del}
        />
        {bookingRecord&&<BookingPaymentModal
          itemName={bookingRecord.title || `Room ${bookingRecord.roomNo} — ${bookingRecord.guestName}`}
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
export default RoomBooking
