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
  ChevronRight
} from 'lucide-react'

const AppContent = () => {
  const { session, profile, isRecovering, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<'wallet' | 'payments' | 'activity' | 'staff'>('wallet')

  if (!session || isRecovering) return <AuthPage />
  if (!profile) return <div className="loading-spinner">Inicializando perfil...</div>

  // Redirect to onboarding if not verified (clients only)
  if (profile.role === 'client' && profile.onboarding_status !== 'verified') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-main)' }}>
        <header style={{ padding: '1.5rem 2.5rem', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <img src="/logo.png" alt="Guira" style={{ height: '40px' }} />
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
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-main)' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ padding: '0 1rem 2.5rem 1rem' }}>
          <img src="/logo.png" alt="Guira" style={{ height: '50px' }} />
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {profile.role === 'client' && (
            <>
              <button
                onClick={() => setActiveTab('wallet')}
                className={`nav-item ${activeTab === 'wallet' ? 'active' : ''}`}
              >
                <Wallet size={20} /> Mi Billetera
                {activeTab === 'wallet' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
              >
                <CreditCard size={20} /> Pagos
                {activeTab === 'payments' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`nav-item ${activeTab === 'activity' ? 'active' : ''}`}
              >
                <Activity size={20} /> Actividad
                {activeTab === 'activity' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
              </button>
            </>
          )}

          {(profile.role === 'staff' || profile.role === 'admin') && (
            <button
              onClick={() => setActiveTab('staff')}
              className={`nav-item ${activeTab === 'staff' ? 'active' : ''}`}
            >
              <ShieldCheck size={20} /> Administración
              {activeTab === 'staff' && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
            </button>
          )}
        </nav>

        <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</p>
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
          {activeTab === 'wallet' && <WalletDashboard />}
          {activeTab === 'payments' && <PaymentsPanel />}
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
