import { useState } from 'react'
import './Pages.css'
import './Contact.css'

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    service: '',
    message: ''
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    alert('Thank you for your message! We will get back to you soon.')
    setFormData({
      name: '',
      email: '',
      phone: '',
      service: '',
      message: ''
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="container">
          <h1>Contact Us</h1>
          <p>Get in touch with our team</p>
        </div>
      </div>

      <div className="container content-section">
        <div className="contact-grid">
          <div className="contact-info">
            <div className="card">
              <h2>Get In Touch</h2>
              <p>
                Have questions about our services? Want to discuss a potential partnership? 
                We're here to help. Reach out to us using the contact form or through any 
                of the methods below.
              </p>
            </div>

            <div className="card">
              <h3>📍 Office Location</h3>
              <p>123 Business District<br />Red Sea Plaza, Suite 500<br />City, State 12345</p>
            </div>

            <div className="card">
              <h3>📞 Phone</h3>
              <p>Main: +1 (555) 123-4567<br />Fax: +1 (555) 123-4568</p>
            </div>

            <div className="card">
              <h3>📧 Email</h3>
              <p>General: info@redsea.com<br />Support: support@redsea.com<br />Sales: sales@redsea.com</p>
            </div>

            <div className="card">
              <h3>🕐 Business Hours</h3>
              <p>Monday - Friday: 9:00 AM - 6:00 PM<br />Saturday: 10:00 AM - 4:00 PM<br />Sunday: Closed</p>
            </div>
          </div>

          <div className="contact-form-container">
            <div className="card">
              <h2>Send Us a Message</h2>
              <form onSubmit={handleSubmit} className="contact-form">
                <div className="form-group">
                  <label htmlFor="name">Full Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="service">Service Interest</label>
                  <select
                    id="service"
                    name="service"
                    value={formData.service}
                    onChange={handleChange}
                  >
                    <option value="">Select a service</option>
                    <option value="fixed">Fixed Commission</option>
                    <option value="movable">Movable Commission</option>
                    <option value="brokerage">Brokerage Services</option>
                    <option value="general">General Inquiry</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="message">Message *</label>
                  <textarea
                    id="message"
                    name="message"
                    rows="5"
                    value={formData.message}
                    onChange={handleChange}
                    required
                  ></textarea>
                </div>

                <button type="submit" className="btn btn-submit">Send Message</button>
              </form>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>About REDSEA</h2>
          <p>
            REDSEA is a leading platform for commission work and brokerage services. We specialize 
            in connecting businesses and individuals through our comprehensive fixed commission, 
            movable commission, and brokerage service offerings.
          </p>
          <p>
            With years of experience in the industry, our team is dedicated to providing transparent, 
            efficient, and professional services that help our clients achieve their business goals. 
            Whether you're looking for stable fixed commission structures, performance-based movable 
            commissions, or expert brokerage services, REDSEA is your trusted partner.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Contact
