import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Footer.css'
import { useSiteContent } from '../contexts/SiteContentContext'

function Footer() {
  const siteContent = useSiteContent()
  const [termsOpen, setTermsOpen] = useState(false)
  const phoneDigits = String(siteContent.phone || '').replace(/\D/g, '')
  const phoneLink = String(siteContent.phone || '').replace(/[^\d+]/g, '')

  useEffect(() => {
    if (!termsOpen) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setTermsOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [termsOpen])

  return (
    <footer className="footer">
      <div className="container footer-content">
        <div className="footer-section">
          <h3>{siteContent.footerBrandTitle}</h3>
          <p>{siteContent.footerDescription}</p>
        </div>
        <div className="footer-section">
          <h4>{siteContent.servicesTitle}</h4>
          <ul>
            {siteContent.services.map((service, index) => <li key={`${service}-${index}`}>{service}</li>)}
          </ul>
        </div>
        <div className="footer-section">
          <h4>{siteContent.contactTitle}</h4>
          {siteContent.email && <p>{siteContent.footerEmailPrefix}: <a href={`mailto:${siteContent.email}`}>{siteContent.email}</a></p>}
          {siteContent.phone && <p>{siteContent.footerPhonePrefix}: <a href={`tel:${phoneLink}`}>{siteContent.phone}</a></p>}
          <div className="footer-support-links">
            <Link to="/contact">{siteContent.footerContactSupportText}</Link>
            {phoneDigits.length >= 7 && <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer">{siteContent.footerWhatsAppSupportText}</a>}
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <p>&copy; {siteContent.copyrightYear || new Date().getFullYear()} {siteContent.footerBrandTitle}. {siteContent.copyrightText}</p>
          <button type="button" className="footer-terms-link" onClick={() => setTermsOpen(true)}>{siteContent.footerTermsButtonText}</button>
        </div>
      </div>
      {termsOpen && (
        <div className="terms-modal-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget) setTermsOpen(false)
        }}>
          <section className="terms-modal" role="dialog" aria-modal="true" aria-labelledby="terms-modal-title">
            <button type="button" className="terms-modal-close" aria-label="Close terms and conditions" onClick={() => setTermsOpen(false)}>×</button>
            <h2 id="terms-modal-title">{siteContent.footerTermsTitle}</h2>
            <div className="terms-modal-content">{siteContent.termsAndConditions || siteContent.footerTermsUnavailableText}</div>
            <button type="button" className="terms-modal-done" onClick={() => setTermsOpen(false)}>{siteContent.footerTermsCloseText}</button>
          </section>
        </div>
      )}
    </footer>
  )
}

export default Footer
