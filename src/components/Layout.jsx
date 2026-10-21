import { useLocation } from 'react-router-dom'
import Header from './Header'
import SecondHeaderBar from './SecondHeaderBar'
import Footer from './Footer'
import { SiteContentProvider, useSiteContent } from '../contexts/SiteContentContext'
import { getAccountAccessRole } from '../utils/guestAccount'
import { isSiteMenuHidden, SITE_HEADER_MENUS } from '../utils/siteMenuVisibility'
import './Layout.css'

function SitePageContent({ children }) {
  const location = useLocation()
  const siteContent = useSiteContent()
  const role = getAccountAccessRole()
  const page = SITE_HEADER_MENUS.find(item => item.route === location.pathname)
  const hidden = !localStorage.getItem('rootToken') && page &&
    isSiteMenuHidden(siteContent.accountAccessSettings, role, page.id, page.route)

  if (hidden) {
    return (
      <main className="main-content">
        <div className="site-page-unavailable" role="status">This page is not available for your account.</div>
      </main>
    )
  }

  return <main className="main-content">{children}</main>
}

function Layout({ children }) {
  return (
    <SiteContentProvider>
      <div className="layout">
        <Header />
        <SecondHeaderBar />
        <SitePageContent>{children}</SitePageContent>
        <Footer />
      </div>
    </SiteContentProvider>
  )
}

export default Layout
