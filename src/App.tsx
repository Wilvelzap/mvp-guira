import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthPage } from './pages/AuthPage'
import { OnboardingFlow } from './components/OnboardingFlow'
import { WalletDashboard } from './components/WalletDashboard'
import { PaymentsPanel } from './components/PaymentsPanel'
import { StaffPanel } from './components/StaffPanel'
import { ActivityLog } from './components/ActivityLog'
import {
  Wallet,
  CreditCard,
  Activity,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Menu,
  X
} from 'lucide-react'

const AppContent = () => {
  const { session, profile, isRecovering, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<'operations' | 'management' | 'activity' | 'staff'>('operations')
  const [paymentIntent, setPaymentIntent] = useState<any>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const handleNavigate = (tab: any, intent?: any) => {
    setActiveTab(tab)
    if (intent) setPaymentIntent(intent)
    setIsSidebarOpen(false) // Close sidebar on navigate
  }

  if (!session || isRecovering) return <AuthPage />
  if (!profile) return <div className="loading-spinner">Inicializando perfil...</div>

  // Redirect to onboarding if not verified (clients only)
  if (profile.role === 'client' && profile.onboarding_status !== 'verified') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-main)' }}>
        <header style={{
          padding: '1rem',
          background: '#fff',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <img src="/logo.png" alt="Guira" style={{ height: '32px' }} />
          <button onClick={() => signOut()} className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
            <LogOut size={16} /> Cerrar Sesión
          </button>
        </header>
        <main style={{ flex: 1, padding: '2.5rem', overflowY: 'auto' }}>
          <OnboardingFlow />
        </main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-main)', position: 'relative' }}>
      {/* Mobile Header */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '64px',
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1rem',
        zIndex: 900
      }} className="mobile-only">
        <img src="/logo.png" alt="Guira" style={{ height: '32px' }} />
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{ background: 'transparent', color: 'var(--primary)', padding: '0.5rem' }}
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 950,
            backdropFilter: 'blur(4px)'
          }}
          className="mobile-only"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div style={{ padding: '0 1rem 2.5rem 1rem' }}>
          <img src="/logo.png" alt="Guira" style={{ height: '50px' }} />
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {profile.role === 'client' && (
            <>
              <button
                onClick={() => handleNavigate('operations')}
                className={`nav-item ${activeTab === 'operations' ? 'active' : ''}`}
              >
                <Wallet size={20} /> Control Operativo
                {activeTab === 'operations' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
              </button>
              <button
                onClick={() => handleNavigate('management', null)}
                className={`nav-item ${activeTab === 'management' ? 'active' : ''}`}
              >
                <CreditCard size={20} /> Gestiones
                {activeTab === 'management' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
              </button>
              <button
                onClick={() => handleNavigate('activity')}
                className={`nav-item ${activeTab === 'activity' ? 'active' : ''}`}
              >
                <Activity size={20} /> Actividad
                {activeTab === 'activity' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
              </button>
            </>
          )}

          {(profile.role === 'staff' || profile.role === 'admin') && (
            <button
              onClick={() => handleNavigate('staff')}
              className={`nav-item ${activeTab === 'staff' ? 'active' : ''}`}
            >
              <ShieldCheck size={20} /> Administración
              {activeTab === 'staff' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
            </button>
          )}
        </nav>

        <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.2rem' }}>{profile.full_name || profile.email.split('@')[0]}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.2rem' }}>{profile.email}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {profile.role === 'admin' ? 'Administrador' : profile.role === 'staff' ? 'Staff' : 'Cliente'}
            </p>
          </div>
          <button onClick={() => signOut()} className="btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <LogOut size={16} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {activeTab === 'operations' && <WalletDashboard onNavigate={handleNavigate} />}
          {activeTab === 'management' && <PaymentsPanel initialRoute={paymentIntent} onRouteClear={() => setPaymentIntent(null)} />}
          {activeTab === 'activity' && <ActivityLog />}
          {activeTab === 'staff' && <StaffPanel />}
        </div>
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
