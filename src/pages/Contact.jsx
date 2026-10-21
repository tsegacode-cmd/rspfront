import { useState } from 'react'
import { useSiteContent } from '../contexts/SiteContentContext'
import { liveChatAPI } from '../services/api'
import { getLiveChatIdentity } from '../utils/liveChatIdentity'
import './Pages.css'
import './Contact.css'

const emptyForm = { name: '', email: '', phone: '', service: '', message: '' }

function Contact() {
  const siteContent = useSiteContent()
  const [formData, setFormData] = useState(emptyForm)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const handleChange = event => {
    setFormData(current => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
    setNotice('')
  }

  const handleSubmit = async event => {
    event.preventDefault()
    setSending(true)
    setError('')
    setNotice('')
    try {
      const identity = getLiveChatIdentity()
      await liveChatAPI.registerClientConversation(identity.conversationId, identity.deviceId)
      const message = [
        'CONTACT FORM MESSAGE',
        `Name: ${formData.name.trim()}`,
        `Email: ${formData.email.trim()}`,
        `Phone: ${formData.phone.trim() || 'Not provided'}`,
        `Service: ${formData.service || 'General Inquiry'}`,
        '',
        formData.message.trim(),
      ].join('\n')
      await liveChatAPI.sendClientMessage(identity.conversationId, identity.deviceId, { type: 'text', text: message })
      setFormData(emptyForm)
      setNotice('Your message was sent to REDSEA Support and is now available in the Root Live Chat inbox.')
    } catch (submitError) {
      setError(`Could not send your message: ${submitError.message}`)
    } finally {
      setSending(false)
    }
  }

  const serviceOptions = Array.isArray(siteContent.contactServiceOptions)
    ? siteContent.contactServiceOptions
    : []
  const lines = value => String(value || '').split('\n').map((line, index, allLines) => (
    <span key={`${index}-${line}`}>{line}{index < allLines.length - 1 && <br />}</span>
  ))

  return (
    <div className="page">
      <div className="page-header">
        <div className="container">
          <h1>{siteContent.contactPageTitle}</h1>
          <p>{siteContent.contactPageSubtitle}</p>
        </div>
      </div>

      <div className="container content-section">
        <div className="contact-grid">
          <div className="contact-info">
            <div className="card">
              <h2>{siteContent.contactIntroTitle}</h2>
              <p>{siteContent.contactIntroText}</p>
            </div>

            <div className="card">
              <h3>{siteContent.contactOfficeTitle}</h3>
              <p>{lines(siteContent.contactOfficeDetails)}</p>
            </div>

            <div className="card">
              <h3>{siteContent.contactPhoneTitle}</h3>
              <p>{lines(siteContent.contactPhoneDetails)}</p>
            </div>

            <div className="card">
              <h3>{siteContent.contactEmailTitle}</h3>
              <p>{lines(siteContent.contactEmailDetails)}</p>
            </div>

            <div className="card">
              <h3>{siteContent.contactHoursTitle}</h3>
              <p>{lines(siteContent.contactHoursDetails)}</p>
            </div>
          </div>

          <div className="contact-form-container">
            <div className="card">
              <h2>{siteContent.contactFormTitle}</h2>
              {error && <p className="contact-form-status error" role="alert">{error}</p>}
              {notice && <p className="contact-form-status success" role="status">{notice}</p>}
              <form onSubmit={handleSubmit} className="contact-form">
                <div className="form-group">
                  <label htmlFor="name">Full Name *</label>
                  <input type="text" id="name" name="name" maxLength={100} value={formData.name} onChange={handleChange} required />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input type="email" id="email" name="email" maxLength={254} value={formData.email} onChange={handleChange} required />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone Number</label>
                  <input type="tel" id="phone" name="phone" maxLength={80} value={formData.phone} onChange={handleChange} />
                </div>

                <div className="form-group">
                  <label htmlFor="service">Service Interest</label>
                  <select id="service" name="service" value={formData.service} onChange={handleChange}>
                    <option value="">Select a service</option>
                    {serviceOptions.map(service => <option key={service} value={service}>{service}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="message">Message *</label>
                  <textarea id="message" name="message" rows="5" maxLength={2000} value={formData.message} onChange={handleChange} required />
                </div>

                <button type="submit" className="btn btn-submit" disabled={sending}>
                  {sending ? 'Sending…' : siteContent.contactSendButtonText}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>{siteContent.contactAboutTitle}</h2>
          <p>{siteContent.contactAboutParagraphOne}</p>
          <p>{siteContent.contactAboutParagraphTwo}</p>
        </div>
      </div>
    </div>
  )
}

export default Contact
