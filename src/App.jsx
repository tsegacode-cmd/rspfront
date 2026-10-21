import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import { LanguageProvider } from './contexts/LanguageContext'
import Home from './pages/Home'
import DataCollect from './pages/DataCollector/DataCollect'
import DataRegistration from './pages/DataCollector/DataRegistration'
import RandomPiadRegister from './pages/DataCollector/RandomPiadRegister'
import RandomPayer from './pages/DataCollector/RandomPayer'
import Scanner from './pages/DataCollector/Scanner'
import Unpaid from './pages/DataCollector/Unpaid'
import Paid from './pages/DataCollector/Paid'
import PayRegistration from './pages/DataCollector/PayRegistration'
import NeedApproval from './pages/DataCollector/NeedApproval'
import Result from './pages/DataCollector/Result'
import Registered from './pages/DataCollector/Registered'
import PaidRandomDataForm from './pages/DataCollector/PaidRandomDataForm'
import FixedCommission from './pages/FixedCommission'
import MovableCommission from './pages/MovableCommission'
import Brokerage from './pages/Brokerage'
import BrokerHouse from './pages/BrokerHouse'
import RoomBooking from './pages/RoomBooking'
import Logistics from './pages/Logistics'
import ServiceRequests from './pages/ServiceRequests'
import Contact from './pages/Contact'
import UserLogin from './pages/UserLogin'
import UserRegister from './pages/UserRegister'
import UtilityPayment from './pages/UtilityPayment'
import Feed from './pages/Feed'
import Wallet from './pages/Wallet'
import AgentPortal from './pages/AgentPortal'
import MiniRidePage from './pages/MiniRidePage'
import DriverPortal from './pages/DriverPortal'
import RootAgentManagement from './components/RootAgentManagement'
import RootPortal from './pages/root/redsea/wt/RootPortal'
import RootDashboard from './pages/root/redsea/wt/RootDashboard'
import Debug from './pages/Debug'
import LiveChatButton from './components/LiveChatButton'
import CoinGiftCelebration from './components/CoinGiftCelebration'
import CoinLevelCelebration from './components/CoinLevelCelebration'
import RewardCelebration from './components/RewardCelebration'
import PromotionPopup from './components/PromotionPopup'
import { siteContentAPI } from './services/api'
import { DEFAULT_SITE_CONTENT } from './contexts/SiteContentContext'
import logoImage from './logo/logo.png'
import './App.css'

function TelegramStartRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    webApp?.ready?.()
    webApp?.expand?.()
    const startParam = String(webApp?.initDataUnsafe?.start_param || '').toLowerCase()
    if (startParam === 'register') {
      navigate('/register', { replace: true })
    } else if (startParam === 'password_reset') {
      navigate('/login?reset=telegram', { replace: true })
    }
  }, [navigate])

  return null
}

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingScreenTitle, setLoadingScreenTitle] = useState(DEFAULT_SITE_CONTENT.loadingScreenTitle)

  useEffect(() => {
    const loadingTimer = window.setTimeout(() => setIsLoading(false), 2000)
    return () => window.clearTimeout(loadingTimer)
  }, [])

  useEffect(() => {
    let active = true
    siteContentAPI.get()
      .then(response => {
        if (active) {
          setLoadingScreenTitle(response.data?.loadingScreenTitle || DEFAULT_SITE_CONTENT.loadingScreenTitle)
        }
      })
      .catch(error => {
        console.error('Could not load loading screen settings:', error)
      })

    return () => { active = false }
  }, [])

  if (isLoading) {
    return (
      <main className="startup-screen" aria-label={`Loading ${loadingScreenTitle}`} aria-busy="true">
        <div className="startup-brand">
          <img className="startup-logo" src={logoImage} alt="" />
          <h1>{loadingScreenTitle}</h1>
          <p>Commission &amp; Brokerage Platform</p>
          <div className="startup-loader" role="status" aria-label="Loading">
            <span />
          </div>
        </div>
      </main>
    )
  }

  return (
    <LanguageProvider>
        <Router>
        <TelegramStartRedirect />
        <Routes>
        {/* Debug Route (No Protection) */}
        <Route path="/debug" element={<Debug />} />
        
        {/* Root Portal Routes (No Layout) */}
        <Route path="/root/portal" element={<RootPortal />} />
        <Route path="/root/dashboard" element={<RootDashboard />} />
        
        {/* User Auth Routes (No Layout) */}
        <Route path="/login" element={<UserLogin />} />
        <Route path="/register" element={<UserRegister />} />
        
        {/* Public pages are viewable without login; sensitive actions can require login on demand */}
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/agent" element={<AgentPortal />} />
              <Route path="/mini-ride" element={<MiniRidePage />} />
              <Route path="/driver" element={<DriverPortal />} />
              <Route path="/agent-management" element={<RootAgentManagement />} />
              <Route path="/data-collect" element={<DataCollect />} />
              <Route path="/data-registration" element={<DataRegistration />} />
              <Route path="/random-piad-register" element={<RandomPiadRegister />} />
              <Route path="/random-payer" element={<RandomPayer />} />
              <Route path="/scanner" element={<Scanner />} />
              <Route path="/unpaid" element={<Unpaid />} />
              <Route path="/paid" element={<Paid />} />
              <Route path="/pay-registration" element={<PayRegistration />} />
              <Route path="/need-approval" element={<NeedApproval />} />
              <Route path="/result" element={<Result />} />
              <Route path="/registered" element={<Registered />} />
              <Route path="/paid-random-data-form" element={<PaidRandomDataForm />} />
              <Route path="/fixed-commission" element={<FixedCommission />} />
              <Route path="/movable-commission" element={<MovableCommission />} />
              <Route path="/brokerage" element={<Brokerage />} />
              <Route path="/broker-house" element={<BrokerHouse />} />
              <Route path="/room-booking" element={<RoomBooking />} />
              <Route path="/logistics" element={<Logistics />} />
              <Route path="/service-requests" element={<ServiceRequests />} />
              <Route path="/utility-payment" element={<UtilityPayment />} />
              <Route path="/contact" element={<Contact />} />
            </Routes>
          </Layout>
        } />
        </Routes>
        <LiveChatButton />
        <CoinGiftCelebration />
        <CoinLevelCelebration />
        <RewardCelebration />
        <PromotionPopup />
        </Router>
    </LanguageProvider>
  )
}

export default App
