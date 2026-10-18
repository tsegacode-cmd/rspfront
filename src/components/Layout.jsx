import { Link } from 'react-router-dom'
import Header from './Header'
import SecondHeaderBar from './SecondHeaderBar'
import Footer from './Footer'
import { SiteContentProvider } from '../contexts/SiteContentContext'
import './Layout.css'

function Layout({ children }) {
  return (
    <SiteContentProvider>
      <div className="layout">
        <Header />
        <SecondHeaderBar />
        <main className="main-content">
          {children}
        </main>
        <Footer />
      </div>
    </SiteContentProvider>
  )
}

export default Layout
